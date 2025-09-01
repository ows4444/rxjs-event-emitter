import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { firstValueFrom } from 'rxjs';
import { HandlerExecutionService } from '@src/modules/rx-event-emitter/services/handler-execution.service';
import { HandlerPoolService } from '@src/modules/rx-event-emitter/services/handler-pool.service';
import { MetricsService } from '@src/modules/rx-event-emitter/services/metrics.service';
import { DeadLetterQueueService } from '@src/modules/rx-event-emitter/services/dead-letter-queue.service';
import type { Event, RegisteredHandler, HandlerOptions } from '@src/modules/rx-event-emitter/interfaces';
import { CircuitBreakerState, EVENT_EMITTER_OPTIONS, EventPriority } from '@src/modules/rx-event-emitter/interfaces';

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
    handlerId: 'test-handler-id',
    handler: jest.fn().mockResolvedValue(undefined),
    instance: {},
    options: {
      timeout: 5000,
      priority: 5,
      retries: 3,
      retryable: true,
    },
    metadata: {
      eventName: 'test.event',
      className: 'TestHandler',
      methodName: 'handle',
      handlerId: 'test-handler-id',
      options: {
        timeout: 5000,
        priority: 5,
      },
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

    it('should initialize without optional services', async () => {
      const minimalService = new HandlerExecutionService();
      await expect(minimalService.onModuleInit()).resolves.not.toThrow();
      await minimalService.onModuleDestroy();
    });

    it('should use default configuration when no options provided', () => {
      const defaultService = new HandlerExecutionService();
      expect(defaultService).toBeDefined();
    });

    it('should handle shutdown with active executions', async () => {
      jest.useFakeTimers();
      await service.onModuleInit();

      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      // Create a long-running handler
      const longRunningHandler = createMockHandler({
        handler: jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 10000)))
      });

      // Start execution but don't wait for it
      const executionPromise = service.executeHandler(longRunningHandler, mockEvent);

      // Start shutdown
      const shutdownPromise = service.onModuleDestroy();

      // Fast-forward 6 seconds (shutdown waits 5 seconds)
      jest.advanceTimersByTime(6000);

      await shutdownPromise;

      // Clean up the execution promise
      jest.advanceTimersByTime(10000);
      await expect(executionPromise).rejects.toThrow();

      jest.useRealTimers();
    });
  });

  describe('Handler Execution', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should execute handler successfully', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      const result = await service.executeHandler(mockHandler, mockEvent);

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(mockHandler.handler).toHaveBeenCalledWith(mockEvent);
      expect(result.executionId).toBeDefined();
      expect(result.handlerId).toBeDefined();
      expect(result.context).toBeDefined();
      expect(result.metrics).toBeDefined();
    });

    it('should execute handler with custom options', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();
      const options: Partial<HandlerOptions & { pool?: string }> = {
        timeout: 10000,
        priority: EventPriority.HIGH,
        pool: 'custom-pool',
      };

      const result = await service.executeHandler(mockHandler, mockEvent, options);

      expect(result.success).toBe(true);
      expect(result.context.executionTimeout).toBe(10000);
      expect(result.context.priority).toBe(8);
      expect(result.context.poolName).toBe('custom-pool');
    });

    it('should handle handler execution failure', async () => {
      const mockEvent = createMockEvent();
      const testError = new Error('Handler execution failed');
      const failingHandler = createMockHandler({
        handler: jest.fn().mockRejectedValue(testError)
      });

      await expect(service.executeHandler(failingHandler, mockEvent)).rejects.toThrow('Handler execution failed');

      expect(mockMetricsService.recordHandlerExecution).toHaveBeenCalledWith(expect.stringContaining('TestHandler'), expect.any(Number), false);
    });

    it('should handle handler execution timeout', async () => {
      jest.useFakeTimers();

      const mockEvent = createMockEvent();
      const slowHandler = createMockHandler({
        handler: jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 10000)))
      });

      const executionPromise = service.executeHandler(slowHandler, mockEvent, { timeout: 1000 });

      jest.advanceTimersByTime(2000);

      await expect(executionPromise).rejects.toThrow('Handler execution timeout');

      jest.useRealTimers();
    });

    it('should execute handler in pool when available', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      mockHandlerPoolService.executeInPool.mockResolvedValue('pool-result');

      const result = await service.executeHandler(mockHandler, mockEvent);

      expect(result.success).toBe(true);
      expect(mockHandlerPoolService.executeInPool).toHaveBeenCalled();
    });

    it('should execute handler directly when no pool service', async () => {
      const serviceWithoutPool = new HandlerExecutionService(
        undefined, // no pool service
        mockMetricsService,
        mockDLQService,
        { enableAdvancedFeatures: true },
      );

      await serviceWithoutPool.onModuleInit();

      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      const result = await serviceWithoutPool.executeHandler(mockHandler, mockEvent);

      expect(result.success).toBe(true);
      expect(mockHandler.handler).toHaveBeenCalledWith(mockEvent);

      await serviceWithoutPool.onModuleDestroy();
    });

    it('should handle handler execution with correlation ID', async () => {
      const mockEvent = {
        ...createMockEvent(),
        metadata: {
          ...createMockEvent().metadata,
          correlationId: 'custom-correlation-id'
        }
      };
      const mockHandler = createMockHandler();

      const result = await service.executeHandler(mockHandler, mockEvent);

      expect(result.success).toBe(true);
      expect(result.context.correlationId).toBe('custom-correlation-id');
    });

    it('should generate unique execution IDs', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      const result1 = await service.executeHandler(mockHandler, mockEvent);
      const result2 = await service.executeHandler(mockHandler, mockEvent);

      expect(result1.executionId).not.toBe(result2.executionId);
    });
  });

  describe('Circuit Breaker', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle circuit breaker functionality', async () => {
      const mockEvent = createMockEvent();
      const testError = new Error('Persistent error');
      const failingHandler = createMockHandler({ 
        metadata: {
          ...createMockHandler().metadata,
          className: 'FailingHandler'
        },
        handler: jest.fn().mockRejectedValue(testError)
      });

      // Execute multiple times to trigger circuit breaker
      for (let i = 0; i < 15; i++) {
        try {
          await service.executeHandler(failingHandler, mockEvent);
        } catch (error) {
          // Expected to fail
        }
      }

      // Should eventually throw circuit breaker error
      await expect(service.executeHandler(failingHandler, mockEvent)).rejects.toThrow('Circuit breaker is open');
    });

    it('should handle circuit breaker recovery', async () => {
      jest.useFakeTimers();

      const mockEvent = createMockEvent();
      const failingHandler = createMockHandler({ 
        metadata: {
          ...createMockHandler().metadata,
          className: 'RecoveringHandler'
        },
        handler: jest.fn().mockRejectedValue(new Error('Initial failure'))
      });

      for (let i = 0; i < 15; i++) {
        try {
          await service.executeHandler(failingHandler, mockEvent);
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit should be open
      await expect(service.executeHandler(failingHandler, mockEvent)).rejects.toThrow('Circuit breaker is open');

      // Fast forward past recovery timeout
      jest.advanceTimersByTime(31000);

      // Create a working handler with same name for recovery
      const workingHandler = createMockHandler({ 
        metadata: {
          ...createMockHandler().metadata,
          className: 'RecoveringHandler'
        },
        handler: jest.fn().mockResolvedValue(undefined)
      });

      // Should work again (half-open state)
      const result = await service.executeHandler(workingHandler, mockEvent);
      expect(result.success).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('Rate Limiting', () => {
    it('should handle custom execution configuration', async () => {
      const serviceWithCustomConfig = new HandlerExecutionService(mockHandlerPoolService, mockMetricsService, mockDLQService, {
        defaultTimeout: 1000,
        maxConcurrency: 5,
      });

      await serviceWithCustomConfig.onModuleInit();

      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      // Test custom configuration by executing a handler
      const result = await serviceWithCustomConfig.executeHandler(mockHandler, mockEvent);
      expect(result.success).toBe(true);

      await serviceWithCustomConfig.onModuleDestroy();
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should track handler statistics', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler({ 
        metadata: {
          ...createMockHandler().metadata,
          className: 'StatsHandler'
        }
      });

      await service.executeHandler(mockHandler, mockEvent);

      const handlerId = 'TestHandler.handle@test.event'; // Generated handler ID format
      const stats = service.getHandlerStats(handlerId);

      expect(stats).toBeDefined();
      expect(stats?.totalExecutions).toBe(1);
      expect(stats?.successfulExecutions).toBe(1);
      expect(stats?.failedExecutions).toBe(0);
    });

    it('should track failure statistics', async () => {
      const mockEvent = createMockEvent();
      const failingHandler = createMockHandler({ 
        metadata: {
          ...createMockHandler().metadata,
          className: 'FailingHandler'
        },
        handler: jest.fn().mockRejectedValue(new Error('Test failure'))
      });

      try {
        await service.executeHandler(failingHandler, mockEvent);
      } catch (_error) {
        // Expected failure
      }

      const handlerId = 'TestHandler.handle@test.event';
      const stats = service.getHandlerStats(handlerId);

      expect(stats).toBeDefined();
      expect(stats?.totalExecutions).toBe(1);
      expect(stats?.successfulExecutions).toBe(0);
      expect(stats?.failedExecutions).toBe(1);
      expect(stats?.consecutiveFailures).toBe(1);
    });

    it('should provide all statistics', async () => {
      const mockEvent = createMockEvent();
      const handler1 = createMockHandler({ 
        metadata: {
          ...createMockHandler().metadata,
          className: 'Handler1'
        }
      });
      const handler2 = createMockHandler({ 
        metadata: {
          ...createMockHandler().metadata,
          className: 'Handler2'
        }
      });

      await service.executeHandler(handler1, mockEvent);
      await service.executeHandler(handler2, mockEvent);

      const allStats = service.getAllStats();

      expect(Object.keys(allStats).length).toBeGreaterThan(0);
    });

    it('should provide statistics observable', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      const statsPromise = firstValueFrom(service.getStatsObservable());

      await service.executeHandler(mockHandler, mockEvent);

      const stats = await statsPromise;
      expect(stats).toBeDefined();
    });

    it('should provide execution results observable', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      const resultPromise = firstValueFrom(service.getExecutionResults());

      await service.executeHandler(mockHandler, mockEvent);

      const result = await resultPromise;
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should reset handler statistics', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      await service.executeHandler(mockHandler, mockEvent);

      const handlerId = 'TestHandler.handle@test.event';
      let stats = service.getHandlerStats(handlerId);
      expect(stats?.totalExecutions).toBe(1);

      service.resetHandlerStats(handlerId);

      stats = service.getHandlerStats(handlerId);
      expect(stats).toBeUndefined();
    });

    it('should reset all statistics', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      await service.executeHandler(mockHandler, mockEvent);

      const allStats = service.getAllStats();
      expect(Object.keys(allStats).length).toBeGreaterThan(0);

      service.resetAllStats();

      const resetStats = service.getAllStats();
      expect(Object.keys(resetStats).length).toBe(0);
    });
  });

  describe('Active Execution Management', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should track active executions', async () => {
      jest.useFakeTimers();

      const mockEvent = createMockEvent();
      
      // Create a long-running handler
      const longRunningHandler = createMockHandler({
        handler: jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000)))
      });

      // Start execution but don't wait
      const executionPromise = service.executeHandler(longRunningHandler, mockEvent);

      // Check active executions
      const activeExecutions = service.getActiveExecutions();
      expect(activeExecutions.length).toBe(1);

      // Complete the execution
      jest.advanceTimersByTime(6000);
      await executionPromise;

      // Should be no active executions
      const activeAfter = service.getActiveExecutions();
      expect(activeAfter.length).toBe(0);

      jest.useRealTimers();
    });

    it('should cancel executions', async () => {
      jest.useFakeTimers();

      const mockEvent = createMockEvent();
      
      // Create a long-running handler
      const longRunningHandler = createMockHandler({
        handler: jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000)))
      });

      // Start execution
      const executionPromise = service.executeHandler(longRunningHandler, mockEvent);

      // Get active executions to find execution ID
      const activeExecutions = service.getActiveExecutions();
      expect(activeExecutions.length).toBe(1);

      const executionId = activeExecutions[0].executionId;

      // Cancel execution
      const cancelled = service.cancelExecution(executionId);
      expect(cancelled).toBe(true);

      // Should be no active executions
      const activeAfter = service.getActiveExecutions();
      expect(activeAfter.length).toBe(0);

      // Complete the original promise
      jest.advanceTimersByTime(6000);
      await expect(executionPromise).resolves.toBeDefined();

      jest.useRealTimers();
    });

    it('should return false when canceling non-existent execution', () => {
      const cancelled = service.cancelExecution('non-existent-id');
      expect(cancelled).toBe(false);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle handlers with invalid methods', async () => {
      const mockEvent = createMockEvent();
      const invalidHandler = createMockHandler({
        handler: null as any
      });

      await expect(service.executeHandler(invalidHandler, mockEvent)).rejects.toThrow();
    });

    it('should handle different error types in retry logic', async () => {
      const mockEvent = createMockEvent();

      // Test PERMANENT error (no retry)
      const permanentErrorHandler = createMockHandler({
        handler: jest.fn().mockRejectedValue(new Error('PERMANENT error'))
      });
      await expect(service.executeHandler(permanentErrorHandler, mockEvent)).rejects.toThrow('PERMANENT error');

      // Test VALIDATION error (no retry)
      const validationErrorHandler = createMockHandler({
        handler: jest.fn().mockRejectedValue(new Error('VALIDATION error'))
      });
      await expect(service.executeHandler(validationErrorHandler, mockEvent)).rejects.toThrow('VALIDATION error');

      // Test UNAUTHORIZED error (no retry)
      const unauthorizedErrorHandler = createMockHandler({
        handler: jest.fn().mockRejectedValue(new Error('UNAUTHORIZED error'))
      });
      await expect(service.executeHandler(unauthorizedErrorHandler, mockEvent)).rejects.toThrow('UNAUTHORIZED error');
    });

    it('should handle error distribution tracking', async () => {
      const mockEvent = createMockEvent();

      // Create different error types
      const errors = [new TypeError('Type error'), new ReferenceError('Reference error'), new Error('Generic error')];

      for (const error of errors) {
        const errorHandler = createMockHandler({
          handler: jest.fn().mockRejectedValue(error)
        });
        try {
          await service.executeHandler(errorHandler, mockEvent);
        } catch (_e) {
          // Expected
        }
      }

      const handlerId = 'TestHandler.handle@test.event';
      const stats = service.getHandlerStats(handlerId);

      expect(stats?.errorDistribution).toBeDefined();
      expect(stats?.errorDistribution['TypeError']).toBe(1);
      expect(stats?.errorDistribution['ReferenceError']).toBe(1);
      expect(stats?.errorDistribution['Error']).toBe(1);
    });

    it('should handle very short timeouts', async () => {
      const mockEvent = createMockEvent();
      const slowHandler = createMockHandler({
        handler: jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)))
      });

      await expect(service.executeHandler(slowHandler, mockEvent, { timeout: 1 })).rejects.toThrow();
    });

    it('should handle concurrent executions safely', async () => {
      const mockEvent = createMockEvent();
      const handlers = Array.from({ length: 10 }, (_, i) => createMockHandler({ 
        metadata: {
          ...createMockHandler().metadata,
          className: `ConcurrentHandler${i}`
        }
      }));

      const results = await Promise.all(handlers.map((handler) => service.executeHandler(handler, mockEvent)));

      expect(results).toHaveLength(10);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should generate proper handler IDs', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler({
        metadata: {
          eventName: 'custom.event',
          className: 'CustomHandler',
          methodName: 'customMethod',
          handlerId: 'custom-handler-id',
          options: {},
        },
      });

      const result = await service.executeHandler(mockHandler, mockEvent);

      expect(result.handlerId).toBe('CustomHandler.customMethod@custom.event');
    });

    it('should handle missing handler metadata gracefully', async () => {
      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler({
        metadata: {
          eventName: 'test.event',
          className: 'TestHandler',
          methodName: 'handle',
          handlerId: 'test-handler-id-2',
          options: {},
          // Missing className and methodName
        },
      });

      const result = await service.executeHandler(mockHandler, mockEvent);

      expect(result.success).toBe(true);
      expect(result.handlerId).toBe('Unknown.handle@test.event');
    });
  });

  describe('Configuration Variations', () => {
    it('should handle minimal configuration', async () => {
      const minimalService = new HandlerExecutionService();

      await minimalService.onModuleInit();

      const mockEvent = createMockEvent();
      const mockHandler = createMockHandler();

      const result = await minimalService.executeHandler(mockHandler, mockEvent);

      expect(result.success).toBe(true);

      await minimalService.onModuleDestroy();
    });

    it('should handle disabled configuration', async () => {
      const disabledService = new HandlerExecutionService(mockHandlerPoolService, mockMetricsService, mockDLQService, {});

      await expect(disabledService.onModuleInit()).resolves.not.toThrow();
      await disabledService.onModuleDestroy();
    });

    it('should handle custom circuit breaker configuration', async () => {
      const customService = new HandlerExecutionService(mockHandlerPoolService, mockMetricsService, mockDLQService, {
        circuitBreaker: {
          enabled: true,
          failureThreshold: 3,
          recoveryTimeout: 10000,
        },
      });

      await customService.onModuleInit();

      const mockEvent = createMockEvent();
      const failingHandler = createMockHandler({
        handler: jest.fn().mockRejectedValue(new Error('Test failure'))
      });

      // Should open circuit after fewer failures with custom config
      for (let i = 0; i < 5; i++) {
        try {
          await customService.executeHandler(failingHandler, mockEvent);
        } catch (_error) {
          // Expected
        }
      }

      // Should throw circuit breaker error
      await expect(customService.executeHandler(failingHandler, mockEvent)).rejects.toThrow('Circuit breaker is open');

      await customService.onModuleDestroy();
    });

    it('should handle custom retry configuration', async () => {
      const customService = new HandlerExecutionService(mockHandlerPoolService, mockMetricsService, mockDLQService, {
        defaultTimeout: 10000,
      });

      await customService.onModuleInit();

      expect(customService).toBeDefined();

      await customService.onModuleDestroy();
    });
  });
});
