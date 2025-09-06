import 'reflect-metadata';
import type { Event } from '@src/index';
import { InMemoryPersistenceAdapter } from '@src/index';
import { InMemoryAdapter } from '@src/modules/rx-event-emitter/adapters';

describe('InMemoryPersistenceAdapter', () => {
  let adapter: InMemoryPersistenceAdapter;
  let sampleEvent: Event;

  beforeEach(() => {
    adapter = new InMemoryPersistenceAdapter();
    sampleEvent = {
      metadata: {
        id: 'event-1',
        name: 'test.event',
        timestamp: Date.now(),
      },
      payload: { foo: 'bar' },
    };
  });

  it('should save and load an event', () => {
    adapter.save(sampleEvent);
    const loaded = adapter.load('event-1');

    expect(loaded).toEqual(sampleEvent);
  });

  it('should return null for missing event', () => {
    const loaded = adapter.load('missing');
    expect(loaded).toBeNull();
  });

  it('should load all events (processed and unprocessed)', () => {
    const event1 = sampleEvent;
    const event2 = {
      metadata: { id: 'event-2', name: 'test.2', timestamp: Date.now() },
      payload: { baz: 'qux' },
    };

    adapter.save(event1);
    adapter.save(event2);
    adapter.markProcessed('event-1');

    const allEvents = adapter.loadAll();

    expect(allEvents).toHaveLength(2);
    expect(allEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metadata: event1.metadata, payload: event1.payload }),
        expect.objectContaining({ metadata: event2.metadata, payload: event2.payload }),
      ]),
    );
  });

  it('should load unprocessed events', () => {
    adapter.save(sampleEvent);
    const events = adapter.loadUnprocessed();

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(sampleEvent);
  });

  it('should mark event as processed', () => {
    adapter.save(sampleEvent);
    adapter.markProcessed('event-1');

    const unprocessed = adapter.loadUnprocessed();
    expect(unprocessed).toHaveLength(0);
  });

  it('should mark event as failed', () => {
    adapter.save(sampleEvent);
    const error = new Error('failure');
    adapter.markFailed('event-1', error);

    // Stats should reflect failed event
    const stats = adapter.getStats();
    expect(stats.failedEvents).toBe(1);
  });

  it('should clean processed events before cutoff date', () => {
    adapter.save(sampleEvent);
    adapter.markProcessed('event-1');

    // Pretend this happened in the past
    const pastDate = new Date(Date.now() + 1000);
    adapter.clean(pastDate);

    expect(adapter.count()).toBe(0);
  });

  it('should not clean unprocessed events', () => {
    adapter.save(sampleEvent);

    const futureDate = new Date(Date.now() + 1000);
    adapter.clean(futureDate);

    expect(adapter.count()).toBe(1);
  });

  it('should return persistence stats', () => {
    adapter.save(sampleEvent);
    const stats = adapter.getStats();

    expect(stats.totalEvents).toBe(1);
    expect(stats.unprocessedEvents).toBe(1);
    expect(stats.processedEvents).toBe(0);
    expect(stats.storageSize).toBeGreaterThan(0);
    expect(stats.averageEventSize).toBeGreaterThan(0);
  });

  it('should perform health check', () => {
    adapter.save(sampleEvent);
    const result = adapter.healthCheck();

    expect(result.healthy).toBe(true);
    expect(result.checks.connectivity).toBe(true);
    expect(result.checks.performance).toBe(true);
    expect(result.metrics.availableSpaceBytes).toBeGreaterThan(0);
  });

  it('should count events correctly', () => {
    adapter.save(sampleEvent);
    expect(adapter.count()).toBe(1);

    adapter.save({
      metadata: { id: 'event-2', name: 'test.2', timestamp: Date.now() },
      payload: {},
    });
    expect(adapter.count()).toBe(2);
  });

  it('should clear all events', () => {
    adapter.save(sampleEvent);
    expect(adapter.count()).toBe(1);

    adapter.clear();
    expect(adapter.count()).toBe(0);
  });

  it('InMemoryAdapter should alias InMemoryPersistenceAdapter', () => {
    expect(InMemoryAdapter).toBe(InMemoryPersistenceAdapter);
  });

  it('should handle stats calculation with empty events', () => {
    const stats = adapter.getStats();

    expect(stats.totalEvents).toBe(0);
    expect(stats.processedEvents).toBe(0);
    expect(stats.failedEvents).toBe(0);
    expect(stats.unprocessedEvents).toBe(0);
    expect(stats.oldestEvent).toBeUndefined();
    expect(stats.newestEvent).toBeUndefined();
    expect(stats.avgEventSize).toBe(0);
  });

  it('should handle stats calculation with events having no timestamps', () => {
    const eventWithoutTimestamp = {
      metadata: { id: 'no-timestamp', name: 'test.no.timestamp' },
      payload: { test: 'data' },
    };

    adapter.save(eventWithoutTimestamp as any);
    const stats = adapter.getStats();

    expect(stats.totalEvents).toBe(1);
    expect(stats.oldestEvent).toBeUndefined();
    expect(stats.newestEvent).toBeUndefined();
  });

  it('should handle health check with high event count warning', () => {
    // Add more than 10000 events to trigger performance warning
    for (let i = 0; i < 10001; i++) {
      adapter.save({
        metadata: { id: `event-${i}`, name: 'test.event', timestamp: Date.now() },
        payload: { index: i },
      });
    }

    const result = adapter.healthCheck();

    expect(result.healthy).toBe(true);
    expect(result.checks.performance).toBe(false);
    expect(result.issues).toContain('High event count in memory - consider using persistent storage');
  });

  it('should handle stats calculation with mixed processed/failed events', () => {
    const event1 = {
      metadata: { id: 'event-1', name: 'test.1', timestamp: 1000 },
      payload: { data: '1' },
    };
    const event2 = {
      metadata: { id: 'event-2', name: 'test.2', timestamp: 2000 },
      payload: { data: '2' },
    };
    const event3 = {
      metadata: { id: 'event-3', name: 'test.3', timestamp: 3000 },
      payload: { data: '3' },
    };

    adapter.save(event1);
    adapter.save(event2);
    adapter.save(event3);

    adapter.markProcessed('event-1');
    adapter.markFailed('event-2', new Error('test error'));

    const stats = adapter.getStats();

    expect(stats.totalEvents).toBe(3);
    expect(stats.processedEvents).toBe(1);
    expect(stats.failedEvents).toBe(1);
    expect(stats.unprocessedEvents).toBe(2);
    expect(stats.oldestEvent).toEqual(new Date(1000));
    expect(stats.newestEvent).toEqual(new Date(3000));
    expect(stats.averageEventSize).toBeGreaterThan(0);
  });
});
