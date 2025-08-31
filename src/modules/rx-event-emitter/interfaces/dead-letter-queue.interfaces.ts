/**
 * Dead Letter Queue interfaces
 */

import type { Event } from './core.interfaces';

/**
 * Dead Letter Queue entry
 */
export interface DLQEntry {
  /** Original event */
  readonly event: Event;
  /** Error that caused the failure */
  readonly error: Error;
  /** Entry timestamp */
  readonly timestamp: number;
  /** Number of retry attempts */
  readonly attempts: number;
  /** Next retry timestamp */
  readonly nextRetryTime?: number;
  /** Last retry timestamp */
  readonly lastRetryTime?: number;
  /** Exponential delay for next retry */
  readonly exponentialDelay?: number;
  /** Maximum allowed retries */
  readonly maxRetries?: number;
  /** Whether retry is scheduled */
  readonly isScheduled?: boolean;
  /** Retry policy name */
  readonly retryPolicy?: string;
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  /** Policy name */
  readonly name: string;
  /** Maximum retry attempts */
  readonly maxRetries: number;
  /** Base delay in milliseconds */
  readonly baseDelayMs: number;
  /** Maximum delay in milliseconds */
  readonly maxDelayMs: number;
  /** Exponential backoff multiplier */
  readonly exponentialMultiplier: number;
  /** Jitter factor (0-1) */
  readonly jitterFactor: number;
  /** Enable jitter */
  readonly enableJitter: boolean;
  /** Retry conditions */
  readonly retryConditions: RetryCondition[];
}

/**
 * Retry condition interface
 */
export interface RetryCondition {
  /** Check if error should be retried */
  shouldRetry(error: Error, attempt: number): boolean;
  /** Condition description */
  readonly description: string;
}

/**
 * Dead Letter Queue metrics
 */
export interface DLQMetrics {
  /** Total entries in DLQ */
  readonly totalEntries: number;
  /** Successfully reprocessed entries */
  readonly successfulReprocessing: number;
  /** Failed reprocessing attempts */
  readonly failedReprocessing: number;
  /** Average retry time */
  readonly averageRetryTime: number;
  /** Currently processing entries */
  readonly currentlyProcessing: number;
  /** Entries scheduled for retry */
  readonly scheduledForRetry: number;
  /** Entries that exceeded max retries */
  readonly permanentFailures: number;
  /** DLQ health status */
  readonly healthStatus: 'healthy' | 'degraded' | 'critical';
  /** Last processed timestamp */
  readonly lastProcessedAt?: number;
  /** Retry policies statistics */
  readonly policyStats: Record<string, PolicyStats>;
}

/**
 * Policy statistics
 */
export interface PolicyStats {
  /** Total entries using this policy */
  readonly totalEntries: number;
  /** Success rate for this policy */
  readonly successRate: number;
  /** Average retry count */
  readonly averageRetryCount: number;
  /** Last used timestamp */
  readonly lastUsedAt?: number;
}

/**
 * DLQ configuration
 */
export interface DLQConfig {
  /** Enable dead letter queue */
  readonly enabled: boolean;
  /** Maximum entries in DLQ */
  readonly maxEntries: number;
  /** Auto-retry interval in milliseconds */
  readonly autoRetryIntervalMs: number;
  /** Default retry policy */
  readonly defaultRetryPolicy: string;
  /** Available retry policies */
  readonly retryPolicies: Record<string, RetryPolicy>;
  /** Persistence configuration */
  readonly persistence: {
    /** Enable DLQ persistence */
    readonly enabled: boolean;
    /** Storage adapter */
    readonly adapter?: string;
    /** Cleanup interval */
    readonly cleanupIntervalMs: number;
  };
}

/**
 * Dead Letter Queue Service interface
 */
export interface DeadLetterQueueService {
  /** Add entry to DLQ */
  addEntry(event: Event, error: Error, retryPolicy?: string): Promise<void>;

  /** Process next entry */
  processNext(): Promise<boolean>;

  /** Get DLQ metrics */
  getMetrics(): DLQMetrics;

  /** Get all entries */
  getEntries(limit?: number, offset?: number): Promise<DLQEntry[]>;

  /** Get entry by event ID */
  getEntry(eventId: string): Promise<DLQEntry | null>;

  /** Remove entry from DLQ */
  removeEntry(eventId: string): Promise<boolean>;

  /** Clear all entries */
  clear(): Promise<void>;

  /** Start auto-retry processing */
  startAutoRetry(): void;

  /** Stop auto-retry processing */
  stopAutoRetry(): void;

  /** Check if service is healthy */
  isHealthy(): boolean;
}
