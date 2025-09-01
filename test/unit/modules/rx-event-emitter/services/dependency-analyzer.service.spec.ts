import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { DiscoveryService, ModuleRef } from '@nestjs/core';
import { firstValueFrom } from 'rxjs';
import { DependencyAnalyzerService } from '@src/modules/rx-event-emitter/services/dependency-analyzer.service';
import {
  RegisteredHandler,
  HandlerDependency,
  DependencyType,
  DependencyStrength,
  EVENT_EMITTER_OPTIONS,
  CircularDependency,
} from '@src/modules/rx-event-emitter/interfaces';

describe('DependencyAnalyzerService', () => {
  let service: DependencyAnalyzerService;
  let mockModuleRef: jest.Mocked<ModuleRef>;
  let mockDiscoveryService: jest.Mocked<DiscoveryService>;

  const createMockHandler = (overrides: Partial<RegisteredHandler> = {}): RegisteredHandler => ({
    eventName: 'test.event',
    handlerName: 'TestHandler',
    handler: { handle: jest.fn() },
    options: {},
    metadata: {
      isRegistered: true,
      registeredAt: Date.now(),
      handlerClass: 'TestHandler',
    },
    ...overrides,
  });

  const createMockDependency = (overrides: Partial<HandlerDependency> = {}): HandlerDependency => ({
    dependentHandler: 'TestHandler',
    dependsOn: 'DependencyHandler',
    dependencyType: DependencyType.EVENT,
    strength: DependencyStrength.STRONG,
    eventName: 'dependency.event',
    description: 'Test dependency',
    ...overrides,
  });

  beforeEach(async () => {
    mockModuleRef = {
      get: jest.fn(),
      resolve: jest.fn(),
      create: jest.fn(),
      select: jest.fn(),
    } as any;

    mockDiscoveryService = {
      getProviders: jest.fn().mockReturnValue([]),
      getControllers: jest.fn().mockReturnValue([]),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        DependencyAnalyzerService,
        { provide: ModuleRef, useValue: mockModuleRef },
        { provide: DiscoveryService, useValue: mockDiscoveryService },
        {
          provide: EVENT_EMITTER_OPTIONS,
          useValue: {
            dependency: {
              enabled: true,
              autoDetection: true,
              strictMode: false,
              maxAnalysisDepth: 10,
              circularDependencyHandling: 'warning',
              optimization: {
                enableParallelization: true,
                maxParallelHandlers: 5,
                dependencyTimeout: 5000,
              },
            },
          },
        },
      ],
    }).compile();

    service = moduleRef.get(DependencyAnalyzerService);
  });

  describe('Service Lifecycle', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize successfully with enabled configuration', async () => {
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    it('should skip initialization when disabled', async () => {
      const disabledService = new DependencyAnalyzerService(mockDiscoveryService, mockModuleRef, { dependency: { enabled: false } });

      await expect(disabledService.onModuleInit()).resolves.not.toThrow();
    });

    it('should use default configuration when none provided', () => {
      const defaultService = new DependencyAnalyzerService(mockDiscoveryService, mockModuleRef);
      expect(defaultService).toBeDefined();
    });
  });

  describe('Handler Registration', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should register handler dependencies', () => {
      const handler = createMockHandler({ handlerName: 'UserHandler' });
      const dependency = createMockDependency({
        dependentHandler: 'UserHandler',
        dependsOn: 'EmailHandler',
        eventName: 'email.send',
      });

      service.registerHandler(handler, [dependency]);

      const dependencies = service.getHandlerDependencies('UserHandler');
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0]).toEqual(dependency);
    });

    it('should register multiple dependencies for a handler', () => {
      const handler = createMockHandler({ handlerName: 'UserHandler' });
      const dependencies = [
        createMockDependency({ dependsOn: 'EmailHandler', eventName: 'email.send' }),
        createMockDependency({ dependsOn: 'LogHandler', eventName: 'log.write' }),
      ];

      service.registerHandler(handler, dependencies);

      const registeredDeps = service.getHandlerDependencies('UserHandler');
      expect(registeredDeps).toHaveLength(2);
    });

    it('should update existing handler dependencies', () => {
      const handler = createMockHandler({ handlerName: 'UserHandler' });
      const initialDeps = [createMockDependency({ dependsOn: 'EmailHandler' })];
      const updatedDeps = [createMockDependency({ dependsOn: 'NotificationHandler' })];

      service.registerHandler(handler, initialDeps);
      service.registerHandler(handler, updatedDeps);

      const dependencies = service.getHandlerDependencies('UserHandler');
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].dependsOn).toBe('NotificationHandler');
    });

    it('should unregister handler dependencies', () => {
      const handler = createMockHandler({ handlerName: 'UserHandler' });
      const dependency = createMockDependency({ dependentHandler: 'UserHandler' });

      service.registerHandler(handler, [dependency]);
      expect(service.getHandlerDependencies('UserHandler')).toHaveLength(1);

      service.unregisterHandler('UserHandler');
      expect(service.getHandlerDependencies('UserHandler')).toHaveLength(0);
    });
  });

  describe('Dependency Analysis', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should analyze simple dependency chain', () => {
      const handlers = [
        createMockHandler({ handlerName: 'HandlerA', eventName: 'event.a' }),
        createMockHandler({ handlerName: 'HandlerB', eventName: 'event.b' }),
      ];

      const dependencies = [
        createMockDependency({
          dependentHandler: 'HandlerA',
          dependsOn: 'HandlerB',
          eventName: 'event.b',
        }),
      ];

      service.registerHandler(handlers[0], [dependencies[0]]);
      service.registerHandler(handlers[1], []);

      const result = service.analyzeDependencies(handlers);

      expect(result).toBeDefined();
      expect(result.handlers).toHaveLength(2);
      expect(result.dependencies).toHaveLength(1);
      expect(result.circularDependencies).toHaveLength(0);
    });

    it('should detect circular dependencies', () => {
      const handlers = [
        createMockHandler({ handlerName: 'HandlerA', eventName: 'event.a' }),
        createMockHandler({ handlerName: 'HandlerB', eventName: 'event.b' }),
      ];

      const dependencies = [
        createMockDependency({
          dependentHandler: 'HandlerA',
          dependsOn: 'HandlerB',
          eventName: 'event.b',
        }),
        createMockDependency({
          dependentHandler: 'HandlerB',
          dependsOn: 'HandlerA',
          eventName: 'event.a',
        }),
      ];

      service.registerHandler(handlers[0], [dependencies[0]]);
      service.registerHandler(handlers[1], [dependencies[1]]);

      const result = service.analyzeDependencies(handlers);

      expect(result.circularDependencies.length).toBeGreaterThan(0);
      expect(result.hasCircularDependencies).toBe(true);
    });

    it('should handle different dependency types', () => {
      const handler = createMockHandler({ handlerName: 'TestHandler' });
      const dependencies = [
        createMockDependency({ dependencyType: DependencyType.EVENT }),
        createMockDependency({ dependencyType: DependencyType.SERVICE }),
        createMockDependency({ dependencyType: DependencyType.DATA }),
      ];

      service.registerHandler(handler, dependencies);

      const registeredDeps = service.getHandlerDependencies('TestHandler');
      expect(registeredDeps).toHaveLength(3);
      expect(registeredDeps.map((d) => d.dependencyType)).toEqual([DependencyType.EVENT, DependencyType.SERVICE, DependencyType.DATA]);
    });

    it('should handle different dependency strengths', () => {
      const handler = createMockHandler({ handlerName: 'TestHandler' });
      const dependencies = [
        createMockDependency({ strength: DependencyStrength.WEAK }),
        createMockDependency({ strength: DependencyStrength.STRONG }),
        createMockDependency({ strength: DependencyStrength.CRITICAL }),
      ];

      service.registerHandler(handler, dependencies);

      const result = service.analyzeDependencies([handler]);
      expect(result.dependencies.map((d) => d.strength)).toEqual([DependencyStrength.WEAK, DependencyStrength.STRONG, DependencyStrength.CRITICAL]);
    });

    it('should provide analysis metrics', () => {
      const handlers = [
        createMockHandler({ handlerName: 'HandlerA' }),
        createMockHandler({ handlerName: 'HandlerB' }),
        createMockHandler({ handlerName: 'HandlerC' }),
      ];

      const dependencies = [
        createMockDependency({ dependentHandler: 'HandlerA', dependsOn: 'HandlerB' }),
        createMockDependency({ dependentHandler: 'HandlerB', dependsOn: 'HandlerC' }),
      ];

      service.registerHandler(handlers[0], [dependencies[0]]);
      service.registerHandler(handlers[1], [dependencies[1]]);
      service.registerHandler(handlers[2], []);

      service.analyzeDependencies(handlers);

      const metrics = service.getAnalysisMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.totalHandlers).toBe(3);
      expect(metrics.totalDependencies).toBe(2);
      expect(metrics.circularDependencies).toBe(0);
    });
  });

  describe('Execution Plan Creation', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should create execution plan for independent handlers', () => {
      const handlers = [
        createMockHandler({ handlerName: 'HandlerA', eventName: 'event.a' }),
        createMockHandler({ handlerName: 'HandlerB', eventName: 'event.b' }),
      ];

      service.registerHandler(handlers[0], []);
      service.registerHandler(handlers[1], []);

      const plan = service.createExecutionPlan(handlers);
      expect(plan).toBeDefined();
      expect(plan.phases).toHaveLength(1);
      expect(plan.phases[0].handlers).toHaveLength(2);
      expect(plan.canParallelize).toBe(true);
    });

    it('should create execution plan for dependent handlers', () => {
      const handlers = [
        createMockHandler({ handlerName: 'HandlerA', eventName: 'event.a' }),
        createMockHandler({ handlerName: 'HandlerB', eventName: 'event.b' }),
      ];

      const dependency = createMockDependency({
        dependentHandler: 'HandlerA',
        dependsOn: 'HandlerB',
        eventName: 'event.b',
      });

      service.registerHandler(handlers[0], [dependency]);
      service.registerHandler(handlers[1], []);

      const plan = service.createExecutionPlan(handlers);
      expect(plan.phases.length).toBeGreaterThan(1);
      expect(plan.totalPhases).toBeGreaterThan(1);
    });

    it('should handle execution plan for complex dependency graph', () => {
      const handlers = [
        createMockHandler({ handlerName: 'HandlerA', eventName: 'event.a' }),
        createMockHandler({ handlerName: 'HandlerB', eventName: 'event.b' }),
        createMockHandler({ handlerName: 'HandlerC', eventName: 'event.c' }),
        createMockHandler({ handlerName: 'HandlerD', eventName: 'event.d' }),
      ];

      const dependencies = [
        createMockDependency({ dependentHandler: 'HandlerA', dependsOn: 'HandlerB' }),
        createMockDependency({ dependentHandler: 'HandlerA', dependsOn: 'HandlerC' }),
        createMockDependency({ dependentHandler: 'HandlerD', dependsOn: 'HandlerB' }),
      ];

      service.registerHandler(handlers[0], [dependencies[0], dependencies[1]]);
      service.registerHandler(handlers[1], []);
      service.registerHandler(handlers[2], []);
      service.registerHandler(handlers[3], [dependencies[2]]);

      const plan = service.createExecutionPlan(handlers);
      expect(plan.phases).toBeDefined();
      expect(plan.totalPhases).toBeGreaterThan(1);
    });

    it('should optimize execution plan for parallelization', () => {
      const handlers = [
        createMockHandler({ handlerName: 'HandlerA' }),
        createMockHandler({ handlerName: 'HandlerB' }),
        createMockHandler({ handlerName: 'HandlerC' }),
      ];

      service.registerHandler(handlers[0], []);
      service.registerHandler(handlers[1], []);
      service.registerHandler(handlers[2], []);

      const plan = service.createExecutionPlan(handlers);
      expect(plan.canParallelize).toBe(true);
      expect(plan.estimatedExecutionTime).toBeDefined();
      expect(plan.parallelizationOpportunities).toBeDefined();
    });
  });

  describe('Observable Streams', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should provide analysis result observable', async () => {
      const handlers = [createMockHandler()];
      service.registerHandler(handlers[0], []);
      service.analyzeDependencies(handlers);

      const analysisResult = await firstValueFrom(service.getAnalysisResult$());
      expect(analysisResult).toBeDefined();
      expect(analysisResult.handlers).toBeDefined();
      expect(analysisResult.dependencies).toBeDefined();
    });

    it('should provide execution plan observable', async () => {
      const handlers = [createMockHandler()];
      service.registerHandler(handlers[0], []);
      const plan = service.createExecutionPlan(handlers);

      const executionPlan = await firstValueFrom(service.getExecutionPlan$());
      expect(executionPlan).toBeDefined();
      expect(executionPlan.phases).toBeDefined();
    });
  });

  describe('Graph Operations', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should provide dependency graph', () => {
      const handlers = [createMockHandler({ handlerName: 'HandlerA' }), createMockHandler({ handlerName: 'HandlerB' })];

      const dependency = createMockDependency({
        dependentHandler: 'HandlerA',
        dependsOn: 'HandlerB',
      });

      service.registerHandler(handlers[0], [dependency]);
      service.registerHandler(handlers[1], []);

      const graph = service.getDependencyGraph();
      expect(graph).toBeDefined();
      expect(typeof graph).toBe('object');
    });

    it('should detect circular dependencies in graph', () => {
      const handlers = [createMockHandler({ handlerName: 'HandlerA' }), createMockHandler({ handlerName: 'HandlerB' })];

      const dependencies = [
        createMockDependency({ dependentHandler: 'HandlerA', dependsOn: 'HandlerB' }),
        createMockDependency({ dependentHandler: 'HandlerB', dependsOn: 'HandlerA' }),
      ];

      service.registerHandler(handlers[0], [dependencies[0]]);
      service.registerHandler(handlers[1], [dependencies[1]]);

      const circular = service.detectCircularDependencies(handlers);
      expect(circular).toHaveLength(1);
      expect(circular[0]).toMatchObject({
        cycle: expect.any(Array),
        severity: expect.any(String),
      });
    });

    it('should resolve handler dependencies', () => {
      const handlers = [
        createMockHandler({ handlerName: 'HandlerA' }),
        createMockHandler({ handlerName: 'HandlerB' }),
        createMockHandler({ handlerName: 'HandlerC' }),
      ];

      const dependencies = [
        createMockDependency({ dependentHandler: 'HandlerA', dependsOn: 'HandlerB' }),
        createMockDependency({ dependentHandler: 'HandlerB', dependsOn: 'HandlerC' }),
      ];

      service.registerHandler(handlers[0], [dependencies[0]]);
      service.registerHandler(handlers[1], [dependencies[1]]);
      service.registerHandler(handlers[2], []);

      const resolved = service.resolveDependencies('HandlerA', handlers);
      expect(resolved).toBeDefined();
      expect(Array.isArray(resolved)).toBe(true);
    });
  });

  describe('Configuration and Options', () => {
    it('should handle strict mode configuration', async () => {
      const strictService = new DependencyAnalyzerService(mockDiscoveryService, mockModuleRef, {
        dependency: {
          enabled: true,
          strictMode: true,
          circularDependencyHandling: 'error',
        },
      });

      await expect(strictService.onModuleInit()).resolves.not.toThrow();
    });

    it('should handle different circular dependency strategies', async () => {
      const strategies = ['error', 'warning', 'ignore'] as const;

      for (const strategy of strategies) {
        const configuredService = new DependencyAnalyzerService(mockDiscoveryService, mockModuleRef, {
          dependency: {
            enabled: true,
            circularDependencyHandling: strategy,
          },
        });

        await expect(configuredService.onModuleInit()).resolves.not.toThrow();
      }
    });

    it('should respect optimization configuration', async () => {
      const optimizedService = new DependencyAnalyzerService(mockDiscoveryService, mockModuleRef, {
        dependency: {
          enabled: true,
          optimization: {
            enableParallelization: true,
            maxParallelHandlers: 10,
            dependencyTimeout: 10000,
          },
        },
      });

      await optimizedService.onModuleInit();

      const handlers = [createMockHandler({ handlerName: 'Handler1' }), createMockHandler({ handlerName: 'Handler2' })];

      optimizedService.registerHandler(handlers[0], []);
      optimizedService.registerHandler(handlers[1], []);

      const plan = optimizedService.createExecutionPlan(handlers);
      expect(plan.canParallelize).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle invalid handler registration gracefully', () => {
      const invalidHandler = null as any;
      expect(() => service.registerHandler(invalidHandler, [])).not.toThrow();
    });

    it('should handle empty handler arrays', () => {
      const result = service.analyzeDependencies([]);
      expect(result).toBeDefined();
      expect(result.handlers).toHaveLength(0);
      expect(result.dependencies).toHaveLength(0);
    });

    it('should handle missing dependencies gracefully', () => {
      const handler = createMockHandler({ handlerName: 'TestHandler' });
      const invalidDependency = createMockDependency({
        dependentHandler: 'TestHandler',
        dependsOn: 'NonExistentHandler',
      });

      service.registerHandler(handler, [invalidDependency]);
      const result = service.analyzeDependencies([handler]);

      expect(result).toBeDefined();
      expect(result.warnings).toBeDefined();
    });

    it('should handle complex circular dependencies', () => {
      const handlers = [
        createMockHandler({ handlerName: 'HandlerA' }),
        createMockHandler({ handlerName: 'HandlerB' }),
        createMockHandler({ handlerName: 'HandlerC' }),
      ];

      const dependencies = [
        createMockDependency({ dependentHandler: 'HandlerA', dependsOn: 'HandlerB' }),
        createMockDependency({ dependentHandler: 'HandlerB', dependsOn: 'HandlerC' }),
        createMockDependency({ dependentHandler: 'HandlerC', dependsOn: 'HandlerA' }),
      ];

      service.registerHandler(handlers[0], [dependencies[0]]);
      service.registerHandler(handlers[1], [dependencies[1]]);
      service.registerHandler(handlers[2], [dependencies[2]]);

      const result = service.analyzeDependencies(handlers);
      expect(result.hasCircularDependencies).toBe(true);
      expect(result.circularDependencies.length).toBeGreaterThan(0);
    });
  });

  describe('Advanced Features', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should provide dependency validation', () => {
      const handler = createMockHandler({ handlerName: 'TestHandler' });
      const dependency = createMockDependency({ dependentHandler: 'TestHandler' });

      service.registerHandler(handler, [dependency]);

      const isValid = service.validateDependencies([handler]);
      expect(typeof isValid).toBe('boolean');
    });

    it('should handle dependency depth analysis', () => {
      const handlers = [
        createMockHandler({ handlerName: 'HandlerA' }),
        createMockHandler({ handlerName: 'HandlerB' }),
        createMockHandler({ handlerName: 'HandlerC' }),
        createMockHandler({ handlerName: 'HandlerD' }),
      ];

      const dependencies = [
        createMockDependency({ dependentHandler: 'HandlerA', dependsOn: 'HandlerB' }),
        createMockDependency({ dependentHandler: 'HandlerB', dependsOn: 'HandlerC' }),
        createMockDependency({ dependentHandler: 'HandlerC', dependsOn: 'HandlerD' }),
      ];

      handlers.forEach((handler, index) => {
        const deps = dependencies[index] ? [dependencies[index]] : [];
        service.registerHandler(handler, deps);
      });

      const analysis = service.analyzeDependencies(handlers);
      expect(analysis.maxDepth).toBeDefined();
      expect(analysis.maxDepth).toBeGreaterThan(1);
    });

    it('should provide performance insights', () => {
      const handlers = Array.from({ length: 10 }, (_, i) => createMockHandler({ handlerName: `Handler${i}` }));

      handlers.forEach((handler) => service.registerHandler(handler, []));

      const plan = service.createExecutionPlan(handlers);
      expect(plan.estimatedExecutionTime).toBeDefined();
      expect(plan.parallelizationOpportunities).toBeDefined();
      expect(plan.optimizationSuggestions).toBeDefined();
    });
  });
});
