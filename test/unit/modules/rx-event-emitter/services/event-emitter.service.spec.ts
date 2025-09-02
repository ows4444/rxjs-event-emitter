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
      createManagedStream: jest.fn().mockImplementation((name, source) => source),
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
});
