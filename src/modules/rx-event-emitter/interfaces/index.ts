/**
 * @fileoverview Centralized export of all event emitter interfaces
 * Modern, type-safe interfaces for event-driven architecture
 */

// =============================================================================
// CORE INTERFACES - Event fundamentals
// =============================================================================

export * from './core.interfaces';

// =============================================================================
// HANDLER INTERFACES - Handler execution and management
// =============================================================================

export * from './handler.interfaces';

// =============================================================================
// CONFIGURATION INTERFACES - Type-safe configuration
// =============================================================================

export * from './configuration.interfaces';

// =============================================================================
// PERSISTENCE INTERFACES - Event storage and retrieval
// =============================================================================

export * from './persistence.interfaces';

// =============================================================================
// DISCOVERY INTERFACES - Handler discovery and dependency management
// =============================================================================

export * from './discovery.interfaces';

// =============================================================================
// DEPENDENCY INJECTION TOKENS
// =============================================================================

/** DI token for event emitter configuration */
export const EVENT_EMITTER_OPTIONS = Symbol('EVENT_EMITTER_OPTIONS');

/** Metadata key for event handler registration */
export const EVENT_HANDLER_METADATA = Symbol('EVENT_HANDLER_METADATA');

/** Metadata key for handler configuration */
export const EVENT_HANDLER_OPTIONS = Symbol('EVENT_HANDLER_OPTIONS');

// =============================================================================
// RE-EXPORT IMPORTANT ENUMS FOR CONVENIENCE
// =============================================================================

// Re-export key enums that are commonly used
export { EventStatus, EventPriority } from './core.interfaces';
export { CircuitBreakerState, IsolationStrategy, TimeoutStrategy, ResourceIsolation } from './handler.interfaces';
export { BackpressureStrategy, FaultToleranceMode, IsolationLevel, CacheStrategy, ShardingStrategy, IndexingStrategy } from './configuration.interfaces';
