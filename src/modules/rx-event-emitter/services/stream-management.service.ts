/**
 * Stream Management Service - Advanced RxJS stream lifecycle management and optimization
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, Optional } from '@nestjs/common';
import { BehaviorSubject, Observable, Subject, Subscription, timer, EMPTY, throwError } from 'rxjs';
import {
  takeUntil,
  catchError,
  retry,
  debounceTime,
  throttleTime,
  bufferTime,
  bufferCount,
  mergeMap,
  concatMap,
  switchMap,
  exhaustMap,
  share,
  filter,
  tap,
  finalize,
} from 'rxjs/operators';
import { StreamMetrics, EVENT_EMITTER_OPTIONS } from '../interfaces';

/**
 * Stream configuration options
 */
export interface StreamConfig {
  readonly enabled: boolean;
  readonly backpressure: {
    readonly enabled: boolean;
    readonly strategy: BackpressureStrategy;
    readonly bufferSize: number;
    readonly dropStrategy: DropStrategy;
    readonly warningThreshold: number;
  };
  readonly batching: {
    readonly enabled: boolean;
    readonly timeWindow: number;
    readonly maxSize: number;
    readonly dynamicSizing: boolean;
  };
  readonly concurrency: {
    readonly maxConcurrent: number;
    readonly strategy: ConcurrencyStrategy;
    readonly queueSize: number;
  };
  readonly errorHandling: {
    readonly strategy: ErrorStrategy;
    readonly maxRetries: number;
    readonly retryDelay: number;
    readonly exponentialBackoff: boolean;
  };
  readonly monitoring: {
    readonly enabled: boolean;
    readonly metricsInterval: number;
    readonly healthCheckInterval: number;
  };
}

/**
 * Backpressure strategies
 */
export enum BackpressureStrategy {
  DROP_OLDEST = 'drop_oldest',
  DROP_NEWEST = 'drop_newest',
  BUFFER = 'buffer',
  THROTTLE = 'throttle',
  DEBOUNCE = 'debounce',
}

/**
 * Drop strategies for overflow
 */
export enum DropStrategy {
  HEAD = 'head', // Drop from beginning
  TAIL = 'tail', // Drop from end
  RANDOM = 'random', // Drop random items
  PRIORITY = 'priority', // Drop by priority
}

/**
 * Concurrency strategies
 */
export enum ConcurrencyStrategy {
  MERGE = 'merge', // Process all in parallel
  CONCAT = 'concat', // Process sequentially
  SWITCH = 'switch', // Cancel previous on new
  EXHAUST = 'exhaust', // Ignore new while processing
}

/**
 * Error handling strategies
 */
export enum ErrorStrategy {
  IGNORE = 'ignore', // Continue processing
  RETRY = 'retry', // Retry failed operations
  CIRCUIT_BREAKER = 'circuit_breaker', // Stop on repeated failures
  DEAD_LETTER = 'dead_letter', // Send to DLQ
}

/**
 * Stream instance information
 */
export interface ManagedStream {
  readonly id: string;
  readonly name: string;
  readonly type: StreamType;
  readonly source: Observable<unknown>;
  readonly subscription: Subscription;
  readonly config: StreamConfig;
  readonly createdAt: number;
  readonly lastActivityAt: number;
  readonly metrics: StreamInstanceMetrics;
}

/**
 * Stream types
 */
export enum StreamType {
  EVENT_BUS = 'event_bus',
  HANDLER_STREAM = 'handler_stream',
  METRICS_STREAM = 'metrics_stream',
  MONITORING_STREAM = 'monitoring_stream',
  CUSTOM = 'custom',
}

/**
 * Stream instance metrics
 */
export interface StreamInstanceMetrics {
  readonly itemsProcessed: number;
  readonly itemsDropped: number;
  readonly errors: number;
  readonly avgProcessingTime: number;
  readonly lastProcessedAt?: number;
  readonly bufferSize: number;
  readonly backpressureEvents: number;
}

/**
 * Stream health status
 */
export interface StreamHealth {
  readonly streamId: string;
  readonly healthy: boolean;
  readonly status: 'active' | 'stalled' | 'errored' | 'overloaded';
  readonly issues: string[];
  readonly recommendations: string[];
  readonly lastHealthCheck: number;
}

@Injectable()
export class StreamManagementService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StreamManagementService.name);

  private readonly shutdown$ = new Subject<void>();
  private readonly managedStreams = new Map<string, ManagedStream>();
  private readonly streamHealth = new Map<string, StreamHealth>();

  private readonly metrics$: BehaviorSubject<StreamMetrics>;
  private readonly streamUpdates$ = new Subject<{ action: 'created' | 'destroyed' | 'error'; streamId: string; details?: unknown }>();

  private metricsTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  private readonly config: Required<StreamConfig>;
  private totalItemsProcessed = 0;
  private totalItemsDropped = 0;
  private totalErrors = 0;

  constructor(@Optional() @Inject(EVENT_EMITTER_OPTIONS) private readonly options: Record<string, unknown> = {}) {
    // Create default configuration
    const defaultConfig: Required<StreamConfig> = {
      enabled: true,
      backpressure: {
        enabled: true,
        strategy: BackpressureStrategy.BUFFER,
        bufferSize: 1000,
        dropStrategy: DropStrategy.TAIL,
        warningThreshold: 800,
      },
      batching: {
        enabled: true,
        timeWindow: 100,
        maxSize: 50,
        dynamicSizing: true,
      },
      concurrency: {
        maxConcurrent: 10,
        strategy: ConcurrencyStrategy.MERGE,
        queueSize: 100,
      },
      errorHandling: {
        strategy: ErrorStrategy.RETRY,
        maxRetries: 3,
        retryDelay: 1000,
        exponentialBackoff: true,
      },
      monitoring: {
        enabled: true,
        metricsInterval: 5000,
        healthCheckInterval: 30000,
      },
    };

    // Deep merge user configuration with defaults
    const userStreamConfig = (this.options?.streamManagement as Partial<StreamConfig>) || {};
    this.config = this.deepMergeConfig(defaultConfig, userStreamConfig);

    // Initialize metrics$ after config is set
    this.metrics$ = new BehaviorSubject<StreamMetrics>(this.createInitialMetrics());
  }

  /**
   * Deep merge configuration objects to properly handle nested structures
   */
  private deepMergeConfig(defaultConfig: Required<StreamConfig>, userConfig: Partial<StreamConfig>): Required<StreamConfig> {
    const result = { ...defaultConfig };

    // Deep merge each nested configuration section
    if (userConfig.backpressure) {
      result.backpressure = { ...defaultConfig.backpressure, ...userConfig.backpressure };
    }
    if (userConfig.batching) {
      result.batching = { ...defaultConfig.batching, ...userConfig.batching };
    }
    if (userConfig.concurrency) {
      result.concurrency = { ...defaultConfig.concurrency, ...userConfig.concurrency };
    }
    if (userConfig.errorHandling) {
      result.errorHandling = { ...defaultConfig.errorHandling, ...userConfig.errorHandling };
    }
    if (userConfig.monitoring) {
      result.monitoring = { ...defaultConfig.monitoring, ...userConfig.monitoring };
    }

    // Merge top-level properties
    if (userConfig.enabled !== undefined) {
      result.enabled = userConfig.enabled;
    }

    return result;
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.log('Stream management is disabled');
      return;
    }

    this.logger.log('Initializing Stream Management Service...');

    this.startMetricsCollection();
    this.startHealthMonitoring();
    this.startPeriodicCleanup();

    this.logger.log('Stream Management Service initialized successfully');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down Stream Management Service...');

    this.shutdown$.next();
    this.shutdown$.complete();

    // Clear timers
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);

    // Unsubscribe from all managed streams
    this.managedStreams.forEach((stream) => {
      stream.subscription.unsubscribe();
    });
    this.managedStreams.clear();

    this.logger.log('Stream Management Service shutdown completed');
  }

  /**
   * Create a managed stream with enhanced features
   */
  createManagedStream<T>(name: string, source: Observable<T>, type: StreamType = StreamType.CUSTOM, config?: Partial<StreamConfig>): Observable<T> {
    const streamId = `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const streamConfig = { ...this.config, ...config };

    // Handle null or undefined sources by returning EMPTY
    if (!source) {
      this.logger.warn(`Null or undefined source provided for stream ${streamId}, returning EMPTY`);
      return EMPTY;
    }

    // Return source stream directly when disabled
    if (!this.config.enabled) {
      return source;
    }

    let enhancedStream = source.pipe(
      takeUntil(this.shutdown$),
      tap(() => this.recordStreamActivity(streamId)),
      catchError((error) => this.handleStreamError(streamId, error)),
    );

    // Apply backpressure handling
    if (streamConfig.backpressure.enabled) {
      enhancedStream = this.applyBackpressure(enhancedStream, streamConfig);
    }

    // Apply batching if enabled
    if (streamConfig.batching.enabled) {
      enhancedStream = this.applyBatching(enhancedStream, streamConfig);
    }

    // Apply concurrency control
    enhancedStream = this.applyConcurrencyControl(enhancedStream, streamConfig);

    // Apply error handling
    enhancedStream = this.applyErrorHandling(enhancedStream, streamConfig);

    // Apply monitoring
    if (streamConfig.monitoring.enabled) {
      enhancedStream = this.applyMonitoring(enhancedStream, streamId);
    }

    // Share the stream to prevent multiple subscriptions
    enhancedStream = enhancedStream.pipe(
      share(),
      finalize(() => this.handleStreamCompletion(streamId)),
    );

    const subscription = enhancedStream.subscribe({
      error: (error) => this.handleStreamError(streamId, error),
    });

    const managedStream: ManagedStream = {
      id: streamId,
      name,
      type,
      source,
      subscription,
      config: streamConfig,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      metrics: {
        itemsProcessed: 0,
        itemsDropped: 0,
        errors: 0,
        avgProcessingTime: 0,
        bufferSize: 0,
        backpressureEvents: 0,
      },
    };

    this.managedStreams.set(streamId, managedStream);

    // Initialize stream health
    const initialHealth: StreamHealth = {
      streamId,
      healthy: true,
      status: 'active',
      issues: [],
      recommendations: [],
      lastHealthCheck: Date.now(),
    };
    this.streamHealth.set(streamId, initialHealth);

    this.streamUpdates$.next({ action: 'created', streamId });

    this.logger.debug(`Created managed stream: ${name} (${streamId})`);

    return enhancedStream;
  }

  /**
   * Destroy a managed stream
   */
  destroyManagedStream(streamId: string): boolean {
    const stream = this.managedStreams.get(streamId);
    if (!stream) {
      return false;
    }

    stream.subscription.unsubscribe();
    this.managedStreams.delete(streamId);
    this.streamHealth.delete(streamId);

    this.streamUpdates$.next({ action: 'destroyed', streamId });
    this.logger.debug(`Destroyed managed stream: ${streamId}`);

    return true;
  }

  /**
   * Get all managed streams
   */
  getManagedStreams(): ManagedStream[] {
    return Array.from(this.managedStreams.values());
  }

  /**
   * Get stream by ID
   */
  getManagedStream(streamId: string): ManagedStream | undefined {
    return this.managedStreams.get(streamId);
  }

  /**
   * Get stream health information
   */
  getStreamHealth(streamId: string): StreamHealth | undefined {
    return this.streamHealth.get(streamId);
  }

  /**
   * Get all stream health information
   */
  getAllStreamHealth(): StreamHealth[] {
    return Array.from(this.streamHealth.values());
  }

  /**
   * Get stream metrics observable
   */
  getMetrics(): Observable<StreamMetrics> {
    return this.metrics$.asObservable();
  }

  /**
   * Get current stream metrics
   */
  getCurrentMetrics(): StreamMetrics {
    return this.metrics$.value;
  }

  /**
   * Get stream updates observable
   */
  getStreamUpdates(): Observable<{ action: 'created' | 'destroyed' | 'error'; streamId: string; details?: unknown }> {
    return this.streamUpdates$.asObservable();
  }

  /**
   * Pause a stream
   */
  pauseStream(streamId: string): boolean {
    const stream = this.managedStreams.get(streamId);
    if (!stream) return false;

    stream.subscription.unsubscribe();
    this.logger.debug(`Paused stream: ${streamId}`);
    return true;
  }

  /**
   * Get stream statistics
   */
  getStreamStatistics(): {
    totalStreams: number;
    activeStreams: number;
    totalItemsProcessed: number;
    totalItemsDropped: number;
    totalErrors: number;
    averageStreamAge: number;
  } {
    const streams = this.getManagedStreams();
    const now = Date.now();

    return {
      totalStreams: streams.length,
      activeStreams: streams.filter((s) => !s.subscription.closed).length,
      totalItemsProcessed: this.totalItemsProcessed,
      totalItemsDropped: this.totalItemsDropped,
      totalErrors: this.totalErrors,
      averageStreamAge: streams.length > 0 ? streams.reduce((sum, s) => sum + (now - s.createdAt), 0) / streams.length : 0,
    };
  }

  // Private methods

  private applyBackpressure<T>(stream: Observable<T>, config: StreamConfig): Observable<T> {
    switch (config.backpressure.strategy) {
      case BackpressureStrategy.THROTTLE:
        return stream.pipe(throttleTime(100));

      case BackpressureStrategy.DEBOUNCE:
        return stream.pipe(debounceTime(100));

      case BackpressureStrategy.BUFFER:
        // Simple buffer strategy - in production would need more sophisticated buffering
        return stream;

      default:
        return stream;
    }
  }

  private applyBatching<T>(stream: Observable<T>, config: StreamConfig): Observable<T> {
    if (config.batching.dynamicSizing) {
      return stream.pipe(
        bufferTime(config.batching.timeWindow, null, config.batching.maxSize),
        filter((batch) => batch.length > 0),
        mergeMap((batch) => batch),
      );
    } else {
      return stream.pipe(
        bufferCount(config.batching.maxSize),
        mergeMap((batch) => batch),
      );
    }
  }

  private applyConcurrencyControl<T>(stream: Observable<T>, config: StreamConfig): Observable<T> {
    const processor = (item: T) => this.processStreamItem(item);

    switch (config.concurrency.strategy) {
      case ConcurrencyStrategy.MERGE:
        return stream.pipe(mergeMap(processor, config.concurrency.maxConcurrent));

      case ConcurrencyStrategy.CONCAT:
        return stream.pipe(concatMap(processor));

      case ConcurrencyStrategy.SWITCH:
        return stream.pipe(switchMap(processor));

      case ConcurrencyStrategy.EXHAUST:
        return stream.pipe(exhaustMap(processor));

      default:
        return stream.pipe(mergeMap(processor, config.concurrency.maxConcurrent));
    }
  }

  private applyErrorHandling<T>(stream: Observable<T>, config: StreamConfig): Observable<T> {
    switch (config.errorHandling.strategy) {
      case ErrorStrategy.RETRY:
        if (config.errorHandling.exponentialBackoff) {
          return stream.pipe(
            retry({
              count: config.errorHandling.maxRetries,
              delay: (error, retryCount) => {
                this.logger.warn(`Stream retry ${retryCount}:`, error);
                return timer(config.errorHandling.retryDelay * Math.pow(2, retryCount - 1));
              },
            }),
          );
        } else {
          return stream.pipe(
            retry(config.errorHandling.maxRetries),
            catchError((error) => {
              this.logger.error('Stream failed after retries:', error);
              return EMPTY;
            }),
          );
        }

      case ErrorStrategy.IGNORE:
        return stream.pipe(
          catchError((error) => {
            this.logger.debug('Stream error ignored:', error);
            return EMPTY;
          }),
        );

      case ErrorStrategy.CIRCUIT_BREAKER:
        // Simplified circuit breaker - would need full implementation
        return stream.pipe(
          catchError((error: Error) => {
            this.logger.error('Stream circuit breaker triggered:', error);
            return throwError(() => error);
          }),
        );

      default:
        return stream;
    }
  }

  private applyMonitoring<T>(stream: Observable<T>, streamId: string): Observable<T> {
    return stream.pipe(
      tap({
        next: () => this.recordStreamMetric(streamId, 'processed'),
        error: () => this.recordStreamMetric(streamId, 'error'),
        complete: () => this.recordStreamMetric(streamId, 'completed'),
      }),
    );
  }

  private async processStreamItem<T>(item: T): Promise<T> {
    // Default processing - just pass through
    // In real implementation, this would be customizable
    return Promise.resolve(item);
  }

  private handleStreamError(streamId: string, error: unknown): Observable<never> {
    this.logger.error(`Stream ${streamId} error:`, error);
    this.recordStreamMetric(streamId, 'error');
    this.streamUpdates$.next({ action: 'error', streamId, details: error });

    // Update health status for errored stream
    const health = this.streamHealth.get(streamId);
    if (health) {
      const updatedHealth: StreamHealth = {
        ...health,
        healthy: false,
        status: 'errored',
        issues: [...health.issues, `Stream error: ${error}`],
        recommendations: [...health.recommendations, 'Check error handling and stream source'],
        lastHealthCheck: Date.now(),
      };
      this.streamHealth.set(streamId, updatedHealth);
    }

    return EMPTY;
  }

  private handleStreamCompletion(streamId: string): void {
    this.logger.debug(`Stream ${streamId} completed`);
    this.managedStreams.delete(streamId);

    // Keep health information but mark stream as completed
    const health = this.streamHealth.get(streamId);
    if (health) {
      const updatedHealth: StreamHealth = {
        ...health,
        status: health.status === 'errored' ? 'errored' : 'stalled', // Keep errored status or mark as stalled if completed
        lastHealthCheck: Date.now(),
      };
      this.streamHealth.set(streamId, updatedHealth);
    }
  }

  private recordStreamActivity(streamId: string): void {
    const stream = this.managedStreams.get(streamId);
    if (stream) {
      (stream as { lastActivityAt: number }).lastActivityAt = Date.now();
    }
  }

  private recordStreamMetric(streamId: string, type: 'processed' | 'dropped' | 'error' | 'completed'): void {
    const stream = this.managedStreams.get(streamId);
    if (!stream) return;

    // Cast to mutable version to update metrics
    const metrics = stream.metrics as {
      itemsProcessed: number;
      itemsDropped: number;
      errors: number;
      avgProcessingTime: number;
      lastProcessedAt?: number;
      bufferSize: number;
      backpressureEvents: number;
    };

    switch (type) {
      case 'processed':
        metrics.itemsProcessed++;
        this.totalItemsProcessed++;
        metrics.lastProcessedAt = Date.now();
        break;
      case 'dropped':
        metrics.itemsDropped++;
        this.totalItemsDropped++;
        break;
      case 'error':
        metrics.errors++;
        this.totalErrors++;
        break;
      case 'completed':
        // Stream completed - just update the last processed time
        metrics.lastProcessedAt = Date.now();
        break;
    }
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.updateGlobalMetrics();
    }, this.config.monitoring.metricsInterval);
  }

  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.monitoring.healthCheckInterval);
  }

  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupDeadStreams();
    }, 60000); // Every minute
  }

  private updateGlobalMetrics(): void {
    const streams = this.getManagedStreams();
    const now = Date.now();

    let totalBufferSize = 0;
    let _totalProcessed = 0;
    let totalDropped = 0;
    let totalBackpressureEvents = 0;
    let maxLatency = 0;
    let _recentActivity = 0;

    streams.forEach((stream) => {
      totalBufferSize += stream.metrics.bufferSize;
      _totalProcessed += stream.metrics.itemsProcessed;
      totalDropped += stream.metrics.itemsDropped;
      totalBackpressureEvents += stream.metrics.backpressureEvents;

      if (stream.metrics.avgProcessingTime > maxLatency) {
        maxLatency = stream.metrics.avgProcessingTime;
      }

      if (now - stream.lastActivityAt < 60000) {
        // Active in last minute
        _recentActivity++;
      }
    });

    const metrics: StreamMetrics = {
      bufferSize: totalBufferSize,
      maxBufferSize: Math.max(totalBufferSize, this.metrics$.value.maxBufferSize),
      droppedEvents: totalDropped,
      warningThreshold: this.config.backpressure.warningThreshold,
      backpressureActive: totalBackpressureEvents > 0,
      throughput: {
        eventsPerSecond: this.calculateThroughput(),
        averageLatency: this.calculateAverageLatency(streams),
        p95Latency: maxLatency * 0.95, // Simplified
        p99Latency: maxLatency * 0.99, // Simplified
        maxLatency,
      },
      health: {
        healthy: this.isSystemHealthy(streams),
        memoryPressure: this.calculateMemoryPressure(streams),
        cpuUsage: this.calculateCpuUsage(), // Simplified
        lastCheckAt: now,
      },
    };

    this.metrics$.next(metrics);
  }

  private performHealthChecks(): void {
    const now = Date.now();

    this.managedStreams.forEach((stream, streamId) => {
      const issues: string[] = [];
      const recommendations: string[] = [];

      // Check for stalled streams
      if (now - stream.lastActivityAt > 300000) {
        // 5 minutes
        issues.push('Stream has been inactive for over 5 minutes');
        recommendations.push('Check if the stream source is still producing data');
      }

      // Check for high error rates
      if (stream.metrics.errors > 10) {
        issues.push('High error rate detected');
        recommendations.push('Review error handling configuration');
      }

      // Check buffer size
      if (stream.metrics.bufferSize > this.config.backpressure.warningThreshold) {
        issues.push('Buffer size approaching limit');
        recommendations.push('Consider increasing concurrency or buffer size');
      }

      const healthy = issues.length === 0;
      let status: 'active' | 'stalled' | 'errored' | 'overloaded' = 'active';

      if (now - stream.lastActivityAt > 300000) {
        status = 'stalled';
      } else if (stream.metrics.errors > 10) {
        status = 'errored';
      } else if (stream.metrics.bufferSize > this.config.backpressure.warningThreshold) {
        status = 'overloaded';
      }

      const health: StreamHealth = {
        streamId,
        healthy,
        status,
        issues,
        recommendations,
        lastHealthCheck: now,
      };

      this.streamHealth.set(streamId, health);
    });
  }

  private cleanupDeadStreams(): void {
    let cleanedCount = 0;

    this.managedStreams.forEach((stream, streamId) => {
      if (stream.subscription.closed) {
        this.managedStreams.delete(streamId);
        this.streamHealth.delete(streamId);
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} dead streams`);
    }
  }

  private calculateThroughput(): number {
    // Simple throughput calculation - would need more sophisticated tracking
    const recentActivity = Array.from(this.managedStreams.values())
      .filter((s) => Date.now() - s.lastActivityAt < 60000) // Active in last minute
      .reduce((sum, s) => sum + s.metrics.itemsProcessed, 0);

    return recentActivity / 60; // Items per second
  }

  private calculateAverageLatency(streams: ManagedStream[]): number {
    if (streams.length === 0) return 0;

    const totalLatency = streams.reduce((sum, s) => sum + s.metrics.avgProcessingTime, 0);
    return totalLatency / streams.length;
  }

  private isSystemHealthy(streams: ManagedStream[]): boolean {
    return streams.every((s) => {
      const health = this.streamHealth.get(s.id);
      return !health || health.healthy;
    });
  }

  private calculateMemoryPressure(streams: ManagedStream[]): number {
    // Simplified memory pressure calculation
    const totalBufferSize = streams.reduce((sum, s) => sum + s.metrics.bufferSize, 0);
    const maxAllowedBuffer = streams.length * this.config.backpressure.bufferSize;

    return maxAllowedBuffer > 0 ? totalBufferSize / maxAllowedBuffer : 0;
  }

  private calculateCpuUsage(): number {
    // Simplified CPU usage - would need actual CPU monitoring
    return Math.random() * 20; // Mock value 0-20%
  }

  private createInitialMetrics(): StreamMetrics {
    return {
      bufferSize: 0,
      maxBufferSize: 0,
      droppedEvents: 0,
      warningThreshold: this.config.backpressure.warningThreshold,
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
}
