import { Observable, Subject } from 'rxjs';
import { takeUntil, finalize, share, shareReplay } from 'rxjs/operators';

/**
 * Performance utilities for RxJS event emitter optimizations
 */

/**
 * Lazy subject factory that creates subjects only when needed
 */
export class LazySubjectFactory<T> {
  private _subject?: Subject<T>;
  private readonly _destroyer$ = new Subject<void>();
  private readonly _factory: () => Subject<T>;

  constructor(factory?: () => Subject<T>) {
    this._factory = factory || (() => new Subject<T>());
  }

  /**
   * Gets the subject, creating it lazily if it doesn't exist
   */
  get subject(): Subject<T> {
    if (!this._subject) {
      this._subject = this._factory();

      // Auto-cleanup when no more subscribers
      this._subject
        .pipe(
          takeUntil(this._destroyer$),
          finalize(() => {
            this._subject = undefined;
          }),
        )
        .subscribe();
    }
    return this._subject;
  }

  /**
   * Gets the observable from the lazy subject
   */
  get observable(): Observable<T> {
    return this.subject.asObservable();
  }

  /**
   * Checks if the subject has been created
   */
  get isCreated(): boolean {
    return !!this._subject;
  }

  /**
   * Destroys the subject and cleans up resources
   */
  destroy(): void {
    this._destroyer$.next();
    this._destroyer$.complete();
    this._subject?.complete();
    this._subject = undefined;
  }

  /**
   * Emits a value through the lazy subject
   */
  next(value: T): void {
    this.subject.next(value);
  }

  /**
   * Completes the lazy subject
   */
  complete(): void {
    if (this._subject) {
      this._subject.complete();
    }
  }

  /**
   * Emits an error through the lazy subject
   */
  error(error: unknown): void {
    if (this._subject) {
      this._subject.error(error);
    }
  }
}

/**
 * Memory-efficient subject pool for reusing subjects
 */
export class SubjectPool<T> {
  private readonly _pool: Subject<T>[] = [];
  private readonly _maxPoolSize: number;

  constructor(maxPoolSize = 10) {
    this._maxPoolSize = maxPoolSize;
  }

  /**
   * Gets a subject from the pool or creates a new one
   */
  acquire(): Subject<T> {
    const subject = this._pool.pop() || new Subject<T>();
    return subject;
  }

  /**
   * Returns a subject to the pool for reuse
   */
  release(subject: Subject<T>): void {
    if (this._pool.length < this._maxPoolSize && !subject.closed) {
      // Reset the subject by creating a new one with the same observers
      this._pool.push(new Subject<T>());
    }
  }

  /**
   * Clears the pool and completes all subjects
   */
  clear(): void {
    this._pool.forEach((subject) => {
      if (!subject.closed) {
        subject.complete();
      }
    });
    this._pool.length = 0;
  }

  /**
   * Gets the current pool size
   */
  get size(): number {
    return this._pool.length;
  }
}

/**
 * Enhanced subject with automatic memory management
 */
export class ManagedSubject<T> extends Subject<T> {
  private readonly _cleanup$ = new Subject<void>();
  private _isDestroyed = false;

  constructor(private readonly _autoCleanupTimeoutMs = 60000) {
    super();
    this._setupAutoCleanup();
  }

  private _setupAutoCleanup(): void {
    // Auto-cleanup after timeout with no subscribers
    let cleanupTimer: NodeJS.Timeout;

    this.pipe(takeUntil(this._cleanup$)).subscribe({
      next: () => {
        clearTimeout(cleanupTimer);
        cleanupTimer = setTimeout(() => {
          if (this.observers.length === 0 && !this._isDestroyed) {
            this.destroy();
          }
        }, this._autoCleanupTimeoutMs);
      },
    });
  }

  /**
   * Destroys the subject and cleans up all resources
   */
  destroy(): void {
    if (this._isDestroyed) return;

    this._isDestroyed = true;
    this._cleanup$.next();
    this._cleanup$.complete();
    this.complete();
  }

  /**
   * Checks if the subject has been destroyed
   */
  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  override next(value: T): void {
    if (!this._isDestroyed) {
      super.next(value);
    }
  }

  override error(err: unknown): void {
    if (!this._isDestroyed) {
      super.error(err);
      this.destroy();
    }
  }

  override complete(): void {
    if (!this._isDestroyed) {
      super.complete();
      this.destroy();
    }
  }
}

/**
 * Optimized event router using Map for O(1) lookups
 */
export class EventRouter<T> {
  private readonly _routes = new Map<string, Set<(event: T) => void>>();
  private readonly _wildcardHandlers = new Set<(event: T) => void>();

  /**
   * Registers a handler for a specific route
   */
  register(route: string, handler: (event: T) => void): void {
    if (route === '*') {
      this._wildcardHandlers.add(handler);
      return;
    }

    if (!this._routes.has(route)) {
      this._routes.set(route, new Set());
    }
    this._routes.get(route)!.add(handler);
  }

  /**
   * Unregisters a handler for a specific route
   */
  unregister(route: string, handler: (event: T) => void): void {
    if (route === '*') {
      this._wildcardHandlers.delete(handler);
      return;
    }

    const handlers = this._routes.get(route);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this._routes.delete(route);
      }
    }
  }

  /**
   * Routes an event to all matching handlers
   */
  route(route: string, event: T): void {
    // Call specific handlers
    const handlers = this._routes.get(route);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Handler error for route ${route}:`, error);
        }
      });
    }

    // Call wildcard handlers
    this._wildcardHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error(`Wildcard handler error for route ${route}:`, error);
      }
    });
  }

  /**
   * Gets the number of handlers for a route
   */
  getHandlerCount(route: string): number {
    if (route === '*') {
      return this._wildcardHandlers.size;
    }
    return this._routes.get(route)?.size || 0;
  }

  /**
   * Gets all registered routes
   */
  getRoutes(): string[] {
    return Array.from(this._routes.keys());
  }

  /**
   * Clears all handlers
   */
  clear(): void {
    this._routes.clear();
    this._wildcardHandlers.clear();
  }
}

/**
 * Memory-efficient observable cache with automatic cleanup
 */
export class ObservableCache<K, V> {
  private readonly _cache = new Map<K, Observable<V>>();
  private readonly _maxSize: number;
  private readonly _accessOrder: K[] = [];

  constructor(maxSize = 100) {
    this._maxSize = maxSize;
  }

  /**
   * Gets or creates a cached observable
   */
  getOrCreate(key: K, factory: () => Observable<V>): Observable<V> {
    if (this._cache.has(key)) {
      this._updateAccessOrder(key);
      return this._cache.get(key)!;
    }

    const observable = factory().pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
      finalize(() => {
        this._cache.delete(key);
        this._removeFromAccessOrder(key);
      }),
    );

    this._cache.set(key, observable);
    this._accessOrder.push(key);

    this._enforceMaxSize();
    return observable;
  }

  private _updateAccessOrder(key: K): void {
    const index = this._accessOrder.indexOf(key);
    if (index > -1) {
      this._accessOrder.splice(index, 1);
      this._accessOrder.push(key);
    }
  }

  private _removeFromAccessOrder(key: K): void {
    const index = this._accessOrder.indexOf(key);
    if (index > -1) {
      this._accessOrder.splice(index, 1);
    }
  }

  private _enforceMaxSize(): void {
    while (this._cache.size > this._maxSize && this._accessOrder.length > 0) {
      const oldestKey = this._accessOrder.shift()!;
      this._cache.delete(oldestKey);
    }
  }

  /**
   * Clears the entire cache
   */
  clear(): void {
    this._cache.clear();
    this._accessOrder.length = 0;
  }

  /**
   * Gets the current cache size
   */
  get size(): number {
    return this._cache.size;
  }
}

/**
 * Creates a hot observable that automatically shares subscriptions
 */
export function createHotObservable<T>(source: Observable<T>): Observable<T> {
  return source.pipe(
    share({
      resetOnError: false,
      resetOnComplete: false,
      resetOnRefCountZero: true,
    }),
  );
}

/**
 * Creates a replay observable with automatic resource cleanup
 */
export function createReplayObservable<T>(source: Observable<T>, bufferSize = 1, windowTime?: number): Observable<T> {
  return source.pipe(
    shareReplay({
      bufferSize,
      windowTime,
      refCount: true,
    }),
  );
}
