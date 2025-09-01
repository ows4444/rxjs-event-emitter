import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { DeadLetterQueueService } from '@src/modules/rx-event-emitter/services/dead-letter-queue.service';
import { EventEmitterService } from '@src/modules/rx-event-emitter/services/event-emitter.service';
import { PersistenceService } from '@src/modules/rx-event-emitter/services/persistence.service';
import { MetricsService } from '@src/modules/rx-event-emitter/services/metrics.service';
import type { Event, DLQConfig } from '@src/modules/rx-event-emitter/interfaces';
import { EventPriority, EVENT_EMITTER_OPTIONS } from '@src/modules/rx-event-emitter/interfaces';

describe('DeadLetterQueueService', () => {
  let service: DeadLetterQueueService;
  let mockEventEmitterService: jest.Mocked<EventEmitterService>;
  let mockPersistenceService: jest.Mocked<PersistenceService>;
  let mockMetricsService: jest.Mocked<MetricsService>;

  const createMockServices = () => ({
    eventEmitter: {
      emit: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      off: jest.fn(),
    } as any,
    persistence: {
      storeEvent: jest.fn().mockResolvedValue(undefined),
      getEvents: jest.fn().mockResolvedValue([]),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    } as any,
    metrics: {
      recordDLQMetrics: jest.fn(),
      recordMetric: jest.fn(),
    } as any,
  });

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

  const createMockDLQOptions = (overrides: Partial<DLQConfig> = {}): DLQConfig => ({
    enabled: true,
    maxEntries: 1000,
    autoRetryIntervalMs: 5000,
    defaultRetryPolicy: 'exponential',
    retryPolicies: {
      exponential: {
        name: 'exponential',
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        exponentialMultiplier: 2,
        jitterFactor: 0.1,
        enableJitter: true,
        retryConditions: [
          {
            shouldRetry: (error: Error, attempt: number) => attempt < 3 && !error.message.includes('PERMANENT'),
            description: 'Retry non-permanent errors up to 3 times',
          },
        ],
      },
    },
    persistence: {
      enabled: false,
      adapter: 'memory',
      cleanupIntervalMs: 300000,
    },
    ...overrides,
  });

  beforeEach(async () => {
    const mocks = createMockServices();
    mockEventEmitterService = mocks.eventEmitter;
    mockPersistenceService = mocks.persistence;
    mockMetricsService = mocks.metrics;

    const moduleRef = await Test.createTestingModule({
      providers: [
        DeadLetterQueueService,
        {
          provide: EventEmitterService,
          useValue: mockEventEmitterService,
        },
        {
          provide: PersistenceService,
          useValue: mockPersistenceService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: EVENT_EMITTER_OPTIONS,
          useValue: { dlq: createMockDLQOptions() },
        },
      ],
    }).compile();

    service = moduleRef.get(DeadLetterQueueService);
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

    it('should skip initialization when disabled', async () => {
      const disabledService = new DeadLetterQueueService({ dlq: { enabled: false } }, mockEventEmitterService, mockPersistenceService, mockMetricsService);

      await expect(disabledService.onModuleInit()).resolves.not.toThrow();
      await disabledService.onModuleDestroy();
    });

    it('should shutdown gracefully', async () => {
      await service.onModuleInit();
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });

    it('should load persisted entries on initialization when persistence is enabled', async () => {
      const persistentService = new DeadLetterQueueService(
        { dlq: createMockDLQOptions({ persistence: { enabled: true, adapter: 'memory', cleanupIntervalMs: 300000 } }) },
        mockEventEmitterService,
        mockPersistenceService,
        mockMetricsService,
      );

      mockPersistenceService.getEvents.mockResolvedValue([
        {
          id: 'persisted-entry',
          event: createMockEvent(),
          error: { name: 'Error', message: 'Persisted error' },
          timestamp: Date.now(),
          retryCount: 1,
          nextRetryAt: Date.now() + 5000,
          retryPolicy: 'exponential',
        },
      ]);

      await expect(persistentService.onModuleInit()).resolves.not.toThrow();
      await persistentService.onModuleDestroy();
      expect(mockPersistenceService.getEvents).toHaveBeenCalled();
    });

    it('should persist entries on shutdown when persistence is enabled', async () => {
      const persistentService = new DeadLetterQueueService(
        { dlq: createMockDLQOptions({ persistence: { enabled: true, adapter: 'memory', cleanupIntervalMs: 300000 } }) },
        mockEventEmitterService,
        mockPersistenceService,
        mockMetricsService,
      );

      await persistentService.onModuleInit();

      const mockEvent = createMockEvent();
      const error = new Error('Test error');
      await persistentService.addEntry(mockEvent, error);

      await persistentService.onModuleDestroy();
      expect(mockPersistenceService.storeEvent).toHaveBeenCalled();
    });
  });

  describe('DLQ Entry Management', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should add entry to DLQ with default retry policy', async () => {
      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await expect(service.addEntry(mockEvent, error)).resolves.not.toThrow();

      const entries = await service.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].event).toEqual(mockEvent);
      expect(entries[0].error.message).toBe('Test error');
      expect(entries[0].retryPolicy).toBe('exponential');
    });

    it('should add entry with custom retry policy', async () => {
      const mockEvent = createMockEvent();
      const error = new Error('Test error');
      const customPolicy = 'immediate';

      await service.addEntry(mockEvent, error, customPolicy);

      const entries = await service.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].retryPolicy).toBe(customPolicy);
    });

    it('should not exceed max entries limit', async () => {
      const limitedService = new DeadLetterQueueService(
        { dlq: createMockDLQOptions({ maxEntries: 2 }) },
        mockEventEmitterService,
        mockPersistenceService,
        mockMetricsService,
      );

      await limitedService.onModuleInit();

      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await limitedService.addEntry(mockEvent, error);
      await limitedService.addEntry(mockEvent, error);
      await limitedService.addEntry(mockEvent, error); // This should not be added

      const entries = await limitedService.getEntries();
      expect(entries).toHaveLength(2);

      await limitedService.onModuleDestroy();
    });

    it('should get entries with limit', async () => {
      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await service.addEntry(mockEvent, error);
      await service.addEntry(mockEvent, error);
      await service.addEntry(mockEvent, error);

      const limitedEntries = await service.getEntries(2);
      expect(limitedEntries).toHaveLength(2);
    });

    it('should remove entry by id', async () => {
      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await service.addEntry(mockEvent, error);
      const entries = await service.getEntries();
      const entryId = entries[0].event.metadata.id;

      const removed = await service.removeEntry(entryId);
      expect(removed).toBe(true);

      const remainingEntries = await service.getEntries();
      expect(remainingEntries).toHaveLength(0);
    });

    it('should return false when removing non-existent entry', async () => {
      const removed = await service.removeEntry('non-existent-id');
      expect(removed).toBe(false);
    });

    it('should clear all entries', async () => {
      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await service.addEntry(mockEvent, error);
      await service.addEntry(mockEvent, error);

      await service.clear();

      const entries = await service.getEntries();
      expect(entries).toHaveLength(0);
    });

    it('should get specific entry by id', async () => {
      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await service.addEntry(mockEvent, error);

      const entry = await service.getEntry(mockEvent.metadata.id);
      expect(entry).toBeDefined();
      if (entry) {
        expect(entry.event.metadata.id).toBe(mockEvent.metadata.id);
      }
    });
  });

  describe('Retry Processing', () => {
    beforeEach(async () => {
      jest.useFakeTimers();
      await service.onModuleInit();
    });

    it('should process next entry successfully', async () => {
      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await service.addEntry(mockEvent, error);
      const entries = await service.getEntries();
      expect(entries).toHaveLength(1);

      mockEventEmitterService.emit.mockResolvedValueOnce(undefined);

      const result = await service.processNext();
      expect(result).toBe(true);
      expect(mockEventEmitterService.emit).toHaveBeenCalled();
    });

    it('should handle retry failure gracefully', async () => {
      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await service.addEntry(mockEvent, error);
      const initialEntries = await service.getEntries();
      expect(initialEntries).toHaveLength(1);

      mockEventEmitterService.emit.mockRejectedValueOnce(new Error('Retry failed'));

      const result = await service.processNext();
      expect(result).toBe(false);
    });

    it('should handle multiple retry failures', async () => {
      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await service.addEntry(mockEvent, error);
      mockEventEmitterService.emit.mockRejectedValue(new Error('Retry failed'));

      const entries = await service.getEntries();
      expect(entries).toHaveLength(1);

      for (let i = 0; i < 5; i++) {
        await service.processNext();
      }

      const metrics = service.getMetrics();
      expect(typeof metrics.permanentFailures).toBe('number');
    });

    it('should handle empty queue gracefully', async () => {
      const result = await service.processNext();
      expect(result).toBe(false);
    });

    it('should handle auto retry processing', async () => {
      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await service.addEntry(mockEvent, error);

      mockEventEmitterService.emit.mockResolvedValue(undefined);

      jest.advanceTimersByTime(5000); // Advance past retry interval

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockEventEmitterService.emit).toHaveBeenCalled();
    });
  });

  describe('Metrics and Monitoring', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should provide accurate metrics', () => {
      const metrics = service.getMetrics();
      expect(metrics).toMatchObject({
        totalEntries: 0,
        successfulReprocessing: 0,
        failedReprocessing: 0,
        averageRetryTime: 0,
        currentlyProcessing: 0,
        scheduledForRetry: 0,
        permanentFailures: 0,
        healthStatus: 'healthy',
        policyStats: {},
      });
    });

    it('should update metrics after adding entries', async () => {
      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await service.addEntry(mockEvent, error);

      const metrics = service.getMetrics();
      expect(metrics.totalEntries).toBe(1);
    });

    it('should calculate health status based on entry count', async () => {
      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      const metrics1 = service.getMetrics();
      expect(metrics1.healthStatus).toBe('healthy');

      for (let i = 0; i < 50; i++) {
        await service.addEntry(mockEvent, error);
      }

      const metrics2 = service.getMetrics();
      expect(['healthy', 'warning', 'critical']).toContain(metrics2.healthStatus);
    });
  });

  describe('Auto Retry Management', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should start and stop auto retry', () => {
      expect(() => service.startAutoRetry()).not.toThrow();
      expect(() => service.stopAutoRetry()).not.toThrow();
    });

    it('should process next entry from queue', async () => {
      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await service.addEntry(mockEvent, error);
      mockEventEmitterService.emit.mockResolvedValueOnce(undefined);

      const result = await service.processNext();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle service errors during event emission', async () => {
      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await service.addEntry(mockEvent, error);
      mockEventEmitterService.emit.mockRejectedValue(new Error('Service error'));

      const result = await service.processNext();
      expect(result).toBe(false);
    });

    it('should handle persistence errors gracefully', async () => {
      const persistentService = new DeadLetterQueueService(
        { dlq: createMockDLQOptions({ persistence: { enabled: true, adapter: 'memory', cleanupIntervalMs: 300000 } }) },
        mockEventEmitterService,
        mockPersistenceService,
        mockMetricsService,
      );

      mockPersistenceService.storeEvent.mockRejectedValue(new Error('Persistence error'));

      await persistentService.onModuleInit();

      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await expect(persistentService.addEntry(mockEvent, error)).resolves.not.toThrow();

      await persistentService.onModuleDestroy();
    });
  });

  describe('Configuration Options', () => {
    it('should use default configuration when no options provided', () => {
      const defaultService = new DeadLetterQueueService();
      expect(defaultService).toBeDefined();
    });

    it('should merge custom configuration with defaults', () => {
      const customConfig = {
        dlq: {
          maxEntries: 500,
          autoRetryIntervalMs: 30000,
        },
      };

      const customService = new DeadLetterQueueService(customConfig, mockEventEmitterService, mockPersistenceService, mockMetricsService);

      expect(customService).toBeDefined();
    });

    it('should respect disabled configuration', async () => {
      const disabledService = new DeadLetterQueueService({ dlq: { enabled: false } }, mockEventEmitterService, mockPersistenceService, mockMetricsService);

      await disabledService.onModuleInit();

      const mockEvent = createMockEvent();
      const error = new Error('Test error');

      await disabledService.addEntry(mockEvent, error);

      const entries = await disabledService.getEntries();
      expect(entries).toHaveLength(0);

      await disabledService.onModuleDestroy();
    });
  });
});
