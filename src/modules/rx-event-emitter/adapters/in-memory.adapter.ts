import type { Event, PersistenceAdapter, PersistenceStats, HealthCheckResult } from '../interfaces';

/**
 * In-memory implementation of PersistenceAdapter
 *
 * This adapter stores events in memory and is suitable for:
 * - Development and testing
 * - Small applications with low event volume
 * - Scenarios where persistence is not required across restarts
 *
 * Note: All data is lost when the application restarts.
 *
 * @example
 * ```typescript
 * const adapter = new InMemoryPersistenceAdapter();
 *
 * // Save event
 * adapter.save(event);
 *
 * // Load unprocessed events
 * const pending = adapter.loadUnprocessed();
 * ```
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
   * Load all events (processed and unprocessed)
   * @deprecated Use query methods instead for better performance
   */
  loadAll(): Event[] {
    return Array.from(this.events.values()).map((e) => ({ metadata: e.metadata, payload: e.payload }));
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

    const timestamps = events.map((e) => e.metadata.timestamp).filter((t) => t);
    const oldestEvent = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : undefined;
    const newestEvent = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : undefined;

    return {
      totalEvents: events.length,
      processedEvents,
      failedEvents,
      unprocessedEvents: events.length - processedEvents,
      storageSize: totalSize,
      oldestEvent,
      newestEvent,
      avgEventSize: events.length > 0 ? Math.round(totalSize / events.length) : 0,
      performance: {
        operationsPerSecond: 0, // In-memory is instant
        avgLoadTime: 0,
        avgQueryTime: 0,
        avgSaveTime: 0,
      },
      health: {
        isHealthy: false,
        lastHealthCheck: 0,
        connected: false,
      },
    };
  }

  /**
   * Perform health check
   */
  healthCheck(): HealthCheckResult {
    const stats = this.getStats();
    const memoryUsage = process.memoryUsage();

    return {
      healthy: true,
      checks: {
        connectivity: true,
        diskSpace: true,
        performance: stats.totalEvents < 10000, // Warn if too many events in memory
        integrity: true,
        backup: true,
      },
      metrics: {
        responseTimeMs: 0, // In-memory is instant
        availableSpaceBytes: memoryUsage.heapTotal - memoryUsage.heapUsed,
        errorRate: 0,
      },
      issues: stats.totalEvents >= 10000 ? ['High event count in memory - consider using persistent storage'] : [],
      timestamp: 0,
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
