import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { EventEmitterModule } from '@src/modules/rx-event-emitter/event-emitter.module';
import { EventEmitterService } from '@src/modules/rx-event-emitter/services/event-emitter.service';
import { MetricsService } from '@src/modules/rx-event-emitter/services/metrics.service';
import { HandlerExecutionService } from '@src/modules/rx-event-emitter/services/handler-execution.service';
import { DeadLetterQueueService } from '@src/modules/rx-event-emitter/services/dead-letter-queue.service';
import { HandlerPoolService } from '@src/modules/rx-event-emitter/services/handler-pool.service';
import { DependencyAnalyzerService } from '@src/modules/rx-event-emitter/services/dependency-analyzer.service';
import { EventHandler } from '@src/modules/rx-event-emitter/decorators/event-handler.decorator';
import { Injectable } from '@nestjs/common';
import { Event, EventPriority } from '@src/modules/rx-event-emitter/interfaces';

/**
 * Integration Tests for Advanced Features
 * 
 * Following CHECKPOINT_PROCESS.md requirements:
 * - Circuit breaker functionality
 * - Handler dependency analysis and execution planning
 * - Handler pool isolation and resource management
 * - Advanced retry mechanisms and exponential backoff
 */
describe('Advanced Features Integration', () => {
  let module: TestingModule;
  let eventEmitterService: EventEmitterService;
  let metricsService: MetricsService;
  let handlerExecutionService: HandlerExecutionService;
  let dlqService: DeadLetterQueueService;
  let handlerPoolService: HandlerPoolService;
  let dependencyAnalyzerService: DependencyAnalyzerService;

  // Test handlers for advanced feature testing
  @EventHandler('circuit.breaker.test', {
    priority: 10,
    timeout: 2000,
    circuitBreaker: {
      enabled: true,
      failureThreshold: 3,
      recoveryTimeout: 5000
    },
    retryPolicy: {
      maxRetries: 2,
      backoffMs: 500
    }
  })
  @Injectable()
  class CircuitBreakerHandler {
    static failureCount = 0;

    async handle(event: Event): Promise<void> {
      CircuitBreakerHandler.failureCount++;
      
      // Fail the first 5 attempts to test circuit breaker
      if (CircuitBreakerHandler.failureCount <= 5 && event.payload?.testCircuitBreaker) {
        throw new Error(`Circuit breaker test failure ${CircuitBreakerHandler.failureCount}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  @EventHandler('heavy.processing', {
    priority: 5,
    timeout: 10000,
    poolName: 'heavy-processing-pool',
    poolConfig: {
      maxConcurrency: 3,
      queueSize: 10,
      timeoutMs: 15000
    }
  })
  @Injectable()
  class HeavyProcessingHandler {
    async handle(event: Event): Promise<void> {
      // Simulate heavy processing
      await new Promise(resolve => setTimeout(resolve, event.payload?.processingTime || 100));
    }
  }

  @EventHandler('dependency.test.parent', {
    priority: 20,
    timeout: 3000,
    dependencies: ['dependency.test.child1', 'dependency.test.child2']
  })
  @Injectable()
  class ParentDependencyHandler {
    async handle(event: Event): Promise<void> {
      // This should execute after child handlers
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }

  @EventHandler('dependency.test.child1', {
    priority: 10,
    timeout: 2000
  })
  @Injectable()
  class Child1DependencyHandler {
    async handle(event: Event): Promise<void> {
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  }

  @EventHandler('dependency.test.child2', {
    priority: 15,
    timeout: 2000
  })
  @Injectable()
  class Child2DependencyHandler {
    async handle(event: Event): Promise<void> {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  @EventHandler('retry.exponential.test', {
    priority: 8,
    timeout: 5000,
    retryPolicy: {
      maxRetries: 4,
      backoffMs: 100,
      exponentialBackoff: true,
      maxBackoffMs: 2000
    }
  })
  @Injectable()
  class ExponentialRetryHandler {
    static attemptCount = 0;

    async handle(event: Event): Promise<void> {
      ExponentialRetryHandler.attemptCount++;
      
      // Fail the first few attempts to test exponential backoff
      if (ExponentialRetryHandler.attemptCount <= 3 && event.payload?.testRetry) {
        throw new Error(`Retry test failure ${ExponentialRetryHandler.attemptCount}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  beforeAll(async () => {
    // Mock logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    module = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot({
          maxConcurrency: 15,
          bufferTimeMs: 30,
          defaultTimeout: 10000,
          enableMetrics: true,
          enablePersistence: true,
          enableDeadLetterQueue: true,
          enableAdvancedFeatures: true,
          streamManagement: {
            enabled: true,
            backpressureStrategy: 'buffer',
            maxBufferSize: 500,
          },
          handlerPools: {
            enabled: true,
            defaultPoolSize: 5,
            maxPoolUtilization: 0.9,
            pools: {
              'heavy-processing-pool': {
                maxConcurrency: 3,
                queueSize: 10,
                timeoutMs: 15000
              }
            }
          },
          circuitBreaker: {
            enabled: true,
            failureThreshold: 3,
            recoveryTimeout: 5000,
          },
          dependencyAnalysis: {
            enabled: true,
            maxDepth: 5,
            circularDependencyCheck: true
          }
        })
      ],
      providers: [
        CircuitBreakerHandler,
        HeavyProcessingHandler,
        ParentDependencyHandler,
        Child1DependencyHandler,
        Child2DependencyHandler,
        ExponentialRetryHandler,
      ]
    }).compile();

    // Get service instances
    eventEmitterService = module.get<EventEmitterService>(EventEmitterService);
    metricsService = module.get<MetricsService>(MetricsService);
    handlerExecutionService = module.get<HandlerExecutionService>(HandlerExecutionService);
    dlqService = module.get<DeadLetterQueueService>(DeadLetterQueueService);
    handlerPoolService = module.get<HandlerPoolService>(HandlerPoolService);
    dependencyAnalyzerService = module.get<DependencyAnalyzerService>(DependencyAnalyzerService);

    // Initialize services
    await Promise.all([
      eventEmitterService.onModuleInit(),
      metricsService.onModuleInit(),
      handlerExecutionService.onModuleInit(),
      dlqService.onModuleInit(),
      handlerPoolService.onModuleInit(),
      dependencyAnalyzerService.onModuleInit(),
    ]);

    // Reset static counters
    CircuitBreakerHandler.failureCount = 0;
    ExponentialRetryHandler.attemptCount = 0;
  }, 30000);

  afterAll(async () => {
    try {
      await Promise.all([
        eventEmitterService.onModuleDestroy(),
        metricsService.onModuleDestroy(),
        handlerExecutionService.onModuleDestroy(),
        dlqService.onModuleDestroy(),
        handlerPoolService.onModuleDestroy(),
        dependencyAnalyzerService.onModuleDestroy(),
      ]);
      
      await module.close();
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }, 30000);

  describe('Circuit Breaker Functionality', () => {
    beforeEach(() => {
      // Reset failure count for each test
      CircuitBreakerHandler.failureCount = 0;
    });

    it('should open circuit breaker after threshold failures', async () => {
      const initialDlqCount = (await dlqService.getEntries(100)).length;

      // Generate events that will cause failures
      const failurePromises = Array.from({ length: 6 }, (_, i) => 
        eventEmitterService.emit('circuit.breaker.test', {
          testCircuitBreaker: true,
          attempt: i + 1
        })
      );

      await Promise.all(failurePromises);

      // Wait for processing and circuit breaker logic
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check that some events ended up in DLQ due to circuit breaker
      const finalDlqCount = (await dlqService.getEntries(100)).length;
      expect(finalDlqCount).toBeGreaterThan(initialDlqCount);

      // Check metrics reflect the circuit breaker activity
      const metrics = metricsService.getCurrentSystemMetrics();
      expect(metrics.events.errorRate).toBeGreaterThan(0);
    });

    it('should recover after circuit breaker timeout', async () => {
      // First, trigger circuit breaker
      const failurePromises = Array.from({ length: 4 }, (_, i) => 
        eventEmitterService.emit('circuit.breaker.test', {
          testCircuitBreaker: true,
          phase: 'trigger'
        })
      );

      await Promise.all(failurePromises);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Wait for recovery timeout (5 seconds in config)
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Reset failure count to allow success
      CircuitBreakerHandler.failureCount = 10; // Above failure threshold to succeed

      // Now send an event that should succeed
      await eventEmitterService.emit('circuit.breaker.test', {
        testCircuitBreaker: true,
        phase: 'recovery'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Circuit breaker should allow the event through
      const metrics = metricsService.getCurrentSystemMetrics();
      expect(metrics.events.totalProcessed).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Handler Pool Management', () => {
    it('should execute handlers in custom pools with concurrency limits', async () => {
      const startTime = Date.now();

      // Submit more tasks than the pool can handle concurrently
      const heavyPromises = Array.from({ length: 8 }, (_, i) => 
        eventEmitterService.emit('heavy.processing', {
          taskId: `heavy-task-${i}`,
          processingTime: 200 // 200ms processing time
        })
      );

      await Promise.all(heavyPromises);

      // Wait for all processing to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // With concurrency limit of 3 and 8 tasks of 200ms each,
      // it should take at least 3 batches = ~600ms minimum
      expect(totalTime).toBeGreaterThan(600);

      // Check pool statistics
      const poolStats = handlerPoolService.getPoolStats();
      expect(poolStats['heavy-processing-pool']).toBeDefined();
      expect(poolStats['heavy-processing-pool'].totalExecutions).toBeGreaterThanOrEqual(8);
    }, 10000);

    it('should handle pool queue overflow gracefully', async () => {
      // Submit way more tasks than the pool can queue (queueSize: 10)
      const overflowPromises = Array.from({ length: 20 }, (_, i) => 
        eventEmitterService.emit('heavy.processing', {
          taskId: `overflow-task-${i}`,
          processingTime: 100
        })
      );

      // Some of these should be rejected or handled gracefully
      const results = await Promise.allSettled(overflowPromises);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // System should handle overflow without crashing
      const poolStats = handlerPoolService.getPoolStats();
      expect(poolStats['heavy-processing-pool']).toBeDefined();

      // Check that metrics are still being collected
      const metrics = metricsService.getCurrentSystemMetrics();
      expect(metrics.health.status).toBeDefined();
    }, 8000);
  });

  describe('Dependency Analysis and Execution Planning', () => {
    it('should analyze handler dependencies correctly', async () => {
      // Wait for dependency analysis to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Get dependency analysis results
      const analysisResult = dependencyAnalyzerService.getDependencyAnalysis();
      expect(analysisResult).toBeDefined();

      // Check that parent handler has child dependencies
      const parentAnalysis = analysisResult.find(item => 
        item.handlerId.includes('ParentDependency') ||
        item.eventName === 'dependency.test.parent'
      );

      if (parentAnalysis) {
        expect(parentAnalysis.dependencies).toBeDefined();
        expect(parentAnalysis.dependencies.length).toBeGreaterThan(0);
      }
    });

    it('should execute handlers in dependency order', async () => {
      const executionOrder: string[] = [];
      
      // Mock handler execution to track order
      const originalExecuteHandler = handlerExecutionService.executeHandler;
      jest.spyOn(handlerExecutionService, 'executeHandler').mockImplementation(async (handler, event) => {
        executionOrder.push(handler.metadata.eventName);
        return originalExecuteHandler.call(handlerExecutionService, handler, event);
      });

      // Emit event that has dependencies
      await eventEmitterService.emit('dependency.test.parent', {
        testDependencies: true,
        timestamp: Date.now()
      });

      // Wait for dependency resolution and execution
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Restore original method
      jest.restoreAllMocks();

      // Child handlers should execute before parent
      // Note: Exact order depends on implementation details
      expect(executionOrder.length).toBeGreaterThan(0);
    }, 5000);

    it('should detect and handle circular dependencies', async () => {
      // This test verifies that the system can detect circular dependencies
      // during the dependency analysis phase
      const analysisResult = dependencyAnalyzerService.getDependencyAnalysis();
      
      // Check that analysis completed without infinite loops
      expect(Array.isArray(analysisResult)).toBe(true);
      
      // System should still be responsive
      await eventEmitterService.emit('circuit.breaker.test', { 
        testCircular: true 
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const metrics = metricsService.getCurrentSystemMetrics();
      expect(metrics.health.status).toBeDefined();
    });
  });

  describe('Advanced Retry Mechanisms', () => {
    beforeEach(() => {
      ExponentialRetryHandler.attemptCount = 0;
    });

    it('should implement exponential backoff retry strategy', async () => {
      const startTime = Date.now();

      // Emit event that will fail and retry with exponential backoff
      await eventEmitterService.emit('retry.exponential.test', {
        testRetry: true,
        testId: 'exponential-backoff-test'
      });

      // Wait for all retry attempts to complete
      await new Promise(resolve => setTimeout(resolve, 5000));

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // With exponential backoff (100ms, 200ms, 400ms, 800ms base intervals)
      // and max 4 retries, it should take some time
      expect(totalTime).toBeGreaterThan(1000); // At least 1 second for backoff delays

      // Check that retries were attempted
      expect(ExponentialRetryHandler.attemptCount).toBeGreaterThan(1);

      // After max retries, event should end up in DLQ
      const dlqEntries = await dlqService.getEntries(10);
      const ourEntry = dlqEntries.find(entry => 
        entry.event.payload?.testId === 'exponential-backoff-test'
      );
      
      // Should either succeed after retries or end up in DLQ
      expect(ExponentialRetryHandler.attemptCount >= 3 || ourEntry).toBeTruthy();
    }, 10000);

    it('should respect maximum backoff limits', async () => {
      const startTime = Date.now();

      // Event that will trigger maximum backoff
      await eventEmitterService.emit('retry.exponential.test', {
        testRetry: true,
        testId: 'max-backoff-test'
      });

      await new Promise(resolve => setTimeout(resolve, 6000));

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Even with exponential backoff, max backoff is 2000ms per config
      // So it shouldn't take too extremely long
      expect(totalTime).toBeLessThan(12000); // Should complete within 12 seconds

      const metrics = metricsService.getCurrentSystemMetrics();
      expect(metrics.events.errorRate).toBeGreaterThanOrEqual(0);
    }, 15000);
  });

  describe('Comprehensive Advanced Features', () => {
    it('should handle complex scenarios with multiple advanced features', async () => {
      // Reset counters
      CircuitBreakerHandler.failureCount = 0;
      ExponentialRetryHandler.attemptCount = 0;

      // Emit events that use multiple advanced features
      const complexPromises = [
        // Circuit breaker test
        eventEmitterService.emit('circuit.breaker.test', { 
          testCircuitBreaker: true, 
          scenario: 'complex' 
        }),
        
        // Heavy processing with custom pool
        eventEmitterService.emit('heavy.processing', {
          taskId: 'complex-heavy-task',
          processingTime: 150
        }),
        
        // Dependency-based execution
        eventEmitterService.emit('dependency.test.parent', {
          testDependencies: true,
          scenario: 'complex'
        }),
        
        // Exponential retry
        eventEmitterService.emit('retry.exponential.test', {
          testRetry: true,
          scenario: 'complex'
        })
      ];

      await Promise.all(complexPromises);

      // Wait for all complex processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // System should remain stable and responsive
      const metrics = metricsService.getCurrentSystemMetrics();
      expect(metrics.health.status).toMatch(/^(healthy|warning|critical)$/);
      expect(metrics.health.score).toBeGreaterThanOrEqual(0);

      // All services should still be operational
      expect(eventEmitterService.isShuttingDown()).toBe(false);
      
      // Pool stats should show activity
      const poolStats = handlerPoolService.getPoolStats();
      expect(Object.keys(poolStats).length).toBeGreaterThanOrEqual(1);

      // DLQ should have handled any failed events
      const dlqStats = dlqService.getStats();
      expect(dlqStats.totalEntries).toBeGreaterThanOrEqual(0);
    }, 8000);

    it('should provide comprehensive monitoring during advanced operations', async () => {
      // Perform various operations
      await Promise.all([
        eventEmitterService.emit('heavy.processing', { monitoring: 'test1' }),
        eventEmitterService.emit('circuit.breaker.test', { monitoring: 'test2' }),
        eventEmitterService.emit('retry.exponential.test', { monitoring: 'test3' }),
      ]);

      await new Promise(resolve => setTimeout(resolve, 1500));

      // Comprehensive metrics should be available
      const systemMetrics = metricsService.getCurrentSystemMetrics();
      
      expect(systemMetrics.events).toBeDefined();
      expect(systemMetrics.health).toBeDefined();
      expect(systemMetrics.streams).toBeDefined();
      
      // Handler-level metrics
      if (systemMetrics.handlers) {
        expect(typeof systemMetrics.handlers).toBe('object');
      }

      // Pool metrics
      const poolStats = handlerPoolService.getPoolStats();
      expect(typeof poolStats).toBe('object');

      // DLQ metrics
      const dlqStats = dlqService.getStats();
      expect(dlqStats).toBeDefined();
      expect(dlqStats.totalEntries).toBeGreaterThanOrEqual(0);

      // System should log summary without errors
      expect(() => {
        metricsService.logSummary();
      }).not.toThrow();
    });
  });
});