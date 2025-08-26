import { DynamicModule, Provider } from '@nestjs/common';
import { EventEmitterModule } from '../event-emitter.module';
import { EventEmitterService } from '../event-emitter.service';
import { EventPersistenceService } from '../event-persistence.service';
import { DeadLetterQueueService } from '../dead-letter-queue.service';
import { EventEmitterOptions, EVENT_EMITTER_OPTIONS, PersistenceAdapter } from '../event-emitter.interfaces';
import { InMemoryPersistenceAdapter } from '../adapters/in-memory.adapter';

/**
 * Factory for creating configured event emitter instances
 */
export class EventEmitterFactory {
  /**
   * Creates a basic event emitter with minimal configuration
   */
  static createBasic(): DynamicModule {
    return this.create({
      persistence: {
        enabled: false,
      },
      dlq: {
        enabled: false,
      },
      monitoring: {
        enabled: false,
      },
      tenantIsolation: false,
      maxConcurrency: 10,
    });
  }

  /**
   * Creates a production-ready event emitter with persistence and DLQ
   */
  static createProduction(options: Partial<EventEmitterOptions> = {}): DynamicModule {
    const defaultOptions: EventEmitterOptions = {
      persistence: {
        enabled: true,
        adapter: new InMemoryPersistenceAdapter(),
        retentionDays: 30,
      },
      dlq: {
        enabled: true,
        maxRetries: 3,
        retryDelayMs: 1000,
        exponentialBackoff: true,
      },
      monitoring: {
        enabled: true,
        metricsPort: 9090,
      },
      tenantIsolation: false,
      maxConcurrency: 100,
    };

    return this.create({ ...defaultOptions, ...options });
  }

  /**
   * Creates a multi-tenant event emitter with tenant isolation
   */
  static createMultiTenant(options: Partial<EventEmitterOptions> = {}): DynamicModule {
    const defaultOptions: EventEmitterOptions = {
      persistence: {
        enabled: true,
        adapter: new InMemoryPersistenceAdapter(),
        retentionDays: 30,
      },
      dlq: {
        enabled: true,
        maxRetries: 3,
        retryDelayMs: 1000,
        exponentialBackoff: true,
      },
      monitoring: {
        enabled: true,
        metricsPort: 9090,
      },
      tenantIsolation: true,
      maxConcurrency: 100,
    };

    return this.create({ ...defaultOptions, ...options });
  }

  /**
   * Creates a high-performance event emitter optimized for throughput
   */
  static createHighPerformance(options: Partial<EventEmitterOptions> = {}): DynamicModule {
    const defaultOptions: EventEmitterOptions = {
      persistence: {
        enabled: false, // Disabled for maximum performance
      },
      dlq: {
        enabled: false, // Disabled for maximum performance
      },
      monitoring: {
        enabled: false, // Disabled for maximum performance
      },
      tenantIsolation: false,
      maxConcurrency: 1000,
    };

    return this.create({ ...defaultOptions, ...options });
  }

  /**
   * Creates an event emitter with custom persistence adapter
   */
  static createWithPersistence(adapter: PersistenceAdapter, options: Partial<EventEmitterOptions> = {}): DynamicModule {
    return this.create({
      persistence: {
        enabled: true,
        adapter,
        retentionDays: 30,
      },
      dlq: {
        enabled: true,
        maxRetries: 3,
        retryDelayMs: 1000,
        exponentialBackoff: true,
      },
      monitoring: {
        enabled: false,
      },
      tenantIsolation: false,
      maxConcurrency: 100,
      ...options,
    });
  }

  /**
   * Creates an event emitter for testing with enhanced debugging
   */
  static createForTesting(options: Partial<EventEmitterOptions> = {}): DynamicModule {
    const defaultOptions: EventEmitterOptions = {
      persistence: {
        enabled: true,
        adapter: new InMemoryPersistenceAdapter(),
      },
      dlq: {
        enabled: true,
        maxRetries: 1, // Fast fail for testing
        retryDelayMs: 100, // Short delays for testing
        exponentialBackoff: false,
      },
      monitoring: {
        enabled: false,
      },
      tenantIsolation: false,
      maxConcurrency: 1, // Sequential processing for predictable testing
    };

    return this.create({ ...defaultOptions, ...options });
  }

  /**
   * Creates a custom event emitter with the provided options
   */
  static create(options: EventEmitterOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: EVENT_EMITTER_OPTIONS,
        useValue: options,
      },
      EventEmitterService,
      EventPersistenceService,
      DeadLetterQueueService,
    ];

    return {
      module: EventEmitterModule,
      providers,
      exports: [EventEmitterService],
      global: true,
    };
  }

  /**
   * Validates event emitter configuration
   */
  static validateOptions(options: EventEmitterOptions): string[] {
    const errors: string[] = [];

    if (options.persistence?.enabled && !options.persistence.adapter) {
      errors.push('Persistence adapter is required when persistence is enabled');
    }

    if (options.dlq?.enabled && (!options.dlq.maxRetries || options.dlq.maxRetries < 1)) {
      errors.push('DLQ max retries must be at least 1 when DLQ is enabled');
    }

    if (options.maxConcurrency && options.maxConcurrency < 1) {
      errors.push('Max concurrency must be at least 1');
    }

    if (options.persistence?.retentionDays && options.persistence.retentionDays < 1) {
      errors.push('Persistence retention days must be at least 1');
    }

    return errors;
  }

  /**
   * Creates a builder pattern for fluent configuration
   */
  static builder(): EventEmitterBuilder {
    return new EventEmitterBuilder();
  }
}

/**
 * Builder pattern for fluent event emitter configuration
 */
export class EventEmitterBuilder {
  private options: Partial<EventEmitterOptions> = {};

  /**
   * Enables persistence with optional adapter
   */
  withPersistence(adapter?: PersistenceAdapter, retentionDays = 30): this {
    this.options.persistence = {
      enabled: true,
      adapter: adapter || new InMemoryPersistenceAdapter(),
      retentionDays,
    };
    return this;
  }

  /**
   * Configures dead letter queue
   */
  withDLQ(maxRetries = 3, retryDelayMs = 1000, exponentialBackoff = true): this {
    this.options.dlq = {
      enabled: true,
      maxRetries,
      retryDelayMs,
      exponentialBackoff,
    };
    return this;
  }

  /**
   * Enables monitoring
   */
  withMonitoring(metricsPort = 9090): this {
    this.options.monitoring = {
      enabled: true,
      metricsPort,
    };
    return this;
  }

  /**
   * Enables tenant isolation
   */
  withTenantIsolation(): this {
    this.options.tenantIsolation = true;
    return this;
  }

  /**
   * Sets maximum concurrency
   */
  withMaxConcurrency(maxConcurrency: number): this {
    this.options.maxConcurrency = maxConcurrency;
    return this;
  }

  /**
   * Disables persistence
   */
  withoutPersistence(): this {
    this.options.persistence = { enabled: false };
    return this;
  }

  /**
   * Disables dead letter queue
   */
  withoutDLQ(): this {
    this.options.dlq = { enabled: false };
    return this;
  }

  /**
   * Disables monitoring
   */
  withoutMonitoring(): this {
    this.options.monitoring = { enabled: false };
    return this;
  }

  /**
   * Builds the event emitter module
   */
  build(): DynamicModule {
    const fullOptions: EventEmitterOptions = {
      persistence: { enabled: false },
      dlq: { enabled: false },
      monitoring: { enabled: false },
      tenantIsolation: false,
      maxConcurrency: 100,
      ...this.options,
    };

    const errors = EventEmitterFactory.validateOptions(fullOptions);
    if (errors.length > 0) {
      throw new Error(`Invalid event emitter configuration: ${errors.join(', ')}`);
    }

    return EventEmitterFactory.create(fullOptions);
  }
}
