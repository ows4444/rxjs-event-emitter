/**
 * Handler Pool and Isolation interfaces
 */

import type { Event } from './core.interfaces';

/**
 * Handler isolation metrics
 */
export interface HandlerIsolationMetrics {
  /** Total number of pools */
  readonly totalPools: number;
  /** Active pools */
  readonly activePools: number;
  /** Total active executions across all pools */
  readonly totalActiveExecutions: number;
  /** Total queued tasks across all pools */
  readonly totalQueuedTasks: number;
  /** Total dropped tasks */
  readonly totalDroppedTasks: number;
  /** Average pool utilization */
  readonly averagePoolUtilization: number;
  /** Circuit breaker states by pool */
  readonly circuitBreakerStates: Record<string, string>;
  /** Individual pool metrics */
  readonly poolMetrics: Map<string, PoolMetrics>;
  /** Resource usage metrics */
  readonly resourceUsage: ResourceUsageMetrics;
  /** Isolation effectiveness metrics */
  readonly isolation: IsolationMetrics;
}

/**
 * Individual pool metrics
 */
export interface PoolMetrics {
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
  /** Success rate */
  readonly successRate: number;
  /** Average execution time */
  readonly averageExecutionTime: number;
  /** Maximum execution time */
  readonly maxExecutionTime: number;
  /** Pool utilization */
  readonly utilization: number;
  /** Memory usage in MB */
  readonly memoryUsage: number;
  /** Last activity timestamp */
  readonly lastActivityAt: number;
}

/**
 * Resource usage metrics
 */
export interface ResourceUsageMetrics {
  /** Memory usage in MB */
  readonly memoryUsage: number;
  /** CPU usage percentage */
  readonly cpuUsage: number;
  /** Active threads */
  readonly activeThreads: number;
  /** Available resources */
  readonly availableResources: {
    readonly memory: number;
    readonly cpu: number;
    readonly threads: number;
  };
  /** Resource pressure indicators */
  readonly pressure: {
    readonly memory: 'low' | 'medium' | 'high' | 'critical';
    readonly cpu: 'low' | 'medium' | 'high' | 'critical';
    readonly threads: 'low' | 'medium' | 'high' | 'critical';
  };
}

/**
 * Isolation effectiveness metrics
 */
export interface IsolationMetrics {
  /** Interference score (0-1, lower is better) */
  readonly interferenceScore: number;
  /** Fault containment score (0-1, higher is better) */
  readonly faultContainment: number;
  /** Resource sharing efficiency (0-1, higher is better) */
  readonly sharingEfficiency: number;
}

/**
 * Handler execution context
 */
export interface HandlerExecutionContext {
  /** Event being processed */
  readonly event: Event;
  /** Handler metadata */
  readonly handler: BaseRegisteredHandler;
  /** Pool name */
  readonly poolName: string;
  /** Correlation ID for tracing */
  readonly correlationId: string;
  /** Start timestamp */
  readonly startedAt: number;
  /** Timeout timestamp */
  readonly timeoutAt: number;
  /** Attempt number */
  readonly attempt: number;
  /** Context metadata */
  readonly metadata: Record<string, unknown>;
}

/**
 * Handler execution result
 */
export interface ExecutionResult {
  /** Execution success */
  readonly success: boolean;
  /** Execution duration */
  readonly duration: number;
  /** Result data */
  readonly result?: unknown;
  /** Error if failed */
  readonly error?: Error;
  /** Whether retry is needed */
  readonly needsRetry: boolean;
  /** Memory used during execution */
  readonly memoryUsed?: number;
  /** CPU time used */
  readonly cpuTimeUsed?: number;
}

/**
 * Registered handler with enhanced metadata
 */
import type { RegisteredHandler as BaseRegisteredHandler } from './handler.interfaces';

export interface PoolRegisteredHandler extends BaseRegisteredHandler {
  /** Method name */
  readonly methodName: string;
  /** Pool assignment */
  readonly poolName: string;
  /** Priority */
  readonly priority: number;
  /** Registration timestamp */
  readonly registeredAt: number;
  /** Handler statistics */
  readonly stats: HandlerStats;
}

/**
 * Handler metadata
 */
export interface HandlerMetadata {
  /** Event name */
  readonly eventName: string;
  /** Handler options */
  readonly options: HandlerOptions;
  /** Handler version */
  readonly version?: string;
  /** Handler description */
  readonly description?: string;
}

/**
 * Handler statistics
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
  /** Maximum execution time */
  readonly maxExecutionTime: number;
  /** Last execution timestamp */
  readonly lastExecutionAt?: number;
  /** Success rate */
  readonly successRate: number;
  /** Error distribution */
  readonly errorDistribution: Record<string, number>;
}

/**
 * Handler options (enhanced from original)
 */
export interface HandlerOptions {
  /** Handler priority */
  readonly priority?: number;
  /** Timeout in milliseconds */
  readonly timeout?: number;
  /** Maximum retry attempts */
  readonly maxRetries?: number;
  /** Retry policy */
  readonly retryPolicy?: string;
  /** Pool assignment */
  readonly pool?: string;
  /** Isolation level */
  readonly isolation?: 'shared' | 'isolated';
  /** Circuit breaker configuration */
  readonly circuitBreaker?: {
    readonly enabled: boolean;
    readonly failureThreshold: number;
    readonly recoveryTimeout: number;
  };
  /** Rate limiting */
  readonly rateLimit?: {
    readonly enabled: boolean;
    readonly maxPerSecond: number;
    readonly burstSize: number;
  };
  /** Metrics collection */
  readonly metrics?: {
    readonly enabled: boolean;
    readonly trackMemory: boolean;
    readonly trackCpu: boolean;
  };
}
