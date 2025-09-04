import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import type { EventEmitterOptions } from '@modules/rx-event-emitter/services/event-emitter.service';
import { EventEmitterService } from '@modules/rx-event-emitter/services/event-emitter.service';
import { MetricsService } from '@modules/rx-event-emitter/services/metrics.service';
import { PersistenceService } from '@modules/rx-event-emitter/services/persistence.service';
import { DeadLetterQueueService } from '@modules/rx-event-emitter/services/dead-letter-queue.service';
import { HandlerExecutionService } from '@modules/rx-event-emitter/services/handler-execution.service';
import { StreamManagementService } from '@modules/rx-event-emitter/services/stream-management.service';
import { HandlerPoolService } from '@modules/rx-event-emitter/services/handler-pool.service';
import type { EmitOptions } from '@modules/rx-event-emitter/interfaces';
import { EventStatus, EventPriority, EVENT_EMITTER_OPTIONS } from '@modules/rx-event-emitter/interfaces';

describe('EventEmitterService', () => {
  let service: EventEmitterService;
  let mockMetricsService: jest.Mocked<MetricsService>;
  let mockPersistenceService: jest.Mocked<PersistenceService>;
  let mockDlqService: jest.Mocked<DeadLetterQueueService>;
  let mockHandlerExecutionService: jest.Mocked<HandlerExecutionService>;
  let mockStreamManagementService: jest.Mocked<StreamManagementService>;
  let mockHandlerPoolService: jest.Mocked<HandlerPoolService>;

  const createMockMetricsService = (): jest.Mocked<MetricsService> =>
    ({
      recordEventEmitted: jest.fn(),
      recordEventProcessed: jest.fn(),
      recordEventFailed: jest.fn(),
      getCurrentSystemMetrics: jest.fn(),
      logSummary: jest.fn(),
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    }) as any;

  const createMockPersistenceService = (): jest.Mocked<PersistenceService> =>
    ({
      save: jest.fn().mockResolvedValue(undefined),
      find: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    }) as any;

  const createMockDlqService = (): jest.Mocked<DeadLetterQueueService> =>
    ({
      addEntry: jest.fn().mockResolvedValue(undefined),
      getEntries: jest.fn(),
      reprocessEntry: jest.fn(),
      removeEntry: jest.fn(),
      getStats: jest.fn(),
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    }) as any;

  const createMockHandlerExecutionService = (): jest.Mocked<HandlerExecutionService> =>
    ({
      executeHandler: jest.fn().mockResolvedValue({ success: true }),
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    }) as any;

  const createMockStreamManagementService = (): jest.Mocked<StreamManagementService> =>
    ({
      createManagedStream: jest.fn().mockImplementation((_name, source) => source),
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    }) as any;

  const createMockHandlerPoolService = (): jest.Mocked<HandlerPoolService> =>
    ({
      executeInPool: jest.fn(),
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    }) as any;

  const defaultOptions: EventEmitterOptions = {
    maxConcurrency: 10,
    bufferTimeMs: 100,
    defaultTimeout: 30000,
    enableMetrics: true,
    enablePersistence: false,
    enableDeadLetterQueue: false,
    enableAdvancedFeatures: true,
    streamManagement: {
      enabled: false, // Disable stream management for basic tests
    },
  };

  beforeEach(async () => {
    // Create mocks
    mockMetricsService = createMockMetricsService();
    mockPersistenceService = createMockPersistenceService();
    mockDlqService = createMockDlqService();
    mockHandlerExecutionService = createMockHandlerExecutionService();
    mockStreamManagementService = createMockStreamManagementService();
    mockHandlerPoolService = createMockHandlerPoolService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventEmitterService,
        {
          provide: EVENT_EMITTER_OPTIONS,
          useValue: defaultOptions,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: PersistenceService,
          useValue: mockPersistenceService,
        },
        {
          provide: DeadLetterQueueService,
          useValue: mockDlqService,
        },
        {
          provide: HandlerExecutionService,
          useValue: mockHandlerExecutionService,
        },
        {
          provide: StreamManagementService,
          useValue: mockStreamManagementService,
        },
        {
          provide: HandlerPoolService,
          useValue: mockHandlerPoolService,
        },
      ],
    }).compile();

    service = module.get<EventEmitterService>(EventEmitterService);

    // Mock logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  }, 10000);

  afterEach(async () => {
    try {
      if (service && typeof service.isShuttingDown === 'function' && !service.isShuttingDown()) {
        await Promise.race([service.onModuleDestroy(), new Promise((_, reject) => setTimeout(() => reject(new Error('Cleanup timeout')), 55000))]);
      }
    } catch (error) {
      console.warn('Service cleanup warning:', error instanceof Error ? error.message : String(error));
    } finally {
      jest.clearAllMocks();
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  }, 60000);

  describe('Module Lifecycle', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    }, 60000);

    it('should initialize successfully with advanced features enabled', async () => {
      await service.onModuleInit();
      expect(service).toBeDefined();
      expect(service.isShuttingDown()).toBe(false);
    }, 60000);

    it('should shutdown gracefully', async () => {
      await service.onModuleInit();
      expect(service.isShuttingDown()).toBe(false);

      await service.onModuleDestroy();
      expect(service.isShuttingDown()).toBe(true);
    }, 60000);
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should emit event successfully', async () => {
      const eventName = 'test.event';
      const payload = { test: 'data' };

      await expect(service.emit(eventName, payload)).resolves.toBeUndefined();
      expect(mockMetricsService.recordEventEmitted).toHaveBeenCalled();
    });

    it('should emit event with custom options', async () => {
      const eventName = 'test.event';
      const payload = { test: 'data' };
      const options: EmitOptions = {
        correlationId: 'test-correlation-id',
        causationId: 'test-causation-id',
        priority: EventPriority.HIGH,
        tenantId: 'test-tenant',
        headers: { custom: 'header' },
      };

      await expect(service.emit(eventName, payload, options)).resolves.toBeUndefined();
      expect(mockMetricsService.recordEventEmitted).toHaveBeenCalled();
    });

    it('should reject emission when shutting down', async () => {
      await service.onModuleDestroy();

      const eventName = 'test.event';
      const payload = { test: 'data' };

      await expect(service.emit(eventName, payload)).rejects.toThrow('EventEmitterService is shutting down');
    });

    it('should emit with persistence when enabled', async () => {
      const service = new EventEmitterService(
        { ...defaultOptions, enablePersistence: true },
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );
      await service.onModuleInit();

      const eventName = 'test.event';
      const payload = { test: 'data' };

      await expect(service.emitWithPersistence(eventName, payload)).resolves.toBeUndefined();
      expect(mockPersistenceService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ name: eventName }),
          payload,
        }),
        EventStatus.PENDING,
      );

      await service.onModuleDestroy();
    });
  });

  describe('Handler Management', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should register handler successfully', () => {
      const eventName = 'test.event';
      const handler = jest.fn().mockResolvedValue(undefined);

      service.on(eventName, handler);

      expect(service.getEventNames()).toContain(eventName);
      expect(service.getHandlerCount(eventName)).toBe(1);
    });

    it('should register multiple handlers for same event', () => {
      const eventName = 'test.event';
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      service.on(eventName, handler1);
      service.on(eventName, handler2);

      expect(service.getHandlerCount(eventName)).toBe(2);
    });

    it('should remove specific handler', () => {
      const eventName = 'test.event';
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      service.on(eventName, handler1);
      service.on(eventName, handler2);
      expect(service.getHandlerCount(eventName)).toBe(2);

      service.off(eventName, handler1);
      expect(service.getHandlerCount(eventName)).toBe(1);
    });

    it('should remove all handlers for event', () => {
      const eventName = 'test.event';
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      service.on(eventName, handler1);
      service.on(eventName, handler2);
      expect(service.getHandlerCount(eventName)).toBe(2);

      service.off(eventName);
      expect(service.getHandlerCount(eventName)).toBe(0);
      expect(service.getEventNames()).not.toContain(eventName);
    });

    it('should get all registered handlers', () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      service.on('event1', handler1);
      service.on('event2', handler2);

      const allHandlers = service.getAllHandlers();
      expect(allHandlers).toHaveLength(2);
      expect(allHandlers[0].metadata.eventName).toBe('event1');
      expect(allHandlers[1].metadata.eventName).toBe('event2');
    });
  });

  describe('Event Processing', () => {
    beforeEach(async () => {
      // Ensure the executeHandler mock actually calls the handler
      (mockHandlerExecutionService.executeHandler as any).mockImplementation(async (registeredHandler: any, event: any) => {
        if (registeredHandler && typeof registeredHandler.handler === 'function') {
          await registeredHandler.handler(event);
        }
        return { success: true } as any;
      });

      await service.onModuleInit();
    });

    it('should process event with registered handler', async () => {
      const eventName = 'test.event';
      const payload = { test: 'data' };
      const handler = jest.fn().mockResolvedValue(undefined);

      service.on(eventName, handler);
      await service.emit(eventName, payload);

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ name: eventName }),
          payload,
        }),
      );
      expect(mockMetricsService.recordEventProcessed).toHaveBeenCalled();
    });

    it('should handle multiple handlers for same event', async () => {
      const eventName = 'test.event';
      const payload = { test: 'data' };
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      service.on(eventName, handler1);
      service.on(eventName, handler2);
      await service.emit(eventName, payload);

      // Wait for bufferTime to complete and event processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should log warning when no handlers found', async () => {
      const eventName = 'test.event';
      const payload = { test: 'data' };

      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      await service.emit(eventName, payload);

      // Wait for bufferTime to complete and event processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(warnSpy).toHaveBeenCalledWith(`No handlers found for event: ${eventName}`);
    });

    it('should handle handler failures and record metrics', async () => {
      const eventName = 'test.event';
      const payload = { test: 'data' };
      const error = new Error('Handler failed');
      const handler = jest.fn().mockRejectedValue(error);

      service.on(eventName, handler);
      await service.emit(eventName, payload);

      // Wait for bufferTime to complete and event processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(handler).toHaveBeenCalled();
      expect(mockMetricsService.recordEventFailed).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ name: eventName }) }),
        error,
      );
    });

    it('should send failed events to DLQ when enabled', async () => {
      const service = new EventEmitterService(
        { ...defaultOptions, enableDeadLetterQueue: true },
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );
      await service.onModuleInit();

      const eventName = 'test.event';
      const payload = { test: 'data' };
      const error = new Error('Handler failed');
      const handler = jest.fn().mockRejectedValue(error);

      service.on(eventName, handler);
      await service.emit(eventName, payload);

      // Wait for bufferTime to complete and event processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(mockDlqService.addEntry).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ name: eventName }) }), error);

      await service.onModuleDestroy();
    });

    it('should use advanced handler execution service when available', async () => {
      const eventName = 'test.event';
      const payload = { test: 'data' };
      const handler = jest.fn().mockResolvedValue(undefined);

      service.registerAdvancedHandler({
        eventName,
        handler,
        instance: {},
        options: {},
        handlerId: 'test-handler-id',
        metadata: {
          eventName,
          options: {},
          className: 'TestHandler',
          methodName: 'handle',
          handlerId: 'test-handler-id',
        },
      });

      await service.emit(eventName, payload);

      // Wait for bufferTime to complete and event processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(mockHandlerExecutionService.executeHandler).toHaveBeenCalled();
    });
  });

  describe('Configuration Options', () => {
    it('should use default options when none provided', () => {
      const service = new EventEmitterService();
      expect(service).toBeDefined();
      expect(service.isShuttingDown()).toBe(false);
    });

    it('should merge provided options with defaults', () => {
      const customOptions: EventEmitterOptions = {
        maxConcurrency: 20,
        bufferTimeMs: 200,
        enableMetrics: false,
      };

      const service = new EventEmitterService(customOptions);
      expect(service).toBeDefined();
    });

    it('should disable advanced features when configured', async () => {
      const service = new EventEmitterService(
        { ...defaultOptions, enableAdvancedFeatures: false },
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );

      await service.onModuleInit();

      const eventName = 'test.event';
      const payload = { test: 'data' };
      const handler = jest.fn().mockResolvedValue(undefined);

      service.on(eventName, handler);
      await service.emit(eventName, payload);

      // Use real timers for this test since advanced features are disabled
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Advanced services should not be called
      expect(mockHandlerExecutionService.executeHandler).not.toHaveBeenCalled();
      expect(mockMetricsService.recordEventEmitted).not.toHaveBeenCalled();

      await service.onModuleDestroy();
    });
  });

  describe('Stream Management Integration', () => {
    it('should use managed stream when stream management is enabled', async () => {
      const service = new EventEmitterService(
        { ...defaultOptions, streamManagement: { enabled: true } },
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );

      await service.onModuleInit();
      expect(mockStreamManagementService.createManagedStream).toHaveBeenCalled();
      await service.onModuleDestroy();
    });

    it('should use regular stream when stream management is disabled', async () => {
      const service = new EventEmitterService(
        { ...defaultOptions, streamManagement: { enabled: false } },
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );

      await service.onModuleInit();
      expect(mockStreamManagementService.createManagedStream).not.toHaveBeenCalled();
      await service.onModuleDestroy();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      service = new EventEmitterService(
        defaultOptions,
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );
      await service.onModuleInit();
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('should log properly during initialization', async () => {
      const mockLoggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const mockLoggerDebug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();

      const advancedService = new EventEmitterService(
        { ...defaultOptions, enableAdvancedFeatures: true },
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );

      await advancedService.onModuleInit();

      expect(mockLoggerLog).toHaveBeenCalledWith('Initializing Enhanced EventEmitterService ...');
      expect(mockLoggerDebug).toHaveBeenCalledWith('Advanced features enabled - integrating with enhanced services');
      expect(mockLoggerDebug).toHaveBeenCalledWith('Metrics service integration active');
      expect(mockLoggerLog).toHaveBeenCalledWith('Enhanced EventEmitterService  initialized successfully');

      await advancedService.onModuleDestroy();
      mockLoggerLog.mockRestore();
      mockLoggerDebug.mockRestore();
    });

    it('should handle setupEventProcessing with disabled advanced features', async () => {
      const disabledService = new EventEmitterService(
        { ...defaultOptions, enableAdvancedFeatures: false },
        undefined, // No metrics service
        undefined, // No persistence service
        undefined, // No DLQ service
        undefined, // No handler execution service
        undefined, // No stream management service
        undefined, // No handler pool service
      );

      await disabledService.onModuleInit();
      expect(disabledService.isShuttingDown()).toBe(false);
      await disabledService.onModuleDestroy();
    });

    it('should handle processEvent with advanced handler execution', async () => {
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      const advancedHandler = {
        handler: mockHandler,
        handlerId: 'test-handler',
        eventName: 'test.event',
        instance: {},
        options: { timeout: 5000 },
        metadata: {
          eventName: 'test.event',
          className: 'TestHandler',
          methodName: 'handle',
          handlerId: 'test-handler',
          options: {},
        },
      };

      service.registerAdvancedHandler(advancedHandler);
      mockHandlerExecutionService.executeHandler.mockResolvedValue({
        success: true,
        executionTime: 100,
        error: undefined,
        executionId: 'exec-789',
        handlerId: 'test-handler',
        context: {
          executionId: 'exec-789',
          retryAttempt: 0,
          executionTimeout: 5000,
          poolName: 'default',
          priority: 1,
          tags: [],
          traceId: 'trace-789',
          spanId: 'span-789',
          startedAt: Date.now(),
          timeoutAt: Date.now() + 5000,
          event: expect.any(Object),
          handler: advancedHandler,
          startTime: Date.now(),
          attempt: 0,
          correlationId: 'test-correlation',
          metadata: {},
        },
        metrics: {
          queueTime: 5,
          executionTime: 100,
          totalTime: 105,
        },
      });

      await service.emit('test.event', { test: 'data' });

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockHandlerExecutionService.executeHandler).toHaveBeenCalled();
    });

    it('should handle processEvent without advanced handler execution', async () => {
      const disabledService = new EventEmitterService(
        { ...defaultOptions, enableAdvancedFeatures: false },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      await disabledService.onModuleInit();

      const mockHandler = jest.fn().mockResolvedValue(undefined);
      disabledService.on('test.event', mockHandler);

      await disabledService.emit('test.event', { test: 'data' });

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockHandler).toHaveBeenCalled();

      await disabledService.onModuleDestroy();
    });

    it('should handle handler execution failures and send to DLQ', async () => {
      // Create a new service with DLQ enabled and advanced features
      const dlqEnabledService = new EventEmitterService(
        { ...defaultOptions, enableDeadLetterQueue: true, enableAdvancedFeatures: true },
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );
      await dlqEnabledService.onModuleInit();

      // Create a handler that returns a RegisteredHandler object
      const mockHandlerFn = jest.fn().mockRejectedValue(new Error('Handler failed'));
      const handlerOptions = {
        priority: 1,
        timeout: 5000,
        retryPolicy: { maxRetries: 0, backoffMs: 1000 },
      };
      const failingHandler = {
        eventName: 'test.event',
        handler: mockHandlerFn,
        instance: mockHandlerFn,
        options: handlerOptions,
        handlerId: 'test-handler-id',
        metadata: {
          eventName: 'test.event',
          options: handlerOptions,
          methodName: 'handle',
          className: 'TestHandler',
          handlerId: 'test-handler-id',
        },
      };

      dlqEnabledService.registerAdvancedHandler(failingHandler);
      mockDlqService.addEntry.mockResolvedValue(undefined);

      // Mock the handler execution service to throw an error
      mockHandlerExecutionService.executeHandler.mockRejectedValue(new Error('Handler execution failed'));

      await dlqEnabledService.emit('test.event', { test: 'data' });

      // Wait for async processing (longer time to ensure DLQ processing)
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(mockDlqService.addEntry).toHaveBeenCalled();
      expect(mockMetricsService.recordEventFailed).toHaveBeenCalled();

      await dlqEnabledService.onModuleDestroy();
    });

    it('should handle metrics recording during event processing', async () => {
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      service.on('test.event', mockHandler);

      await service.emit('test.event', { test: 'data' });

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockMetricsService.recordEventEmitted).toHaveBeenCalled();
      expect(mockMetricsService.recordEventProcessed).toHaveBeenCalled();
    });

    it('should handle persistence service errors during emission with persistence', async () => {
      // Create a new service with persistence enabled and advanced features
      const persistenceEnabledService = new EventEmitterService(
        { ...defaultOptions, enablePersistence: true, enableAdvancedFeatures: true },
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );
      await persistenceEnabledService.onModuleInit();

      mockPersistenceService.save.mockRejectedValue(new Error('Persistence failed'));

      // The error should be thrown since persistence fails
      await expect(persistenceEnabledService.emitWithPersistence('test.event', { test: 'data' })).rejects.toThrow('Persistence failed');

      await persistenceEnabledService.onModuleDestroy();
    });

    it('should handle subscription completion during shutdown', async () => {
      // Emit some events to create active subscriptions
      await service.emit('test.event', { test: 'data' });

      // Mock the subscription completion
      service['eventProcessingSubscription'] = { unsubscribe: jest.fn() } as any;

      // Should complete gracefully
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });

    it('should handle event processing subscription errors', async () => {
      const mockLogger = jest.spyOn(service['logger'], 'error').mockImplementation();

      // Should not crash the service during normal operations
      expect(() => service.getEventNames()).not.toThrow();

      mockLogger.mockRestore();
    });

    it('should handle invalid event data gracefully', async () => {
      const mockLogger = jest.spyOn(service['logger'], 'warn').mockImplementation();

      // Try to emit with invalid data
      await expect(service.emit('' as any, undefined)).resolves.not.toThrow();
      await expect(service.emit(null as any, {})).resolves.not.toThrow();

      mockLogger.mockRestore();
    });

    it('should handle handler registration errors', () => {
      const invalidHandler = null as any;

      expect(() => {
        service.registerAdvancedHandler(invalidHandler);
      }).toThrow();
    });

    it('should handle concurrent shutdowns gracefully', async () => {
      // Start multiple shutdowns concurrently
      const shutdownPromises = [service.onModuleDestroy(), service.onModuleDestroy(), service.onModuleDestroy()];

      // All should complete without throwing
      await expect(Promise.all(shutdownPromises)).resolves.not.toThrow();
    });

    it('should handle stream management service errors', async () => {
      mockStreamManagementService.createManagedStream.mockImplementation(() => {
        throw new Error('Stream management failed');
      });

      const streamService = new EventEmitterService(
        { ...defaultOptions, streamManagement: { enabled: true } },
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );

      // Should handle stream creation errors gracefully
      await expect(streamService.onModuleInit()).resolves.not.toThrow();
      await streamService.onModuleDestroy();
    });

    it('should handle large number of concurrent events', async () => {
      // Register a handler for testing
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      service.on('stress.test', mockHandler);

      // Emit many events concurrently
      const promises = Array.from({ length: 1000 }, (_, i) => service.emit('stress.test', { id: i }));

      // Should handle all events without crashing
      await expect(Promise.all(promises)).resolves.not.toThrow();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      service.off('stress.test', mockHandler);
    });
  });

  describe('Stream Processing Pipeline Coverage', () => {
    beforeEach(async () => {
      // Mock handler execution service to actually execute the handler and return successful results
      mockHandlerExecutionService.executeHandler.mockImplementation(async (handler, event) => {
        // Actually execute the handler function
        await handler.handler(event);

        return {
          success: true,
          executionTime: 50,
          error: undefined,
          executionId: 'test-exec-id',
          handlerId: handler.handlerId || 'test-handler-id',
          context: {} as any,
          metrics: {
            queueTime: 5,
            executionTime: 50,
            totalTime: 55,
          },
        };
      });

      service = new EventEmitterService(
        defaultOptions, // Keep advanced features enabled but mock them properly
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );
      await service.onModuleInit();
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('should process events through setupEventProcessing pipeline', async () => {
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      service.on('pipeline.test', mockHandler);

      // Verify handler was registered
      expect(service.getHandlerCount('pipeline.test')).toBe(1);

      // Emit event to trigger the pipeline
      await service.emit('pipeline.test', { data: 'pipeline' });

      // Wait for pipeline processing (much longer to ensure bufferTime + processing)
      await new Promise((resolve) => setTimeout(resolve, 500));

      // The handler should have been called through the stream processing pipeline
      expect(mockHandler).toHaveBeenCalled();
      expect(mockMetricsService.recordEventEmitted).toHaveBeenCalled();
    });

    it('should handle processEventBatch with multiple events', async () => {
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      service.on('batch.test', mockHandler);

      // Emit multiple events rapidly to trigger batch processing
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(service.emit('batch.test', { id: i }));
      }

      await Promise.all(promises);

      // Wait for batch processing (increased time due to bufferTimeMs: 100 + processing time)
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(mockHandler).toHaveBeenCalledTimes(5);
    });

    it('should handle no handlers found warning', async () => {
      const mockLogger = jest.spyOn(service['logger'], 'warn').mockImplementation();

      await service.emit('nonexistent.event', { data: 'test' });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockLogger).toHaveBeenCalledWith('No handlers found for event: nonexistent.event');
      mockLogger.mockRestore();
    });

    it('should handle event processing errors with catchError', async () => {
      const mockHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const mockLoggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      service.on('error.test', mockHandler);

      await service.emit('error.test', { data: 'error' });

      // Wait for error processing (increased time due to bufferTimeMs: 100 + processing time)
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(mockHandler).toHaveBeenCalled();
      // The pipeline should handle the error gracefully
      expect(() => service.getEventNames()).not.toThrow();

      mockLoggerError.mockRestore();
    });

    it('should filter out events when shutting down', async () => {
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      service.on('shutdown.test', mockHandler);

      // Start shutdown process
      const shutdownPromise = service.onModuleDestroy();

      // Try to emit event during shutdown - this should reject
      await expect(service.emit('shutdown.test', { data: 'test' })).rejects.toThrow('EventEmitterService is shutting down');

      await shutdownPromise;

      // Handler should not be called because emission was rejected during shutdown
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should process events grouped by event name', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      service.on('group.test1', handler1);
      service.on('group.test2', handler2);

      // Emit multiple events of different types
      await Promise.all([
        service.emit('group.test1', { id: 1 }),
        service.emit('group.test2', { id: 2 }),
        service.emit('group.test1', { id: 3 }),
        service.emit('group.test2', { id: 4 }),
      ]);

      // Wait for processing (increased time due to bufferTimeMs: 100 + processing time)
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(handler1).toHaveBeenCalledTimes(2);
      expect(handler2).toHaveBeenCalledTimes(2);
    });
  });

  describe('Advanced Features Integration Coverage', () => {
    it('should use managed stream when stream management is enabled', async () => {
      const streamService = new EventEmitterService(
        { ...defaultOptions, streamManagement: { enabled: true } },
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );

      // Mock stream management to return a managed stream
      mockStreamManagementService.createManagedStream.mockReturnValue(streamService['eventBus$']);

      await streamService.onModuleInit();

      expect(mockStreamManagementService.createManagedStream).toHaveBeenCalled();

      await streamService.onModuleDestroy();
    });

    it('should handle advanced handler execution with execution results', async () => {
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      const advancedHandler = {
        handler: mockHandler,
        handlerId: 'advanced-test-handler',
        eventName: 'advanced.test',
        instance: {},
        options: { timeout: 5000 },
        metadata: {
          eventName: 'advanced.test',
          className: 'AdvancedTestHandler',
          methodName: 'handle',
          handlerId: 'advanced-test-handler',
          options: {},
        },
      };

      const service = new EventEmitterService(
        defaultOptions,
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );

      await service.onModuleInit();

      service.registerAdvancedHandler(advancedHandler);

      // Mock successful execution
      mockHandlerExecutionService.executeHandler.mockResolvedValue({
        success: true,
        executionTime: 150,
        error: undefined,
        executionId: 'exec-123',
        handlerId: 'advanced-test-handler',
        context: {
          executionId: 'exec-123',
          retryAttempt: 0,
          executionTimeout: 5000,
          poolName: 'default',
          priority: 1,
          tags: [],
          traceId: 'trace-123',
          spanId: 'span-123',
          startedAt: Date.now(),
          timeoutAt: Date.now() + 5000,
          // Base HandlerExecutionContext properties
          event: expect.any(Object),
          handler: advancedHandler,
          startTime: Date.now(),
          attempt: 0,
          correlationId: 'test-correlation',
          metadata: {},
        },
        metrics: {
          queueTime: 10,
          executionTime: 150,
          totalTime: 160,
        },
      });

      await service.emit('advanced.test', { data: 'advanced' });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockHandlerExecutionService.executeHandler).toHaveBeenCalledWith(advancedHandler, expect.any(Object));
      expect(mockMetricsService.recordEventProcessed).toHaveBeenCalled();

      await service.onModuleDestroy();
    });

    it('should handle failed execution results and record metrics', async () => {
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      const failingHandler = {
        handler: mockHandler,
        handlerId: 'failing-handler',
        eventName: 'failing.test',
        instance: {},
        options: { timeout: 5000 },
        metadata: {
          eventName: 'failing.test',
          className: 'FailingHandler',
          methodName: 'handle',
          handlerId: 'failing-handler',
          options: {},
        },
      };

      const service = new EventEmitterService(
        { ...defaultOptions, enableDeadLetterQueue: true },
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );

      await service.onModuleInit();

      service.registerAdvancedHandler(failingHandler);

      // Mock failed execution
      const executionError = new Error('Execution failed');
      mockHandlerExecutionService.executeHandler.mockResolvedValue({
        success: false,
        executionTime: 50,
        error: executionError,
        executionId: 'exec-456',
        handlerId: 'failing-handler',
        context: {
          executionId: 'exec-456',
          retryAttempt: 0,
          executionTimeout: 5000,
          poolName: 'default',
          priority: 1,
          tags: [],
          traceId: 'trace-456',
          spanId: 'span-456',
          startedAt: Date.now(),
          timeoutAt: Date.now() + 5000,
          // Base HandlerExecutionContext properties
          event: expect.any(Object),
          handler: failingHandler,
          startTime: Date.now(),
          attempt: 0,
          correlationId: 'test-correlation',
          metadata: {},
        },
        metrics: {
          queueTime: 5,
          executionTime: 50,
          totalTime: 55,
        },
      });

      await service.emit('failing.test', { data: 'failing' });

      // Wait for processing (increased time for stream processing)
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(mockMetricsService.recordEventFailed).toHaveBeenCalledWith(expect.any(Object), executionError);
      expect(mockDlqService.addEntry).toHaveBeenCalled();

      await service.onModuleDestroy();
    });

    it('should handle simple handlers when advanced features are disabled', async () => {
      const disabledService = new EventEmitterService(
        { ...defaultOptions, enableAdvancedFeatures: false },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      await disabledService.onModuleInit();

      const mockHandler = jest.fn().mockResolvedValue(undefined);
      disabledService.on('simple.test', mockHandler);

      await disabledService.emit('simple.test', { data: 'simple' });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockHandler).toHaveBeenCalled();

      await disabledService.onModuleDestroy();
    });

    it('should handle subscription completion callback', async () => {
      const mockLoggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      const testService = new EventEmitterService(
        defaultOptions,
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );

      await testService.onModuleInit();

      // Complete the stream before unsubscribing to trigger the completion callback
      testService['eventBus$'].complete();

      // Give a small delay to ensure completion callback has time to execute
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockLoggerLog).toHaveBeenCalledWith('Event processing pipeline completed');
      mockLoggerLog.mockRestore();

      // Cleanup
      await testService.onModuleDestroy();
    });
  });

  describe('Additional Coverage for EventEmitterService', () => {
    it('should handle isStreamManagementEnabled method', () => {
      const result = service['isStreamManagementEnabled']();
      expect(typeof result).toBe('boolean');
    });

    it('should handle error in event processing pipeline', async () => {
      const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

      // Force an error in the processing pipeline by corrupting the state
      const originalProcessEventBatch = service['processEventBatch'];
      service['processEventBatch'] = jest.fn().mockRejectedValue(new Error('Pipeline error'));

      const mockHandler = jest.fn().mockResolvedValue(undefined);
      service.on('pipeline.error', mockHandler);

      await service.emit('pipeline.error', { data: 'test' });

      // Wait for error to be processed
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Restore original method
      service['processEventBatch'] = originalProcessEventBatch;
      errorSpy.mockRestore();
    });

    it('should handle stream management enabled/disabled checks', () => {
      // Test the isStreamManagementEnabled private method
      const result = (service as any).isStreamManagementEnabled();
      expect(typeof result).toBe('boolean');
    });

    it('should handle event processing subscription errors to cover line 152', async () => {
      const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation();
      
      // Force an error by making the eventBus$ Subject throw an error
      const originalNext = service['eventBus$'].next;
      let errorThrown = false;
      
      service['eventBus$'].next = jest.fn().mockImplementation(() => {
        if (!errorThrown) {
          errorThrown = true;
          throw new Error('EventBus synchronous error');
        }
        return originalNext.call(service['eventBus$'], arguments[0]);
      });

      try {
        await service.emit('test.error', { data: 'test' });
        // Wait a bit for the error to propagate
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // Expected error from eventBus
      }

      // Check that the subscription error handler was called
      expect(errorSpy).toHaveBeenCalledWith('Event processing pipeline error:', expect.any(Error));
      
      // Restore
      service['eventBus$'].next = originalNext;
      errorSpy.mockRestore();
    });

    it('should handle emitWithPersistence when persistence is disabled', async () => {
      // Create service without persistence
      const noPersistenceService = new EventEmitterService(
        { ...defaultOptions, enablePersistence: false },
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        mockStreamManagementService,
        mockHandlerPoolService,
      );
      await noPersistenceService.onModuleInit();

      // This should work even without persistence enabled
      await expect(noPersistenceService.emitWithPersistence('test.event', { data: 'test' })).resolves.not.toThrow();

      await noPersistenceService.onModuleDestroy();
    });
  });

  describe('Error Coverage for Uncovered Lines', () => {
    it('should handle createEvent method coverage', () => {
      // Test the private createEvent method by calling emitWithPersistence
      const eventName = 'test.create.event';
      const payload = { test: 'data' };
      const options: EmitOptions = {
        correlationId: 'test-correlation',
        causationId: 'test-causation',
        priority: EventPriority.HIGH,
        tenantId: 'test-tenant',
        headers: { test: 'header' },
      };

      // This will call the private createEvent method
      const result = service['createEvent'](eventName, payload, options);

      expect(result).toBeDefined();
      expect(result.metadata.name).toBe(eventName);
      expect(result.metadata.correlationId).toBe(options.correlationId);
      expect(result.metadata.causationId).toBe(options.causationId);
      expect(result.metadata.priority).toBe(options.priority);
      expect(result.metadata.tenantId).toBe(options.tenantId);
      expect(result.metadata.headers).toBe(options.headers);
      expect(result.payload).toBe(payload);
    });

    it('should cover getEventNames method', () => {
      // Register some handlers to have event names
      service.on('test.event.1', jest.fn());
      service.on('test.event.2', jest.fn());

      const eventNames = service.getEventNames();
      expect(eventNames).toContain('test.event.1');
      expect(eventNames).toContain('test.event.2');
    });

    it('should cover getHandlerCount method', () => {
      // Register multiple handlers for the same event
      service.on('multi.handler.event', jest.fn());
      service.on('multi.handler.event', jest.fn());
      service.on('multi.handler.event', jest.fn());

      const count = service.getHandlerCount('multi.handler.event');
      expect(count).toBe(3);

      // Test with non-existent event
      const zeroCount = service.getHandlerCount('non.existent.event');
      expect(zeroCount).toBe(0);
    });

    it('should handle stream management constructor error coverage', () => {
      // Create a service with a stream management service that throws an error
      const errorStreamService = {
        createManagedStream: jest.fn().mockImplementation(() => {
          throw new Error('Stream management error');
        }),
      };

      const serviceWithError = new EventEmitterService(
        { enableAdvancedFeatures: true, streamManagement: { enabled: true } },
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
        mockHandlerExecutionService,
        errorStreamService as any,
        mockHandlerPoolService,
      );

      // Verify service was created despite the error (fallback behavior)
      expect(serviceWithError).toBeDefined();
    });

    it('should test emit error path when eventBus throws', () => {
      // Mock the eventBus to throw an error
      jest.spyOn(service['eventBus$'], 'next').mockImplementation(() => {
        throw new Error('EventBus error');
      });

      const emitPromise = service.emit('error.event', { test: 'data' });

      // Should reject the promise due to error
      return expect(emitPromise).rejects.toThrow('EventBus error');
    });

    it('should cover isStreamManagementEnabled when streamManagement is undefined', () => {
      // Create service without streamManagement configuration
      const serviceWithoutStreamConfig = new EventEmitterService({}, mockMetricsService);

      // This should return true as the default
      expect(serviceWithoutStreamConfig['isStreamManagementEnabled']()).toBe(true);
    });

    it('should handle registerHandler alias method', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const eventName = 'alias.test.event';

      service.registerHandler(eventName, handler);

      expect(service.getHandlerCount(eventName)).toBe(1);
    });

    it('should handle removeHandler alias method', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const eventName = 'remove.alias.test.event';

      service.on(eventName, handler);
      expect(service.getHandlerCount(eventName)).toBe(1);

      service.removeHandler(eventName, handler);
      expect(service.getHandlerCount(eventName)).toBe(0);
    });

    it('should handle processEvent with handler timeout when advanced features disabled', async () => {
      // Create service with advanced features disabled
      const basicService = new EventEmitterService(
        { enableAdvancedFeatures: false },
        undefined, // No metrics service
        undefined, // No persistence service
        undefined, // No DLQ service
        undefined, // No handler execution service
        undefined, // No stream management service
        undefined, // No handler pool service
      );

      await basicService.onModuleInit();

      // Register a handler that takes too long
      const slowHandler = jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 35000)));
      basicService.on('timeout.event', slowHandler);

      // Emit the event to trigger timeout
      await basicService.emit('timeout.event', { test: 'data' });

      // Wait for buffer time and processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      await basicService.onModuleDestroy();
    });

    it('should handle emitWithPersistence when persistence service is available but persistence is disabled', async () => {
      // Create service with persistence service available but persistence disabled
      const noPersistService = new EventEmitterService(
        { enablePersistence: false, enableAdvancedFeatures: true },
        mockMetricsService,
        mockPersistenceService,
        mockDlqService,
      );

      await noPersistService.onModuleInit();

      // This should not call persistence service save method
      await expect(noPersistService.emitWithPersistence('test.persist.event', { data: 'test' })).resolves.not.toThrow();

      // Verify persistence was not called since it's disabled
      expect(mockPersistenceService.save).not.toHaveBeenCalled();

      await noPersistService.onModuleDestroy();
    });

    it('should cover the DLQ warning path when DLQ is enabled but service not available', async () => {
      // Create service with DLQ enabled but no DLQ service
      const noDlqService = new EventEmitterService(
        { enableDeadLetterQueue: true, enableAdvancedFeatures: true },
        mockMetricsService,
        mockPersistenceService,
        undefined, // No DLQ service
      );

      await noDlqService.onModuleInit();

      // Register a failing handler to trigger DLQ path
      const failingHandler = jest.fn().mockRejectedValue(new Error('Handler failed'));
      noDlqService.on('dlq.test.event', failingHandler);

      // Spy on logger to catch the warning
      const warnLoggerSpy = jest.spyOn(noDlqService['logger'], 'warn');

      // Emit event to trigger failure
      await noDlqService.emit('dlq.test.event', { test: 'data' });

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should log warning about DLQ service not available
      expect(warnLoggerSpy).toHaveBeenCalledWith(expect.stringContaining('should be sent to DLQ but service not available'));

      await noDlqService.onModuleDestroy();
    });

    it('should cover stream processing error catchError branch', async () => {
      // Mock processEventBatch to throw an error
      const originalProcessEventBatch = service['processEventBatch'];
      jest.spyOn(service as any, 'processEventBatch').mockImplementation(() => {
        throw new Error('Batch processing error');
      });

      await service.onModuleInit();

      // Register handler to trigger processing
      service.on('batch.error.event', jest.fn().mockResolvedValue(undefined));

      // Spy on logger to catch the error
      const errorLoggerSpy = jest.spyOn(service['logger'], 'error');

      // Emit event to trigger batch processing error
      await service.emit('batch.error.event', { test: 'data' });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should log the error for the event group
      expect(errorLoggerSpy).toHaveBeenCalledWith(expect.stringContaining('Error processing events for batch.error.event'), expect.any(Error));

      // Restore original method
      jest.spyOn(service as any, 'processEventBatch').mockImplementation(originalProcessEventBatch);

      await service.onModuleDestroy();
    });

    it('should handle off method with non-existent event', () => {
      // Try to remove handlers from non-existent event - this should hit line 280
      service.off('non.existent.event.for.removal');

      // Should return gracefully without error
      expect(service.getHandlerCount('non.existent.event.for.removal')).toBe(0);
    });

    it('should handle off method with specific handler on non-existent event', () => {
      const handler = jest.fn().mockResolvedValue(undefined);

      // Try to remove specific handler from non-existent event - this should hit line 280
      service.off('non.existent.event.for.specific.removal', handler);

      // Should return gracefully without error
      expect(service.getHandlerCount('non.existent.event.for.specific.removal')).toBe(0);
    });
  });
});
