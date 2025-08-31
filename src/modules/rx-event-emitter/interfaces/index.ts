// =============================================================================
// CORE INTERFACES - Event fundamentals  
// =============================================================================

export { 
  EventStatus, 
  EventPriority, 
  EventMetadata, 
  Event, 
  EmitOptions, 
  EventStats, 
  StreamMetrics, 
  EventFactory, 
  EventValidationResult, 
  EventValidator, 
  CircuitBreakerMetrics, 
  HandlerPoolConfig, 
  HandlerPoolMetrics, 
  HandlerPool 
} from './core.interfaces';

// =============================================================================
// HANDLER INTERFACES - Handler execution and management
// =============================================================================

export { 
  IsolationStrategy, 
  TimeoutStrategy, 
  CircuitBreakerState, 
  ResourceIsolation, 
  HandlerOptions, 
  HandlerMetadata, 
  RegisteredHandler, 
  HandlerExecutionContext, 
  ExecutionResult, 
  HandlerStats, 
  HandlerExecutionPool,
  HandlerRegistry 
} from './handler.interfaces';

// =============================================================================
// CONFIGURATION INTERFACES - Type-safe configuration
// =============================================================================

export { 
  BackpressureStrategy, 
  BackpressureConfig, 
  FaultToleranceMode, 
  ErrorRecoveryConfig, 
  IsolationLevel, 
  HandlerExecutionConfig, 
  CacheStrategy, 
  HandlerDiscoveryConfig, 
  ValidationConfig, 
  ShardingStrategy, 
  IndexingStrategy, 
  PersistenceConfig, 
  DeadLetterQueueConfig, 
  MonitoringConfig, 
  TenantIsolationConfig, 
  EventEmitterOptions, 
  ModuleConfig, 
  ConfigurationValidationResult, 
  ConfigurationValidator 
} from './configuration.interfaces';

// =============================================================================
// PERSISTENCE INTERFACES - Event storage and retrieval
// =============================================================================

export { 
  PersistenceAdapter, 
  AsyncPersistenceAdapter, 
  Transaction, 
  TransactionOperation, 
  PersistenceStats, 
  BackupResult, 
  RestoreResult, 
  HealthCheckResult, 
  EventQuery, 
  QueryResult,
  InMemoryAdapterConfig,
  RedisAdapterConfig,
  DatabaseAdapterConfig,
  FileSystemAdapterConfig,
  S3AdapterConfig,
  AzureBlobAdapterConfig,
  GCSAdapterConfig
} from './persistence.interfaces';

// =============================================================================
// DISCOVERY INTERFACES - Handler discovery and dependency management
// =============================================================================

export { 
  DiscoveryCache, 
  DiscoveryMetrics, 
  PriorityConflict, 
  PriorityValidationResult, 
  HandlerPriorityMap, 
  CircularDependency, 
  DependencyGraph, 
  DependencyNode, 
  DependencyEdge, 
  HandlerIsolationMetrics,
  PriorityValidationError,
  ValidationError,
  DiscoveryProfile,
  ValidationRules,
  OptimizationHint,
  DiscoveryBatch,
  BatchProcessingResult
} from './discovery.interfaces';

// =============================================================================
// DEAD LETTER QUEUE INTERFACES - Failed event handling
// =============================================================================

export { 
  DLQEntry, 
  RetryPolicy, 
  RetryCondition, 
  DLQMetrics, 
  PolicyStats, 
  DLQConfig, 
  DeadLetterQueueService 
} from './dead-letter-queue.interfaces';

// =============================================================================
// POOL INTERFACES - Handler pools and isolation
// =============================================================================

export { 
  PoolExecutionContext, 
  PoolExecutionResult, 
  PoolMetrics, 
  ResourceUsageMetrics, 
  IsolationMetrics 
} from './pool.interfaces';

// =============================================================================
// DEPENDENCY INJECTION TOKENS
// =============================================================================

/** DI token for event emitter configuration */
export const EVENT_EMITTER_OPTIONS = Symbol('EVENT_EMITTER_OPTIONS');

/** Metadata key for event handler registration */
export const EVENT_HANDLER_METADATA = Symbol('EVENT_HANDLER_METADATA');

/** Metadata key for handler configuration */
export const EVENT_HANDLER_OPTIONS = Symbol('EVENT_HANDLER_OPTIONS');
