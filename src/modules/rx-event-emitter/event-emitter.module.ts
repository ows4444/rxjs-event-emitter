import { DynamicModule, Global, Module, OnModuleDestroy, OnModuleInit, Provider } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { EventEmitterService } from './event-emitter.service';
import { EventPersistenceService } from './event-persistence.service';
import { DeadLetterQueueService } from './dead-letter-queue.service';
import { EVENT_EMITTER_OPTIONS, EventEmitterOptions } from './event-emitter.interfaces';

@Global()
@Module({})
export class EventEmitterModule implements OnModuleInit, OnModuleDestroy {
  static forRoot(options?: EventEmitterOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: EVENT_EMITTER_OPTIONS,
        useValue: options || {},
      },
      EventEmitterService,
      EventPersistenceService,
      DeadLetterQueueService,
    ];

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
  ) {}

  async onModuleInit() {
    this.eventEmitter.discoverHandlers(this.discovery);
    await this.eventEmitter.replayUnprocessedEvents();
  }

  async onModuleDestroy() {
    await this.eventEmitter.gracefulShutdown();
  }
}
