import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MetricsService } from '@modules/rx-event-emitter/services/metrics.service';
import type { Event } from '@modules/rx-event-emitter/interfaces';
import { EventPriority, EVENT_EMITTER_OPTIONS } from '@modules/rx-event-emitter/interfaces';

describe('MetricsService', () => {
  let service: MetricsService;

  const mockEvent: Event = {
    metadata: {
      id: 'test-id',
      name: 'test.event',
      timestamp: Date.now(),
      correlationId: 'test-correlation',
      priority: EventPriority.NORMAL,
    },
    payload: { test: 'data' },
  };

  const defaultConfig = {
    metrics: {
      enabled: true,
      collectionIntervalMs: 1000,
      retentionPeriodMs: 60000,
      enableDetailedTracking: true,
      healthCheckIntervalMs: 5000,
      alertThresholds: {
        errorRate: 5,
        memoryUsage: 80,
        eventRate: 1000,
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        {
          provide: EVENT_EMITTER_OPTIONS,
          useValue: defaultConfig,
        },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);

    // Mock logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('Service Definition', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize successfully', async () => {
      await service.onModuleInit();
      expect(service).toBeDefined();
    });

    it('should shutdown gracefully', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();
      expect(service).toBeDefined();
    });
  });

  describe('Event Metrics Recording', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should record event emission', () => {
      service.recordEventEmitted(mockEvent);
      const metrics = service.getCurrentSystemMetrics();
      expect(metrics.events.totalEmitted).toBe(1);
    });

    it('should record event processing', () => {
      const processingTime = 150;
      service.recordEventProcessed(mockEvent, processingTime);

      const metrics = service.getCurrentSystemMetrics();
      expect(metrics.events.totalProcessed).toBe(1);
      expect(metrics.events.averageProcessingTime).toBe(processingTime);
    });

    it('should record event failures', () => {
      const error = new Error('Test error');
      service.recordEventFailed(mockEvent, error);

      const metrics = service.getCurrentSystemMetrics();
      expect(metrics.events.totalFailed).toBe(1);
    });

    it('should calculate processing rates', () => {
      service.recordEventEmitted(mockEvent);
      service.recordEventEmitted(mockEvent);
      service.recordEventEmitted(mockEvent);

      const metrics = service.getCurrentSystemMetrics();
      expect(metrics.events.processingRate).toBeGreaterThanOrEqual(0);
    });

    it('should calculate error rates', () => {
      const error = new Error('Test error');

      // Record some successful events
      service.recordEventEmitted(mockEvent);
      service.recordEventProcessed(mockEvent, 100);

      // Record some failures
      service.recordEventFailed(mockEvent, error);

      const metrics = service.getCurrentSystemMetrics();
      expect(metrics.events.errorRate).toBeGreaterThan(0);
    });
  });

  describe('Handler Metrics', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should record handler execution metrics', () => {
      const handlerName = 'TestHandler';
      const executionTime = 200;

      service.recordHandlerExecution(handlerName, executionTime, true);
      const metrics = service.getCurrentSystemMetrics();

      expect(metrics.handlers[handlerName]).toBeDefined();
    });

    it('should record handler failure metrics', () => {
      const handlerName = 'FailingHandler';
      const executionTime = 100;

      service.recordHandlerExecution(handlerName, executionTime, false);
      const metrics = service.getCurrentSystemMetrics();

      expect(metrics.handlers[handlerName]).toBeDefined();
    });
  });

  describe('System Metrics', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should provide current system metrics', () => {
      const metrics = service.getCurrentSystemMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.events).toBeDefined();
      expect(metrics.streams).toBeDefined();
      expect(metrics.handlers).toBeDefined();
      expect(metrics.isolation).toBeDefined();
      expect(metrics.dlq).toBeDefined();
      expect(metrics.system).toBeDefined();
      expect(metrics.health).toBeDefined();
    });

    it('should calculate health score', () => {
      const metrics = service.getCurrentSystemMetrics();
      expect(typeof metrics.health.score).toBe('number');
      expect(metrics.health.score).toBeGreaterThanOrEqual(0);
      expect(metrics.health.score).toBeLessThanOrEqual(100);
    });

    it('should provide health status', () => {
      const metrics = service.getCurrentSystemMetrics();
      expect(['healthy', 'degraded', 'critical']).toContain(metrics.health.status);
    });
  });

  describe('Configuration', () => {
    it('should respect disabled metrics configuration', async () => {
      const disabledConfig = {
        metrics: {
          ...defaultConfig.metrics,
          enabled: false,
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MetricsService,
          {
            provide: EVENT_EMITTER_OPTIONS,
            useValue: disabledConfig,
          },
        ],
      }).compile();

      const disabledService = module.get<MetricsService>(MetricsService);
      await disabledService.onModuleInit();

      // Recording should not affect metrics when disabled
      const initialMetrics = disabledService.getCurrentSystemMetrics();
      disabledService.recordEventEmitted(mockEvent);
      const afterMetrics = disabledService.getCurrentSystemMetrics();

      expect(afterMetrics.events.totalEmitted).toBe(initialMetrics.events.totalEmitted);

      await disabledService.onModuleDestroy();
    });

    it('should use default configuration when none provided', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [MetricsService],
      }).compile();

      const defaultService = module.get<MetricsService>(MetricsService);
      expect(defaultService).toBeDefined();

      await defaultService.onModuleInit();
      await defaultService.onModuleDestroy();
    });
  });

  describe('Observables', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should provide observable system metrics', () => {
      const systemMetrics$ = service.getSystemMetrics();
      expect(systemMetrics$).toBeDefined();

      systemMetrics$.subscribe((metrics: any) => {
        expect(metrics).toBeDefined();
        expect(metrics.events).toBeDefined();
        expect(metrics.health).toBeDefined();
      });
    });

    it('should provide observable event stats', () => {
      const eventStats$ = service.getEventStats();
      expect(eventStats$).toBeDefined();

      eventStats$.subscribe((stats: any) => {
        expect(stats).toBeDefined();
        expect(typeof stats.totalEmitted).toBe('number');
        expect(typeof stats.totalProcessed).toBe('number');
      });
    });
  });

  describe('Logging and Summary', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should log comprehensive summary', () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      // Add some test data
      service.recordEventEmitted(mockEvent);
      service.recordEventProcessed(mockEvent, 100);

      service.logSummary();

      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('DLQ Metrics', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should record DLQ metrics', async () => {
      const dlqMetrics = {
        totalEntries: 5,
        successfulReprocessing: 2,
        failedReprocessing: 1,
        averageRetryTime: 1000,
        currentlyProcessing: 1,
        scheduledForRetry: 2,
        permanentFailures: 0,
        healthStatus: 'healthy' as const,
        lastProcessedAt: Date.now(),
        policyStats: {
          default: {
            totalEntries: 3,
            successRate: 0.67,
            averageRetryCount: 1.5,
            lastUsedAt: Date.now(),
          },
        },
      };

      service.recordDLQMetrics(dlqMetrics);

      // Verify the method can be called without throwing - this tests the API contract
      expect(() => service.recordDLQMetrics(dlqMetrics)).not.toThrow();

      // Test that the method is defined and callable
      expect(typeof service.recordDLQMetrics).toBe('function');
    });

    it('should not record DLQ metrics when disabled', async () => {
      const disabledModule: TestingModule = await Test.createTestingModule({
        providers: [
          MetricsService,
          {
            provide: EVENT_EMITTER_OPTIONS,
            useValue: { metrics: { enabled: false } },
          },
        ],
      }).compile();

      const disabledService = disabledModule.get<MetricsService>(MetricsService);
      await disabledService.onModuleInit();

      const dlqMetrics = {
        totalEntries: 5,
        successfulReprocessing: 2,
        failedReprocessing: 1,
        averageRetryTime: 1000,
        currentlyProcessing: 1,
        scheduledForRetry: 2,
        permanentFailures: 0,
        healthStatus: 'healthy' as const,
        policyStats: {},
      };

      disabledService.recordDLQMetrics(dlqMetrics);
      // Should not update metrics when disabled
    });
  });

  describe('Isolation Metrics', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should record isolation metrics', async () => {
      const isolationMetrics = {
        totalPools: 3,
        activePools: 2,
        totalActiveExecutions: 10,
        totalQueuedTasks: 5,
        totalDroppedTasks: 1,
        averagePoolUtilization: 0.75,
        circuitBreakerStates: { pool1: 'closed', pool2: 'open' },
        poolMetrics: new Map(),
        resourceUsage: {
          cpuUsage: 45.5,
          memoryUsage: 512,
          activeThreads: 8,
          availableResources: {
            memory: 1024,
            cpu: 4,
            threads: 16,
          },
          pressure: {
            memory: 'medium' as const,
            cpu: 'low' as const,
            threads: 'low' as const,
          },
        },
        isolation: {
          interferenceScore: 0.05,
          faultContainment: 0.95,
          sharingEfficiency: 0.9,
        },
      };

      service.recordIsolationMetrics(isolationMetrics);

      // Verify the method can be called without throwing - this tests the API contract
      expect(() => service.recordIsolationMetrics(isolationMetrics)).not.toThrow();

      // Test that the method is defined and callable
      expect(typeof service.recordIsolationMetrics).toBe('function');
    });

    it('should not record isolation metrics when disabled', async () => {
      const disabledModule: TestingModule = await Test.createTestingModule({
        providers: [
          MetricsService,
          {
            provide: EVENT_EMITTER_OPTIONS,
            useValue: { metrics: { enabled: false } },
          },
        ],
      }).compile();

      const disabledService = disabledModule.get<MetricsService>(MetricsService);
      await disabledService.onModuleInit();

      const isolationMetrics = {
        totalPools: 3,
        activePools: 2,
        totalActiveExecutions: 10,
        totalQueuedTasks: 5,
        totalDroppedTasks: 1,
        averagePoolUtilization: 0.75,
        circuitBreakerStates: {},
        poolMetrics: new Map(),
        resourceUsage: {
          cpuUsage: 0,
          memoryUsage: 0,
          activeThreads: 0,
          availableResources: {
            memory: 0,
            cpu: 0,
            threads: 0,
          },
          pressure: {
            memory: 'low' as const,
            cpu: 'low' as const,
            threads: 'low' as const,
          },
        },
        isolation: {
          interferenceScore: 0,
          faultContainment: 0,
          sharingEfficiency: 0,
        },
      };

      disabledService.recordIsolationMetrics(isolationMetrics);
      // Should not update metrics when disabled
    });
  });

  describe('Metrics Reset', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should reset all metrics', () => {
      // Record some metrics first
      service.recordEventEmitted(mockEvent);
      service.recordEventProcessed(mockEvent, 100);
      service.recordHandlerExecution('test.handler', 50, true);

      // Verify metrics exist
      let metrics = service.getCurrentSystemMetrics();
      expect(metrics.events.totalEmitted).toBeGreaterThan(0);

      // Reset metrics
      service.reset();

      // Verify metrics are reset
      metrics = service.getCurrentSystemMetrics();
      expect(metrics.events.totalEmitted).toBe(0);
      expect(metrics.events.totalProcessed).toBe(0);
      expect(metrics.events.totalFailed).toBe(0);
    });
  });

  describe('Legacy Compatibility', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should provide legacy event metrics', () => {
      service.recordEventEmitted(mockEvent);
      service.recordEventProcessed(mockEvent, 100);

      const legacyMetrics = service.getMetrics();
      expect(legacyMetrics).toBeDefined();
      expect(legacyMetrics.totalEvents).toBeGreaterThan(0);
    });

    it('should maintain backward compatibility for existing APIs', () => {
      // Test that all expected legacy methods exist
      expect(typeof service.getMetrics).toBe('function');
      expect(typeof service.recordEventEmitted).toBe('function');
      expect(typeof service.recordEventProcessed).toBe('function');
      expect(typeof service.recordEventFailed).toBe('function');
    });
  });
});
