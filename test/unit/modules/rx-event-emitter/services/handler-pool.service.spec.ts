import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { HandlerPoolService } from '@src/index';
import { CircuitBreakerState } from '@src/modules/rx-event-emitter/interfaces';
import { IsolationStrategy } from '@src/modules/rx-event-emitter/interfaces/core.interfaces';

describe('HandlerPoolService', () => {
  let service: HandlerPoolService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [HandlerPoolService],
    }).compile();

    service = moduleRef.get(HandlerPoolService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  }, 45000);

  describe('Pool lifecycle', () => {
    it('should create and retrieve a pool', () => {
      const pool = service.getOrCreatePool('test', { maxConcurrency: 2 });
      expect(pool.config.name).toBe('test');

      const retrieved = service.getPool('test');
      expect(retrieved).toBe(pool);
    });

    it('should remove a pool', async () => {
      service.getOrCreatePool('toRemove');
      const removed = await service.removePool('toRemove');

      expect(removed).toBe(true);
      expect(service.getPool('toRemove')).toBeUndefined();
    });

    it('should return false when removing non-existing pool', async () => {
      const removed = await service.removePool('does-not-exist');
      expect(removed).toBe(false);
    });
  });

  describe('Task execution', () => {
    it('should execute a task successfully', async () => {
      const result = await service.executeInPool('execPool', async () => 42);
      expect(result).toBe(42);
    });

    it('should queue tasks when concurrency limit is reached', async () => {
      const pool = service.getOrCreatePool('queuePool', { maxConcurrency: 1, queueSize: 2 });

      const task1 = pool.execute(() => new Promise((res) => setTimeout(() => res('task1'), 50)));
      const task2 = pool.execute(() => Promise.resolve('task2'));
      const task3 = pool.execute(() => Promise.resolve('task3'));

      await expect(task1).resolves.toBe('task1');
      await expect(task2).resolves.toBe('task2');
      await expect(task3).resolves.toBe('task3');
    }, 45000);

    it('should drop tasks if queue is full', async () => {
      const pool = service.getOrCreatePool('dropPool', { maxConcurrency: 1, queueSize: 0 });

      // Start a task that will block the pool
      const blockingPromise = pool.execute(() => new Promise((res) => setTimeout(() => res('done'), 30)));

      // Try to add another task - should fail because queue is full
      await expect(pool.execute(() => Promise.resolve('fail'))).rejects.toThrow(/is at capacity and queue is full/);

      // Wait for the blocking task to complete
      await blockingPromise;
    }, 45000);

    it('should timeout tasks exceeding configured timeout', async () => {
      const pool = service.getOrCreatePool('timeoutPool', { maxConcurrency: 1, timeoutMs: 10 });

      await expect(pool.execute(() => new Promise((res) => setTimeout(() => res('late'), 50)))).rejects.toThrow(/Task timeout/);
    }, 45000);
  });

  describe('Circuit breaker', () => {
    it('should open circuit breaker after repeated failures', async () => {
      const pool = service.getOrCreatePool('cbPool', {
        maxConcurrency: 1,
        timeoutMs: 5,
        queueSize: 1,
      });

      // Create enough failures to trigger circuit breaker (5+ requests with 50% failure rate)
      // First, let's do some successful requests to reach the minimum threshold
      await expect(pool.execute(() => Promise.resolve('success1'))).resolves.toBe('success1');
      await expect(pool.execute(() => Promise.resolve('success2'))).resolves.toBe('success2');

      // Now cause failures to reach 50% failure rate
      await expect(pool.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      await expect(pool.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      await expect(pool.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');

      // At this point we have 5 total requests with 3 failures (60% failure rate)

      expect(pool.metrics.circuitBreaker.state).toBe(CircuitBreakerState.OPEN);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const pool = service.getOrCreatePool('halfOpenPool', { timeoutMs: 5 });
      (pool as any).circuitBreaker.state = CircuitBreakerState.OPEN;
      (pool as any).circuitBreaker.nextAttemptTime = Date.now() - 1;

      await expect(pool.execute(() => Promise.resolve('recovery'))).resolves.toBe('recovery');
      expect(pool.metrics.circuitBreaker.state).not.toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('Metrics and health', () => {
    it('should report metrics with pools', async () => {
      service.getOrCreatePool('metricsPool', { maxConcurrency: 2 });
      const metrics = service.getCurrentMetrics();

      expect(metrics.totalPools).toBeGreaterThan(0);
      expect(metrics.poolMetrics.size).toBeGreaterThan(0);
    });

    it('should categorize resource usage', async () => {
      const pool = service.getOrCreatePool('resPool', { maxConcurrency: 1 });
      await pool.execute(() => Promise.resolve('ok'));

      const metrics = service.getCurrentMetrics();
      expect(metrics.resourceUsage).toHaveProperty('memoryUsage');
      expect(metrics.resourceUsage.pressure).toHaveProperty('memory');
    });

    it('should calculate isolation metrics', () => {
      service.getOrCreatePool('isoPool', { isolation: IsolationStrategy.ISOLATED });
      const metrics = service.getCurrentMetrics();

      expect(metrics.isolation).toHaveProperty('interferenceScore');
      expect(metrics.isolation).toHaveProperty('faultContainment');
    });

    it('should return pool health states', () => {
      service.getOrCreatePool('healthPool');
      const health = service.getPoolHealth();

      expect(health).toHaveProperty('healthPool');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health['healthPool']);
    });
  });

  describe('Coverage for Specific Uncovered Lines', () => {
    it('should throw error when circuit breaker is OPEN and within timeout window (line 77)', async () => {
      const pool = service.getOrCreatePool('cbOpenPool', { maxConcurrency: 1 });
      
      // Manually set circuit breaker to OPEN with future nextAttemptTime
      (pool as any).circuitBreaker.state = CircuitBreakerState.OPEN;
      (pool as any).circuitBreaker.nextAttemptTime = Date.now() + 10000; // 10 seconds in future

      // Should throw error because circuit breaker is OPEN and still within timeout
      await expect(pool.execute(() => Promise.resolve('test'))).rejects.toThrow('Circuit breaker is OPEN for pool cbOpenPool');
    });

    it('should trigger execution time array shift when max length exceeded (line 158)', async () => {
      const pool = service.getOrCreatePool('timeTrackPool', { maxConcurrency: 1 });
      
      // Set maxExecutionTimes to 2 to trigger shift
      (pool as any).maxExecutionTimes = 2;

      // Execute multiple tasks to fill up and exceed the execution times array
      await pool.execute(() => Promise.resolve('task1'));
      await pool.execute(() => Promise.resolve('task2'));
      await pool.execute(() => Promise.resolve('task3')); // This should trigger shift

      // Verify executionTimes array has been managed correctly
      expect((pool as any).executionTimes.length).toBeLessThanOrEqual(2);
    });

    it('should return unhealthy status when circuit breaker is OPEN (line 212)', () => {
      const pool = service.getOrCreatePool('unhealthyPool', { maxConcurrency: 1 });
      
      // Set circuit breaker to OPEN
      (pool as any).circuitBreaker.state = CircuitBreakerState.OPEN;

      const health = service.getPoolHealth();
      expect(health['unhealthyPool']).toBe('unhealthy');
    });

    it('should return degraded status when utilization is high (line 216)', async () => {
      const pool = service.getOrCreatePool('degradedPool', { maxConcurrency: 1, queueSize: 1 });
      
      // Create a long-running task to max out utilization
      const longTask = pool.execute(() => new Promise((resolve) => setTimeout(() => resolve('done'), 100)));
      
      // Queue another task to increase queue utilization
      const queuedTask = pool.execute(() => Promise.resolve('queued'));

      // Check health while pool is highly utilized
      const health = service.getPoolHealth();
      expect(health['degradedPool']).toBe('degraded');

      // Wait for tasks to complete
      await longTask;
      await queuedTask;
    });

    it('should cover circuit breaker failure count increment and health status changes (line 298)', async () => {
      const pool = service.getOrCreatePool('failurePool', { maxConcurrency: 1 });
      
      // Execute successful tasks first
      await pool.execute(() => Promise.resolve('success1'));
      await pool.execute(() => Promise.resolve('success2'));

      // Now execute failing tasks to trigger circuit breaker logic
      try {
        await pool.execute(() => Promise.reject(new Error('test failure')));
      } catch {
        // Expected to fail
      }

      // Check that failure was recorded
      const metrics = pool.metrics;
      expect(metrics.circuitBreaker.failureCount).toBeGreaterThan(0);
    });

    it('should cover error paths in pool shutdown and cleanup (lines 337-341)', async () => {
      const pool = service.getOrCreatePool('shutdownPool', { maxConcurrency: 2 });
      
      // Start some tasks
      const task1 = pool.execute(() => new Promise((resolve) => setTimeout(() => resolve('task1'), 50)));
      const task2 = pool.execute(() => Promise.reject(new Error('failing task')));

      // Try to shut down the pool while tasks are running
      try {
        await pool.shutdown();
      } catch (error) {
        // Some tasks might fail during shutdown
      }

      // Wait for the successful task to complete
      await task1.catch(() => {});
      await task2.catch(() => {}); // Catch the expected error
    });

    it('should handle pool metrics when no executions recorded (line 350)', () => {
      const pool = service.getOrCreatePool('emptyMetricsPool', { maxConcurrency: 1 });
      
      // Get metrics without executing any tasks
      const poolMetrics = pool.metrics;
      
      expect(poolMetrics.averageExecutionTime).toBeDefined();
      expect(poolMetrics.activeExecutions).toBeDefined();
      expect(poolMetrics.completedTasks).toBeDefined();
    });

    it('should handle specific error types and circuit breaker state transitions (lines 457-459)', async () => {
      const pool = service.getOrCreatePool('errorTypePool', { maxConcurrency: 1 });
      
      // Test various error scenarios
      try {
        await pool.execute(() => { throw new TypeError('Type error'); });
      } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
      }

      try {
        await pool.execute(() => Promise.reject(new RangeError('Range error')));
      } catch (error) {
        expect(error).toBeInstanceOf(RangeError);
      }

      // Verify circuit breaker logic still works with different error types
      const metrics = pool.metrics;
      expect(metrics.circuitBreaker.failureCount).toBeGreaterThan(0);
    });
  });
});
