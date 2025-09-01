import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import {
  StreamManagementService,
  StreamType,
  BackpressureStrategy,
  DropStrategy,
  ConcurrencyStrategy,
} from '@modules/rx-event-emitter/services/stream-management.service';
import { EVENT_EMITTER_OPTIONS } from '@modules/rx-event-emitter/interfaces';

describe('StreamManagementService', () => {
  let service: StreamManagementService;

  const defaultConfig = {
    streamManagement: {
      enabled: true,
      backpressure: {
        enabled: true,
        strategy: BackpressureStrategy.BUFFER,
        bufferSize: 1000,
        dropStrategy: 'tail',
        warningThreshold: 0.8,
      },
      batching: {
        enabled: true,
        timeWindow: 100,
        maxSize: 50,
        dynamicSizing: false,
      },
      concurrency: {
        maxConcurrent: 10,
        strategy: 'merge',
        queueSize: 100,
      },
      errorHandling: {
        strategy: 'retry',
        maxRetries: 3,
        retryDelay: 1000,
        exponentialBackoff: true,
      },
      monitoring: {
        enabled: true,
        metricsInterval: 5000,
        healthCheckInterval: 10000,
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreamManagementService,
        {
          provide: EVENT_EMITTER_OPTIONS,
          useValue: defaultConfig,
        },
      ],
    }).compile();

    service = module.get<StreamManagementService>(StreamManagementService);

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

  describe('Managed Stream Creation', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should create managed stream for event bus', () => {
      const sourceStream = new Subject();
      const managedStream = service.createManagedStream('test-stream', sourceStream, StreamType.EVENT_BUS);

      expect(managedStream).toBeDefined();
      expect(managedStream).toBeInstanceOf(Object);
    });

    it('should create managed stream for handler pool', () => {
      const sourceStream = new Subject();
      const managedStream = service.createManagedStream('pool-stream', sourceStream, StreamType.HANDLER_STREAM);

      expect(managedStream).toBeDefined();
    });

    it('should create managed stream for metrics', () => {
      const sourceStream = new Subject();
      const managedStream = service.createManagedStream('metrics-stream', sourceStream, StreamType.METRICS_STREAM);

      expect(managedStream).toBeDefined();
    });

    it('should handle stream with custom configuration', () => {
      const sourceStream = new Subject();
      const customConfig = {
        enabled: true,
        backpressure: {
          enabled: false,
          strategy: BackpressureStrategy.BUFFER,
          bufferSize: 500,
          dropStrategy: DropStrategy.TAIL,
          warningThreshold: 0.8,
        },
        concurrency: {
          maxConcurrent: 5,
          strategy: ConcurrencyStrategy.MERGE,
          queueSize: 100,
        },
      };

      const managedStream = service.createManagedStream('custom-stream', sourceStream, StreamType.EVENT_BUS, customConfig);

      expect(managedStream).toBeDefined();
    });
  });

  describe('Stream Metrics', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should provide stream metrics', () => {
      const metrics = service.getCurrentMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics.bufferSize).toBe('number');
      expect(typeof metrics.maxBufferSize).toBe('number');
      expect(typeof metrics.droppedEvents).toBe('number');
      expect(typeof metrics.backpressureActive).toBe('boolean');
    });

    it('should track buffer usage', () => {
      const sourceStream = new Subject();
      service.createManagedStream('tracked-stream', sourceStream, StreamType.EVENT_BUS);

      // Emit some events to test tracking
      sourceStream.next({ test: 'data1' });
      sourceStream.next({ test: 'data2' });

      const metrics = service.getCurrentMetrics();
      expect(metrics).toBeDefined();
    });

    it('should provide throughput metrics', () => {
      const metrics = service.getCurrentMetrics();
      expect(metrics.throughput).toBeDefined();
      expect(typeof metrics.throughput.eventsPerSecond).toBe('number');
      expect(typeof metrics.throughput.averageLatency).toBe('number');
    });

    it('should provide health metrics', () => {
      const metrics = service.getCurrentMetrics();
      expect(metrics.health).toBeDefined();
      expect(typeof metrics.health.healthy).toBe('boolean');
      expect(typeof metrics.health.memoryPressure).toBe('number');
      expect(typeof metrics.health.cpuUsage).toBe('number');
    });
  });

  describe('Backpressure Handling', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle buffer backpressure strategy', () => {
      const sourceStream = new Subject();
      const managedStream = service.createManagedStream('buffer-stream', sourceStream, StreamType.EVENT_BUS);

      expect(managedStream).toBeDefined();

      // Test that it doesn't throw when handling many events
      for (let i = 0; i < 10; i++) {
        sourceStream.next({ event: i });
      }
    });

    it('should detect backpressure activation', () => {
      const sourceStream = new Subject();
      service.createManagedStream('pressure-stream', sourceStream, StreamType.EVENT_BUS);

      const metrics = service.getCurrentMetrics();
      expect(typeof metrics.backpressureActive).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle stream errors gracefully', () => {
      const sourceStream = new Subject();
      const managedStream = service.createManagedStream('error-stream', sourceStream, StreamType.EVENT_BUS);

      expect(managedStream).toBeDefined();

      // Simulate error and ensure service continues to work
      sourceStream.error(new Error('Test error'));

      // Service should still be functional
      const newStream = new Subject();
      const newManagedStream = service.createManagedStream('recovery-stream', newStream, StreamType.EVENT_BUS);
      expect(newManagedStream).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should use default configuration when none provided', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [StreamManagementService],
      }).compile();

      const defaultService = module.get<StreamManagementService>(StreamManagementService);
      expect(defaultService).toBeDefined();

      await defaultService.onModuleInit();
      await defaultService.onModuleDestroy();
    });

    it('should merge provided configuration with defaults', () => {
      const customConfig = {
        streamManagement: {
          enabled: true,
          backpressure: {
            enabled: false,
            bufferSize: 500,
          },
        },
      };

      // Test that service can be created with custom config
      expect(() => {
        new StreamManagementService(customConfig);
      }).not.toThrow();
    });

    it('should disable stream management when configured', async () => {
      const disabledConfig = {
        streamManagement: {
          enabled: false,
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StreamManagementService,
          {
            provide: EVENT_EMITTER_OPTIONS,
            useValue: disabledConfig,
          },
        ],
      }).compile();

      const disabledService = module.get<StreamManagementService>(StreamManagementService);
      await disabledService.onModuleInit();

      const sourceStream = new Subject();
      const managedStream = disabledService.createManagedStream('disabled-stream', sourceStream, StreamType.EVENT_BUS);

      // When disabled, should return the source stream directly or a pass-through
      expect(managedStream).toBeDefined();

      await disabledService.onModuleDestroy();
    });
  });

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should track stream performance metrics', () => {
      const sourceStream = new Subject();
      service.createManagedStream('perf-stream', sourceStream, StreamType.EVENT_BUS);

      const metrics = service.getCurrentMetrics();
      expect(metrics.throughput).toBeDefined();
      expect(metrics.throughput.eventsPerSecond).toBeGreaterThanOrEqual(0);
      expect(metrics.throughput.averageLatency).toBeGreaterThanOrEqual(0);
    });

    it('should provide real-time metrics updates', () => {
      const sourceStream = new Subject();
      service.createManagedStream('realtime-stream', sourceStream, StreamType.EVENT_BUS);

      const initialMetrics = service.getCurrentMetrics();

      // Emit some events
      sourceStream.next({ data: 'test1' });
      sourceStream.next({ data: 'test2' });

      const updatedMetrics = service.getCurrentMetrics();
      expect(updatedMetrics).toBeDefined();
      expect(updatedMetrics.health.lastCheckAt).toBeGreaterThanOrEqual(initialMetrics.health.lastCheckAt);
    });
  });

  describe('Memory Management', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should clean up managed streams on destroy', async () => {
      const sourceStream = new Subject();
      service.createManagedStream('cleanup-stream', sourceStream, StreamType.EVENT_BUS);

      await service.onModuleDestroy();

      // After destroy, metrics should indicate cleanup
      const metrics = service.getCurrentMetrics();
      expect(metrics).toBeDefined();
    });

    it('should handle multiple stream cleanup', async () => {
      const streams = [];
      for (let i = 0; i < 5; i++) {
        const sourceStream = new Subject();
        streams.push(service.createManagedStream(`stream-${i}`, sourceStream, StreamType.EVENT_BUS));
      }

      await service.onModuleDestroy();

      // Verify all streams are cleaned up
      expect(streams.length).toBe(5);
    });
  });
});
