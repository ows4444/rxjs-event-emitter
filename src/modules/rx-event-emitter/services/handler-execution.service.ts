/**
 * Handler Execution Service - Advanced handler execution with error recovery and timeout management
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, Optional } from '@nestjs/common';
import { BehaviorSubject, Observable, Subject, from, timer, race, throwError } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import {
  Event,
  RegisteredHandler,
  HandlerExecutionContext,
  ExecutionResult,
  HandlerOptions,
  CircuitBreakerState,
  CircuitBreakerMetrics,
  EVENT_EMITTER_OPTIONS,
} from '../interfaces';
import { HandlerPoolService } from './handler-pool.service';
import { MetricsService } from './metrics.service';
import { DeadLetterQueueService } from './dead-letter-queue.service';

/**
 * Handler execution statistics
 */
export interface HandlerExecutionStats {
  readonly handlerId: string;
  readonly totalExecutions: number;
  readonly successfulExecutions: number;
  readonly failedExecutions: number;
  readonly averageExecutionTime: number;
  readonly minExecutionTime: number;
  readonly maxExecutionTime: number;
  readonly lastExecutionAt?: number;
  readonly lastSuccessAt?: number;
  readonly lastFailureAt?: number;
  readonly consecutiveFailures: number;
  readonly consecutiveSuccesses: number;
  readonly errorDistribution: Record<string, number>;
  readonly circuitBreakerState: CircuitBreakerState;
}

/**
 * Execution configuration
 */
export interface ExecutionConfig {
  readonly enabled: boolean;
  readonly defaultTimeout: number;
  readonly maxRetries: number;
  readonly retryDelay: number;
  readonly circuitBreaker: {
    readonly enabled: boolean;
    readonly failureThreshold: number;
    readonly recoveryTimeout: number;
    readonly minimumThroughput: number;
  };
  readonly bulkhead: {
    readonly enabled: boolean;
    readonly maxConcurrency: number;
    readonly queueSize: number;
  };
  readonly rateLimit: {
    readonly enabled: boolean;
    readonly maxPerSecond: number;
    readonly burstSize: number;
  };
}

/**
 * Execution context with enhanced tracking
 */
export interface EnhancedExecutionContext extends HandlerExecutionContext {
  readonly executionId: string;
  readonly retryAttempt: number;
  readonly executionTimeout: number;
  readonly poolName: string;
  readonly priority: number;
  readonly tags: string[];
  readonly parentContext?: string;
  readonly traceId: string;
  readonly spanId: string;
}

/**
 * Execution result with detailed information
 */
export interface DetailedExecutionResult extends ExecutionResult {
  readonly executionId: string;
  readonly handlerId: string;
  readonly context: EnhancedExecutionContext;
  readonly metrics: {
    readonly queueTime: number;
    readonly executionTime: number;
    readonly totalTime: number;
    readonly memoryUsed?: number;
    readonly cpuTime?: number;
  };
  readonly retry?: {
    readonly attempt: number;
    readonly reason: string;
    readonly nextRetryAt?: number;
  };
}

@Injectable()
export class HandlerExecutionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HandlerExecutionService.name);

  private readonly shutdown$ = new Subject<void>();
  private readonly executionStats = new Map<string, HandlerExecutionStats>();
  private readonly activeExecutions = new Map<string, EnhancedExecutionContext>();
  private readonly circuitBreakers = new Map<string, CircuitBreakerMetrics>();
  private readonly rateLimiters = new Map<string, { tokens: number; lastRefill: number }>();

  private readonly executionResults$ = new Subject<DetailedExecutionResult>();
  private readonly stats$ = new BehaviorSubject<Record<string, HandlerExecutionStats>>({});

  private readonly config: Required<ExecutionConfig>;

  constructor(
    @Optional() private readonly handlerPoolService?: HandlerPoolService,
    @Optional() private readonly metricsService?: MetricsService,
    @Optional() private readonly dlqService?: DeadLetterQueueService,
    @Optional() @Inject(EVENT_EMITTER_OPTIONS) private readonly options: any = {},
  ) {
    this.config = {
      enabled: true,
      defaultTimeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 10,
        recoveryTimeout: 30000,
        minimumThroughput: 5,
      },
      bulkhead: {
        enabled: true,
        maxConcurrency: 10,
        queueSize: 100,
      },
      rateLimit: {
        enabled: false,
        maxPerSecond: 100,
        burstSize: 10,
      },
      ...this.options?.handlerExecution,
    };
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.log('Handler execution service is disabled');
      return;
    }

    this.logger.log('Initializing Handler Execution Service...');

    this.setupExecutionMonitoring();
    this.startPeriodicCleanup();

    this.logger.log('Handler Execution Service initialized successfully');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down Handler Execution Service...');

    this.shutdown$.next();
    this.shutdown$.complete();

    // Wait for active executions to complete or timeout
    const activeCount = this.activeExecutions.size;
    if (activeCount > 0) {
      this.logger.warn(`${activeCount} executions still active during shutdown`);
      // Give them 5 seconds to complete
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    this.logger.log('Handler Execution Service shutdown completed');
  }

  /**
   * Execute a handler with full error recovery and monitoring
   */
  async executeHandler(handler: RegisteredHandler, event: Event, options: Partial<HandlerOptions> = {}): Promise<DetailedExecutionResult> {
    const handlerId = this.generateHandlerId(handler);
    const executionId = uuidv4();

    // Check circuit breaker
    if (this.isCircuitOpen(handlerId)) {
      throw new Error(`Circuit breaker is open for handler ${handlerId}`);
    }

    // Check rate limiting
    if (this.config.rateLimit.enabled && !this.checkRateLimit(handlerId)) {
      throw new Error(`Rate limit exceeded for handler ${handlerId}`);
    }

    const context = this.createExecutionContext(handler, event, executionId, options);
    const startTime = Date.now();

    try {
      this.activeExecutions.set(executionId, context);

      // Execute with proper pool isolation
      const result = await this.executeWithRetryAndTimeout(handler, event, context);

      const executionResult = this.createDetailedResult(result, executionId, handlerId, context, startTime);

      this.handleExecutionSuccess(handlerId, executionResult);
      return executionResult;
    } catch (error) {
      const executionResult = this.createErrorResult(error as Error, executionId, handlerId, context, startTime);

      await this.handleExecutionFailure(handlerId, event, error as Error, executionResult);
      throw error;
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Get execution statistics for a handler
   */
  getHandlerStats(handlerId: string): HandlerExecutionStats | undefined {
    return this.executionStats.get(handlerId);
  }

  /**
   * Get all execution statistics
   */
  getAllStats(): Record<string, HandlerExecutionStats> {
    return this.stats$.value;
  }

  /**
   * Get execution statistics observable
   */
  getStatsObservable(): Observable<Record<string, HandlerExecutionStats>> {
    return this.stats$.asObservable();
  }

  /**
   * Get execution results stream
   */
  getExecutionResults(): Observable<DetailedExecutionResult> {
    return this.executionResults$.asObservable();
  }

  /**
   * Reset statistics for a handler
   */
  resetHandlerStats(handlerId: string): void {
    this.executionStats.delete(handlerId);
    this.circuitBreakers.delete(handlerId);
    this.updateStatsObservable();
  }

  /**
   * Reset all statistics
   */
  resetAllStats(): void {
    this.executionStats.clear();
    this.circuitBreakers.clear();
    this.rateLimiters.clear();
    this.updateStatsObservable();
    this.logger.log('All handler execution statistics reset');
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): EnhancedExecutionContext[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Cancel an execution
   */
  cancelExecution(executionId: string): boolean {
    const context = this.activeExecutions.get(executionId);
    if (context) {
      this.activeExecutions.delete(executionId);
      this.logger.debug(`Cancelled execution ${executionId}`);
      return true;
    }
    return false;
  }

  // Private methods

  private async executeWithRetryAndTimeout(handler: RegisteredHandler, event: Event, context: EnhancedExecutionContext): Promise<ExecutionResult> {
    const executeOnce = async (): Promise<ExecutionResult> => {
      const startTime = Date.now();

      try {
        let result: unknown;

        if (this.handlerPoolService) {
          // Execute in isolated pool
          result = await this.handlerPoolService.executeInPool(context.poolName, async () => await handler.handler(event));
        } else {
          // Direct execution
          result = await handler.handler(event);
        }

        const duration = Date.now() - startTime;

        return {
          success: true,
          duration,
          result,
          needsRetry: false,
        };
      } catch (error) {
        const duration = Date.now() - startTime;

        return {
          success: false,
          duration,
          error: error as Error,
          needsRetry: this.shouldRetry(error as Error, context.retryAttempt),
        };
      }
    };

    return race(from(executeOnce()), timer(context.executionTimeout).pipe(switchMap(() => throwError(new Error('Handler execution timeout')))))
      .pipe(takeUntil(this.shutdown$))
      .toPromise() as Promise<ExecutionResult>;
  }

  private createExecutionContext(handler: RegisteredHandler, event: Event, executionId: string, options: Partial<HandlerOptions>): EnhancedExecutionContext {
    const handlerId = this.generateHandlerId(handler);
    const timeout = options.timeout || handler.metadata.options.timeout || this.config.defaultTimeout;
    const poolName = options.pool || handler.metadata.options.pool || 'default';
    const priority = options.priority || handler.metadata.options.priority || 5;

    return {
      executionId,
      event,
      handler,
      poolName,
      correlationId: event.metadata.correlationId || uuidv4(),
      startedAt: Date.now(),
      timeoutAt: Date.now() + timeout,
      attempt: 1,
      retryAttempt: 0,
      executionTimeout: timeout,
      priority,
      tags: [],
      traceId: uuidv4(),
      spanId: uuidv4(),
      metadata: {
        handlerId,
        eventName: event.metadata.name,
        options,
      },
    };
  }

  private createDetailedResult(
    result: ExecutionResult,
    executionId: string,
    handlerId: string,
    context: EnhancedExecutionContext,
    startTime: number,
  ): DetailedExecutionResult {
    const totalTime = Date.now() - startTime;

    return {
      ...result,
      executionId,
      handlerId,
      context,
      metrics: {
        queueTime: context.startedAt - startTime,
        executionTime: result.duration,
        totalTime,
        memoryUsed: result.memoryUsed,
        cpuTime: result.cpuTimeUsed,
      },
    };
  }

  private createErrorResult(
    error: Error,
    executionId: string,
    handlerId: string,
    context: EnhancedExecutionContext,
    startTime: number,
  ): DetailedExecutionResult {
    const totalTime = Date.now() - startTime;

    return {
      success: false,
      duration: totalTime,
      error,
      needsRetry: this.shouldRetry(error, context.retryAttempt),
      executionId,
      handlerId,
      context,
      metrics: {
        queueTime: context.startedAt - startTime,
        executionTime: totalTime,
        totalTime,
      },
    };
  }

  private handleExecutionSuccess(handlerId: string, result: DetailedExecutionResult): void {
    this.updateExecutionStats(handlerId, true, result.duration);
    this.updateCircuitBreaker(handlerId, true);

    if (this.metricsService) {
      this.metricsService.recordHandlerExecution(handlerId, result.duration, true);
    }

    this.executionResults$.next(result);
  }

  private async handleExecutionFailure(handlerId: string, event: Event, error: Error, result: DetailedExecutionResult): Promise<void> {
    this.updateExecutionStats(handlerId, false, result.duration, error);
    this.updateCircuitBreaker(handlerId, false);

    if (this.metricsService) {
      this.metricsService.recordHandlerExecution(handlerId, result.duration, false);
    }

    // Send to dead letter queue if configured
    //     if (this.dlqService && !result.needsRetry) {
    //       await this.dlqService.addEntry(event, error);
    //     }
    //
    //     this.executionResults$.next(result);
  }

  private updateExecutionStats(handlerId: string, success: boolean, duration: number, error?: Error): void {
    let stats = this.executionStats.get(handlerId);

    if (!stats) {
      stats = {
        handlerId,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        minExecutionTime: Number.MAX_SAFE_INTEGER,
        maxExecutionTime: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        errorDistribution: {},
        circuitBreakerState: CircuitBreakerState.CLOSED,
      };
    }

    const newStats: HandlerExecutionStats = {
      ...stats,
      totalExecutions: stats.totalExecutions + 1,
      successfulExecutions: success ? stats.successfulExecutions + 1 : stats.successfulExecutions,
      failedExecutions: success ? stats.failedExecutions : stats.failedExecutions + 1,
      averageExecutionTime: (stats.averageExecutionTime * stats.totalExecutions + duration) / (stats.totalExecutions + 1),
      minExecutionTime: Math.min(stats.minExecutionTime, duration),
      maxExecutionTime: Math.max(stats.maxExecutionTime, duration),
      lastExecutionAt: Date.now(),
      lastSuccessAt: success ? Date.now() : stats.lastSuccessAt,
      lastFailureAt: success ? stats.lastFailureAt : Date.now(),
      consecutiveFailures: success ? 0 : stats.consecutiveFailures + 1,
      consecutiveSuccesses: success ? stats.consecutiveSuccesses + 1 : 0,
    };

    if (error && !success) {
      const errorType = error.constructor.name;
      newStats.errorDistribution = {
        ...stats.errorDistribution,
        [errorType]: (stats.errorDistribution[errorType] || 0) + 1,
      };
    }

    this.executionStats.set(handlerId, newStats);
    this.updateStatsObservable();
  }

  private updateCircuitBreaker(handlerId: string, success: boolean): void {
    let cb = this.circuitBreakers.get(handlerId);

    if (!cb) {
      cb = {
        state: CircuitBreakerState.CLOSED,
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
        lastSuccessTime: 0,
        nextAttemptTime: 0,
        failureRate: 0,
        config: this.config.circuitBreaker,
      };
    }

    if (success) {
      cb.successCount++;
      cb.lastSuccessTime = Date.now();

      if (cb.state === CircuitBreakerState.HALF_OPEN) {
        cb.state = CircuitBreakerState.CLOSED;
        cb.failureCount = 0;
      }
    } else {
      cb.failureCount++;
      cb.lastFailureTime = Date.now();
    }

    // Update failure rate
    //     const totalRequests = cb.successCount + cb.failureCount;
    //     cb.failureRate = totalRequests > 0 ? (cb.failureCount / totalRequests) * 100 : 0;
    //
    //     // Update circuit breaker state
    //     if (cb.state === CircuitBreakerState.CLOSED &&
    //         totalRequests >= cb.config.minimumThroughput &&
    //         cb.failureRate >= cb.config.failureThreshold) {
    //       cb.state = CircuitBreakerState.OPEN;
    //       cb.nextAttemptTime = Date.now() + cb.config.recoveryTimeout;
    //       this.logger.warn(`Circuit breaker opened for handler ${handlerId}`);
    //     } else if (cb.state === CircuitBreakerState.OPEN &&
    //                Date.now() >= cb.nextAttemptTime) {
    //       cb.state = CircuitBreakerState.HALF_OPEN;
    //       this.logger.info(`Circuit breaker half-open for handler ${handlerId}`);
    //     }
    //
    //     this.circuitBreakers.set(handlerId, cb);
    //
    //     // Update stats with circuit breaker state
    //     const stats = this.executionStats.get(handlerId);
    //     if (stats) {
    //       this.executionStats.set(handlerId, {
    //         ...stats,
    //         circuitBreakerState: cb.state
    //       });
    //     }
  }

  private isCircuitOpen(handlerId: string): boolean {
    const cb = this.circuitBreakers.get(handlerId);
    return cb?.state === CircuitBreakerState.OPEN && Date.now() < (cb.nextAttemptTime || 0);
  }

  private checkRateLimit(handlerId: string): boolean {
    if (!this.config.rateLimit.enabled) return true;

    const now = Date.now();
    let limiter = this.rateLimiters.get(handlerId);

    if (!limiter) {
      limiter = { tokens: this.config.rateLimit.burstSize, lastRefill: now };
      this.rateLimiters.set(handlerId, limiter);
    }

    // Refill tokens
    //     const timePassed = now - limiter.lastRefill;
    //     const tokensToAdd = Math.floor(timePassed / 1000) * this.config.rateLimit.maxPerSecond;
    //     limiter.tokens = Math.min(this.config.rateLimit.burstSize, limiter.tokens + tokensToAdd);
    //     limiter.lastRefill = now;
    //
    //     if (limiter.tokens > 0) {
    //       limiter.tokens--;
    //       return true;
    //     }
    //
    //     return false;
  }

  private shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= this.config.maxRetries) return false;

    // Don't retry certain types of errors
    //     if (error.message.includes('PERMANENT') ||
    //         error.message.includes('VALIDATION') ||
    //         error.message.includes('UNAUTHORIZED')) {
    //       return false;
    //     }
    //
    //     return true;
  }

  private generateHandlerId(handler: RegisteredHandler): string {
    return `${handler.instance.constructor.name}.${handler.methodName}@${handler.metadata.eventName}`;
  }

  private setupExecutionMonitoring(): void {
    // Monitor for stuck executions
    //     const monitoringInterval = setInterval(() => {
    //       const now = Date.now();
    //       const stuckExecutions = Array.from(this.activeExecutions.values())
    //         .filter(ctx => now > ctx.timeoutAt);
    //
    //       stuckExecutions.forEach(ctx => {
    //         this.logger.warn(`Execution ${ctx.executionId} appears stuck, started at ${new Date(ctx.startedAt)}`);
    //         this.cancelExecution(ctx.executionId);
    //       });
    //     }, 30000); // Check every 30 seconds
    //
    //     // Clean up on shutdown
    //     this.shutdown$.subscribe(() => {
    //       clearInterval(monitoringInterval);
    //     });
  }

  private startPeriodicCleanup(): void {
    const cleanupInterval = setInterval(() => {
      this.cleanupOldStats();
      this.cleanupRateLimiters();
    }, 300000); // Every 5 minutes
    //
    //     this.shutdown$.subscribe(() => {
    //       clearInterval(cleanupInterval);
    //     });
  }

  private cleanupOldStats(): void {
    const cutoffTime = Date.now() - 3600000; // 1 hour ago
    //     let cleanedCount = 0;
    //
    //     for (const [handlerId, stats] of this.executionStats) {
    //       if (stats.lastExecutionAt && stats.lastExecutionAt < cutoffTime) {
    //         this.executionStats.delete(handlerId);
    //         this.circuitBreakers.delete(handlerId);
    //         cleanedCount++;
    //       }
    //     }
    //
    //     if (cleanedCount > 0) {
    //       this.logger.debug(`Cleaned up ${cleanedCount} old handler statistics`);
    //       this.updateStatsObservable();
    //     }
  }

  private cleanupRateLimiters(): void {
    const cutoffTime = Date.now() - 300000; // 5 minutes ago
    //     let cleanedCount = 0;
    //
    //     for (const [handlerId, limiter] of this.rateLimiters) {
    //       if (limiter.lastRefill < cutoffTime) {
    //         this.rateLimiters.delete(handlerId);
    //         cleanedCount++;
    //       }
    //     }
    //
    //     if (cleanedCount > 0) {
    //       this.logger.debug(`Cleaned up ${cleanedCount} old rate limiters`);
    //     }
  }

  private updateStatsObservable(): void {
    const stats: Record<string, HandlerExecutionStats> = {};
    for (const [handlerId, stat] of this.executionStats) {
      stats[handlerId] = stat;
    }
    this.stats$.next(stats);
  }
}
