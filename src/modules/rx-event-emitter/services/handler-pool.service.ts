/**
 * Handler Pool Service - Advanced concurrency control and resource isolation
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import {
  HandlerPool,
  HandlerPoolConfig,
  HandlerPoolMetrics,
  HandlerIsolationMetrics,
  ResourceUsageMetrics,
  IsolationMetrics,
  PoolMetrics,
  IsolationStrategy,
  CircuitBreakerState,
  EVENT_EMITTER_OPTIONS,
} from '../interfaces';

/**
 * Internal pool implementation
 */
class Pool implements HandlerPool {
  private readonly activeExecutions = new Map<string, Promise<any>>();
  private readonly taskQueue: Array<{ task: () => Promise<any>; resolve: (value: any) => void; reject: (error: any) => void }> = [];
  private readonly metrics$ = new BehaviorSubject<HandlerPoolMetrics>(this.createInitialMetrics());
  private readonly circuitBreaker = {
    state: CircuitBreakerState.CLOSED,
    failureCount: 0,
    successCount: 0,
    lastFailureTime: 0,
    lastSuccessTime: 0,
    nextAttemptTime: 0,
  };

  private readonly totalTasks = 0;
  private completedTasks = 0;
  private failedTasks = 0;
  private droppedTasks = 0;
  private readonly executionTimes: number[] = [];
  private readonly maxExecutionTimes = 100;

  constructor(
    public readonly config: HandlerPoolConfig,
    private readonly logger: Logger,
  ) {}

  private createInitialMetrics(): HandlerPoolMetrics {
    return {
      name: this.config.name,
      activeExecutions: 0,
      queuedTasks: 0,
      droppedTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageExecutionTime: 0,
      utilization: 0,
      circuitBreaker: {
        state: CircuitBreakerState.CLOSED,
        failureCount: 0,
        successCount: 0,
        failureRate: 0,
        config: {
          failureThreshold: 10,
          recoveryTimeout: 30000,
          minimumThroughput: 5,
        },
      },
    };
  }

  async execute<T>(task: () => Promise<T>): Promise<T> {
    if (this.circuitBreaker.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.circuitBreaker.nextAttemptTime) {
        throw new Error(`Circuit breaker is OPEN for pool ${this.config.name}`);
      } else {
        this.circuitBreaker.state = CircuitBreakerState.HALF_OPEN;
      }
    }

    if (this.activeExecutions.size >= this.config.maxConcurrency) {
      if (this.taskQueue.length >= this.config.queueSize) {
        this.droppedTasks++;
        this.updateMetrics();
        throw new Error(`Pool ${this.config.name} is at capacity and queue is full`);
      }

      return new Promise<T>((resolve, reject) => {
        this.taskQueue.push({ task: task as () => Promise<any>, resolve, reject });
        this.updateMetrics();
      });
    }

    return this.executeImmediately(task);
  }

  private async executeImmediately<T>(task: () => Promise<T>): Promise<T> {
    const taskId = `task-${Date.now()}-${Math.random()}`;
    const startTime = Date.now();

    let taskPromise: Promise<T>;

    try {
      taskPromise = Promise.race([task(), new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Task timeout')), this.config.timeoutMs))]);

      this.activeExecutions.set(taskId, taskPromise);
      this.updateMetrics();

      const result = await taskPromise;

      this.handleTaskSuccess(startTime);
      return result;
    } catch (error) {
      this.handleTaskFailure(error as Error, startTime);
      throw error;
    } finally {
      this.activeExecutions.delete(taskId);
      this.processQueue();
      this.updateMetrics();
    }
  }

  private handleTaskSuccess(startTime: number): void {
    this.completedTasks++;
    this.circuitBreaker.successCount++;
    this.circuitBreaker.lastSuccessTime = Date.now();

    if (this.circuitBreaker.state === CircuitBreakerState.HALF_OPEN) {
      this.circuitBreaker.state = CircuitBreakerState.CLOSED;
      this.circuitBreaker.failureCount = 0;
    }

    this.recordExecutionTime(Date.now() - startTime);
  }

  private handleTaskFailure(error: Error, startTime: number): void {
    this.failedTasks++;
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    this.recordExecutionTime(Date.now() - startTime);

    const totalRequests = this.circuitBreaker.successCount + this.circuitBreaker.failureCount;
    const failureRate = totalRequests > 0 ? (this.circuitBreaker.failureCount / totalRequests) * 100 : 0;

    if (totalRequests >= 5 && failureRate >= 50 && this.circuitBreaker.state === CircuitBreakerState.CLOSED) {
      this.circuitBreaker.state = CircuitBreakerState.OPEN;
      this.circuitBreaker.nextAttemptTime = Date.now() + 30000; // 30 seconds
      this.logger.warn(`Circuit breaker opened for pool ${this.config.name} - failure rate: ${failureRate}%`);
    }
  }

  private recordExecutionTime(duration: number): void {
    this.executionTimes.push(duration);
    if (this.executionTimes.length > this.maxExecutionTimes) {
      this.executionTimes.shift();
    }
  }

  private processQueue(): void {
    while (this.taskQueue.length > 0 && this.activeExecutions.size < this.config.maxConcurrency) {
      const queued = this.taskQueue.shift();
      if (queued) {
        this.executeImmediately(queued.task).then(queued.resolve).catch(queued.reject);
      }
    }
  }

  private updateMetrics(): void {
    const totalRequests = this.circuitBreaker.successCount + this.circuitBreaker.failureCount;
    const failureRate = totalRequests > 0 ? (this.circuitBreaker.failureCount / totalRequests) * 100 : 0;
    const avgExecutionTime = this.executionTimes.length > 0 ? this.executionTimes.reduce((sum, time) => sum + time, 0) / this.executionTimes.length : 0;

    const metrics: HandlerPoolMetrics = {
      name: this.config.name,
      activeExecutions: this.activeExecutions.size,
      queuedTasks: this.taskQueue.length,
      droppedTasks: this.droppedTasks,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      averageExecutionTime: avgExecutionTime,
      utilization: (this.activeExecutions.size / this.config.maxConcurrency) * 100,
      circuitBreaker: {
        state: this.circuitBreaker.state,
        failureCount: this.circuitBreaker.failureCount,
        successCount: this.circuitBreaker.successCount,
        failureRate,
        lastFailureTime: this.circuitBreaker.lastFailureTime,
        lastSuccessTime: this.circuitBreaker.lastSuccessTime,
        nextAttemptTime: this.circuitBreaker.nextAttemptTime,
        config: {
          failureThreshold: 10,
          recoveryTimeout: 30000,
          minimumThroughput: 5,
        },
      },
    };

    this.metrics$.next(metrics);
  }

  get metrics(): HandlerPoolMetrics {
    return this.metrics$.value;
  }

  getStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    const metrics = this.metrics$.value;

    if (metrics.circuitBreaker.state === CircuitBreakerState.OPEN) {
      return 'unhealthy';
    }

    if (metrics.utilization > 80 || metrics.queuedTasks > this.config.queueSize * 0.8) {
      return 'degraded';
    }

    return 'healthy';
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled(Array.from(this.activeExecutions.values()));
    this.activeExecutions.clear();
    this.taskQueue.length = 0;
  }
}

@Injectable()
export class HandlerPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HandlerPoolService.name);

  private readonly pools = new Map<string, Pool>();
  private readonly metricsSubject = new BehaviorSubject<HandlerIsolationMetrics>(this.createInitialMetrics());
  private readonly shutdown$ = new Subject<void>();

  private metricsUpdateTimer?: NodeJS.Timeout;

  constructor(@Optional() @Inject(EVENT_EMITTER_OPTIONS) private readonly options: any = {}) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Handler Pool Service...');
    this.startMetricsCollection();
    this.logger.log('Handler Pool Service initialized successfully');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down Handler Pool Service...');

    if (this.metricsUpdateTimer) {
      clearInterval(this.metricsUpdateTimer);
    }

    this.shutdown$.next();
    this.shutdown$.complete();

    await Promise.all(Array.from(this.pools.values()).map((pool) => pool.shutdown()));
    this.pools.clear();

    this.logger.log('Handler Pool Service shutdown completed');
  }

  private createInitialMetrics(): HandlerIsolationMetrics {
    return {
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
          threads: 100,
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
        sharingEfficiency: 0.8,
      },
    };
  }

  getOrCreatePool(name: string, config?: Partial<HandlerPoolConfig>): HandlerPool {
    if (this.pools.has(name)) {
      return this.pools.get(name)!;
    }

    const poolConfig: HandlerPoolConfig = {
      name,
      maxConcurrency: 10,
      queueSize: 100,
      timeoutMs: 30000,
      isolation: IsolationStrategy.SHARED,
      ...config,
    };

    const pool = new Pool(poolConfig, this.logger);
    this.pools.set(name, pool);
    this.updateMetrics();

    this.logger.debug(`Created new pool: ${name} with max concurrency: ${poolConfig.maxConcurrency}`);
    return pool;
  }

  getPool(name: string): HandlerPool | undefined {
    return this.pools.get(name);
  }

  removePool(name: string): Promise<boolean> {
    const pool = this.pools.get(name);
    if (!pool) {
      return Promise.resolve(false);
    }

    return pool.shutdown().then(() => {
      this.pools.delete(name);
      this.updateMetrics();
      this.logger.debug(`Removed pool: ${name}`);
      return true;
    });
  }

  getAllPools(): HandlerPool[] {
    return Array.from(this.pools.values());
  }

  getMetrics(): Observable<HandlerIsolationMetrics> {
    return this.metricsSubject.asObservable();
  }

  getCurrentMetrics(): HandlerIsolationMetrics {
    return this.metricsSubject.value;
  }

  private startMetricsCollection(): void {
    this.metricsUpdateTimer = setInterval(() => {
      this.updateMetrics();
    }, 5000); // Update every 5 seconds
  }

  private updateMetrics(): void {
    const pools = Array.from(this.pools.values());
    const poolMetrics = new Map<string, PoolMetrics>();
    const circuitBreakerStates: Record<string, string> = {};

    let totalActiveExecutions = 0;
    let totalQueuedTasks = 0;
    let totalDroppedTasks = 0;
    let totalUtilization = 0;
    let activePools = 0;

    pools.forEach((pool) => {
      const metrics = pool.metrics;
      const status = pool.getStatus();

      if (status !== 'unhealthy') {
        activePools++;
      }

      totalActiveExecutions += metrics.activeExecutions;
      totalQueuedTasks += metrics.queuedTasks;
      totalDroppedTasks += metrics.droppedTasks;
      totalUtilization += metrics.utilization;

      circuitBreakerStates[pool.config.name] = metrics.circuitBreaker.state;

      const poolMetric: PoolMetrics = {
        name: metrics.name,
        activeExecutions: metrics.activeExecutions,
        queuedTasks: metrics.queuedTasks,
        droppedTasks: metrics.droppedTasks,
        completedTasks: metrics.completedTasks,
        failedTasks: metrics.failedTasks,
        successRate: metrics.completedTasks > 0 ? (metrics.completedTasks / (metrics.completedTasks + metrics.failedTasks)) * 100 : 0,
        averageExecutionTime: metrics.averageExecutionTime,
        maxExecutionTime: metrics.averageExecutionTime * 2, // Simplified
        utilization: metrics.utilization,
        memoryUsage: 0, // Would need actual memory tracking
        lastActivityAt: Date.now(),
      };

      poolMetrics.set(pool.config.name, poolMetric);
    });

    const averageUtilization = pools.length > 0 ? totalUtilization / pools.length : 0;

    const metrics: HandlerIsolationMetrics = {
      totalPools: pools.length,
      activePools,
      totalActiveExecutions,
      totalQueuedTasks,
      totalDroppedTasks,
      averagePoolUtilization: averageUtilization,
      circuitBreakerStates,
      poolMetrics,
      resourceUsage: this.calculateResourceUsage(pools),
      isolation: this.calculateIsolationMetrics(pools),
    };

    this.metricsSubject.next(metrics);
  }

  private calculateResourceUsage(pools: Pool[]): ResourceUsageMetrics {
    const totalExecutions = pools.reduce((sum, pool) => sum + pool.metrics.activeExecutions, 0);
    const maxExecutions = pools.reduce((sum, pool) => sum + pool.config.maxConcurrency, 0);

    const memoryPressure = totalExecutions / Math.max(maxExecutions, 1);
    const cpuPressure = memoryPressure; // Simplified
    const threadPressure = memoryPressure; // Simplified

    return {
      memoryUsage: totalExecutions * 10, // Simplified calculation
      cpuUsage: memoryPressure * 100,
      activeThreads: totalExecutions,
      availableResources: {
        memory: Math.max(0, 1000 - totalExecutions * 10),
        cpu: Math.max(0, 100 - memoryPressure * 100),
        threads: Math.max(0, 100 - totalExecutions),
      },
      pressure: {
        memory: this.categorizePressure(memoryPressure),
        cpu: this.categorizePressure(cpuPressure),
        threads: this.categorizePressure(threadPressure),
      },
    };
  }

  private categorizePressure(pressure: number): 'low' | 'medium' | 'high' | 'critical' {
    if (pressure < 0.3) return 'low';
    if (pressure < 0.6) return 'medium';
    if (pressure < 0.8) return 'high';
    return 'critical';
  }

  private calculateIsolationMetrics(pools: Pool[]): IsolationMetrics {
    if (pools.length === 0) {
      return {
        interferenceScore: 0,
        faultContainment: 1,
        sharingEfficiency: 0.8,
      };
    }

    const isolatedPools = pools.filter((p) => p.config.isolation === IsolationStrategy.ISOLATED).length;
    const openCircuitBreakers = pools.filter((p) => p.metrics.circuitBreaker.state === CircuitBreakerState.OPEN).length;

    const interferenceScore = 1 - isolatedPools / pools.length;
    const faultContainment = pools.length > 0 ? 1 - openCircuitBreakers / pools.length : 1;
    const sharingEfficiency = 0.8 - (isolatedPools / pools.length) * 0.3; // Isolated pools reduce sharing efficiency

    return {
      interferenceScore,
      faultContainment,
      sharingEfficiency: Math.max(0.2, sharingEfficiency),
    };
  }

  async executeInPool<T>(poolName: string, task: () => Promise<T>, config?: Partial<HandlerPoolConfig>): Promise<T> {
    const pool = this.getOrCreatePool(poolName, config);
    return pool.execute(task);
  }

  getPoolHealth(): Record<string, 'healthy' | 'degraded' | 'unhealthy'> {
    const health: Record<string, 'healthy' | 'degraded' | 'unhealthy'> = {};
    this.pools.forEach((pool, name) => {
      health[name] = pool.getStatus();
    });
    return health;
  }
}
