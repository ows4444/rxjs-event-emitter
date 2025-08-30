import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { BehaviorSubject, Subject, Subscription, Observable, merge } from 'rxjs';
import { takeUntil, tap, catchError, shareReplay } from 'rxjs/operators';
import { Event, EventEmitterOptions } from '../event-emitter.interfaces';

/**
 * Dedicated service for managing RxJS streams and subscription lifecycle
 * Extracted from EventEmitterService for better separation of concerns
 */
@Injectable()
export class StreamManagementService implements OnModuleDestroy {
  private readonly logger = new Logger(StreamManagementService.name);

  // Core streams
  private readonly eventBus$ = new Subject<Event>();
  private readonly shutdown$ = new Subject<void>();
  private readonly concurrencyControl$ = new BehaviorSubject<number>(0);

  // Buffer and backpressure metrics
  private readonly bufferMetrics$ = new BehaviorSubject<{
    size: number;
    maxSize: number;
    dropped: number;
    warningThreshold: number;
  }>({
    size: 0,
    maxSize: this.options.backpressure?.bufferSize || 1000,
    dropped: 0,
    warningThreshold: this.options.backpressure?.warningThreshold || 800,
  });

  // Enhanced subscription tracking for memory leak prevention
  private readonly subscriptions = new Set<Subscription>();
  private readonly subscriptionMetadata = new Map<
    Subscription,
    {
      name: string;
      createdAt: number;
      context?: string;
      cleanupCallbacks: (() => void)[];
    }
  >();

  private subscriptionCleanupTimer?: NodeJS.Timeout;
  private droppedEventCount = 0;

  constructor(private readonly options: EventEmitterOptions) {
    this.initializeStreamHealthMonitoring();
    this.setupPeriodicCleanup();
  }

  /**
   * Get the main event bus observable
   */
  getEventBus(): Observable<Event> {
    return this.eventBus$.asObservable().pipe(takeUntil(this.shutdown$), shareReplay({ bufferSize: 1, refCount: true }));
  }

  /**
   * Emit an event to the event bus
   */
  emitEvent(event: Event): void {
    const currentBuffer = this.bufferMetrics$.value;

    // Check buffer limits and apply backpressure strategy
    if (currentBuffer.size >= currentBuffer.maxSize) {
      this.handleBackpressure(event);
      return;
    }

    this.eventBus$.next(event);
    this.updateBufferMetrics(currentBuffer.size + 1);
  }

  /**
   * Get shutdown observable for lifecycle management
   */
  getShutdownSignal(): Observable<void> {
    return this.shutdown$.asObservable();
  }

  /**
   * Get concurrency control observable
   */
  getConcurrencyControl(): Observable<number> {
    return this.concurrencyControl$.asObservable();
  }

  /**
   * Update concurrency count
   */
  updateConcurrency(count: number): void {
    this.concurrencyControl$.next(count);
  }

  /**
   * Get buffer metrics observable
   */
  getBufferMetrics(): Observable<{ size: number; maxSize: number; dropped: number; warningThreshold: number }> {
    return this.bufferMetrics$.asObservable();
  }

  /**
   * Track subscription with comprehensive lifecycle management
   */
  trackSubscription(subscription: Subscription, name: string = 'unnamed', context?: string): Subscription {
    this.subscriptions.add(subscription);

    // Store metadata for monitoring and debugging
    const metadata = {
      name,
      createdAt: Date.now(),
      context,
      cleanupCallbacks: [] as (() => void)[],
    };
    this.subscriptionMetadata.set(subscription, metadata);

    // Enhanced auto-removal with error handling and cleanup
    const cleanup = () => {
      try {
        // Execute any registered cleanup callbacks
        metadata.cleanupCallbacks.forEach((callback) => {
          try {
            callback();
          } catch (error) {
            this.logger.warn(`Cleanup callback failed for subscription ${name}`, error);
          }
        });

        this.subscriptions.delete(subscription);
        this.subscriptionMetadata.delete(subscription);
      } catch (error) {
        this.logger.error(`Failed to cleanup subscription ${name}`, error);
      }
    };

    subscription.add(cleanup);
    return subscription;
  }

  /**
   * Add cleanup callback to subscription
   */
  addCleanupCallback(subscription: Subscription, callback: () => void): void {
    const metadata = this.subscriptionMetadata.get(subscription);
    if (metadata) {
      metadata.cleanupCallbacks.push(callback);
    }
  }

  /**
   * Get subscription statistics
   */
  getSubscriptionStats(): {
    active: number;
    total: number;
    oldestAge: number;
    byContext: Record<string, number>;
  } {
    const now = Date.now();
    let oldestAge = 0;
    const byContext: Record<string, number> = {};

    for (const [_subscription, metadata] of this.subscriptionMetadata) {
      const age = now - metadata.createdAt;
      oldestAge = Math.max(oldestAge, age);

      const context = metadata.context || 'unknown';
      byContext[context] = (byContext[context] || 0) + 1;
    }

    return {
      active: this.subscriptions.size,
      total: this.subscriptionMetadata.size,
      oldestAge,
      byContext,
    };
  }

  /**
   * Handle backpressure based on configured strategy
   */
  private handleBackpressure(_event: Event): void {
    const strategy = this.options.backpressure?.overflowStrategy || 'dropLatest';

    switch (strategy) {
      case 'dropOldest':
        // Implementation would require queue tracking
        this.logger.warn('Event dropped due to backpressure (dropOldest)');
        break;
      case 'dropLatest':
        this.droppedEventCount++;
        this.logger.warn(`Event dropped due to backpressure (dropLatest). Total dropped: ${this.droppedEventCount}`);
        break;
      case 'error':
        throw new Error('Event bus buffer overflow - increase buffer size or reduce event volume');
      default:
        this.logger.warn('Unknown backpressure strategy, dropping event');
    }

    // Update dropped count in metrics
    const current = this.bufferMetrics$.value;
    this.bufferMetrics$.next({
      ...current,
      dropped: current.dropped + 1,
    });
  }

  /**
   * Update buffer size metrics
   */
  private updateBufferMetrics(size: number): void {
    const current = this.bufferMetrics$.value;
    const newMetrics = { ...current, size };

    // Warn if approaching threshold
    if (size >= current.warningThreshold && current.size < current.warningThreshold) {
      this.logger.warn(`Buffer size approaching limit: ${size}/${current.maxSize}`);
    }

    this.bufferMetrics$.next(newMetrics);
  }

  /**
   * Initialize stream health monitoring
   */
  private initializeStreamHealthMonitoring(): void {
    // Monitor buffer metrics and log warnings
    const bufferMonitoring = this.bufferMetrics$
      .pipe(
        tap((metrics) => {
          if (metrics.size > metrics.warningThreshold) {
            this.logger.warn(`High buffer usage: ${metrics.size}/${metrics.maxSize}`);
          }
        }),
        catchError((error, caught$) => {
          this.logger.error('Buffer monitoring error:', error);
          return caught$;
        }),
      )
      .subscribe();

    this.trackSubscription(bufferMonitoring, 'buffer-monitoring', 'stream-health');

    // Monitor subscription count
    this.trackSubscription(
      merge(this.eventBus$, this.shutdown$)
        .pipe(
          tap(() => {
            const stats = this.getSubscriptionStats();
            if (stats.active > 100) {
              // Arbitrary threshold
              this.logger.warn(`High subscription count: ${stats.active}`);
            }
          }),
          catchError((error, caught$) => {
            this.logger.error('Subscription monitoring error:', error);
            return caught$;
          }),
        )
        .subscribe(),
      'subscription-monitoring',
      'stream-health',
    );
  }

  /**
   * Setup periodic cleanup of old subscriptions
   */
  private setupPeriodicCleanup(): void {
    this.subscriptionCleanupTimer = setInterval(
      () => {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        for (const [subscription, metadata] of this.subscriptionMetadata) {
          if (now - metadata.createdAt > maxAge && subscription.closed) {
            this.subscriptions.delete(subscription);
            this.subscriptionMetadata.delete(subscription);
          }
        }
      },
      60 * 60 * 1000,
    ); // Run every hour
  }

  /**
   * Graceful shutdown with proper cleanup
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down StreamManagementService...');

    // Signal shutdown to all streams
    this.shutdown$.next();
    this.shutdown$.complete();

    // Clear cleanup timer
    if (this.subscriptionCleanupTimer) {
      clearInterval(this.subscriptionCleanupTimer);
    }

    // Wait a bit for subscriptions to cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Force cleanup any remaining subscriptions
    for (const subscription of this.subscriptions) {
      try {
        if (!subscription.closed) {
          subscription.unsubscribe();
        }
      } catch (error) {
        this.logger.warn('Error during forced subscription cleanup:', error);
      }
    }

    // Complete all subjects
    this.eventBus$.complete();
    this.concurrencyControl$.complete();
    this.bufferMetrics$.complete();

    this.logger.log('StreamManagementService shutdown complete');
  }
}
