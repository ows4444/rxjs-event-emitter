/**
 * Centralized exports for all RxJS Event Emitter interfaces
 * Organized by domain for better maintainability and discoverability
 */

// Core event and metadata interfaces
export * from './core.interfaces';

// Handler execution and management interfaces
export * from './handler.interfaces';

// Configuration and options interfaces
export * from './configuration.interfaces';

// Persistence and storage interfaces
export * from './persistence.interfaces';

// Discovery and dependency analysis interfaces
export * from './discovery.interfaces';

// Legacy symbols and constants (maintained for backward compatibility)
export const EVENT_EMITTER_OPTIONS = Symbol('EVENT_EMITTER_OPTIONS');
export const EVENT_HANDLER_METADATA = Symbol('EVENT_HANDLER_METADATA');
export const EVENT_HANDLER_OPTIONS = Symbol('EVENT_HANDLER_OPTIONS');

// Circuit breaker enums and related interfaces
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextAttemptTime?: number;
  threshold: number;
  timeout: number;
}

export interface ErrorRecoveryMetrics {
  circuitBreakers: Map<string, CircuitBreakerMetrics>;
  totalRetryAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  averageRecoveryTime: number;
  lastRecoveryTime?: number;
  errorsByType: Map<string, number>;
  retryPatterns: Map<
    string,
    {
      attempts: number;
      successRate: number;
      averageDelay: number;
    }
  >;
}

// Service-specific interfaces for better type safety
export interface StreamManagementOptions {
  backpressure?: {
    bufferSize?: number;
    warningThreshold?: number;
    overflowStrategy?: 'dropOldest' | 'dropLatest' | 'error';
  };
  concurrency?: {
    maxConcurrent?: number;
    adaptiveScaling?: boolean;
  };
  monitoring?: {
    metricsEnabled?: boolean;
    healthChecks?: boolean;
  };
}

export interface HandlerExecutionOptions {
  isolation?: {
    enabled?: boolean;
    strategy?: 'per-handler' | 'per-event-type' | 'shared';
    level?: 'strict' | 'moderate' | 'relaxed';
  };
  timeout?: {
    defaultMs?: number;
    enforceTimeouts?: boolean;
    adaptiveTimeouts?: boolean;
  };
  circuitBreaker?: {
    enabled?: boolean;
    threshold?: number;
    timeoutMs?: number;
  };
}

export interface HandlerDiscoveryOptions {
  cache?: {
    enabled?: boolean;
    strategy?: 'memory' | 'hybrid' | 'persistent';
    ttlMs?: number;
  };
  validation?: {
    strict?: boolean;
    enableDependencyAnalysis?: boolean;
    circularDependencyDetection?: boolean;
  };
  optimization?: {
    batchProcessing?: boolean;
    batchSize?: number;
    preloadMetadata?: boolean;
  };
}
