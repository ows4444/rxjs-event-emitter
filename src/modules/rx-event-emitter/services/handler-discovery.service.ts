import { Injectable, Logger } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { EVENT_HANDLER_METADATA, EVENT_HANDLER_OPTIONS, HandlerOptions, RegisteredHandler } from '../interfaces';
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

    // Get handler options from decorator
    const handlerOptions = this.reflector.get<HandlerOptions>(EVENT_HANDLER_OPTIONS, instance[methodName] as (...args: unknown[]) => unknown) || {};

    const handler = async (event: unknown) => {
      const method = instance[methodName] as (...args: unknown[]) => unknown;
      await method.call(instance, event);
    };

    const handlerId = `${instance.constructor.name}.${methodName}@${eventName}`;

    // Create a proper RegisteredHandler with options
    const registeredHandler: RegisteredHandler = {
      eventName,
      handler,
      instance,
      options: handlerOptions,
      handlerId,
      metadata: {
        eventName,
        options: handlerOptions,
        className: instance.constructor.name,
        methodName,
        handlerId,
      },
    };

    // Use registerAdvancedHandler instead of registerHandler to preserve options
    this.eventEmitter.registerAdvancedHandler(registeredHandler);

    this.logger.log(`Registered event handler: ${instance.constructor.name}.${methodName} for event '${eventName}' with options:`, handlerOptions);
  }
}
