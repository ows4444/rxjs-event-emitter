import type { Event } from '@src/index';
import { EventStatus, PersistenceService } from '@src/index';
import type { DLQEntry } from '@src/modules/rx-event-emitter/interfaces';
import 'reflect-metadata';
// import { PersistenceService } from '@/modules/rx-event-emitter/persistence/persistence.service';
// import { Event, EventStatus, DLQEntry } from '@/modules/rx-event-emitter/interfaces';

describe('PersistenceService', () => {
  let service: PersistenceService;
  let sampleEvent: Event;

  beforeEach(() => {
    service = new PersistenceService();
    sampleEvent = {
      metadata: {
        id: 'event-1',
        name: 'test.event',
        timestamp: Date.now(),
      },
      payload: { foo: 'bar' },
    };
  });

  describe('Event persistence', () => {
    it('should save and retrieve an event', async () => {
      await service.save(sampleEvent);

      const saved = await service.getById('event-1');
      expect(saved).toBeDefined();
      expect(saved?.metadata.id).toBe('event-1');
      expect(saved?.status).toBe(EventStatus.PENDING);
    });

    it('should update event status', async () => {
      await service.save(sampleEvent);
      await service.updateStatus('event-1', EventStatus.PROCESSING);

      const updated = await service.getById('event-1');
      expect(updated?.status).toBe(EventStatus.PROCESSING);
    });

    it('should return events by status', async () => {
      await service.save(sampleEvent, EventStatus.PROCESSING);

      const processed = await service.getByStatus(EventStatus.PROCESSING);
      expect(processed).toHaveLength(1);
      expect(processed[0].metadata.id).toBe('event-1');
    });

    it('should return unprocessed events', async () => {
      await service.save(sampleEvent, EventStatus.PENDING);

      const pending = await service.getUnprocessed();
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe(EventStatus.PENDING);
    });

    it('should delete event by id', async () => {
      await service.save(sampleEvent);
      const deleted = await service.deleteById('event-1');

      expect(deleted).toBe(true);
      expect(await service.getById('event-1')).toBeUndefined();
    });

    it('should count and clear events', async () => {
      await service.save(sampleEvent);
      expect(await service.count()).toBe(1);

      await service.clear();
      expect(await service.count()).toBe(0);
    });
  });

  describe('Dead Letter Queue (DLQ)', () => {
    let dlqEntry: DLQEntry;

    beforeEach(() => {
      dlqEntry = {
        event: sampleEvent,
        error: new Error('failure'),
        timestamp: Date.now(),
        attempts: 1,
      };
    });

    it('should save and retrieve DLQ entry', async () => {
      await service.saveDLQEntry(dlqEntry);

      const retrieved = await service.getDLQEntry('event-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.event.metadata.id).toBe('event-1');
    });

    it('should save multiple DLQ entries', async () => {
      const entries: DLQEntry[] = [
        dlqEntry,
        {
          event: {
            metadata: { id: 'event-2', name: 'test.2', timestamp: Date.now() },
            payload: {},
          },
          error: new Error('failure2'),
          timestamp: Date.now(),
          attempts: 2,
        },
      ];

      await service.saveDLQEntries(entries);
      const all = await service.getDLQEntriesForService();

      expect(all).toHaveLength(2);
    });

    it('should delete DLQ entry', async () => {
      await service.saveDLQEntry(dlqEntry);

      const deleted = await service.deleteDLQEntry('event-1');
      expect(deleted).toBe(true);

      const retrieved = await service.getDLQEntry('event-1');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Error Handling Coverage', () => {
    it('should handle save errors and rethrow them', async () => {
      // Mock the internal map to throw an error
      const originalSet = Map.prototype.set;
      jest.spyOn(Map.prototype, 'set').mockImplementationOnce(() => {
        throw new Error('Storage error');
      });

      await expect(service.save(sampleEvent, EventStatus.PENDING)).rejects.toThrow('Storage error');

      // Restore original method
      Map.prototype.set = originalSet;
    });

    it('should log warning when updating status for non-existent event', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

      await service.updateStatus('non-existent-id', EventStatus.FAILED);

      expect(loggerSpy).toHaveBeenCalledWith('Event not found for status update: non-existent-id');
      loggerSpy.mockRestore();
    });

    it('should handle DLQ save errors and rethrow them', async () => {
      // Mock the internal DLQ map to throw an error
      const originalSet = Map.prototype.set;
      jest.spyOn(Map.prototype, 'set').mockImplementationOnce(() => {
        throw new Error('DLQ storage error');
      });

      const dlqEntry = {
        event: sampleEvent,
        error: new Error('Test error'),
        timestamp: Date.now(),
        attempts: 1,
      };

      await expect(service.saveDLQEntry(dlqEntry)).rejects.toThrow('DLQ storage error');

      // Restore original method
      Map.prototype.set = originalSet;
    });

    it('should handle DLQ batch save errors and rethrow them', async () => {
      // Mock the internal Map to throw an error during the batch operation
      const originalDlqEntries = (service as any).dlqEntries;
      let callCount = 0;

      const mockMap = {
        set: jest.fn().mockImplementation((key, value) => {
          callCount++;
          if (callCount === 2) {
            throw new Error('DLQ batch storage error');
          }
          return originalDlqEntries.set(key, value);
        }),
      };

      (service as any).dlqEntries = mockMap;

      const dlqEntries = [
        {
          event: sampleEvent,
          error: new Error('Test error 1'),
          timestamp: Date.now(),
          attempts: 1,
        },
        {
          event: { ...sampleEvent, metadata: { ...sampleEvent.metadata, id: 'event-2' } },
          error: new Error('Test error 2'),
          timestamp: Date.now(),
          attempts: 1,
        },
      ];

      await expect(service.saveDLQEntries(dlqEntries)).rejects.toThrow('DLQ batch storage error');

      // Restore the original Map
      (service as any).dlqEntries = originalDlqEntries;
    });
  });
});
