import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { firstValueFrom } from 'rxjs';
import { HandlerExecutionService } from '@src/modules/rx-event-emitter/services/handler-execution.service';
import { HandlerPoolService } from '@src/modules/rx-event-emitter/services/handler-pool.service';
import { MetricsService } from '@src/modules/rx-event-emitter/services/metrics.service';
import { DeadLetterQueueService } from '@src/modules/rx-event-emitter/services/dead-letter-queue.service';
import { Event, RegisteredHandler, HandlerExecutionContext, CircuitBreakerState, EVENT_EMITTER_OPTIONS } from '@src/modules/rx-event-emitter/interfaces';
import { EventPriority } from '@src/modules/rx-event-emitter/interfaces';

describe('HandlerExecutionService', () => {
  let service: HandlerExecutionService;
  let mockHandlerPoolService: jest.Mocked<HandlerPoolService>;
  let mockMetricsService: jest.Mocked<MetricsService>;
  let mockDLQService: jest.Mocked<DeadLetterQueueService>;

  const createMockEvent = (): Event => ({
    metadata: {
      id: 'test-event-id',
      name: 'test.event',
      timestamp: Date.now(),
      correlationId: 'test-correlation',
      priority: EventPriority.NORMAL,
    },
    payload: { test: 'data' },
  });

  const createMockHandler = (overrides: Partial<RegisteredHandler> = {}): RegisteredHandler => ({
    eventName: 'test.event',
    handlerName: 'TestHandler',
    handler: {
      handle: jest.fn().mockResolvedValue(undefined),
    },
    options: {
      timeout: 5000,
      priority: 5,
      retryPolicy: {
        maxRetries: 3,
        backoffMs: 1000,
      },
    },
    metadata: {
      isRegistered: true,
      registeredAt: Date.now(),
      handlerClass: 'TestHandler',
    },
    ...overrides,
  });

  const createMockServices = () => ({
    handlerPool: {
      executeInPool: jest.fn().mockResolvedValue(undefined),
      getPoolMetrics: jest.fn().mockReturnValue({
        poolName: 'default',
        activeHandlers: 0,
        queueLength: 0,
        totalExecuted: 0,
        averageExecutionTime: 0,
      }),
      hasPool: jest.fn().mockReturnValue(true),
    } as any,
    metrics: {
      recordHandlerExecution: jest.fn(),
      recordHandlerFailure: jest.fn(),
      recordCircuitBreakerState: jest.fn(),
    } as any,
    dlq: {
      addEntry: jest.fn().mockResolvedValue(undefined),
    } as any,
  });

  beforeEach(async () => {
    const mocks = createMockServices();
    mockHandlerPoolService = mocks.handlerPool;
    mockMetricsService = mocks.metrics;
    mockDLQService = mocks.dlq;

    const moduleRef = await Test.createTestingModule({
      providers: [
        HandlerExecutionService,
        {
          provide: HandlerPoolService,
          useValue: mockHandlerPoolService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: DeadLetterQueueService,
          useValue: mockDLQService,
        },
        {
          provide: EVENT_EMITTER_OPTIONS,
          useValue: {
            enableAdvancedFeatures: true,
            defaultTimeout: 30000,
            maxRetries: 3,
            circuitBreaker: {
              enabled: true,
              failureThreshold: 5,
              recoveryTimeout: 30000,
            },
            execution: {
              enabled: true,
              defaultTimeout: 30000,
              maxRetries: 3,
              enableCircuitBreaker: true,
              enableMetrics: true,
            },
          },
        },
      ],
    }).compile();

    service = moduleRef.get(HandlerExecutionService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Service Lifecycle', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize successfully with enabled configuration', async () => {
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    it('should shutdown gracefully', async () => {
      await service.onModuleInit();
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });

    it('should initialize with disabled configuration', async () => {
      const disabledService = new HandlerExecutionService({ enableAdvancedFeatures: false }, mockHandlerPoolService, mockMetricsService, mockDLQService);

      await expect(disabledService.onModuleInit()).resolves.not.toThrow();
      await disabledService.onModuleDestroy();
    });

    it('should use default configuration when no options provided', () => {
      const defaultService = new HandlerExecutionService(undefined, mockHandlerPoolService, mockMetricsService, mockDLQService);

      expect(defaultService).toBeDefined();
    });
  });

  describe('Handler Execution', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should execute handler successfully', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();
      const context: HandlerExecutionContext = {
        event: mockEvent,
        handler: mockHandler,
        startTime: Date.now(),
        timeout: 5000,
        retryCount: 0,
        maxRetries: 3,
        circuitBreakerState: CircuitBreakerState.CLOSED,
      };

      const result = await service.executeHandler(context);

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(mockHandler.handler.handle).toHaveBeenCalledWith(mockEvent);
    });

    it('should handle handler execution failure', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();
      const testError = new Error('Handler execution failed');

      mockHandler.handler.handle = jest.fn().mockRejectedValue(testError);

      const context: HandlerExecutionContext = {
        event: mockEvent,
        handler: mockHandler,
        startTime: Date.now(),
        timeout: 5000,
        retryCount: 0,
        maxRetries: 3,
        circuitBreakerState: CircuitBreakerState.CLOSED,
      };

      const result = await service.executeHandler(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe(testError);
      expect(mockMetricsService.recordHandlerFailure).toHaveBeenCalled();
    });

    it('should handle handler execution timeout', async () => {
      jest.useFakeTimers();

      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      mockHandler.handler.handle = jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 10000)));

      const context: HandlerExecutionContext = {
        event: mockEvent,
        handler: mockHandler,
        startTime: Date.now(),
        timeout: 1000,
        retryCount: 0,
        maxRetries: 3,
        circuitBreakerState: CircuitBreakerState.CLOSED,
      };

      const executionPromise = service.executeHandler(context);

      jest.advanceTimersByTime(2000);

      const result = await executionPromise;

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timeout');

      jest.useRealTimers();
    });

    it('should execute handler with retry on failure', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();
      const testError = new Error('Transient error');

      mockHandler.handler.handle = jest.fn().mockRejectedValueOnce(testError).mockRejectedValueOnce(testError).mockResolvedValueOnce(undefined);

      const result = await service.executeHandlerWithRetry(mockEvent, mockHandler);

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2);
      expect(mockHandler.handler.handle).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries exceeded', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler({
        options: {
          retryPolicy: {
            maxRetries: 2,
            backoffMs: 100,
          },
        },
      });
      const testError = new Error('Persistent error');

      mockHandler.handler.handle = jest.fn().mockRejectedValue(testError);

      const result = await service.executeHandlerWithRetry(mockEvent, mockHandler);

      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(2);
      expect(result.error).toBe(testError);
      expect(mockDLQService.addEntry).toHaveBeenCalledWith(mockEvent, testError);
    });

    it('should execute multiple handlers for same event', async () => {
      const mockEvent = createMockEvent();
      const handlers = [
        createMockHandler({ handlerName: 'Handler1' }),
        createMockHandler({ handlerName: 'Handler2' }),
        createMockHandler({ handlerName: 'Handler3' }),
      ];

      const results = await service.executeHandlers(mockEvent, handlers);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      handlers.forEach((handler) => {
        expect(handler.handler.handle).toHaveBeenCalledWith(mockEvent);
      });
    });

    it('should handle mixed success and failure in multiple handlers', async () => {
      const mockEvent = createMockEvent();
      const handlers = [
        createMockHandler({ handlerName: 'SuccessHandler' }),
        createMockHandler({ handlerName: 'FailHandler' }),
        createMockHandler({ handlerName: 'AnotherSuccessHandler' }),
      ];

      handlers[1].handler.handle = jest.fn().mockRejectedValue(new Error('Handler failed'));

      const results = await service.executeHandlers(mockEvent, handlers);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
  });

  describe('Circuit Breaker', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should track circuit breaker state', () => {
      const handlerId = 'test-handler';

      const state = service.getCircuitBreakerState(handlerId);
      expect(state).toBe(CircuitBreakerState.CLOSED);
    });

    it('should open circuit breaker after threshold failures', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler({ handlerName: 'FailingHandler' });
      const testError = new Error('Persistent error');

      mockHandler.handler.handle = jest.fn().mockRejectedValue(testError);

      for (let i = 0; i < 6; i++) {
        await service.executeHandlerWithRetry(mockEvent, mockHandler);
      }

      const state = service.getCircuitBreakerState('FailingHandler');
      expect([CircuitBreakerState.OPEN, CircuitBreakerState.HALF_OPEN]).toContain(state);
    });

    it('should provide circuit breaker metrics', () => {
      const handlerId = 'test-handler';

      const metrics = service.getCircuitBreakerMetrics(handlerId);
      expect(metrics).toBeDefined();
      expect(metrics.state).toBe(CircuitBreakerState.CLOSED);
      expect(typeof metrics.failureCount).toBe('number');
      expect(typeof metrics.successCount).toBe('number');
    });

    it('should reset circuit breaker', () => {
      const handlerId = 'test-handler';

      expect(() => service.resetCircuitBreaker(handlerId)).not.toThrow();

      const state = service.getCircuitBreakerState(handlerId);
      expect(state).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('Handler Pool Integration', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should execute handler in pool when pool is available', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler({
        options: {
          poolName: 'custom-pool',
        },
      });

      mockHandlerPoolService.hasPool.mockReturnValue(true);
      mockHandlerPoolService.executeInPool.mockResolvedValue(undefined);

      const context: HandlerExecutionContext = {
        event: mockEvent,
        handler: mockHandler,
        startTime: Date.now(),
        timeout: 5000,
        retryCount: 0,
        maxRetries: 3,
        circuitBreakerState: CircuitBreakerState.CLOSED,
      };

      const result = await service.executeHandler(context);

      expect(result.success).toBe(true);
      expect(mockHandlerPoolService.executeInPool).toHaveBeenCalled();
    });

    it('should fall back to direct execution when pool is unavailable', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler({
        options: {
          poolName: 'non-existent-pool',
        },
      });

      mockHandlerPoolService.hasPool.mockReturnValue(false);

      const context: HandlerExecutionContext = {
        event: mockEvent,
        handler: mockHandler,
        startTime: Date.now(),
        timeout: 5000,
        retryCount: 0,
        maxRetries: 3,
        circuitBreakerState: CircuitBreakerState.CLOSED,
      };

      const result = await service.executeHandler(context);

      expect(result.success).toBe(true);
      expect(mockHandlerPoolService.executeInPool).not.toHaveBeenCalled();
      expect(mockHandler.handler.handle).toHaveBeenCalledWith(mockEvent);
    });
  });

  describe('Execution Statistics', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should provide handler execution statistics', () => {
      const handlerId = 'test-handler';

      const stats = service.getHandlerStats(handlerId);
      expect(stats).toBeDefined();
      expect(stats.handlerId).toBe(handlerId);
      expect(typeof stats.totalExecutions).toBe('number');
      expect(typeof stats.successfulExecutions).toBe('number');
      expect(typeof stats.failedExecutions).toBe('number');
    });

    it('should provide all handler statistics', () => {
      const allStats = service.getAllHandlerStats();
      expect(Array.isArray(allStats)).toBe(true);
    });

    it('should provide execution results observable', async () => {
      const observable = service.getExecutionResults();
      expect(observable).toBeDefined();
      expect(typeof observable.subscribe).toBe('function');

      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      const resultPromise = firstValueFrom(observable);

      const context: HandlerExecutionContext = {
        event: mockEvent,
        handler: mockHandler,
        startTime: Date.now(),
        timeout: 5000,
        retryCount: 0,
        maxRetries: 3,
        circuitBreakerState: CircuitBreakerState.CLOSED,
      };

      await service.executeHandler(context);

      const result = await resultPromise;
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('Configuration and Options', () => {
    it('should handle custom execution configuration', async () => {
      const customService = new HandlerExecutionService(
        {
          execution: {
            enabled: true,
            defaultTimeout: 10000,
            maxRetries: 5,
            enableCircuitBreaker: false,
            enableMetrics: false,
          },
        },
        mockHandlerPoolService,
        mockMetricsService,
        mockDLQService,
      );

      await expect(customService.onModuleInit()).resolves.not.toThrow();
      await customService.onModuleDestroy();
    });

    it('should respect disabled circuit breaker configuration', async () => {
      const customService = new HandlerExecutionService(
        {
          execution: {
            enabled: true,
            enableCircuitBreaker: false,
          },
        },
        mockHandlerPoolService,
        mockMetricsService,
        mockDLQService,
      );

      await customService.onModuleInit();

      const state = customService.getCircuitBreakerState('test-handler');
      expect(state).toBe(CircuitBreakerState.DISABLED);

      await customService.onModuleDestroy();
    });

    it('should respect disabled metrics configuration', async () => {
      const customService = new HandlerExecutionService(
        {
          execution: {
            enabled: true,
            enableMetrics: false,
          },
        },
        mockHandlerPoolService,
        mockMetricsService,
        mockDLQService,
      );

      await customService.onModuleInit();

      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      const context: HandlerExecutionContext = {
        event: mockEvent,
        handler: mockHandler,
        startTime: Date.now(),
        timeout: 5000,
        retryCount: 0,
        maxRetries: 3,
        circuitBreakerState: CircuitBreakerState.CLOSED,
      };

      await customService.executeHandler(context);

      expect(mockMetricsService.recordHandlerExecution).not.toHaveBeenCalled();

      await customService.onModuleDestroy();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle null or undefined handler gracefully', async () => {
      const mockEvent = createMockEvent();

      const result = await service.executeHandlers(mockEvent, []);

      expect(result).toHaveLength(0);
    });

    it('should handle handler with no handle method', async () => {
      const mockEvent = createMockEvent();
      const invalidHandler = createMockHandler();
      invalidHandler.handler = {} as any;

      const context: HandlerExecutionContext = {
        event: mockEvent,
        handler: invalidHandler,
        startTime: Date.now(),
        timeout: 5000,
        retryCount: 0,
        maxRetries: 3,
        circuitBreakerState: CircuitBreakerState.CLOSED,
      };

      const result = await service.executeHandler(context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle very short timeouts', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      mockHandler.handler.handle = jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      const context: HandlerExecutionContext = {
        event: mockEvent,
        handler: mockHandler,
        startTime: Date.now(),
        timeout: 1,
        retryCount: 0,
        maxRetries: 3,
        circuitBreakerState: CircuitBreakerState.CLOSED,
      };

      const result = await service.executeHandler(context);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timeout');
    });

    it('should handle concurrent executions', async () => {
      const mockEvent = createMockEvent();
      const handlers = Array.from({ length: 10 }, (_, i) => createMockHandler({ handlerName: `ConcurrentHandler${i}` }));

      const results = await Promise.all(handlers.map((handler) => service.executeHandlerWithRetry(mockEvent, handler)));

      expect(results).toHaveLength(10);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('Advanced Features', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle priority-based execution', async () => {
      const mockEvent = createMockEvent();
      const handlers = [
        createMockHandler({
          handlerName: 'LowPriorityHandler',
          options: { priority: 1 },
        }),
        createMockHandler({
          handlerName: 'HighPriorityHandler',
          options: { priority: 10 },
        }),
        createMockHandler({
          handlerName: 'MediumPriorityHandler',
          options: { priority: 5 },
        }),
      ];

      const results = await service.executeHandlers(mockEvent, handlers);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should provide comprehensive execution context', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      const context: HandlerExecutionContext = {
        event: mockEvent,
        handler: mockHandler,
        startTime: Date.now(),
        timeout: 5000,
        retryCount: 2,
        maxRetries: 3,
        circuitBreakerState: CircuitBreakerState.HALF_OPEN,
        metadata: {
          correlationId: 'test-correlation',
          traceId: 'test-trace',
        },
      };

      const result = await service.executeHandler(context);

      expect(result.success).toBe(true);
      expect(result.context).toEqual(context);
    });
  });
});
