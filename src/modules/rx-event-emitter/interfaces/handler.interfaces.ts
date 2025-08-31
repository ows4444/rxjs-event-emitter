import type { Observable } from 'rxjs';
import type { Event, EventPriority } from './core.interfaces';

/**
 * Handler execution isolation strategy
 */
export enum IsolationStrategy {
  /** Each handler gets its own execution context */
  PER_HANDLER = 'per-handler',
  /** Handlers for same event type share context */
  PER_EVENT_TYPE = 'per-event-type',
  /** All handlers share same context */
  SHARED = 'shared',
  /** Isolated execution context */
  ISOLATED = 'isolated',
  /** Tenant-specific isolation */
  TENANT_ISOLATED = 'tenant_isolated',
}

/**
 * Handler execution timeout strategy
 */
export enum TimeoutStrategy {
  /** Cancel handler execution on timeout */
  CANCEL = 'cancel',
  /** Log warning but continue */
  WARN = 'warn',
  /** Allow handler to continue */
  CONTINUE = 'continue',
}

/**
 * Circuit breaker state
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open',
}

/**
 * Resource isolation level
 */
export enum ResourceIsolation {
  /** Strict resource limits */
  STRICT = 'strict',
  /** Shared resources with limits */
  SHARED = 'shared',
  /** No resource isolation */
  NONE = 'none',
}

/**
 * Configuration options for event handlers
 */
export interface HandlerOptions {
  /** Handler priority (higher = earlier execution) */
  priority?: EventPriority;
  /** Event filter function */
  filter?: <TPayload>(event: Event<TPayload>) => boolean;
  /** Event transformation function */
  transform?: <TPayload>(event: Event<TPayload>) => Observable<Event<TPayload>>;
  /** Handler timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts on failure */
  retries?: number;
  /** Whether handler supports retries */
  retryable?: boolean;
  /** Enable handler isolation */
  isolated?: boolean;
  /** Allow concurrent execution */
  concurrent?: boolean;
  /** Maximum concurrent executions */
  maxConcurrency?: number;
  /** Bulkhead size for isolation */
  bulkheadSize?: number;
  /** Isolation context identifier */
  isolationContext?: string;
  /** Timeout handling strategy */
  timeoutStrategy?: TimeoutStrategy;
  /** Queue timeout in milliseconds */
  queueTimeout?: number;
  /** Maximum queue size */
  maxQueueSize?: number;
  /** Enable circuit breaker */
  circuitBreakerEnabled?: boolean;
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold?: number;
  /** Resource isolation level */
  resourceIsolation?: ResourceIsolation;
  /** Handler dependencies */
  dependencies?: readonly string[];
  /** Priority group identifier */
  priorityGroup?: string;
  /** Handler tags for categorization */
  tags?: readonly string[];
  /** Handler description */
  description?: string;
  /** Custom metadata */
  metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Metadata about registered handlers
 */
export interface HandlerMetadata {
  /** Event name this handler processes */
  readonly eventName: string;
  /** Handler options */
  readonly options: HandlerOptions;
  /** Method name */
  readonly methodName: string;
  /** Class name */
  readonly className: string;
  /** Unique handler identifier */
  readonly handlerId: string;
  /** Provider token */
  readonly providerToken?: string;
  /** Handler instance */
  readonly instance?: unknown;
  /** Last execution timestamp */
  readonly lastExecuted?: number;
  /** Total execution count */
  readonly executionCount?: number;
  /** Average execution time */
  readonly averageExecutionTime?: number;
  /** Handler dependencies */
  readonly dependencies?: string[];
  /** Tags for categorization */
  readonly tags?: string[];
  /** Handler version */
  readonly version?: string;
  /** Handler description */
  readonly description?: string;
}

/**
 * Complete registered handler information
 */
export interface RegisteredHandler {
  /** Event name */
  readonly eventName: string;
  /** Handler function */
  readonly handler: (...args: unknown[]) => unknown;
  /** Handler instance */
  readonly instance: unknown;
  /** Handler options */
  readonly options: HandlerOptions;
  /** Unique handler identifier */
  readonly handlerId: string;
  /** Handler metadata */
  readonly metadata: HandlerMetadata;
}

/**
 * Handler execution context
 */
export interface HandlerExecutionContext {
  /** Event being processed */
  readonly event: Event;
  /** Handler being executed */
  readonly handler: RegisteredHandler;
  /** Execution start time */
  readonly startTime: number;
  /** Retry attempt number */
  readonly attempt: number;
  /** Correlation ID */
  readonly correlationId: string;
  /** Parent execution context */
  readonly parentContext?: HandlerExecutionContext;
  /** Execution metadata */
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Handler execution result
 */
export interface ExecutionResult {
  /** Whether execution succeeded */
  readonly success: boolean;
  /** Handler ID */
  readonly handlerId: string;
  /** Execution time in milliseconds */
  readonly executionTime: number;
  /** Error if execution failed */
  readonly error?: Error;
  /** Number of retries attempted */
  readonly retryCount?: number;
  /** Memory usage during execution */
  readonly memoryUsage?: {
    readonly before: number;
    readonly after: number;
    readonly peak: number;
  };
  /** Execution context */
  readonly context?: HandlerExecutionContext;
  /** Result metadata */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Handler execution pool for isolation and concurrency
 */
export interface HandlerExecutionPool {
  /** Isolation context identifier */
  readonly isolationContext: string;
  /** Concurrency limit */
  readonly concurrencyLimit: number;
  /** Current active executions */
  readonly activeExecutions: number;
  /** Total executions processed */
  readonly totalExecutions: number;
  /** Total failed executions */
  readonly failedExecutions: number;
  /** Average execution time */
  readonly averageExecutionTime: number;
  /** Last execution timestamp */
  readonly lastExecutionTime?: number;
  /** Pending execution queue */
  readonly pendingQueue: readonly {
    readonly handler: RegisteredHandler;
    readonly event: Event;
    readonly enqueuedAt: number;
    readonly resolve: (value: void) => void;
    readonly reject: (error: Error) => void;
  }[];
  /** Maximum queue size */
  readonly maxQueueSize: number;
  /** Number of dropped tasks */
  readonly droppedTasks: number;
  /** Queue timeout in milliseconds */
  readonly queueTimeout: number;
  /** Circuit breaker state */
  readonly circuitBreakerState: CircuitBreakerState;
  /** Circuit breaker failure count */
  readonly circuitBreakerFailures: number;
  /** Last circuit breaker failure time */
  readonly circuitBreakerLastFailure?: number;
  /** Isolation strategy */
  readonly isolationStrategy: IsolationStrategy;
}

/**
 * Handler performance statistics
 */
export interface HandlerStats {
  /** Total executions */
  readonly totalExecutions: number;
  /** Successful executions */
  readonly successfulExecutions: number;
  /** Failed executions */
  readonly failedExecutions: number;
  /** Average execution time */
  readonly averageExecutionTime: number;
  /** Minimum execution time */
  readonly minExecutionTime: number;
  /** Maximum execution time */
  readonly maxExecutionTime: number;
  /** Number of timeouts */
  readonly timeouts: number;
  /** Last execution timestamp */
  readonly lastExecution?: number;
  /** Success rate percentage */
  readonly successRate: number;
  /** Error distribution */
  readonly errorDistribution: Record<string, number>;
  /** Circuit breaker state */
  readonly circuitBreakerState: CircuitBreakerState;
  /** Circuit breaker failure count */
  readonly circuitBreakerFailures: number;
  /** Last circuit breaker failure time */
  readonly circuitBreakerLastFailure?: number;
  /** Memory usage in MB */
  readonly memoryUsage: number;
  /** CPU time used */
  readonly cpuTime: number;
  /** Isolation level */
  readonly isolationLevel: string;
  /** Pool utilization percentage */
  readonly poolUtilization: number;
}

/**
 * Handler registry interface
 */
export interface HandlerRegistry {
  /**
   * Register a new handler
   */
  register(handler: RegisteredHandler): void;

  /**
   * Unregister a handler
   */
  unregister(handlerId: string): void;

  /**
   * Get handlers for an event
   */
  getHandlers(eventName: string): readonly RegisteredHandler[];

  /**
   * Get all registered handlers
   */
  getAllHandlers(): readonly RegisteredHandler[];

  /**
   * Get handler by ID
   */
  getHandler(handlerId: string): RegisteredHandler | undefined;

  /**
   * Check if handler exists
   */
  hasHandler(handlerId: string): boolean;

  /**
   * Get handler statistics
   */
  getHandlerStats(handlerId: string): HandlerStats | undefined;
}

/**
 * Handler execution service interface
 */
export interface HandlerExecutionService {
  /**
   * Execute a handler with an event
   */
  execute(handler: RegisteredHandler, event: Event): Observable<ExecutionResult>;

  /**
   * Execute all handlers for an event
   */
  executeHandlers(eventName: string, event: Event): Observable<ExecutionResult[]>;

  /**
   * Get execution statistics
   */
  getStats(): Readonly<Record<string, HandlerStats>>;

  /**
   * Get handler pool information
   */
  getPoolInfo(isolationContext: string): HandlerExecutionPool | undefined;
}
