/**
 * Dead Letter Queue Service - NestJS implementation for failed event handling
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { BehaviorSubject, EMPTY, from, interval, Subject, Subscription, timer } from 'rxjs';
import { catchError, switchMap, takeUntil, tap, filter } from 'rxjs/operators';
import { Event, DLQEntry, DLQConfig, DLQMetrics, RetryPolicy, RetryCondition, PolicyStats, EVENT_EMITTER_OPTIONS } from '../interfaces';
import { EventEmitterService } from './event-emitter.service';
import { PersistenceService } from './persistence.service';
import { MetricsService } from './metrics.service';

/**
 * Default retry policies
 */
const DEFAULT_RETRY_POLICIES: Record<string, RetryPolicy> = {
  exponential: {
    name: 'exponential',
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    exponentialMultiplier: 2,
    jitterFactor: 0.1,
    enableJitter: true,
    retryConditions: [
      {
        shouldRetry: (error: Error, attempt: number) => attempt < 3 && !error.message.includes('PERMANENT'),
        description: 'Retry non-permanent errors up to 3 times',
      },
    ],
  },
  immediate: {
    name: 'immediate',
    maxRetries: 1,
    baseDelayMs: 0,
    maxDelayMs: 0,
    exponentialMultiplier: 1,
    jitterFactor: 0,
    enableJitter: false,
    retryConditions: [
      {
        shouldRetry: (error: Error) => !error.message.includes('PERMANENT'),
        description: 'Single immediate retry for non-permanent errors',
      },
    ],
  },
  aggressive: {
    name: 'aggressive',
    maxRetries: 5,
    baseDelayMs: 500,
    maxDelayMs: 10000,
    exponentialMultiplier: 1.5,
    jitterFactor: 0.2,
    enableJitter: true,
    retryConditions: [
      {
        shouldRetry: (error: Error, attempt: number) => attempt < 5 && error.message.includes('TRANSIENT'),
        description: 'Aggressive retry for transient errors',
      },
    ],
  },
};

@Injectable()
export class DeadLetterQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeadLetterQueueService.name);

  private readonly queue = new Map<string, DLQEntry>();
  private readonly dlqEvents$ = new Subject<DLQEntry>();
  private readonly shutdown$ = new Subject<void>();
  private readonly retryQueue$ = new Subject<DLQEntry>();
  private readonly subscriptions = new Set<Subscription>();
  private readonly processingEntries = new Map<string, DLQEntry>();

  private readonly metrics$ = new BehaviorSubject<DLQMetrics>({
    totalEntries: 0,
    successfulReprocessing: 0,
    failedReprocessing: 0,
    averageRetryTime: 0,
    currentlyProcessing: 0,
    scheduledForRetry: 0,
    permanentFailures: 0,
    healthStatus: 'healthy',
    policyStats: {},
  });

  private readonly config: Required<DLQConfig>;
  private autoRetryTimer?: NodeJS.Timeout;

  constructor(
    @Optional() @Inject(EVENT_EMITTER_OPTIONS) private readonly options: Record<string, any> = {},
    @Optional() private readonly eventEmitterService?: EventEmitterService,
    @Optional() private readonly persistenceService?: PersistenceService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {
    this.config = {
      enabled: true,
      maxEntries: 10000,
      autoRetryIntervalMs: 60000,
      defaultRetryPolicy: 'exponential',
      retryPolicies: DEFAULT_RETRY_POLICIES,
      persistence: {
        enabled: false,
        adapter: 'memory',
        cleanupIntervalMs: 300000,
      },
      ...this.options?.dlq,
    };
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.log('Dead Letter Queue is disabled');
      return;
    }

    this.logger.log('Initializing Dead Letter Queue Service...');

    this.setupEventProcessing();
    this.setupRetryProcessing();
    this.startAutoRetry();

    if (this.config.persistence.enabled) {
      await this.loadPersistedEntries();
    }

    this.logger.log('Dead Letter Queue Service initialized successfully');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down Dead Letter Queue Service...');

    this.stopAutoRetry();
    this.shutdown$.next();
    this.shutdown$.complete();

    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.subscriptions.clear();

    if (this.config.persistence.enabled) {
      await this.persistAllEntries();
    }

    this.logger.log('Dead Letter Queue Service shutdown completed');
  }

  private setupEventProcessing(): void {
    const subscription = this.dlqEvents$
      .pipe(
        takeUntil(this.shutdown$),
        tap((entry) => this.processNewEntry(entry)),
        catchError((error) => {
          this.logger.error('Error processing DLQ entry:', error);
          return EMPTY;
        }),
      )
      .subscribe();

    this.subscriptions.add(subscription);
  }

  private setupRetryProcessing(): void {
    const subscription = this.retryQueue$
      .pipe(
        takeUntil(this.shutdown$),
        switchMap((entry) => this.processRetryEntry(entry)),
        catchError((error) => {
          this.logger.error('Error processing retry:', error);
          return EMPTY;
        }),
      )
      .subscribe();

    this.subscriptions.add(subscription);
  }

  private async processNewEntry(entry: DLQEntry): Promise<void> {
    try {
      if (this.queue.size >= this.config.maxEntries) {
        this.logger.warn('DLQ at capacity, dropping oldest entry');
        this.removeOldestEntry();
      }

      this.queue.set(entry.event.metadata.id, entry);
      this.updateMetrics();

      if (this.config.persistence.enabled) {
        await this.persistEntry(entry);
      }

      this.logger.debug(`Added entry to DLQ: ${entry.event.metadata.name} (${entry.event.metadata.id})`);
    } catch (error) {
      this.logger.error('Failed to process new DLQ entry:', error);
    }
  }

  private async processRetryEntry(entry: DLQEntry): Promise<void> {
    const eventId = entry.event.metadata.id;
    this.processingEntries.set(eventId, entry);

    try {
      if (!this.eventEmitterService) {
        throw new Error('EventEmitterService not available for retry');
      }

      await this.eventEmitterService.emit(entry.event.metadata.name, entry.event.payload, {
        correlationId: entry.event.metadata.correlationId,
        causationId: entry.event.metadata.causationId,
        headers: { ...entry.event.metadata.headers, retryAttempt: entry.attempts + 1 },
      });

      this.handleRetrySuccess(entry);
      this.logger.debug(`Successfully reprocessed event: ${entry.event.metadata.id}`);
    } catch (error) {
      await this.handleRetryFailure(entry, error as Error);
    } finally {
      this.processingEntries.delete(eventId);
    }
  }

  private handleRetrySuccess(entry: DLQEntry): void {
    this.queue.delete(entry.event.metadata.id);
    this.updatePolicyStats(entry.retryPolicy || this.config.defaultRetryPolicy, true);
    this.updateMetrics();
  }

  private async handleRetryFailure(entry: DLQEntry, error: Error): Promise<void> {
    const policy = this.getRetryPolicy(entry.retryPolicy || this.config.defaultRetryPolicy);
    const shouldRetry = policy.retryConditions.some((condition) => condition.shouldRetry(error, entry.attempts + 1));

    if (shouldRetry && entry.attempts < policy.maxRetries) {
      const delay = this.calculateDelay(policy, entry.attempts + 1);
      const updatedEntry: DLQEntry = {
        ...entry,
        attempts: entry.attempts + 1,
        lastRetryTime: Date.now(),
        nextRetryTime: Date.now() + delay,
        exponentialDelay: delay,
        isScheduled: true,
      };

      this.queue.set(entry.event.metadata.id, updatedEntry);
      this.scheduleRetry(updatedEntry, delay);

      this.logger.debug(`Scheduled retry for event ${entry.event.metadata.id} in ${delay}ms`);
    } else {
      this.markAsPermanentFailure(entry);
      this.logger.warn(`Event permanently failed: ${entry.event.metadata.id} after ${entry.attempts} attempts`);
    }

    this.updatePolicyStats(entry.retryPolicy || this.config.defaultRetryPolicy, false);
    this.updateMetrics();
  }

  private scheduleRetry(entry: DLQEntry, delay: number): void {
    timer(delay)
      .pipe(
        takeUntil(this.shutdown$),
        filter(() => this.queue.has(entry.event.metadata.id)),
      )
      .subscribe(() => {
        this.retryQueue$.next(entry);
      });
  }

  private calculateDelay(policy: RetryPolicy, attempt: number): number {
    let delay = policy.baseDelayMs * Math.pow(policy.exponentialMultiplier, attempt - 1);
    delay = Math.min(delay, policy.maxDelayMs);

    if (policy.enableJitter && policy.jitterFactor > 0) {
      const jitter = delay * policy.jitterFactor * Math.random();
      delay += jitter;
    }

    return Math.floor(delay);
  }

  private getRetryPolicy(policyName: string): RetryPolicy {
    return this.config.retryPolicies[policyName] || this.config.retryPolicies[this.config.defaultRetryPolicy];
  }

  private markAsPermanentFailure(entry: DLQEntry): void {
    const permanentEntry: DLQEntry = {
      ...entry,
      isScheduled: false,
      metadata: { ...entry.metadata, permanentFailure: true },
    };
    this.queue.set(entry.event.metadata.id, permanentEntry);
  }

  private removeOldestEntry(): void {
    const oldest = Array.from(this.queue.values()).sort((a, b) => a.timestamp - b.timestamp)[0];

    if (oldest) {
      this.queue.delete(oldest.event.metadata.id);
    }
  }

  private updatePolicyStats(policyName: string, success: boolean): void {
    const currentMetrics = this.metrics$.value;
    const policyStats = currentMetrics.policyStats[policyName] || {
      totalEntries: 0,
      successRate: 0,
      averageRetryCount: 0,
    };

    const newStats: PolicyStats = {
      totalEntries: policyStats.totalEntries + 1,
      successRate: success
        ? (policyStats.successRate * policyStats.totalEntries + 100) / (policyStats.totalEntries + 1)
        : (policyStats.successRate * policyStats.totalEntries) / (policyStats.totalEntries + 1),
      averageRetryCount: policyStats.averageRetryCount,
      lastUsedAt: Date.now(),
    };

    this.metrics$.next({
      ...currentMetrics,
      policyStats: {
        ...currentMetrics.policyStats,
        [policyName]: newStats,
      },
    });
  }

  private updateMetrics(): void {
    const entries = Array.from(this.queue.values());
    const permanentFailures = entries.filter((e) => e.metadata?.permanentFailure).length;
    const scheduled = entries.filter((e) => e.isScheduled).length;

    const currentMetrics = this.metrics$.value;
    this.metrics$.next({
      ...currentMetrics,
      totalEntries: this.queue.size,
      currentlyProcessing: this.processingEntries.size,
      scheduledForRetry: scheduled,
      permanentFailures,
      healthStatus: this.calculateHealthStatus(),
      lastProcessedAt: Date.now(),
    });

    if (this.metricsService) {
      this.metricsService.recordDLQMetrics(this.metrics$.value);
    }
  }

  private calculateHealthStatus(): 'healthy' | 'degraded' | 'critical' {
    const totalEntries = this.queue.size;
    const maxEntries = this.config.maxEntries;

    if (totalEntries === 0) return 'healthy';
    if (totalEntries < maxEntries * 0.7) return 'healthy';
    if (totalEntries < maxEntries * 0.9) return 'degraded';
    return 'critical';
  }

  private async loadPersistedEntries(): Promise<void> {
    if (!this.persistenceService) return;

    try {
      const persistedEntries = await this.persistenceService.getDLQEntriesForService();
      persistedEntries.forEach((entry) => {
        this.queue.set(entry.event.metadata.id, entry);
      });

      this.logger.log(`Loaded ${persistedEntries.length} persisted DLQ entries`);
    } catch (error) {
      this.logger.error('Failed to load persisted DLQ entries:', error);
    }
  }

  private async persistEntry(entry: DLQEntry): Promise<void> {
    if (!this.persistenceService) return;

    try {
      await this.persistenceService.saveDLQEntry(entry);
    } catch (error) {
      this.logger.error('Failed to persist DLQ entry:', error);
    }
  }

  private async persistAllEntries(): Promise<void> {
    if (!this.persistenceService) return;

    try {
      const entries = Array.from(this.queue.values());
      await this.persistenceService.saveDLQEntries(entries);
      this.logger.log(`Persisted ${entries.length} DLQ entries`);
    } catch (error) {
      this.logger.error('Failed to persist DLQ entries:', error);
    }
  }

  // Public API methods

  async addEntry(event: Event, error: Error, retryPolicy?: string): Promise<void> {
    const entry: DLQEntry = {
      event,
      error,
      timestamp: Date.now(),
      attempts: 0,
      retryPolicy: retryPolicy || this.config.defaultRetryPolicy,
      isScheduled: false,
      metadata: {
        addedBy: 'DeadLetterQueueService',
        originalError: error.message,
      },
    };

    this.dlqEvents$.next(entry);
  }

  async processNext(): Promise<boolean> {
    const entries = Array.from(this.queue.values())
      .filter((e) => !e.isScheduled && !e.metadata?.permanentFailure)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (entries.length === 0) {
      return false;
    }

    this.retryQueue$.next(entries[0]);
    return true;
  }

  getMetrics(): DLQMetrics {
    return this.metrics$.value;
  }

  async getEntries(limit = 100, offset = 0): Promise<DLQEntry[]> {
    const entries = Array.from(this.queue.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(offset, offset + limit);

    return entries;
  }

  async getEntry(eventId: string): Promise<DLQEntry | null> {
    return this.queue.get(eventId) || null;
  }

  async removeEntry(eventId: string): Promise<boolean> {
    const removed = this.queue.delete(eventId);
    if (removed) {
      this.updateMetrics();
    }
    return removed;
  }

  async clear(): Promise<void> {
    this.queue.clear();
    this.processingEntries.clear();
    this.updateMetrics();
    this.logger.log('DLQ cleared');
  }

  startAutoRetry(): void {
    if (this.autoRetryTimer) {
      clearInterval(this.autoRetryTimer);
    }

    this.autoRetryTimer = setInterval(() => {
      this.processNext().catch((error) => {
        this.logger.error('Auto-retry processing failed:', error);
      });
    }, this.config.autoRetryIntervalMs);

    this.logger.debug('Auto-retry processing started');
  }

  stopAutoRetry(): void {
    if (this.autoRetryTimer) {
      clearInterval(this.autoRetryTimer);
      this.autoRetryTimer = undefined;
      this.logger.debug('Auto-retry processing stopped');
    }
  }

  isHealthy(): boolean {
    return this.metrics$.value.healthStatus === 'healthy';
  }
}
