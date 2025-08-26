/**
 * Branded types for enhanced type safety in the event system.
 * These types prevent accidental mixing of different string types and provide better IntelliSense.
 */

/**
 * Branded type for event names to prevent mixing with regular strings
 */
export type EventName<T extends string = string> = T & { readonly __brand: 'EventName' };

/**
 * Branded type for event IDs to ensure type safety
 */
export type EventId = string & { readonly __brand: 'EventId' };

/**
 * Branded type for tenant IDs
 */
export type TenantId = string & { readonly __brand: 'TenantId' };

/**
 * Branded type for correlation IDs
 */
export type CorrelationId = string & { readonly __brand: 'CorrelationId' };

/**
 * Branded type for causation IDs
 */
export type CausationId = string & { readonly __brand: 'CausationId' };

/**
 * Utility function to create a branded EventName
 */
export function createEventName<T extends string>(name: T): EventName<T> {
  return name as EventName<T>;
}

/**
 * Utility function to create a branded EventId
 */
export function createEventId(id: string): EventId {
  return id as EventId;
}

/**
 * Utility function to create a branded TenantId
 */
export function createTenantId(id: string): TenantId {
  return id as TenantId;
}

/**
 * Utility function to create a branded CorrelationId
 */
export function createCorrelationId(id: string): CorrelationId {
  return id as CorrelationId;
}

/**
 * Utility function to create a branded CausationId
 */
export function createCausationId(id: string): CausationId {
  return id as CausationId;
}

/**
 * Type guard to check if a string is a valid EventName
 */
export function isEventName(value: string): value is EventName {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard to check if a string is a valid EventId
 */
export function isEventId(value: string): value is EventId {
  return typeof value === 'string' && value.length > 0;
}
