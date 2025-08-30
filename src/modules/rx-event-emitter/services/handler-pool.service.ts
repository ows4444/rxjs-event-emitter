import { Injectable, Logger } from '@nestjs/common';
import { Event, HandlerOptions } from '../event-emitter.interfaces';

interface RegisteredHandler {
  eventName: string;
  handler: (...args: unknown[]) => unknown;
  instance: unknown;
  options: HandlerOptions;
  handlerId: string;
}

interface HandlerPool {
  isolationContext: string;
  concurrencyLimit: number;
  activeExecutions: number;
  totalExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutionTime?: number;
  pendingQueue: {
    handler: RegisteredHandler;
    event: Event;
    enqueuedAt: number;
    resolve: (value: void) => void;
    reject: (error: Error) => void;
  }[];
  maxQueueSize: number;
  droppedTasks: number;
  queueTimeoutMs: number;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  circuitBreakerFailures: number;
  circuitBreakerLastFailure?: number;
  isolationStrategy: 'per-handler' | 'per-event-type' | 'shared';
}

interface HandlerIsolationMetrics {
  totalPools: number;
  activePools: number;
  totalActiveExecutions: number;
  totalQueuedTasks: number;
  totalDroppedTasks: number;
  averagePoolUtilization: number;
  circuitBreakerStates: Record<string, string>;
}

@Injectable()
export class HandlerPoolService {
  private readonly logger = new Logger(HandlerPoolService.name);
  private readonly handlerPools = new Map<string, HandlerPool>();

  createPool(
    isolationContext: string,
    concurrencyLimit: number = 5,
    maxQueueSize: number = 100,
    isolationStrategy: 'per-handler' | 'per-event-type' | 'shared' = 'per-handler',
  ): HandlerPool {
    const pool: HandlerPool = {
      isolationContext,
      concurrencyLimit,
      activeExecutions: 0,
      totalExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      pendingQueue: [],
      maxQueueSize,
      droppedTasks: 0,
      queueTimeoutMs: 30000,
      circuitBreakerState: 'CLOSED',
      circuitBreakerFailures: 0,
      isolationStrategy,
    };

    this.handlerPools.set(isolationContext, pool);
    this.logger.debug(`Created handler pool: ${isolationContext}`);
    return pool;
  }

  getPool(isolationContext: string): HandlerPool | undefined {
    return this.handlerPools.get(isolationContext);
  }

  async executeInPool(isolationContext: string, handler: RegisteredHandler, event: Event): Promise<void> {
    let pool = this.getPool(isolationContext);
    if (!pool) {
      pool = this.createPool(isolationContext);
    }

    // Check circuit breaker state
    if (pool.circuitBreakerState === 'OPEN') {
      const timeSinceLastFailure = Date.now() - (pool.circuitBreakerLastFailure || 0);
      if (timeSinceLastFailure < 60000) {
        // 1 minute timeout
        throw new Error(`Circuit breaker is OPEN for ${isolationContext}`);
      } else {
        pool.circuitBreakerState = 'HALF_OPEN';
      }
    }

    // Check concurrency limits
    if (pool.activeExecutions >= pool.concurrencyLimit) {
      if (pool.pendingQueue.length >= pool.maxQueueSize) {
        pool.droppedTasks++;
        throw new Error(`Handler pool queue full for ${isolationContext}`);
      }

      // Queue the execution
      return new Promise<void>((resolve, reject) => {
        pool.pendingQueue.push({
          handler,
          event,
          enqueuedAt: Date.now(),
          resolve,
          reject,
        });
      });
    }

    // Execute immediately
    return this.executeHandler(pool, handler, event);
  }

  private async executeHandler(pool: HandlerPool, handler: RegisteredHandler, event: Event): Promise<void> {
    const startTime = Date.now();
    pool.activeExecutions++;
    pool.totalExecutions++;

    try {
      await handler.handler.call(handler.instance, event);

      // Update metrics
      const executionTime = Date.now() - startTime;
      pool.averageExecutionTime = (pool.averageExecutionTime + executionTime) / 2;
      pool.lastExecutionTime = Date.now();

      // Reset circuit breaker on success
      if (pool.circuitBreakerState === 'HALF_OPEN') {
        pool.circuitBreakerState = 'CLOSED';
        pool.circuitBreakerFailures = 0;
      }

      this.logger.debug(`Handler executed successfully in ${executionTime}ms for ${pool.isolationContext}`);
    } catch (error) {
      pool.failedExecutions++;
      pool.circuitBreakerFailures++;

      // Circuit breaker logic
      if (pool.circuitBreakerFailures >= 5) {
        pool.circuitBreakerState = 'OPEN';
        pool.circuitBreakerLastFailure = Date.now();
      }

      this.logger.error(`Handler execution failed in pool ${pool.isolationContext}:`, error);
      throw error;
    } finally {
      pool.activeExecutions--;
      this.processQueue(pool);
    }
  }

  private processQueue(pool: HandlerPool): void {
    if (pool.pendingQueue.length > 0 && pool.activeExecutions < pool.concurrencyLimit) {
      const queuedExecution = pool.pendingQueue.shift();

      // Check for expired queue items
      const queueTime = Date.now() - queuedExecution.enqueuedAt;
      if (queueTime > pool.queueTimeoutMs) {
        queuedExecution.reject(new Error(`Queue timeout after ${queueTime}ms`));
        this.processQueue(pool); // Try next item
        return;
      }

      this.executeHandler(pool, queuedExecution.handler, queuedExecution.event).then(queuedExecution.resolve).catch(queuedExecution.reject);
    }
  }

  getHandlerIsolationMetrics(): HandlerIsolationMetrics {
    const pools = Array.from(this.handlerPools.values());
    const totalActiveExecutions = pools.reduce((sum, pool) => sum + pool.activeExecutions, 0);
    const totalQueuedTasks = pools.reduce((sum, pool) => sum + pool.pendingQueue.length, 0);
    const totalDroppedTasks = pools.reduce((sum, pool) => sum + pool.droppedTasks, 0);

    const averageUtilization = pools.length > 0 ? pools.reduce((sum, pool) => sum + pool.activeExecutions / pool.concurrencyLimit, 0) / pools.length : 0;

    const circuitBreakerStates: Record<string, string> = {};
    for (const [context, pool] of this.handlerPools.entries()) {
      circuitBreakerStates[context] = pool.circuitBreakerState;
    }

    return {
      totalPools: this.handlerPools.size,
      activePools: pools.filter((pool) => pool.activeExecutions > 0).length,
      totalActiveExecutions,
      totalQueuedTasks,
      totalDroppedTasks,
      averagePoolUtilization: averageUtilization,
      circuitBreakerStates,
    };
  }

  getHandlerPoolMetrics(): Record<string, unknown> {
    const metrics: Record<string, unknown> = {};

    for (const [context, pool] of this.handlerPools.entries()) {
      metrics[`pool_${context}`] = {
        activeExecutions: pool.activeExecutions,
        totalExecutions: pool.totalExecutions,
        failedExecutions: pool.failedExecutions,
        averageExecutionTime: pool.averageExecutionTime,
        queueLength: pool.pendingQueue.length,
        droppedTasks: pool.droppedTasks,
        circuitBreakerState: pool.circuitBreakerState,
        utilization: pool.activeExecutions / pool.concurrencyLimit,
      };
    }

    return metrics;
  }

  getHandlerHealthStatus(handlerId: string): {
    healthy: boolean;
    activeExecutions: number;
    averageResponseTime: number;
    errorRate: number;
    circuitBreakerState: string;
  } {
    const pool = this.handlerPools.get(handlerId);

    if (!pool) {
      return {
        healthy: false,
        activeExecutions: 0,
        averageResponseTime: 0,
        errorRate: 1,
        circuitBreakerState: 'UNKNOWN',
      };
    }

    const errorRate = pool.totalExecutions > 0 ? pool.failedExecutions / pool.totalExecutions : 0;
    const healthy = pool.circuitBreakerState === 'CLOSED' && errorRate < 0.1; // Less than 10% error rate

    return {
      healthy,
      activeExecutions: pool.activeExecutions,
      averageResponseTime: pool.averageExecutionTime,
      errorRate,
      circuitBreakerState: pool.circuitBreakerState,
    };
  }

  cleanup(): void {
    // Clear all pending queues
    for (const pool of this.handlerPools.values()) {
      pool.pendingQueue.forEach((item) => {
        item.reject(new Error('Service shutting down'));
      });
      pool.pendingQueue.length = 0;
    }

    this.handlerPools.clear();
    this.logger.debug('Handler pool service cleaned up');
  }
}
