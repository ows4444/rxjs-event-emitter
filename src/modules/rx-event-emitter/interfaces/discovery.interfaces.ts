// =============================================================================
// HANDLER DISCOVERY INTERFACES - Basic handler registration and metadata
// =============================================================================

/**
 * Handler discovery result
 */
export interface HandlerDiscoveryResult {
  readonly totalHandlers: number;
  readonly registeredHandlers: string[];
  readonly discoveryTimestamp: number;
  readonly errors: string[];
}

/**
 * Circular dependency detection result (basic)
 */
export interface CircularDependency {
  readonly cycle: readonly string[];
  readonly eventNames: readonly string[];
  readonly severity: 'error' | 'warning' | 'info';
}
