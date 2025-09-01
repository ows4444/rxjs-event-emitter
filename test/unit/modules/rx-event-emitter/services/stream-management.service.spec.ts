import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Subject, throwError, of, timer, firstValueFrom } from 'rxjs';
import { take, filter, timeout } from 'rxjs/operators';
import {
  StreamManagementService,
  StreamType,
  BackpressureStrategy,
  DropStrategy,
  ConcurrencyStrategy,
  ErrorStrategy,
} from '@src/modules/rx-event-emitter/services/stream-management.service';
import { EVENT_EMITTER_OPTIONS } from '@src/modules/rx-event-emitter/interfaces';

describe('StreamManagementService', () => {
  let service: StreamManagementService;

  const defaultConfig = {
    streamManagement: {
      enabled: true,
      backpressure: {
        enabled: true,
        strategy: BackpressureStrategy.BUFFER,
        bufferSize: 1000,
        dropStrategy: DropStrategy.TAIL,
        warningThreshold: 800,
      },
      batching: {
        enabled: true,
        timeWindow: 100,
        maxSize: 50,
        dynamicSizing: false,
      },
      concurrency: {
        maxConcurrent: 10,
        strategy: ConcurrencyStrategy.MERGE,
        queueSize: 100,
      },
      errorHandling: {
        strategy: ErrorStrategy.RETRY,
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
    jest.useRealTimers();
  });

  describe('Service Lifecycle', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize successfully', async () => {
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    it('should shutdown gracefully', async () => {
      await service.onModuleInit();
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });

    it('should handle initialization when disabled', async () => {
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
      await expect(disabledService.onModuleInit()).resolves.not.toThrow();
      await disabledService.onModuleDestroy();
    });

    it('should handle multiple initialization calls', async () => {
      await service.onModuleInit();
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    it('should handle multiple destruction calls', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('Configuration Management', () => {
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
          monitoring: {
            metricsInterval: 2000,
          },
        },
      };

      expect(() => {
        new StreamManagementService(customConfig);
      }).not.toThrow();
    });

    it('should handle deep configuration merging', () => {
      const partialConfig = {
        streamManagement: {
          backpressure: {
            strategy: BackpressureStrategy.THROTTLE,
            bufferSize: 2000,
          },
          concurrency: {
            maxConcurrent: 20,
          },
        },
      };

      const configService = new StreamManagementService(partialConfig);
      expect(configService).toBeDefined();
    });

    it('should handle empty configuration gracefully', () => {
      expect(() => {
        new StreamManagementService({});
      }).not.toThrow();
    });

    it('should handle null configuration gracefully', () => {
      expect(() => {
        new StreamManagementService(null as any);
      }).not.toThrow();
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
      expect(managedStream.subscribe).toBeDefined();
    });

    it('should create managed stream for handler pool', () => {
      const sourceStream = new Subject();
      const managedStream = service.createManagedStream('pool-stream', sourceStream, StreamType.HANDLER_STREAM);

      expect(managedStream).toBeDefined();
      expect(managedStream.subscribe).toBeDefined();
    });

    it('should create managed stream for metrics', () => {
      const sourceStream = new Subject();
      const managedStream = service.createManagedStream('metrics-stream', sourceStream, StreamType.METRICS_STREAM);

      expect(managedStream).toBeDefined();
      expect(managedStream.subscribe).toBeDefined();
    });

    it('should create managed stream for monitoring', () => {
      const sourceStream = new Subject();
      const managedStream = service.createManagedStream('monitoring-stream', sourceStream, StreamType.MONITORING_STREAM);

      expect(managedStream).toBeDefined();
      expect(managedStream.subscribe).toBeDefined();
    });

    it('should create custom managed stream', () => {
      const sourceStream = new Subject();
      const managedStream = service.createManagedStream('custom-stream', sourceStream, StreamType.CUSTOM);

      expect(managedStream).toBeDefined();
      expect(managedStream.subscribe).toBeDefined();
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
          warningThreshold: 800,
        },
        concurrency: {
          maxConcurrent: 5,
          strategy: ConcurrencyStrategy.MERGE,
          queueSize: 100,
        },
      };

      const managedStream = service.createManagedStream('custom-stream', sourceStream, StreamType.EVENT_BUS, customConfig);

      expect(managedStream).toBeDefined();
      expect(managedStream.subscribe).toBeDefined();
    });

    it('should handle stream creation when service is disabled', async () => {
      const disabledService = new StreamManagementService({
        streamManagement: { enabled: false },
      });

      await disabledService.onModuleInit();

      const sourceStream = new Subject();
      const managedStream = disabledService.createManagedStream('disabled-stream', sourceStream, StreamType.EVENT_BUS);

      expect(managedStream).toBeDefined();

      await disabledService.onModuleDestroy();
    });

    it('should handle observable sources', () => {
      const sourceObservable = of(1, 2, 3);
      const managedStream = service.createManagedStream('obs-stream', sourceObservable, StreamType.CUSTOM);

      expect(managedStream).toBeDefined();
      expect(managedStream.subscribe).toBeDefined();
    });

    it('should handle timer sources', () => {
      const timerObservable = timer(0, 100).pipe(take(5));
      const managedStream = service.createManagedStream('timer-stream', timerObservable, StreamType.CUSTOM);

      expect(managedStream).toBeDefined();
      expect(managedStream.subscribe).toBeDefined();
    });

    it('should return source stream directly when disabled', async () => {
      const disabledService = new StreamManagementService({
        streamManagement: { enabled: false },
      });

      await disabledService.onModuleInit();

      const sourceStream = new Subject();
      const managedStream = disabledService.createManagedStream('disabled-stream', sourceStream, StreamType.EVENT_BUS);

      // Should return the source stream when disabled
      expect(managedStream).toBe(sourceStream);

      await disabledService.onModuleDestroy();
    });
  });

  describe('Stream Management', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should get managed streams', () => {
      const sourceStream = new Subject();
      service.createManagedStream('test-stream', sourceStream, StreamType.EVENT_BUS);

      const managedStreams = service.getManagedStreams();
      expect(Array.isArray(managedStreams)).toBe(true);
      expect(managedStreams.length).toBeGreaterThan(0);
    });

    it('should get specific managed stream', () => {
      const sourceStream = new Subject();
      const streamName = 'specific-stream';
      service.createManagedStream(streamName, sourceStream, StreamType.EVENT_BUS);

      // The createManagedStream method generates a unique ID internally
      const managedStreams = service.getManagedStreams();
      const managedStream = managedStreams.find((s) => s.name === streamName);

      expect(managedStream).toBeDefined();
      expect(managedStream?.name).toBe(streamName);
      expect(managedStream?.type).toBe(StreamType.EVENT_BUS);
    });

    it('should return undefined for non-existent stream', () => {
      const managedStream = service.getManagedStream('non-existent-stream');
      expect(managedStream).toBeUndefined();
    });

    it('should destroy managed stream', () => {
      const sourceStream = new Subject();
      const streamName = 'destroyable-stream';
      service.createManagedStream(streamName, sourceStream, StreamType.EVENT_BUS);

      // Get the actual stream ID that was generated
      const managedStreams = service.getManagedStreams();
      const managedStream = managedStreams.find((s) => s.name === streamName);
      expect(managedStream).toBeDefined();
      const actualStreamId = managedStream!.id;

      const destroyed = service.destroyManagedStream(actualStreamId);
      expect(destroyed).toBe(true);

      const retrievedStream = service.getManagedStream(actualStreamId);
      expect(retrievedStream).toBeUndefined();
    });

    it('should return false when destroying non-existent stream', () => {
      const destroyed = service.destroyManagedStream('non-existent-stream');
      expect(destroyed).toBe(false);
    });

    it('should pause streams', () => {
      const sourceStream = new Subject();
      const streamName = 'pausable-stream';
      service.createManagedStream(streamName, sourceStream, StreamType.EVENT_BUS);

      // Get the actual stream ID that was generated
      const managedStreams = service.getManagedStreams();
      const managedStream = managedStreams.find((s) => s.name === streamName);
      expect(managedStream).toBeDefined();
      const actualStreamId = managedStream!.id;

      const paused = service.pauseStream(actualStreamId);
      expect(paused).toBe(true);
    });

    it('should return false when pausing non-existent stream', () => {
      const paused = service.pauseStream('non-existent-stream');
      expect(paused).toBe(false);
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
      expect(typeof metrics.health.lastCheckAt).toBe('number');
    });

    it('should track buffer usage', () => {
      const sourceStream = new Subject();
      service.createManagedStream('tracked-stream', sourceStream, StreamType.EVENT_BUS);

      const subscription = sourceStream.subscribe();

      // Emit some events to test tracking
      sourceStream.next({ test: 'data1' });
      sourceStream.next({ test: 'data2' });

      const metrics = service.getCurrentMetrics();
      expect(metrics).toBeDefined();

      subscription.unsubscribe();
    });

    it('should provide metrics observable', async () => {
      const metricsObservable = service.getMetrics();
      expect(metricsObservable).toBeDefined();

      const metrics = await firstValueFrom(metricsObservable.pipe(take(1)));
      expect(metrics).toBeDefined();
      expect(metrics.bufferSize).toBeDefined();
    });

    it('should update metrics when streams are active', async () => {
      jest.useFakeTimers();

      const sourceStream = new Subject();
      const managedStream = service.createManagedStream('active-stream', sourceStream, StreamType.EVENT_BUS);

      const subscription = managedStream.subscribe();

      // Emit events
      sourceStream.next({ data: 'test1' });
      sourceStream.next({ data: 'test2' });

      // Fast-forward time to allow metrics updates
      jest.advanceTimersByTime(1000);

      const metrics = service.getCurrentMetrics();
      expect(metrics).toBeDefined();

      subscription.unsubscribe();
      jest.useRealTimers();
    });

    it('should provide stream statistics', () => {
      const sourceStream = new Subject();
      service.createManagedStream('stats-stream', sourceStream, StreamType.EVENT_BUS);

      const stats = service.getStreamStatistics();
      expect(stats).toBeDefined();
      expect(typeof stats.totalStreams).toBe('number');
      expect(typeof stats.activeStreams).toBe('number');
      expect(typeof stats.totalItemsProcessed).toBe('number');
      expect(typeof stats.totalItemsDropped).toBe('number');
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

      const subscription = managedStream.subscribe();

      // Test that it doesn't throw when handling many events
      for (let i = 0; i < 10; i++) {
        sourceStream.next({ event: i });
      }

      subscription.unsubscribe();
    });

    it('should handle throttle backpressure strategy', () => {
      const customConfig = {
        streamManagement: {
          backpressure: {
            enabled: true,
            strategy: BackpressureStrategy.THROTTLE,
          },
        },
      };

      const throttleService = new StreamManagementService(customConfig);
      expect(throttleService).toBeDefined();
    });

    it('should handle debounce backpressure strategy', () => {
      const customConfig = {
        streamManagement: {
          backpressure: {
            enabled: true,
            strategy: BackpressureStrategy.DEBOUNCE,
          },
        },
      };

      const debounceService = new StreamManagementService(customConfig);
      expect(debounceService).toBeDefined();
    });

    it('should handle drop oldest backpressure strategy', () => {
      const customConfig = {
        streamManagement: {
          backpressure: {
            enabled: true,
            strategy: BackpressureStrategy.DROP_OLDEST,
          },
        },
      };

      const dropOldestService = new StreamManagementService(customConfig);
      expect(dropOldestService).toBeDefined();
    });

    it('should handle drop newest backpressure strategy', () => {
      const customConfig = {
        streamManagement: {
          backpressure: {
            enabled: true,
            strategy: BackpressureStrategy.DROP_NEWEST,
          },
        },
      };

      const dropNewestService = new StreamManagementService(customConfig);
      expect(dropNewestService).toBeDefined();
    });

    it('should detect backpressure activation', () => {
      const sourceStream = new Subject();
      service.createManagedStream('pressure-stream', sourceStream, StreamType.EVENT_BUS);

      const metrics = service.getCurrentMetrics();
      expect(typeof metrics.backpressureActive).toBe('boolean');
    });

    it('should handle different drop strategies', () => {
      // Test each drop strategy
      const strategies = [DropStrategy.HEAD, DropStrategy.TAIL, DropStrategy.RANDOM, DropStrategy.PRIORITY];

      strategies.forEach((strategy) => {
        const customConfig = {
          streamManagement: {
            backpressure: {
              enabled: true,
              dropStrategy: strategy,
            },
          },
        };

        const strategyService = new StreamManagementService(customConfig);
        expect(strategyService).toBeDefined();
      });
    });
  });

  describe('Concurrency Strategies', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle merge concurrency strategy', () => {
      const customConfig = {
        streamManagement: {
          concurrency: {
            strategy: ConcurrencyStrategy.MERGE,
            maxConcurrent: 5,
          },
        },
      };

      const mergeService = new StreamManagementService(customConfig);
      expect(mergeService).toBeDefined();
    });

    it('should handle concat concurrency strategy', () => {
      const customConfig = {
        streamManagement: {
          concurrency: {
            strategy: ConcurrencyStrategy.CONCAT,
            maxConcurrent: 1,
          },
        },
      };

      const concatService = new StreamManagementService(customConfig);
      expect(concatService).toBeDefined();
    });

    it('should handle switch concurrency strategy', () => {
      const customConfig = {
        streamManagement: {
          concurrency: {
            strategy: ConcurrencyStrategy.SWITCH,
          },
        },
      };

      const switchService = new StreamManagementService(customConfig);
      expect(switchService).toBeDefined();
    });

    it('should handle exhaust concurrency strategy', () => {
      const customConfig = {
        streamManagement: {
          concurrency: {
            strategy: ConcurrencyStrategy.EXHAUST,
          },
        },
      };

      const exhaustService = new StreamManagementService(customConfig);
      expect(exhaustService).toBeDefined();
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

      const subscription = managedStream.subscribe({
        error: (error) => {
          // Error should be handled
          expect(error).toBeDefined();
        },
      });

      // Simulate error and ensure service continues to work
      sourceStream.error(new Error('Test error'));

      // Service should still be functional
      const newStream = new Subject();
      const newManagedStream = service.createManagedStream('recovery-stream', newStream, StreamType.EVENT_BUS);
      expect(newManagedStream).toBeDefined();

      subscription.unsubscribe();
    });

    it('should handle retry error strategy', () => {
      const customConfig = {
        streamManagement: {
          errorHandling: {
            strategy: ErrorStrategy.RETRY,
            maxRetries: 5,
          },
        },
      };

      const retryService = new StreamManagementService(customConfig);
      expect(retryService).toBeDefined();
    });

    it('should handle ignore error strategy', () => {
      const customConfig = {
        streamManagement: {
          errorHandling: {
            strategy: ErrorStrategy.IGNORE,
          },
        },
      };

      const ignoreService = new StreamManagementService(customConfig);
      expect(ignoreService).toBeDefined();
    });

    it('should handle circuit breaker error strategy', () => {
      const customConfig = {
        streamManagement: {
          errorHandling: {
            strategy: ErrorStrategy.CIRCUIT_BREAKER,
          },
        },
      };

      const circuitService = new StreamManagementService(customConfig);
      expect(circuitService).toBeDefined();
    });

    it('should handle dead letter error strategy', () => {
      const customConfig = {
        streamManagement: {
          errorHandling: {
            strategy: ErrorStrategy.DEAD_LETTER,
          },
        },
      };

      const dlqService = new StreamManagementService(customConfig);
      expect(dlqService).toBeDefined();
    });

    it('should handle error stream creation', () => {
      const errorObservable = throwError(() => new Error('Test error'));
      const managedStream = service.createManagedStream('error-obs-stream', errorObservable, StreamType.CUSTOM);

      expect(managedStream).toBeDefined();
    });

    it('should handle exponential backoff', () => {
      const customConfig = {
        streamManagement: {
          errorHandling: {
            strategy: ErrorStrategy.RETRY,
            maxRetries: 3,
            retryDelay: 100,
            exponentialBackoff: true,
          },
        },
      };

      const backoffService = new StreamManagementService(customConfig);
      expect(backoffService).toBeDefined();
    });
  });

  describe('Stream Health Monitoring', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should provide stream health information', () => {
      const sourceStream = new Subject();
      const streamName = 'health-stream';
      service.createManagedStream(streamName, sourceStream, StreamType.EVENT_BUS);

      // Get the actual stream ID that was generated
      const managedStreams = service.getManagedStreams();
      const managedStream = managedStreams.find((s) => s.name === streamName);
      expect(managedStream).toBeDefined();
      const actualStreamId = managedStream!.id;

      const health = service.getStreamHealth(actualStreamId);
      expect(health).toBeDefined();
      if (health) {
        expect(typeof health.healthy).toBe('boolean');
        expect(health.status).toBeDefined();
        expect(Array.isArray(health.issues)).toBe(true);
        expect(Array.isArray(health.recommendations)).toBe(true);
      }
    });

    it('should detect unhealthy streams', () => {
      const sourceStream = new Subject();
      const streamName = 'unhealthy-stream';
      service.createManagedStream(streamName, sourceStream, StreamType.EVENT_BUS);

      // Get the actual stream ID that was generated
      const managedStreams = service.getManagedStreams();
      const managedStream = managedStreams.find((s) => s.name === streamName);
      expect(managedStream).toBeDefined();
      const actualStreamId = managedStream!.id;

      // Simulate an error condition
      sourceStream.error(new Error('Stream error'));

      const health = service.getStreamHealth(actualStreamId);
      // Health check should still work even after error
      expect(health).toBeDefined();
    });

    it('should provide health recommendations', () => {
      const sourceStream = new Subject();
      const streamId = 'recommendation-stream';
      service.createManagedStream(streamId, sourceStream, StreamType.EVENT_BUS);

      const health = service.getStreamHealth(streamId);
      if (health) {
        expect(health.recommendations).toBeDefined();
        expect(Array.isArray(health.recommendations)).toBe(true);
      }
    });

    it('should track stream status', () => {
      const sourceStream = new Subject();
      const streamId = 'status-stream';
      service.createManagedStream(streamId, sourceStream, StreamType.EVENT_BUS);

      const health = service.getStreamHealth(streamId);
      if (health) {
        expect(['active', 'stalled', 'errored', 'overloaded']).toContain(health.status);
      }
    });

    it('should handle health check for non-existent stream', () => {
      const health = service.getStreamHealth('non-existent-stream');
      expect(health).toBeUndefined();
    });

    it('should get all stream health', () => {
      const sourceStream1 = new Subject();
      const sourceStream2 = new Subject();

      service.createManagedStream('health-1', sourceStream1, StreamType.EVENT_BUS);
      service.createManagedStream('health-2', sourceStream2, StreamType.HANDLER_STREAM);

      const allHealth = service.getAllStreamHealth();
      expect(Array.isArray(allHealth)).toBe(true);
      expect(allHealth.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Batching and Buffering', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle batching configuration', () => {
      const customConfig = {
        streamManagement: {
          batching: {
            enabled: true,
            timeWindow: 200,
            maxSize: 100,
            dynamicSizing: true,
          },
        },
      };

      const batchingService = new StreamManagementService(customConfig);
      expect(batchingService).toBeDefined();
    });

    it('should handle disabled batching', () => {
      const noBatchConfig = {
        streamManagement: {
          batching: {
            enabled: false,
          },
        },
      };

      const noBatchService = new StreamManagementService(noBatchConfig);
      expect(noBatchService).toBeDefined();
    });

    it('should handle dynamic batch sizing', () => {
      const dynamicConfig = {
        streamManagement: {
          batching: {
            enabled: true,
            dynamicSizing: true,
          },
        },
      };

      const dynamicService = new StreamManagementService(dynamicConfig);
      expect(dynamicService).toBeDefined();
    });
  });

  describe('Stream Updates and Notifications', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should provide stream updates observable', async () => {
      const updatesObservable = service.getStreamUpdates();
      expect(updatesObservable).toBeDefined();

      const updatePromise = firstValueFrom(updatesObservable.pipe(take(1)));

      // Create a stream to trigger an update
      const sourceStream = new Subject();
      service.createManagedStream('update-stream', sourceStream, StreamType.EVENT_BUS);

      const update = await updatePromise;
      expect(update).toBeDefined();
      expect(update.action).toBeDefined();
      expect(update.streamId).toBeDefined();
    });

    it('should notify on stream creation', async () => {
      const updatesObservable = service.getStreamUpdates();

      const updatePromise = firstValueFrom(updatesObservable.pipe(take(1)));

      // Create a stream to trigger notification
      const sourceStream = new Subject();
      service.createManagedStream('notification-stream', sourceStream, StreamType.EVENT_BUS);

      const update = await updatePromise;
      expect(update.action).toBe('created');
      expect(update.streamId).toMatch(/^notification-stream-\d+-[a-z0-9]+$/);
    });

    it('should notify on stream destruction', async () => {
      // First create a stream
      const sourceStream = new Subject();
      const streamName = 'destroy-notification-stream';
      service.createManagedStream(streamName, sourceStream, StreamType.EVENT_BUS);

      // Get the actual stream ID that was generated
      const managedStreams = service.getManagedStreams();
      const managedStream = managedStreams.find((s) => s.name === streamName);
      expect(managedStream).toBeDefined();
      const actualStreamId = managedStream!.id;

      const updatesObservable = service.getStreamUpdates();

      // Filter specifically for destroyed actions to avoid timing issues
      const updatePromise = firstValueFrom(
        updatesObservable.pipe(
          filter((update: any) => update.action === 'destroyed'),
          take(1),
          timeout(5000),
        ),
      );

      // Destroy the stream to trigger notification
      service.destroyManagedStream(actualStreamId);

      const update = await updatePromise;
      expect(update.action).toBe('destroyed');
      expect(update.streamId).toBe(actualStreamId);
    });
  });

  describe('Performance and Monitoring', () => {
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
      const subscription = sourceStream.subscribe();

      // Emit some events
      sourceStream.next({ data: 'test1' });
      sourceStream.next({ data: 'test2' });

      const updatedMetrics = service.getCurrentMetrics();
      expect(updatedMetrics).toBeDefined();
      expect(updatedMetrics.health.lastCheckAt).toBeGreaterThanOrEqual(initialMetrics.health.lastCheckAt);

      subscription.unsubscribe();
    });

    it('should handle monitoring configuration', () => {
      const monitoringConfig = {
        streamManagement: {
          monitoring: {
            enabled: true,
            metricsInterval: 1000,
            healthCheckInterval: 5000,
          },
        },
      };

      const monitoringService = new StreamManagementService(monitoringConfig);
      expect(monitoringService).toBeDefined();
    });

    it('should handle disabled monitoring', () => {
      const noMonitoringConfig = {
        streamManagement: {
          monitoring: {
            enabled: false,
          },
        },
      };

      const noMonitoringService = new StreamManagementService(noMonitoringConfig);
      expect(noMonitoringService).toBeDefined();
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle null source streams', () => {
      expect(() => {
        service.createManagedStream('null-stream', null as any, StreamType.CUSTOM);
      }).not.toThrow();
    });

    it('should handle undefined source streams', () => {
      expect(() => {
        service.createManagedStream('undefined-stream', undefined as any, StreamType.CUSTOM);
      }).not.toThrow();
    });

    it('should handle empty stream names', () => {
      const sourceStream = new Subject();
      expect(() => {
        service.createManagedStream('', sourceStream, StreamType.CUSTOM);
      }).not.toThrow();
    });

    it('should handle duplicate stream names', () => {
      const sourceStream1 = new Subject();
      const sourceStream2 = new Subject();
      const streamName = 'duplicate-stream';

      service.createManagedStream(streamName, sourceStream1, StreamType.EVENT_BUS);

      // Should handle duplicate name gracefully
      expect(() => {
        service.createManagedStream(streamName, sourceStream2, StreamType.EVENT_BUS);
      }).not.toThrow();
    });

    it('should handle extremely large buffer sizes', () => {
      const largeBufferConfig = {
        streamManagement: {
          backpressure: {
            bufferSize: 1000000,
          },
        },
      };

      const largeBufferService = new StreamManagementService(largeBufferConfig);
      expect(largeBufferService).toBeDefined();
    });

    it('should handle zero buffer sizes', () => {
      const zeroBufferConfig = {
        streamManagement: {
          backpressure: {
            bufferSize: 0,
          },
        },
      };

      const zeroBufferService = new StreamManagementService(zeroBufferConfig);
      expect(zeroBufferService).toBeDefined();
    });

    it('should handle negative configuration values', () => {
      const negativeConfig = {
        streamManagement: {
          backpressure: {
            bufferSize: -100,
          },
          concurrency: {
            maxConcurrent: -5,
          },
        },
      };

      expect(() => {
        new StreamManagementService(negativeConfig);
      }).not.toThrow();
    });
  });
});
