import type { Event, PersistenceAdapter, PersistenceStats, HealthCheckResult } from '../interfaces';

/**
 * In-memory implementation of PersistenceAdapter
 */
export class InMemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly events = new Map<string, Event & { processed: boolean; failed?: Error; createdAt: number }>();

  /**
   * Save an event to memory
   */
  save(event: Event): void {
    this.events.set(event.metadata.id, {
      ...event,
      processed: false,
      createdAt: Date.now(),
    });
  }

  /**
   * Load a specific event by ID
   */
  load(id: string): Event | null {
    const event = this.events.get(id);
    return event ? { metadata: event.metadata, payload: event.payload } : null;
  }

  /**
   * Load all unprocessed events
   */
  loadUnprocessed(): Event[] {
    return Array.from(this.events.values())
      .filter((e) => !e.processed)
      .map((e) => ({ metadata: e.metadata, payload: e.payload }));
  }

  /**
   * Mark an event as processed
   */
  markProcessed(id: string): void {
    const event = this.events.get(id);
    if (event) {
      event.processed = true;
    }
  }

  /**
   * Mark an event as failed
   */
  markFailed(id: string, error: Error): void {
    const event = this.events.get(id);
    if (event) {
      event.failed = error;
    }
  }

  /**
   * Clean up processed events older than the specified date
   */
  clean(beforeDate: Date): void {
    const cutoff = beforeDate.getTime();
    for (const [id, event] of this.events.entries()) {
      if (event.metadata.timestamp < cutoff && event.processed) {
        this.events.delete(id);
      }
    }
  }

  /**
   * Get persistence statistics
   */
  getStats(): PersistenceStats {
    const events = Array.from(this.events.values());
    const processedEvents = events.filter((e) => e.processed).length;
    const failedEvents = events.filter((e) => e.failed).length;
    const totalSize = JSON.stringify(events).length;

    return {
      totalEvents: events.length,
      processedEvents,
      failedEvents,
      unprocessedEvents: events.length - processedEvents,
      storageSize: totalSize,
      averageEventSize: events.length > 0 ? Math.round(totalSize / events.length) : 0,
      utilization: 0,
      performance: {
        avgSaveTime: 0,
        avgLoadTime: 0,
        operationsPerSecond: 1000,
        cacheHitRatio: 1,
      },
      errors: {
        totalErrors: failedEvents,
        errorRate: events.length > 0 ? failedEvents / events.length : 0,
        lastErrorAt: undefined,
      },
      collectedAt: Date.now(),
    };
  }

  /**
   * Perform health check
   */
  healthCheck(): HealthCheckResult {
    return {
      status: 'healthy' as const,
      responseTime: 0,
      connection: {
        available: true,
      },
      storage: {
        accessible: true,
      },
      performance: {
        latency: 0,
        throughput: 1000,
        errorRate: 0,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Get current event count
   */
  count(): number {
    return this.events.size;
  }

  /**
   * Clear all events (use with caution)
   */
  clear(): void {
    this.events.clear();
  }
}

/**
 * @deprecated Use InMemoryPersistenceAdapter instead
 */
export const InMemoryAdapter = InMemoryPersistenceAdapter;
