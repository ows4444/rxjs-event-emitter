import { Injectable, Logger } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { createHash } from 'crypto';
import { DiscoveryCache, DiscoveryMetrics, EVENT_HANDLER_METADATA, HandlerMetadata, HandlerOptions } from '../event-emitter.interfaces';

interface RegisteredHandler {
  eventName: string;
  handler: (...args: unknown[]) => unknown;
  instance: unknown;
  options: HandlerOptions;
  handlerId: string;
}

@Injectable()
export class HandlerDiscoveryService {
  private readonly logger = new Logger(HandlerDiscoveryService.name);

  private readonly discoveryCache: DiscoveryCache = {
    handlers: new Map(),
    providerHashes: new Map(),
    lastDiscoveryTime: 0,
    version: '1.0.0',
  };

  private readonly discoveryMetrics: DiscoveryMetrics = {
    totalDiscoveryTime: 0,
    lastDiscoveryDuration: 0,
    cacheHits: 0,
    cacheMisses: 0,
    handlersDiscovered: 0,
    providersProcessed: 0,
    reflectionCalls: 0,
    batchOptimizationSaved: 0,
    averageProviderProcessTime: 0,
    peakMemoryUsage: 0,
  };

  private readonly preloadedMetadata = new Map<string, Map<string, { eventName: string; options: HandlerOptions }>>();

  discoverHandlers(discovery: DiscoveryService): Map<string, RegisteredHandler[]> {
    const startTime = performance.now();
    const handlers = new Map<string, RegisteredHandler[]>();

    try {
      // Check if we can use cached results
      const currentTime = Date.now();
      if (currentTime - this.discoveryCache.lastDiscoveryTime < 30000) {
        // 30 second cache
        this.discoveryMetrics.cacheHits++;
        this.logger.debug('Using cached handler discovery results');
        return new Map(this.discoveryCache.handlers as Iterable<readonly [string, RegisteredHandler[]]>);
      }

      this.discoveryMetrics.cacheMisses++;
      const providers = discovery.getProviders();

      // Batch process providers for better performance
      const batchSize = 50;
      const providerBatches = this.chunkArray(Array.from(providers), batchSize);

      for (const batch of providerBatches) {
        this.processBatch(batch, handlers);
      }

      // Update cache
      this.discoveryCache.handlers = new Map(handlers as Iterable<readonly [string, HandlerMetadata[]]>);
      this.discoveryCache.lastDiscoveryTime = currentTime;

      // Update metrics
      const discoveryDuration = performance.now() - startTime;
      this.discoveryMetrics.lastDiscoveryDuration = discoveryDuration;
      this.discoveryMetrics.totalDiscoveryTime += discoveryDuration;
      this.discoveryMetrics.handlersDiscovered = Array.from(handlers.values()).reduce((sum, arr) => sum + arr.length, 0);
      this.discoveryMetrics.providersProcessed = providers.length;

      this.logger.debug(
        `Handler discovery completed in ${discoveryDuration.toFixed(2)}ms. Found ${this.discoveryMetrics.handlersDiscovered} handlers from ${providers.length} providers.`,
      );

      return handlers;
    } catch (error) {
      this.logger.error('Handler discovery failed:', error);
      throw error;
    }
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private processBatch(providers: InstanceWrapper[], handlers: Map<string, RegisteredHandler[]>): void {
    for (const wrapper of providers) {
      this.processProvider(wrapper, handlers);
    }
  }

  private processProvider(wrapper: InstanceWrapper, handlers: Map<string, RegisteredHandler[]>): void {
    const providerStartTime = performance.now();

    try {
      if (!wrapper.instance || typeof wrapper.instance !== 'object') {
        return;
      }

      // Generate provider hash for caching
      const providerHash = this.generateProviderHash(wrapper);

      // Check if we've already processed this provider version
      if (this.discoveryCache.providerHashes.has(String(wrapper.name)) && this.discoveryCache.providerHashes.get(String(wrapper.name)) === providerHash) {
        this.discoveryMetrics.batchOptimizationSaved++;
        return;
      }

      const instance = wrapper.instance;
      const prototype = Object.getPrototypeOf(instance);

      // Batch reflection calls for all methods
      const methodNames = Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor' && typeof prototype[name] === 'function');

      const methodHandlers = this.batchReflectMethods(instance, prototype, methodNames);

      // Register discovered handlers
      for (const { eventName, handler, options } of methodHandlers) {
        const handlerId = this.generateHandlerId(String(wrapper.name) || 'unknown', eventName, String(handler.name));

        if (!handlers.has(eventName)) {
          handlers.set(eventName, []);
        }

        handlers.get(eventName).push({
          eventName,
          handler,
          instance,
          options,
          handlerId,
        });
      }

      // Cache the provider hash
      this.discoveryCache.providerHashes.set(String(wrapper.name), providerHash);

      const processingTime = performance.now() - providerStartTime;
      this.discoveryMetrics.averageProviderProcessTime = (this.discoveryMetrics.averageProviderProcessTime + processingTime) / 2;
    } catch (error) {
      this.logger.warn(`Error processing provider ${wrapper.name}:`, error);
    }
  }

  private batchReflectMethods(
    instance: any,
    prototype: any,
    methodNames: string[],
  ): { eventName: string; handler: (...args: unknown[]) => unknown; options: HandlerOptions }[] {
    const results: { eventName: string; handler: (...args: unknown[]) => unknown; options: HandlerOptions }[] = [];

    // Batch metadata reflection
    for (const methodName of methodNames) {
      this.discoveryMetrics.reflectionCalls++;

      const handlerMetadata: HandlerMetadata[] = Reflect.getMetadata(EVENT_HANDLER_METADATA, (prototype as Record<string, unknown>)[methodName]) || [];

      for (const metadata of handlerMetadata) {
        results.push({
          eventName: metadata.eventName,
          handler: ((prototype as Record<string, (...args: unknown[]) => unknown>)[methodName] as (...args: unknown[]) => unknown).bind(instance),
          options: metadata.options || {},
        });
      }
    }

    return results;
  }

  private generateProviderHash(wrapper: InstanceWrapper): string {
    // Generate hash based on provider class and method signatures
    const className = wrapper.metatype?.name || 'unknown';
    const methodNames = wrapper.instance
      ? Object.getOwnPropertyNames(Object.getPrototypeOf(wrapper.instance))
          .filter((name) => name !== 'constructor' && typeof wrapper.instance[name] === 'function')
          .sort()
      : [];

    const hashInput = `${className}:${methodNames.join(',')}`;
    return createHash('md5').update(hashInput).digest('hex');
  }

  private generateHandlerId(providerName: string, eventName: string, methodName: string): string {
    return createHash('md5').update(`${providerName}:${eventName}:${methodName}`).digest('hex').substring(0, 8);
  }

  getDiscoveryMetrics(): DiscoveryMetrics {
    return { ...this.discoveryMetrics };
  }

  clearDiscoveryCache(): void {
    this.discoveryCache.handlers.clear();
    this.discoveryCache.providerHashes.clear();
    this.discoveryCache.lastDiscoveryTime = 0;
    this.preloadedMetadata.clear();
    this.logger.debug('Discovery cache cleared');
  }

  preloadMetadata(providers: InstanceWrapper[]): void {
    this.logger.debug('Preloading handler metadata...');
    const startTime = performance.now();
    let preloadedCount = 0;

    for (const wrapper of providers) {
      if (!wrapper.instance || typeof wrapper.instance !== 'object') {
        continue;
      }

      const className = wrapper.metatype?.name || 'unknown';
      const metadata = new Map<string, { eventName: string; options: HandlerOptions }>();

      const prototype = Object.getPrototypeOf(wrapper.instance);
      const methodNames = Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor' && typeof prototype[name] === 'function');

      for (const methodName of methodNames) {
        const handlerMetadata: HandlerMetadata[] = Reflect.getMetadata(EVENT_HANDLER_METADATA, (prototype as Record<string, unknown>)[methodName]) || [];

        for (const meta of handlerMetadata) {
          metadata.set(methodName, {
            eventName: meta.eventName,
            options: meta.options || {},
          });
          preloadedCount++;
        }
      }

      if (metadata.size > 0) {
        this.preloadedMetadata.set(className, metadata);
      }
    }

    const duration = performance.now() - startTime;
    this.logger.debug(`Preloaded ${preloadedCount} handler metadata entries in ${duration.toFixed(2)}ms`);
  }

  cleanup(): void {
    this.clearDiscoveryCache();
    this.preloadedMetadata.clear();

    // Reset metrics
    Object.keys(this.discoveryMetrics).forEach((key) => {
      if (typeof this.discoveryMetrics[key as keyof DiscoveryMetrics] === 'number') {
        (this.discoveryMetrics as any)[key] = 0;
      }
    });

    this.logger.debug('Handler discovery service cleaned up');
  }
}
