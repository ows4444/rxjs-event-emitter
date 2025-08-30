import { Injectable, Logger } from '@nestjs/common';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { CircuitBreakerMetrics, CircuitBreakerState, ErrorRecoveryMetrics } from '../event-emitter.interfaces';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly metrics$ = new BehaviorSubject<Record<string, unknown>>({});
  private readonly bufferMetrics$ = new BehaviorSubject<{ size: number; maxSize: number; dropped: number }>({
    size: 0,
    maxSize: 0,
    dropped: 0,
  });

  private readonly errorRecoveryMetrics$ = new BehaviorSubject<ErrorRecoveryMetrics>({
    circuitBreakers: new Map(),
    totalRetryAttempts: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    averageRecoveryTime: 0,
  });

  private readonly subscriptionMetadata = new Map<
    Subscription,
    {
      name: string;
      createdAt: number;
      context?: string;
      cleanupCallbacks: (() => void)[];
    }
  >();

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

  private readonly circuitBreakers = new Map<string, CircuitBreakerMetrics>();
  private droppedEventCount = 0;
  private metricsInterval?: NodeJS.Timeout;

  initializeMetrics(): void {
    // Start metrics collection interval
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 5000); // Collect every 5 seconds

    this.logger.debug('Metrics collection initialized');
  }

  private collectMetrics(): void {
    const metrics = {
      timestamp: Date.now(),
      bufferStats: this.bufferMetrics$.value,
      subscriptionStats: this.getSubscriptionMetrics(),
      memoryStats: this.getMemoryMetrics(),
      timeoutStats: this.getTimeoutMetrics(),
      circuitBreakerStats: this.getCircuitBreakerStats(),
      droppedEvents: this.droppedEventCount,
    };

    this.metrics$.next(metrics);
  }

  getMetrics(): Observable<Record<string, unknown>> {
    return this.metrics$.asObservable();
  }

  getBufferMetrics(): Observable<{ size: number; maxSize: number; dropped: number }> {
    return this.bufferMetrics$.asObservable();
  }

  updateBufferMetrics(size: number, maxSize?: number, dropped?: number): void {
    const current = this.bufferMetrics$.value;
    this.bufferMetrics$.next({
      size,
      maxSize: maxSize ?? current.maxSize,
      dropped: dropped ?? current.dropped,
    });
  }

  incrementDroppedEvents(): void {
    this.droppedEventCount++;
    const current = this.bufferMetrics$.value;
    this.bufferMetrics$.next({
      ...current,
      dropped: current.dropped + 1,
    });
  }

  getSubscriptionMetrics(): {
    total: number;
    byContext: Record<string, number>;
    averageAge: number;
    oldestSubscription: number;
  } {
    const subscriptions = Array.from(this.subscriptionMetadata.values());
    const now = Date.now();

    const byContext: Record<string, number> = {};
    let totalAge = 0;
    let oldestAge = 0;

    subscriptions.forEach((meta) => {
      const context = meta.context || 'unknown';
      byContext[context] = (byContext[context] || 0) + 1;

      const age = now - meta.createdAt;
      totalAge += age;
      oldestAge = Math.max(oldestAge, age);
    });

    return {
      total: subscriptions.length,
      byContext,
      averageAge: subscriptions.length > 0 ? totalAge / subscriptions.length : 0,
      oldestSubscription: oldestAge,
    };
  }

  getMemoryMetrics(): {
    subscriptionCount: number;
    metadataMapSize: number;
    timeoutMetricsSize: number;
    circuitBreakerCount: number;
    estimatedMemoryUsage: number;
  } {
    const subscriptionCount = this.subscriptionMetadata.size;
    const metadataMapSize = this.subscriptionMetadata.size;
    const timeoutMetricsSize = this.timeoutMetrics.size;
    const circuitBreakerCount = this.circuitBreakers.size;

    // Rough estimate of memory usage (in bytes)
    const estimatedMemoryUsage =
      subscriptionCount * 200 + // Rough estimate per subscription
      metadataMapSize * 150 + // Metadata overhead
      timeoutMetricsSize * 100 + // Timeout metrics
      circuitBreakerCount * 80; // Circuit breaker metrics

    return {
      subscriptionCount,
      metadataMapSize,
      timeoutMetricsSize,
      circuitBreakerCount,
      estimatedMemoryUsage,
    };
  }

  getErrorRecoveryMetrics(): Observable<ErrorRecoveryMetrics> {
    return this.errorRecoveryMetrics$.asObservable();
  }

  updateErrorRecoveryMetrics(update: Partial<ErrorRecoveryMetrics>): void {
    const current = this.errorRecoveryMetrics$.value;
    this.errorRecoveryMetrics$.next({
      ...current,
      ...update,
    });
  }

  getTimeoutMetrics(): Record<
    string,
    {
      totalExecutions: number;
      timeouts: number;
      successes: number;
      averageExecutionTime: number;
      timeoutRate: number;
      lastTimeout?: number;
    }
  > {
    const result: Record<string, any> = {};

    for (const [handlerId, metrics] of this.timeoutMetrics.entries()) {
      result[handlerId] = {
        ...metrics,
        timeoutRate: metrics.totalExecutions > 0 ? metrics.timeouts / metrics.totalExecutions : 0,
      };
    }

    return result;
  }

  recordHandlerExecution(handlerId: string, executionTime: number, timedOut: boolean = false): void {
    let metrics = this.timeoutMetrics.get(handlerId);
    if (!metrics) {
      metrics = {
        totalExecutions: 0,
        timeouts: 0,
        successes: 0,
        averageExecutionTime: 0,
        lastTimeout: undefined,
      };
      this.timeoutMetrics.set(handlerId, metrics);
    }

    metrics.totalExecutions++;

    if (timedOut) {
      metrics.timeouts++;
      metrics.lastTimeout = Date.now();
    } else {
      metrics.successes++;
      metrics.averageExecutionTime = (metrics.averageExecutionTime + executionTime) / 2;
    }
  }

  resetTimeoutMetrics(handlerId?: string): void {
    if (handlerId) {
      this.timeoutMetrics.delete(handlerId);
    } else {
      this.timeoutMetrics.clear();
    }
  }

  getCircuitBreakerStats(): Record<string, CircuitBreakerMetrics> {
    const stats: Record<string, CircuitBreakerMetrics> = {};
    for (const [context, metrics] of this.circuitBreakers.entries()) {
      stats[context] = { ...metrics };
    }
    return stats;
  }

  getCircuitBreakerState(context: string): CircuitBreakerMetrics | undefined {
    return this.circuitBreakers.get(context);
  }

  updateCircuitBreakerState(context: string, metrics: CircuitBreakerMetrics): void {
    this.circuitBreakers.set(context, metrics);
  }

  resetCircuitBreaker(context: string): void {
    const metrics = this.circuitBreakers.get(context);
    if (metrics) {
      metrics.state = CircuitBreakerState.CLOSED;
      metrics.failureCount = 0;
      metrics.lastFailureTime = undefined;
      metrics.lastSuccessTime = Date.now();
    }
  }

  trackSubscription(subscription: Subscription, name: string = 'unnamed', context?: string): Subscription {
    const metadata = {
      name,
      createdAt: Date.now(),
      context,
      cleanupCallbacks: [] as (() => void)[],
    };

    this.subscriptionMetadata.set(subscription, metadata);

    const cleanup = () => {
      try {
        metadata.cleanupCallbacks.forEach((callback) => {
          try {
            callback();
          } catch (error) {
            this.logger.warn(`Error in subscription cleanup callback for ${name}:`, error);
          }
        });

        this.subscriptionMetadata.delete(subscription);
        this.logger.debug(`Subscription ${name} cleaned up after ${Date.now() - metadata.createdAt}ms`);
      } catch (error) {
        this.logger.error(`Error during subscription cleanup for ${name}:`, error);
      }
    };

    subscription.add(cleanup);
    return subscription;
  }

  forceMemoryCleanup(): {
    subscriptionsRemoved: number;
    metadataCleared: number;
    timeoutMetricsCleared: number;
    memoryFreed: number;
  } {
    const initialSubscriptions = this.subscriptionMetadata.size;
    const initialTimeoutMetrics = this.timeoutMetrics.size;
    const initialMemory = this.getMemoryMetrics().estimatedMemoryUsage;

    // Clear stale subscriptions (older than 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let staleCleaned = 0;

    for (const [subscription, metadata] of this.subscriptionMetadata.entries()) {
      if (metadata.createdAt < oneHourAgo && subscription.closed) {
        this.subscriptionMetadata.delete(subscription);
        staleCleaned++;
      }
    }

    // Clear old timeout metrics (keep only last 100 handlers)
    const timeoutEntries = Array.from(this.timeoutMetrics.entries());
    if (timeoutEntries.length > 100) {
      const toRemove = timeoutEntries.slice(0, timeoutEntries.length - 100);
      toRemove.forEach(([handlerId]) => {
        this.timeoutMetrics.delete(handlerId);
      });
    }

    const finalMemory = this.getMemoryMetrics().estimatedMemoryUsage;

    return {
      subscriptionsRemoved: staleCleaned,
      metadataCleared: initialSubscriptions - this.subscriptionMetadata.size,
      timeoutMetricsCleared: initialTimeoutMetrics - this.timeoutMetrics.size,
      memoryFreed: initialMemory - finalMemory,
    };
  }

  cleanup(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }

    this.subscriptionMetadata.clear();
    this.timeoutMetrics.clear();
    this.circuitBreakers.clear();
    this.droppedEventCount = 0;

    this.logger.debug('Metrics service cleaned up');
  }
}
