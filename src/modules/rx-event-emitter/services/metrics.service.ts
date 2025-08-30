/**
 * @fileoverview Metrics Service - Modern comprehensive metrics collection and monitoring
 * Provides real-time metrics, health monitoring, and performance analytics
 */

import { Injectable, Logger } from '@nestjs/common';
import { BehaviorSubject, Observable, interval, Subscription, combineLatest } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import { EventStats, StreamMetrics, HandlerStats, HandlerIsolationMetrics, MonitoringConfig, EventEmitterOptions, CircuitBreakerState } from '../interfaces';

/**
 * Comprehensive metrics aggregation interface
 */
export interface SystemMetrics {
  /** Event processing statistics */
  readonly events: EventStats;

  /** Stream processing metrics */
  readonly streams: StreamMetrics;

  /** Handler statistics by handler ID */
  readonly handlers: Readonly<Record<string, HandlerStats>>;

  /** Handler isolation and pool metrics */
  readonly isolation: HandlerIsolationMetrics;

  /** System resource utilization */
  readonly system: {
    /** Memory usage in MB */
    readonly memoryUsage: number;
    /** CPU usage percentage */
    readonly cpuUsage: number;
    /** Uptime in milliseconds */
    readonly uptime: number;
    /** Event processing rate (events/sec) */
    readonly eventRate: number;
    /** Error rate percentage */
    readonly errorRate: number;
  };

  /** Health status */
  readonly health: {
    /** Overall system health */
    readonly healthy: boolean;
    /** Health score (0-100) */
    readonly score: number;
    /** Last health check timestamp */
    readonly lastCheck: number;
    /** Active alerts */
    readonly alerts: readonly string[];
  };

  /** Collection timestamp */
  readonly timestamp: number;
}

/**
 * Modern metrics service with comprehensive monitoring capabilities
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  // Core metrics subjects
  private readonly eventStatsSubject = new BehaviorSubject<EventStats>({
    totalEmitted: 0,
    totalProcessed: 0,
    totalFailed: 0,
    averageProcessingTime: 0,
    lastEmittedAt: undefined,
    lastProcessedAt: undefined,
    currentlyProcessing: 0,
    retrying: 0,
    deadLettered: 0,
  });

  private readonly streamMetricsSubject = new BehaviorSubject<StreamMetrics>({
    bufferSize: 0,
    maxBufferSize: 1000,
    droppedEvents: 0,
    warningThreshold: 800,
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
  });

  private readonly handlerStatsSubject = new BehaviorSubject<Record<string, HandlerStats>>({});

  private readonly isolationMetricsSubject = new BehaviorSubject<HandlerIsolationMetrics>({
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
      availableResources: {
        memory: 0,
        cpu: 0,
        threads: 0,
      },
      pressure: {
        memory: 'low',
        cpu: 'low',
        threads: 'low',
      },
    },
    isolation: {
      interferenceScore: 0,
      faultContainment: 1,
      sharingEfficiency: 0.8,
    },
  });

  // Aggregated system metrics
  private readonly systemMetricsSubject = new BehaviorSubject<SystemMetrics>({
    events: this.eventStatsSubject.value,
    streams: this.streamMetricsSubject.value,
    handlers: {},
    isolation: this.isolationMetricsSubject.value,
    system: {
      memoryUsage: 0,
      cpuUsage: 0,
      uptime: 0,
      eventRate: 0,
      errorRate: 0,
    },
    health: {
      healthy: true,
      score: 100,
      lastCheck: Date.now(),
      alerts: [],
    },
    timestamp: Date.now(),
  });

  // Internal tracking
  private readonly latencyHistory: number[] = [];
  private readonly eventRateHistory: number[] = [];
  private readonly alertHistory: string[] = [];

  private startTime = Date.now();
  private metricsInterval?: Subscription;
  private healthCheckInterval?: Subscription;

  constructor(private readonly options: EventEmitterOptions) {
    this.initializeMetrics();
  }

  /**
   * Initialize metrics collection and monitoring
   */
  private initializeMetrics(): void {
    const monitoringConfig = this.options.monitoring;

    if (!monitoringConfig?.enabled) {
      this.logger.debug('Metrics collection disabled');
      return;
    }

    // Start periodic metrics aggregation
    this.metricsInterval = interval(1000) // Every second
      .subscribe(() => this.aggregateMetrics());

    // Start health checks
    this.healthCheckInterval = interval(5000) // Every 5 seconds
      .subscribe(() => this.performHealthCheck());

    this.logger.debug('Metrics service initialized');
  }

  /**
   * Get real-time system metrics observable
   */
  getSystemMetrics(): Observable<SystemMetrics> {
    return this.systemMetricsSubject.asObservable();
  }

  /**
   * Get current system metrics snapshot
   */
  getCurrentMetrics(): SystemMetrics {
    return this.systemMetricsSubject.value;
  }

  /**
   * Get event statistics observable
   */
  getEventStats(): Observable<EventStats> {
    return this.eventStatsSubject.asObservable();
  }

  /**
   * Get stream metrics observable
   */
  getStreamMetrics(): Observable<StreamMetrics> {
    return this.streamMetricsSubject.asObservable();
  }

  /**
   * Get handler statistics observable
   */
  getHandlerStats(): Observable<Record<string, HandlerStats>> {
    return this.handlerStatsSubject.asObservable();
  }

  /**
   * Get isolation metrics observable
   */
  getIsolationMetrics(): Observable<HandlerIsolationMetrics> {
    return this.isolationMetricsSubject.asObservable();
  }

  /**
   * Update event statistics
   */
  updateEventStats(update: Partial<EventStats>): void {
    const current = this.eventStatsSubject.value;
    this.eventStatsSubject.next({ ...current, ...update });
  }

  /**
   * Record event emission
   */
  recordEventEmission(): void {
    const current = this.eventStatsSubject.value;
    this.eventStatsSubject.next({
      ...current,
      totalEmitted: current.totalEmitted + 1,
      lastEmittedAt: Date.now(),
    });
  }

  /**
   * Record event processing completion
   */
  recordEventProcessed(processingTime: number, success: boolean): void {
    const current = this.eventStatsSubject.value;

    // Update latency history
    this.latencyHistory.push(processingTime);
    if (this.latencyHistory.length > 1000) {
      this.latencyHistory.shift(); // Keep last 1000 samples
    }

    // Calculate new average processing time
    const totalProcessed = success ? current.totalProcessed + 1 : current.totalProcessed;
    const totalFailed = success ? current.totalFailed : current.totalFailed + 1;
    const newAvg = success ? (current.averageProcessingTime * current.totalProcessed + processingTime) / totalProcessed : current.averageProcessingTime;

    this.eventStatsSubject.next({
      ...current,
      totalProcessed,
      totalFailed,
      averageProcessingTime: newAvg,
      lastProcessedAt: Date.now(),
      currentlyProcessing: Math.max(0, current.currentlyProcessing - 1),
    });
  }

  /**
   * Record event processing start
   */
  recordEventProcessingStart(): void {
    const current = this.eventStatsSubject.value;
    this.eventStatsSubject.next({
      ...current,
      currentlyProcessing: current.currentlyProcessing + 1,
    });
  }

  /**
   * Update stream metrics
   */
  updateStreamMetrics(update: Partial<StreamMetrics>): void {
    const current = this.streamMetricsSubject.value;
    this.streamMetricsSubject.next({ ...current, ...update });
  }

  /**
   * Record buffer state change
   */
  recordBufferState(size: number, maxSize?: number, dropped?: number): void {
    const current = this.streamMetricsSubject.value;

    this.streamMetricsSubject.next({
      ...current,
      bufferSize: size,
      maxBufferSize: maxSize || current.maxBufferSize,
      droppedEvents: dropped !== undefined ? current.droppedEvents + dropped : current.droppedEvents,
      backpressureActive: size >= current.warningThreshold,
    });
  }

  /**
   * Update handler statistics
   */
  updateHandlerStats(handlerId: string, stats: HandlerStats): void {
    const current = this.handlerStatsSubject.value;
    this.handlerStatsSubject.next({
      ...current,
      [handlerId]: stats,
    });
  }

  /**
   * Update isolation metrics
   */
  updateIsolationMetrics(metrics: HandlerIsolationMetrics): void {
    this.isolationMetricsSubject.next(metrics);
  }

  /**
   * Get metrics for specific handler
   */
  getHandlerMetrics(handlerId: string): HandlerStats | undefined {
    return this.handlerStatsSubject.value[handlerId];
  }

  /**
   * Get health status
   */
  getHealthStatus(): Observable<{
    healthy: boolean;
    score: number;
    alerts: readonly string[];
    checks: Record<string, boolean>;
  }> {
    return this.systemMetricsSubject.pipe(
      map((metrics) => ({
        healthy: metrics.health.healthy,
        score: metrics.health.score,
        alerts: metrics.health.alerts,
        checks: this.getHealthChecks(metrics),
      })),
      distinctUntilChanged((prev, curr) => prev.healthy === curr.healthy && prev.score === curr.score && prev.alerts.length === curr.alerts.length),
    );
  }

  /**
   * Aggregate all metrics into system metrics
   */
  private aggregateMetrics(): void {
    const events = this.eventStatsSubject.value;
    const streams = this.streamMetricsSubject.value;
    const handlers = this.handlerStatsSubject.value;
    const isolation = this.isolationMetricsSubject.value;

    // Calculate event rate
    this.eventRateHistory.push(events.totalProcessed);
    if (this.eventRateHistory.length > 60) {
      this.eventRateHistory.shift(); // Keep last 60 seconds
    }

    const eventRate = this.eventRateHistory.length >= 2 ? this.eventRateHistory[this.eventRateHistory.length - 1] - this.eventRateHistory[0] : 0;

    // Calculate error rate
    const totalEvents = events.totalProcessed + events.totalFailed;
    const errorRate = totalEvents > 0 ? (events.totalFailed / totalEvents) * 100 : 0;

    // Update system metrics
    const systemMetrics: SystemMetrics = {
      events,
      streams: {
        ...streams,
        throughput: {
          ...streams.throughput,
          eventsPerSecond: eventRate,
          averageLatency: this.calculateAverageLatency(),
          p95Latency: this.calculatePercentileLatency(95),
          p99Latency: this.calculatePercentileLatency(99),
          maxLatency: Math.max(...this.latencyHistory, 0),
        },
        health: {
          ...streams.health,
          memoryPressure: this.getMemoryPressure(),
          cpuUsage: this.getCpuUsage(),
          lastCheckAt: Date.now(),
        },
      },
      handlers,
      isolation,
      system: {
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
        cpuUsage: this.getCpuUsage(),
        uptime: Date.now() - this.startTime,
        eventRate,
        errorRate,
      },
      health: this.calculateHealthStatus(events, streams, isolation, errorRate),
      timestamp: Date.now(),
    };

    this.systemMetricsSubject.next(systemMetrics);
  }

  /**
   * Calculate average latency from history
   */
  private calculateAverageLatency(): number {
    if (this.latencyHistory.length === 0) return 0;
    return this.latencyHistory.reduce((sum, lat) => sum + lat, 0) / this.latencyHistory.length;
  }

  /**
   * Calculate percentile latency
   */
  private calculatePercentileLatency(percentile: number): number {
    if (this.latencyHistory.length === 0) return 0;

    const sorted = [...this.latencyHistory].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get memory pressure indicator
   */
  private getMemoryPressure(): number {
    const memoryUsage = process.memoryUsage();
    const used = memoryUsage.heapUsed;
    const total = memoryUsage.heapTotal;
    return (used / total) * 100;
  }

  /**
   * Get CPU usage (simplified)
   */
  private getCpuUsage(): number {
    const cpuUsage = process.cpuUsage();
    // Simplified CPU usage calculation
    return (cpuUsage.user + cpuUsage.system) / 10000; // Convert to percentage approximation
  }

  /**
   * Calculate overall health status
   */
  private calculateHealthStatus(
    events: EventStats,
    streams: StreamMetrics,
    isolation: HandlerIsolationMetrics,
    errorRate: number,
  ): {
    healthy: boolean;
    score: number;
    lastCheck: number;
    alerts: readonly string[];
  } {
    const alerts: string[] = [];
    let score = 100;

    // Check error rate
    if (errorRate > 10) {
      alerts.push(`High error rate: ${errorRate.toFixed(1)}%`);
      score -= 20;
    } else if (errorRate > 5) {
      alerts.push(`Elevated error rate: ${errorRate.toFixed(1)}%`);
      score -= 10;
    }

    // Check buffer pressure
    if (streams.backpressureActive) {
      alerts.push('Backpressure active');
      score -= 15;
    }

    // Check memory pressure
    const memoryPressure = this.getMemoryPressure();
    if (memoryPressure > 90) {
      alerts.push('Critical memory usage');
      score -= 25;
    } else if (memoryPressure > 75) {
      alerts.push('High memory usage');
      score -= 10;
    }

    // Check circuit breakers
    const openCircuitBreakers = Object.values(isolation.circuitBreakerStates).filter((state) => state === CircuitBreakerState.OPEN).length;

    if (openCircuitBreakers > 0) {
      alerts.push(`${openCircuitBreakers} circuit breaker(s) open`);
      score -= openCircuitBreakers * 5;
    }

    // Check processing backlog
    if (events.currentlyProcessing > 100) {
      alerts.push('High processing backlog');
      score -= 10;
    }

    return {
      healthy: score > 70 && alerts.length === 0,
      score: Math.max(0, score),
      lastCheck: Date.now(),
      alerts,
    };
  }

  /**
   * Get detailed health checks
   */
  private getHealthChecks(metrics: SystemMetrics): Record<string, boolean> {
    return {
      eventProcessing: metrics.system.errorRate < 5,
      memoryUsage: metrics.system.memoryUsage < 512, // Less than 512MB
      bufferHealth: !metrics.streams.backpressureActive,
      circuitBreakers: Object.values(metrics.isolation.circuitBreakerStates).every((state) => state !== CircuitBreakerState.OPEN),
      processingBacklog: metrics.events.currentlyProcessing < 50,
      throughput: metrics.streams.throughput.eventsPerSecond > 0,
    };
  }

  /**
   * Perform periodic health check
   */
  private performHealthCheck(): void {
    const currentMetrics = this.systemMetricsSubject.value;

    // Log health status
    if (!currentMetrics.health.healthy) {
      this.logger.warn(`System health degraded: Score ${currentMetrics.health.score}/100`, {
        alerts: currentMetrics.health.alerts,
      });
    }

    // Check for critical conditions
    if (currentMetrics.health.score < 50) {
      this.logger.error('Critical system health detected', {
        score: currentMetrics.health.score,
        alerts: currentMetrics.health.alerts,
      });
    }
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(): Record<string, unknown> {
    const metrics = this.systemMetricsSubject.value;

    return {
      // Prometheus-style metrics
      event_emitter_events_total: metrics.events.totalEmitted,
      event_emitter_events_processed: metrics.events.totalProcessed,
      event_emitter_events_failed: metrics.events.totalFailed,
      event_emitter_events_processing: metrics.events.currentlyProcessing,
      event_emitter_processing_duration_seconds: metrics.events.averageProcessingTime / 1000,
      event_emitter_buffer_size: metrics.streams.bufferSize,
      event_emitter_buffer_max: metrics.streams.maxBufferSize,
      event_emitter_dropped_events: metrics.streams.droppedEvents,
      event_emitter_throughput_events_per_second: metrics.streams.throughput.eventsPerSecond,
      event_emitter_memory_usage_mb: metrics.system.memoryUsage,
      event_emitter_cpu_usage_percent: metrics.system.cpuUsage,
      event_emitter_health_score: metrics.health.score,
      event_emitter_healthy: metrics.health.healthy ? 1 : 0,
      event_emitter_uptime_seconds: metrics.system.uptime / 1000,
    };
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.eventStatsSubject.next({
      totalEmitted: 0,
      totalProcessed: 0,
      totalFailed: 0,
      averageProcessingTime: 0,
      lastEmittedAt: undefined,
      lastProcessedAt: undefined,
      currentlyProcessing: 0,
      retrying: 0,
      deadLettered: 0,
    });

    this.streamMetricsSubject.next({
      bufferSize: 0,
      maxBufferSize: 1000,
      droppedEvents: 0,
      warningThreshold: 800,
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
    });

    this.handlerStatsSubject.next({});

    this.latencyHistory.length = 0;
    this.eventRateHistory.length = 0;
    this.alertHistory.length = 0;

    this.startTime = Date.now();

    this.logger.debug('Metrics reset');
  }

  /**
   * Cleanup metrics service
   */
  cleanup(): void {
    if (this.metricsInterval) {
      this.metricsInterval.unsubscribe();
    }

    if (this.healthCheckInterval) {
      this.healthCheckInterval.unsubscribe();
    }

    // Complete all subjects
    this.eventStatsSubject.complete();
    this.streamMetricsSubject.complete();
    this.handlerStatsSubject.complete();
    this.isolationMetricsSubject.complete();
    this.systemMetricsSubject.complete();

    this.logger.debug('Metrics service cleanup completed');
  }
}
