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
});
