import { Injectable, Logger } from '@nestjs/common';
import { Event, EventStatus, DLQEntry } from '../interfaces';

@Injectable()
export class PersistenceService {
  private readonly logger = new Logger(PersistenceService.name);
  private readonly events = new Map<string, Event & { status: EventStatus }>();

  async save(event: Event, status: EventStatus = EventStatus.PENDING): Promise<void> {
    try {
      this.events.set(event.metadata.id, { ...event, status });
      this.logger.debug(`Event persisted: ${event.metadata.name} (${event.metadata.id}) with status ${status}`);
    } catch (error) {
      this.logger.error(`Failed to persist event ${event.metadata.id}:`, error);
      throw error;
    }
  }

  async updateStatus(eventId: string, status: EventStatus): Promise<void> {
    const event = this.events.get(eventId);
    if (event) {
      event.status = status;
      this.logger.debug(`Event status updated: ${eventId} -> ${status}`);
    } else {
      this.logger.warn(`Event not found for status update: ${eventId}`);
    }
  }

  async getById(eventId: string): Promise<(Event & { status: EventStatus }) | undefined> {
    return this.events.get(eventId);
  }

  async getByStatus(status: EventStatus): Promise<(Event & { status: EventStatus })[]> {
    return Array.from(this.events.values()).filter((event) => event.status === status);
  }

  async getUnprocessed(): Promise<(Event & { status: EventStatus })[]> {
    return this.getByStatus(EventStatus.PENDING);
  }

  async deleteById(eventId: string): Promise<boolean> {
    const deleted = this.events.delete(eventId);
    if (deleted) {
      this.logger.debug(`Event deleted: ${eventId}`);
    }
    return deleted;
  }

  async count(): Promise<number> {
    return this.events.size;
  }

  async clear(): Promise<void> {
    this.events.clear();
    this.logger.log('All persisted events cleared');
  }

  // DLQ-specific methods
  private readonly dlqEntries = new Map<string, DLQEntry>();

  async getDLQEntriesForService(): Promise<DLQEntry[]> {
    return Array.from(this.dlqEntries.values());
  }

  async saveDLQEntry(entry: DLQEntry): Promise<void> {
    try {
      this.dlqEntries.set(entry.event.metadata.id, entry);
      this.logger.debug(`DLQ entry saved: ${entry.event.metadata.id}`);
    } catch (error) {
      this.logger.error(`Failed to save DLQ entry ${entry.event.metadata.id}:`, error);
      throw error;
    }
  }

  async saveDLQEntries(entries: DLQEntry[]): Promise<void> {
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

  async getDLQEntry(eventId: string): Promise<DLQEntry | undefined> {
    return this.dlqEntries.get(eventId);
  }

  async deleteDLQEntry(eventId: string): Promise<boolean> {
    const deleted = this.dlqEntries.delete(eventId);
    if (deleted) {
      this.logger.debug(`DLQ entry deleted: ${eventId}`);
    }
    return deleted;
  }
}
