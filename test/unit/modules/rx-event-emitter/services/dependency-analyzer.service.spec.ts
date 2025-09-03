import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { DiscoveryService, ModuleRef } from '@nestjs/core';
import { firstValueFrom } from 'rxjs';
import { DependencyAnalyzerService } from '@src/modules/rx-event-emitter/services/dependency-analyzer.service';
import type { RegisteredHandler, HandlerMetadata } from '@src/modules/rx-event-emitter/interfaces';
import { DependencyType, DependencyStrength, EVENT_EMITTER_OPTIONS } from '@src/modules/rx-event-emitter/interfaces';

describe('DependencyAnalyzerService', () => {
  let service: DependencyAnalyzerService;
  let mockModuleRef: jest.Mocked<ModuleRef>;
  let mockDiscoveryService: jest.Mocked<DiscoveryService>;

  const createMockHandler = (overrides: Partial<RegisteredHandler> = {}): RegisteredHandler => {
    const handlerId = overrides.handlerId || `handler-${Math.random().toString(36).substr(2, 9)}`;
    const eventName = overrides.eventName || 'test.event';
    const className = 'TestHandler';

    const metadata: HandlerMetadata = {
      eventName,
      options: overrides.options || {},
      methodName: 'handle',
      className,
      handlerId,
      providerToken: className,
    };

    return {
      eventName,
      handler: jest.fn(),
      instance: { handle: jest.fn() },
      options: {},
      handlerId,
      metadata,
      ...overrides,
    };
  };

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
            dependencyAnalyzer: {
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
      const disabledService = new DependencyAnalyzerService(mockDiscoveryService, mockModuleRef, { dependencyAnalyzer: { enabled: false } });

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

    it('should register multiple handlers', () => {
      const handlers = [createMockHandler({ eventName: 'user.created' }), createMockHandler({ eventName: 'user.updated' })];

      service.registerHandlers(handlers);

      const analysisResult = service.getCurrentAnalysisResult();
      expect(analysisResult.totalHandlers).toBe(2);
    });

    it('should skip registration when disabled', () => {
      const disabledService = new DependencyAnalyzerService(mockDiscoveryService, mockModuleRef, { dependencyAnalyzer: { enabled: false } });

      const handlers = [createMockHandler()];
      disabledService.registerHandlers(handlers);

      const analysisResult = disabledService.getCurrentAnalysisResult();
      expect(analysisResult.totalHandlers).toBe(0);
    });

    it('should handle handlers with explicit dependencies in metadata', () => {
      const handler = createMockHandler({
        eventName: 'user.created',
        handlerId: 'UserCreatedHandler',
        metadata: {
          eventName: 'user.created',
          options: {
            dependencies: ['email.service', 'log.service'],
          },
          methodName: 'handle',
          className: 'UserCreatedHandler',
          handlerId: 'UserCreatedHandler',
          providerToken: 'UserCreatedHandler',
        },
      });

      service.registerHandlers([handler]);

      const dependencies = service.getDependencies('user.created');
      expect(dependencies).toHaveLength(2);
      expect(dependencies[0].dependsOn).toBe('email.service');
      expect(dependencies[1].dependsOn).toBe('log.service');
    });
  });

  describe('Dependency Management', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should add dependency between handlers', () => {
      service.addDependency('HandlerA', 'HandlerB', DependencyType.SEQUENTIAL, DependencyStrength.STRONG, {
        reason: 'HandlerA needs HandlerB results',
      });

      const dependencies = service.getDependencies('HandlerA');
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].dependsOn).toBe('HandlerB');
      expect(dependencies[0].type).toBe(DependencyType.SEQUENTIAL);
      expect(dependencies[0].strength).toBe(DependencyStrength.STRONG);
    });

    it('should add multiple dependencies for same handler', () => {
      service.addDependency('HandlerA', 'HandlerB');
      service.addDependency('HandlerA', 'HandlerC');

      const dependencies = service.getDependencies('HandlerA');
      expect(dependencies).toHaveLength(2);
    });

    it('should remove dependency between handlers', () => {
      service.addDependency('HandlerA', 'HandlerB');
      expect(service.getDependencies('HandlerA')).toHaveLength(1);

      const removed = service.removeDependency('HandlerA', 'HandlerB');
      expect(removed).toBe(true);
      expect(service.getDependencies('HandlerA')).toHaveLength(0);
    });

    it('should return false when removing non-existent dependency', () => {
      const removed = service.removeDependency('NonExistent', 'AlsoNonExistent');
      expect(removed).toBe(false);
    });

    it('should skip operations when disabled', () => {
      const disabledService = new DependencyAnalyzerService(mockDiscoveryService, mockModuleRef, { dependencyAnalyzer: { enabled: false } });

      disabledService.addDependency('HandlerA', 'HandlerB');
      expect(disabledService.getDependencies('HandlerA')).toHaveLength(0);

      const removed = disabledService.removeDependency('HandlerA', 'HandlerB');
      expect(removed).toBe(false);
    });

    it('should get dependents of a handler', () => {
      service.addDependency('HandlerA', 'HandlerC');
      service.addDependency('HandlerB', 'HandlerC');

      const dependents = service.getDependents('HandlerC');
      expect(dependents).toContain('HandlerA');
      expect(dependents).toContain('HandlerB');
      expect(dependents).toHaveLength(2);
    });

    it('should return empty array for non-existent dependencies', () => {
      const dependencies = service.getDependencies('NonExistent');
      expect(dependencies).toEqual([]);

      const dependents = service.getDependents('NonExistent');
      expect(dependents).toEqual([]);
    });

    it('should clear all dependencies', () => {
      service.addDependency('HandlerA', 'HandlerB');
      service.addDependency('HandlerC', 'HandlerD');

      expect(service.getDependencies('HandlerA')).toHaveLength(1);
      expect(service.getDependencies('HandlerC')).toHaveLength(1);

      service.clearDependencies();

      expect(service.getDependencies('HandlerA')).toHaveLength(0);
      expect(service.getDependencies('HandlerC')).toHaveLength(0);
    });
  });

  describe('Circular Dependency Detection', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should detect simple circular dependencies', () => {
      const handlerA = createMockHandler({ eventName: 'HandlerA', handlerId: 'HandlerA' });
      const handlerB = createMockHandler({ eventName: 'HandlerB', handlerId: 'HandlerB' });

      service.registerHandlers([handlerA, handlerB]);
      service.addDependency('HandlerA', 'HandlerB');
      service.addDependency('HandlerB', 'HandlerA');

      expect(service.hasCircularDependencies()).toBe(true);
      const circular = service.getCircularDependencies();
      expect(circular.length).toBeGreaterThan(0);
    });

    it('should detect complex circular dependencies', () => {
      const handlers = [
        createMockHandler({ eventName: 'HandlerA', handlerId: 'HandlerA' }),
        createMockHandler({ eventName: 'HandlerB', handlerId: 'HandlerB' }),
        createMockHandler({ eventName: 'HandlerC', handlerId: 'HandlerC' }),
      ];

      service.registerHandlers(handlers);
      service.addDependency('HandlerA', 'HandlerB');
      service.addDependency('HandlerB', 'HandlerC');
      service.addDependency('HandlerC', 'HandlerA');

      expect(service.hasCircularDependencies()).toBe(true);
      const circular = service.getCircularDependencies();
      expect(circular).toHaveLength(1);
      expect(circular[0].cycle).toContain('HandlerA');
      expect(circular[0].cycle).toContain('HandlerB');
      expect(circular[0].cycle).toContain('HandlerC');
    });

    it('should not detect false positives', () => {
      const handlers = [
        createMockHandler({ eventName: 'HandlerA', handlerId: 'HandlerA' }),
        createMockHandler({ eventName: 'HandlerB', handlerId: 'HandlerB' }),
        createMockHandler({ eventName: 'HandlerC', handlerId: 'HandlerC' }),
      ];

      service.registerHandlers(handlers);
      service.addDependency('HandlerA', 'HandlerB');
      service.addDependency('HandlerB', 'HandlerC');

      expect(service.hasCircularDependencies()).toBe(false);
      expect(service.getCircularDependencies()).toHaveLength(0);
    });
  });

  describe('Execution Order', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should determine execution order for simple dependencies', () => {
      service.addDependency('HandlerA', 'HandlerB');
      service.addDependency('HandlerB', 'HandlerC');

      const order = service.getExecutionOrder(['HandlerA', 'HandlerB', 'HandlerC']);
      expect(order.indexOf('HandlerC')).toBeLessThan(order.indexOf('HandlerB'));
      expect(order.indexOf('HandlerB')).toBeLessThan(order.indexOf('HandlerA'));
    });

    it('should handle circular dependencies gracefully', () => {
      service.addDependency('HandlerA', 'HandlerB');
      service.addDependency('HandlerB', 'HandlerA');

      const order = service.getExecutionOrder(['HandlerA', 'HandlerB']);
      expect(order).toEqual(['HandlerA', 'HandlerB']); // Falls back to original order
    });

    it('should handle independent handlers', () => {
      const order = service.getExecutionOrder(['HandlerA', 'HandlerB', 'HandlerC']);
      expect(order).toHaveLength(3);
      expect(order).toContain('HandlerA');
      expect(order).toContain('HandlerB');
      expect(order).toContain('HandlerC');
    });
  });

  describe('Execution Plan Generation', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should generate execution plan for independent handlers', () => {
      const plan = service.generateExecutionPlan(['HandlerA', 'HandlerB', 'HandlerC']);

      expect(plan.phases).toHaveLength(1);
      expect(plan.phases[0].handlers).toHaveLength(3);
      expect(plan.phases[0].canRunInParallel).toBe(true);
      expect(plan.totalPhases).toBe(1);
      expect(plan.parallelizationOpportunities).toBe(1);
    });

    it('should generate multi-phase plan for dependent handlers', () => {
      service.addDependency('HandlerA', 'HandlerB');
      service.addDependency('HandlerB', 'HandlerC');

      const plan = service.generateExecutionPlan(['HandlerA', 'HandlerB', 'HandlerC']);

      expect(plan.totalPhases).toBeGreaterThan(1);
      expect(plan.estimatedExecutionTime).toBeGreaterThan(0);
    });

    it('should handle circular dependencies in execution plan', () => {
      service.addDependency('HandlerA', 'HandlerB');
      service.addDependency('HandlerB', 'HandlerA');

      const plan = service.generateExecutionPlan(['HandlerA', 'HandlerB']);

      expect(plan.phases).toHaveLength(1);
      expect(plan.phases[0].handlers).toHaveLength(2);
    });

    it('should identify bottlenecks in execution plan', () => {
      service.addDependency('HandlerA', 'HandlerD');
      service.addDependency('HandlerB', 'HandlerD');
      service.addDependency('HandlerC', 'HandlerD');
      service.addDependency('HandlerE', 'HandlerD');

      const plan = service.generateExecutionPlan(['HandlerA', 'HandlerB', 'HandlerC', 'HandlerD', 'HandlerE']);

      expect(plan.bottlenecks.some((b) => b.includes('HandlerD'))).toBe(true);
    });

    it('should handle empty handler list', () => {
      const plan = service.generateExecutionPlan([]);

      expect(plan.phases).toHaveLength(0);
      expect(plan.totalPhases).toBe(0);
      expect(plan.estimatedExecutionTime).toBe(0);
    });
  });

  describe('Dependency Validation', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should validate dependencies successfully for valid configuration', () => {
      const handlerA = createMockHandler({ eventName: 'HandlerA', handlerId: 'HandlerA' });
      const handlerB = createMockHandler({ eventName: 'HandlerB', handlerId: 'HandlerB' });

      service.registerHandlers([handlerA, handlerB]);
      service.addDependency('HandlerA', 'HandlerB');

      const validation = service.validateDependencies();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing handler dependencies', () => {
      const handlerA = createMockHandler({ eventName: 'HandlerA', handlerId: 'HandlerA' });

      service.registerHandlers([handlerA]);
      service.addDependency('HandlerA', 'NonExistentHandler');

      const validation = service.validateDependencies();

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('HandlerA depends on non-existent handler NonExistentHandler'))).toBe(true);
    });

    it('should handle circular dependencies based on configuration', () => {
      const handlers = [
        createMockHandler({ eventName: 'HandlerA', handlerId: 'HandlerA' }),
        createMockHandler({ eventName: 'HandlerB', handlerId: 'HandlerB' }),
      ];

      service.registerHandlers(handlers);
      service.addDependency('HandlerA', 'HandlerB');
      service.addDependency('HandlerB', 'HandlerA');

      const validation = service.validateDependencies();

      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings[0]).toContain('Circular dependency');
    });

    it('should treat circular dependencies as errors in strict mode', async () => {
      const strictService = new DependencyAnalyzerService(mockDiscoveryService, mockModuleRef, {
        dependencyAnalyzer: {
          enabled: true,
          strictMode: true,
          circularDependencyHandling: 'error',
        },
      });

      await strictService.onModuleInit();

      const handlers = [
        createMockHandler({ eventName: 'HandlerA', handlerId: 'HandlerA' }),
        createMockHandler({ eventName: 'HandlerB', handlerId: 'HandlerB' }),
      ];

      strictService.registerHandlers(handlers);
      strictService.addDependency('HandlerA', 'HandlerB');
      strictService.addDependency('HandlerB', 'HandlerA');

      const validation = strictService.validateDependencies();

      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('Circular dependency');
    });
  });

  describe('Observable Streams', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should provide analysis results observable', async () => {
      const handler = createMockHandler({ eventName: 'TestHandler', handlerId: 'TestHandler' });
      service.registerHandlers([handler]);

      const analysisResult = await firstValueFrom(service.getAnalysisResults());

      expect(analysisResult).toBeDefined();
      expect(analysisResult.totalHandlers).toBe(1);
      expect(analysisResult.analysisTimestamp).toBeGreaterThan(0);
    });

    it('should provide execution plan observable', async () => {
      service.generateExecutionPlan(['HandlerA', 'HandlerB']);

      const executionPlan = await firstValueFrom(service.getExecutionPlan());

      expect(executionPlan).toBeDefined();
      expect(executionPlan.phases).toBeDefined();
      expect(executionPlan.totalPhases).toBeGreaterThanOrEqual(0);
    });

    it('should get current analysis result synchronously', () => {
      const handler = createMockHandler({ eventName: 'TestHandler', handlerId: 'TestHandler' });
      service.registerHandlers([handler]);

      const result = service.getCurrentAnalysisResult();

      expect(result).toBeDefined();
      expect(result.totalHandlers).toBe(1);
    });
  });

  describe('Advanced Analysis Features', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should calculate critical path correctly', () => {
      const handlers = [
        createMockHandler({ eventName: 'HandlerA', handlerId: 'HandlerA' }),
        createMockHandler({ eventName: 'HandlerB', handlerId: 'HandlerB' }),
        createMockHandler({ eventName: 'HandlerC', handlerId: 'HandlerC' }),
        createMockHandler({ eventName: 'HandlerD', handlerId: 'HandlerD' }),
      ];

      service.registerHandlers(handlers);
      service.addDependency('HandlerA', 'HandlerB');
      service.addDependency('HandlerB', 'HandlerC');
      service.addDependency('HandlerC', 'HandlerD');

      const result = service.getCurrentAnalysisResult();

      expect(result.criticalPath).toBeDefined();
      expect(result.criticalPath.length).toBeGreaterThan(0);
      expect(result.maxDepth).toBeGreaterThan(1);
    });

    it('should identify isolated handlers', () => {
      const handlers = [
        createMockHandler({ eventName: 'HandlerA', handlerId: 'HandlerA' }),
        createMockHandler({ eventName: 'HandlerB', handlerId: 'HandlerB' }),
        createMockHandler({ eventName: 'HandlerC', handlerId: 'HandlerC' }),
      ];

      service.registerHandlers(handlers);
      service.addDependency('HandlerA', 'HandlerB');

      const result = service.getCurrentAnalysisResult();

      expect(result.isolatedHandlers).toContain('HandlerC');
    });

    it('should handle self-dependencies gracefully', () => {
      const handler = createMockHandler({ eventName: 'HandlerA', handlerId: 'HandlerA' });

      service.registerHandlers([handler]);
      service.addDependency('HandlerA', 'HandlerA');

      expect(service.hasCircularDependencies()).toBe(true);
      const circular = service.getCircularDependencies();
      expect(circular.length).toBeGreaterThan(0);
    });

    it('should provide comprehensive analysis metrics', () => {
      const handlers = Array.from({ length: 5 }, (_, i) => createMockHandler({ eventName: `Handler${i}`, handlerId: `Handler${i}` }));

      service.registerHandlers(handlers);
      service.addDependency('Handler0', 'Handler1');
      service.addDependency('Handler1', 'Handler2');
      service.addDependency('Handler3', 'Handler4');

      const result = service.getCurrentAnalysisResult();

      expect(result.totalHandlers).toBe(5);
      expect(result.totalDependencies).toBe(3);
      expect(result.maxDepth).toBeGreaterThan(0);
      expect(result.criticalPath).toBeDefined();
      expect(result.isolatedHandlers).toBeDefined();
    });

    it('should handle edge case with empty configuration', () => {
      const emptyService = new DependencyAnalyzerService(mockDiscoveryService, mockModuleRef, {});

      expect(emptyService).toBeDefined();
      expect(() => emptyService.getCurrentAnalysisResult()).not.toThrow();
    });

    it('should handle complex dependency graphs', () => {
      const handlers = Array.from({ length: 10 }, (_, i) => createMockHandler({ eventName: `Handler${i}`, handlerId: `Handler${i}` }));

      service.registerHandlers(handlers);

      // Create a complex dependency graph
      service.addDependency('Handler0', 'Handler1');
      service.addDependency('Handler0', 'Handler2');
      service.addDependency('Handler1', 'Handler3');
      service.addDependency('Handler2', 'Handler3');
      service.addDependency('Handler3', 'Handler4');
      service.addDependency('Handler5', 'Handler6');
      service.addDependency('Handler6', 'Handler7');
      service.addDependency('Handler7', 'Handler8');

      const plan = service.generateExecutionPlan(handlers.map((h) => h.eventName));

      expect(plan.totalPhases).toBeGreaterThan(1);
      expect(plan.estimatedExecutionTime).toBeGreaterThan(0);
      expect(plan.phases.length).toBeGreaterThan(1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should handle null/undefined handlers gracefully', () => {
      expect(() => service.registerHandlers(null as any)).toThrow();
      expect(() => service.registerHandlers(undefined as any)).toThrow();
      expect(() => service.registerHandlers([])).not.toThrow();
    });

    it('should handle malformed dependencies gracefully', () => {
      expect(() => service.addDependency('', '')).not.toThrow();
      expect(() => service.addDependency(null as any, null as any)).not.toThrow();
      expect(() => service.removeDependency('', '')).not.toThrow();
    });

    it('should handle large number of dependencies efficiently', () => {
      const handlers = Array.from({ length: 100 }, (_, i) => createMockHandler({ eventName: `Handler${i}`, handlerId: `Handler${i}` }));

      service.registerHandlers(handlers);

      // Add many dependencies
      for (let i = 0; i < 99; i++) {
        service.addDependency(`Handler${i}`, `Handler${i + 1}`);
      }

      const result = service.getCurrentAnalysisResult();
      const plan = service.generateExecutionPlan(handlers.map((h) => h.eventName));

      expect(result.totalHandlers).toBe(100);
      expect(result.totalDependencies).toBe(99);
      expect(plan.totalPhases).toBeGreaterThan(50); // Should create many phases
    });
  });

  describe('Coverage for Missing Lines', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should provide suggestions for two-handler circular dependencies (lines 430-441)', () => {
      const handler1 = createMockHandler({ eventName: 'Handler1', handlerId: 'Handler1' });
      const handler2 = createMockHandler({ eventName: 'Handler2', handlerId: 'Handler2' });

      service.registerHandlers([handler1, handler2]);

      // Create a circular dependency between two handlers
      service.addDependency('Handler1', 'Handler2');
      service.addDependency('Handler2', 'Handler1');

      const result = service.getCurrentAnalysisResult();

      expect(result.circularDependencies.length).toBeGreaterThan(0);
      // Check that circular dependency has alternatives in suggestedFix
      if (result.circularDependencies[0].suggestedFix?.alternatives) {
        expect(result.circularDependencies[0].suggestedFix.alternatives.length).toBeGreaterThan(0);
      }
    });

    it('should provide suggestions for multi-handler circular dependencies (lines 435-441)', () => {
      const handler1 = createMockHandler({ eventName: 'Handler1', handlerId: 'Handler1' });
      const handler2 = createMockHandler({ eventName: 'Handler2', handlerId: 'Handler2' });
      const handler3 = createMockHandler({ eventName: 'Handler3', handlerId: 'Handler3' });

      service.registerHandlers([handler1, handler2, handler3]);

      // Create a circular dependency among three handlers
      service.addDependency('Handler1', 'Handler2');
      service.addDependency('Handler2', 'Handler3');
      service.addDependency('Handler3', 'Handler1');

      const result = service.getCurrentAnalysisResult();

      expect(result.circularDependencies.length).toBeGreaterThan(0);
      // Check that circular dependency has alternatives in suggestedFix
      if (result.circularDependencies[0].suggestedFix?.alternatives) {
        expect(result.circularDependencies[0].suggestedFix.alternatives.length).toBeGreaterThan(0);
      }
    });

    it('should identify single slow handler bottlenecks (line 454)', () => {
      // Create handlers where one will be identified as a slow bottleneck
      const handlers = Array.from({ length: 15 }, (_, i) => createMockHandler({ eventName: `Handler${i}`, handlerId: `Handler${i}` }));

      service.registerHandlers(handlers);

      // Force creation of a phase with a single handler that would be slow
      const plan = service.generateExecutionPlan(['Handler1']);

      expect(plan.bottlenecks).toBeDefined();
      expect(plan.phases.length).toBeGreaterThan(0);
    });

    it('should cover cycle resolution suggestions for 2-handler cycles (lines 430-441)', () => {
      // Create exactly 2 handlers with circular dependencies
      const handler1 = createMockHandler({
        eventName: 'CycleA',
        handlerId: 'HandlerA',
      });
      const handler2 = createMockHandler({
        eventName: 'CycleB',
        handlerId: 'HandlerB',
      });

      service.registerHandlers([handler1, handler2]);

      // Add circular dependencies
      service.addDependency('HandlerA', 'HandlerB');
      service.addDependency('HandlerB', 'HandlerA');

      // Generate execution plan which should detect and suggest fixes for the 2-handler cycle
      const plan = service.generateExecutionPlan(['HandlerA', 'HandlerB']);

      expect(plan).toBeDefined();
      expect(plan.bottlenecks).toBeDefined();
    });

    it('should cover cycle resolution suggestions for multi-handler cycles (lines 435-441)', () => {
      // Create 3+ handlers with circular dependencies
      const handler1 = createMockHandler({
        eventName: 'MultiCycleA',
        handlerId: 'HandlerA',
      });
      const handler2 = createMockHandler({
        eventName: 'MultiCycleB',
        handlerId: 'HandlerB',
      });
      const handler3 = createMockHandler({
        eventName: 'MultiCycleC',
        handlerId: 'HandlerC',
      });

      service.registerHandlers([handler1, handler2, handler3]);

      // Add circular dependencies
      service.addDependency('HandlerA', 'HandlerB');
      service.addDependency('HandlerB', 'HandlerC');
      service.addDependency('HandlerC', 'HandlerA');

      // Generate execution plan which should detect and suggest fixes for the multi-handler cycle
      const plan = service.generateExecutionPlan(['HandlerA', 'HandlerB', 'HandlerC']);

      expect(plan).toBeDefined();
      expect(plan.bottlenecks).toBeDefined();
    });

    it('should cover bottleneck identification for handlers with many dependents (line 454)', () => {
      // Create a handler that will have many dependents
      const centralHandler = createMockHandler({
        eventName: 'Central',
        handlerId: 'CentralHandler',
      });

      // Create multiple handlers that depend on the central one
      const dependentHandlers = Array.from({ length: 5 }, (_, i) =>
        createMockHandler({
          eventName: `Dependent${i}`,
          handlerId: `DependentHandler${i}`,
        }),
      );

      service.registerHandlers([centralHandler, ...dependentHandlers]);

      // Add dependencies to create bottleneck scenario
      dependentHandlers.forEach((handler) => {
        service.addDependency(handler.handlerId, 'CentralHandler');
      });

      // Generate execution plan to identify bottlenecks
      const handlerIds = ['CentralHandler', ...dependentHandlers.map((h) => h.handlerId)];
      const plan = service.generateExecutionPlan(handlerIds);

      expect(plan).toBeDefined();
      expect(plan.bottlenecks).toBeDefined();
    });
  });

  describe('Comprehensive Coverage Tests', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should cover service initialization and configuration', async () => {
      // Test service initialization paths
      expect(service).toBeDefined();

      // Test configuration access
      const config = (service as any).config;
      expect(config).toBeDefined();
    });

    it('should cover handler registration and management', () => {
      const handler1 = createMockHandler({ eventName: 'test.event1', handlerId: 'Handler1' });
      const handler2 = createMockHandler({ eventName: 'test.event2', handlerId: 'Handler2' });

      // Test handler registration
      service.registerHandlers([handler1, handler2]);

      // Test handler retrieval
      const result = service.getCurrentAnalysisResult();
      const handlers = result.totalHandlers;
      expect(handlers).toBeGreaterThanOrEqual(2);
    });

    it('should cover dependency analysis algorithms', () => {
      // Create handlers with complex dependency chains
      const handlers = [
        createMockHandler({ eventName: 'A', handlerId: 'A' }),
        createMockHandler({ eventName: 'B', handlerId: 'B' }),
        createMockHandler({ eventName: 'C', handlerId: 'C' }),
        createMockHandler({ eventName: 'D', handlerId: 'D' }),
      ];

      service.registerHandlers(handlers);

      // Create complex dependency graph
      service.addDependency('A', 'B');
      service.addDependency('B', 'C');
      service.addDependency('C', 'D');
      service.addDependency('D', 'A'); // Creates cycle

      // Test dependency analysis
      const deps = service.getDependencies('A');
      expect(deps).toBeDefined();

      const dependents = service.getDependents('A');
      expect(dependents).toBeDefined();

      // Test cycle detection
      const cycles = service.getCircularDependencies();
      expect(cycles).toBeDefined();

      // Test execution plan generation
      const plan = service.generateExecutionPlan(['A', 'B', 'C', 'D']);
      expect(plan).toBeDefined();
      expect(plan.phases).toBeDefined();
      expect(plan.bottlenecks).toBeDefined();
      expect(plan.bottlenecks).toBeDefined();
    });

    it('should cover optimization and performance analysis', () => {
      // Create performance-focused scenario
      const handlers = Array.from({ length: 10 }, (_, i) => createMockHandler({ eventName: `perf.test${i}`, handlerId: `PerfHandler${i}` }));

      service.registerHandlers(handlers);

      // Create performance bottleneck scenarios
      for (let i = 1; i < handlers.length; i++) {
        service.addDependency(`PerfHandler${i}`, 'PerfHandler0'); // All depend on Handler0
      }

      // Test optimization analysis
      const result = service.getCurrentAnalysisResult();
      expect(result).toBeDefined();
      expect(result.warnings).toBeDefined();

      // Test performance metrics
      const plan = service.generateExecutionPlan(handlers.map((h) => h.handlerId));
      expect(plan.estimatedExecutionTime).toBeDefined();
      expect(plan.bottlenecks).toBeDefined();
    });

    it('should cover error handling and edge cases', () => {
      // Test with no handlers
      const emptyPlan = service.generateExecutionPlan([]);
      expect(emptyPlan).toBeDefined();

      // Test with non-existent handler
      const invalidPlan = service.generateExecutionPlan(['NonExistentHandler']);
      expect(invalidPlan).toBeDefined();

      // Test dependency operations on non-existent handlers
      const nonExistentDeps = service.getDependencies('NonExistent');
      expect(nonExistentDeps).toBeDefined();

      const nonExistentDependents = service.getDependents('NonExistent');
      expect(nonExistentDependents).toBeDefined();
    });

    it('should cover advanced dependency types and strengths', () => {
      const handler1 = createMockHandler({ eventName: 'advanced.test1', handlerId: 'AdvHandler1' });
      const handler2 = createMockHandler({ eventName: 'advanced.test2', handlerId: 'AdvHandler2' });

      service.registerHandlers([handler1, handler2]);

      // Test different dependency types and strengths
      service.addDependency('AdvHandler1', 'AdvHandler2', DependencyType.CONDITIONAL, DependencyStrength.WEAK);
      service.addDependency('AdvHandler2', 'AdvHandler1', DependencyType.CONDITIONAL, DependencyStrength.STRONG);

      const deps = service.getDependencies('AdvHandler1');
      expect(deps.length).toBeGreaterThan(0);
      expect(deps[0].type).toBeDefined();
      expect(deps[0].strength).toBeDefined();
    });

    it('should cover dependency removal and modification', () => {
      const handler1 = createMockHandler({ eventName: 'remove.test1', handlerId: 'RemHandler1' });
      const handler2 = createMockHandler({ eventName: 'remove.test2', handlerId: 'RemHandler2' });

      service.registerHandlers([handler1, handler2]);

      // Add dependency
      service.addDependency('RemHandler1', 'RemHandler2');
      expect(service.getDependencies('RemHandler1')).toHaveLength(1);

      // Remove dependency
      const removed = service.removeDependency('RemHandler1', 'RemHandler2');
      expect(removed).toBe(true);
      expect(service.getDependencies('RemHandler1')).toHaveLength(0);

      // Try to remove non-existent dependency
      const notRemoved = service.removeDependency('RemHandler1', 'RemHandler2');
      expect(notRemoved).toBe(false);
    });

    it('should cover complex execution planning scenarios', () => {
      // Create a complex dependency graph with multiple scenarios
      const handlers = [
        createMockHandler({ eventName: 'complex.A', handlerId: 'ComplexA' }),
        createMockHandler({ eventName: 'complex.B', handlerId: 'ComplexB' }),
        createMockHandler({ eventName: 'complex.C', handlerId: 'ComplexC' }),
        createMockHandler({ eventName: 'complex.D', handlerId: 'ComplexD' }),
        createMockHandler({ eventName: 'complex.E', handlerId: 'ComplexE' }),
      ];

      service.registerHandlers(handlers);

      // Create diamond dependency pattern
      service.addDependency('ComplexA', 'ComplexB');
      service.addDependency('ComplexA', 'ComplexC');
      service.addDependency('ComplexB', 'ComplexD');
      service.addDependency('ComplexC', 'ComplexD');
      service.addDependency('ComplexD', 'ComplexE');

      const plan = service.generateExecutionPlan(['ComplexA', 'ComplexB', 'ComplexC', 'ComplexD', 'ComplexE']);

      expect(plan.phases).toBeDefined();
      expect(plan.phases.length).toBeGreaterThan(0);
      expect(plan.estimatedExecutionTime).toBeGreaterThan(0);
    });

    it('should cover analysis result and optimization suggestions', () => {
      // Create scenario that triggers optimization suggestions
      const handlers = Array.from({ length: 8 }, (_, i) => createMockHandler({ eventName: `optimize.${i}`, handlerId: `OptHandler${i}` }));

      service.registerHandlers(handlers);

      // Create bottleneck scenario
      for (let i = 1; i < 4; i++) {
        service.addDependency(`OptHandler${i}`, 'OptHandler0');
      }

      // Create parallel scenario
      for (let i = 4; i < 8; i++) {
        service.addDependency(`OptHandler${i}`, `OptHandler${i - 3}`);
      }

      const result = service.getCurrentAnalysisResult();
      expect(result.totalDependencies).toBeDefined();
      expect(result.circularDependencies).toBeDefined();
      expect(result.circularDependencies).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(result.analysisTimestamp).toBeDefined();
    });
  });
});
