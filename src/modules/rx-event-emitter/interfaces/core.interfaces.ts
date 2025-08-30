/**
 * Core interfaces for the RxJS Event Emitter Library
 * Contains fundamental event and metadata definitions
 */

export interface EventMetadata {
  id: string;
  name: string;
  timestamp: number;
  correlationId?: string;
  causationId?: string;
  version?: number;
  source?: string;
  retryCount?: number;
  headers?: Record<string, unknown>;
  priority?: number;
  tenantId?: string;
}

export interface Event<T = unknown> {
  metadata: EventMetadata;
  payload: T;
}

export interface EmitOptions {
  correlationId?: string;
  causationId?: string;
  headers?: Record<string, unknown>;
  priority?: number;
  timeout?: number;
  retryable?: boolean;
}

export interface EventStats {
  totalEmitted: number;
  totalProcessed: number;
  totalFailed: number;
  averageProcessingTime: number;
  lastEmittedAt?: number;
  lastProcessedAt?: number;
}

export interface StreamMetrics {
  bufferSize: number;
  maxBufferSize: number;
  droppedEvents: number;
  warningThreshold: number;
  backpressureActive: boolean;
  throughput: {
    eventsPerSecond: number;
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
  };
}
