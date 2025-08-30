// =============================================================================
// PUBLIC API SURFACE - RxJS Event Emitter Library
// =============================================================================
// This file defines the public API boundaries for the library.
// Only exports listed here are considered part of the stable public API.

// ===== CORE MODULE EXPORTS =====
export { EventEmitterModule } from './event-emitter.module';
export { EventEmitterService } from './event-emitter.service';

// ===== DECORATOR EXPORTS =====
export { EventHandler } from './decorators/event-handler.decorator';

// ===== INTERFACE EXPORTS - PUBLIC API TYPES =====
export type {
  EventEmitterOptions,
  Event,
  EventMetadata,
  HandlerOptions,
  PersistenceAdapter,
  CircuitBreakerMetrics,
  ErrorRecoveryMetrics,
  PriorityValidationResult,
  HandlerPriorityMap,
} from './event-emitter.interfaces';

// ===== ENUM EXPORTS =====
export { CircuitBreakerState, PriorityValidationError } from './event-emitter.interfaces';

// ===== ADAPTER EXPORTS =====
export { InMemoryPersistenceAdapter } from './adapters/in-memory.adapter';

// ===== SERVICE EXPORTS =====
export { HandlerPoolService, MetricsService, HandlerDiscoveryService } from './services';

// =============================================================================
// INTERNAL/ADVANCED API - USE WITH CAUTION
// =============================================================================
// These exports are intended for advanced use cases and may change
// without major version updates. Use at your own risk.

export { EventPersistenceService, DeadLetterQueueService } from './internal';

// Internal interfaces for advanced users
export type { HandlerMetadata, DiscoveryCache, DiscoveryMetrics, PriorityConflict } from './event-emitter.interfaces';

// Internal constants - may be needed for custom implementations
export { EVENT_EMITTER_OPTIONS, EVENT_HANDLER_METADATA, EVENT_HANDLER_OPTIONS } from './event-emitter.interfaces';
