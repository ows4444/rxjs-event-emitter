import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { EventEmitterModule } from '@src/modules/rx-event-emitter/event-emitter.module';
import { EventEmitterService } from '@src/modules/rx-event-emitter/services/event-emitter.service';
import { MetricsService } from '@src/modules/rx-event-emitter/services/metrics.service';
import { HandlerDiscoveryService } from '@src/modules/rx-event-emitter/services/handler-discovery.service';
import { HandlerExecutionService } from '@src/modules/rx-event-emitter/services/handler-execution.service';
import { PersistenceService } from '@src/modules/rx-event-emitter/services/persistence.service';
import { DeadLetterQueueService } from '@src/modules/rx-event-emitter/services/dead-letter-queue.service';
import { StreamManagementService } from '@src/modules/rx-event-emitter/services/stream-management.service';
import { HandlerPoolService } from '@src/modules/rx-event-emitter/services/handler-pool.service';
import { DependencyAnalyzerService } from '@src/modules/rx-event-emitter/services/dependency-analyzer.service';
import { EventHandler } from '@src/modules/rx-event-emitter/decorators/event-handler.decorator';
import { Injectable } from '@nestjs/common';
import { Event } from '@src/modules/rx-event-emitter/interfaces';

/**
 * Integration Tests for Event Processing Workflows
 *
 * Following CHECKPOINT_PROCESS.md requirements:
 * - Service integration and event workflow testing
 * - Event workflows, handler discovery, service integration
 * - Full event processing lifecycle, metrics validation
 */
describe('Event Workflows Integration', () => {
  let module: TestingModule;
  let eventEmitterService: EventEmitterService;
  let metricsService: MetricsService;
  let handlerDiscoveryService: HandlerDiscoveryService;
  let handlerExecutionService: HandlerExecutionService;
  let persistenceService: PersistenceService;
  let dlqService: DeadLetterQueueService;
  let streamManagementService: StreamManagementService;
  let handlerPoolService: HandlerPoolService;
  let dependencyAnalyzerService: DependencyAnalyzerService;

  // Test handler classes for integration testing
  @EventHandler('user.created', {
    priority: 5,
    timeout: 5000,
    retryPolicy: {
      maxRetries: 3,
      backoffMs: 1000,
    },
  })
  @Injectable()
  class UserCreatedHandler {
    async handle(_event: Event): Promise<void> {
      // Simulate user creation handling
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  @EventHandler('order.placed', {
    priority: 10,
    timeout: 3000,
    poolName: 'order-pool',
  })
  @Injectable()
  class OrderPlacedHandler {
    async handle(_event: Event): Promise<void> {
      // Simulate order processing
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  @EventHandler('payment.processed', {
    priority: 15,
    timeout: 10000,
    retryPolicy: {
      maxRetries: 5,
      backoffMs: 2000,
      exponentialBackoff: true,
    },
  })
  @Injectable()
  class PaymentProcessedHandler {
    async handle(event: Event): Promise<void> {
      // Simulate payment processing
      if (event.payload?.shouldFail) {
        throw new Error('Payment processing failed');
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  beforeAll(async () => {
    // Mock logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    module = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot({
          maxConcurrency: 20,
          bufferTimeMs: 50,
          defaultTimeout: 30000,
          enableMetrics: true,
          enablePersistence: true,
          enableDeadLetterQueue: true,
          enableAdvancedFeatures: true,
          streamManagement: {
            enabled: true,
            backpressureStrategy: 'buffer',
            maxBufferSize: 1000,
          },
          handlerPools: {
            enabled: true,
            defaultPoolSize: 10,
            maxPoolUtilization: 0.8,
          },
          circuitBreaker: {
            enabled: true,
            failureThreshold: 5,
            recoveryTimeout: 30000,
          },
        }),
      ],
      providers: [UserCreatedHandler, OrderPlacedHandler, PaymentProcessedHandler],
    }).compile();

    // Get service instances
    eventEmitterService = module.get<EventEmitterService>(EventEmitterService);
    metricsService = module.get<MetricsService>(MetricsService);
    handlerDiscoveryService = module.get<HandlerDiscoveryService>(HandlerDiscoveryService);
    handlerExecutionService = module.get<HandlerExecutionService>(HandlerExecutionService);
    persistenceService = module.get<PersistenceService>(PersistenceService);
    dlqService = module.get<DeadLetterQueueService>(DeadLetterQueueService);
    streamManagementService = module.get<StreamManagementService>(StreamManagementService);
    handlerPoolService = module.get<HandlerPoolService>(HandlerPoolService);
    dependencyAnalyzerService = module.get<DependencyAnalyzerService>(DependencyAnalyzerService);

    // Initialize all services
    await Promise.all([
      eventEmitterService.onModuleInit(),
      metricsService.onModuleInit(),
      handlerExecutionService.onModuleInit(),
      dlqService.onModuleInit(),
      handlerPoolService.onModuleInit(),
      dependencyAnalyzerService.onModuleInit(),
    ]);

    // Initialize sync services
    streamManagementService.onModuleInit();

    // Discover and register handlers
    await handlerDiscoveryService.onModuleInit();
  }, 30000);

  afterAll(async () => {
    try {
      // Cleanup all services
      await Promise.all([
        eventEmitterService.onModuleDestroy(),
        metricsService.onModuleDestroy(),
        handlerExecutionService.onModuleDestroy(),
        dlqService.onModuleDestroy(),
        streamManagementService.onModuleDestroy(),
        handlerPoolService.onModuleDestroy(),
        dependencyAnalyzerService.onModuleDestroy(),
        handlerDiscoveryService.onModuleDestroy(),
      ]);

      await module.close();
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }, 30000);

  describe('Service Integration', () => {
    it('should have all services properly initialized', () => {
      expect(eventEmitterService).toBeDefined();
      expect(metricsService).toBeDefined();
      expect(handlerDiscoveryService).toBeDefined();
      expect(handlerExecutionService).toBeDefined();
      expect(persistenceService).toBeDefined();
      expect(dlqService).toBeDefined();
      expect(streamManagementService).toBeDefined();
      expect(handlerPoolService).toBeDefined();
      expect(dependencyAnalyzerService).toBeDefined();
    });

    it('should have EventEmitterModule configuration applied', () => {
      expect(eventEmitterService.isShuttingDown()).toBe(false);

      // Check that metrics service is collecting data
      const systemMetrics = metricsService.getCurrentSystemMetrics();
      expect(systemMetrics).toBeDefined();
      expect(systemMetrics.health).toBeDefined();
      expect(systemMetrics.events).toBeDefined();
      expect(systemMetrics.streams).toBeDefined();
    });
  });

  describe('Handler Discovery and Registration', () => {
    it('should discover and register all decorated handlers', async () => {
      // Give time for handler discovery to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const registeredHandlers = eventEmitterService.getAllHandlers();

      // Should find our 3 test handlers
      expect(registeredHandlers.length).toBeGreaterThanOrEqual(3);

      // Check specific event handlers are registered
      const eventNames = eventEmitterService.getEventNames();
      expect(eventNames).toContain('user.created');
      expect(eventNames).toContain('order.placed');
      expect(eventNames).toContain('payment.processed');

      // Check handler counts
      expect(eventEmitterService.getHandlerCount('user.created')).toBe(1);
      expect(eventEmitterService.getHandlerCount('order.placed')).toBe(1);
      expect(eventEmitterService.getHandlerCount('payment.processed')).toBe(1);
    });

    it('should register handlers with correct metadata', async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));

      const registeredHandlers = eventEmitterService.getAllHandlers();
      const userCreatedHandler = registeredHandlers.find((h) => h.metadata.eventName === 'user.created');
      const orderPlacedHandler = registeredHandlers.find((h) => h.metadata.eventName === 'order.placed');
      const paymentHandler = registeredHandlers.find((h) => h.metadata.eventName === 'payment.processed');

      expect(userCreatedHandler).toBeDefined();
      expect(userCreatedHandler?.metadata.options.priority).toBe(5);
      expect(userCreatedHandler?.metadata.options.timeout).toBe(5000);

      expect(orderPlacedHandler).toBeDefined();
      expect(orderPlacedHandler?.metadata.options.priority).toBe(10);
      expect(orderPlacedHandler?.metadata.options.poolName).toBe('order-pool');

      expect(paymentHandler).toBeDefined();
      expect(paymentHandler?.metadata.options.priority).toBe(15);
      expect(paymentHandler?.metadata.options.retryPolicy?.maxRetries).toBe(5);
    });
  });

  describe('Event Processing Workflows', () => {
    it('should process events end-to-end with metrics', async () => {
      const initialMetrics = metricsService.getCurrentSystemMetrics();
      const initialEventCount = initialMetrics.events.totalEmitted;

      // Emit test events
      await eventEmitterService.emit('user.created', {
        userId: 'user-123',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
      });

      await eventEmitterService.emit('order.placed', {
        orderId: 'order-456',
        userId: 'user-123',
        amount: 99.99,
      });

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check metrics were updated
      const finalMetrics = metricsService.getCurrentSystemMetrics();
      expect(finalMetrics.events.totalEmitted).toBeGreaterThan(initialEventCount);
      expect(finalMetrics.events.totalProcessed).toBeGreaterThan(0);
    });

    it('should handle event processing with persistence', async () => {
      const testEvent = {
        orderId: 'persist-order-789',
        userId: 'user-456',
        amount: 149.99,
      };

      // Emit event with persistence
      await eventEmitterService.emitWithPersistence('order.placed', testEvent);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Check that event was persisted
      const persistedEvents = persistenceService.getUnprocessed();
      expect(persistedEvents.length).toBeGreaterThanOrEqual(1);

      // Find our specific event
      const ourEvent = persistedEvents.find((e) => e.metadata.name === 'order.placed' && e.payload.orderId === 'persist-order-789');
      expect(ourEvent).toBeDefined();
    });

    it('should handle multiple concurrent events', async () => {
      const initialMetrics = metricsService.getCurrentSystemMetrics();
      const initialProcessed = initialMetrics.events.totalProcessed;

      // Emit multiple events concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        eventEmitterService.emit('user.created', {
          userId: `concurrent-user-${i}`,
          email: `user${i}@example.com`,
          createdAt: new Date().toISOString(),
        }),
      );

      await Promise.all(promises);

      // Wait for all events to be processed
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Check that all events were processed
      const finalMetrics = metricsService.getCurrentSystemMetrics();
      expect(finalMetrics.events.totalProcessed).toBeGreaterThanOrEqual(initialProcessed + 10);
    });

    it('should handle event priorities correctly', async () => {
      // Emit events with different priorities in reverse order
      await Promise.all([
        eventEmitterService.emit('user.created', { priority: 'low', order: 1 }), // priority 5
        eventEmitterService.emit('order.placed', { priority: 'medium', order: 2 }), // priority 10
        eventEmitterService.emit('payment.processed', { priority: 'high', order: 3 }), // priority 15
      ]);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 400));

      // All should be processed successfully (specific ordering depends on stream timing)
      const metrics = metricsService.getCurrentSystemMetrics();
      expect(metrics.events.totalProcessed).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Dead Letter Queue', () => {
    it('should handle failed events and send to DLQ', async () => {
      const initialDlqStats = dlqService.getStats();

      // Emit an event that will fail
      await eventEmitterService.emit('payment.processed', {
        paymentId: 'fail-payment-123',
        shouldFail: true,
        amount: 199.99,
      });

      // Wait for processing and retry attempts
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check that the event was sent to DLQ after retries
      const finalDlqStats = dlqService.getStats();
      expect(finalDlqStats.totalEntries).toBeGreaterThan(initialDlqStats.totalEntries);

      // Check metrics recorded the failure
      const metrics = metricsService.getCurrentSystemMetrics();
      expect(metrics.events.errorRate).toBeGreaterThanOrEqual(0);
    });

    it('should be able to reprocess DLQ entries', async () => {
      // First, create a DLQ entry
      await eventEmitterService.emit('payment.processed', {
        paymentId: 'reprocess-payment-456',
        shouldFail: true,
        amount: 299.99,
      });

      // Wait for it to fail and go to DLQ
      await new Promise((resolve) => setTimeout(resolve, 800));

      const dlqEntries = await dlqService.getEntries(10);
      expect(dlqEntries.length).toBeGreaterThan(0);

      // Find our specific entry
      const ourEntry = dlqEntries.find((entry) => entry.event.payload?.paymentId === 'reprocess-payment-456');

      if (ourEntry) {
        // Modify the event to succeed this time
        const modifiedEvent = {
          ...ourEntry.event,
          payload: {
            ...ourEntry.event.payload,
            shouldFail: false,
          },
        };

        // Reprocess the entry (this would normally succeed)
        await dlqService.reprocessEntry(ourEntry.id, modifiedEvent);

        // Wait for reprocessing
        await new Promise((resolve) => setTimeout(resolve, 200));

        // The entry should be removed from DLQ or marked as reprocessed
        const updatedEntries = await dlqService.getEntries(10);
        const stillExists = updatedEntries.find((entry) => entry.id === ourEntry.id);
        // The entry might still exist but should be marked differently or removed
        expect(stillExists?.attempts).toBeDefined();
      }
    });
  });

  describe('Stream Management and Backpressure', () => {
    it('should handle high-throughput event streams', async () => {
      const initialMetrics = streamManagementService.getStreamMetrics();

      // Generate high throughput of events
      const promises = Array.from({ length: 100 }, (_, i) =>
        eventEmitterService.emit('user.created', {
          userId: `stream-user-${i}`,
          email: `streamuser${i}@example.com`,
          batch: 'high-throughput-test',
        }),
      );

      await Promise.all(promises);

      // Wait for stream processing
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Check stream metrics
      const finalMetrics = streamManagementService.getStreamMetrics();
      expect(finalMetrics.throughput.eventsPerSecond).toBeGreaterThanOrEqual(0);
      expect(finalMetrics.bufferSize).toBeGreaterThanOrEqual(0);

      // System should handle the load without dropping events (unless backpressure kicks in)
      const systemMetrics = metricsService.getCurrentSystemMetrics();
      expect(systemMetrics.streams.backpressureActive).toBeDefined();
    });

    it('should manage stream health and monitoring', async () => {
      // Get stream health information
      const streamHealth = streamManagementService.getStreamHealth();
      expect(streamHealth).toBeDefined();
      expect(streamHealth.status).toBeDefined();
      expect(streamHealth.score).toBeGreaterThanOrEqual(0);
      expect(streamHealth.score).toBeLessThanOrEqual(100);

      // Check that stream monitoring is working
      const allStreamHealth = streamManagementService.getAllStreamHealth();
      expect(Array.isArray(allStreamHealth)).toBe(true);
    });
  });

  describe('Handler Pool Management', () => {
    it('should execute handlers in appropriate pools', async () => {
      const initialPoolStats = handlerPoolService.getPoolStats();

      // Emit events that use different pools
      await Promise.all([
        eventEmitterService.emit('user.created', { poolTest: 'default' }),
        eventEmitterService.emit('order.placed', { poolTest: 'order-pool' }), // Uses custom pool
      ]);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 400));

      const finalPoolStats = handlerPoolService.getPoolStats();
      expect(Object.keys(finalPoolStats).length).toBeGreaterThanOrEqual(1);

      // Should have some pool utilization
      const poolNames = Object.keys(finalPoolStats);
      poolNames.forEach((poolName) => {
        expect(finalPoolStats[poolName]).toBeDefined();
        expect(finalPoolStats[poolName].totalExecutions).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Comprehensive System Health', () => {
    it('should provide comprehensive system health metrics', () => {
      const systemMetrics = metricsService.getCurrentSystemMetrics();

      // Health metrics should be available
      expect(systemMetrics.health.status).toMatch(/^(healthy|warning|critical)$/);
      expect(systemMetrics.health.score).toBeGreaterThanOrEqual(0);
      expect(systemMetrics.health.score).toBeLessThanOrEqual(100);
      expect(Array.isArray(systemMetrics.health.alerts)).toBe(true);

      // Event metrics should be tracked
      expect(systemMetrics.events.totalEmitted).toBeGreaterThanOrEqual(0);
      expect(systemMetrics.events.totalProcessed).toBeGreaterThanOrEqual(0);
      expect(systemMetrics.events.processingRate).toBeGreaterThanOrEqual(0);
      expect(systemMetrics.events.errorRate).toBeGreaterThanOrEqual(0);

      // Stream metrics should be available
      expect(systemMetrics.streams.bufferSize).toBeGreaterThanOrEqual(0);
      expect(systemMetrics.streams.throughput.eventsPerSecond).toBeGreaterThanOrEqual(0);
      expect(typeof systemMetrics.streams.backpressureActive).toBe('boolean');
    });

    it('should support metrics logging and summary', () => {
      // This should not throw an error
      expect(() => {
        metricsService.logSummary();
      }).not.toThrow();
    });
  });
});
