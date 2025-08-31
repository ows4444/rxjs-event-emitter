import { Test, TestingModule } from '@nestjs/testing';
import { Injectable, Module } from '@nestjs/common';
import { EventEmitterModule } from '../../src/modules/rx-event-emitter/event-emitter.module';
import { EventEmitterService } from '../../src/modules/rx-event-emitter/services/event-emitter.service';
import { EventHandler } from '../../src/modules/rx-event-emitter/decorators/event-handler.decorator';
import { Event, EventPriority } from '../../src/modules/rx-event-emitter/interfaces/core.interfaces';

// Test Event Payloads
interface UserCreatedPayload {
  userId: string;
  email: string;
  name: string;
  timestamp: number;
}

interface OrderProcessedPayload {
  orderId: string;
  userId: string;
  amount: number;
  status: string;
}

interface PaymentProcessedPayload {
  paymentId: string;
  orderId: string;
  amount: number;
  method: string;
}

interface FailingEventPayload {
  shouldFail: boolean;
  retryCount: number;
}

// Test Event Handlers
@Injectable()
export class UserCreatedHandler {
  public handledEvents: Event<UserCreatedPayload>[] = [];

  @EventHandler('user.created', {
    priority: EventPriority.HIGH,
    timeout: 5000,
    retries: 3,
  })
  async handle(event: Event<UserCreatedPayload>): Promise<void> {
    this.handledEvents.push(event);

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Validate payload structure
    if (!event.payload.userId || !event.payload.email) {
      throw new Error('Invalid user data');
    }
  }
}

@Injectable()
export class OrderProcessedHandler {
  public handledEvents: Event<OrderProcessedPayload>[] = [];

  @EventHandler('order.processed', {
    priority: EventPriority.NORMAL,
    timeout: 3000,
    retries: 2,
  })
  async handle(event: Event<OrderProcessedPayload>): Promise<void> {
    this.handledEvents.push(event);

    // Simulate order processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (event.payload.amount <= 0) {
      throw new Error('Invalid order amount');
    }
  }
}

@Injectable()
export class PaymentProcessedHandler {
  public handledEvents: Event<PaymentProcessedPayload>[] = [];

  @EventHandler('payment.processed', {
    priority: EventPriority.NORMAL,
    timeout: 2000,
    circuitBreakerEnabled: true,
    circuitBreakerThreshold: 3,
  })
  async handle(event: Event<PaymentProcessedPayload>): Promise<void> {
    this.handledEvents.push(event);

    // Simulate payment processing
    await new Promise((resolve) => setTimeout(resolve, 75));

    if (event.payload.amount > 10000) {
      throw new Error('Amount exceeds limit');
    }
  }
}

@Injectable()
export class FailingEventHandler {
  public handledEvents: Event<FailingEventPayload>[] = [];
  public failureCount = 0;

  @EventHandler('failing.event', {
    priority: EventPriority.LOW,
    timeout: 1000,
    retries: 2,
  })
  async handle(event: Event<FailingEventPayload>): Promise<void> {
    this.handledEvents.push(event);
    this.failureCount++;

    if (event.payload.shouldFail) {
      throw new Error(`Handler failure #${this.failureCount}`);
    }
  }
}

// Test Module
@Module({
  providers: [UserCreatedHandler, OrderProcessedHandler, PaymentProcessedHandler, FailingEventHandler],
})
class TestEventHandlersModule {}

describe('Event Processing Pipeline E2E', () => {
  let app: TestingModule;
  let eventEmitterService: EventEmitterService;

  // Handler instances for verification
  let userCreatedHandler: UserCreatedHandler;
  let orderProcessedHandler: OrderProcessedHandler;
  let paymentProcessedHandler: PaymentProcessedHandler;
  let failingEventHandler: FailingEventHandler;

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
        TestEventHandlersModule,
      ],
    }).compile();

    // Get service instances
    eventEmitterService = app.get<EventEmitterService>(EventEmitterService);

    // Get handler instances
    userCreatedHandler = app.get<UserCreatedHandler>(UserCreatedHandler);
    orderProcessedHandler = app.get<OrderProcessedHandler>(OrderProcessedHandler);
    paymentProcessedHandler = app.get<PaymentProcessedHandler>(PaymentProcessedHandler);
    failingEventHandler = app.get<FailingEventHandler>(FailingEventHandler);

    await app.init();

    // Allow time for handler discovery
    await new Promise((resolve) => setTimeout(resolve, 200));
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
    // Clear handler event records
    userCreatedHandler.handledEvents = [];
    orderProcessedHandler.handledEvents = [];
    paymentProcessedHandler.handledEvents = [];
    failingEventHandler.handledEvents = [];
    failingEventHandler.failureCount = 0;
  });

  describe('Complete Event Processing Pipeline', () => {
    it('should discover and register all event handlers automatically', async () => {
      const eventNames = eventEmitterService.getEventNames();

      expect(eventNames).toContain('user.created');
      expect(eventNames).toContain('order.processed');
      expect(eventNames).toContain('payment.processed');
      expect(eventNames).toContain('failing.event');

      expect(eventEmitterService.getHandlerCount('user.created')).toBe(1);
      expect(eventEmitterService.getHandlerCount('order.processed')).toBe(1);
      expect(eventEmitterService.getHandlerCount('payment.processed')).toBe(1);
      expect(eventEmitterService.getHandlerCount('failing.event')).toBe(1);
    });

    it('should process events end-to-end with proper handler execution', async () => {
      const userPayload: UserCreatedPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        timestamp: Date.now(),
      };

      const orderPayload: OrderProcessedPayload = {
        orderId: 'order-456',
        userId: 'user-123',
        amount: 99.99,
        status: 'completed',
      };

      const paymentPayload: PaymentProcessedPayload = {
        paymentId: 'payment-789',
        orderId: 'order-456',
        amount: 99.99,
        method: 'credit_card',
      };

      // Emit events
      await eventEmitterService.emit('user.created', userPayload);
      await eventEmitterService.emit('order.processed', orderPayload);
      await eventEmitterService.emit('payment.processed', paymentPayload);

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify handlers were called
      expect(userCreatedHandler.handledEvents).toHaveLength(1);
      expect(orderProcessedHandler.handledEvents).toHaveLength(1);
      expect(paymentProcessedHandler.handledEvents).toHaveLength(1);

      // Verify event data
      expect(userCreatedHandler.handledEvents[0].payload).toEqual(userPayload);
      expect(orderProcessedHandler.handledEvents[0].payload).toEqual(orderPayload);
      expect(paymentProcessedHandler.handledEvents[0].payload).toEqual(paymentPayload);

      // Verify event metadata
      const userEvent = userCreatedHandler.handledEvents[0];
      expect(userEvent.metadata.name).toBe('user.created');
      expect(userEvent.metadata.id).toBeDefined();
      expect(userEvent.metadata.timestamp).toBeGreaterThan(0);
    });

    it('should handle multiple concurrent events with proper throughput', async () => {
      // Clear any previous events
      userCreatedHandler.handledEvents = [];

      const eventPromises: Promise<void>[] = [];
      const eventCount = 10; // Reduced for basic configuration

      for (let i = 0; i < eventCount; i++) {
        const userPayload: UserCreatedPayload = {
          userId: `concurrent-user-${i}`,
          email: `concurrent${i}@example.com`,
          name: `Concurrent User ${i}`,
          timestamp: Date.now(),
        };

        eventPromises.push(eventEmitterService.emit('user.created', userPayload));
      }

      await Promise.all(eventPromises);

      // Wait for all events to process with longer timeout
      await new Promise((resolve) => setTimeout(resolve, 800));

      expect(userCreatedHandler.handledEvents).toHaveLength(eventCount);

      // Verify all events were processed correctly
      for (let i = 0; i < eventCount; i++) {
        const event = userCreatedHandler.handledEvents.find((e) => e.payload.userId === `concurrent-user-${i}`);
        expect(event).toBeDefined();
        expect(event!.payload.email).toBe(`concurrent${i}@example.com`);
      }
    });

    it('should handle emitWithPersistence gracefully when persistence is disabled', async () => {
      const testPayload: UserCreatedPayload = {
        userId: 'persistent-user',
        email: 'persist@example.com',
        name: 'Persistent User',
        timestamp: Date.now(),
      };

      await eventEmitterService.emitWithPersistence('user.created', testPayload);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify event was handled even without persistence service
      expect(userCreatedHandler.handledEvents).toHaveLength(1);
      expect(userCreatedHandler.handledEvents[0].payload).toEqual(testPayload);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle failing events gracefully without DLQ when advanced features disabled', async () => {
      const failingPayload: FailingEventPayload = {
        shouldFail: true,
        retryCount: 0,
      };

      await eventEmitterService.emit('failing.event', failingPayload);

      // Wait for processing attempt
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify handler was called but failed
      expect(failingEventHandler.handledEvents.length).toBeGreaterThan(0);
      expect(failingEventHandler.failureCount).toBeGreaterThan(0);

      // Verify system continues to operate despite handler failure
      expect(eventEmitterService.isShuttingDown()).toBe(false);
    });

    it('should successfully process events after failures when conditions improve', async () => {
      // First emit a failing event
      const initialFailingPayload: FailingEventPayload = {
        shouldFail: true,
        retryCount: 0,
      };

      await eventEmitterService.emit('failing.event', initialFailingPayload);
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Now emit a successful event
      const successfulPayload: FailingEventPayload = {
        shouldFail: false,
        retryCount: 0,
      };

      await eventEmitterService.emit('failing.event', successfulPayload);
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify both events were handled
      expect(failingEventHandler.handledEvents.length).toBeGreaterThan(1);

      // Find the successful event
      const successfulEvent = failingEventHandler.handledEvents.find((e) => !e.payload.shouldFail);
      expect(successfulEvent).toBeDefined();
    });
  });

  describe('Handler Processing without Advanced Features', () => {
    it('should process events through basic handler execution when advanced features disabled', async () => {
      const orderPayload: OrderProcessedPayload = {
        orderId: 'pool-test-order',
        userId: 'pool-test-user',
        amount: 150.0,
        status: 'processing',
      };

      await eventEmitterService.emit('order.processed', orderPayload);
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(orderProcessedHandler.handledEvents).toHaveLength(1);
      expect(orderProcessedHandler.handledEvents[0].payload.orderId).toBe('pool-test-order');

      // Verify events process correctly without advanced handler pools
      expect(eventEmitterService.getHandlerCount('order.processed')).toBe(1);
    });

    it('should handle multiple events concurrently without handler pools', async () => {
      const promises: Promise<void>[] = [];

      // Emit order events
      for (let i = 0; i < 3; i++) {
        promises.push(
          eventEmitterService.emit('order.processed', {
            orderId: `concurrent-order-${i}`,
            userId: `user-${i}`,
            amount: 100 + i,
            status: 'processing',
          }),
        );
      }

      // Emit payment events
      for (let i = 0; i < 3; i++) {
        promises.push(
          eventEmitterService.emit('payment.processed', {
            paymentId: `concurrent-payment-${i}`,
            orderId: `order-${i}`,
            amount: 100 + i,
            method: 'credit_card',
          }),
        );
      }

      await Promise.all(promises);
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(orderProcessedHandler.handledEvents).toHaveLength(3);
      expect(paymentProcessedHandler.handledEvents).toHaveLength(3);
    });
  });

  describe('Core Service Functionality', () => {
    it('should process events without metrics service when disabled', async () => {
      // Process some events to verify core functionality
      await eventEmitterService.emit('user.created', {
        userId: 'core-user',
        email: 'core@example.com',
        name: 'Core User',
        timestamp: Date.now(),
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify event was processed
      expect(userCreatedHandler.handledEvents).toHaveLength(1);
      expect(userCreatedHandler.handledEvents[0].payload.userId).toBe('core-user');

      // Verify service continues to operate
      expect(eventEmitterService.isShuttingDown()).toBe(false);
    });

    it('should track basic handler performance without metrics service', async () => {
      // Process multiple events
      const eventCount = 5;
      for (let i = 0; i < eventCount; i++) {
        await eventEmitterService.emit('user.created', {
          userId: `perf-user-${i}`,
          email: `perf${i}@example.com`,
          name: `Performance User ${i}`,
          timestamp: Date.now(),
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify all events were processed by handlers
      expect(userCreatedHandler.handledEvents).toHaveLength(eventCount);
    });

    it('should maintain basic system health without advanced monitoring', async () => {
      // Verify core service state
      expect(eventEmitterService).toBeDefined();
      expect(eventEmitterService.isShuttingDown()).toBe(false);

      const eventNames = eventEmitterService.getEventNames();
      expect(eventNames.length).toBeGreaterThan(0);

      const allHandlers = eventEmitterService.getAllHandlers();
      expect(allHandlers.length).toBeGreaterThan(0);
    });
  });

  describe('Basic Stream Processing', () => {
    it('should handle multiple events with basic stream processing', async () => {
      const volumeCount = 15;
      const promises: Promise<void>[] = [];

      // Emit moderate volume of events
      for (let i = 0; i < volumeCount; i++) {
        promises.push(
          eventEmitterService.emit('user.created', {
            userId: `volume-user-${i}`,
            email: `volume${i}@example.com`,
            name: `Volume User ${i}`,
            timestamp: Date.now(),
          }),
        );
      }

      await Promise.all(promises);

      // Wait for basic stream processing
      await new Promise((resolve) => setTimeout(resolve, 800));

      expect(userCreatedHandler.handledEvents).toHaveLength(volumeCount);

      // Verify all events were processed correctly
      for (let i = 0; i < volumeCount; i++) {
        const event = userCreatedHandler.handledEvents.find((e) => e.payload.userId === `volume-user-${i}`);
        expect(event).toBeDefined();
      }
    });
  });

  describe('Core Service Integration', () => {
    it('should integrate core services properly in the processing pipeline', async () => {
      // Emit an event that will test core service integration
      const testPayload: UserCreatedPayload = {
        userId: 'integration-user',
        email: 'integration@example.com',
        name: 'Integration User',
        timestamp: Date.now(),
      };

      await eventEmitterService.emit('user.created', testPayload);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify EventEmitterService processed the event
      expect(userCreatedHandler.handledEvents).toHaveLength(1);
      expect(userCreatedHandler.handledEvents[0].payload).toEqual(testPayload);

      // Verify core service functionality
      expect(eventEmitterService.getEventNames()).toContain('user.created');
      expect(eventEmitterService.getHandlerCount('user.created')).toBeGreaterThan(0);
      expect(eventEmitterService.isShuttingDown()).toBe(false);
    });

    it('should maintain data consistency across core event processing', async () => {
      const startTime = Date.now();

      // Process several different types of events
      await Promise.all([
        eventEmitterService.emit('user.created', {
          userId: 'consistency-user',
          email: 'consistency@example.com',
          name: 'Consistency User',
          timestamp: startTime,
        }),
        eventEmitterService.emit('order.processed', {
          orderId: 'consistency-order',
          userId: 'consistency-user',
          amount: 299.99,
          status: 'completed',
        }),
        eventEmitterService.emit('payment.processed', {
          paymentId: 'consistency-payment',
          orderId: 'consistency-order',
          amount: 299.99,
          method: 'paypal',
        }),
      ]);

      await new Promise((resolve) => setTimeout(resolve, 400));

      // Verify all handlers processed their events
      expect(userCreatedHandler.handledEvents).toHaveLength(1);
      expect(orderProcessedHandler.handledEvents).toHaveLength(1);
      expect(paymentProcessedHandler.handledEvents).toHaveLength(1);

      // Verify event data consistency
      expect(userCreatedHandler.handledEvents[0].payload.userId).toBe('consistency-user');
      expect(orderProcessedHandler.handledEvents[0].payload.userId).toBe('consistency-user');
      expect(paymentProcessedHandler.handledEvents[0].payload.orderId).toBe('consistency-order');
    });
  });
});
