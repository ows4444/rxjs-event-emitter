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
    expect(stats.avgEventSize).toBeGreaterThan(0);
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
});
