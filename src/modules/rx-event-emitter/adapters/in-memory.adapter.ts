import type { Event, PersistenceAdapter } from '../event-emitter.interfaces';

export class InMemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly events = new Map<string, Event & { processed: boolean; failed?: Error }>();

  async save(event: Event): Promise<void> {
    this.events.set(event.metadata.id, { ...event, processed: false });
  }

  async load(id: string): Promise<Event | null> {
    const event = this.events.get(id);
    return event ? { metadata: event.metadata, payload: event.payload } : null;
  }

  async loadUnprocessed(): Promise<Event[]> {
    return Array.from(this.events.values())
      .filter((e) => !e.processed)
      .map((e) => ({ metadata: e.metadata, payload: e.payload }));
  }

  async markProcessed(id: string): Promise<void> {
    const event = this.events.get(id);
    if (event) {
      event.processed = true;
    }
  }

  async markFailed(id: string, error: Error): Promise<void> {
    const event = this.events.get(id);
    if (event) {
      event.failed = error;
    }
  }

  async clean(beforeDate: Date): Promise<void> {
    const cutoff = beforeDate.getTime();
    for (const [id, event] of this.events.entries()) {
      if (event.metadata.timestamp < cutoff && event.processed) {
        this.events.delete(id);
      }
    }
  }
}
