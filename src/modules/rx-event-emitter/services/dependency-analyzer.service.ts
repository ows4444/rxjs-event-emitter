/**
 * Dependency Analyzer Service - Advanced handler dependency analysis and management
 */

import { Injectable, Logger, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { DiscoveryService, ModuleRef } from '@nestjs/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { RegisteredHandler, EVENT_EMITTER_OPTIONS } from '../interfaces';

/**
 * Dependency relationship between handlers
 */
export interface HandlerDependency {
  readonly handler: string;
  readonly dependsOn: string;
  readonly type: DependencyType;
  readonly strength: DependencyStrength;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Types of dependencies
 */
export enum DependencyType {
  SEQUENTIAL = 'sequential', // Handler must execute after another
  CONDITIONAL = 'conditional', // Handler executes if another succeeds
  EXCLUSIVE = 'exclusive', // Handlers cannot run simultaneously
  RESOURCE = 'resource', // Shared resource dependency
  DATA = 'data', // Data dependency (output -> input)
}

/**
 * Dependency strength levels
 */
export enum DependencyStrength {
  WEAK = 'weak', // Soft dependency, can proceed without
  STRONG = 'strong', // Hard dependency, must wait
  CRITICAL = 'critical', // Critical dependency, failure propagates
}

/**
 * Circular dependency information
 */
export interface CircularDependency {
  readonly cycle: string[];
  readonly type: 'direct' | 'indirect';
  readonly severity: 'warning' | 'error';
  readonly suggestedResolution: string[];
}

/**
 * Dependency analysis result
 */
export interface DependencyAnalysisResult {
  readonly totalHandlers: number;
  readonly totalDependencies: number;
  readonly circularDependencies: CircularDependency[];
  readonly isolatedHandlers: string[];
  readonly criticalPath: string[];
  readonly maxDepth: number;
  readonly analysisTimestamp: number;
  readonly warnings: string[];
  readonly errors: string[];
}

/**
 * Execution order information
 */
export interface ExecutionPlan {
  readonly phases: ExecutionPhase[];
  readonly totalPhases: number;
  readonly estimatedExecutionTime: number;
  readonly parallelizationOpportunities: number;
  readonly bottlenecks: string[];
}

/**
 * Execution phase (handlers that can run in parallel)
 */
export interface ExecutionPhase {
  readonly phase: number;
  readonly handlers: string[];
  readonly dependencies: HandlerDependency[];
  readonly estimatedDuration: number;
  readonly canRunInParallel: boolean;
}

/**
 * Dependency configuration
 */
export interface DependencyConfig {
  readonly enabled: boolean;
  readonly autoDetection: boolean;
  readonly strictMode: boolean;
  readonly maxAnalysisDepth: number;
  readonly circularDependencyHandling: 'error' | 'warning' | 'ignore';
  readonly optimization: {
    readonly enableParallelization: boolean;
    readonly maxParallelHandlers: number;
    readonly dependencyTimeout: number;
  };
}

@Injectable()
export class DependencyAnalyzerService implements OnModuleInit {
  private readonly logger = new Logger(DependencyAnalyzerService.name);

  private readonly dependencies = new Map<string, HandlerDependency[]>();
  private readonly dependents = new Map<string, Set<string>>();
  private readonly analysisResult$ = new BehaviorSubject<DependencyAnalysisResult>(this.createInitialResult());
  private readonly executionPlan$ = new BehaviorSubject<ExecutionPlan>(this.createInitialPlan());

  private readonly config: Required<DependencyConfig>;
  private readonly handlers = new Map<string, RegisteredHandler>();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly moduleRef: ModuleRef,
    @Optional() @Inject(EVENT_EMITTER_OPTIONS) private readonly options: any = {},
  ) {
    this.config = {
      enabled: true,
      autoDetection: true,
      strictMode: false,
      maxAnalysisDepth: 10,
      circularDependencyHandling: 'warning',
      optimization: {
        enableParallelization: true,
        maxParallelHandlers: 5,
        dependencyTimeout: 30000,
      },
      ...this.options?.dependencyAnalyzer,
    };
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.log('Dependency analysis is disabled');
      return;
    }

    this.logger.log('Initializing Dependency Analyzer Service...');

    if (this.config.autoDetection) {
      await this.performInitialAnalysis();
    }

    this.logger.log('Dependency Analyzer Service initialized successfully');
  }

  /**
   * Register handlers for dependency analysis
   */
  registerHandlers(handlers: RegisteredHandler[]): void {
    if (!this.config.enabled) return;

    handlers.forEach((handler) => {
      this.handlers.set(handler.metadata.eventName, handler);
    });

    this.analyzeHandlerDependencies();
    this.updateAnalysisResult();
  }

  /**
   * Add explicit dependency between handlers
   */
  addDependency(
    handler: string,
    dependsOn: string,
    type: DependencyType = DependencyType.SEQUENTIAL,
    strength: DependencyStrength = DependencyStrength.STRONG,
    metadata?: Record<string, unknown>,
  ): void {
    if (!this.config.enabled) return;

    const dependency: HandlerDependency = {
      handler,
      dependsOn,
      type,
      strength,
      metadata,
    };

    const handlerDeps = this.dependencies.get(handler) || [];
    handlerDeps.push(dependency);
    this.dependencies.set(handler, handlerDeps);

    // Update reverse mapping
    const dependents = this.dependents.get(dependsOn) || new Set();
    dependents.add(handler);
    this.dependents.set(dependsOn, dependents);

    this.updateAnalysisResult();
    this.logger.debug(`Added ${type} dependency: ${handler} depends on ${dependsOn}`);
  }

  /**
   * Remove dependency between handlers
   */
  removeDependency(handler: string, dependsOn: string): boolean {
    if (!this.config.enabled) return false;

    const handlerDeps = this.dependencies.get(handler);
    if (!handlerDeps) return false;

    const index = handlerDeps.findIndex((dep) => dep.dependsOn === dependsOn);
    if (index === -1) return false;

    handlerDeps.splice(index, 1);

    if (handlerDeps.length === 0) {
      this.dependencies.delete(handler);
    }

    // Update reverse mapping
    const dependents = this.dependents.get(dependsOn);
    if (dependents) {
      dependents.delete(handler);
      if (dependents.size === 0) {
        this.dependents.delete(dependsOn);
      }
    }

    this.updateAnalysisResult();
    this.logger.debug(`Removed dependency: ${handler} no longer depends on ${dependsOn}`);
    return true;
  }

  /**
   * Get all dependencies for a handler
   */
  getDependencies(handler: string): HandlerDependency[] {
    return this.dependencies.get(handler) || [];
  }

  /**
   * Get all handlers that depend on this handler
   */
  getDependents(handler: string): string[] {
    const dependents = this.dependents.get(handler);
    return dependents ? Array.from(dependents) : [];
  }

  /**
   * Check if there are circular dependencies
   */
  hasCircularDependencies(): boolean {
    return this.analysisResult$.value.circularDependencies.length > 0;
  }

  /**
   * Get circular dependencies
   */
  getCircularDependencies(): CircularDependency[] {
    return this.analysisResult$.value.circularDependencies;
  }

  /**
   * Get execution order for handlers
   */
  getExecutionOrder(handlers: string[]): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (handler: string): void => {
      if (visiting.has(handler)) {
        throw new Error(`Circular dependency detected involving ${handler}`);
      }
      if (visited.has(handler)) return;

      visiting.add(handler);

      const deps = this.getDependencies(handler);
      for (const dep of deps) {
        if (handlers.includes(dep.dependsOn)) {
          visit(dep.dependsOn);
        }
      }

      visiting.delete(handler);
      visited.add(handler);
      result.push(handler);
    };

    try {
      for (const handler of handlers) {
        visit(handler);
      }
      return result;
    } catch (_error) {
      this.logger.warn('Cannot determine execution order due to circular dependencies');
      return handlers; // Return original order as fallback
    }
  }

  /**
   * Generate execution plan with phases
   */
  generateExecutionPlan(handlers: string[]): ExecutionPlan {
    const phases: ExecutionPhase[] = [];
    const processed = new Set<string>();
    const remaining = new Set(handlers);
    let phaseNumber = 0;

    while (remaining.size > 0) {
      const currentPhase: string[] = [];

      // Find handlers with no unmet dependencies
      for (const handler of remaining) {
        const deps = this.getDependencies(handler).filter((dep) => handlers.includes(dep.dependsOn));

        const unmetDeps = deps.filter((dep) => !processed.has(dep.dependsOn));

        if (unmetDeps.length === 0) {
          currentPhase.push(handler);
        }
      }

      if (currentPhase.length === 0) {
        // Circular dependency or error - add remaining handlers
        this.logger.warn('Circular dependency detected, adding remaining handlers to final phase');
        currentPhase.push(...Array.from(remaining));
      }

      // Remove processed handlers
      for (const handler of currentPhase) {
        remaining.delete(handler);
        processed.add(handler);
      }

      const phaseDependencies = currentPhase.flatMap((handler) => this.getDependencies(handler)).filter((dep) => handlers.includes(dep.dependsOn));

      phases.push({
        phase: phaseNumber++,
        handlers: currentPhase,
        dependencies: phaseDependencies,
        estimatedDuration: this.estimatePhaseDuration(currentPhase),
        canRunInParallel: currentPhase.length > 1 && this.config.optimization.enableParallelization,
      });
    }

    const plan: ExecutionPlan = {
      phases,
      totalPhases: phases.length,
      estimatedExecutionTime: phases.reduce((sum, phase) => sum + phase.estimatedDuration, 0),
      parallelizationOpportunities: phases.filter((p) => p.canRunInParallel).length,
      bottlenecks: this.identifyBottlenecks(phases),
    };

    this.executionPlan$.next(plan);
    return plan;
  }

  /**
   * Validate dependency configuration
   */
  validateDependencies(): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for circular dependencies
    const circular = this.findCircularDependencies();
    if (circular.length > 0) {
      if (this.config.circularDependencyHandling === 'error') {
        errors.push(...circular.map((c) => `Circular dependency: ${c.cycle.join(' -> ')}`));
      } else if (this.config.circularDependencyHandling === 'warning') {
        warnings.push(...circular.map((c) => `Circular dependency: ${c.cycle.join(' -> ')}`));
      }
    }

    // Check for missing handlers
    for (const [handler, deps] of this.dependencies) {
      for (const dep of deps) {
        if (!this.handlers.has(dep.dependsOn)) {
          errors.push(`Handler ${handler} depends on non-existent handler ${dep.dependsOn}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get analysis results observable
   */
  getAnalysisResults(): Observable<DependencyAnalysisResult> {
    return this.analysisResult$.asObservable();
  }

  /**
   * Get current analysis results
   */
  getCurrentAnalysisResult(): DependencyAnalysisResult {
    return this.analysisResult$.value;
  }

  /**
   * Get execution plan observable
   */
  getExecutionPlan(): Observable<ExecutionPlan> {
    return this.executionPlan$.asObservable();
  }

  /**
   * Clear all dependencies
   */
  clearDependencies(): void {
    this.dependencies.clear();
    this.dependents.clear();
    this.updateAnalysisResult();
    this.logger.log('All dependencies cleared');
  }

  // Private methods

  private async performInitialAnalysis(): Promise<void> {
    // This would analyze the actual handler metadata for dependency hints
    // For now, we'll just initialize the analysis
    this.updateAnalysisResult();
  }

  private analyzeHandlerDependencies(): void {
    // Auto-detect dependencies based on handler metadata
    for (const [eventName, handler] of this.handlers) {
      const metadata = handler.metadata;

      // Check for explicit dependencies in metadata
      if (metadata.dependencies) {
        for (const dep of metadata.dependencies) {
          this.addDependency(eventName, dep, DependencyType.SEQUENTIAL);
        }
      }

      // Analyze method parameters for potential dependencies
      // This would require reflection on the actual handler methods
    }
  }

  private findCircularDependencies(): CircularDependency[] {
    const circular: CircularDependency[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const detectCycle = (handler: string): boolean => {
      if (recursionStack.has(handler)) {
        const cycleStart = path.indexOf(handler);
        const cycle = path.slice(cycleStart).concat(handler);
        circular.push({
          cycle,
          type: cycle.length === 2 ? 'direct' : 'indirect',
          severity: this.config.strictMode ? 'error' : 'warning',
          suggestedResolution: this.suggestResolution(cycle),
        });
        return true;
      }

      if (visited.has(handler)) return false;

      visited.add(handler);
      recursionStack.add(handler);
      path.push(handler);

      const deps = this.getDependencies(handler);
      for (const dep of deps) {
        if (detectCycle(dep.dependsOn)) {
          // Continue to find all cycles, don't return early
        }
      }

      recursionStack.delete(handler);
      path.pop();
      return false;
    };

    for (const handler of this.handlers.keys()) {
      if (!visited.has(handler)) {
        detectCycle(handler);
      }
    }

    return circular;
  }

  private suggestResolution(cycle: string[]): string[] {
    const suggestions: string[] = [];

    if (cycle.length === 2) {
      suggestions.push(`Consider making one dependency optional or conditional`);
      suggestions.push(`Use event-driven communication instead of direct dependencies`);
    } else {
      suggestions.push(`Break the cycle by removing the weakest dependency`);
      suggestions.push(`Introduce an intermediate event to decouple handlers`);
      suggestions.push(`Use a mediator pattern to coordinate execution`);
    }

    return suggestions;
  }

  private estimatePhaseDuration(handlers: string[]): number {
    // Simple estimation - would be based on actual handler performance data
    return handlers.length * 100; // 100ms per handler estimate
  }

  private identifyBottlenecks(phases: ExecutionPhase[]): string[] {
    const bottlenecks: string[] = [];

    for (const phase of phases) {
      if (phase.handlers.length === 1 && phase.estimatedDuration > 1000) {
        bottlenecks.push(`Phase ${phase.phase} has single slow handler: ${phase.handlers[0]}`);
      }

      const highDependencyHandlers = phase.handlers.filter((h) => this.getDependents(h).length > 3);

      bottlenecks.push(...highDependencyHandlers.map((h) => `Handler ${h} has many dependents and may become a bottleneck`));
    }

    return bottlenecks;
  }

  private updateAnalysisResult(): void {
    const circular = this.findCircularDependencies();
    const validation = this.validateDependencies();

    const totalDependencies = Array.from(this.dependencies.values()).reduce((sum, deps) => sum + deps.length, 0);

    const isolatedHandlers = Array.from(this.handlers.keys()).filter((h) => !this.dependencies.has(h) && !this.dependents.has(h));

    const criticalPath = this.calculateCriticalPath();
    const maxDepth = this.calculateMaxDepth();

    const result: DependencyAnalysisResult = {
      totalHandlers: this.handlers.size,
      totalDependencies,
      circularDependencies: circular,
      isolatedHandlers,
      criticalPath,
      maxDepth,
      analysisTimestamp: Date.now(),
      warnings: validation.warnings,
      errors: validation.errors,
    };

    this.analysisResult$.next(result);
  }

  private calculateCriticalPath(): string[] {
    // Find the longest dependency chain
    const visited = new Set<string>();
    let longestPath: string[] = [];

    const findPath = (handler: string, currentPath: string[]): string[] => {
      if (visited.has(handler)) return currentPath;

      visited.add(handler);
      let longestFromHere = [...currentPath, handler];

      const deps = this.getDependencies(handler);
      for (const dep of deps) {
        const pathFromDep = findPath(dep.dependsOn, [...currentPath, handler]);
        if (pathFromDep.length > longestFromHere.length) {
          longestFromHere = pathFromDep;
        }
      }

      visited.delete(handler);
      return longestFromHere;
    };

    for (const handler of this.handlers.keys()) {
      const path = findPath(handler, []);
      if (path.length > longestPath.length) {
        longestPath = path;
      }
    }

    return longestPath;
  }

  private calculateMaxDepth(): number {
    let maxDepth = 0;

    const getDepth = (handler: string, visited: Set<string> = new Set()): number => {
      if (visited.has(handler)) return 0; // Circular dependency

      visited.add(handler);
      const deps = this.getDependencies(handler);
      const maxDepthFromDeps = Math.max(0, ...deps.map((dep) => getDepth(dep.dependsOn, new Set(visited))));
      visited.delete(handler);

      return 1 + maxDepthFromDeps;
    };

    for (const handler of this.handlers.keys()) {
      const depth = getDepth(handler);
      if (depth > maxDepth) {
        maxDepth = depth;
      }
    }

    return maxDepth;
  }

  private createInitialResult(): DependencyAnalysisResult {
    return {
      totalHandlers: 0,
      totalDependencies: 0,
      circularDependencies: [],
      isolatedHandlers: [],
      criticalPath: [],
      maxDepth: 0,
      analysisTimestamp: Date.now(),
      warnings: [],
      errors: [],
    };
  }

  private createInitialPlan(): ExecutionPlan {
    return {
      phases: [],
      totalPhases: 0,
      estimatedExecutionTime: 0,
      parallelizationOpportunities: 0,
      bottlenecks: [],
    };
  }
}
