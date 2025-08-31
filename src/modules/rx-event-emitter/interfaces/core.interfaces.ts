/**
 * Event processing status
 */
export enum EventStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying',
  DEAD_LETTER = 'dead_letter',
}

/**
 * Event priority levels
 */
export enum EventPriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 10,
  CRITICAL = 20,
}

/**
 * Core event metadata
 */
export interface EventMetadata {
  /** Unique event identifier */
  readonly id: string;
  /** Event name/type */
  readonly name: string;
  /** Event creation timestamp */
  readonly timestamp: number;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** Causation ID for event chains */
  readonly causationId?: string;
  /** Event schema version */
  readonly version?: number;
  /** Event source identifier */
  readonly source?: string;
  /** Retry attempt count */
  readonly retryCount?: number;
  /** Additional headers */
  readonly headers?: Readonly<Record<string, unknown>>;
  /** Event priority */
  readonly priority?: EventPriority;
  /** Tenant identifier */
  readonly tenantId?: string;
  /** Processing status */
  readonly status?: EventStatus;
}

/**
 * Core event structure
 */
export interface Event<TPayload = unknown> {
  /** Event metadata */
  readonly metadata: EventMetadata;
  /** Event payload data */
  readonly payload: TPayload;
}

/**
 * Options for emitting events
 */
export interface EmitOptions {
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Causation ID for event chains */
  causationId?: string;
  /** Additional headers */
  headers?: Record<string, unknown>;
  /** Event priority */
  priority?: EventPriority;
  /** Processing timeout in milliseconds */
  timeout?: number;
  /** Whether the event can be retried on failure */
  retryable?: boolean;
  /** Tenant identifier */
  tenantId?: string;
}

/**
 * Event processing statistics
 */
export interface EventStats {
  /** Total events emitted */
  readonly totalEmitted: number;
  /** Total events processed successfully */
  readonly totalProcessed: number;
  /** Total events that failed processing */
  readonly totalFailed: number;
  /** Average processing time in milliseconds */
  readonly averageProcessingTime: number;
  /** Timestamp of last emitted event */
  readonly lastEmittedAt?: number;
  /** Timestamp of last processed event */
  readonly lastProcessedAt?: number;
  /** Events currently being processed */
  readonly currentlyProcessing: number;
  /** Events in retry state */
  readonly retrying: number;
  /** Events in dead letter queue */
  readonly deadLettered: number;
  /** Processing rate (events/sec) */
  readonly processingRate: number;
  /** Error rate percentage */
  readonly errorRate: number;
  /** Retry success rate */
  readonly retrySuccessRate: number;
}

/**
 * Stream processing metrics
 */
export interface StreamMetrics {
  /** Current buffer size */
  readonly bufferSize: number;
  /** Maximum buffer size reached */
  readonly maxBufferSize: number;
  /** Number of events dropped */
  readonly droppedEvents: number;
  /** Buffer warning threshold */
  readonly warningThreshold: number;
  /** Whether backpressure is active */
  readonly backpressureActive: boolean;
  /** Throughput metrics */
  readonly throughput: {
    /** Events processed per second */
    readonly eventsPerSecond: number;
    /** Average latency in milliseconds */
    readonly averageLatency: number;
    /** 95th percentile latency */
    readonly p95Latency: number;
    /** 99th percentile latency */
    readonly p99Latency: number;
    /** Maximum latency observed */
    readonly maxLatency: number;
  };
  /** Stream health metrics */
  readonly health: {
    /** Stream is healthy */
    readonly healthy: boolean;
    /** Memory pressure indicator */
    readonly memoryPressure: number;
    /** CPU usage percentage */
    readonly cpuUsage: number;
    /** Last health check timestamp */
    readonly lastCheckAt: number;
  };
}

/**
 * Event factory for creating type-safe events
 */
export interface EventFactory {
  /**
   * Create a new event with metadata
   */
  create<TPayload>(name: string, payload: TPayload, options?: Omit<EmitOptions, 'priority'> & { priority?: EventPriority }): Event<TPayload>;

  /**
   * Create event from existing event (for retries, etc.)
   */
  fromEvent<TPayload>(event: Event<TPayload>, overrides?: Partial<EventMetadata>): Event<TPayload>;
}

/**
 * Event validation result
 */
export interface EventValidationResult {
  /** Whether the event is valid */
  readonly valid: boolean;
  /** Validation errors */
  readonly errors: readonly string[];
  /** Validation warnings */
  readonly warnings: readonly string[];
}

/**
 * Event validator interface
 */
export interface EventValidator {
  /**
   * Validate an event
   */
  validate<TPayload>(event: Event<TPayload>): EventValidationResult;

  /**
   * Validate event metadata only
   */
  validateMetadata(metadata: EventMetadata): EventValidationResult;

  /**
   * Validate event payload
   */
  validatePayload<TPayload>(payload: TPayload, eventName: string): EventValidationResult;
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
  /** Current state */
  readonly state: CircuitBreakerState;
  /** Failure count in current window */
  readonly failureCount: number;
  /** Success count in current window */
  readonly successCount: number;
  /** Last failure timestamp */
  readonly lastFailureTime?: number;
  /** Last success timestamp */
  readonly lastSuccessTime?: number;
  /** Next allowed attempt timestamp (when OPEN) */
  readonly nextAttemptTime?: number;
  /** Failure rate percentage */
  readonly failureRate: number;
  /** Configuration */
  readonly config: {
    readonly failureThreshold: number;
    readonly recoveryTimeout: number;
    readonly minimumThroughput: number;
  };
}

/**
 * Handler pool configuration
 */
export interface HandlerPoolConfig {
  /** Maximum concurrent executions */
  readonly maxConcurrency: number;
  /** Queue size for pending tasks */
  readonly queueSize: number;
  /** Task timeout in milliseconds */
  readonly timeoutMs: number;
  /** Pool isolation strategy */
  readonly isolation: IsolationStrategy;
  /** Pool name for metrics */
  readonly name: string;
}

/**
 * Isolation strategies for handler pools
 */
export enum IsolationStrategy {
  SHARED = 'shared',
  ISOLATED = 'isolated',
  TENANT_ISOLATED = 'tenant_isolated',
}

/**
 * Handler pool metrics
 */
export interface HandlerPoolMetrics {
  /** Pool name */
  readonly name: string;
  /** Active executions */
  readonly activeExecutions: number;
  /** Queued tasks */
  readonly queuedTasks: number;
  /** Dropped tasks */
  readonly droppedTasks: number;
  /** Completed tasks */
  readonly completedTasks: number;
  /** Failed tasks */
  readonly failedTasks: number;
  /** Average execution time */
  readonly averageExecutionTime: number;
  /** Pool utilization percentage */
  readonly utilization: number;
  /** Circuit breaker metrics */
  readonly circuitBreaker: CircuitBreakerMetrics;
}

/**
 * Handler pool interface
 */
export interface HandlerPool {
  /** Pool configuration */
  readonly config: HandlerPoolConfig;
  /** Pool metrics */
  readonly metrics: HandlerPoolMetrics;
  /** Execute task in pool */
  execute<T>(task: () => Promise<T>): Promise<T>;
  /** Get pool status */
  getStatus(): 'healthy' | 'degraded' | 'unhealthy';
  /** Shutdown pool */
  shutdown(): Promise<void>;
}
