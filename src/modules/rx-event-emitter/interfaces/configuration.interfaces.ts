/**
 * Configuration interfaces for the RxJS Event Emitter Library
 * Contains all configuration options and validation rules
 */

import type { PersistenceAdapter } from './persistence.interfaces';

export interface BackpressureConfig {
  bufferSize?: number;
  bufferTimeoutMs?: number;
  overflowStrategy?: 'dropOldest' | 'dropLatest' | 'error';
  warningThreshold?: number;
  adaptiveBuffering?: boolean;
  maxBufferGrowth?: number;
}

export interface ErrorRecoveryConfig {
  enabled?: boolean;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
  maxRetryAttempts?: number;
  retryDelayMs?: number;
  exponentialBackoffMultiplier?: number;
  maxRetryDelay?: number;
  errorBoundaryIsolation?: boolean;
  faultToleranceMode?: 'strict' | 'lenient';
  errorClassification?: {
    retryable: string[];
    nonRetryable: string[];
  };
}

export interface HandlerExecutionConfig {
  defaultTimeout?: number;
  enforceTimeouts?: boolean;
  adaptiveTimeouts?: boolean;
  isolationEnabled?: boolean;
  bulkheadEnabled?: boolean;
  maxConcurrentHandlers?: number;
  handlerPoolSize?: number;
  maxQueueSize?: number;
  queueTimeoutMs?: number;
  isolationStrategy?: 'per-handler' | 'per-event-type' | 'shared';
  isolationLevel?: 'strict' | 'moderate' | 'relaxed';
  eventTypeConcurrency?: Record<string, number>;
  resourceLimits?: {
    maxMemoryMB?: number;
    maxCpuPercent?: number;
    maxExecutionTime?: number;
  };
}

export interface HandlerDiscoveryConfig {
  cacheEnabled?: boolean;
  cacheStrategy?: 'memory' | 'hybrid' | 'persistent';
  cacheTtlMs?: number;
  incrementalDiscovery?: boolean;
  preloadMetadata?: boolean;
  enableMetrics?: boolean;
  batchReflectionEnabled?: boolean;
  batchSize?: number;
  enableDebugLogging?: boolean;
  scanPatterns?: string[];
  excludePatterns?: string[];
  validationRules?: {
    requireEventName?: boolean;
    allowDynamicEvents?: boolean;
    maxHandlersPerEvent?: number;
  };
}

export interface ValidationConfig {
  enableDependencyAnalysis?: boolean;
  strictDependencyValidation?: boolean;
  logDependencyGraph?: boolean;
  circularDependencyDetection?: boolean;
  validateProviderConstraints?: boolean;
  enforceTypeChecking?: boolean;
  requireHandlerDocumentation?: boolean;
  maxComplexityScore?: number;
  performanceThresholds?: {
    maxLatencyMs?: number;
    maxMemoryMB?: number;
    minThroughput?: number;
  };
}

export interface PersistenceConfig {
  enabled: boolean;
  adapter?: PersistenceAdapter;
  retentionDays?: number;
  compressionEnabled?: boolean;
  encryptionEnabled?: boolean;
  backupEnabled?: boolean;
  shardingStrategy?: 'none' | 'time' | 'hash' | 'custom';
  indexingStrategy?: 'basic' | 'advanced' | 'full-text';
}

export interface DeadLetterQueueConfig {
  enabled: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  exponentialBackoff?: boolean;
  maxBackoffMs?: number;
  jitterEnabled?: boolean;
  batchProcessing?: boolean;
  batchSize?: number;
  alerting?: {
    enabled: boolean;
    thresholds: {
      queueSize?: number;
      failureRate?: number;
      oldestEventAgeMs?: number;
    };
  };
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsPort?: number;
  enablePrometheus?: boolean;
  enableHealthCheck?: boolean;
  enableTracing?: boolean;
  samplingRate?: number;
  customMetrics?: string[];
  dashboard?: {
    enabled: boolean;
    port?: number;
    refreshIntervalMs?: number;
  };
}

export interface TenantIsolationConfig {
  enabled: boolean;
  tenantIdField?: string;
  isolationLevel?: 'strict' | 'moderate' | 'shared';
  defaultTenant?: string;
  allowCrossTenant?: boolean;
  tenantValidation?: (tenantId: string) => boolean;
}

export interface EventEmitterOptions {
  persistence?: PersistenceConfig;
  dlq?: DeadLetterQueueConfig;
  monitoring?: MonitoringConfig;
  maxConcurrency?: number;
  backpressure?: BackpressureConfig;
  errorRecovery?: ErrorRecoveryConfig;
  handlerExecution?: HandlerExecutionConfig;
  handlerDiscovery?: HandlerDiscoveryConfig;
  validation?: ValidationConfig;
  tenantIsolation?: TenantIsolationConfig;

  // Advanced options
  experimental?: {
    enableStreamOptimization?: boolean;
    enableAsyncHandlers?: boolean;
    enableBatchProcessing?: boolean;
    enableEventSourcing?: boolean;
    enableCQRS?: boolean;
  };

  // Debug and development options
  debug?: {
    enableVerboseLogging?: boolean;
    logEventFlow?: boolean;
    logHandlerExecution?: boolean;
    enablePerformanceMetrics?: boolean;
    saveStackTraces?: boolean;
  };
}

export interface ModuleConfig extends EventEmitterOptions {
  global?: boolean;
  imports?: unknown[];
  exports?: unknown[];
}

// Configuration validation schemas
export interface ConfigurationValidator {
  validateOptions(options: EventEmitterOptions): ValidationResult;
  validateHandlerOptions(options: HandlerOptions): ValidationResult;
  validatePersistenceAdapter(adapter: PersistenceAdapter): ValidationResult;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recommendations?: string[];
}
