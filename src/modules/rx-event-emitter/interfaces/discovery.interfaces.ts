/**
 * @fileoverview Discovery interfaces for handler registration and dependency management
 * Type-safe handler discovery with caching and validation
 */

import type { HandlerMetadata } from './handler.interfaces';

/**
 * Cache for handler discovery results
 * Optimizes performance by caching reflection results
 */
export interface DiscoveryCache {
  /** Cached handlers by event name */
  readonly handlers: ReadonlyMap<string, readonly HandlerMetadata[]>;

  /** Provider hash cache for change detection */
  readonly providerHashes: ReadonlyMap<string, string>;

  /** Last discovery timestamp */
  readonly lastDiscoveryTime: number;

  /** Cache version for compatibility */
  readonly version: string;

  /** Cache statistics */
  readonly statistics: {
    /** Total providers cached */
    readonly totalProviders: number;
    /** Total handlers cached */
    readonly totalHandlers: number;
    /** Cache hit rate percentage */
    readonly cacheHitRate: number;
    /** Cache size in bytes */
    readonly sizeBytes: number;
    /** Cache entries count */
    readonly entryCount: number;
    /** Last cleanup time */
    readonly lastCleanup: number;
  };

  /** Cache expiration settings */
  readonly expiration: {
    /** TTL in milliseconds */
    readonly ttlMs: number;
    /** Last access times */
    readonly accessTimes: ReadonlyMap<string, number>;
    /** Expired entries count */
    readonly expiredEntries: number;
  };
}

/**
 * Metrics and performance data for handler discovery
 */
export interface DiscoveryMetrics {
  /** Total discovery time across all runs */
  readonly totalDiscoveryTime: number;

  /** Last discovery duration in milliseconds */
  readonly lastDiscoveryDuration: number;

  /** Cache hit count */
  readonly cacheHits: number;

  /** Cache miss count */
  readonly cacheMisses: number;

  /** Total handlers discovered */
  readonly handlersDiscovered: number;

  /** Total providers processed */
  readonly providersProcessed: number;

  /** Total reflection calls made */
  readonly reflectionCalls: number;

  /** Time saved by batch optimization */
  readonly batchOptimizationSaved?: number;

  /** Average provider processing time */
  readonly averageProviderProcessTime?: number;

  /** Peak memory usage during discovery */
  readonly peakMemoryUsage?: number;

  /** Performance bottleneck identification */
  readonly bottlenecks: {
    /** Slowest provider to process */
    readonly slowestProvider?: string;
    /** Slowest reflection call */
    readonly slowestReflectionCall?: string;
    /** Provider with most handlers */
    readonly largestProvider?: string;
    /** Most complex dependency graph */
    readonly mostComplexGraph?: string;
  };

  /** Error tracking statistics */
  readonly errors: {
    /** Reflection errors encountered */
    readonly reflectionErrors: number;
    /** Validation errors found */
    readonly validationErrors: number;
    /** Circular dependency errors */
    readonly circularDependencyErrors: number;
    /** Provider loading errors */
    readonly providerLoadingErrors: number;
    /** Metadata parsing errors */
    readonly metadataParsingErrors: number;
  };

  /** Discovery timeline */
  readonly timeline: readonly {
    /** Phase name */
    readonly phase: string;
    /** Phase start time */
    readonly startTime: number;
    /** Phase duration */
    readonly duration: number;
    /** Phase memory usage */
    readonly memoryUsage?: number;
  }[];
}

/**
 * Handler priority conflict information
 */
export interface PriorityConflict {
  /** Event name with conflicts */
  readonly eventName: string;

  /** Conflicting priority value */
  readonly priority: number;

  /** Handler IDs with same priority */
  readonly handlers: readonly string[];

  /** Strategy for resolving conflict */
  readonly resolutionStrategy: 'strict' | 'warn' | 'auto-increment' | 'manual';

  /** Whether conflict is resolved */
  readonly resolved: boolean;

  /** Suggested resolution */
  readonly suggestedResolution?: {
    /** New priority assignments */
    readonly newPriorities: ReadonlyMap<string, number>;
    /** Reasoning for resolution */
    readonly reasoning: string;
    /** Confidence level */
    readonly confidence: 'high' | 'medium' | 'low';
    /** Impact assessment */
    readonly impact: {
      /** Performance impact */
      readonly performance: 'none' | 'minimal' | 'moderate' | 'significant';
      /** Behavioral changes */
      readonly behavioral: readonly string[];
    };
  };

  /** Conflict severity */
  readonly severity: 'error' | 'warning' | 'info';

  /** First detected timestamp */
  readonly detectedAt: number;
}

/**
 * Result of priority validation process
 */
export interface PriorityValidationResult {
  /** Whether validation passed */
  readonly isValid: boolean;

  /** Priority conflicts found */
  readonly conflicts: readonly PriorityConflict[];

  /** Circular dependencies detected */
  readonly circularDependencies: readonly CircularDependency[];

  /** Validation warnings */
  readonly warnings: readonly string[];

  /** Automatically resolved priorities */
  readonly autoResolvedPriorities: ReadonlyMap<string, number>;

  /** Performance optimization suggestions */
  readonly optimizationSuggestions?: readonly string[];

  /** Validation statistics */
  readonly statistics: {
    /** Total handlers validated */
    readonly handlersValidated: number;
    /** Validation duration */
    readonly validationDuration: number;
    /** Memory used */
    readonly memoryUsed: number;
    /** Auto-fixes applied */
    readonly autoFixesApplied: number;
  };

  /** Validation errors */
  readonly errors: readonly ValidationError[];

  /** Dependency graph analysis */
  readonly dependencyAnalysis: {
    /** Graph complexity score */
    readonly complexityScore: number;
    /** Critical path length */
    readonly criticalPathLength: number;
    /** Parallelization opportunities */
    readonly parallelizationScore: number;
  };
}

/**
 * Priority mapping for individual handlers
 */
export interface HandlerPriorityMap {
  /** Unique handler identifier */
  readonly handlerId: string;

  /** Event name handler processes */
  readonly eventName: string;

  /** Original configured priority */
  readonly originalPriority: number;

  /** Final resolved priority */
  readonly resolvedPriority: number;

  /** Handler dependencies */
  readonly dependencies: readonly string[];

  /** Handlers that depend on this one */
  readonly dependents: readonly string[];

  /** Priority group identifier */
  readonly priorityGroup?: string;

  /** Topological sort level */
  readonly level: number;

  /** Whether handler is on critical path */
  readonly criticalPath: boolean;

  /** Execution order within level */
  readonly executionOrder: number;

  /** Priority resolution metadata */
  readonly metadata: {
    /** Resolution method used */
    readonly resolutionMethod: 'original' | 'auto-incremented' | 'dependency-based' | 'manual';
    /** Resolution timestamp */
    readonly resolvedAt: number;
    /** Conflicts resolved */
    readonly conflictsResolved: number;
    /** Impact on execution order */
    readonly executionImpact: 'none' | 'minimal' | 'significant';
  };
}

/**
 * Circular dependency detection result
 */
export interface CircularDependency {
  /** Handler IDs forming the cycle */
  readonly cycle: readonly string[];

  /** Event names involved in cycle */
  readonly eventNames: readonly string[];

  /** Severity of the circular dependency */
  readonly severity: 'error' | 'warning' | 'info';

  /** Whether cycle can be automatically fixed */
  readonly autoFixable: boolean;

  /** Suggested fix for the cycle */
  readonly suggestedFix?: {
    /** Edges to remove to break cycle */
    readonly removeEdges: readonly {
      readonly from: string;
      readonly to: string;
      readonly reason: string;
    }[];
    /** Reasoning for suggested fix */
    readonly reasoning: string;
    /** Fix confidence level */
    readonly confidence: 'high' | 'medium' | 'low';
    /** Alternative fixes */
    readonly alternatives?: readonly string[];
  };

  /** Cycle detection metadata */
  readonly metadata: {
    /** Cycle length */
    readonly length: number;
    /** Detection algorithm used */
    readonly detectionMethod: string;
    /** Detection timestamp */
    readonly detectedAt: number;
    /** Cycle complexity score */
    readonly complexity: number;
  };
}

/**
 * Complete dependency graph representation
 */
export interface DependencyGraph {
  /** Graph nodes (handlers) */
  readonly nodes: ReadonlyMap<string, DependencyNode>;

  /** Graph edges (dependencies) */
  readonly edges: readonly DependencyEdge[];

  /** Topological levels for parallel execution */
  readonly levels: ReadonlyMap<number, readonly string[]>;

  /** Critical path through the graph */
  readonly criticalPath: readonly string[];

  /** Circular dependencies found */
  readonly cycles: readonly CircularDependency[];

  /** Graph statistics */
  readonly stats: {
    /** Total nodes in graph */
    readonly totalNodes: number;
    /** Total edges in graph */
    readonly totalEdges: number;
    /** Maximum depth from any root */
    readonly maxDepth: number;
    /** Average node connectivity */
    readonly averageConnectivity: number;
    /** Graph density */
    readonly density: number;
    /** Strongly connected components */
    readonly stronglyConnectedComponents: number;
    /** Weakly connected components */
    readonly weaklyConnectedComponents: number;
  };

  /** Graph analysis results */
  readonly analysis: {
    /** Parallelization opportunities */
    readonly parallelizationScore: number;
    /** Complexity assessment */
    readonly complexityScore: number;
    /** Performance bottlenecks */
    readonly bottlenecks: readonly string[];
    /** Optimization recommendations */
    readonly optimizations: readonly string[];
  };

  /** Graph construction metadata */
  readonly metadata: {
    /** Construction timestamp */
    readonly constructedAt: number;
    /** Construction duration */
    readonly constructionDuration: number;
    /** Graph version */
    readonly version: string;
  };
}

/**
 * Individual node in dependency graph
 */
export interface DependencyNode {
  /** Unique handler identifier */
  readonly handlerId: string;

  /** Event name handled */
  readonly eventName: string;

  /** Topological level */
  readonly level: number;

  /** Number of incoming dependencies */
  readonly inDegree: number;

  /** Number of outgoing dependencies */
  readonly outDegree: number;

  /** Direct dependencies */
  readonly dependencies: readonly string[];

  /** Handlers dependent on this one */
  readonly dependents: readonly string[];

  /** Whether node is on critical path */
  readonly onCriticalPath: boolean;

  /** Handler metadata */
  readonly metadata: HandlerMetadata;

  /** Node analysis data */
  readonly analysis: {
    /** Node centrality score */
    readonly centralityScore: number;
    /** Node importance ranking */
    readonly importanceRank: number;
    /** Bottleneck potential */
    readonly bottleneckPotential: number;
    /** Fan-out complexity */
    readonly fanOutComplexity: number;
  };

  /** Execution characteristics */
  readonly execution: {
    /** Estimated execution time */
    readonly estimatedDuration: number;
    /** Resource requirements */
    readonly resourceRequirements: {
      readonly memory: number;
      readonly cpu: number;
    };
    /** Concurrency constraints */
    readonly concurrencyConstraints: readonly string[];
  };
}

/**
 * Edge connection in dependency graph
 */
export interface DependencyEdge {
  /** Source handler ID */
  readonly from: string;

  /** Target handler ID */
  readonly to: string;

  /** Dependency type */
  readonly type: 'explicit' | 'implicit' | 'priority-based' | 'data-flow' | 'temporal';

  /** Edge weight for optimization */
  readonly weight?: number;

  /** Dependency strength */
  readonly strength: 'strong' | 'weak' | 'optional';

  /** Edge metadata */
  readonly metadata: {
    /** Dependency reason */
    readonly reason: string;
    /** Detection method */
    readonly detectionMethod: 'annotation' | 'analysis' | 'inference';
    /** Confidence level */
    readonly confidence: number;
    /** Edge creation timestamp */
    readonly createdAt: number;
  };

  /** Performance characteristics */
  readonly performance: {
    /** Expected data transfer size */
    readonly dataTransferSize?: number;
    /** Communication latency */
    readonly latency?: number;
    /** Failure probability */
    readonly failureProbability?: number;
  };
}

/**
 * Metrics for handler isolation and resource usage
 */
export interface HandlerIsolationMetrics {
  /** Total isolation pools */
  readonly totalPools: number;

  /** Currently active pools */
  readonly activePools: number;

  /** Total active executions across all pools */
  readonly totalActiveExecutions: number;

  /** Total queued tasks */
  readonly totalQueuedTasks: number;

  /** Total dropped tasks due to overflow */
  readonly totalDroppedTasks: number;

  /** Average utilization across all pools */
  readonly averagePoolUtilization: number;

  /** Circuit breaker states by pool */
  readonly circuitBreakerStates: Readonly<Record<string, string>>;

  /** Pool-specific metrics */
  readonly poolMetrics: ReadonlyMap<
    string,
    {
      /** Pool utilization percentage */
      readonly utilization: number;
      /** Throughput in tasks/second */
      readonly throughput: number;
      /** Error rate percentage */
      readonly errorRate: number;
      /** Average task wait time */
      readonly averageWaitTime: number;
      /** Current queue depth */
      readonly queueDepth: number;
      /** Pool health score */
      readonly healthScore: number;
      /** Resource efficiency */
      readonly efficiency: number;
    }
  >;

  /** System resource usage */
  readonly resourceUsage: {
    /** Memory usage in MB */
    readonly memoryUsage: number;
    /** CPU usage percentage */
    readonly cpuUsage: number;
    /** Active thread count */
    readonly activeThreads: number;
    /** Available system resources */
    readonly availableResources: {
      readonly memory: number;
      readonly cpu: number;
      readonly threads: number;
    };
    /** Resource pressure indicators */
    readonly pressure: {
      readonly memory: 'low' | 'medium' | 'high' | 'critical';
      readonly cpu: 'low' | 'medium' | 'high' | 'critical';
      readonly threads: 'low' | 'medium' | 'high' | 'critical';
    };
  };

  /** Isolation effectiveness metrics */
  readonly isolation: {
    /** Cross-pool interference score */
    readonly interferenceScore: number;
    /** Fault containment effectiveness */
    readonly faultContainment: number;
    /** Resource sharing efficiency */
    readonly sharingEfficiency: number;
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

/**
 * Validation error details
 */
export interface ValidationError {
  /** Error type classification */
  readonly type: PriorityValidationError;

  /** Human-readable error message */
  readonly message: string;

  /** Handler ID associated with error */
  readonly handlerId?: string;

  /** Event name associated with error */
  readonly eventName?: string;

  /** Additional error context */
  readonly context?: Readonly<Record<string, unknown>>;

  /** Error severity level */
  readonly severity: 'error' | 'warning' | 'info';

  /** Whether error can be automatically fixed */
  readonly autoFixable: boolean;

  /** Suggested fix description */
  readonly suggestedFix?: string;

  /** Error location information */
  readonly location: {
    /** Source file */
    readonly file?: string;
    /** Line number */
    readonly line?: number;
    /** Column number */
    readonly column?: number;
    /** Method name */
    readonly method?: string;
  };

  /** Error detection metadata */
  readonly metadata: {
    /** Detection timestamp */
    readonly detectedAt: number;
    /** Detection rule ID */
    readonly ruleId: string;
    /** Rule confidence */
    readonly confidence: number;
  };
}

/**
 * Discovery profile configuration
 */
export interface DiscoveryProfile {
  /** Profile name */
  readonly name: string;

  /** Profile description */
  readonly description?: string;

  /** File patterns to scan */
  readonly scanPatterns: readonly string[];

  /** Patterns to exclude from scanning */
  readonly excludePatterns: readonly string[];

  /** Validation rules to apply */
  readonly validationRules: ValidationRules;

  /** Cache strategy */
  readonly cacheStrategy: 'aggressive' | 'conservative' | 'disabled' | 'adaptive';

  /** Performance thresholds */
  readonly performanceThresholds: {
    /** Maximum discovery time in ms */
    readonly maxDiscoveryTime: number;
    /** Maximum memory usage in MB */
    readonly maxMemoryUsage: number;
    /** Maximum reflection calls */
    readonly maxReflectionCalls: number;
    /** Maximum providers to process */
    readonly maxProviders: number;
    /** Timeout for individual provider processing */
    readonly providerTimeout: number;
  };

  /** Discovery optimization settings */
  readonly optimization: {
    /** Enable batch processing */
    readonly enableBatchProcessing: boolean;
    /** Batch size */
    readonly batchSize: number;
    /** Enable parallel processing */
    readonly enableParallelProcessing: boolean;
    /** Worker thread count */
    readonly workerThreads: number;
  };

  /** Profile metadata */
  readonly metadata: {
    /** Profile version */
    readonly version: string;
    /** Creation timestamp */
    readonly createdAt: number;
    /** Last modified timestamp */
    readonly modifiedAt: number;
    /** Profile author */
    readonly author?: string;
  };
}

/**
 * Validation rules configuration
 */
export interface ValidationRules {
  /** Require event name on handlers */
  readonly requireEventName: boolean;

  /** Allow dynamic event handlers */
  readonly allowDynamicEvents: boolean;

  /** Maximum handlers per event */
  readonly maxHandlersPerEvent: number;

  /** Enforce naming convention */
  readonly enforceNamingConvention: boolean;

  /** Naming pattern regex */
  readonly namingPattern?: RegExp;

  /** Required metadata fields */
  readonly requiredMetadata: readonly string[];

  /** Forbidden pattern list */
  readonly forbiddenPatterns: readonly string[];

  /** Complexity limits */
  readonly complexityLimits: {
    /** Maximum dependencies per handler */
    readonly maxDependencies: number;
    /** Maximum nesting level */
    readonly maxNestingLevel: number;
    /** Maximum cyclomatic complexity */
    readonly maxCyclomaticComplexity: number;
    /** Maximum parameter count */
    readonly maxParameterCount: number;
    /** Maximum method lines */
    readonly maxMethodLines: number;
  };

  /** Type validation rules */
  readonly typeValidation: {
    /** Enforce type safety */
    readonly enforceTypeSafety: boolean;
    /** Allow any types */
    readonly allowAnyTypes: boolean;
    /** Require return type annotations */
    readonly requireReturnTypes: boolean;
    /** Validate payload types */
    readonly validatePayloadTypes: boolean;
  };

  /** Documentation requirements */
  readonly documentation: {
    /** Require JSDoc comments */
    readonly requireJSDoc: boolean;
    /** Required JSDoc tags */
    readonly requiredTags: readonly string[];
    /** Minimum description length */
    readonly minDescriptionLength: number;
  };

  /** Security validation */
  readonly security: {
    /** Prevent unsafe patterns */
    readonly preventUnsafePatterns: boolean;
    /** Validate access permissions */
    readonly validatePermissions: boolean;
    /** Check for security vulnerabilities */
    readonly securityScan: boolean;
  };
}

/**
 * Optimization hint for performance improvements
 */
export interface OptimizationHint {
  /** Optimization category */
  readonly type: 'performance' | 'memory' | 'maintainability' | 'security' | 'scalability';

  /** Optimization priority */
  readonly priority: 'low' | 'medium' | 'high' | 'critical';

  /** Human-readable description */
  readonly description: string;

  /** Handlers that can benefit */
  readonly applicableHandlers: readonly string[];

  /** Estimated improvement impact */
  readonly estimatedImpact: {
    /** Performance gain percentage */
    readonly performanceGain?: number;
    /** Memory reduction percentage */
    readonly memoryReduction?: number;
    /** Complexity reduction score */
    readonly complexityReduction?: number;
    /** Throughput improvement */
    readonly throughputImprovement?: number;
    /** Latency reduction */
    readonly latencyReduction?: number;
  };

  /** Implementation difficulty */
  readonly implementationComplexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert';

  /** Optimization metadata */
  readonly metadata: {
    /** Optimization ID */
    readonly id: string;
    /** Detection algorithm */
    readonly detectionMethod: string;
    /** Confidence level */
    readonly confidence: number;
    /** Detection timestamp */
    readonly detectedAt: number;
  };

  /** Implementation details */
  readonly implementation: {
    /** Required changes */
    readonly requiredChanges: readonly string[];
    /** Risk assessment */
    readonly risks: readonly string[];
    /** Dependencies */
    readonly dependencies: readonly string[];
    /** Estimated effort in hours */
    readonly estimatedEffort: number;
  };

  /** Validation criteria */
  readonly validation: {
    /** Success criteria */
    readonly successCriteria: readonly string[];
    /** Rollback plan */
    readonly rollbackPlan?: string;
    /** Testing requirements */
    readonly testingRequirements: readonly string[];
  };
}

// =============================================================================
// BATCH PROCESSING INTERFACES - Discovery optimization
// =============================================================================

/**
 * Batch processing configuration for discovery optimization
 */
export interface DiscoveryBatch {
  /** Unique batch identifier */
  readonly batchId: string;

  /** Providers to process in this batch */
  readonly providers: readonly unknown[];

  /** Batch creation timestamp */
  readonly timestamp: number;

  /** Processing priority */
  readonly priority: number;

  /** Estimated processing time in milliseconds */
  readonly estimatedProcessingTime: number;

  /** Batch processing strategy */
  readonly strategy: 'sequential' | 'parallel' | 'adaptive';

  /** Resource constraints */
  readonly constraints: {
    /** Maximum memory usage */
    readonly maxMemory: number;
    /** Maximum processing time */
    readonly maxTime: number;
    /** Maximum concurrent workers */
    readonly maxWorkers: number;
  };
}

/**
 * Result of batch processing operation
 */
export interface BatchProcessingResult {
  /** Batch identifier */
  readonly batchId: string;

  /** Number of providers processed */
  readonly processedProviders: number;

  /** Handlers discovered in batch */
  readonly discoveredHandlers: readonly HandlerMetadata[];

  /** Total processing time in milliseconds */
  readonly processingTime: number;

  /** Memory used during processing */
  readonly memoryUsed: number;

  /** Errors encountered during processing */
  readonly errors: readonly ValidationError[];

  /** Cache updates made */
  readonly cacheUpdates: number;

  /** Processing statistics */
  readonly statistics: {
    /** Success rate */
    readonly successRate: number;
    /** Average provider processing time */
    readonly avgProviderTime: number;
    /** Peak memory usage */
    readonly peakMemoryUsage: number;
    /** Worker utilization */
    readonly workerUtilization: number;
  };

  /** Optimization metrics */
  readonly optimization: {
    /** Time saved vs sequential processing */
    readonly timeSaved: number;
    /** Memory efficiency score */
    readonly memoryEfficiency: number;
    /** Parallelization effectiveness */
    readonly parallelizationScore: number;
  };
}
