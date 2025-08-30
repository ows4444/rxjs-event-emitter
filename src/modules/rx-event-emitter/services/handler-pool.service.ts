/**
 * @fileoverview Handler Pool Service - Modern pool management for handler isolation
 * Provides concurrent execution control and resource isolation for event handlers
 */

import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { Event, RegisteredHandler, HandlerPool, HandlerIsolationMetrics, CircuitBreakerState, IsolationStrategy, EventEmitterOptions } from '../interfaces';

/**
 * Modern handler pool service for managing concurrent execution and isolation
 */
@Injectable()
export class HandlerPoolService {
  private readonly logger = new Logger(HandlerPoolService.name);

  /** Pool storage by isolation context */
  private readonly pools = new Map<string, HandlerPool>();

  /** Pool metrics observable */
  private readonly metricsSubject = new BehaviorSubject<HandlerIsolationMetrics>({
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
        memory: 0,
        cpu: 0,
        threads: 0,
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
  });

  constructor(private readonly options: EventEmitterOptions) {}

  /**
   * Get or create a handler pool for the given isolation context
   */
  getOrCreatePool(isolationContext: string, concurrencyLimit?: number, maxQueueSize?: number, isolationStrategy?: IsolationStrategy): HandlerPool {
    let pool = this.pools.get(isolationContext);

    if (!pool) {
      pool = this.createPool(isolationContext, concurrencyLimit, maxQueueSize, isolationStrategy);
      this.pools.set(isolationContext, pool);
    }

    return pool;
  }

  /**
   * Create a new handler pool with modern configuration
   */
  private createPool(isolationContext: string, concurrencyLimit = 10, maxQueueSize = 100, isolationStrategy = IsolationStrategy.PER_HANDLER): HandlerPool {
    const pool: HandlerPool = {
      isolationContext,
      concurrencyLimit,
      activeExecutions: 0,
      totalExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      lastExecutionTime: undefined,
      pendingQueue: [],
      maxQueueSize,
      droppedTasks: 0,
      queueTimeout: this.options.handlerExecution?.queueTimeout || 30000,
      circuitBreakerState: CircuitBreakerState.CLOSED,
      circuitBreakerFailures: 0,
      circuitBreakerLastFailure: undefined,
      isolationStrategy,
    };

    this.logger.debug(`Created handler pool: ${isolationContext} with strategy: ${isolationStrategy}`);
    this.updateMetrics();

    return pool;
  }

  /**
   * Execute a handler in the appropriate pool with isolation
   */
  async executeInPool(isolationContext: string, handler: RegisteredHandler, event: Event): Promise<void> {
    const pool = this.getOrCreatePool(isolationContext, handler.options.maxConcurrency, handler.options.maxQueueSize);

    // Check circuit breaker
    if (this.isCircuitBreakerOpen(pool)) {
      throw new Error(`Circuit breaker OPEN for pool: ${isolationContext}`);
    }

    // Try to acquire execution slot
    if (pool.activeExecutions >= pool.concurrencyLimit) {
      return this.queueExecution(pool, handler, event);
    }

    return this.executeHandler(pool, handler, event);
  }

  /**
   * Check if circuit breaker is open for the pool
   */
  private isCircuitBreakerOpen(pool: HandlerPool): boolean {
    if (pool.circuitBreakerState !== CircuitBreakerState.OPEN) {
      return false;
    }

    const timeout = this.options.errorRecovery?.circuitBreakerTimeout || 60000;
    const timeSinceFailure = Date.now() - (pool.circuitBreakerLastFailure || 0);

    if (timeSinceFailure >= timeout) {
      // Transition to half-open
      pool.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
      this.logger.debug(`Circuit breaker transitioning to HALF_OPEN for pool: ${pool.isolationContext}`);
      return false;
    }

    return true;
  }

  /**
   * Queue handler execution when pool is at capacity
   */
  private async queueExecution(pool: HandlerPool, handler: RegisteredHandler, event: Event): Promise<void> {
    if (pool.pendingQueue.length >= pool.maxQueueSize) {
      pool.droppedTasks++;
      this.updateMetrics();
      throw new Error(`Pool queue full for: ${pool.isolationContext}`);
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove from queue on timeout
        const index = pool.pendingQueue.findIndex((item) => item.resolve === resolve);
        if (index >= 0) {
          pool.pendingQueue.splice(index, 1);
        }
        reject(new Error(`Queue timeout after ${pool.queueTimeout}ms`));
      }, pool.queueTimeout);

      pool.pendingQueue.push({
        handler,
        event,
        enqueuedAt: Date.now(),
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
  }

  /**
   * Execute handler with pool tracking and metrics
   */
  private async executeHandler(pool: HandlerPool, handler: RegisteredHandler, event: Event): Promise<void> {
    const startTime = Date.now();
    pool.activeExecutions++;
    pool.totalExecutions++;

    try {
      // Execute the handler
      const result = handler.handler.call(handler.instance, event);

      // Handle async results
      if (result && typeof result.then === 'function') {
        await result;
      }

      // Update success metrics
      const executionTime = Date.now() - startTime;
      this.updateExecutionMetrics(pool, executionTime, true);

      // Reset circuit breaker on successful execution
      if (pool.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
        pool.circuitBreakerState = CircuitBreakerState.CLOSED;
        pool.circuitBreakerFailures = 0;
        this.logger.debug(`Circuit breaker CLOSED for pool: ${pool.isolationContext}`);
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateExecutionMetrics(pool, executionTime, false);

      // Update circuit breaker on failure
      this.updateCircuitBreaker(pool);

      throw error;
    } finally {
      pool.activeExecutions--;
      this.processQueue(pool);
      this.updateMetrics();
    }
  }

  /**
   * Update execution metrics for the pool
   */
  private updateExecutionMetrics(pool: HandlerPool, executionTime: number, success: boolean): void {
    // Update average execution time using exponential moving average
    const alpha = 0.1; // Smoothing factor
    pool.averageExecutionTime = pool.averageExecutionTime * (1 - alpha) + executionTime * alpha;
    pool.lastExecutionTime = Date.now();

    if (!success) {
      pool.failedExecutions++;
    }
  }

  /**
   * Update circuit breaker state on failure
   */
  private updateCircuitBreaker(pool: HandlerPool): void {
    pool.circuitBreakerFailures++;

    const threshold = this.options.errorRecovery?.circuitBreakerThreshold || 5;

    if (pool.circuitBreakerFailures >= threshold) {
      pool.circuitBreakerState = CircuitBreakerState.OPEN;
      pool.circuitBreakerLastFailure = Date.now();
      this.logger.warn(`Circuit breaker OPEN for pool: ${pool.isolationContext} after ${pool.circuitBreakerFailures} failures`);
    }
  }

  /**
   * Process queued executions when slots become available
   */
  private processQueue(pool: HandlerPool): void {
    while (pool.pendingQueue.length > 0 && pool.activeExecutions < pool.concurrencyLimit) {
      const queuedItem = pool.pendingQueue.shift()!;

      // Check if item has expired
      const queueTime = Date.now() - queuedItem.enqueuedAt;
      if (queueTime > pool.queueTimeout) {
        queuedItem.reject(new Error(`Queue timeout after ${queueTime}ms`));
        continue;
      }

      // Execute the queued item
      this.executeHandler(pool, queuedItem.handler, queuedItem.event)
        .then(() => queuedItem.resolve())
        .catch((error) => queuedItem.reject(error));
    }
  }

  /**
   * Get pool information by isolation context
   */
  getPoolInfo(isolationContext: string): HandlerPool | undefined {
    return this.pools.get(isolationContext);
  }

  /**
   * Get all pools
   */
  getAllPools(): ReadonlyMap<string, HandlerPool> {
    return new Map(this.pools);
  }

  /**
   * Get handler isolation metrics observable
   */
  getMetrics(): Observable<HandlerIsolationMetrics> {
    return this.metricsSubject.asObservable();
  }

  /**
   * Get current metrics snapshot
   */
  getCurrentMetrics(): HandlerIsolationMetrics {
    return this.metricsSubject.value;
  }

  /**
   * Update aggregated metrics
   */
  private updateMetrics(): void {
    const pools = Array.from(this.pools.values());
    const totalActiveExecutions = pools.reduce((sum, pool) => sum + pool.activeExecutions, 0);
    const totalQueuedTasks = pools.reduce((sum, pool) => sum + pool.pendingQueue.length, 0);
    const totalDroppedTasks = pools.reduce((sum, pool) => sum + pool.droppedTasks, 0);

    const activePools = pools.filter((pool) => pool.activeExecutions > 0).length;
    const averageUtilization = pools.length > 0 ? pools.reduce((sum, pool) => sum + pool.activeExecutions / pool.concurrencyLimit, 0) / pools.length : 0;

    // Create circuit breaker states map
    const circuitBreakerStates: Record<string, string> = {};
    const poolMetrics = new Map<string, any>();

    for (const [context, pool] of this.pools) {
      circuitBreakerStates[context] = pool.circuitBreakerState;

      poolMetrics.set(context, {
        utilization: pool.activeExecutions / pool.concurrencyLimit,
        throughput: this.calculateThroughput(pool),
        errorRate: pool.totalExecutions > 0 ? (pool.failedExecutions / pool.totalExecutions) * 100 : 0,
        averageWaitTime: pool.averageExecutionTime,
        queueDepth: pool.pendingQueue.length,
        healthScore: this.calculateHealthScore(pool),
        efficiency: this.calculateEfficiency(pool),
      });
    }

    const metrics: HandlerIsolationMetrics = {
      totalPools: this.pools.size,
      activePools,
      totalActiveExecutions,
      totalQueuedTasks,
      totalDroppedTasks,
      averagePoolUtilization: averageUtilization,
      circuitBreakerStates,
      poolMetrics,
      resourceUsage: {
        memoryUsage: this.getMemoryUsage(),
        cpuUsage: this.getCpuUsage(),
        activeThreads: totalActiveExecutions,
        availableResources: {
          memory: this.getAvailableMemory(),
          cpu: this.getAvailableCpu(),
          threads: this.getAvailableThreads(),
        },
        pressure: {
          memory: this.getMemoryPressure(),
          cpu: this.getCpuPressure(),
          threads: this.getThreadPressure(totalActiveExecutions),
        },
      },
      isolation: {
        interferenceScore: this.calculateInterferenceScore(),
        faultContainment: this.calculateFaultContainment(),
        sharingEfficiency: this.calculateSharingEfficiency(),
      },
    };

    this.metricsSubject.next(metrics);
  }

  /**
   * Calculate throughput for a pool (events per second)
   */
  private calculateThroughput(pool: HandlerPool): number {
    if (!pool.lastExecutionTime || pool.totalExecutions === 0) {
      return 0;
    }

    const timeWindow = 60000; // 1 minute window
    const timeElapsed = Date.now() - pool.lastExecutionTime;

    if (timeElapsed > timeWindow) {
      return 0;
    }

    return (pool.totalExecutions / timeWindow) * 1000; // Convert to per second
  }

  /**
   * Calculate health score for a pool
   */
  private calculateHealthScore(pool: HandlerPool): number {
    const errorRate = pool.totalExecutions > 0 ? pool.failedExecutions / pool.totalExecutions : 0;
    const utilization = pool.activeExecutions / pool.concurrencyLimit;
    const circuitBreakerPenalty = pool.circuitBreakerState === CircuitBreakerState.OPEN ? 0.5 : 0;

    return Math.max(0, 1 - errorRate - (utilization > 0.8 ? 0.2 : 0) - circuitBreakerPenalty);
  }

  /**
   * Calculate efficiency for a pool
   */
  private calculateEfficiency(pool: HandlerPool): number {
    if (pool.totalExecutions === 0) {
      return 1;
    }

    const successRate = (pool.totalExecutions - pool.failedExecutions) / pool.totalExecutions;
    const utilizationEfficiency = Math.min(pool.activeExecutions / pool.concurrencyLimit, 1);

    return (successRate + utilizationEfficiency) / 2;
  }

  // Resource monitoring methods (simplified implementations)
  private getMemoryUsage(): number {
    return process.memoryUsage().heapUsed / 1024 / 1024; // MB
  }

  private getCpuUsage(): number {
    return process.cpuUsage().user / 1000000; // Simplified CPU usage
  }

  private getAvailableMemory(): number {
    return process.memoryUsage().heapTotal / 1024 / 1024; // MB
  }

  private getAvailableCpu(): number {
    return 100; // Simplified - would need actual CPU monitoring
  }

  private getAvailableThreads(): number {
    return 1000; // Simplified - would need actual thread pool monitoring
  }

  private getMemoryPressure(): 'low' | 'medium' | 'high' | 'critical' {
    const memoryUsage = this.getMemoryUsage();
    const availableMemory = this.getAvailableMemory();
    const ratio = memoryUsage / availableMemory;

    if (ratio > 0.9) return 'critical';
    if (ratio > 0.7) return 'high';
    if (ratio > 0.5) return 'medium';
    return 'low';
  }

  private getCpuPressure(): 'low' | 'medium' | 'high' | 'critical' {
    const cpuUsage = this.getCpuUsage();

    if (cpuUsage > 90) return 'critical';
    if (cpuUsage > 70) return 'high';
    if (cpuUsage > 50) return 'medium';
    return 'low';
  }

  private getThreadPressure(activeThreads: number): 'low' | 'medium' | 'high' | 'critical' {
    const availableThreads = this.getAvailableThreads();
    const ratio = activeThreads / availableThreads;

    if (ratio > 0.9) return 'critical';
    if (ratio > 0.7) return 'high';
    if (ratio > 0.5) return 'medium';
    return 'low';
  }

  private calculateInterferenceScore(): number {
    // Simplified interference calculation
    const totalPools = this.pools.size;
    return totalPools > 1 ? 0.1 : 0; // Lower is better
  }

  private calculateFaultContainment(): number {
    const openCircuitBreakers = Array.from(this.pools.values()).filter((pool) => pool.circuitBreakerState === CircuitBreakerState.OPEN).length;
    const totalPools = this.pools.size;

    return totalPools > 0 ? (totalPools - openCircuitBreakers) / totalPools : 1;
  }

  private calculateSharingEfficiency(): number {
    const totalCapacity = Array.from(this.pools.values()).reduce((sum, pool) => sum + pool.concurrencyLimit, 0);
    const totalActive = Array.from(this.pools.values()).reduce((sum, pool) => sum + pool.activeExecutions, 0);

    return totalCapacity > 0 ? totalActive / totalCapacity : 0;
  }

  /**
   * Reset circuit breaker for a specific pool
   */
  resetCircuitBreaker(isolationContext: string): boolean {
    const pool = this.pools.get(isolationContext);

    if (!pool) {
      return false;
    }

    pool.circuitBreakerState = CircuitBreakerState.CLOSED;
    pool.circuitBreakerFailures = 0;
    pool.circuitBreakerLastFailure = undefined;

    this.logger.log(`Circuit breaker reset for pool: ${isolationContext}`);
    this.updateMetrics();

    return true;
  }

  /**
   * Cleanup all pools and pending executions
   */
  async cleanup(): Promise<void> {
    this.logger.debug('Cleaning up handler pools...');

    for (const pool of this.pools.values()) {
      // Reject all pending executions
      for (const queuedItem of pool.pendingQueue) {
        queuedItem.reject(new Error('Service shutting down'));
      }
      pool.pendingQueue.length = 0;
    }

    this.pools.clear();
    this.metricsSubject.complete();

    this.logger.debug('Handler pool service cleanup completed');
  }
}
