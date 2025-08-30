import type { Event, PersistenceAdapter } from '../event-emitter.interfaces';

export class InMemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly events = new Map<string, Event & { processed: boolean; failed?: Error }>();

  save(event: Event): void {
    this.events.set(event.metadata.id, { ...event, processed: false });
  }

  load(id: string): Event | null {
    const event = this.events.get(id);
    return event ? { metadata: event.metadata, payload: event.payload } : null;
  }

  loadUnprocessed(): Event[] {
    return Array.from(this.events.values())
      .filter((e) => !e.processed)
      .map((e) => ({ metadata: e.metadata, payload: e.payload }));
  }

  loadAll(): Event[] {
    return Array.from(this.events.values()).map((e) => ({ metadata: e.metadata, payload: e.payload }));
  }

  markProcessed(id: string): void {
    const event = this.events.get(id);
    if (event) {
      event.processed = true;
    }
  }

  markFailed(id: string, error: Error): void {
    const event = this.events.get(id);
    if (event) {
      event.failed = error;
    }
  }

  clean(beforeDate: Date): void {
    const cutoff = beforeDate.getTime();
    for (const [id, event] of this.events.entries()) {
      if (event.metadata.timestamp < cutoff && event.processed) {
        this.events.delete(id);
      }
    }
  }
}

// Export alias for backward compatibility
export const InMemoryAdapter = InMemoryPersistenceAdapter;
