import type { Event } from './core.interfaces';

/**
 * Base interface for event persistence adapters
 * Provides both synchronous and asynchronous storage capabilities
 */
export interface PersistenceAdapter {
  /** Save an event to persistent storage */
  save(event: Event): void | Promise<void>;

  /** Load a specific event by ID */
  load(id: string): Event | null | Promise<Event | null>;

  /** Load all unprocessed events */
  loadUnprocessed(): Event[] | Promise<Event[]>;

  /** Mark an event as successfully processed */
  markProcessed(id: string): void | Promise<void>;

  /** Mark an event as failed with error details */
  markFailed(id: string, error: Error): void | Promise<void>;

  /** Clean up events older than the specified date */
  clean(beforeDate: Date): void | Promise<void>;

  // Extended query capabilities
  /** Load events by event name/type */
  readonly loadByEventName?: (eventName: string) => Event[] | Promise<Event[]>;

  /** Load events within a time range */
  readonly loadByTimeRange?: (start: Date, end: Date) => Event[] | Promise<Event[]>;

  /** Load events by correlation ID for tracing */
  readonly loadByCorrelationId?: (correlationId: string) => Event[] | Promise<Event[]>;

  /** Get total count of stored events */
  readonly count?: () => number | Promise<number>;

  /** Get persistence layer statistics */
  readonly getStats?: () => PersistenceStats | Promise<PersistenceStats>;

  // Transaction support for atomic operations
  /** Begin a new transaction */
  readonly beginTransaction?: () => Transaction | Promise<Transaction>;

  // Backup and restore capabilities
  /** Create a backup of events */
  readonly backup?: (destination: string) => BackupResult | Promise<BackupResult>;

  /** Restore events from backup */
  readonly restore?: (source: string) => RestoreResult | Promise<RestoreResult>;

  // Health check capabilities
  /** Check adapter health */
  readonly healthCheck?: () => HealthCheckResult | Promise<HealthCheckResult>;

  // Query capabilities for complex event retrieval
  /** Query events with complex filters */
  readonly query?: <T = Event>(query: EventQuery) => QueryResult<T> | Promise<QueryResult<T>>;
}

/**
 * Extended async persistence adapter interface
 */
export interface AsyncPersistenceAdapter extends PersistenceAdapter {
  /** All operations return promises */
  save(event: Event): Promise<void>;
  load(id: string): Promise<Event | null>;
  loadUnprocessed(): Promise<Event[]>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error: Error): Promise<void>;
  clean(beforeDate: Date): Promise<void>;

  /** Extended async methods */
  readonly loadByEventName: (eventName: string) => Promise<Event[]>;
  readonly loadByTimeRange: (start: Date, end: Date) => Promise<Event[]>;
  readonly loadByCorrelationId: (correlationId: string) => Promise<Event[]>;
  readonly count: () => Promise<number>;
  readonly getStats: () => Promise<PersistenceStats>;
  readonly beginTransaction: () => Promise<Transaction>;
  readonly backup: (destination: string) => Promise<BackupResult>;
  readonly restore: (source: string) => Promise<RestoreResult>;
  readonly healthCheck: () => Promise<HealthCheckResult>;
  readonly query: <T = Event>(query: EventQuery) => Promise<QueryResult<T>>;
}

/**
 * Transaction interface for atomic operations
 */
export interface Transaction {
  /** Commit all operations in transaction */
  commit(): void | Promise<void>;

  /** Rollback all operations in transaction */
  rollback(): void | Promise<void>;

  /** Add an operation to the transaction */
  addOperation(operation: TransactionOperation): void;

  /** Check if transaction is still active */
  readonly isActive: boolean;

  /** Transaction timeout in milliseconds */
  readonly timeoutMs?: number;
}

/**
 * Individual operation within a transaction
 */
export interface TransactionOperation {
  /** Type of operation to perform */
  readonly type: 'save' | 'update' | 'delete' | 'mark_processed' | 'mark_failed';

  /** Target event ID */
  readonly eventId: string;

  /** Event data for save/update operations */
  readonly data?: Event;

  /** Operation timestamp */
  readonly timestamp: number;

  /** Error data for mark_failed operations */
  readonly error?: Error;

  /** Rollback function for this operation */
  readonly rollback?: () => void | Promise<void>;
}

/**
 * Statistics about persistence layer performance
 */
export interface PersistenceStats {
  /** Total number of events in storage */
  readonly totalEvents: number;

  /** Number of successfully processed events */
  readonly processedEvents: number;

  /** Number of failed events */
  readonly failedEvents: number;

  /** Number of unprocessed events */
  readonly unprocessedEvents: number;

  /** Storage size in bytes */
  readonly storageSize: number;

  /** Average event size in bytes */
  readonly averageEventSize: number;

  /** Storage utilization percentage */
  readonly utilization: number;

  /** Performance metrics */
  readonly performance: {
    /** Average save time in milliseconds */
    readonly avgSaveTime: number;
    /** Average load time in milliseconds */
    readonly avgLoadTime: number;
    /** Operations per second */
    readonly operationsPerSecond: number;
    /** Cache hit ratio */
    readonly cacheHitRatio?: number;
  };

  /** Error statistics */
  readonly errors: {
    /** Total error count */
    readonly totalErrors: number;
    /** Error rate (errors/operations) */
    readonly errorRate: number;
    /** Last error timestamp */
    readonly lastErrorAt?: number;
  };

  /** Timestamp of when stats were collected */
  readonly collectedAt: number;
}

/**
 * Result of backup operation
 */
export interface BackupResult {
  /** Backup operation success status */
  readonly success: boolean;

  /** Number of events backed up */
  readonly eventsBackedUp: number;

  /** Backup size in bytes */
  readonly backupSize: number;

  /** Backup file path or identifier */
  readonly backupLocation: string;

  /** Backup duration in milliseconds */
  readonly duration: number;

  /** Backup timestamp */
  readonly timestamp: number;

  /** Backup format version */
  readonly version: string;

  /** Error message if backup failed */
  readonly error?: string;

  /** Backup metadata */
  readonly metadata?: {
    /** Backup method used */
    readonly method: 'full' | 'incremental' | 'differential';
    /** Compression used */
    readonly compression?: string;
    /** Encryption used */
    readonly encryption?: string;
  };
}

/**
 * Result of restore operation
 */
export interface RestoreResult {
  /** Restore operation success status */
  readonly success: boolean;

  /** Number of events restored */
  readonly eventsRestored: number;

  /** Number of events skipped (duplicates) */
  readonly eventsSkipped: number;

  /** Number of events failed to restore */
  readonly eventsFailed: number;

  /** Restore duration in milliseconds */
  readonly duration: number;

  /** Restore timestamp */
  readonly timestamp: number;

  /** Source backup version */
  readonly backupVersion: string;

  /** Errors encountered during restore */
  readonly errors: readonly string[];

  /** Restore warnings */
  readonly warnings: readonly string[];
}

/**
 * Health check result for persistence adapter
 */
export interface HealthCheckResult {
  /** Overall health status */
  readonly status: 'healthy' | 'degraded' | 'unhealthy';

  /** Response time in milliseconds */
  readonly responseTime: number;

  /** Connection status */
  readonly connection: {
    /** Connection available */
    readonly available: boolean;
    /** Connection pool status */
    readonly poolStatus?: 'healthy' | 'degraded' | 'exhausted';
    /** Active connections */
    readonly activeConnections?: number;
  };

  /** Storage status */
  readonly storage: {
    /** Storage accessible */
    readonly accessible: boolean;
    /** Available storage space */
    readonly availableSpace?: number;
    /** Storage utilization */
    readonly utilization?: number;
  };

  /** Performance metrics */
  readonly performance: {
    /** Recent operation latency */
    readonly latency: number;
    /** Operations per second */
    readonly throughput: number;
    /** Error rate */
    readonly errorRate: number;
  };

  /** Health check timestamp */
  readonly timestamp: number;

  /** Additional details or error messages */
  readonly details?: string;
}

/**
 * Query interface for complex event filtering
 */
export interface EventQuery {
  /** Event name filter */
  readonly eventName?: string | readonly string[];

  /** Event ID filter */
  readonly eventId?: string | readonly string[];

  /** Time range filter */
  readonly timeRange?: {
    readonly start: Date;
    readonly end: Date;
  };

  /** Correlation ID filter */
  readonly correlationId?: string | readonly string[];

  /** Event status filter */
  readonly status?: 'processed' | 'unprocessed' | 'failed';

  /** Payload content filter */
  readonly payloadFilter?: {
    readonly field: string;
    readonly operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
    readonly value: unknown;
  };

  /** Result pagination */
  readonly pagination?: {
    readonly offset: number;
    readonly limit: number;
  };

  /** Result sorting */
  readonly sorting?: {
    readonly field: string;
    readonly direction: 'asc' | 'desc';
  };
}

/**
 * Query result wrapper with metadata
 */
export interface QueryResult<T = Event> {
  /** Query result events */
  readonly events: readonly T[];

  /** Total count (before pagination) */
  readonly totalCount: number;

  /** Query execution time in milliseconds */
  readonly executionTime: number;

  /** Whether result is from cache */
  readonly cached?: boolean;

  /** Result metadata */
  readonly metadata: {
    /** Query hash for caching */
    readonly queryHash: string;
    /** Execution timestamp */
    readonly timestamp: number;
    /** Index usage information */
    readonly indexUsed?: readonly string[];
  };
}

// =============================================================================
// STORAGE-SPECIFIC ADAPTER CONFIGURATIONS
// =============================================================================

/**
 * Configuration for in-memory persistence adapter
 */
export interface InMemoryAdapterConfig {
  /** Maximum number of events to store in memory */
  readonly maxEvents?: number;

  /** Cleanup interval in milliseconds */
  readonly cleanupIntervalMs?: number;

  /** Whether to persist to disk for durability */
  readonly persistToDisk?: boolean;

  /** Disk path for persistence */
  readonly diskPath?: string;

  /** Enable compression for disk persistence */
  readonly compressionEnabled?: boolean;

  /** Backup configuration */
  readonly backup?: {
    /** Enable automatic backups */
    readonly enabled: boolean;
    /** Backup interval in milliseconds */
    readonly intervalMs: number;
    /** Backup retention in days */
    readonly retentionDays: number;
  };
}
