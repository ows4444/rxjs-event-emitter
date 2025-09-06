// Basic configuration interfaces
import type { PersistenceAdapter } from './persistence.interfaces';

/**
 * Backpressure handling strategies
 */
export enum BackpressureStrategy {
  /** Buffer events when under pressure */
  BUFFER = 'buffer',
}

/**
 * Backpressure management configuration
 */
export interface BackpressureConfig {
  /** Buffer size before applying overflow strategy */
  bufferSize?: number;
  /** Warning threshold as percentage of buffer size */
  warningThreshold?: number;
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
}

/**
 * Handler execution and isolation configuration
 */
export interface HandlerExecutionConfig {
  /** Enable handler execution service */
  enabled?: boolean;
  /** Default handler timeout in milliseconds */
  defaultTimeout?: number;
  /** Maximum concurrent handlers globally */
  maxConcurrentHandlers?: number;
}

/**
 * Handler discovery configuration
 */
export interface HandlerDiscoveryConfig {
  /** Enable discovery service */
  enabled?: boolean;
  /** Enable debug logging */
  enableDebugLogging?: boolean;
}

/**
 * Validation configuration
 */
export interface ValidationConfig {
  /** Enable dependency analysis */
  enableDependencyAnalysis?: boolean;
  /** Detect circular dependencies */
  circularDependencyDetection?: boolean;
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
}

/**
 * Monitoring and metrics configuration
 */
export interface MonitoringConfig {
  /** Enable monitoring */
  enabled: boolean;
  /** Enable health check endpoint */
  enableHealthCheck?: boolean;
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
  /** Enable debug logging */
  enableDebugLogging?: boolean;
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
