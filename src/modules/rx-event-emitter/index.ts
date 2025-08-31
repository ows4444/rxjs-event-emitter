/**
 * @fileoverview RxJS Event Emitter  - Pure NestJS Implementation
 *
 * A clean, NestJS-native event emitter built on RxJS providing:
 * - Automatic handler discovery with decorators
 * - Type-safe event handling
 * - Built-in metrics and persistence
 * - Clean service-based architecture following NestJS patterns
 *
 * @version 2.0.0
 * @license MIT
 */

// =============================================================================
// CORE EXPORTS - Essential components
// =============================================================================

export { EventEmitterModule } from './event-emitter.module';
export { EventHandler } from './decorators';

// =============================================================================
// SERVICES - All injectable services
// =============================================================================

export {
  EventEmitterService,
  HandlerDiscoveryService,
  PersistenceService,
  MetricsService,
  DeadLetterQueueService,
  HandlerPoolService,
  DependencyAnalyzerService,
  HandlerExecutionService,
  StreamManagementService,
  // Additional exports for enhanced functionality
  EventMetrics,
  SystemMetrics,
  MetricsConfig,
  HandlerExecutionStats,
  ExecutionConfig,
  EnhancedExecutionContext,
  DetailedExecutionResult,
  StreamConfig,
  BackpressureStrategy,
  ConcurrencyStrategy,
  ErrorStrategy,
  ManagedStream,
  StreamType,
  StreamHealth,
} from './services';

// Import interfaces from interfaces module
export { HandlerDependency, DependencyType, DependencyStrength, CircularDependency, DependencyAnalysisResult, ExecutionPlan } from './interfaces';

// =============================================================================
// TYPE EXPORTS - All interfaces and types
// =============================================================================

export type { Event, EventMetadata, EmitOptions, HandlerOptions } from './interfaces';
export type { EventEmitterOptions } from './services';

// =============================================================================
// ENUM EXPORTS
// =============================================================================

export { EventPriority, EventStatus } from './interfaces';

// =============================================================================
// ADDITIONAL INTERFACES
// =============================================================================

export { PersistenceConfig } from './interfaces';

// =============================================================================
// ADAPTERS
// =============================================================================

export { InMemoryPersistenceAdapter } from './adapters';
