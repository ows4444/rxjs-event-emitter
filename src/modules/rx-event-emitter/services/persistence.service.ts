import { Injectable, Logger } from '@nestjs/common';
import { Event, EventStatus, DLQEntry } from '../interfaces';

@Injectable()
export class PersistenceService {
  private readonly logger = new Logger(PersistenceService.name);
  private readonly events = new Map<string, Event & { status: EventStatus }>();

  save(event: Event, status: EventStatus = EventStatus.PENDING): void {
    try {
      this.events.set(event.metadata.id, { ...event, status });
      this.logger.debug(`Event persisted: ${event.metadata.name} (${event.metadata.id}) with status ${status}`);
    } catch (error) {
      this.logger.error(`Failed to persist event ${event.metadata.id}:`, error);
      throw error;
    }
  }

  updateStatus(eventId: string, status: EventStatus): void {
    const event = this.events.get(eventId);
    if (event) {
      event.status = status;
      this.logger.debug(`Event status updated: ${eventId} -> ${status}`);
    } else {
      this.logger.warn(`Event not found for status update: ${eventId}`);
    }
  }

  getById(eventId: string): (Event & { status: EventStatus }) | undefined {
    return this.events.get(eventId);
  }

  getByStatus(status: EventStatus): (Event & { status: EventStatus })[] {
    return Array.from(this.events.values()).filter((event) => event.status === status);
  }

  getUnprocessed(): (Event & { status: EventStatus })[] {
    return this.getByStatus(EventStatus.PENDING);
  }

  deleteById(eventId: string): boolean {
    const deleted = this.events.delete(eventId);
    if (deleted) {
      this.logger.debug(`Event deleted: ${eventId}`);
    }
    return deleted;
  }

  count(): number {
    return this.events.size;
  }

  clear(): void {
    this.events.clear();
    this.logger.log('All persisted events cleared');
  }

  // DLQ-specific methods
  private readonly dlqEntries = new Map<string, DLQEntry>();

  getDLQEntriesForService(): DLQEntry[] {
    return Array.from(this.dlqEntries.values());
  }

  saveDLQEntry(entry: DLQEntry): void {
    try {
      this.dlqEntries.set(entry.event.metadata.id, entry);
      this.logger.debug(`DLQ entry saved: ${entry.event.metadata.id}`);
    } catch (error) {
      this.logger.error(`Failed to save DLQ entry ${entry.event.metadata.id}:`, error);
      throw error;
    }
  }

  saveDLQEntries(entries: DLQEntry[]): void {
    try {
      for (const entry of entries) {
        this.dlqEntries.set(entry.event.metadata.id, entry);
      }
      this.logger.debug(`Saved ${entries.length} DLQ entries`);
    } catch (error) {
      this.logger.error(`Failed to save DLQ entries:`, error);
      throw error;
    }
  }

  getDLQEntry(eventId: string): DLQEntry | undefined {
    return this.dlqEntries.get(eventId);
  }

  deleteDLQEntry(eventId: string): boolean {
    const deleted = this.dlqEntries.delete(eventId);
    if (deleted) {
      this.logger.debug(`DLQ entry deleted: ${eventId}`);
    }
    return deleted;
  }
}
