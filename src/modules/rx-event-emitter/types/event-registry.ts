import type { Observable } from 'rxjs';
import type { Event } from '../event-emitter.interfaces';
import type { EventName } from './branded-types';

/**
 * Type-safe event registry for mapping event names to their payload types
 * This enables IntelliSense and compile-time type checking for events
 */
export interface EventRegistry {
  // Example event types - users can extend this interface via module augmentation
  [key: string]: unknown;
}

/**
 * Extract event names from the event registry
 */
export type RegisteredEventName = EventName<keyof EventRegistry & string>;

/**
 * Extract payload type for a specific event name
 */
export type EventPayload<TEventName extends keyof EventRegistry> = EventRegistry[TEventName];

/**
 * Type-safe event with payload constraint based on event name
 */
export type TypedEvent<TEventName extends keyof EventRegistry = keyof EventRegistry> = Event<EventPayload<TEventName>>;

/**
 * Type-safe handler function with payload constraint
 */
export type TypedEventHandler<TEventName extends keyof EventRegistry> = (event: TypedEvent<TEventName>) => void | Promise<void> | Observable<void>;

/**
 * Type-safe emit function signature
 */
export type TypedEmitFunction = <TEventName extends keyof EventRegistry>(
  eventName: EventName<TEventName & string>,
  payload: EventPayload<TEventName>,
  metadata?: Partial<Event['metadata']>,
) => Observable<void>;

/**
 * Type-safe handler registration function signature
 */
export type TypedRegisterHandler = <TEventName extends keyof EventRegistry>(
  eventName: EventName<TEventName & string>,
  handler: TypedEventHandler<TEventName>,
  options?: HandlerOptions,
) => void;

/**
 * Enhanced handler options with type safety
 */
export interface HandlerOptions {
  priority?: number;
  filter?: <TEventName extends keyof EventRegistry>(event: TypedEvent<TEventName>) => boolean;
  transform?: <TEventName extends keyof EventRegistry>(event: TypedEvent<TEventName>) => Observable<TypedEvent<TEventName>>;
  timeout?: number;
  retryable?: boolean;
  isolated?: boolean;
  concurrent?: boolean;
}

/**
 * Utility type to make event registration type-safe
 * Users can augment this via module augmentation like:
 *
 * declare module '@your-package/rxjs-event-emitter' {
 *   interface EventRegistry {
 *     'user.created': { id: string; email: string };
 *     'order.placed': { orderId: string; amount: number };
 *   }
 * }
 */
export interface TypeSafeEventEmitter {
  emit: TypedEmitFunction;
  registerHandler: TypedRegisterHandler;
}

/**
 * Helper type to validate event registry structure
 */
export type ValidEventRegistry<T> = {
  [K in keyof T]: T[K] extends object ? T[K] : never;
};

/**
 * Module augmentation template for users
 * Users can extend this in their own code like:
 *
 * declare module '@your-package/rxjs-event-emitter' {
 *   interface EventRegistry {
 *     'user.created': { id: string; email: string };
 *     'order.placed': { orderId: string; amount: number };
 *   }
 * }
 */
