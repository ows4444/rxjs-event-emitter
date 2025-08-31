import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, Optional } from '@nestjs/common';
import { BehaviorSubject, Observable, Subscription, combineLatest } from 'rxjs';
import { map, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { Event, EventStats, StreamMetrics, HandlerStats, HandlerIsolationMetrics, DLQMetrics, EVENT_EMITTER_OPTIONS } from '../interfaces';

/**
 * Comprehensive system metrics aggregation
 */
export interface SystemMetrics {
  readonly events: EventStats;
  readonly streams: StreamMetrics;
  readonly handlers: Readonly<Record<string, HandlerStats>>;
  readonly isolation: HandlerIsolationMetrics;
  readonly dlq: DLQMetrics;
  readonly system: {
    readonly memoryUsage: number;
    readonly cpuUsage: number;
    readonly uptime: number;
    readonly eventRate: number;
    readonly errorRate: number;
    readonly lastUpdated: number;
  };
  readonly health: {
    readonly healthy: boolean;
    readonly score: number;
    readonly lastCheck: number;
    readonly alerts: readonly string[];
    readonly status: 'healthy' | 'degraded' | 'critical';
  };
}

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  readonly enabled: boolean;
  readonly collectionIntervalMs: number;
  readonly retentionPeriodMs: number;
  readonly enableDetailedTracking: boolean;
  readonly healthCheckIntervalMs: number;
  readonly alertThresholds: {
    readonly errorRate: number;
    readonly memoryUsage: number;
    readonly eventRate: number;
  };
}

/**
 * @deprecated - Use SystemMetrics instead
 */
export interface EventMetrics {
  totalEvents: number;
  processedEvents: number;
  failedEvents: number;
  eventsByName: Map<string, number>;
  averageProcessingTime: number;
  lastProcessedAt?: Date;
}

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);

  private readonly shutdown$ = new BehaviorSubject<boolean>(false);
  private readonly subscriptions = new Set<Subscription>();

  // Metrics observables
  private readonly eventStats$ = new BehaviorSubject<EventStats>(this.createInitialEventStats());
  private readonly streamMetrics$ = new BehaviorSubject<StreamMetrics>(this.createInitialStreamMetrics());
  private readonly handlerStats$ = new BehaviorSubject<Record<string, HandlerStats>>({});
  private readonly isolationMetrics$ = new BehaviorSubject<HandlerIsolationMetrics>(this.createInitialIsolationMetrics());
  private readonly dlqMetrics$ = new BehaviorSubject<DLQMetrics>(this.createInitialDLQMetrics());
  private readonly systemMetrics$ = new BehaviorSubject<SystemMetrics>(this.createInitialSystemMetrics());

  // Internal tracking
  private readonly processingTimes: number[] = [];
  private readonly eventTimestamps: number[] = [];
  private readonly errorTimestamps: number[] = [];
  private readonly handlerExecutions = new Map<string, number[]>();
  private readonly handlerErrors = new Map<string, number[]>();

  private readonly startTime = Date.now();
  private metricsTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;

  private readonly config: Required<MetricsConfig>;

  // Legacy metrics for backward compatibility
  private readonly legacyMetrics: EventMetrics = {
    totalEvents: 0,
    processedEvents: 0,
    failedEvents: 0,
    eventsByName: new Map(),
    averageProcessingTime: 0,
  };
  private readonly legacyProcessingTimes: number[] = [];

  constructor(@Optional() @Inject(EVENT_EMITTER_OPTIONS) private readonly options: any = {}) {
    this.config = {
      enabled: true,
      collectionIntervalMs: 5000,
      retentionPeriodMs: 3600000, // 1 hour
      enableDetailedTracking: true,
      healthCheckIntervalMs: 30000,
      alertThresholds: {
        errorRate: 5, // 5%
        memoryUsage: 80, // 80%
        eventRate: 1000, // events/sec
      },
      ...this.options?.metrics,
    };
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.log('Metrics collection is disabled');
      return;
    }

    this.logger.log('Initializing comprehensive metrics collection...');

    this.startMetricsCollection();
    this.startHealthMonitoring();
    this.setupMetricsAggregation();

    this.logger.log('Metrics Service initialized successfully');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down Metrics Service...');

    this.shutdown$.next(true);
    this.shutdown$.complete();

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.subscriptions.clear();

    this.logger.log('Metrics Service shutdown completed');
  }

  recordEventEmitted(event: Event): void {
    if (!this.config.enabled) return;

    const now = Date.now();
    this.eventTimestamps.push(now);
    this.cleanupOldTimestamps(this.eventTimestamps);

    // Update event stats
    const current = this.eventStats$.value;
    const updated: EventStats = {
      ...current,
      totalEmitted: current.totalEmitted + 1,
      lastEmittedAt: now,
      processingRate: this.calculateEventRate(this.eventTimestamps),
    };
    this.eventStats$.next(updated);

    // Legacy compatibility
    this.legacyMetrics.totalEvents++;
    const count = this.legacyMetrics.eventsByName.get(event.metadata.name) || 0;
    this.legacyMetrics.eventsByName.set(event.metadata.name, count + 1);

    this.logger.debug(`Event emitted: ${event.metadata.name} (Total: ${updated.totalEmitted})`);
  }

  recordEventProcessed(event: Event, processingTimeMs: number): void {
    if (!this.config.enabled) return;

    const now = Date.now();
    this.processingTimes.push(processingTimeMs);
    this.cleanupOldTimestamps(this.processingTimes, 1000);

    // Update event stats
    const current = this.eventStats$.value;
    const avgTime = this.processingTimes.length > 0 ? this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length : 0;

    const updated: EventStats = {
      ...current,
      totalProcessed: current.totalProcessed + 1,
      averageProcessingTime: avgTime,
      lastProcessedAt: now,
      currentlyProcessing: Math.max(0, current.currentlyProcessing - 1),
    };
    this.eventStats$.next(updated);

    // Legacy compatibility
    this.legacyMetrics.processedEvents++;
    this.legacyMetrics.lastProcessedAt = new Date();
    this.legacyProcessingTimes.push(processingTimeMs);
    if (this.legacyProcessingTimes.length > 1000) {
      this.legacyProcessingTimes.shift();
    }
    this.legacyMetrics.averageProcessingTime = this.legacyProcessingTimes.reduce((sum, time) => sum + time, 0) / this.legacyProcessingTimes.length;

    this.logger.debug(`Event processed: ${event.metadata.name} in ${processingTimeMs}ms`);
  }

  recordEventFailed(event: Event, error: Error): void {
    if (!this.config.enabled) return;

    const now = Date.now();
    this.errorTimestamps.push(now);
    this.cleanupOldTimestamps(this.errorTimestamps);

    // Update event stats
    const current = this.eventStats$.value;
    const errorRate = this.calculateErrorRate();

    const updated: EventStats = {
      ...current,
      totalFailed: current.totalFailed + 1,
      errorRate,
      currentlyProcessing: Math.max(0, current.currentlyProcessing - 1),
    };
    this.eventStats$.next(updated);

    // Legacy compatibility
    this.legacyMetrics.failedEvents++;

    this.logger.warn(`Event failed: ${event.metadata.name} (${error.message}). Total failures: ${updated.totalFailed}`);
  }

  recordHandlerExecution(handlerName: string, executionTime: number, success: boolean): void {
    if (!this.config.enabled) return;

    if (!this.handlerExecutions.has(handlerName)) {
      this.handlerExecutions.set(handlerName, []);
      this.handlerErrors.set(handlerName, []);
    }

    const executions = this.handlerExecutions.get(handlerName)!;
    executions.push(executionTime);
    this.cleanupOldTimestamps(executions, 100);

    if (!success) {
      const errors = this.handlerErrors.get(handlerName)!;
      errors.push(Date.now());
      this.cleanupOldTimestamps(errors, 100);
    }

    this.updateHandlerStats(handlerName);
  }

  recordDLQMetrics(dlqMetrics: DLQMetrics): void {
    if (!this.config.enabled) return;
    this.dlqMetrics$.next(dlqMetrics);
  }

  recordIsolationMetrics(isolationMetrics: HandlerIsolationMetrics): void {
    if (!this.config.enabled) return;
    this.isolationMetrics$.next(isolationMetrics);
  }

  getSystemMetrics(): Observable<SystemMetrics> {
    return this.systemMetrics$.asObservable();
  }

  getCurrentSystemMetrics(): SystemMetrics {
    return this.systemMetrics$.value;
  }

  getEventStats(): Observable<EventStats> {
    return this.eventStats$.asObservable();
  }

  getStreamMetrics(): Observable<StreamMetrics> {
    return this.streamMetrics$.asObservable();
  }

  getHandlerStats(): Observable<Record<string, HandlerStats>> {
    return this.handlerStats$.asObservable();
  }

  // Legacy method for backward compatibility
  getMetrics(): EventMetrics {
    return {
      ...this.legacyMetrics,
      eventsByName: new Map(this.legacyMetrics.eventsByName),
    };
  }

  reset(): void {
    // Reset modern metrics
    this.eventStats$.next(this.createInitialEventStats());
    this.streamMetrics$.next(this.createInitialStreamMetrics());
    this.handlerStats$.next({});
    this.isolationMetrics$.next(this.createInitialIsolationMetrics());
    this.dlqMetrics$.next(this.createInitialDLQMetrics());
    this.systemMetrics$.next(this.createInitialSystemMetrics());

    // Clear tracking arrays
    this.processingTimes.length = 0;
    this.eventTimestamps.length = 0;
    this.errorTimestamps.length = 0;
    this.handlerExecutions.clear();
    this.handlerErrors.clear();

    // Reset legacy metrics
    this.legacyMetrics.totalEvents = 0;
    this.legacyMetrics.processedEvents = 0;
    this.legacyMetrics.failedEvents = 0;
    this.legacyMetrics.eventsByName.clear();
    this.legacyMetrics.averageProcessingTime = 0;
    this.legacyMetrics.lastProcessedAt = undefined;
    this.legacyProcessingTimes.length = 0;

    this.logger.log('All metrics reset');
  }

  logSummary(): void {
    const systemMetrics = this.systemMetrics$.value;
    const eventStats = systemMetrics.events;

    this.logger.log('=== Comprehensive System Metrics Summary ===');

    // Event metrics
    this.logger.log('EVENT PROCESSING:');
    this.logger.log(`  Total Emitted: ${eventStats.totalEmitted}`);
    this.logger.log(`  Total Processed: ${eventStats.totalProcessed}`);
    this.logger.log(`  Total Failed: ${eventStats.totalFailed}`);
    this.logger.log(`  Processing Rate: ${eventStats.processingRate.toFixed(2)} events/sec`);
    this.logger.log(`  Error Rate: ${eventStats.errorRate.toFixed(2)}%`);
    this.logger.log(`  Average Processing Time: ${eventStats.averageProcessingTime.toFixed(2)}ms`);

    // Stream metrics
    const streamMetrics = systemMetrics.streams;
    this.logger.log('STREAM PROCESSING:');
    this.logger.log(`  Buffer Size: ${streamMetrics.bufferSize}`);
    this.logger.log(`  Backpressure Active: ${streamMetrics.backpressureActive}`);
    this.logger.log(`  Throughput: ${streamMetrics.throughput.eventsPerSecond.toFixed(2)} events/sec`);
    this.logger.log(`  P95 Latency: ${streamMetrics.throughput.p95Latency.toFixed(2)}ms`);

    // System metrics
    const systemHealth = systemMetrics.system;
    this.logger.log('SYSTEM HEALTH:');
    this.logger.log(`  Health Score: ${systemMetrics.health.score}/100`);
    this.logger.log(`  Status: ${systemMetrics.health.status}`);
    this.logger.log(`  Memory Usage: ${systemHealth.memoryUsage.toFixed(2)}MB`);
    this.logger.log(`  CPU Usage: ${systemHealth.cpuUsage.toFixed(2)}%`);
    this.logger.log(`  Uptime: ${(systemHealth.uptime / 1000).toFixed(2)}s`);

    // Handler stats
    const handlerStats = systemMetrics.handlers;
    if (Object.keys(handlerStats).length > 0) {
      this.logger.log('HANDLER PERFORMANCE:');
      Object.entries(handlerStats).forEach(([name, stats]) => {
        this.logger.log(`  ${name}: ${stats.execution.totalExecutions} executions, ${stats.successRate.toFixed(1)}% success rate`);
      });
    }

    // DLQ metrics
    const dlq = systemMetrics.dlq;
    this.logger.log('DEAD LETTER QUEUE:');
    this.logger.log(`  Total Entries: ${dlq.totalEntries}`);
    this.logger.log(`  Health Status: ${dlq.healthStatus}`);

    // Alerts
    if (systemMetrics.health.alerts.length > 0) {
      this.logger.warn('ACTIVE ALERTS:');
      systemMetrics.health.alerts.forEach((alert) => {
        this.logger.warn(`  - ${alert}`);
      });
    }

    this.logger.log('==========================================');
  }

  // Private helper methods
  private createInitialEventStats(): EventStats {
    return {
      totalEmitted: 0,
      totalProcessed: 0,
      totalFailed: 0,
      averageProcessingTime: 0,
      currentlyProcessing: 0,
      retrying: 0,
      deadLettered: 0,
      processingRate: 0,
      errorRate: 0,
      retrySuccessRate: 0,
    };
  }

  private createInitialStreamMetrics(): StreamMetrics {
    return {
      bufferSize: 0,
      maxBufferSize: 0,
      droppedEvents: 0,
      warningThreshold: 1000,
      backpressureActive: false,
      throughput: {
        eventsPerSecond: 0,
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        maxLatency: 0,
      },
      health: {
        healthy: true,
        memoryPressure: 0,
        cpuUsage: 0,
        lastCheckAt: Date.now(),
      },
    };
  }

  private createInitialIsolationMetrics(): HandlerIsolationMetrics {
    return {
      totalPools: 0,
      activePools: 0,
      totalActiveExecutions: 0,
      totalQueuedTasks: 0,
      totalDroppedTasks: 0,
      averagePoolUtilization: 0,
      circuitBreakerStates: {},
      poolMetrics: new Map(),
      resourceUsage: {
        memoryUsage: 0,
        cpuUsage: 0,
        activeThreads: 0,
        availableResources: { memory: 1000, cpu: 100, threads: 100 },
        pressure: { memory: 'low', cpu: 'low', threads: 'low' },
      },
      isolation: {
        interferenceScore: 0,
        faultContainment: 1,
        sharingEfficiency: 0.8,
      },
    };
  }

  private createInitialDLQMetrics(): DLQMetrics {
    return {
      totalEntries: 0,
      successfulReprocessing: 0,
      failedReprocessing: 0,
      averageRetryTime: 0,
      currentlyProcessing: 0,
      scheduledForRetry: 0,
      permanentFailures: 0,
      healthStatus: 'healthy',
      policyStats: {},
    };
  }

  private createInitialSystemMetrics(): SystemMetrics {
    return {
      events: this.createInitialEventStats(),
      streams: this.createInitialStreamMetrics(),
      handlers: {},
      isolation: this.createInitialIsolationMetrics(),
      dlq: this.createInitialDLQMetrics(),
      system: {
        memoryUsage: 0,
        cpuUsage: 0,
        uptime: 0,
        eventRate: 0,
        errorRate: 0,
        lastUpdated: Date.now(),
      },
      health: {
        healthy: true,
        score: 100,
        lastCheck: Date.now(),
        alerts: [],
        status: 'healthy',
      },
    };
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.updateSystemMetrics();
    }, this.config.collectionIntervalMs);
  }

  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  private setupMetricsAggregation(): void {
    const subscription = combineLatest([this.eventStats$, this.streamMetrics$, this.handlerStats$, this.isolationMetrics$, this.dlqMetrics$])
      .pipe(
        takeUntil(this.shutdown$),
        map(([events, streams, handlers, isolation, dlq]) => {
          const systemMetrics: SystemMetrics = {
            events,
            streams,
            handlers,
            isolation,
            dlq,
            system: {
              memoryUsage: this.calculateMemoryUsage(),
              cpuUsage: this.calculateCPUUsage(),
              uptime: Date.now() - this.startTime,
              eventRate: events.processingRate,
              errorRate: events.errorRate,
              lastUpdated: Date.now(),
            },
            health: this.calculateHealth(events, streams, isolation, dlq),
          };
          return systemMetrics;
        }),
        distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
      )
      .subscribe((metrics) => {
        this.systemMetrics$.next(metrics);
      });

    this.subscriptions.add(subscription);
  }

  private updateHandlerStats(handlerName: string): void {
    const executions = this.handlerExecutions.get(handlerName) || [];
    const errors = this.handlerErrors.get(handlerName) || [];

    const totalExecutions = executions.length;
    const failedExecutions = errors.length;
    const successfulExecutions = totalExecutions - failedExecutions;
    const avgExecutionTime = executions.length > 0 ? executions.reduce((sum, time) => sum + time, 0) / executions.length : 0;
    const maxExecutionTime = executions.length > 0 ? Math.max(...executions) : 0;
    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 100;

    const stats: HandlerStats = {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageExecutionTime: avgExecutionTime,
      maxExecutionTime,
      lastExecutionAt: Date.now(),
      successRate,
      errorDistribution: {},
    };

    const current = this.handlerStats$.value;
    this.handlerStats$.next({
      ...current,
      [handlerName]: stats,
    });
  }

  private updateSystemMetrics(): void {
    const current = this.systemMetrics$.value;
    const updated: SystemMetrics = {
      ...current,
      system: {
        ...current.system,
        memoryUsage: this.calculateMemoryUsage(),
        cpuUsage: this.calculateCPUUsage(),
        uptime: Date.now() - this.startTime,
        lastUpdated: Date.now(),
      },
    };
    this.systemMetrics$.next(updated);
  }

  private performHealthCheck(): void {
    const metrics = this.systemMetrics$.value;
    const alerts: string[] = [];
    let score = 100;
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';

    // Check error rate
    if (metrics.events.errorRate > this.config.alertThresholds.errorRate) {
      alerts.push(`High error rate: ${metrics.events.errorRate.toFixed(2)}%`);
      score -= 20;
      status = 'degraded';
    }

    // Check memory usage
    if (metrics.system.memoryUsage > this.config.alertThresholds.memoryUsage) {
      alerts.push(`High memory usage: ${metrics.system.memoryUsage.toFixed(2)}MB`);
      score -= 15;
      if (status === 'healthy') status = 'degraded';
    }

    // Check DLQ health
    if (metrics.dlq.healthStatus !== 'healthy') {
      alerts.push(`Dead Letter Queue is ${metrics.dlq.healthStatus}`);
      score -= 10;
      if (metrics.dlq.healthStatus === 'critical') status = 'critical';
    }

    const health = {
      healthy: score >= 80,
      score: Math.max(0, score),
      lastCheck: Date.now(),
      alerts,
      status,
    };

    const updated = {
      ...metrics,
      health,
    };

    this.systemMetrics$.next(updated);
  }

  private calculateEventRate(timestamps: number[]): number {
    if (timestamps.length < 2) return 0;
    const now = Date.now();
    const recentEvents = timestamps.filter((ts) => now - ts < 60000); // Last minute
    return recentEvents.length / 60; // events per second
  }

  private calculateErrorRate(): number {
    const now = Date.now();
    const recentEvents = this.eventTimestamps.filter((ts) => now - ts < 60000);
    const recentErrors = this.errorTimestamps.filter((ts) => now - ts < 60000);
    return recentEvents.length > 0 ? (recentErrors.length / recentEvents.length) * 100 : 0;
  }

  private calculateMemoryUsage(): number {
    // Simplified memory calculation
    return process.memoryUsage().heapUsed / 1024 / 1024; // MB
  }

  private calculateCPUUsage(): number {
    // Simplified CPU calculation - would need actual CPU monitoring
    return Math.random() * 10; // Mock value
  }

  private calculateHealth(events: EventStats, streams: StreamMetrics, isolation: HandlerIsolationMetrics, dlq: DLQMetrics) {
    const alerts: string[] = [];
    let score = 100;
    let healthy = true;
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';

    if (events.errorRate > 5) {
      alerts.push('High error rate detected');
      score -= 20;
      healthy = false;
      status = 'degraded';
    }

    if (streams.backpressureActive) {
      alerts.push('Backpressure is active');
      score -= 15;
      if (status === 'healthy') status = 'degraded';
    }

    if (dlq.totalEntries > 100) {
      alerts.push('High number of failed events in DLQ');
      score -= 10;
    }

    return {
      healthy: score >= 80,
      score: Math.max(0, score),
      lastCheck: Date.now(),
      alerts,
      status,
    };
  }

  private cleanupOldTimestamps(array: number[], maxLength = 1000): void {
    const cutoff = Date.now() - this.config.retentionPeriodMs;

    // Remove old timestamps
    while (array.length > 0 && array[0] < cutoff) {
      array.shift();
    }

    // Limit array size
    while (array.length > maxLength) {
      array.shift();
    }
  }
}
