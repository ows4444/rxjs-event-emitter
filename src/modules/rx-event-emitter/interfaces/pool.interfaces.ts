/**
 * Handler Pool and Isolation interfaces
 */

import type { Event } from './core.interfaces';
import type { 
  RegisteredHandler, 
  HandlerMetadata, 
  HandlerOptions, 
  HandlerStats, 
  HandlerExecutionContext, 
  ExecutionResult 
} from './handler.interfaces';
import type { HandlerIsolationMetrics } from './discovery.interfaces';

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
  /** Throughput in tasks/second */
  readonly throughput: number;
  /** Error rate percentage */
  readonly errorRate: number;
  /** Average task wait time */
  readonly averageWaitTime: number;
  /** Current queue depth */
  readonly queueDepth: number;
  /** Pool health score */
  readonly healthScore: number;
  /** Resource efficiency */
  readonly efficiency: number;
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
 * Pool-specific execution context (extends base context)
 */
export interface PoolExecutionContext extends HandlerExecutionContext {
  /** Pool name */
  readonly poolName: string;
  /** Timeout timestamp */
  readonly timeoutAt: number;
}

/**
 * Pool-specific execution result (extends base result)
 */
export interface PoolExecutionResult extends ExecutionResult {
  /** Memory used during execution */
  readonly memoryUsed?: number;
  /** CPU time used */
  readonly cpuTimeUsed?: number;
}
