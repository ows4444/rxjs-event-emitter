export { EventEmitterService, EventEmitterOptions } from './event-emitter.service';
export { HandlerDiscoveryService } from './handler-discovery.service';
export { PersistenceService } from './persistence.service';
export { MetricsService, EventMetrics, SystemMetrics, MetricsConfig } from './metrics.service';
export { DeadLetterQueueService } from './dead-letter-queue.service';
export { HandlerPoolService } from './handler-pool.service';
export {
  DependencyAnalyzerService,
  HandlerDependency,
  DependencyType,
  DependencyStrength,
  CircularDependency,
  DependencyAnalysisResult,
  ExecutionPlan,
} from './dependency-analyzer.service';
export {
  HandlerExecutionService,
  HandlerExecutionStats,
  ExecutionConfig,
  EnhancedExecutionContext,
  DetailedExecutionResult,
} from './handler-execution.service';
export {
  StreamManagementService,
  StreamConfig,
  BackpressureStrategy,
  ConcurrencyStrategy,
  ErrorStrategy,
  ManagedStream,
  StreamType,
  StreamHealth,
} from './stream-management.service';
