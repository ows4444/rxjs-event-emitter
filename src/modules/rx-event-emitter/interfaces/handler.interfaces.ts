/**
 * Handler-related interfaces for the RxJS Event Emitter Library
 * Contains handler options, metadata, and execution definitions
 */

import type { Observable } from 'rxjs';
import type { Event } from './core.interfaces';

export interface HandlerOptions {
  priority?: number;
  filter?: (event: Event) => boolean;
  transform?: (event: Event) => Observable<Event>;
  timeout?: number;
  retries?: number;
  retryable?: boolean;
  isolated?: boolean;
  concurrent?: boolean;
  maxConcurrency?: number;
  bulkheadSize?: number;
  isolationContext?: string;
  timeoutStrategy?: 'cancel' | 'warn' | 'continue';
  queueTimeoutMs?: number;
  maxQueueSize?: number;
  circuitBreakerEnabled?: boolean;
  circuitBreakerThreshold?: number;
  resourceIsolation?: 'strict' | 'shared' | 'none';
  dependencies?: string[];
  conflictResolution?: 'strict' | 'warn' | 'auto-increment';
  priorityGroup?: string;
  tags?: string[];
  description?: string;
}

export interface HandlerMetadata {
  eventName: string;
  options: HandlerOptions;
  methodName: string;
  className: string;
  handlerId: string;
  providerToken?: string;
  instance?: unknown;
  lastExecuted?: number;
  executionCount?: number;
}

export interface RegisteredHandler {
  eventName: string;
  handler: (...args: unknown[]) => unknown;
  instance: unknown;
  options: HandlerOptions;
  handlerId: string;
  metadata: HandlerMetadata;
}

export interface HandlerExecutionContext {
  event: Event;
  handler: RegisteredHandler;
  startTime: number;
  attempt: number;
  correlationId: string;
  parentContext?: HandlerExecutionContext;
}

export interface ExecutionResult {
  success: boolean;
  handlerId: string;
  executionTime: number;
  error?: Error;
  retryCount?: number;
  memoryUsage?: {
    before: number;
    after: number;
    peak: number;
  };
  context?: HandlerExecutionContext;
}

export interface HandlerPool {
  isolationContext: string;
  concurrencyLimit: number;
  activeExecutions: number;
  totalExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutionTime?: number;
  pendingQueue: {
    handler: RegisteredHandler;
    event: Event;
    enqueuedAt: number;
    resolve: (value: void) => void;
    reject: (error: Error) => void;
  }[];
  maxQueueSize: number;
  droppedTasks: number;
  queueTimeoutMs: number;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  circuitBreakerFailures: number;
  circuitBreakerLastFailure?: number;
  isolationStrategy: 'per-handler' | 'per-event-type' | 'shared';
}

export interface HandlerStats {
  execution: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
    timeouts: number;
    lastExecution?: number;
  };
  circuitBreaker: {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failures: number;
    lastFailure?: number;
    nextAttempt?: number;
  };
  timeout: {
    totalExecutions: number;
    timeouts: number;
    successes: number;
    averageExecutionTime: number;
    lastTimeout?: number;
  };
  resource: {
    memoryUsage: number;
    cpuTime: number;
    isolationLevel: string;
  };
}
