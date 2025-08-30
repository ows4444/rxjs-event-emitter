/**
 * @fileoverview RxJS Event Emitter - Modern Event-Driven Architecture for NestJS
 *
 * A comprehensive event emitter library built on RxJS providing:
 * - Type-safe event handling with decorators
 * - Advanced persistence and dead letter queues
 * - Circuit breakers and error recovery
 * - Handler discovery and dependency management
 * - Comprehensive monitoring and metrics
 *
 * @version 2.0.0
 * @license MIT
 */

// =============================================================================
// CORE EXPORTS - Essential components for event-driven applications
// =============================================================================

export { EventEmitterModule } from './event-emitter.module';
export { EventEmitterService } from './event-emitter.service';
export { EventHandler } from './decorators/event-handler.decorator';

// =============================================================================
// TYPE EXPORTS - All interfaces and types
// =============================================================================

// Core event types
export type { Event, EventMetadata, EmitOptions, EventStats, StreamMetrics } from './interfaces';

// Configuration types
export type {
  EventEmitterOptions,
  BackpressureConfig,
  ErrorRecoveryConfig,
  HandlerExecutionConfig,
  HandlerDiscoveryConfig,
  ValidationConfig,
  PersistenceConfig,
  DeadLetterQueueConfig,
  MonitoringConfig,
  TenantIsolationConfig,
  ModuleConfig,
} from './interfaces';

// Handler types
export type { HandlerOptions, HandlerMetadata, RegisteredHandler, HandlerExecutionContext, ExecutionResult, HandlerStats, HandlerPool } from './interfaces';

// Persistence types
export type { PersistenceAdapter, AsyncPersistenceAdapter, Transaction, PersistenceStats, EventQuery, QueryResult } from './interfaces';

// Discovery and dependency types
export type {
  DiscoveryCache,
  DiscoveryMetrics,
  PriorityConflict,
  PriorityValidationResult,
  HandlerPriorityMap,
  CircularDependency,
  DependencyGraph,
  HandlerIsolationMetrics,
} from './interfaces';

// =============================================================================
// ENUM EXPORTS - Constants and enumerations
// =============================================================================

export { EventStatus, EventPriority, CircuitBreakerState, PriorityValidationError } from './interfaces';

// =============================================================================
// BUILT-IN ADAPTERS - Ready-to-use persistence implementations
// =============================================================================

export { InMemoryPersistenceAdapter } from './adapters/in-memory.adapter';

// =============================================================================
// SERVICES - Advanced functionality for complex scenarios
// =============================================================================

export { HandlerPoolService, MetricsService, HandlerDiscoveryService, StreamManagementService, HandlerExecutionService } from './services';

export { EventPersistenceService, DeadLetterQueueService, DependencyAnalyzerService } from './internal';

// =============================================================================
// CONSTANTS - Dependency injection tokens
// =============================================================================

export { EVENT_EMITTER_OPTIONS, EVENT_HANDLER_METADATA, EVENT_HANDLER_OPTIONS } from './interfaces';
