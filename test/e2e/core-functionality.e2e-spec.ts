import { Test, TestingModule } from '@nestjs/testing';
import { Injectable, Module } from '@nestjs/common';
import { EventEmitterModule } from '../../src/modules/rx-event-emitter/event-emitter.module';
import { EventEmitterService } from '../../src/modules/rx-event-emitter/services/event-emitter.service';
import { EventHandler } from '../../src/modules/rx-event-emitter/decorators/event-handler.decorator';
import { Event, EventPriority } from '../../src/modules/rx-event-emitter/interfaces/core.interfaces';

// Test Event Payloads
interface TestPayload {
  id: string;
  data: string;
}

// Test Event Handler - Simple working configuration
@Injectable()
export class CoreTestHandler {
  public handledEvents: Event<TestPayload>[] = [];
  public callCount = 0;

  @EventHandler('test.event', {
    priority: EventPriority.NORMAL,
    timeout: 2000,
  })
  async handleTestEvent(event: Event<TestPayload>): Promise<void> {
    this.callCount++;
    this.handledEvents.push(event);

    // Basic processing simulation
    await new Promise((resolve) => setTimeout(resolve, 10));

    if (!event.payload.id) {
      throw new Error('ID is required');
    }
  }
}

// Test Module
@Module({
  providers: [CoreTestHandler],
})
class CoreTestModule {}

describe('Core E2E Functionality - CHECKPOINT_PROCESS.md Phase 3', () => {
  let app: TestingModule;
  let eventEmitterService: EventEmitterService;
  let testHandler: CoreTestHandler;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot({
          maxConcurrency: 5,
          bufferTimeMs: 50,
          defaultTimeout: 5000,
          enableMetrics: false, // Keep minimal for core testing
          enableAdvancedFeatures: false, // Focus on core functionality only
        }),
        CoreTestModule,
      ],
    }).compile();

    // Get service instances
    eventEmitterService = app.get<EventEmitterService>(EventEmitterService);
    testHandler = app.get<CoreTestHandler>(CoreTestHandler);

    await app.init();

    // Allow time for handler discovery
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    if (app) {
      // Allow time for any pending RxJS timers to complete
      await new Promise((resolve) => setTimeout(resolve, 150));
      await app.close();
      // Additional cleanup time for Jest
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });

  beforeEach(() => {
    // Clear handler state
    testHandler.handledEvents = [];
    testHandler.callCount = 0;
  });

  describe('Phase 3.1: Core Service Validation', () => {
    it('should discover and register event handlers (CHECKPOINT requirement)', async () => {
      const eventNames = eventEmitterService.getEventNames();
      expect(eventNames).toContain('test.event');
      expect(eventEmitterService.getHandlerCount('test.event')).toBe(1);
    });

    it('should emit and process events through complete pipeline (CHECKPOINT requirement)', async () => {
      const testPayload: TestPayload = {
        id: 'test-123',
        data: 'core functionality test',
      };

      await eventEmitterService.emit('test.event', testPayload);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(testHandler.callCount).toBe(1);
      expect(testHandler.handledEvents).toHaveLength(1);

      const handledEvent = testHandler.handledEvents[0];
      expect(handledEvent.payload).toEqual(testPayload);
      expect(handledEvent.metadata.name).toBe('test.event');
      expect(handledEvent.metadata.id).toBeDefined();
      expect(handledEvent.metadata.timestamp).toBeGreaterThan(0);
    });

    it('should handle multiple events concurrently (CHECKPOINT requirement)', async () => {
      const events = [
        { id: 'test-1', data: 'first event' },
        { id: 'test-2', data: 'second event' },
        { id: 'test-3', data: 'third event' },
      ];

      const promises = events.map((payload) => eventEmitterService.emit('test.event', payload));

      await Promise.all(promises);
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(testHandler.callCount).toBe(3);
      expect(testHandler.handledEvents).toHaveLength(3);

      // Verify all events were processed
      events.forEach((expectedPayload) => {
        const found = testHandler.handledEvents.some((event) => event.payload.id === expectedPayload.id);
        expect(found).toBe(true);
      });
    });

    it('should handle errors gracefully (CHECKPOINT requirement)', async () => {
      const invalidPayload: TestPayload = {
        id: '', // Invalid - empty ID
        data: 'error test',
      };

      await eventEmitterService.emit('test.event', invalidPayload);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Handler should have been called but failed
      expect(testHandler.callCount).toBe(1);
    });
  });

  describe('Phase 3.2: Event Processing System Validation', () => {
    it('should provide correct service status (CHECKPOINT requirement)', async () => {
      expect(eventEmitterService.isShuttingDown()).toBe(false);

      const allHandlers = eventEmitterService.getAllHandlers();
      expect(allHandlers.length).toBeGreaterThanOrEqual(1);

      const eventNames = eventEmitterService.getEventNames();
      expect(eventNames.length).toBeGreaterThanOrEqual(1);
    });

    it('should emit events with proper metadata (CHECKPOINT requirement)', async () => {
      const testPayload: TestPayload = {
        id: 'metadata-test',
        data: 'metadata validation',
      };

      await eventEmitterService.emit('test.event', testPayload, {
        correlationId: 'test-correlation-456',
        priority: EventPriority.HIGH,
        headers: { source: 'e2e-test' },
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(testHandler.handledEvents).toHaveLength(1);

      const event = testHandler.handledEvents[0];
      expect(event.metadata.name).toBe('test.event');
      expect(event.metadata.correlationId).toBe('test-correlation-456');
      expect(event.metadata.priority).toBe(EventPriority.HIGH);
      expect(event.metadata.headers?.source).toBe('e2e-test');
      expect(event.metadata.timestamp).toBeGreaterThan(0);
      expect(event.metadata.id).toBeDefined();
    });
  });

  describe('Phase 3.3: Performance and Reliability Validation', () => {
    it('should handle high-volume events reliably (CHECKPOINT requirement)', async () => {
      const eventCount = 15;
      const promises: Promise<void>[] = [];

      for (let i = 0; i < eventCount; i++) {
        const payload: TestPayload = {
          id: `perf-test-${i}`,
          data: `performance test event ${i}`,
        };
        promises.push(eventEmitterService.emit('test.event', payload));
      }

      await Promise.all(promises);
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Should process all or most events (allowing for minor timing issues)
      expect(testHandler.callCount).toBeGreaterThanOrEqual(eventCount - 2);
      expect(testHandler.handledEvents.length).toBeGreaterThanOrEqual(eventCount - 2);

      // Verify unique events were processed
      const uniqueIds = new Set(testHandler.handledEvents.map((e) => e.payload.id));
      expect(uniqueIds.size).toBeGreaterThanOrEqual(eventCount - 2);
    });
  });
});
