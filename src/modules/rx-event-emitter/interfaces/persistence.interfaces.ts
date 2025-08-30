/**
 * Persistence-related interfaces for the RxJS Event Emitter Library
 * Contains persistence adapters, storage options, and backup definitions
 */

import type { Event } from './core.interfaces';

export interface PersistenceAdapter {
  save(event: Event): void | Promise<void>;
  load(id: string): Event | null | Promise<Event | null>;
  loadUnprocessed(): Event[] | Promise<Event[]>;
  markProcessed(id: string): void | Promise<void>;
  markFailed(id: string, error: Error): void | Promise<void>;
  clean(beforeDate: Date): void | Promise<void>;

  // Enhanced adapter interface
  loadByEventName?(eventName: string): Event[] | Promise<Event[]>;
  loadByTimeRange?(start: Date, end: Date): Event[] | Promise<Event[]>;
  loadByCorrelationId?(correlationId: string): Event[] | Promise<Event[]>;
  count?(): number | Promise<number>;
  getStats?(): PersistenceStats | Promise<PersistenceStats>;

  // Transaction support
  beginTransaction?(): Transaction | Promise<Transaction>;

  // Backup and restore
  backup?(destination: string): BackupResult | Promise<BackupResult>;
  restore?(source: string): RestoreResult | Promise<RestoreResult>;

  // Health checks
  healthCheck?(): HealthCheckResult | Promise<HealthCheckResult>;
}

export interface AsyncPersistenceAdapter extends PersistenceAdapter {
  save(event: Event): Promise<void>;
  load(id: string): Promise<Event | null>;
  loadUnprocessed(): Promise<Event[]>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error: Error): Promise<void>;
  clean(beforeDate: Date): Promise<void>;
}

export interface Transaction {
  id: string;
  startTime: number;
  operations: TransactionOperation[];
  commit(): void | Promise<void>;
  rollback(): void | Promise<void>;
  addOperation(operation: TransactionOperation): void;
}

export interface TransactionOperation {
  type: 'save' | 'update' | 'delete';
  eventId: string;
  data?: Event;
  timestamp: number;
}

export interface PersistenceStats {
  totalEvents: number;
  processedEvents: number;
  failedEvents: number;
  unprocessedEvents: number;
  storageSize: number; // in bytes
  oldestEvent?: Date;
  newestEvent?: Date;
  avgEventSize: number;
  compressionRatio?: number;
  indexSize?: number;
}

export interface BackupResult {
  success: boolean;
  backupId: string;
  eventCount: number;
  sizeBytes: number;
  duration: number;
  checksumMD5?: string;
  metadata?: {
    version: string;
    timestamp: Date;
    sourceAdapter: string;
  };
}

export interface RestoreResult {
  success: boolean;
  restoredCount: number;
  skippedCount: number;
  errorCount: number;
  duration: number;
  errors?: Error[];
  warnings?: string[];
}

export interface HealthCheckResult {
  healthy: boolean;
  checks: {
    connectivity: boolean;
    diskSpace: boolean;
    performance: boolean;
    integrity: boolean;
  };
  metrics: {
    responseTimeMs: number;
    availableSpaceBytes?: number;
    lastBackupAge?: number;
  };
  issues?: string[];
}

export interface EventQuery {
  eventName?: string;
  correlationId?: string;
  startTime?: Date;
  endTime?: Date;
  processed?: boolean;
  failed?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'eventName' | 'processed';
  sortOrder?: 'asc' | 'desc';
  includePayload?: boolean;
  tenantId?: string;
}

export interface QueryResult<T = Event> {
  events: T[];
  totalCount: number;
  hasMore: boolean;
  nextOffset?: number;
  executionTimeMs: number;
}

// Storage-specific adapter interfaces
export interface InMemoryAdapterConfig {
  maxEvents?: number;
  cleanupIntervalMs?: number;
  persistToDisk?: boolean;
  diskPath?: string;
}

export interface RedisAdapterConfig {
  host: string;
  port: number;
  password?: string;
  database?: number;
  keyPrefix?: string;
  ttl?: number;
  cluster?: {
    enabled: boolean;
    nodes: { host: string; port: number }[];
  };
  compression?: boolean;
  serialization?: 'json' | 'msgpack' | 'protobuf';
}

export interface DatabaseAdapterConfig {
  type: 'postgresql' | 'mysql' | 'mongodb' | 'sqlite';
  connectionString: string;
  tableName?: string;
  collectionName?: string;
  poolSize?: number;
  connectionTimeout?: number;
  queryTimeout?: number;
  migrations?: {
    enabled: boolean;
    path?: string;
  };
  indexes?: Array<{
    fields: string[];
    unique?: boolean;
    sparse?: boolean;
  }>;
}

export interface FileSystemAdapterConfig {
  basePath: string;
  fileFormat?: 'json' | 'jsonl' | 'binary';
  compression?: 'gzip' | 'brotli' | 'none';
  partitioning?: {
    strategy: 'date' | 'size' | 'count' | 'none';
    maxFileSize?: number;
    maxEventCount?: number;
    dateFormat?: string;
  };
  backup?: {
    enabled: boolean;
    retention: number; // days
    compression: boolean;
  };
}

// Cloud storage adapters
export interface S3AdapterConfig {
  bucketName: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  prefix?: string;
  storageClass?: 'STANDARD' | 'REDUCED_REDUNDANCY' | 'GLACIER';
  encryption?: {
    enabled: boolean;
    kmsKeyId?: string;
  };
}

export interface AzureBlobAdapterConfig {
  connectionString: string;
  containerName: string;
  prefix?: string;
  tier?: 'Hot' | 'Cool' | 'Archive';
}

export interface GCSAdapterConfig {
  bucketName: string;
  keyFilename?: string;
  projectId?: string;
  prefix?: string;
  storageClass?: 'STANDARD' | 'NEARLINE' | 'COLDLINE' | 'ARCHIVE';
}
