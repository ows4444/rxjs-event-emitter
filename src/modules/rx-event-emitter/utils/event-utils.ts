import { Observable, EMPTY, from, of } from 'rxjs';
import { map, catchError, shareReplay, take } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import type { Event, EventMetadata } from '../event-emitter.interfaces';
import type { EventId, EventName, TenantId, CorrelationId, CausationId } from '../types/branded-types';
import { createEventId, createEventName } from '../types/branded-types';

/**
 * Utility functions for event operations to reduce code duplication and improve maintainability
 */

/**
 * Creates a unique event ID using UUID v4
 */
export function generateEventId(): EventId {
  return createEventId(uuidv4());
}

/**
 * Creates event metadata with default values and proper type safety
 */
export function createEventMetadata<T extends string>(eventName: EventName<T>, options: Partial<EventMetadata> = {}): EventMetadata {
  return {
    id: generateEventId(),
    name: eventName,
    timestamp: Date.now(),
    retryCount: 0,
    ...options,
  };
}

/**
 * Creates a complete event with type safety
 */
export function createEvent<T, K extends string>(eventName: EventName<K>, payload: T, metadata?: Partial<EventMetadata>): Event<T> {
  return {
    metadata: createEventMetadata(eventName, metadata),
    payload,
  };
}

/**
 * Creates a shareable hot observable that can be safely subscribed to multiple times
 * Uses shareReplay to ensure late subscribers receive the last emitted value
 */
export function createHotObservable<T>(source$: Observable<T>, bufferSize = 1): Observable<T> {
  return source$.pipe(shareReplay({ bufferSize, refCount: true }));
}

/**
 * Safely converts any value to an Observable with error handling
 */
export function toObservable<T>(value: T | Promise<T> | Observable<T>): Observable<T> {
  if (value instanceof Observable) {
    return value;
  }

  if (value instanceof Promise) {
    return from(value).pipe(
      catchError((error) => {
        console.error('Promise conversion error:', error);
        return EMPTY;
      }),
    );
  }

  return of(value);
}

/**
 * Creates a safe event handler wrapper that converts any return type to Observable<void>
 */
export function createSafeHandler<T>(handler: (event: Event<T>) => void | Promise<void> | Observable<void>): (event: Event<T>) => Observable<void> {
  return (event: Event<T>) => {
    try {
      const result = handler(event);
      return toObservable(result).pipe(
        map(() => void 0),
        take(1),
        catchError((error) => {
          console.error(`Handler error for event ${event.metadata.name}:`, error);
          return EMPTY;
        }),
      );
    } catch (error) {
      console.error(`Synchronous handler error for event ${event.metadata.name}:`, error);
      return EMPTY;
    }
  };
}

/**
 * Validates event metadata for completeness and correctness
 */
export function validateEventMetadata(metadata: EventMetadata): boolean {
  return !!(metadata.id && metadata.name && typeof metadata.timestamp === 'number' && metadata.timestamp > 0);
}

/**
 * Creates a correlation ID chain for event tracing
 */
export function createCorrelationChain(parentEvent?: Event, customCorrelationId?: CorrelationId): Pick<EventMetadata, 'correlationId' | 'causationId'> {
  if (parentEvent) {
    return {
      correlationId: parentEvent.metadata.correlationId || (parentEvent.metadata.id as unknown as CorrelationId),
      causationId: parentEvent.metadata.id as unknown as CausationId,
    };
  }

  const correlationId = customCorrelationId || (generateEventId() as unknown as CorrelationId);
  return {
    correlationId,
    causationId: correlationId as unknown as CausationId,
  };
}

/**
 * Utility to check if an event matches a specific filter pattern
 */
export function createEventFilter<T>(predicate: (event: Event<T>) => boolean): (event: Event<T>) => boolean {
  return (event: Event<T>) => {
    try {
      return predicate(event);
    } catch (error) {
      console.error('Event filter error:', error);
      return false;
    }
  };
}

/**
 * Creates a tenant-aware event filter
 */
export function createTenantFilter(tenantId: TenantId): <T>(event: Event<T>) => boolean {
  return <T>(event: Event<T>) => event.metadata.tenantId === tenantId;
}

/**
 * Utility to merge multiple event filters with AND logic
 */
export function mergeFilters<T>(...filters: Array<(event: Event<T>) => boolean>): (event: Event<T>) => boolean {
  return (event: Event<T>) => filters.every((filter) => filter(event));
}

/**
 * Utility to merge multiple event filters with OR logic
 */
export function mergeFiltersOr<T>(...filters: Array<(event: Event<T>) => boolean>): (event: Event<T>) => boolean {
  return (event: Event<T>) => filters.some((filter) => filter(event));
}

/**
 * Creates a debounced event name for rate limiting
 */
export function createDebouncedEventName<T extends string>(eventName: EventName<T>, windowMs: number): EventName<`${T}:debounced:${number}`> {
  return createEventName(`${eventName}:debounced:${windowMs}` as const);
}

/**
 * Utility to clone an event with new metadata
 */
export function cloneEventWithMetadata<T>(event: Event<T>, newMetadata: Partial<EventMetadata>): Event<T> {
  return {
    ...event,
    metadata: {
      ...event.metadata,
      ...newMetadata,
    },
  };
}

/**
 * Utility to extract event type from event name for debugging
 */
export function getEventType(eventName: EventName): string {
  const name = eventName as string;
  return name.split('.')[0] || name;
}

/**
 * Utility to create a retry event with incremented retry count
 */
export function createRetryEvent<T>(event: Event<T>): Event<T> {
  return cloneEventWithMetadata(event, {
    retryCount: (event.metadata.retryCount || 0) + 1,
    timestamp: Date.now(),
  });
}
