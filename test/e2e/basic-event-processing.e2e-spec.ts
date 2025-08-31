import { Test, TestingModule } from '@nestjs/testing';
import { Injectable, Module } from '@nestjs/common';
import { EventEmitterModule } from '../../src/modules/rx-event-emitter/event-emitter.module';
import { EventEmitterService } from '../../src/modules/rx-event-emitter/services/event-emitter.service';
import { MetricsService } from '../../src/modules/rx-event-emitter/services/metrics.service';
import { EventHandler } from '../../src/modules/rx-event-emitter/decorators/event-handler.decorator';
import { Event, EventPriority } from '../../src/modules/rx-event-emitter/interfaces/core.interfaces';

// Test Event Payloads
interface UserCreatedPayload {
  userId: string;
  email: string;
  name: string;
}

interface OrderPlacedPayload {
  orderId: string;
  userId: string;
  amount: number;
}

// Test Event Handlers
@Injectable()
export class TestUserHandler {
  public handledEvents: Event<UserCreatedPayload>[] = [];
  public callCount = 0;

  @EventHandler('user.created', {
    priority: EventPriority.HIGH,
    timeout: 3000,
  })
  async handleUserCreated(event: Event<UserCreatedPayload>): Promise<void> {
    this.callCount++;
    this.handledEvents.push(event);

    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Basic validation
    if (!event.payload.userId) {
      throw new Error('User ID is required');
    }
  }
}

@Injectable()
export class TestOrderHandler {
  public handledEvents: Event<OrderPlacedPayload>[] = [];
  public callCount = 0;

  @EventHandler('order.placed', {
    priority: EventPriority.NORMAL,
    timeout: 2000,
  })
  async handleOrderPlaced(event: Event<OrderPlacedPayload>): Promise<void> {
    this.callCount++;
    this.handledEvents.push(event);

    // Simulate processing
    await new Promise((resolve) => setTimeout(resolve, 30));

    if (event.payload.amount <= 0) {
      throw new Error('Invalid order amount');
    }
  }
}

// Test Module
@Module({
  providers: [TestUserHandler, TestOrderHandler],
})
class TestHandlersModule {}

describe('Basic Event Processing E2E', () => {
  let app: TestingModule;
  let eventEmitterService: EventEmitterService;
  let userHandler: TestUserHandler;
  let orderHandler: TestOrderHandler;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot({
          maxConcurrency: 10,
          bufferTimeMs: 25,
          enableMetrics: false, // Disable to avoid advanced feature conflicts
          enableAdvancedFeatures: false, // Focus on core functionality validation
          defaultTimeout: 5000,
        }),
        TestHandlersModule,
      ],
    }).compile();

    // Get service instances
    eventEmitterService = app.get<EventEmitterService>(EventEmitterService);
    userHandler = app.get<TestUserHandler>(TestUserHandler);
    orderHandler = app.get<TestOrderHandler>(TestOrderHandler);

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
    userHandler.handledEvents = [];
    userHandler.callCount = 0;
    orderHandler.handledEvents = [];
    orderHandler.callCount = 0;
  });

  describe('Handler Discovery', () => {
    it('should discover and register event handlers', async () => {
      const eventNames = eventEmitterService.getEventNames();

      expect(eventNames).toContain('user.created');
      expect(eventNames).toContain('order.placed');

      expect(eventEmitterService.getHandlerCount('user.created')).toBe(1);
      expect(eventEmitterService.getHandlerCount('order.placed')).toBe(1);
    });

    it('should return all handlers', () => {
      const allHandlers = eventEmitterService.getAllHandlers();
      expect(allHandlers.length).toBeGreaterThanOrEqual(2);

      const userHandlers = allHandlers.filter((h) => h.eventName === 'user.created');
      const orderHandlers = allHandlers.filter((h) => h.eventName === 'order.placed');

      expect(userHandlers).toHaveLength(1);
      expect(orderHandlers).toHaveLength(1);
    });
  });

  describe('Basic Event Processing', () => {
    it('should emit and process a single event', async () => {
      const userPayload: UserCreatedPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      await eventEmitterService.emit('user.created', userPayload);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(userHandler.callCount).toBe(1);
      expect(userHandler.handledEvents).toHaveLength(1);

      const handledEvent = userHandler.handledEvents[0];
      expect(handledEvent.payload).toEqual(userPayload);
      expect(handledEvent.metadata.name).toBe('user.created');
      expect(handledEvent.metadata.id).toBeDefined();
    });

    it('should process multiple different event types', async () => {
      const userPayload: UserCreatedPayload = {
        userId: 'user-456',
        email: 'multi@example.com',
        name: 'Multi User',
      };

      const orderPayload: OrderPlacedPayload = {
        orderId: 'order-789',
        userId: 'user-456',
        amount: 99.99,
      };

      await Promise.all([eventEmitterService.emit('user.created', userPayload), eventEmitterService.emit('order.placed', orderPayload)]);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(userHandler.callCount).toBe(1);
      expect(orderHandler.callCount).toBe(1);

      expect(userHandler.handledEvents[0].payload).toEqual(userPayload);
      expect(orderHandler.handledEvents[0].payload).toEqual(orderPayload);
    });

    it('should handle multiple events of the same type', async () => {
      const users = [
        { userId: 'user-1', email: 'user1@test.com', name: 'User 1' },
        { userId: 'user-2', email: 'user2@test.com', name: 'User 2' },
        { userId: 'user-3', email: 'user3@test.com', name: 'User 3' },
      ];

      const promises = users.map((user) => eventEmitterService.emit('user.created', user));

      await Promise.all(promises);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(userHandler.callCount).toBe(3);
      expect(userHandler.handledEvents).toHaveLength(3);

      // Verify all users were processed
      users.forEach((expectedUser) => {
        const found = userHandler.handledEvents.some((event) => event.payload.userId === expectedUser.userId);
        expect(found).toBe(true);
      });
    });
  });

  describe('Event Metadata', () => {
    it('should include proper event metadata', async () => {
      const payload: UserCreatedPayload = {
        userId: 'metadata-user',
        email: 'metadata@test.com',
        name: 'Metadata User',
      };

      await eventEmitterService.emit('user.created', payload, {
        correlationId: 'test-correlation-123',
        priority: EventPriority.HIGH,
        headers: { source: 'test-suite' },
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(userHandler.handledEvents).toHaveLength(1);

      const event = userHandler.handledEvents[0];
      expect(event.metadata.name).toBe('user.created');
      expect(event.metadata.correlationId).toBe('test-correlation-123');
      expect(event.metadata.priority).toBe(EventPriority.HIGH);
      expect(event.metadata.headers?.source).toBe('test-suite');
      expect(event.metadata.timestamp).toBeGreaterThan(0);
      expect(event.metadata.id).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors in handlers', async () => {
      const invalidPayload: UserCreatedPayload = {
        userId: '', // Invalid - empty userId
        email: 'error@test.com',
        name: 'Error User',
      };

      await eventEmitterService.emit('user.created', invalidPayload);

      // Wait for processing attempt
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Handler should have been called but failed
      expect(userHandler.callCount).toBe(1);
    });

    it('should handle errors in order processing', async () => {
      const invalidOrder: OrderPlacedPayload = {
        orderId: 'invalid-order',
        userId: 'user-123',
        amount: -10, // Invalid amount
      };

      await eventEmitterService.emit('order.placed', invalidOrder);

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Handler should have been called but failed
      expect(orderHandler.callCount).toBe(1);
    });
  });

  describe('Concurrency', () => {
    it('should handle high-volume events concurrently', async () => {
      const eventCount = 20;
      const promises: Promise<void>[] = [];

      for (let i = 0; i < eventCount; i++) {
        const payload: UserCreatedPayload = {
          userId: `concurrent-user-${i}`,
          email: `user${i}@concurrent.test`,
          name: `Concurrent User ${i}`,
        };

        promises.push(eventEmitterService.emit('user.created', payload));
      }

      await Promise.all(promises);

      // Wait for all processing to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(userHandler.callCount).toBe(eventCount);
      expect(userHandler.handledEvents).toHaveLength(eventCount);

      // Verify all events were processed correctly
      for (let i = 0; i < eventCount; i++) {
        const found = userHandler.handledEvents.some((event) => event.payload.userId === `concurrent-user-${i}`);
        expect(found).toBe(true);
      }
    });
  });

  describe('Service Functionality', () => {
    it('should provide correct service information when metrics disabled', async () => {
      // Verify core service functionality without metrics
      expect(eventEmitterService).toBeDefined();
      expect(eventEmitterService.isShuttingDown()).toBe(false);

      const eventNames = eventEmitterService.getEventNames();
      expect(eventNames).toContain('user.created');
      expect(eventNames).toContain('order.placed');

      const allHandlers = eventEmitterService.getAllHandlers();
      expect(allHandlers.length).toBeGreaterThanOrEqual(2);
    });

    it('should track event processing without metrics service', async () => {
      // Process several events and verify they are handled
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(
          eventEmitterService.emit('user.created', {
            userId: `service-user-${i}`,
            email: `service${i}@test.com`,
            name: `Service User ${i}`,
          }),
        );
      }

      await Promise.all(promises);
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify events were processed by checking handler state
      expect(userHandler.callCount).toBe(3);
      expect(userHandler.handledEvents).toHaveLength(3);
    });
  });

  describe('Service Integration', () => {
    it('should properly integrate core EventEmitterService functionality', async () => {
      const testPayload: UserCreatedPayload = {
        userId: 'integration-user',
        email: 'integration@test.com',
        name: 'Integration User',
      };

      await eventEmitterService.emit('user.created', testPayload);
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify event was processed
      expect(userHandler.handledEvents).toHaveLength(1);
      expect(userHandler.handledEvents[0].payload).toEqual(testPayload);

      // Verify service is not shutting down
      expect(eventEmitterService.isShuttingDown()).toBe(false);

      // Verify service provides correct information
      expect(eventEmitterService.getHandlerCount('user.created')).toBeGreaterThan(0);
      expect(eventEmitterService.getEventNames()).toContain('user.created');
    });
  });
});
