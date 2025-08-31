import { Injectable, Logger } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { EVENT_HANDLER_METADATA, EVENT_HANDLER_OPTIONS } from '../interfaces';
import { EventEmitterService } from './event-emitter.service';
import type { HandlerOptions } from '../interfaces';

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
      const { instance } = wrapper;
      if (!instance || typeof instance !== 'object') {
        return;
      }

      this.scanForHandlers(instance);
    });
  }

  private scanForHandlers(instance: any): void {
    const prototype = Object.getPrototypeOf(instance);

    this.metadataScanner.scanFromPrototype(instance, prototype, (methodName: string) => this.registerHandlerIfDecorated(instance, methodName));
  }

  private registerHandlerIfDecorated(instance: any, methodName: string): void {
    const eventName = this.reflector.get<string>(EVENT_HANDLER_METADATA, instance[methodName]);

    if (!eventName) {
      return;
    }

    // Handler options available for future use
    const _handlerOptions = this.reflector.get<HandlerOptions>(EVENT_HANDLER_OPTIONS, instance[methodName]) || {};

    const handler = async (event: any) => {
      try {
        await instance[methodName](event);
      } catch (error) {
        this.logger.error(`Handler ${instance.constructor.name}.${methodName} failed for event ${eventName}:`, error);
        throw error;
      }
    };

    this.eventEmitter.registerHandler(eventName, handler);

    this.logger.log(`Registered event handler: ${instance.constructor.name}.${methodName} for event '${eventName}'`);
  }
}
