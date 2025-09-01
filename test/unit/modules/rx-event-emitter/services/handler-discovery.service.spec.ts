import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { HandlerDiscoveryService } from '@modules/rx-event-emitter/services/handler-discovery.service';
import { EventEmitterService } from '@modules/rx-event-emitter/services/event-emitter.service';
import { EVENT_HANDLER_METADATA, EVENT_HANDLER_OPTIONS } from '@modules/rx-event-emitter/interfaces';

describe('HandlerDiscoveryService', () => {
  let service: HandlerDiscoveryService;
  let mockDiscoveryService: jest.Mocked<DiscoveryService>;
  let mockMetadataScanner: jest.Mocked<MetadataScanner>;
  let mockReflector: jest.Mocked<Reflector>;
  let mockEventEmitter: jest.Mocked<EventEmitterService>;

  const createMockDiscoveryService = (): jest.Mocked<DiscoveryService> =>
    ({
      getProviders: jest.fn(),
      getControllers: jest.fn(),
    }) as any;

  const createMockMetadataScanner = (): jest.Mocked<MetadataScanner> =>
    ({
      scanFromPrototype: jest.fn(),
      getAllFilteredMethodNames: jest.fn(),
    }) as any;

  const createMockReflector = (): jest.Mocked<Reflector> =>
    ({
      get: jest.fn(),
      getAll: jest.fn(),
      getAllAndMerge: jest.fn(),
      getAllAndOverride: jest.fn(),
    }) as any;

  const createMockEventEmitter = (): jest.Mocked<EventEmitterService> =>
    ({
      registerHandler: jest.fn(),
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      getEventNames: jest.fn(),
      getHandlerCount: jest.fn(),
      getAllHandlers: jest.fn(),
      isShuttingDown: jest.fn(),
      registerAdvancedHandler: jest.fn(),
      removeHandler: jest.fn(),
      emitWithPersistence: jest.fn(),
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
    }) as any;

  beforeEach(async () => {
    mockDiscoveryService = createMockDiscoveryService();
    mockMetadataScanner = createMockMetadataScanner();
    mockReflector = createMockReflector();
    mockEventEmitter = createMockEventEmitter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HandlerDiscoveryService,
        {
          provide: DiscoveryService,
          useValue: mockDiscoveryService,
        },
        {
          provide: MetadataScanner,
          useValue: mockMetadataScanner,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: EventEmitterService,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<HandlerDiscoveryService>(HandlerDiscoveryService);

    // Mock logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Definition', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('Handler Discovery', () => {
    it('should discover handlers from providers and controllers', () => {
      const mockProvider1 = {
        instance: { someMethod: jest.fn() },
      } as InstanceWrapper;
      const mockProvider2 = {
        instance: { anotherMethod: jest.fn() },
      } as InstanceWrapper;
      const mockController = {
        instance: { controllerMethod: jest.fn() },
      } as InstanceWrapper;

      mockDiscoveryService.getProviders.mockReturnValue([mockProvider1, mockProvider2]);
      mockDiscoveryService.getControllers.mockReturnValue([mockController]);

      service.discoverHandlers();

      expect(mockDiscoveryService.getProviders).toHaveBeenCalled();
      expect(mockDiscoveryService.getControllers).toHaveBeenCalled();
      expect(mockMetadataScanner.scanFromPrototype).toHaveBeenCalledTimes(3);
    });

    it('should skip null or undefined instances', () => {
      const mockProvider1 = { instance: null } as InstanceWrapper;
      const mockProvider2 = { instance: undefined } as InstanceWrapper;
      const mockProvider3 = { instance: 'not-an-object' } as InstanceWrapper;

      mockDiscoveryService.getProviders.mockReturnValue([mockProvider1, mockProvider2, mockProvider3]);
      mockDiscoveryService.getControllers.mockReturnValue([]);

      service.discoverHandlers();

      expect(mockMetadataScanner.scanFromPrototype).not.toHaveBeenCalled();
    });

    it('should scan valid object instances for handlers', () => {
      const instance = {
        method1: jest.fn(),
        method2: jest.fn(),
        constructor: { name: 'TestHandler' },
      };
      const mockProvider = { instance } as InstanceWrapper;

      mockDiscoveryService.getProviders.mockReturnValue([mockProvider]);
      mockDiscoveryService.getControllers.mockReturnValue([]);

      // Mock the scanFromPrototype to call our callback
      mockMetadataScanner.scanFromPrototype.mockImplementation((instance, prototype, callback) => {
        callback('method1');
        callback('method2');
        return [];
      });

      service.discoverHandlers();

      expect(mockMetadataScanner.scanFromPrototype).toHaveBeenCalledWith(instance, Object.getPrototypeOf(instance), expect.any(Function));
    });
  });

  describe('Handler Registration', () => {
    it('should register handler when decorated with event metadata', () => {
      const instance = {
        handleUserCreated: jest.fn(),
        constructor: { name: 'UserHandler' },
      };
      const eventName = 'user.created';

      // Mock reflector to return event name for the decorated method
      mockReflector.get.mockImplementation((metadataKey, target) => {
        if (metadataKey === EVENT_HANDLER_METADATA && target === instance.handleUserCreated) {
          return eventName;
        }
        if (metadataKey === EVENT_HANDLER_OPTIONS && target === instance.handleUserCreated) {
          return { priority: 5 };
        }
        return undefined;
      });

      // Mock scanFromPrototype to call our callback with the method
      mockMetadataScanner.scanFromPrototype.mockImplementation((instance, prototype, callback) => {
        callback('handleUserCreated');
        return [];
      });

      const mockProvider = { instance } as InstanceWrapper;
      mockDiscoveryService.getProviders.mockReturnValue([mockProvider]);
      mockDiscoveryService.getControllers.mockReturnValue([]);

      service.discoverHandlers();

      expect(mockEventEmitter.registerHandler).toHaveBeenCalledWith(eventName, expect.any(Function));
    });

    it('should skip methods without event handler metadata', () => {
      const instance = {
        regularMethod: jest.fn(),
        constructor: { name: 'RegularClass' },
      };

      // Mock reflector to return undefined for non-decorated methods
      mockReflector.get.mockReturnValue(undefined);

      // Mock scanFromPrototype to call our callback
      mockMetadataScanner.scanFromPrototype.mockImplementation((instance, prototype, callback) => {
        callback('regularMethod');
        return [];
      });

      const mockProvider = { instance } as InstanceWrapper;
      mockDiscoveryService.getProviders.mockReturnValue([mockProvider]);
      mockDiscoveryService.getControllers.mockReturnValue([]);

      service.discoverHandlers();

      expect(mockEventEmitter.registerHandler).not.toHaveBeenCalled();
    });

    it('should create a wrapper handler that calls the original method', async () => {
      const instance = {
        handleTestEvent: jest.fn().mockResolvedValue(undefined),
        constructor: { name: 'TestHandler' },
      };
      const eventName = 'test.event';
      const testEvent = { metadata: { id: '123', name: eventName }, payload: { data: 'test' } };

      // Mock reflector to return event name
      mockReflector.get.mockImplementation((metadataKey, target) => {
        if (metadataKey === EVENT_HANDLER_METADATA && target === instance.handleTestEvent) {
          return eventName;
        }
        return undefined;
      });

      // Capture the registered handler function
      let registeredHandler: Function | undefined;
      mockEventEmitter.registerHandler.mockImplementation((eventName, handler) => {
        registeredHandler = handler;
      });

      // Mock scanFromPrototype to trigger registration
      mockMetadataScanner.scanFromPrototype.mockImplementation((instance, prototype, callback) => {
        callback('handleTestEvent');
        return [];
      });

      const mockProvider = { instance } as InstanceWrapper;
      mockDiscoveryService.getProviders.mockReturnValue([mockProvider]);
      mockDiscoveryService.getControllers.mockReturnValue([]);

      service.discoverHandlers();

      // Verify handler was registered
      expect(registeredHandler).toBeDefined();

      // Test the registered handler calls the original method
      await registeredHandler!(testEvent);
      expect(instance.handleTestEvent).toHaveBeenCalledWith(testEvent);
    });

    it('should handle errors in handler execution and re-throw them', async () => {
      const instance = {
        handleErrorEvent: jest.fn().mockRejectedValue(new Error('Handler error')),
        constructor: { name: 'ErrorHandler' },
      };
      const eventName = 'error.event';
      const testEvent = { metadata: { id: '123', name: eventName }, payload: {} };

      // Mock reflector to return event name
      mockReflector.get.mockImplementation((metadataKey, target) => {
        if (metadataKey === EVENT_HANDLER_METADATA && target === instance.handleErrorEvent) {
          return eventName;
        }
        return undefined;
      });

      // Capture the registered handler function
      let registeredHandler: Function | undefined;
      mockEventEmitter.registerHandler.mockImplementation((eventName, handler) => {
        registeredHandler = handler;
      });

      // Mock scanFromPrototype to trigger registration
      mockMetadataScanner.scanFromPrototype.mockImplementation((instance, prototype, callback) => {
        callback('handleErrorEvent');
        return [];
      });

      const mockProvider = { instance } as InstanceWrapper;
      mockDiscoveryService.getProviders.mockReturnValue([mockProvider]);
      mockDiscoveryService.getControllers.mockReturnValue([]);

      service.discoverHandlers();

      // Test that errors are logged and re-thrown
      await expect(registeredHandler!(testEvent)).rejects.toThrow('Handler error');
      expect(instance.handleErrorEvent).toHaveBeenCalledWith(testEvent);
    });

    it('should extract handler options from metadata', () => {
      const instance = {
        handleConfiguredEvent: jest.fn(),
        constructor: { name: 'ConfiguredHandler' },
      };
      const eventName = 'configured.event';
      const handlerOptions = {
        priority: 10,
        timeout: 5000,
        retryPolicy: { maxRetries: 3, backoffMs: 1000 },
      };

      // Mock reflector to return event name and options
      mockReflector.get.mockImplementation((metadataKey, target) => {
        if (metadataKey === EVENT_HANDLER_METADATA && target === instance.handleConfiguredEvent) {
          return eventName;
        }
        if (metadataKey === EVENT_HANDLER_OPTIONS && target === instance.handleConfiguredEvent) {
          return handlerOptions;
        }
        return undefined;
      });

      // Mock scanFromPrototype to trigger registration
      mockMetadataScanner.scanFromPrototype.mockImplementation((instance, prototype, callback) => {
        callback('handleConfiguredEvent');
        return [];
      });

      const mockProvider = { instance } as InstanceWrapper;
      mockDiscoveryService.getProviders.mockReturnValue([mockProvider]);
      mockDiscoveryService.getControllers.mockReturnValue([]);

      service.discoverHandlers();

      // Verify the reflector was called to get handler options
      expect(mockReflector.get).toHaveBeenCalledWith(EVENT_HANDLER_OPTIONS, instance.handleConfiguredEvent);
      expect(mockEventEmitter.registerHandler).toHaveBeenCalledWith(eventName, expect.any(Function));
    });

    it('should use empty options when no handler options are provided', () => {
      const instance = {
        handleSimpleEvent: jest.fn(),
        constructor: { name: 'SimpleHandler' },
      };
      const eventName = 'simple.event';

      // Mock reflector to return event name but no options
      mockReflector.get.mockImplementation((metadataKey, target) => {
        if (metadataKey === EVENT_HANDLER_METADATA && target === instance.handleSimpleEvent) {
          return eventName;
        }
        if (metadataKey === EVENT_HANDLER_OPTIONS && target === instance.handleSimpleEvent) {
          return undefined; // No options provided
        }
        return undefined;
      });

      // Mock scanFromPrototype to trigger registration
      mockMetadataScanner.scanFromPrototype.mockImplementation((instance, prototype, callback) => {
        callback('handleSimpleEvent');
        return [];
      });

      const mockProvider = { instance } as InstanceWrapper;
      mockDiscoveryService.getProviders.mockReturnValue([mockProvider]);
      mockDiscoveryService.getControllers.mockReturnValue([]);

      service.discoverHandlers();

      expect(mockEventEmitter.registerHandler).toHaveBeenCalledWith(eventName, expect.any(Function));
    });

    it('should log successful handler registration', () => {
      const instance = {
        handleLoggedEvent: jest.fn(),
        constructor: { name: 'LoggedHandler' },
      };
      const eventName = 'logged.event';

      const logSpy = jest.spyOn(Logger.prototype, 'log');

      // Mock reflector to return event name
      mockReflector.get.mockImplementation((metadataKey, target) => {
        if (metadataKey === EVENT_HANDLER_METADATA && target === instance.handleLoggedEvent) {
          return eventName;
        }
        return undefined;
      });

      // Mock scanFromPrototype to trigger registration
      mockMetadataScanner.scanFromPrototype.mockImplementation((instance, prototype, callback) => {
        callback('handleLoggedEvent');
        return [];
      });

      const mockProvider = { instance } as InstanceWrapper;
      mockDiscoveryService.getProviders.mockReturnValue([mockProvider]);
      mockDiscoveryService.getControllers.mockReturnValue([]);

      service.discoverHandlers();

      expect(logSpy).toHaveBeenCalledWith(`Registered event handler: LoggedHandler.handleLoggedEvent for event '${eventName}'`);
    });
  });

  describe('Error Handling', () => {
    it('should log handler execution errors with proper context', async () => {
      const instance = {
        handleFailingEvent: jest.fn().mockRejectedValue(new Error('Execution failed')),
        constructor: { name: 'FailingHandler' },
      };
      const eventName = 'failing.event';
      const testEvent = { metadata: { id: '123', name: eventName }, payload: {} };

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      // Mock reflector to return event name
      mockReflector.get.mockImplementation((metadataKey, target) => {
        if (metadataKey === EVENT_HANDLER_METADATA && target === instance.handleFailingEvent) {
          return eventName;
        }
        return undefined;
      });

      // Capture the registered handler function
      let registeredHandler: Function | undefined;
      mockEventEmitter.registerHandler.mockImplementation((eventName, handler) => {
        registeredHandler = handler;
      });

      // Mock scanFromPrototype to trigger registration
      mockMetadataScanner.scanFromPrototype.mockImplementation((instance, prototype, callback) => {
        callback('handleFailingEvent');
        return [];
      });

      const mockProvider = { instance } as InstanceWrapper;
      mockDiscoveryService.getProviders.mockReturnValue([mockProvider]);
      mockDiscoveryService.getControllers.mockReturnValue([]);

      service.discoverHandlers();

      // Execute handler and expect error
      await expect(registeredHandler!(testEvent)).rejects.toThrow('Execution failed');

      expect(errorSpy).toHaveBeenCalledWith(`Handler FailingHandler.handleFailingEvent failed for event ${eventName}:`, expect.any(Error));
    });
  });
});
