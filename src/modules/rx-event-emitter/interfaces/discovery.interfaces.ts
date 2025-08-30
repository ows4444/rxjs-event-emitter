/**
 * Handler discovery and dependency analysis interfaces
 * Contains discovery cache, metrics, and validation definitions
 */

import type { HandlerMetadata } from './handler.interfaces';

export interface DiscoveryCache {
  handlers: Map<string, HandlerMetadata[]>;
  providerHashes: Map<string, string>;
  lastDiscoveryTime: number;
  version: string;
  statistics: {
    totalProviders: number;
    totalHandlers: number;
    cacheHitRate: number;
  };
}

export interface DiscoveryMetrics {
  totalDiscoveryTime: number;
  lastDiscoveryDuration: number;
  cacheHits: number;
  cacheMisses: number;
  handlersDiscovered: number;
  providersProcessed: number;
  reflectionCalls: number;
  batchOptimizationSaved?: number;
  averageProviderProcessTime?: number;
  peakMemoryUsage?: number;

  // Performance metrics
  bottlenecks: {
    slowestProvider?: string;
    slowestReflectionCall?: string;
    largestProvider?: string;
  };

  // Error tracking
  errors: {
    reflectionErrors: number;
    validationErrors: number;
    circularDependencyErrors: number;
  };
}

export interface PriorityConflict {
  eventName: string;
  priority: number;
  handlers: string[];
  resolutionStrategy: 'strict' | 'warn' | 'auto-increment';
  resolved: boolean;
  suggestedResolution?: {
    newPriorities: Map<string, number>;
    reasoning: string;
  };
}

export interface PriorityValidationResult {
  isValid: boolean;
  conflicts: PriorityConflict[];
  circularDependencies: CircularDependency[];
  warnings: string[];
  autoResolvedPriorities: Map<string, number>;
  optimizationSuggestions?: string[];
}

export interface HandlerPriorityMap {
  handlerId: string;
  eventName: string;
  originalPriority: number;
  resolvedPriority: number;
  dependencies: string[];
  dependents: string[];
  priorityGroup?: string;
  level: number; // Topological level
  criticalPath: boolean; // Is this handler on the critical path
}

export interface CircularDependency {
  cycle: string[];
  eventNames: string[];
  severity: 'error' | 'warning';
  autoFixable: boolean;
  suggestedFix?: {
    removeEdges: Array<{ from: string; to: string }>;
    reasoning: string;
  };
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: DependencyEdge[];
  levels: Map<number, string[]>; // Topological levels
  criticalPath: string[];
  cycles: CircularDependency[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    maxDepth: number;
    averageConnectivity: number;
  };
}

export interface DependencyNode {
  handlerId: string;
  eventName: string;
  level: number;
  inDegree: number;
  outDegree: number;
  dependencies: string[];
  dependents: string[];
  onCriticalPath: boolean;
  metadata: HandlerMetadata;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'explicit' | 'implicit' | 'priority-based';
  weight?: number;
  strength: 'strong' | 'weak';
}

export interface HandlerIsolationMetrics {
  totalPools: number;
  activePools: number;
  totalActiveExecutions: number;
  totalQueuedTasks: number;
  totalDroppedTasks: number;
  averagePoolUtilization: number;
  circuitBreakerStates: Record<string, string>;

  // Pool-specific metrics
  poolMetrics: Map<
    string,
    {
      utilization: number;
      throughput: number;
      errorRate: number;
      averageWaitTime: number;
      queueDepth: number;
    }
  >;

  // Resource usage
  resourceUsage: {
    memoryUsage: number;
    cpuUsage: number;
    activeThreads: number;
  };
}

export enum PriorityValidationError {
  CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',
  DUPLICATE_PRIORITY = 'DUPLICATE_PRIORITY',
  INVALID_DEPENDENCY = 'INVALID_DEPENDENCY',
  PRIORITY_OVERFLOW = 'PRIORITY_OVERFLOW',
  MISSING_HANDLER = 'MISSING_HANDLER',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
}

export interface ValidationError {
  type: PriorityValidationError;
  message: string;
  handlerId?: string;
  eventName?: string;
  context?: Record<string, unknown>;
  severity: 'error' | 'warning' | 'info';
  autoFixable: boolean;
  suggestedFix?: string;
}

export interface DiscoveryProfile {
  name: string;
  description?: string;
  scanPatterns: string[];
  excludePatterns: string[];
  validationRules: ValidationRules;
  cacheStrategy: 'aggressive' | 'conservative' | 'disabled';
  performanceThresholds: {
    maxDiscoveryTime: number;
    maxMemoryUsage: number;
    maxReflectionCalls: number;
  };
}

export interface ValidationRules {
  requireEventName: boolean;
  allowDynamicEvents: boolean;
  maxHandlersPerEvent: number;
  enforceNamingConvention: boolean;
  namingPattern?: RegExp;
  requiredMetadata: string[];
  forbiddenPatterns: string[];
  complexityLimits: {
    maxDependencies: number;
    maxNestingLevel: number;
    maxCyclomaticComplexity: number;
  };
}

export interface OptimizationHint {
  type: 'performance' | 'memory' | 'maintainability';
  priority: 'low' | 'medium' | 'high';
  description: string;
  applicableHandlers: string[];
  estimatedImpact: {
    performanceGain?: number;
    memoryReduction?: number;
    complexityReduction?: number;
  };
  implementationComplexity: 'trivial' | 'simple' | 'moderate' | 'complex';
}

// Batch processing interfaces for discovery optimization
export interface DiscoveryBatch {
  batchId: string;
  providers: unknown[];
  timestamp: number;
  priority: number;
  estimatedProcessingTime: number;
}

export interface BatchProcessingResult {
  batchId: string;
  processedProviders: number;
  discoveredHandlers: HandlerMetadata[];
  processingTime: number;
  memoryUsed: number;
  errors: ValidationError[];
  cacheUpdates: number;
}
