import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { BehaviorSubject, Subject, EMPTY, Observable, Subscription } from 'rxjs';
import { bufferTime, filter, groupBy, mergeMap, catchError, share, takeUntil, tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { Event, EmitOptions, EVENT_EMITTER_OPTIONS, EventStatus, RegisteredHandler } from '../interfaces';
import { MetricsService } from './metrics.service';
import { PersistenceService } from './persistence.service';
import { DeadLetterQueueService } from './dead-letter-queue.service';
import { HandlerExecutionService } from './handler-execution.service';
import { StreamManagementService, StreamType } from './stream-management.service';
import { HandlerPoolService } from './handler-pool.service';

export interface EventEmitterOptions {
  maxConcurrency?: number;
  bufferTimeMs?: number;
  defaultTimeout?: number;
  enableMetrics?: boolean;
  enablePersistence?: boolean;
  enableDeadLetterQueue?: boolean;
  enableAdvancedFeatures?: boolean;
  circuitBreaker?: {
    enabled?: boolean;
    failureThreshold?: number;
    recoveryTimeout?: number;
  };
  handlerPools?: {
    enabled?: boolean;
    defaultPoolSize?: number;
  };
  streamManagement?: {
    enabled?: boolean;
    backpressureStrategy?: string;
  };
}

@Injectable()
export class EventEmitterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventEmitterService.name);
  private readonly eventBus$ = new Subject<Event>();
  private readonly destroy$ = new Subject<void>();
  private readonly handlers = new Map<string, RegisteredHandler[]>();
  private readonly isShuttingDown$ = new BehaviorSubject<boolean>(false);
  private readonly managedEventStream$: Observable<Event>;
  private eventProcessingSubscription?: Subscription;

  // Enhanced integration flags
  private readonly advancedFeaturesEnabled: boolean;

  private readonly defaultOptions: Required<
    Omit<EventEmitterOptions, 'enableDeadLetterQueue' | 'enableAdvancedFeatures' | 'circuitBreaker' | 'handlerPools' | 'streamManagement'>
  > = {
    maxConcurrency: 10, // 10 concurrent events
    bufferTimeMs: 100, // 100 ms
    defaultTimeout: 30000, // 30 seconds
    enableMetrics: true, // Enabled by default
    enablePersistence: false, // Disabled by default
  };

  constructor(
    @Optional() @Inject(EVENT_EMITTER_OPTIONS) private readonly options: EventEmitterOptions = {},
    @Optional() private readonly metricsService?: MetricsService,
    @Optional() private readonly persistenceService?: PersistenceService,
    @Optional() private readonly dlqService?: DeadLetterQueueService,
    @Optional() private readonly handlerExecutionService?: HandlerExecutionService,
    @Optional() private readonly streamManagementService?: StreamManagementService,
    @Optional() private readonly handlerPoolService?: HandlerPoolService,
  ) {
    this.options = { ...this.defaultOptions, ...this.options };
    this.advancedFeaturesEnabled = this.options.enableAdvancedFeatures ?? true;

    // Create managed event stream if stream management is available and enabled
    try {
      this.managedEventStream$ =
        this.streamManagementService && this.advancedFeaturesEnabled && this.isStreamManagementEnabled()
          ? this.streamManagementService.createManagedStream('event-bus', this.eventBus$, StreamType.EVENT_BUS)
          : this.eventBus$;
    } catch (error) {
      this.logger.error('Failed to create managed stream, falling back to regular stream:', error);
      this.managedEventStream$ = this.eventBus$;
    }
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Enhanced EventEmitterService ...');

    if (this.advancedFeaturesEnabled) {
      this.logger.debug('Advanced features enabled - integrating with enhanced services');
    }

    this.setupEventProcessing();

    // Initialize advanced features if available
    if (this.advancedFeaturesEnabled && this.metricsService) {
      this.logger.debug('Metrics service integration active');
    }

    this.logger.log('Enhanced EventEmitterService  initialized successfully');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down EventEmitterService ...');
    this.isShuttingDown$.next(true);

    // Unsubscribe from event processing to stop timers
    if (this.eventProcessingSubscription) {
      this.eventProcessingSubscription.unsubscribe();
    }

    // Allow any pending bufferTime to complete
    await new Promise((resolve) => setTimeout(resolve, this.options.bufferTimeMs! + 10));

    this.destroy$.next();
    this.destroy$.complete();
    this.eventBus$.complete();
    this.isShuttingDown$.complete();

    this.logger.log('EventEmitterService  shutdown completed');
  }

  private setupEventProcessing(): void {
    const sourceStream =
      this.advancedFeaturesEnabled && this.streamManagementService && this.isStreamManagementEnabled() ? this.managedEventStream$ : this.eventBus$;

    const processedEvents$ = sourceStream.pipe(
      takeUntil(this.destroy$),
      filter(() => !this.isShuttingDown$.value),
      tap((event) => {
        // Record metrics if available
        if (this.advancedFeaturesEnabled && this.metricsService) {
          this.metricsService.recordEventEmitted(event);
        }
      }),
      groupBy((event) => event.metadata.name),
      mergeMap((group) =>
        group.pipe(
          bufferTime(this.options.bufferTimeMs!),
          filter((events) => events.length > 0),
          mergeMap((events) => this.processEventBatch(events), this.options.maxConcurrency),
          catchError((error) => {
            this.logger.error(`Error processing events for ${group.key}:`, error);
            return EMPTY;
          }),
        ),
      ),
      share(),
    );

    this.eventProcessingSubscription = processedEvents$.subscribe({
      next: () => {
        // Event processed - no action needed
      },
      error: (error: unknown) => this.logger.error('Event processing pipeline error:', error),
      complete: () => this.logger.log('Event processing pipeline completed'),
    });
  }

  private async processEventBatch(events: Event[]): Promise<void> {
    for (const event of events) {
      await this.processEvent(event);
    }
  }

  private async processEvent(event: Event): Promise<void> {
    const startTime = Date.now();
    const handlers = this.handlers.get(event.metadata.name) || [];

    if (handlers.length === 0) {
      this.logger.warn(`No handlers found for event: ${event.metadata.name}`);
      return;
    }

    const promises = handlers.map(async (handler) => {
      try {
        // Use advanced handler execution if available
        if (this.advancedFeaturesEnabled && this.handlerExecutionService) {
          const _executionResult = await this.handlerExecutionService.executeHandler(handler, event);
          // Execution completed (result is already handled by the execution service)
        } else {
          // Fallback to basic execution with timeout
          await Promise.race([
            handler.handler(event),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Handler timeout')), this.options.defaultTimeout)),
          ]);
        }

        // Record successful execution metrics
        const executionTime = Date.now() - startTime;
        if (this.advancedFeaturesEnabled && this.metricsService) {
          this.metricsService.recordEventProcessed(event, executionTime);
        }

        this.logger.debug(`Handler executed successfully for event: ${event.metadata.name}`);
      } catch (error: unknown) {
        const _executionTime = Date.now() - startTime;
        this.logger.error(`Handler failed for event ${event.metadata.name}:`, error instanceof Error ? error.message : String(error));

        // Record failed execution metrics
        if (this.advancedFeaturesEnabled && this.metricsService) {
          this.metricsService.recordEventFailed(event, error as Error);
        }

        // Send to dead letter queue if available
        if (this.advancedFeaturesEnabled && this.dlqService && this.options.enableDeadLetterQueue) {
          await this.dlqService.addEntry(event, error as Error);
          this.logger.debug(`Event ${event.metadata.id} sent to dead letter queue`);
        } else if (this.options.enableDeadLetterQueue) {
          this.logger.warn(`Event ${event.metadata.id} should be sent to DLQ but service not available`);
        }
      }
    });

    await Promise.allSettled(promises);
  }

  emit<T = unknown>(eventName: string, payload: T, options: EmitOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isShuttingDown$.value) {
        reject(new Error('EventEmitterService is shutting down'));
        return;
      }

      const event: Event<T> = {
        payload,
        metadata: {
          id: uuidv4(),
          name: eventName,
          timestamp: Date.now(),
          correlationId: options.correlationId || uuidv4(),
          causationId: options.causationId,
          version: 1,
          priority: options.priority,
          tenantId: options.tenantId,
          headers: options.headers,
        },
      };

      try {
        this.eventBus$.next(event);
        resolve();

        this.logger.debug(`Event emitted: ${eventName} (${event.metadata.id})`);
      } catch (error) {
        this.logger.error(`Failed to emit event ${eventName}:`, error);
        reject(error);
      }
    });
  }

  on(eventName: string, handler: (event: Event) => Promise<void>): void {
    // Create a basic RegisteredHandler for backward compatibility
    const handlerId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const registeredHandler: RegisteredHandler = {
      eventName,
      handler,
      instance: this,
      options: {},
      handlerId,
      metadata: {
        eventName,
        options: {},
        className: 'EventEmitterService',
        methodName: 'handle',
        handlerId,
      },
    };

    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName)!.push(registeredHandler);
    this.logger.debug(`Handler registered for event: ${eventName}`);
  }

  off(eventName: string, handler?: (event: Event) => Promise<void>): void {
    if (!this.handlers.has(eventName)) {
      return;
    }

    if (!handler) {
      this.handlers.delete(eventName);
      this.logger.debug(`All handlers removed for event: ${eventName}`);
    } else {
      const handlers = this.handlers.get(eventName)!;
      const index = handlers.findIndex((h) => h.handler === handler);
      if (index > -1) {
        handlers.splice(index, 1);
        if (handlers.length === 0) {
          this.handlers.delete(eventName);
        }
        this.logger.debug(`Handler removed for event: ${eventName}`);
      }
    }
  }

  getEventNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  getHandlerCount(eventName: string): number {
    return this.handlers.get(eventName)?.length || 0;
  }

  isShuttingDown(): boolean {
    return this.isShuttingDown$.value;
  }

  registerHandler(eventName: string, handler: (event: Event) => Promise<void>): void {
    this.on(eventName, handler);
  }

  registerAdvancedHandler(registeredHandler: RegisteredHandler): void {
    if (!this.handlers.has(registeredHandler.metadata.eventName)) {
      this.handlers.set(registeredHandler.metadata.eventName, []);
    }
    this.handlers.get(registeredHandler.metadata.eventName)!.push(registeredHandler);
    this.logger.debug(`Advanced handler registered for event: ${registeredHandler.metadata.eventName}`);
  }

  removeHandler(eventName: string, handler?: (event: Event) => Promise<void>): void {
    this.off(eventName, handler);
  }

  // Get all registered handlers for dependency analysis
  getAllHandlers(): RegisteredHandler[] {
    const allHandlers: RegisteredHandler[] = [];
    for (const handlers of this.handlers.values()) {
      allHandlers.push(...handlers);
    }
    return allHandlers;
  }

  // Enhanced emit with persistence support
  async emitWithPersistence<T = unknown>(eventName: string, payload: T, options: EmitOptions = {}): Promise<void> {
    const event = this.createEvent(eventName, payload, options);

    // Persist event if persistence is enabled
    if (this.advancedFeaturesEnabled && this.persistenceService && this.options.enablePersistence) {
      await this.persistenceService.save(event, EventStatus.PENDING);
    }

    return this.emit(eventName, payload, options);
  }

  private createEvent<T>(eventName: string, payload: T, options: EmitOptions): Event<T> {
    return {
      payload,
      metadata: {
        id: uuidv4(),
        name: eventName,
        timestamp: Date.now(),
        correlationId: options.correlationId || uuidv4(),
        causationId: options.causationId,
        version: 1,
        priority: options.priority,
        tenantId: options.tenantId,
        headers: options.headers,
      },
    };
  }

  private isStreamManagementEnabled(): boolean {
    const streamManagementConfig = this.options.streamManagement as { enabled?: boolean } | undefined;
    return streamManagementConfig?.enabled ?? true; // Default to true unless explicitly disabled
  }
}
