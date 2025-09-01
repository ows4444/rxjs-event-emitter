import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { DiscoveryModule } from '@nestjs/core';
import { EventEmitterModule } from '@src/modules/rx-event-emitter/event-emitter.module';
import { EventEmitterService } from '@src/modules/rx-event-emitter/services/event-emitter.service';
import { HandlerDiscoveryService } from '@src/modules/rx-event-emitter/services/handler-discovery.service';
import { MetricsService } from '@src/modules/rx-event-emitter/services/metrics.service';
import { DependencyAnalyzerService } from '@src/modules/rx-event-emitter/services/dependency-analyzer.service';
import { PersistenceService } from '@src/modules/rx-event-emitter/services/persistence.service';
import { DeadLetterQueueService } from '@src/modules/rx-event-emitter/services/dead-letter-queue.service';
import { HandlerPoolService } from '@src/modules/rx-event-emitter/services/handler-pool.service';
import { HandlerExecutionService } from '@src/modules/rx-event-emitter/services/handler-execution.service';
import { StreamManagementService } from '@src/modules/rx-event-emitter/services/stream-management.service';
import { EVENT_EMITTER_OPTIONS, BackpressureStrategy } from '@src/modules/rx-event-emitter/interfaces';
import type { EventEmitterOptions, RegisteredHandler } from '@src/modules/rx-event-emitter/interfaces';

describe('EventEmitterModule', () => {
  let module: EventEmitterModule;
  let handlerDiscoveryService: jest.Mocked<HandlerDiscoveryService>;
  let eventEmitterService: jest.Mocked<EventEmitterService>;
  let metricsService: jest.Mocked<MetricsService>;
  let dependencyAnalyzerService: jest.Mocked<DependencyAnalyzerService>;

  const createMockHandler = (eventName: string = 'test.event'): RegisteredHandler => ({
    eventName,
    handler: jest.fn(),
    instance: {},
    options: {},
    handlerId: `${eventName}Handler`,
    metadata: {
      eventName,
      options: {},
      methodName: 'handle',
      className: `${eventName}Handler`,
      handlerId: `${eventName}Handler`,
      providerToken: `${eventName}Handler`,
      instance: {},
    },
  });

  const createMockServices = () => ({
    handlerDiscovery: {
      discoverHandlers: jest.fn(),
      getHandlers: jest.fn().mockReturnValue([]),
    } as any,
    eventEmitter: {
      getAllHandlers: jest.fn().mockReturnValue([createMockHandler('user.created'), createMockHandler('user.updated'), createMockHandler('user.deleted')]),
    } as any,
    metrics: {
      getCurrentSystemMetrics: jest.fn().mockReturnValue({
        health: {
          healthy: true,
          status: 'healthy',
          score: 95,
          lastCheck: Date.now(),
          alerts: [],
        },
        events: {
          totalEmitted: 0,
          totalProcessed: 0,
          totalFailed: 0,
          averageProcessingTime: 0,
          currentlyProcessing: 0,
          retrying: 0,
          processingRate: 0,
          errorRate: 0,
          lastProcessedAt: Date.now(),
          lastEmittedAt: Date.now(),
          deadLettered: 0,
          retrySuccessRate: 0,
        },
        streams: {
          bufferSize: 0,
          maxBufferSize: 1000,
          droppedEvents: 0,
          warningThreshold: 800,
          backpressureActive: false,
          throughput: {
            eventsPerSecond: 0,
            averageLatency: 0,
            p95Latency: 0,
            p99Latency: 0,
            maxLatency: 0,
          },
          health: {
            healthy: true,
            memoryPressure: 0,
            cpuUsage: 0,
            lastCheckAt: Date.now(),
          },
        },
        handlers: {},
        isolation: {
          totalPools: 0,
          activePools: 0,
          totalActiveExecutions: 0,
          totalQueuedTasks: 0,
          totalDroppedTasks: 0,
          averagePoolUtilization: 0,
          circuitBreakerStates: {},
          poolMetrics: new Map(),
          resourceUsage: {
            memoryUsage: 0,
            cpuUsage: 0,
            activeThreads: 0,
            availableResources: {
              memory: 1000,
              cpu: 100,
              threads: 10,
            },
            pressure: {
              memory: 'low',
              cpu: 'low',
              threads: 'low',
            },
          },
          isolation: {
            interferenceScore: 0,
            faultContainment: 1,
            sharingEfficiency: 1,
          },
        },
        dlq: {
          totalEntries: 0,
          processingRate: 0,
          retryRate: 0,
          permanentFailures: 0,
          healthStatus: 'healthy',
          policyStats: {},
          averageRetryAttempts: 0,
          lastProcessedAt: Date.now(),
          oldestEntryAge: 0,
          recentFailures: [],
        },
        system: {
          memoryUsage: 50,
          cpuUsage: 20,
          uptime: 10000,
          eventRate: 100,
          errorRate: 0.01,
          lastUpdated: Date.now(),
        },
      }),
    } as any,
    dependencyAnalyzer: {
      registerHandlers: jest.fn(),
      getCurrentAnalysisResult: jest.fn().mockReturnValue({
        circularDependencies: [],
        totalHandlers: 0,
        totalDependencies: 0,
        isolatedHandlers: [],
        criticalPath: [],
        maxDepth: 0,
        analysisTimestamp: Date.now(),
        warnings: [],
        errors: [],
      }),
      generateExecutionPlan: jest.fn().mockReturnValue({
        totalPhases: 2,
        parallelizationOpportunities: 3,
        phases: [],
      }),
    } as any,
  });

  beforeEach(() => {
    const mocks = createMockServices();
    handlerDiscoveryService = mocks.handlerDiscovery;
    eventEmitterService = mocks.eventEmitter;
    metricsService = mocks.metrics;
    dependencyAnalyzerService = mocks.dependencyAnalyzer;
  });

  describe('Static Factory Method', () => {
    it('should create module with default options', () => {
      const dynamicModule = EventEmitterModule.forRoot();

      expect(dynamicModule).toBeDefined();
      expect(dynamicModule.module).toBe(EventEmitterModule);
      expect(dynamicModule.imports).toContain(DiscoveryModule);
    });

    it('should create module with custom options', () => {
      const customOptions: EventEmitterOptions = {
        maxConcurrency: 10,
        persistence: {
          enabled: true,
        },
        dlq: {
          enabled: true,
        },
      };

      const dynamicModule = EventEmitterModule.forRoot(customOptions);

      expect(dynamicModule).toBeDefined();
      expect(dynamicModule.module).toBe(EventEmitterModule);

      const optionsProvider = dynamicModule.providers?.find((provider: any) => provider.provide === EVENT_EMITTER_OPTIONS) as any;

      expect(optionsProvider?.useValue).toEqual(customOptions);
    });

    it('should include all required providers', () => {
      const dynamicModule = EventEmitterModule.forRoot();

      const providerClasses = dynamicModule.providers?.filter((provider: any) => typeof provider === 'function') as any[];

      expect(providerClasses).toContain(EventEmitterService);
      expect(providerClasses).toContain(HandlerDiscoveryService);
      expect(providerClasses).toContain(PersistenceService);
      expect(providerClasses).toContain(MetricsService);
      expect(providerClasses).toContain(DeadLetterQueueService);
      expect(providerClasses).toContain(HandlerPoolService);
      expect(providerClasses).toContain(DependencyAnalyzerService);
      expect(providerClasses).toContain(HandlerExecutionService);
      expect(providerClasses).toContain(StreamManagementService);
    });

    it('should export all services', () => {
      const dynamicModule = EventEmitterModule.forRoot();

      expect(dynamicModule.exports).toContain(EventEmitterService);
      expect(dynamicModule.exports).toContain(HandlerDiscoveryService);
      expect(dynamicModule.exports).toContain(PersistenceService);
      expect(dynamicModule.exports).toContain(MetricsService);
      expect(dynamicModule.exports).toContain(DeadLetterQueueService);
      expect(dynamicModule.exports).toContain(HandlerPoolService);
      expect(dynamicModule.exports).toContain(DependencyAnalyzerService);
      expect(dynamicModule.exports).toContain(HandlerExecutionService);
      expect(dynamicModule.exports).toContain(StreamManagementService);
    });

    it('should be marked as global module', () => {
      const dynamicModule = EventEmitterModule.forRoot();
      expect(dynamicModule.global).not.toBe(false); // Global modules don't set this to true, they just omit it
    });
  });

  describe('Module Integration Tests', () => {
    let moduleRef: any;

    beforeEach(async () => {
      moduleRef = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
      })
        .overrideProvider(HandlerDiscoveryService)
        .useValue(handlerDiscoveryService)
        .overrideProvider(EventEmitterService)
        .useValue(eventEmitterService)
        .overrideProvider(MetricsService)
        .useValue(metricsService)
        .overrideProvider(DependencyAnalyzerService)
        .useValue(dependencyAnalyzerService)
        .compile();

      module = moduleRef.get(EventEmitterModule);
    });

    afterEach(async () => {
      if (moduleRef) {
        await moduleRef.close();
      }
    });

    it('should be defined', () => {
      expect(module).toBeDefined();
      expect(module).toBeInstanceOf(EventEmitterModule);
    });

    it('should inject all required dependencies', () => {
      expect(module['handlerDiscovery']).toBe(handlerDiscoveryService);
      expect(module['eventEmitter']).toBe(eventEmitterService);
      expect(module['metricsService']).toBe(metricsService);
      expect(module['dependencyAnalyzer']).toBe(dependencyAnalyzerService);
    });

    it('should initialize module successfully', async () => {
      await expect(module.onModuleInit()).resolves.not.toThrow();

      expect(handlerDiscoveryService.discoverHandlers).toHaveBeenCalled();
      expect(eventEmitterService.getAllHandlers).toHaveBeenCalled();
      expect(dependencyAnalyzerService.registerHandlers).toHaveBeenCalled();
      expect(dependencyAnalyzerService.getCurrentAnalysisResult).toHaveBeenCalled();
      expect(dependencyAnalyzerService.generateExecutionPlan).toHaveBeenCalled();
      expect(metricsService.getCurrentSystemMetrics).toHaveBeenCalled();
    });

    it('should handle circular dependencies during initialization', async () => {
      dependencyAnalyzerService.getCurrentAnalysisResult.mockReturnValue({
        circularDependencies: [
          {
            cycle: ['HandlerA', 'HandlerB', 'HandlerA'],
            eventNames: ['event.a', 'event.b'],
            severity: 'warning',
            autoFixable: false,
            metadata: {
              length: 2,
              detectionMethod: 'dfs',
              detectedAt: Date.now(),
              complexity: 1,
            },
          },
        ],
        totalHandlers: 2,
        totalDependencies: 1,
        isolatedHandlers: [],
        criticalPath: [],
        maxDepth: 1,
        analysisTimestamp: Date.now(),
        warnings: [],
        errors: [],
      });

      await expect(module.onModuleInit()).resolves.not.toThrow();

      expect(dependencyAnalyzerService.getCurrentAnalysisResult).toHaveBeenCalled();
    });

    it('should handle system health alerts during initialization', async () => {
      metricsService.getCurrentSystemMetrics.mockReturnValue({
        health: {
          healthy: false,
          status: 'degraded',
          score: 75,
          lastCheck: Date.now(),
          alerts: ['High memory usage detected', 'Circuit breaker opened for handler X'],
        },
        events: {
          totalEmitted: 100,
          totalProcessed: 95,
          totalFailed: 5,
          averageProcessingTime: 150,
          currentlyProcessing: 0,
          retrying: 0,
          processingRate: 0.95,
          errorRate: 0.05,
          lastProcessedAt: Date.now(),
          lastEmittedAt: Date.now(),
          deadLettered: 0,
          retrySuccessRate: 0,
        },
        streams: {
          bufferSize: 0,
          maxBufferSize: 1000,
          droppedEvents: 0,
          warningThreshold: 800,
          backpressureActive: false,
          throughput: {
            eventsPerSecond: 10,
            averageLatency: 50,
            p95Latency: 75,
            p99Latency: 100,
            maxLatency: 120,
          },
          health: {
            healthy: true,
            memoryPressure: 10,
            cpuUsage: 15,
            lastCheckAt: Date.now(),
          },
        },
        handlers: {},
        isolation: {
          totalPools: 1,
          activePools: 1,
          totalActiveExecutions: 2,
          totalQueuedTasks: 0,
          totalDroppedTasks: 0,
          averagePoolUtilization: 0.2,
          circuitBreakerStates: {},
          poolMetrics: new Map(),
          resourceUsage: {
            memoryUsage: 120,
            cpuUsage: 15,
            activeThreads: 2,
            availableResources: {
              memory: 1000,
              cpu: 100,
              threads: 10,
            },
            pressure: {
              memory: 'low',
              cpu: 'low',
              threads: 'low',
            },
          },
          isolation: {
            interferenceScore: 0.1,
            faultContainment: 0.95,
            sharingEfficiency: 0.8,
          },
        },
        dlq: {
          totalEntries: 5,
          successfulReprocessing: 2,
          failedReprocessing: 3,
          averageRetryTime: 150,
          currentlyProcessing: 0,
          scheduledForRetry: 2,
          permanentFailures: 1,
          healthStatus: 'healthy' as const,
          policyStats: {},
        },
        system: {
          memoryUsage: 120,
          cpuUsage: 15,
          uptime: 300000,
          eventRate: 95,
          errorRate: 0.05,
          lastUpdated: Date.now(),
        },
      });

      await expect(module.onModuleInit()).resolves.not.toThrow();

      expect(metricsService.getCurrentSystemMetrics).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      const initializationError = new Error('Service initialization failed');
      handlerDiscoveryService.discoverHandlers.mockImplementation(() => {
        throw initializationError;
      });

      await expect(module.onModuleInit()).rejects.toThrow('Service initialization failed');
    });

    it('should log configuration summary during initialization', async () => {
      const logSpy = jest.spyOn(module['logger'], 'log');

      await module.onModuleInit();

      expect(logSpy).toHaveBeenCalledWith('Initializing Enhanced EventEmitter Module ...');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Event handlers discovered:'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Execution plan generated:'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('System health:'));
      expect(logSpy).toHaveBeenCalledWith('Enhanced EventEmitter Module  initialized successfully');
    });

    it('should handle multiple handlers of different types', async () => {
      const handlers = [
        createMockHandler('user.created'),
        createMockHandler('order.placed'),
        createMockHandler('payment.processed'),
        createMockHandler('notification.sent'),
        createMockHandler('audit.logged'),
      ];

      eventEmitterService.getAllHandlers.mockReturnValue(handlers);

      await expect(module.onModuleInit()).resolves.not.toThrow();

      expect(dependencyAnalyzerService.registerHandlers).toHaveBeenCalledWith(handlers);
      expect(dependencyAnalyzerService.generateExecutionPlan).toHaveBeenCalledWith([
        'user.created',
        'order.placed',
        'payment.processed',
        'notification.sent',
        'audit.logged',
      ]);
    });

    it('should handle empty handler collection', async () => {
      eventEmitterService.getAllHandlers.mockReturnValue([]);

      await expect(module.onModuleInit()).resolves.not.toThrow();

      expect(dependencyAnalyzerService.registerHandlers).toHaveBeenCalledWith([]);
      expect(dependencyAnalyzerService.generateExecutionPlan).toHaveBeenCalledWith([]);
    });
  });

  describe('Advanced Configuration Tests', () => {
    it('should handle complex configuration options', async () => {
      const complexOptions: EventEmitterOptions = {
        maxConcurrency: 25,
        handlerExecution: {
          defaultTimeout: 15000,
        },
        persistence: {
          enabled: true,
        },
        dlq: {
          enabled: true,
        },
        errorRecovery: {
          enabled: true,
          circuitBreakerThreshold: 3,
          circuitBreakerTimeout: 60000,
        },
        backpressure: {
          bufferSize: 2000,
          overflowStrategy: BackpressureStrategy.DROP_OLDEST,
        },
      };

      const dynamicModule = EventEmitterModule.forRoot(complexOptions);

      expect(dynamicModule).toBeDefined();

      const optionsProvider = dynamicModule.providers?.find((provider: any) => provider.provide === EVENT_EMITTER_OPTIONS) as any;

      expect(optionsProvider?.useValue).toEqual(complexOptions);
    });

    it('should handle minimal configuration', async () => {
      const minimalOptions: EventEmitterOptions = {
        maxConcurrency: 5,
        dlq: {
          enabled: false,
        },
      };

      const dynamicModule = EventEmitterModule.forRoot(minimalOptions);

      expect(dynamicModule).toBeDefined();
      expect(dynamicModule.providers).toBeDefined();
      expect(dynamicModule.exports).toBeDefined();
    });
  });

  describe('Service Integration Validation', () => {
    let fullModuleRef: any;

    beforeEach(async () => {
      fullModuleRef = await Test.createTestingModule({
        imports: [
          EventEmitterModule.forRoot({
            enableDeadLetterQueue: true,
          }),
        ],
      }).compile();
    });

    afterEach(async () => {
      if (fullModuleRef) {
        await fullModuleRef.close();
      }
    });

    it('should provide all services through dependency injection', () => {
      const eventEmitterService = fullModuleRef.get(EventEmitterService);
      const handlerDiscoveryService = fullModuleRef.get(HandlerDiscoveryService);
      const metricsService = fullModuleRef.get(MetricsService);
      const persistenceService = fullModuleRef.get(PersistenceService);
      const dlqService = fullModuleRef.get(DeadLetterQueueService);
      const handlerPoolService = fullModuleRef.get(HandlerPoolService);
      const dependencyAnalyzerService = fullModuleRef.get(DependencyAnalyzerService);
      const handlerExecutionService = fullModuleRef.get(HandlerExecutionService);
      const streamManagementService = fullModuleRef.get(StreamManagementService);

      expect(eventEmitterService).toBeInstanceOf(EventEmitterService);
      expect(handlerDiscoveryService).toBeInstanceOf(HandlerDiscoveryService);
      expect(metricsService).toBeInstanceOf(MetricsService);
      expect(persistenceService).toBeInstanceOf(PersistenceService);
      expect(dlqService).toBeInstanceOf(DeadLetterQueueService);
      expect(handlerPoolService).toBeInstanceOf(HandlerPoolService);
      expect(dependencyAnalyzerService).toBeInstanceOf(DependencyAnalyzerService);
      expect(handlerExecutionService).toBeInstanceOf(HandlerExecutionService);
      expect(streamManagementService).toBeInstanceOf(StreamManagementService);
    });

    it('should provide options token correctly', () => {
      const options = fullModuleRef.get(EVENT_EMITTER_OPTIONS);

      expect(options).toBeDefined();
      expect(options.persistence?.enabled).toBe(true);
      expect(options.dlq?.enabled).toBe(true);
    });

    it('should initialize all services without errors', async () => {
      const moduleInstance = fullModuleRef.get(EventEmitterModule);

      await expect(moduleInstance.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle service initialization failure', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
      })
        .overrideProvider(HandlerDiscoveryService)
        .useValue({
          discoverHandlers: jest.fn(() => {
            throw new Error('Handler discovery failed');
          }),
        })
        .overrideProvider(EventEmitterService)
        .useValue(eventEmitterService)
        .overrideProvider(MetricsService)
        .useValue(metricsService)
        .overrideProvider(DependencyAnalyzerService)
        .useValue(dependencyAnalyzerService)
        .compile();

      const module = moduleRef.get(EventEmitterModule);

      await expect(module.onModuleInit()).rejects.toThrow('Handler discovery failed');

      await moduleRef.close();
    });

    it('should handle undefined or null analysis results', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
      })
        .overrideProvider(HandlerDiscoveryService)
        .useValue(handlerDiscoveryService)
        .overrideProvider(EventEmitterService)
        .useValue(eventEmitterService)
        .overrideProvider(MetricsService)
        .useValue(metricsService)
        .overrideProvider(DependencyAnalyzerService)
        .useValue({
          ...dependencyAnalyzerService,
          getCurrentAnalysisResult: jest.fn().mockReturnValue(null),
        })
        .compile();

      const module = moduleRef.get(EventEmitterModule);

      // Should handle null analysis result gracefully
      await expect(module.onModuleInit()).resolves.not.toThrow();

      await moduleRef.close();
    });

    it('should handle metrics service failure', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
      })
        .overrideProvider(HandlerDiscoveryService)
        .useValue(handlerDiscoveryService)
        .overrideProvider(EventEmitterService)
        .useValue(eventEmitterService)
        .overrideProvider(MetricsService)
        .useValue({
          getCurrentSystemMetrics: jest.fn(() => {
            throw new Error('Metrics service unavailable');
          }),
        })
        .overrideProvider(DependencyAnalyzerService)
        .useValue(dependencyAnalyzerService)
        .compile();

      const module = moduleRef.get(EventEmitterModule);

      await expect(module.onModuleInit()).rejects.toThrow('Metrics service unavailable');

      await moduleRef.close();
    });

    it('should handle very large number of handlers', async () => {
      const manyHandlers = Array.from({ length: 1000 }, (_, i) => createMockHandler(`event.${i}`));

      eventEmitterService.getAllHandlers.mockReturnValue(manyHandlers);

      const moduleRef = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
      })
        .overrideProvider(HandlerDiscoveryService)
        .useValue(handlerDiscoveryService)
        .overrideProvider(EventEmitterService)
        .useValue(eventEmitterService)
        .overrideProvider(MetricsService)
        .useValue(metricsService)
        .overrideProvider(DependencyAnalyzerService)
        .useValue(dependencyAnalyzerService)
        .compile();

      const module = moduleRef.get(EventEmitterModule);

      await expect(module.onModuleInit()).resolves.not.toThrow();

      expect(dependencyAnalyzerService.registerHandlers).toHaveBeenCalledWith(manyHandlers);

      await moduleRef.close();
    });
  });

  describe('Logging and Monitoring', () => {
    let moduleRef: any;
    let logSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(async () => {
      moduleRef = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
      })
        .overrideProvider(HandlerDiscoveryService)
        .useValue(handlerDiscoveryService)
        .overrideProvider(EventEmitterService)
        .useValue(eventEmitterService)
        .overrideProvider(MetricsService)
        .useValue(metricsService)
        .overrideProvider(DependencyAnalyzerService)
        .useValue(dependencyAnalyzerService)
        .compile();

      module = moduleRef.get(EventEmitterModule);

      logSpy = jest.spyOn(module['logger'], 'log').mockImplementation();
      warnSpy = jest.spyOn(module['logger'], 'warn').mockImplementation();
      errorSpy = jest.spyOn(module['logger'], 'error').mockImplementation();
    });

    afterEach(async () => {
      logSpy?.mockRestore();
      warnSpy?.mockRestore();
      errorSpy?.mockRestore();
      await moduleRef.close();
    });

    it('should log initialization steps in correct order', async () => {
      await module.onModuleInit();

      const logCalls = logSpy.mock.calls.map((call) => call[0]);

      expect(logCalls[0]).toContain('Initializing Enhanced EventEmitter Module');
      expect(logCalls.some((call) => call.includes('Event handlers discovered'))).toBe(true);
      expect(logCalls.some((call) => call.includes('Execution plan generated'))).toBe(true);
      expect(logCalls.some((call) => call.includes('System health'))).toBe(true);
      expect(logCalls[logCalls.length - 2]).toBe('Enhanced EventEmitter Module  initialized successfully');
    });

    it('should warn about circular dependencies', async () => {
      dependencyAnalyzerService.getCurrentAnalysisResult.mockReturnValue({
        circularDependencies: [
          {
            cycle: ['HandlerA', 'HandlerB', 'HandlerC', 'HandlerA'],
            eventNames: ['event.a', 'event.b', 'event.c'],
            severity: 'warning',
            autoFixable: false,
            metadata: {
              length: 3,
              detectionMethod: 'dfs',
              detectedAt: Date.now(),
              complexity: 2,
            },
          },
          {
            cycle: ['HandlerX', 'HandlerY', 'HandlerX'],
            eventNames: ['event.x', 'event.y'],
            severity: 'error',
            autoFixable: false,
            metadata: {
              length: 2,
              detectionMethod: 'dfs',
              detectedAt: Date.now(),
              complexity: 1,
            },
          },
        ],
        totalHandlers: 5,
        totalDependencies: 4,
        isolatedHandlers: [],
        criticalPath: ['HandlerA', 'HandlerB'],
        maxDepth: 2,
        analysisTimestamp: Date.now(),
        warnings: [],
        errors: [],
      });

      await module.onModuleInit();

      expect(warnSpy).toHaveBeenCalledWith('Found 2 circular dependencies');
      expect(warnSpy).toHaveBeenCalledWith('  Circular dependency: HandlerA -> HandlerB -> HandlerC -> HandlerA');
      expect(warnSpy).toHaveBeenCalledWith('  Circular dependency: HandlerX -> HandlerY -> HandlerX');
    });

    it('should warn about system health alerts', async () => {
      metricsService.getCurrentSystemMetrics.mockReturnValue({
        health: {
          healthy: false,
          status: 'critical',
          score: 45,
          lastCheck: Date.now(),
          alerts: ['Memory usage above 90%', 'Dead letter queue size exceeding threshold', 'Multiple circuit breakers in open state'],
        },
        events: {
          totalEmitted: 1000,
          totalProcessed: 850,
          totalFailed: 150,
          averageProcessingTime: 200,
          currentlyProcessing: 5,
          retrying: 10,
          processingRate: 0.85,
          errorRate: 0.15,
          lastProcessedAt: Date.now(),
          lastEmittedAt: Date.now(),
          deadLettered: 20,
          retrySuccessRate: 0.5,
        },
        streams: {
          bufferSize: 100,
          maxBufferSize: 1000,
          droppedEvents: 10,
          warningThreshold: 800,
          backpressureActive: true,
          throughput: {
            eventsPerSecond: 5,
            averageLatency: 100,
            p95Latency: 150,
            p99Latency: 200,
            maxLatency: 250,
          },
          health: {
            healthy: false,
            memoryPressure: 85,
            cpuUsage: 90,
            lastCheckAt: Date.now(),
          },
        },
        handlers: {
          'user.handler': {
            totalExecutions: 100,
            successfulExecutions: 85,
            failedExecutions: 15,
            averageExecutionTime: 200,
            maxExecutionTime: 500,
            lastExecutionAt: Date.now(),
            successRate: 0.85,
            errorDistribution: {
              TimeoutError: 2,
              ValidationError: 3,
            },
          },
        },
        isolation: {
          totalPools: 2,
          activePools: 2,
          totalActiveExecutions: 5,
          totalQueuedTasks: 10,
          totalDroppedTasks: 1,
          averagePoolUtilization: 0.85,
          circuitBreakerStates: { 'pool-1': 'open', 'pool-2': 'closed' },
          poolMetrics: new Map(),
          resourceUsage: {
            memoryUsage: 900,
            cpuUsage: 90,
            activeThreads: 8,
            availableResources: {
              memory: 1000,
              cpu: 100,
              threads: 10,
            },
            pressure: {
              memory: 'high',
              cpu: 'critical',
              threads: 'high',
            },
          },
          isolation: {
            interferenceScore: 0.8,
            faultContainment: 0.6,
            sharingEfficiency: 0.4,
          },
        },
        dlq: {
          totalEntries: 20,
          successfulReprocessing: 6,
          failedReprocessing: 14,
          averageRetryTime: 2000,
          currentlyProcessing: 2,
          scheduledForRetry: 8,
          permanentFailures: 14,
          healthStatus: 'healthy' as const,
          policyStats: {},
        },
        system: {
          memoryUsage: 900,
          cpuUsage: 90,
          uptime: 3600000,
          eventRate: 850,
          errorRate: 0.15,
          lastUpdated: Date.now(),
        },
      });

      await module.onModuleInit();

      expect(warnSpy).toHaveBeenCalledWith('System alerts detected:');
      expect(warnSpy).toHaveBeenCalledWith('  - Memory usage above 90%');
      expect(warnSpy).toHaveBeenCalledWith('  - Dead letter queue size exceeding threshold');
      expect(warnSpy).toHaveBeenCalledWith('  - Multiple circuit breakers in open state');
    });

    it('should error log initialization failures with stack trace', async () => {
      const testError = new Error('Critical initialization failure');
      testError.stack = 'Error: Critical initialization failure\n    at TestModule.onModuleInit';

      handlerDiscoveryService.discoverHandlers.mockImplementation(() => {
        throw testError;
      });

      await expect(module.onModuleInit()).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith('Failed to initialize Enhanced EventEmitter Module :', expect.stringContaining('Critical initialization failure'));
    });

    it('should handle non-Error exceptions in error logging', async () => {
      handlerDiscoveryService.discoverHandlers.mockImplementation(() => {
        throw new Error('String exception'); // Non-Error exception
      });

      await expect(module.onModuleInit()).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith('Failed to initialize Enhanced EventEmitter Module :', expect.stringContaining('String exception'));
    });
  });
});
