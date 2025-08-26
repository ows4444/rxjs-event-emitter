import { SetMetadata } from '@nestjs/common';
import type { HandlerOptions } from '../event-emitter.interfaces';
import { EVENT_HANDLER_METADATA, EVENT_HANDLER_OPTIONS } from '../event-emitter.interfaces';

export function EventHandler(eventName: string, options?: HandlerOptions): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    SetMetadata(EVENT_HANDLER_METADATA, eventName)(target, propertyKey, descriptor);
    SetMetadata(EVENT_HANDLER_OPTIONS, options ?? {})(target, propertyKey, descriptor);
    return descriptor;
  };
}
