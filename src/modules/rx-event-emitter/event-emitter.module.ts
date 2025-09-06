import { DynamicModule, Global, Logger, Module, OnModuleInit } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import {
  EventEmitterService,
  EventEmitterOptions,
  HandlerDiscoveryService,
  PersistenceService,
  MetricsService,
  DeadLetterQueueService,
  HandlerPoolService,
  DependencyAnalyzerService,
  HandlerExecutionService,
  StreamManagementService,
} from './services';
import { EVENT_EMITTER_OPTIONS } from './interfaces';

/**
 * Enhanced NestJS implementation of RxJS Event Emitter Module
 *
 * Advanced Features:
 * - Automatic handler discovery using NestJS DiscoveryService
 * - RxJS-based event processing with advanced backpressure handling
 * - Circuit breakers and error recovery mechanisms
 * - Handler pools for concurrency control and isolation
 * - Dead letter queue for failed event handling
 * - Comprehensive metrics collection and monitoring
 * - Advanced stream management and optimization
 * - Dependency analysis and execution planning
 * - Event persistence with advanced querying capabilities
 * - Clean, injectable services following NestJS patterns
 * - Type-safe event handling with decorators
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     EventEmitterModule.forRoot({
 *       // Core configuration
 *       maxConcurrency: 20,
 *       bufferTimeMs: 50,
 *       defaultTimeout: 10000,
 *
 *       // Advanced features
 *       enableMetrics: true,
 *       enablePersistence: true,
 *       enableDeadLetterQueue: true,
 *
 *       // Service-specific configuration
 *       handlerExecution: {
 *         circuitBreaker: { enabled: true },
 *         rateLimit: { enabled: true, maxPerSecond: 100 }
 *       },
 *
 *       persistence: {
 *         adapter: 'memory',
 *         batchSize: 100
 *       },
 *
 *       streamManagement: {
 *         backpressure: { enabled: true, strategy: 'buffer' },
 *         concurrency: { maxConcurrent: 15 }
 *       }
 *     })
 *   ]
 * })
 * export class AppModule {}
 * ```
 */
@Global()
@Module({})
export class EventEmitterModule implements OnModuleInit {
  private readonly logger = new Logger(EventEmitterModule.name);

  static forRoot(options: EventEmitterOptions = {}): DynamicModule {
    return {
      module: EventEmitterModule,
      imports: [DiscoveryModule],
      providers: [
        {
          provide: EVENT_EMITTER_OPTIONS,
          useValue: options,
        },
        // Core services
        EventEmitterService,
        HandlerDiscoveryService,

        // Advanced services
        PersistenceService,
        MetricsService,
        DeadLetterQueueService,
        HandlerPoolService,
        DependencyAnalyzerService,
        HandlerExecutionService,
        StreamManagementService,
      ],
      exports: [
        // Export all services for external use
        EventEmitterService,
        HandlerDiscoveryService,
        PersistenceService,
        MetricsService,
        DeadLetterQueueService,
        HandlerPoolService,
        DependencyAnalyzerService,
        HandlerExecutionService,
        StreamManagementService,
      ],
    };
  }

  constructor(
    private readonly handlerDiscovery: HandlerDiscoveryService,
    private readonly eventEmitter: EventEmitterService,
    private readonly metricsService: MetricsService,
    private readonly dependencyAnalyzer: DependencyAnalyzerService,
  ) {}

  onModuleInit(): void {
    this.logger.log('Initializing Enhanced EventEmitter Module ...');

    try {
      // 1. Discover and register all event handlers
      this.logger.debug('Step 1: Discovering event handlers...');
      this.handlerDiscovery.discoverHandlers();
      const handlers = this.eventEmitter.getAllHandlers();
      this.logger.log(`Event handlers discovered: ${handlers.length} handlers found`);

      // 2. Register handlers with dependency analyzer
      this.logger.debug('Step 2: Registering handlers with dependency analyzer...');
      handlers.forEach((handler) => {
        this.dependencyAnalyzer.registerHandler(handler.metadata.eventName, handler);
      });

      const analysisResult = this.dependencyAnalyzer.getAnalysisResult();
      this.logger.log(`Handler analysis completed: ${analysisResult.totalHandlers} handlers registered`);

      // Check for circular dependencies (basic)
      const circularDependencies = this.dependencyAnalyzer.checkCircularDependencies();
      if (circularDependencies.length > 0) {
        this.logger.warn(`Found ${circularDependencies.length} circular dependencies`);
      }

      // 4. Log system health
      const systemMetrics = this.metricsService.getCurrentSystemMetrics();
      this.logger.log(`System health: ${systemMetrics.health.status} (score: ${systemMetrics.health.score}/100)`);

      if (systemMetrics.health.alerts.length > 0) {
        this.logger.warn('System alerts detected:');
        systemMetrics.health.alerts.forEach((alert) => {
          this.logger.warn(`  - ${alert}`);
        });
      }

      // 5. Log configuration summary

      this.logger.log('Enhanced EventEmitter Module  initialized successfully');
      this.logger.log('='.repeat(60));
    } catch (error: unknown) {
      this.logger.error('Failed to initialize Enhanced EventEmitter Module :', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }
}
