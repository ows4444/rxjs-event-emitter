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

  // Health monitoring
  /** Perform health check on storage */
  readonly healthCheck?: () => HealthCheckResult | Promise<HealthCheckResult>;
}

/**
 * Async-only version of persistence adapter
 * All operations return promises for better async/await support
 */
export interface AsyncPersistenceAdapter extends PersistenceAdapter {
  /** Save an event asynchronously */
  save(event: Event): Promise<void>;

  /** Load an event asynchronously */
  load(id: string): Promise<Event | null>;

  /** Load unprocessed events asynchronously */
  loadUnprocessed(): Promise<Event[]>;

  /** Mark event as processed asynchronously */
  markProcessed(id: string): Promise<void>;

  /** Mark event as failed asynchronously */
  markFailed(id: string, error: Error): Promise<void>;

  /** Clean old events asynchronously */
  clean(beforeDate: Date): Promise<void>;
}

/**
 * Transaction interface for atomic operations
 * Ensures data consistency across multiple persistence operations
 */
export interface Transaction {
  /** Unique transaction identifier */
  readonly id: string;

  /** Transaction start timestamp */
  readonly startTime: number;

  /** List of operations in this transaction */
  readonly operations: readonly TransactionOperation[];

  /** Commit all operations atomically */
  commit(): void | Promise<void>;

  /** Rollback all operations */
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

  /** Total storage size in bytes */
  readonly storageSize: number;

  /** Timestamp of oldest event */
  readonly oldestEvent?: Date;

  /** Timestamp of newest event */
  readonly newestEvent?: Date;

  /** Average event size in bytes */
  readonly avgEventSize: number;

  /** Compression ratio if compression is enabled */
  readonly compressionRatio?: number;

  /** Index size in bytes */
  readonly indexSize?: number;

  /** Performance metrics */
  readonly performance: {
    /** Average save operation time in ms */
    readonly avgSaveTime: number;
    /** Average load operation time in ms */
    readonly avgLoadTime: number;
    /** Average query time in ms */
    readonly avgQueryTime: number;
    /** Operations per second */
    readonly operationsPerSecond: number;
  };

  /** Health metrics */
  readonly health: {
    /** Storage is healthy */
    readonly isHealthy: boolean;
    /** Last health check timestamp */
    readonly lastHealthCheck: number;
    /** Available storage space in bytes */
    readonly availableSpace?: number;
    /** Connection status */
    readonly connected: boolean;
  };
}

/**
 * Result of backup operation
 */
export interface BackupResult {
  /** Whether backup was successful */
  readonly success: boolean;

  /** Unique backup identifier */
  readonly backupId: string;

  /** Number of events backed up */
  readonly eventCount: number;

  /** Backup size in bytes */
  readonly sizeBytes: number;

  /** Backup duration in milliseconds */
  readonly duration: number;

  /** MD5 checksum for integrity verification */
  readonly checksumMD5?: string;

  /** Backup metadata */
  readonly metadata?: {
    /** Schema version */
    readonly version: string;
    /** Backup timestamp */
    readonly timestamp: Date;
    /** Source adapter type */
    readonly sourceAdapter: string;
    /** Compression used */
    readonly compression?: string;
    /** Encryption used */
    readonly encryption?: boolean;
  };

  /** Errors encountered during backup */
  readonly errors?: readonly string[];

  /** Warnings generated during backup */
  readonly warnings?: readonly string[];
}

/**
 * Result of restore operation
 */
export interface RestoreResult {
  /** Whether restore was successful */
  readonly success: boolean;

  /** Number of events successfully restored */
  readonly restoredCount: number;

  /** Number of events skipped (duplicates, etc.) */
  readonly skippedCount: number;

  /** Number of events that failed to restore */
  readonly errorCount: number;

  /** Restore duration in milliseconds */
  readonly duration: number;

  /** Errors encountered during restore */
  readonly errors?: readonly Error[];

  /** Warnings generated during restore */
  readonly warnings?: readonly string[];

  /** Validation results */
  readonly validation?: {
    /** Checksum validation passed */
    readonly checksumValid: boolean;
    /** Schema version compatibility */
    readonly schemaCompatible: boolean;
    /** Data integrity check */
    readonly dataIntegrityValid: boolean;
  };
}

/**
 * Health check result for persistence layer
 */
export interface HealthCheckResult {
  /** Overall health status */
  readonly healthy: boolean;

  /** Individual health checks */
  readonly checks: {
    /** Connection to storage is working */
    readonly connectivity: boolean;
    /** Sufficient disk space available */
    readonly diskSpace: boolean;
    /** Performance is within acceptable limits */
    readonly performance: boolean;
    /** Data integrity is maintained */
    readonly integrity: boolean;
    /** Backups are up to date */
    readonly backup: boolean;
  };

  /** Health metrics */
  readonly metrics: {
    /** Average response time in milliseconds */
    readonly responseTimeMs: number;
    /** Available storage space in bytes */
    readonly availableSpaceBytes?: number;
    /** Age of last backup in hours */
    readonly lastBackupAge?: number;
    /** Error rate as percentage */
    readonly errorRate: number;
    /** Current connection count */
    readonly connectionCount?: number;
  };

  /** Health issues found */
  readonly issues?: readonly string[];

  /** Recommendations for improvement */
  readonly recommendations?: readonly string[];

  /** Last health check timestamp */
  readonly timestamp: number;
}

/**
 * Query parameters for event retrieval
 * Provides flexible filtering and pagination options
 */
export interface EventQuery {
  /** Filter by event name/type */
  readonly eventName?: string;

  /** Filter by correlation ID */
  readonly correlationId?: string;

  /** Filter by causation ID */
  readonly causationId?: string;

  /** Start time for time range filter */
  readonly startTime?: Date;

  /** End time for time range filter */
  readonly endTime?: Date;

  /** Filter by processing status */
  readonly processed?: boolean;

  /** Filter by failure status */
  readonly failed?: boolean;

  /** Maximum number of results */
  readonly limit?: number;

  /** Pagination offset */
  readonly offset?: number;

  /** Sort field */
  readonly sortBy?: 'timestamp' | 'eventName' | 'processed' | 'priority' | 'retryCount';

  /** Sort order */
  readonly sortOrder?: 'asc' | 'desc';

  /** Include event payload in results */
  readonly includePayload?: boolean;

  /** Filter by event priority */
  readonly priority?: number | readonly number[];

  /** Filter by event source */
  readonly source?: string;

  /** Full-text search in payload */
  readonly searchText?: string;

  /** Custom metadata filters */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Result of event query operation
 */
export interface QueryResult<T = Event> {
  /** Retrieved events */
  readonly events: readonly T[];

  /** Total count of matching events */
  readonly totalCount: number;

  /** Whether more results are available */
  readonly hasMore: boolean;

  /** Next offset for pagination */
  readonly nextOffset?: number;

  /** Query execution time in milliseconds */
  readonly executionTimeMs: number;

  /** Query metadata */
  readonly metadata: {
    /** Query parameters used */
    readonly query: EventQuery;
    /** Query timestamp */
    readonly timestamp: number;
    /** Cache hit status */
    readonly cacheHit?: boolean;
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

/**
 * Configuration for Redis persistence adapter
 */
export interface RedisAdapterConfig {
  /** Redis host */
  readonly host: string;

  /** Redis port */
  readonly port: number;

  /** Redis password */
  readonly password?: string;

  /** Redis database number */
  readonly database?: number;

  /** Key prefix for events */
  readonly keyPrefix?: string;

  /** Time to live in seconds */
  readonly ttl?: number;

  /** Redis cluster configuration */
  readonly cluster?: {
    /** Enable cluster mode */
    readonly enabled: boolean;
    /** Cluster nodes */
    readonly nodes: readonly {
      readonly host: string;
      readonly port: number;
    }[];
    /** Cluster options */
    readonly options?: {
      readonly enableReadyCheck?: boolean;
      readonly redisOptions?: Record<string, unknown>;
      readonly maxRetriesPerRequest?: number;
    };
  };

  /** Enable compression */
  readonly compression?: boolean;

  /** Serialization format */
  readonly serialization?: 'json' | 'msgpack' | 'protobuf';

  /** Connection pool configuration */
  readonly pool?: {
    /** Minimum connections */
    readonly min: number;
    /** Maximum connections */
    readonly max: number;
    /** Connection timeout in ms */
    readonly acquireTimeoutMs: number;
    /** Idle timeout in ms */
    readonly idleTimeoutMs: number;
  };
}

/**
 * Configuration for database persistence adapters
 */
export interface DatabaseAdapterConfig {
  /** Database type */
  readonly type: 'postgresql' | 'mysql' | 'mongodb' | 'sqlite' | 'mariadb';

  /** Database connection string */
  readonly connectionString: string;

  /** Table name for SQL databases */
  readonly tableName?: string;

  /** Collection name for MongoDB */
  readonly collectionName?: string;

  /** Connection pool size */
  readonly poolSize?: number;

  /** Connection timeout in milliseconds */
  readonly connectionTimeout?: number;

  /** Query timeout in milliseconds */
  readonly queryTimeout?: number;

  /** Migration configuration */
  readonly migrations?: {
    /** Enable automatic migrations */
    readonly enabled: boolean;
    /** Migration files path */
    readonly path?: string;
    /** Migration table name */
    readonly tableName?: string;
  };

  /** Database indexes */
  readonly indexes?: readonly {
    /** Index fields */
    readonly fields: readonly string[];
    /** Unique constraint */
    readonly unique?: boolean;
    /** Sparse index */
    readonly sparse?: boolean;
    /** Index name */
    readonly name?: string;
    /** Partial index condition */
    readonly condition?: string;
  }[];

  /** SSL configuration */
  readonly ssl?: {
    /** Enable SSL */
    readonly enabled: boolean;
    /** Reject unauthorized certificates */
    readonly rejectUnauthorized?: boolean;
    /** Certificate authority */
    readonly ca?: string;
    /** Client certificate */
    readonly cert?: string;
    /** Client key */
    readonly key?: string;
  };

  /** Query optimization */
  readonly optimization?: {
    /** Enable query caching */
    readonly enableQueryCache: boolean;
    /** Cache TTL in seconds */
    readonly cacheTtlSeconds: number;
    /** Batch size for bulk operations */
    readonly batchSize: number;
  };
}

/**
 * Configuration for file system persistence adapter
 */
export interface FileSystemAdapterConfig {
  /** Base directory path for event storage */
  readonly basePath: string;

  /** File format for event storage */
  readonly fileFormat?: 'json' | 'jsonl' | 'binary' | 'avro' | 'parquet';

  /** Compression algorithm */
  readonly compression?: 'gzip' | 'brotli' | 'lz4' | 'snappy' | 'none';

  /** File partitioning strategy */
  readonly partitioning?: {
    /** Partitioning strategy */
    readonly strategy: 'date' | 'size' | 'count' | 'hash' | 'none';
    /** Maximum file size in bytes */
    readonly maxFileSize?: number;
    /** Maximum events per file */
    readonly maxEventCount?: number;
    /** Date format for date-based partitioning */
    readonly dateFormat?: string;
    /** Hash field for hash-based partitioning */
    readonly hashField?: string;
    /** Number of partitions for hash-based partitioning */
    readonly partitionCount?: number;
  };

  /** Backup configuration */
  readonly backup?: {
    /** Enable backups */
    readonly enabled: boolean;
    /** Backup retention in days */
    readonly retention: number;
    /** Compress backup files */
    readonly compression: boolean;
    /** Backup destination path */
    readonly destinationPath?: string;
    /** Backup schedule (cron expression) */
    readonly schedule?: string;
  };

  /** File system permissions */
  readonly permissions?: {
    /** File permissions (octal) */
    readonly fileMode: string;
    /** Directory permissions (octal) */
    readonly dirMode: string;
    /** Owner user */
    readonly owner?: string;
    /** Owner group */
    readonly group?: string;
  };

  /** Performance tuning */
  readonly performance?: {
    /** Write buffer size */
    readonly writeBufferSize: number;
    /** Use write-ahead logging */
    readonly useWAL: boolean;
    /** Sync to disk frequency */
    readonly syncIntervalMs: number;
  };
}

// =============================================================================
// CLOUD STORAGE ADAPTER CONFIGURATIONS
// =============================================================================

/**
 * Configuration for AWS S3 persistence adapter
 */
export interface S3AdapterConfig {
  /** S3 bucket name */
  readonly bucketName: string;

  /** AWS region */
  readonly region: string;

  /** AWS access key ID */
  readonly accessKeyId?: string;

  /** AWS secret access key */
  readonly secretAccessKey?: string;

  /** S3 key prefix */
  readonly prefix?: string;

  /** S3 storage class */
  readonly storageClass?: 'STANDARD' | 'REDUCED_REDUNDANCY' | 'GLACIER' | 'GLACIER_IR' | 'DEEP_ARCHIVE';

  /** Server-side encryption configuration */
  readonly encryption?: {
    /** Enable encryption */
    readonly enabled: boolean;
    /** KMS key ID for encryption */
    readonly kmsKeyId?: string;
    /** Encryption algorithm */
    readonly algorithm?: 'AES256' | 'aws:kms';
  };

  /** Multipart upload configuration */
  readonly multipartUpload?: {
    /** Enable multipart uploads */
    readonly enabled: boolean;
    /** Part size in bytes */
    readonly partSize: number;
    /** Maximum concurrent parts */
    readonly maxConcurrentParts: number;
  };

  /** S3 transfer acceleration */
  readonly transferAcceleration?: boolean;

  /** Versioning configuration */
  readonly versioning?: {
    /** Enable object versioning */
    readonly enabled: boolean;
    /** Keep version count */
    readonly maxVersions?: number;
  };
}

/**
 * Configuration for Azure Blob Storage persistence adapter
 */
export interface AzureBlobAdapterConfig {
  /** Azure storage connection string */
  readonly connectionString: string;

  /** Blob container name */
  readonly containerName: string;

  /** Blob name prefix */
  readonly prefix?: string;

  /** Access tier for cost optimization */
  readonly tier?: 'Hot' | 'Cool' | 'Archive';

  /** Authentication configuration */
  readonly auth?: {
    /** Use managed identity */
    readonly useManagedIdentity?: boolean;
    /** Account name for key-based auth */
    readonly accountName?: string;
    /** Account key for key-based auth */
    readonly accountKey?: string;
    /** SAS token */
    readonly sasToken?: string;
  };

  /** Encryption configuration */
  readonly encryption?: {
    /** Enable client-side encryption */
    readonly enabled: boolean;
    /** Encryption key */
    readonly key?: string;
    /** Key vault URL */
    readonly keyVaultUrl?: string;
  };

  /** Redundancy configuration */
  readonly redundancy?: 'LRS' | 'ZRS' | 'GRS' | 'RA-GRS' | 'GZRS' | 'RA-GZRS';
}

/**
 * Configuration for Google Cloud Storage persistence adapter
 */
export interface GCSAdapterConfig {
  /** GCS bucket name */
  readonly bucketName: string;

  /** Service account key file path */
  readonly keyFilename?: string;

  /** Google Cloud project ID */
  readonly projectId?: string;

  /** Object name prefix */
  readonly prefix?: string;

  /** Storage class for cost optimization */
  readonly storageClass?: 'STANDARD' | 'NEARLINE' | 'COLDLINE' | 'ARCHIVE';

  /** Authentication configuration */
  readonly auth?: {
    /** Service account email */
    readonly clientEmail?: string;
    /** Private key */
    readonly privateKey?: string;
    /** Use Application Default Credentials */
    readonly useADC?: boolean;
  };

  /** Encryption configuration */
  readonly encryption?: {
    /** Enable customer-supplied encryption */
    readonly enabled: boolean;
    /** Encryption key */
    readonly key?: string;
    /** KMS key name */
    readonly kmsKeyName?: string;
  };

  /** Lifecycle management */
  readonly lifecycle?: {
    /** Enable lifecycle rules */
    readonly enabled: boolean;
    /** Rules for object transitions */
    readonly rules: readonly {
      /** Condition for rule */
      readonly condition: {
        /** Age in days */
        readonly age?: number;
        /** Created before date */
        readonly createdBefore?: string;
        /** Matches storage class */
        readonly matchesStorageClass?: readonly string[];
      };
      /** Action to take */
      readonly action: {
        /** Action type */
        readonly type: 'Delete' | 'SetStorageClass';
        /** Target storage class */
        readonly storageClass?: string;
      };
    }[];
  };
}
