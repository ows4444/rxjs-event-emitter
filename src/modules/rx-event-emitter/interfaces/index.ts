// =============================================================================
// CORE INTERFACES - Event fundamentals
// =============================================================================

export * from './core.interfaces';

// =============================================================================
// HANDLER INTERFACES - Handler execution and management
// =============================================================================

export * from './handler.interfaces';
export { PoolRegisteredHandler } from './pool.interfaces';

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

// Export specific interfaces to avoid conflicts
export { HandlerDiscoveryResult, CircularDependency } from './discovery.interfaces';

// =============================================================================
// DEAD LETTER QUEUE INTERFACES - Failed event handling
// =============================================================================

export * from './dead-letter-queue.interfaces';

// =============================================================================
// POOL INTERFACES - Handler pools and isolation
// =============================================================================

// Export specific interfaces to avoid conflicts with discovery.interfaces
export { HandlerStats, ResourceUsageMetrics, IsolationMetrics, PoolMetrics } from './pool.interfaces';
export { HandlerPoolStats } from './handler.interfaces';
// Use HandlerIsolationMetrics from pool.interfaces (more specific)
export { HandlerIsolationMetrics } from './pool.interfaces';
// Export HandlerPool from core interfaces (main interface)
export { HandlerPool } from './core.interfaces';

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
export { BackpressureStrategy } from './configuration.interfaces';
