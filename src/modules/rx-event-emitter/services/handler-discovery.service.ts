import { Injectable, Logger } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { EVENT_HANDLER_METADATA } from '../interfaces';
import { EventEmitterService } from './event-emitter.service';

@Injectable()
export class HandlerDiscoveryService {
  private readonly logger = new Logger(HandlerDiscoveryService.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly eventEmitter: EventEmitterService,
  ) {}

  discoverHandlers(): void {
    const providers = this.discoveryService.getProviders();
    const controllers = this.discoveryService.getControllers();

    [...providers, ...controllers].forEach((wrapper: InstanceWrapper) => {
      const { instance } = wrapper as { instance: unknown };
      if (!instance || typeof instance !== 'object') {
        return;
      }

      this.scanForHandlers(instance);
    });
  }

  private scanForHandlers(instance: object): void {
    const prototype = Object.getPrototypeOf(instance) as object;

    this.metadataScanner.scanFromPrototype(instance as Record<string, unknown>, prototype, (methodName: string) =>
      this.registerHandlerIfDecorated(instance as Record<string, unknown>, methodName),
    );
  }

  private registerHandlerIfDecorated(instance: Record<string, unknown>, methodName: string): void {
    const eventName = this.reflector.get<string>(EVENT_HANDLER_METADATA, instance[methodName] as (...args: unknown[]) => unknown);

    if (!eventName) {
      return;
    }

    // Handler options available for future use
    // const _handlerOptions =
    //   this.reflector.get<HandlerOptions>(
    //     EVENT_HANDLER_OPTIONS,
    //     instance[methodName] as (...args: unknown[]) => unknown,
    //   ) || {};

    const handler = async (event: unknown) => {
      try {
        const method = instance[methodName] as (...args: unknown[]) => unknown;
        await method.call(instance, event);
      } catch (error: unknown) {
        this.logger.error(`Handler ${instance.constructor.name}.${methodName} failed for event ${eventName}:`, error);
        throw error;
      }
    };

    this.eventEmitter.registerHandler(eventName, handler);

    this.logger.log(`Registered event handler: ${instance.constructor.name}.${methodName} for event '${eventName}'`);
  }
}
