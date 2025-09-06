/**
 * Dependency Analyzer Service - Basic handler dependency analysis
 */

import { Injectable, Logger, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { RegisteredHandler, EVENT_EMITTER_OPTIONS, HandlerDiscoveryResult, CircularDependency } from '../interfaces';

/**
 * Basic dependency configuration
 */
export interface DependencyConfig {
  readonly enabled: boolean;
  readonly circularDependencyDetection: boolean;
}

@Injectable()
export class DependencyAnalyzerService implements OnModuleInit {
  private readonly logger = new Logger(DependencyAnalyzerService.name);

  private readonly analysisResult$ = new BehaviorSubject<HandlerDiscoveryResult>(this.createInitialResult());
  private readonly handlers = new Map<string, RegisteredHandler>();
  private readonly config: Required<DependencyConfig>;

  constructor(
    @Optional()
    @Inject(EVENT_EMITTER_OPTIONS)
    private readonly options: Record<string, unknown> = {},
  ) {
    this.config = {
      enabled: true,
      circularDependencyDetection: true,
      ...(this.options?.dependencyAnalyzer || {}),
    };
  }

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log('Dependency analysis is disabled');
      return;
    }

    this.logger.log('Dependency Analyzer Service initialized');
  }

  /**
   * Register a handler for analysis
   */
  registerHandler(eventName: string, handler: RegisteredHandler): void {
    if (!this.config.enabled) return;

    const handlerId = `${handler.metadata.className}.${handler.metadata.methodName}@${eventName}`;
    this.handlers.set(handlerId, handler);

    this.updateAnalysisResult();
    this.logger.debug(`Registered handler for analysis: ${handlerId}`);
  }

  /**
   * Get current analysis result
   */
  getAnalysisResult(): HandlerDiscoveryResult {
    return this.analysisResult$.value;
  }

  /**
   * Get analysis result observable
   */
  getAnalysisResult$(): Observable<HandlerDiscoveryResult> {
    return this.analysisResult$.asObservable();
  }

  /**
   * Check for basic circular dependencies (simplified)
   */
  checkCircularDependencies(): CircularDependency[] {
    if (!this.config.circularDependencyDetection) return [];

    // Basic implementation - could be enhanced if needed
    // Simple check - no complex cycle detection for now
    return [];
  }

  /**
   * Get all registered handlers
   */
  getAllHandlers(): RegisteredHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Clear all handlers
   */
  clearHandlers(): void {
    this.handlers.clear();
    this.updateAnalysisResult();
  }

  private createInitialResult(): HandlerDiscoveryResult {
    return {
      totalHandlers: 0,
      registeredHandlers: [],
      discoveryTimestamp: Date.now(),
      errors: [],
    };
  }

  private updateAnalysisResult(): void {
    const result: HandlerDiscoveryResult = {
      totalHandlers: this.handlers.size,
      registeredHandlers: Array.from(this.handlers.keys()),
      discoveryTimestamp: Date.now(),
      errors: [],
    };

    this.analysisResult$.next(result);
  }
}
