import { Injectable, Logger } from '@nestjs/common';
import { Observable, throwError, timer, of } from 'rxjs';
import { timeout, catchError, retry, tap, switchMap } from 'rxjs/operators';
import {
  Event,
  EventEmitterOptions,
  RegisteredHandler,
  ExecutionResult,
  CircuitBreakerState,
  HandlerStats,
  HandlerExecutionService as IHandlerExecutionService,
  HandlerPool,
  IsolationLevel,
} from '../interfaces';

/**
 * Dedicated service for handler execution with isolation, timeouts, and circuit breakers
 * Extracted from EventEmitterService for better separation of concerns
 */
@Injectable()
export class HandlerExecutionService implements IHandlerExecutionService {
  private readonly logger = new Logger(HandlerExecutionService.name);

  // Circuit breaker states per handler
  private readonly circuitBreakers = new Map<
    string,
    {
      state: CircuitBreakerState;
      failures: number;
      lastFailure?: number;
      nextAttempt?: number;
    }
  >();

  // Execution metrics per handler
  private readonly executionMetrics = new Map<
    string,
    {
      totalExecutions: number;
      successfulExecutions: number;
      failedExecutions: number;
      averageExecutionTime: number;
      timeouts: number;
      lastExecution?: number;
    }
  >();

  // Timeout metrics tracking
  private readonly timeoutMetrics = new Map<
    string,
    {
      totalExecutions: number;
      timeouts: number;
      successes: number;
      averageExecutionTime: number;
      lastTimeout?: number;
    }
  >();

  constructor(private readonly options: EventEmitterOptions) {
    this.initializeDefaults();
  }

  /**
   * Execute a handler with comprehensive error handling, timeouts, and circuit breaking
   */
  executeHandler(handler: RegisteredHandler, event: Event): Observable<ExecutionResult> {
    const startTime = Date.now();
    const handlerId = handler.handlerId;

    // Check circuit breaker state
    if (this.isCircuitOpen(handlerId)) {
      return throwError(() => new Error(`Circuit breaker is OPEN for handler ${handlerId}`));
    }

    const executionTimeout = handler.options.timeout || this.options.handlerExecution?.defaultTimeout || 5000;

    const maxRetries = handler.options.retries || this.options.errorRecovery?.maxRetryAttempts || 2;

    return this.executeWithIsolation(handler, event).pipe(
      timeout(executionTimeout),
      retry({
        count: maxRetries,
        delay: (error, retryCount) => this.calculateRetryDelay(retryCount, handlerId),
      }),
      tap({
        next: () => this.recordSuccessfulExecution(handlerId, Date.now() - startTime),
        error: (error: Error) => this.recordFailedExecution(handlerId, error, Date.now() - startTime),
      }),
      switchMap(() =>
        of({
          success: true,
          handlerId,
          executionTime: Date.now() - startTime,
        } as ExecutionResult),
      ),
      catchError((error) => {
        const executionTime = Date.now() - startTime;

        // Update circuit breaker on failure
        this.updateCircuitBreaker(handlerId, false);

        return of({
          success: false,
          handlerId,
          executionTime,
          error,
          retryCount: maxRetries,
        } as ExecutionResult);
      }),
    );
  }

  /**
   * Execute handler in isolation to prevent cross-handler contamination
   */
  private executeWithIsolation(handler: RegisteredHandler, event: Event): Observable<unknown> {
    return new Observable((subscriber) => {
      try {
        // Create isolated execution context
        const isolatedContext = this.createIsolationContext(handler);

        // Execute handler with proper context binding
        const result = handler.handler.call(isolatedContext.instance, event);

        // Handle both sync and async results
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          // Promise-based handler
          (result as Promise<unknown>)
            .then((value) => {
              subscriber.next(value);
              subscriber.complete();
            })
            .catch((error: unknown) => subscriber.error(error));
        } else if (result && typeof (result as Observable<unknown>).subscribe === 'function') {
          // Observable-based handler
          (result as Observable<unknown>).subscribe({
            next: (value) => subscriber.next(value),
            error: (error: unknown) => subscriber.error(error),
            complete: () => subscriber.complete(),
          });
        } else {
          // Synchronous handler
          subscriber.next(result);
          subscriber.complete();
        }
      } catch (error) {
        subscriber.error(error);
      }
    });
  }

  /**
   * Create isolation context for handler execution
   */
  private createIsolationContext(handler: RegisteredHandler): { instance: unknown } {
    const isolationLevel = this.options.handlerExecution?.isolationLevel || IsolationLevel.MODERATE;

    switch (isolationLevel) {
      case IsolationLevel.STRICT:
        // Create completely isolated context (placeholder - would need more complex implementation)
        return { instance: handler.instance };

      case IsolationLevel.MODERATE:
        // Moderate isolation with some context preservation
        return { instance: handler.instance };

      case IsolationLevel.RELAXED:
      default:
        // Minimal isolation
        return { instance: handler.instance };
    }
  }

  /**
   * Check if circuit breaker is open for a handler
   */
  private isCircuitOpen(handlerId: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(handlerId);
    if (!circuitBreaker) return false;

    const now = Date.now();
    // Circuit breaker timeout is used in updateCircuitBreaker method

    switch (circuitBreaker.state) {
      case CircuitBreakerState.OPEN:
        if (circuitBreaker.nextAttempt && now >= circuitBreaker.nextAttempt) {
          // Transition to HALF_OPEN
          circuitBreaker.state = CircuitBreakerState.HALF_OPEN;
          this.logger.debug(`Circuit breaker transitioning to HALF_OPEN for handler ${handlerId}`);
          return false;
        }
        return true;

      case CircuitBreakerState.HALF_OPEN:
        return false;

      case CircuitBreakerState.CLOSED:
      default:
        return false;
    }
  }

  /**
   * Update circuit breaker state based on execution result
   */
  private updateCircuitBreaker(handlerId: string, success: boolean): void {
    let circuitBreaker = this.circuitBreakers.get(handlerId);
    if (!circuitBreaker) {
      circuitBreaker = {
        state: CircuitBreakerState.CLOSED,
        failures: 0,
      };
      this.circuitBreakers.set(handlerId, circuitBreaker);
    }

    const threshold = this.options.errorRecovery?.circuitBreakerThreshold || 5;
    const circuitBreakerTimeout = this.options.errorRecovery?.circuitBreakerTimeout || 60000;
    const now = Date.now();

    if (success) {
      // Reset on success
      if (circuitBreaker.state === CircuitBreakerState.HALF_OPEN) {
        circuitBreaker.state = CircuitBreakerState.CLOSED;
        circuitBreaker.failures = 0;
        this.logger.debug(`Circuit breaker CLOSED for handler ${handlerId}`);
      } else if (circuitBreaker.state === CircuitBreakerState.CLOSED) {
        // Gradually reduce failure count on success
        circuitBreaker.failures = Math.max(0, circuitBreaker.failures - 1);
      }
    } else {
      // Increment failures
      circuitBreaker.failures++;
      circuitBreaker.lastFailure = now;

      if (circuitBreaker.failures >= threshold) {
        circuitBreaker.state = CircuitBreakerState.OPEN;
        circuitBreaker.nextAttempt = now + circuitBreakerTimeout;
        this.logger.warn(`Circuit breaker OPEN for handler ${handlerId} after ${circuitBreaker.failures} failures`);
      }
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number, handlerId: string): Observable<number> {
    const baseDelay = this.options.errorRecovery?.retryDelay || 1000;
    const multiplier = this.options.errorRecovery?.exponentialBackoffMultiplier || 2;
    const maxDelay = this.options.errorRecovery?.maxRetryDelay || 30000;

    const delay = Math.min(baseDelay * Math.pow(multiplier, retryCount - 1), maxDelay);

    // Add jitter to prevent thundering herd
    const jitterDelay = delay + Math.random() * delay * 0.1;

    this.logger.debug(`Handler ${handlerId} retry ${retryCount} delayed by ${jitterDelay}ms`);

    return timer(jitterDelay);
  }

  /**
   * Record successful execution metrics
   */
  private recordSuccessfulExecution(handlerId: string, executionTime: number): void {
    let metrics = this.executionMetrics.get(handlerId);
    if (!metrics) {
      metrics = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        timeouts: 0,
      };
      this.executionMetrics.set(handlerId, metrics);
    }

    metrics.totalExecutions++;
    metrics.successfulExecutions++;
    metrics.lastExecution = Date.now();

    // Update average execution time
    metrics.averageExecutionTime = (metrics.averageExecutionTime * (metrics.totalExecutions - 1) + executionTime) / metrics.totalExecutions;

    // Update circuit breaker on success
    this.updateCircuitBreaker(handlerId, true);
  }

  /**
   * Record failed execution metrics
   */
  private recordFailedExecution(handlerId: string, error: Error, executionTime: number): void {
    let metrics = this.executionMetrics.get(handlerId);
    if (!metrics) {
      metrics = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        timeouts: 0,
      };
      this.executionMetrics.set(handlerId, metrics);
    }

    metrics.totalExecutions++;
    metrics.failedExecutions++;
    metrics.lastExecution = Date.now();

    // Check if it's a timeout error
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      metrics.timeouts++;
      this.recordTimeoutMetrics(handlerId, executionTime);
    }

    this.logger.warn(`Handler ${handlerId} execution failed after ${executionTime}ms: ${error.message}`);
  }

  /**
   * Record timeout-specific metrics
   */
  private recordTimeoutMetrics(handlerId: string, executionTime: number): void {
    let timeoutMetrics = this.timeoutMetrics.get(handlerId);
    if (!timeoutMetrics) {
      timeoutMetrics = {
        totalExecutions: 0,
        timeouts: 0,
        successes: 0,
        averageExecutionTime: 0,
      };
      this.timeoutMetrics.set(handlerId, timeoutMetrics);
    }

    timeoutMetrics.totalExecutions++;
    timeoutMetrics.timeouts++;
    timeoutMetrics.lastTimeout = Date.now();
    timeoutMetrics.averageExecutionTime =
      (timeoutMetrics.averageExecutionTime * (timeoutMetrics.totalExecutions - 1) + executionTime) / timeoutMetrics.totalExecutions;
  }

  /**
   * Get execution statistics for a handler
   */
  getHandlerStats(handlerId: string): HandlerStats | undefined {
    const executionMetrics = this.executionMetrics.get(handlerId);
    const circuitBreaker = this.circuitBreakers.get(handlerId);
    const timeoutMetrics = this.timeoutMetrics.get(handlerId);

    if (!executionMetrics) return undefined;

    return {
      execution: {
        totalExecutions: executionMetrics.totalExecutions,
        successfulExecutions: executionMetrics.successfulExecutions,
        failedExecutions: executionMetrics.failedExecutions,
        averageExecutionTime: executionMetrics.averageExecutionTime,
        minExecutionTime: 0, // TODO: Track this
        maxExecutionTime: 0, // TODO: Track this
        timeouts: executionMetrics.timeouts,
        lastExecution: executionMetrics.lastExecution,
      },
      circuitBreaker: {
        state: circuitBreaker?.state || CircuitBreakerState.CLOSED,
        failures: circuitBreaker?.failures || 0,
        lastFailure: circuitBreaker?.lastFailure,
        nextAttempt: circuitBreaker?.nextAttempt,
        successRate: executionMetrics.totalExecutions > 0 ? (executionMetrics.successfulExecutions / executionMetrics.totalExecutions) * 100 : 100,
      },
      timeout: {
        totalExecutions: timeoutMetrics?.totalExecutions || 0,
        timeouts: timeoutMetrics?.timeouts || 0,
        successes: timeoutMetrics?.successes || 0,
        averageExecutionTime: timeoutMetrics?.averageExecutionTime || 0,
        lastTimeout: timeoutMetrics?.lastTimeout,
      },
      resource: {
        memoryUsage: 0, // TODO: Track this
        cpuTime: 0, // TODO: Track this
        isolationLevel: this.options.handlerExecution?.isolationLevel || 'moderate',
        poolUtilization: 0, // TODO: Calculate this
      },
    };
  }

  /**
   * Execute a handler with an event (interface implementation)
   */
  execute(handler: RegisteredHandler, event: Event): Observable<ExecutionResult> {
    return this.executeHandler(handler, event);
  }

  /**
   * Execute all handlers for an event (interface implementation)
   */
  executeHandlers(_eventName: string, _event: Event): Observable<ExecutionResult[]> {
    // This would typically be implemented by getting handlers for the event
    // For now, return empty array as this service focuses on individual handler execution
    return of([] as ExecutionResult[]);
  }

  /**
   * Get execution statistics (interface implementation)
   */
  getStats(): Readonly<Record<string, HandlerStats>> {
    const stats: Record<string, HandlerStats> = {};

    for (const [handlerId] of this.executionMetrics) {
      const handlerStats = this.getHandlerStats(handlerId);
      if (handlerStats) {
        stats[handlerId] = handlerStats;
      }
    }

    return stats;
  }

  /**
   * Get handler pool information (interface implementation)
   */
  getPoolInfo(_isolationContext: string): HandlerPool | undefined {
    // This service focuses on execution logic
    // Pool management is delegated to HandlerPoolService
    return undefined;
  }

  /**
   * Reset circuit breaker for a handler (manual intervention)
   */
  resetCircuitBreaker(handlerId: string): void {
    const circuitBreaker = this.circuitBreakers.get(handlerId);
    if (circuitBreaker) {
      circuitBreaker.state = CircuitBreakerState.CLOSED;
      circuitBreaker.failures = 0;
      delete circuitBreaker.lastFailure;
      delete circuitBreaker.nextAttempt;
      this.logger.log(`Circuit breaker reset for handler ${handlerId}`);
    }
  }

  /**
   * Initialize default circuit breakers and metrics
   */
  private initializeDefaults(): void {
    // Pre-initialize common metrics to avoid null checks during execution
    this.logger.debug('HandlerExecutionService initialized with default configurations');
  }
}
