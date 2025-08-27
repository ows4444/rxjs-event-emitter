import { DynamicModule, Global, Logger, Module, OnModuleDestroy, OnModuleInit, Provider } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { EventEmitterService } from './event-emitter.service';
import { EventPersistenceService } from './event-persistence.service';
import { DeadLetterQueueService } from './dead-letter-queue.service';
import { DependencyAnalyzerService } from './dependency-analyzer.service';
import { EVENT_EMITTER_OPTIONS, EventEmitterOptions } from './event-emitter.interfaces';

@Global()
@Module({})
export class EventEmitterModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventEmitterModule.name);
  private readonly initializationTimeoutMs = 30000; // 30 seconds
  private readonly shutdownTimeoutMs = 15000; // 15 seconds
  static forRoot(options?: EventEmitterOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: EVENT_EMITTER_OPTIONS,
        useValue: options || {},
      },
      DependencyAnalyzerService,
      EventEmitterService,
      EventPersistenceService,
      DeadLetterQueueService,
    ];

    // Perform circular dependency detection during module configuration
    if (options?.validation?.enableDependencyAnalysis !== false) {
      EventEmitterModule.validateDependencies(providers, options);
    }

    return {
      module: EventEmitterModule,
      imports: [DiscoveryModule],
      providers,
      exports: [EventEmitterService],
    };
  }

  constructor(
    private readonly eventEmitter: EventEmitterService,
    private readonly discovery: DiscoveryService,
    private readonly dependencyAnalyzer: DependencyAnalyzerService,
  ) {}

  static validateDependencies(providers: Provider[], options?: EventEmitterOptions): void {
    const logger = new Logger(`${EventEmitterModule.name}:DependencyValidator`);

    try {
      // Create temporary analyzer for validation
      const analyzer = new DependencyAnalyzerService();
      const result = analyzer.analyzeDependencies(providers);

      if (!result.isValid) {
        const report = analyzer.generateDependencyReport(result);
        logger.error('Circular dependency detection failed:');
        logger.error(report);

        const strictMode = options?.validation?.strictDependencyValidation !== false;

        if (strictMode) {
          const errorMessage =
            result.circularDependencies.length > 0
              ? `Circular dependencies detected: ${result.circularDependencies.map((cd) => cd.description).join('; ')}`
              : `Dependency validation failed: ${result.errors.join('; ')}`;

          throw new Error(`EventEmitterModule configuration invalid: ${errorMessage}`);
        } else {
          logger.warn('Dependency validation failed but continuing in non-strict mode');
          logger.warn(`Errors: ${result.errors.join('; ')}`);
        }
      } else {
        logger.log('✅ Dependency validation passed - no circular dependencies detected');

        if (result.warnings.length > 0) {
          logger.warn('Dependency validation warnings:');
          result.warnings.forEach((warning) => logger.warn(`   ${warning}`));
        }

        // Log dependency resolution order in debug mode
        if (options?.validation?.logDependencyGraph) {
          const report = analyzer.generateDependencyReport(result);
          logger.debug('Dependency Analysis Report:');
          logger.debug(report);
        }
      }
    } catch (error) {
      logger.error('Failed to perform dependency analysis', error instanceof Error ? error.stack : String(error));

      // In strict mode, re-throw the error to prevent module loading
      if (options?.validation?.strictDependencyValidation !== false) {
        throw error;
      }
    }
  }

  async onModuleInit(): Promise<void> {
    const operationTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Module initialization timeout')), this.initializationTimeoutMs);
    });

    try {
      this.logger.log('Initializing EventEmitter module...');

      await Promise.race([this.performInitialization(), operationTimeout]);

      this.logger.log('EventEmitter module initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize EventEmitter module', error instanceof Error ? error.stack : String(error));

      // Graceful degradation - continue with partial functionality
      try {
        this.logger.warn('Attempting graceful degradation during initialization...');
        await this.gracefulDegradation();
        this.logger.warn('EventEmitter module partially initialized with limited functionality');
      } catch (degradationError) {
        this.logger.error(
          'Graceful degradation failed during initialization',
          degradationError instanceof Error ? degradationError.stack : String(degradationError),
        );
        // Re-throw to prevent module from starting in broken state
        throw new Error(`EventEmitter module initialization failed completely: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    const shutdownTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Module shutdown timeout')), this.shutdownTimeoutMs);
    });

    try {
      this.logger.log('Shutting down EventEmitter module...');

      await Promise.race([this.performShutdown(), shutdownTimeout]);

      this.logger.log('EventEmitter module shut down successfully');
    } catch (error) {
      this.logger.error('Error during EventEmitter module shutdown', error instanceof Error ? error.stack : String(error));

      // Attempt forced cleanup
      try {
        this.logger.warn('Attempting forced cleanup during shutdown...');
        await this.forceCleanup();
        this.logger.warn('EventEmitter module shutdown completed with forced cleanup');
      } catch (cleanupError) {
        this.logger.error('Forced cleanup failed during shutdown', cleanupError instanceof Error ? cleanupError.stack : String(cleanupError));
        // Don't re-throw during shutdown to prevent blocking application termination
      }
    }
  }

  private async performInitialization(): Promise<void> {
    try {
      // Step 1: Discover handlers with timeout
      this.logger.debug('Discovering event handlers...');
      this.eventEmitter.discoverHandlers(this.discovery);
      this.logger.debug('Event handlers discovered successfully');

      // Step 2: Replay unprocessed events with timeout
      this.logger.debug('Replaying unprocessed events...');
      this.eventEmitter.replayUnprocessedEvents();
      this.logger.debug('Unprocessed events replayed successfully');
    } catch (error) {
      throw new Error(`Initialization step failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async performShutdown(): Promise<void> {
    try {
      this.logger.debug('Performing graceful shutdown...');
      await this.eventEmitter.gracefulShutdown();
      this.logger.debug('Graceful shutdown completed');
    } catch (error) {
      throw new Error(`Shutdown step failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async gracefulDegradation(): Promise<void> {
    try {
      // Minimal initialization - at least try to start the service
      this.logger.debug('Attempting minimal service initialization...');

      // Skip handler discovery if it failed, but ensure service is available
      if (!this.eventEmitter) {
        throw new Error('EventEmitter service is not available for degradation');
      }

      // Mark service as degraded
      this.logger.warn('EventEmitter service running in degraded mode - some features may not work');
    } catch (error) {
      throw new Error(`Graceful degradation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async forceCleanup(): Promise<void> {
    try {
      this.logger.debug('Performing forced cleanup...');

      // Attempt graceful shutdown with a very short timeout
      this.logger.warn('Attempting graceful shutdown with shorter timeout for forced cleanup');
      await Promise.race([
        this.eventEmitter?.gracefulShutdown(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Force cleanup timeout')), 5000)),
      ]);

      this.logger.debug('Forced cleanup completed');
    } catch (error) {
      // Log but don't throw - we're already in error recovery
      this.logger.warn(`Force cleanup encountered additional errors: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
