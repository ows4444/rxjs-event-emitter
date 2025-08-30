import { SetMetadata } from '@nestjs/common';
import type { HandlerOptions } from '../interfaces';
import { EVENT_HANDLER_METADATA, EVENT_HANDLER_OPTIONS } from '../interfaces';

/**
 * Decorator for marking methods as event handlers
 *
 * @param eventName - The name of the event to handle
 * @param options - Optional configuration for the handler
 * @returns Method decorator
 *
 * @example
 * ```typescript
 * class UserService {
 *   @EventHandler('user.created', { priority: 10 })
 *   async handleUserCreated(event: Event<UserCreatedPayload>) {
 *     // Handle user creation event
 *   }
 * }
 * ```
 */
export function EventHandler(eventName: string, options?: HandlerOptions): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    SetMetadata(EVENT_HANDLER_METADATA, eventName)(target, propertyKey, descriptor);
    SetMetadata(EVENT_HANDLER_OPTIONS, options ?? {})(target, propertyKey, descriptor);
    return descriptor;
  };
}
