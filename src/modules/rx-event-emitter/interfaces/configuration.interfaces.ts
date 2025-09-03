import type { HandlerOptions } from './handler.interfaces';
import type { PersistenceAdapter } from './persistence.interfaces';

/**
 * Backpressure handling strategies
 */
export enum BackpressureStrategy {
  /** Drop oldest events when buffer is full */
  DROP_OLDEST = 'drop-oldest',
  /** Drop latest events when buffer is full */
  DROP_LATEST = 'drop-latest',
  /** Throw error when buffer is full */
  ERROR = 'error',
  /** Apply adaptive strategies */
  ADAPTIVE = 'adaptive',
}

/**
 * Backpressure management configuration
 */
export interface BackpressureConfig {
  /** Buffer size before applying overflow strategy */
  bufferSize?: number;
  /** Buffer timeout in milliseconds */
  bufferTimeout?: number;
  /** Strategy for handling buffer overflow */
  overflowStrategy?: BackpressureStrategy;
  /** Warning threshold as percentage of buffer size */
  warningThreshold?: number;
  /** Enable adaptive buffer sizing */
  adaptiveBuffering?: boolean;
  /** Maximum buffer growth multiplier */
  maxBufferGrowth?: number;
  /** Memory pressure threshold for adaptive strategies */
  memoryPressureThreshold?: number;
  /** CPU usage threshold for adaptive strategies */
  cpuThreshold?: number;
}

/**
 * Error recovery fault tolerance modes
 */
export enum FaultToleranceMode {
  /** Strict error handling - fail fast */
  STRICT = 'strict',
  /** Lenient error handling - continue on errors */
  LENIENT = 'lenient',
  /** Graceful degradation */
  GRACEFUL = 'graceful',
}

/**
 * Error recovery and circuit breaker configuration
 */
export interface ErrorRecoveryConfig {
  /** Enable error recovery mechanisms */
  enabled?: boolean;
  /** Number of failures before circuit breaker opens */
  circuitBreakerThreshold?: number;
  /** Circuit breaker timeout in milliseconds */
  circuitBreakerTimeout?: number;
  /** Maximum number of retry attempts */
  maxRetryAttempts?: number;
  /** Initial retry delay in milliseconds */
  retryDelay?: number;
  /** Exponential backoff multiplier */
  exponentialBackoffMultiplier?: number;
  /** Maximum retry delay in milliseconds */
  maxRetryDelay?: number;
  /** Enable error boundary isolation */
  errorBoundaryIsolation?: boolean;
  /** Fault tolerance mode */
  faultToleranceMode?: FaultToleranceMode;
  /** Error classification for retry logic */
  errorClassification?: {
    /** Error types that should be retried */
    retryable: readonly string[];
    /** Error types that should not be retried */
    nonRetryable: readonly string[];
    /** Custom error classifier function */
    classifier?: (error: Error) => 'retryable' | 'non-retryable' | 'unknown';
  };
  /** Health check configuration */
  healthCheck?: {
    /** Enable periodic health checks */
    enabled: boolean;
    /** Health check interval in milliseconds */
    intervalMs: number;
    /** Health check timeout */
    timeoutMs: number;
  };
}

/**
 * Handler execution isolation levels
 */
export enum IsolationLevel {
  /** Strict isolation with resource limits */
  STRICT = 'strict',
  /** Moderate isolation with shared resources */
  MODERATE = 'moderate',
  /** Relaxed isolation - minimal boundaries */
  RELAXED = 'relaxed',
}

/**
 * Handler execution and isolation configuration
 */
export interface HandlerExecutionConfig {
  /** Enable handler execution service */
  enabled?: boolean;
  /** Default handler timeout in milliseconds */
  defaultTimeout?: number;
  /** Enforce timeouts strictly */
  enforceTimeouts?: boolean;
  /** Enable adaptive timeout adjustment */
  adaptiveTimeouts?: boolean;
  /** Enable handler isolation */
  isolationEnabled?: boolean;
  /** Enable bulkhead pattern */
  bulkheadEnabled?: boolean;
  /** Maximum concurrent handlers globally */
  maxConcurrentHandlers?: number;
  /** Handler pool size */
  handlerPoolSize?: number;
  /** Maximum queue size */
  maxQueueSize?: number;
  /** Queue timeout in milliseconds */
  queueTimeout?: number;
  /** Isolation strategy */
  isolationStrategy?: 'per-handler' | 'per-event-type' | 'shared';
  /** Isolation level */
  isolationLevel?: IsolationLevel;
  /** Per-event-type concurrency limits */
  eventTypeConcurrency?: Readonly<Record<string, number>>;
  /** Resource limits */
  resourceLimits?: {
    /** Maximum memory usage in MB */
    maxMemoryMB?: number;
    /** Maximum CPU usage percentage */
    maxCpuPercent?: number;
    /** Maximum execution time */
    maxExecutionTime?: number;
  };
}

/**
 * Cache strategies for handler discovery
 */
export enum CacheStrategy {
  /** In-memory caching only */
  MEMORY = 'memory',
  /** Hybrid memory + persistent cache */
  HYBRID = 'hybrid',
  /** Persistent caching only */
  PERSISTENT = 'persistent',
}

/**
 * Handler discovery and caching configuration
 */
export interface HandlerDiscoveryConfig {
  /** Enable discovery caching */
  cacheEnabled?: boolean;
  /** Caching strategy */
  cacheStrategy?: CacheStrategy;
  /** Cache TTL in milliseconds */
  cacheTtl?: number;
  /** Enable incremental discovery */
  incrementalDiscovery?: boolean;
  /** Preload metadata for performance */
  preloadMetadata?: boolean;
  /** Enable discovery metrics */
  enableMetrics?: boolean;
  /** Enable batch reflection for performance */
  batchReflectionEnabled?: boolean;
  /** Batch size for reflection operations */
  batchSize?: number;
  /** Enable debug logging */
  enableDebugLogging?: boolean;
  /** Scan patterns for handler discovery */
  scanPatterns?: readonly string[];
  /** Exclude patterns */
  excludePatterns?: readonly string[];
  /** Validation rules */
  validationRules?: {
    /** Require event name on handlers */
    requireEventName?: boolean;
    /** Allow dynamic event handlers */
    allowDynamicEvents?: boolean;
    /** Maximum handlers per event */
    maxHandlersPerEvent?: number;
  };
  /** Discovery performance thresholds */
  performanceThresholds?: {
    /** Maximum discovery time in milliseconds */
    maxDiscoveryTime?: number;
    /** Maximum memory usage during discovery */
    maxMemoryUsage?: number;
    /** Maximum reflection calls per batch */
    maxReflectionCalls?: number;
  };
}

/**
 * Validation configuration
 */
export interface ValidationConfig {
  /** Enable dependency analysis */
  enableDependencyAnalysis?: boolean;
  /** Strict dependency validation */
  strictDependencyValidation?: boolean;
  /** Log dependency graph */
  logDependencyGraph?: boolean;
  /** Detect circular dependencies */
  circularDependencyDetection?: boolean;
  /** Validate provider constraints */
  validateProviderConstraints?: boolean;
  /** Enable type checking */
  enforceTypeChecking?: boolean;
  /** Require handler documentation */
  requireHandlerDocumentation?: boolean;
  /** Maximum complexity score allowed */
  maxComplexityScore?: number;
  /** Performance thresholds */
  performanceThresholds?: {
    /** Maximum handler latency in milliseconds */
    maxLatency?: number;
    /** Maximum memory usage in MB */
    maxMemory?: number;
    /** Minimum throughput (events/sec) */
    minThroughput?: number;
  };
}

/**
 * Persistence sharding strategies
 */
export enum ShardingStrategy {
  /** No sharding */
  NONE = 'none',
  /** Time-based sharding */
  TIME = 'time',
  /** Hash-based sharding */
  HASH = 'hash',
  /** Custom sharding strategy */
  CUSTOM = 'custom',
}

/**
 * Persistence indexing strategies
 */
export enum IndexingStrategy {
  /** Basic indexing */
  BASIC = 'basic',
  /** Advanced indexing with multiple indexes */
  ADVANCED = 'advanced',
  /** Full-text search indexing */
  FULL_TEXT = 'full-text',
}

/**
 * Event persistence configuration
 */
export interface PersistenceConfig {
  /** Enable event persistence */
  enabled: boolean;
  /** Persistence adapter implementation */
  adapter?: PersistenceAdapter;
  /** Event retention in days */
  retentionDays?: number;
  /** Enable compression */
  compressionEnabled?: boolean;
  /** Enable encryption */
  encryptionEnabled?: boolean;
  /** Enable automated backups */
  backupEnabled?: boolean;
  /** Sharding strategy */
  shardingStrategy?: ShardingStrategy;
  /** Indexing strategy */
  indexingStrategy?: IndexingStrategy;
  /** Batch write configuration */
  batchWrite?: {
    /** Enable batch writes */
    enabled: boolean;
    /** Batch size */
    size: number;
    /** Batch timeout in milliseconds */
    timeout: number;
  };
}

/**
 * Dead letter queue configuration
 */
export interface DeadLetterQueueConfig {
  /** Enable dead letter queue */
  enabled: boolean;
  /** Maximum retry attempts before DLQ */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
  /** Enable exponential backoff */
  exponentialBackoff?: boolean;
  /** Maximum backoff delay */
  maxBackoffDelay?: number;
  /** Enable jitter for retry timing */
  jitterEnabled?: boolean;
  /** Enable batch processing of DLQ items */
  batchProcessing?: boolean;
  /** Batch size for processing */
  batchSize?: number;
  /** DLQ alerting configuration */
  alerting?: {
    /** Enable alerting */
    enabled: boolean;
    /** Alert thresholds */
    thresholds: {
      /** Queue size threshold */
      queueSize?: number;
      /** Failure rate threshold */
      failureRate?: number;
      /** Age of oldest event threshold */
      oldestEventAge?: number;
    };
    /** Alert channels */
    channels?: readonly string[];
  };
}

/**
 * Monitoring and metrics configuration
 */
export interface MonitoringConfig {
  /** Enable monitoring */
  enabled: boolean;
  /** Metrics server port */
  metricsPort?: number;
  /** Enable Prometheus metrics */
  enablePrometheus?: boolean;
  /** Enable health check endpoint */
  enableHealthCheck?: boolean;
  /** Enable distributed tracing */
  enableTracing?: boolean;
  /** Trace sampling rate */
  samplingRate?: number;
  /** Custom metrics to collect */
  customMetrics?: readonly string[];
  /** Dashboard configuration */
  dashboard?: {
    /** Enable dashboard */
    enabled: boolean;
    /** Dashboard port */
    port?: number;
    /** Refresh interval in milliseconds */
    refreshInterval?: number;
    /** Enable real-time updates */
    realTimeUpdates?: boolean;
  };
}

/**
 * Multi-tenant isolation configuration
 */
export interface TenantIsolationConfig {
  /** Enable tenant isolation */
  enabled: boolean;
  /** Tenant ID field name */
  tenantIdField?: string;
  /** Isolation level */
  isolationLevel?: 'strict' | 'moderate' | 'shared';
  /** Default tenant ID */
  defaultTenant?: string;
  /** Allow cross-tenant event processing */
  allowCrossTenant?: boolean;
  /** Tenant validation function */
  tenantValidation?: (tenantId: string) => boolean;
  /** Tenant-specific configurations */
  tenantConfigs?: Readonly<Record<string, Partial<EventEmitterOptions>>>;
}

/**
 * Main configuration for the event emitter
 */
export interface EventEmitterOptions {
  /** Persistence configuration */
  persistence?: PersistenceConfig;
  /** Dead letter queue configuration */
  dlq?: DeadLetterQueueConfig;
  /** Monitoring configuration */
  monitoring?: MonitoringConfig;
  /** Global concurrency limit */
  maxConcurrency?: number;
  /** Backpressure configuration */
  backpressure?: BackpressureConfig;
  /** Error recovery configuration */
  errorRecovery?: ErrorRecoveryConfig;
  /** Handler execution configuration */
  handlerExecution?: HandlerExecutionConfig;
  /** Handler discovery configuration */
  handlerDiscovery?: HandlerDiscoveryConfig;
  /** Validation configuration */
  validation?: ValidationConfig;
  /** Tenant isolation configuration */
  tenantIsolation?: TenantIsolationConfig;
  /** Experimental features */
  experimental?: {
    /** Enable stream optimization */
    enableStreamOptimization?: boolean;
    /** Enable async handlers */
    enableAsyncHandlers?: boolean;
    /** Enable batch processing */
    enableBatchProcessing?: boolean;
    /** Enable event sourcing */
    enableEventSourcing?: boolean;
    /** Enable CQRS patterns */
    enableCQRS?: boolean;
  };
  /** Debug and development options */
  debug?: {
    /** Enable verbose logging */
    enableVerboseLogging?: boolean;
    /** Log event flow */
    logEventFlow?: boolean;
    /** Log handler execution */
    logHandlerExecution?: boolean;
    /** Enable performance metrics */
    enablePerformanceMetrics?: boolean;
    /** Save stack traces for debugging */
    saveStackTraces?: boolean;
  };
}

/**
 * NestJS module configuration
 */
export interface ModuleConfig extends EventEmitterOptions {
  /** Make module global */
  global?: boolean;
  /** Module imports */
  imports?: readonly unknown[];
  /** Module exports */
  exports?: readonly unknown[];
}

/**
 * Configuration validation result
 */
export interface ConfigurationValidationResult {
  /** Whether configuration is valid */
  readonly valid: boolean;
  /** Validation errors */
  readonly errors: readonly string[];
  /** Validation warnings */
  readonly warnings: readonly string[];
  /** Performance recommendations */
  readonly recommendations?: readonly string[];
}

/**
 * Configuration validator interface
 */
export interface ConfigurationValidator {
  /**
   * Validate event emitter options
   */
  validateOptions(options: EventEmitterOptions): ConfigurationValidationResult;

  /**
   * Validate handler options
   */
  validateHandlerOptions(options: HandlerOptions): ConfigurationValidationResult;

  /**
   * Validate persistence adapter
   */
  validatePersistenceAdapter(adapter: PersistenceAdapter): ConfigurationValidationResult;
}
