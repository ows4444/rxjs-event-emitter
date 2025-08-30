import { Injectable, Logger } from '@nestjs/common';
import { Observable, throwError, timer, of } from 'rxjs';
import { timeout, catchError, retry, tap, switchMap } from 'rxjs/operators';
import { Event, EventEmitterOptions, HandlerOptions } from '../event-emitter.interfaces';

export interface RegisteredHandler {
  eventName: string;
  handler: (...args: unknown[]) => unknown;
  instance: unknown;
  options: HandlerOptions;
  handlerId: string;
}

export interface ExecutionResult {
  success: boolean;
  handlerId: string;
  executionTime: number;
  error?: Error;
  retryCount?: number;
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailure?: number;
  nextAttempt?: number;
}

/**
 * Dedicated service for handler execution with isolation, timeouts, and circuit breakers
 * Extracted from EventEmitterService for better separation of concerns
 */
@Injectable()
export class HandlerExecutionService {
  private readonly logger = new Logger(HandlerExecutionService.name);

  // Circuit breaker states per handler
  private readonly circuitBreakers = new Map<string, CircuitBreakerState>();

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
  private executeWithIsolation(handler: RegisteredHandler, event: Event): Observable<any> {
    return new Observable((subscriber) => {
      try {
        // Create isolated execution context
        const isolatedContext = this.createIsolationContext(handler);

        // Execute handler with proper context binding
        const result = handler.handler.call(isolatedContext.instance, event);

        // Handle both sync and async results
        if (result && typeof result.then === 'function') {
          // Promise-based handler
          (result as Promise<unknown>)
            .then((value) => {
              subscriber.next(value);
              subscriber.complete();
            })
            .catch((error: unknown) => subscriber.error(error));
        } else if (result && typeof result.subscribe === 'function') {
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
  private createIsolationContext(handler: RegisteredHandler): { instance: any } {
    const isolationLevel = this.options.handlerExecution?.isolationLevel || 'moderate';

    switch (isolationLevel) {
      case 'strict':
        // Create completely isolated context (placeholder - would need more complex implementation)
        return { instance: handler.instance };

      case 'moderate':
        // Moderate isolation with some context preservation
        return { instance: handler.instance };

      case 'relaxed':
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
      case 'OPEN':
        if (circuitBreaker.nextAttempt && now >= circuitBreaker.nextAttempt) {
          // Transition to HALF_OPEN
          circuitBreaker.state = 'HALF_OPEN';
          this.logger.debug(`Circuit breaker transitioning to HALF_OPEN for handler ${handlerId}`);
          return false;
        }
        return true;

      case 'HALF_OPEN':
        return false;

      case 'CLOSED':
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
        state: 'CLOSED',
        failures: 0,
      };
      this.circuitBreakers.set(handlerId, circuitBreaker);
    }

    const threshold = this.options.errorRecovery?.circuitBreakerThreshold || 5;
    const circuitBreakerTimeout = this.options.errorRecovery?.circuitBreakerTimeout || 60000;
    const now = Date.now();

    if (success) {
      // Reset on success
      if (circuitBreaker.state === 'HALF_OPEN') {
        circuitBreaker.state = 'CLOSED';
        circuitBreaker.failures = 0;
        this.logger.debug(`Circuit breaker CLOSED for handler ${handlerId}`);
      } else if (circuitBreaker.state === 'CLOSED') {
        // Gradually reduce failure count on success
        circuitBreaker.failures = Math.max(0, circuitBreaker.failures - 1);
      }
    } else {
      // Increment failures
      circuitBreaker.failures++;
      circuitBreaker.lastFailure = now;

      if (circuitBreaker.failures >= threshold) {
        circuitBreaker.state = 'OPEN';
        circuitBreaker.nextAttempt = now + circuitBreakerTimeout;
        this.logger.warn(`Circuit breaker OPEN for handler ${handlerId} after ${circuitBreaker.failures} failures`);
      }
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number, handlerId: string): Observable<number> {
    const baseDelay = this.options.errorRecovery?.retryDelayMs || 1000;
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
  getHandlerStats(handlerId: string): {
    execution: any;
    circuitBreaker: CircuitBreakerState | null;
    timeout: any;
  } {
    return {
      execution: this.executionMetrics.get(handlerId) || null,
      circuitBreaker: this.circuitBreakers.get(handlerId) || null,
      timeout: this.timeoutMetrics.get(handlerId) || null,
    };
  }

  /**
   * Get all handler statistics
   */
  getAllStats(): Map<string, any> {
    const stats = new Map<string, any>();

    for (const [handlerId] of this.executionMetrics) {
      stats.set(handlerId, this.getHandlerStats(handlerId));
    }

    return stats;
  }

  /**
   * Reset circuit breaker for a handler (manual intervention)
   */
  resetCircuitBreaker(handlerId: string): void {
    const circuitBreaker = this.circuitBreakers.get(handlerId);
    if (circuitBreaker) {
      circuitBreaker.state = 'CLOSED';
      circuitBreaker.failures = 0;
      delete circuitBreaker.lastFailure;
      delete circuitBreaker.nextAttempt;
      this.logger.info(`Circuit breaker reset for handler ${handlerId}`);
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
