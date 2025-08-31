# RxJS Event Emitter - Development Guide

## 📋 **Project Overview**

The RxJS Event Emitter is an **enterprise-grade NestJS library** for advanced event-driven architecture featuring:

- **RxJS Stream Processing** - Advanced event processing with backpressure control
- **Handler Discovery** - Automatic handler registration via @EventHandler decorators
- **Enterprise Features** - Circuit breakers, dead letter queues, handler pools
- **Comprehensive Monitoring** - Real-time metrics, health checks, and system monitoring
- **Type Safety** - Full TypeScript support with compile-time validation
- **Scalable Architecture** - Service-based architecture with dependency injection

---

## 🚀 **Quick Start**

### Installation & Setup

```bash
# Clone and install dependencies
git clone <repository-url>
cd rxjs-event-emitter
npm install

# Start development
npm run start:dev

# Run tests
npm run test:all
```

### Basic Usage

```typescript
// app.module.ts
@Module({
  imports: [
    EventEmitterModule.forRoot({
      maxConcurrency: 20,
      bufferTimeMs: 50,
      enableMetrics: true,
      enablePersistence: true,
      enableDeadLetterQueue: true
    })
  ]
})
export class AppModule {}

// user.handler.ts
@EventHandler('user.created', {
  priority: 5,
  timeout: 5000,
  retryPolicy: {
    maxRetries: 3,
    backoffMs: 1000
  }
})
@Injectable()
export class UserCreatedHandler {
  async handle(event: Event<UserCreatedPayload>): Promise<void> {
    // Handler implementation
    console.log('User created:', event.payload);
  }
}

// user.service.ts
@Injectable()
export class UserService {
  constructor(private eventEmitter: EventEmitterService) {}

  async createUser(userData: CreateUserDto): Promise<User> {
    const user = await this.userRepository.save(userData);
    
    // Emit event
    await this.eventEmitter.emit('user.created', {
      userId: user.id,
      email: user.email,
      createdAt: user.createdAt
    });
    
    return user;
  }
}
```

---

## 🏗️ **Architecture Overview**

### Core Services

| Service | Purpose | Key Features |
|---------|---------|--------------|
| **EventEmitterService** | Main event bus coordination | Stream processing, handler orchestration |
| **HandlerDiscoveryService** | Automatic handler registration | @EventHandler decorator discovery |
| **HandlerExecutionService** | Advanced handler execution | Circuit breakers, timeout handling |
| **StreamManagementService** | RxJS stream optimization | Backpressure control, buffer management |
| **MetricsService** | System monitoring | Real-time metrics, health checks |
| **PersistenceService** | Event storage | Event persistence and retrieval |
| **DeadLetterQueueService** | Failed event handling | Retry mechanisms, permanent failure handling |
| **HandlerPoolService** | Handler isolation | Pool-based execution, resource management |
| **DependencyAnalyzerService** | Handler dependencies | Execution planning and dependency resolution |

### Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                EventEmitterModule                       │
├─────────────────────────────────────────────────────────┤
│  Core Services                                          │
│  ├── EventEmitterService (Main event bus)              │
│  ├── HandlerDiscoveryService (Handler registration)     │
│  └── HandlerExecutionService (Handler execution)        │
│                                                         │
│  Advanced Services                                      │
│  ├── StreamManagementService (Stream optimization)     │
│  ├── MetricsService (System monitoring)                │
│  ├── PersistenceService (Event storage)                │
│  ├── DeadLetterQueueService (Failed events)            │
│  ├── HandlerPoolService (Handler isolation)            │
│  └── DependencyAnalyzerService (Dependencies)          │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠️ **Development Commands**

### Core Development

```bash
# Development
npm run start:dev          # Start in watch mode
npm run start:debug        # Start with debug inspector
npm run build              # Build the project
npm run start:prod         # Start production build

# Code Quality
npm run lint               # Run ESLint (with auto-fix)
npm run format             # Run Prettier formatting
```

### Testing

```bash
# Individual Test Suites
npm run test               # Basic Jest execution
npm run test:unit          # Unit tests (jest-unit.json)
npm run test:int           # Integration tests (jest-integration.json)
npm run test:e2e           # E2E tests (jest-e2e.json)

# Comprehensive Testing
npm run test:all           # All test suites sequentially
npm run test:all:cov       # All test suites with coverage

# Coverage Reports
npm run test:cov           # Combined coverage report
npm run test:cov:unit      # Unit test coverage
npm run test:cov:int       # Integration test coverage
npm run test:cov:e2e       # E2E test coverage
```

---

## 📝 **Event Handler Development**

### Creating Event Handlers

1. **Basic Handler**
```typescript
@EventHandler('order.placed')
@Injectable()
export class OrderPlacedHandler {
  async handle(event: Event<OrderPlacedPayload>): Promise<void> {
    // Handle order placement
  }
}
```

2. **Advanced Handler with Options**
```typescript
@EventHandler('payment.processed', {
  priority: 10,              // Higher priority (1-20)
  timeout: 30000,           // 30 second timeout
  poolName: 'payment-pool', // Custom handler pool
  retryPolicy: {
    maxRetries: 5,
    backoffMs: 2000,
    exponentialBackoff: true
  }
})
@Injectable()
export class PaymentProcessedHandler {
  constructor(
    private emailService: EmailService,
    private metricsService: MetricsService
  ) {}

  async handle(event: Event<PaymentProcessedPayload>): Promise<void> {
    try {
      await this.emailService.sendConfirmation(event.payload.email);
      this.metricsService.recordEventProcessed(event, Date.now());
    } catch (error) {
      // Error handling will be managed by HandlerExecutionService
      throw error;
    }
  }
}
```

### Handler Discovery

Handlers are automatically discovered through:
- **@EventHandler Decorator**: Marks classes as event handlers
- **@Injectable Decorator**: Enables dependency injection
- **HandlerDiscoveryService**: Scans and registers handlers at startup

---

## ⚙️ **Configuration**

### Module Configuration

```typescript
EventEmitterModule.forRoot({
  // Core Processing
  maxConcurrency: 20,              // Max concurrent event processing
  bufferTimeMs: 50,                // Event batching time
  defaultTimeout: 30000,           // Default handler timeout

  // Feature Flags
  enableMetrics: true,             // Enable metrics collection
  enablePersistence: true,         // Enable event persistence
  enableDeadLetterQueue: true,     // Enable DLQ
  enableAdvancedFeatures: true,    // Enable all advanced services

  // Circuit Breaker Configuration
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,           // Failures before opening
    recoveryTimeout: 30000,        // Time to wait before retry
  },

  // Handler Pool Configuration
  handlerPools: {
    enabled: true,
    defaultPoolSize: 10,           // Default pool size
    maxPoolUtilization: 0.8,       // Pool utilization threshold
  },

  // Stream Management
  streamManagement: {
    enabled: true,
    backpressureStrategy: 'buffer', // 'buffer' | 'drop' | 'latest'
    maxBufferSize: 1000,           // Maximum stream buffer size
  },

  // Persistence Configuration
  persistence: {
    adapter: 'memory',             // 'memory' | 'redis' | 'database'
    batchSize: 100,                // Batch processing size
    retention: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      maxCount: 10000,             // Max stored events
    }
  },

  // Metrics Configuration
  metrics: {
    enabled: true,
    collectionIntervalMs: 5000,    // Metrics collection interval
    retentionPeriodMs: 3600000,    // 1 hour retention
    enableDetailedTracking: true,  // Detailed handler tracking
    healthCheckIntervalMs: 30000,  // Health check interval
    alertThresholds: {
      errorRate: 5,                // 5% error rate threshold
      memoryUsage: 80,             // 80% memory usage threshold
      eventRate: 1000,             // Events per second threshold
    }
  }
})
```

---

## 📊 **Monitoring & Metrics**

### Accessing Metrics

```typescript
@Injectable()
export class MonitoringService {
  constructor(private metricsService: MetricsService) {}

  async getSystemHealth(): Promise<void> {
    // Get real-time system metrics
    const systemMetrics = this.metricsService.getCurrentSystemMetrics();
    
    console.log('System Health:', {
      status: systemMetrics.health.status,
      score: systemMetrics.health.score,
      alerts: systemMetrics.health.alerts
    });

    // Get event processing stats
    console.log('Event Stats:', {
      totalEmitted: systemMetrics.events.totalEmitted,
      totalProcessed: systemMetrics.events.totalProcessed,
      processingRate: systemMetrics.events.processingRate,
      errorRate: systemMetrics.events.errorRate
    });

    // Get stream metrics
    console.log('Stream Metrics:', {
      bufferSize: systemMetrics.streams.bufferSize,
      backpressureActive: systemMetrics.streams.backpressureActive,
      throughput: systemMetrics.streams.throughput.eventsPerSecond
    });
  }

  logSystemSummary(): void {
    // Built-in comprehensive logging
    this.metricsService.logSummary();
  }
}
```

### Available Metrics

- **Event Stats**: Emitted, processed, failed events with rates and timing
- **Stream Metrics**: Buffer sizes, backpressure status, throughput
- **Handler Stats**: Per-handler execution metrics and success rates
- **System Health**: Memory usage, CPU utilization, health scores
- **DLQ Metrics**: Dead letter queue status and reprocessing stats

---

## 🧪 **Testing Strategy**

### Test Configuration Structure

```
test/
├── jest.config.json         # Base Jest configuration
├── jest-unit.json          # Unit test configuration
├── jest-integration.json   # Integration test configuration
├── jest-e2e.json          # E2E test configuration
├── setup.ts               # Test setup and utilities
├── unit/                  # Unit tests
│   └── modules/rx-event-emitter/
├── integration/           # Integration tests
│   └── event-workflows.int-spec.ts
└── e2e/                   # E2E tests (if needed)
```

### Testing Guidelines

1. **Unit Tests**: Test individual services in isolation
2. **Integration Tests**: Test service interactions and event workflows  
3. **E2E Tests**: Test complete event processing pipelines
4. **RxJS Testing**: Use marble testing for stream behavior
5. **Mock Strategy**: Mock external dependencies, test core logic

### Example Tests

```typescript
// Unit Test Example
describe('EventEmitterService', () => {
  let service: EventEmitterService;
  let metricsService: jest.Mocked<MetricsService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EventEmitterService,
        { provide: MetricsService, useValue: createMockMetricsService() }
      ],
    }).compile();

    service = module.get<EventEmitterService>(EventEmitterService);
    metricsService = module.get(MetricsService);
  });

  it('should emit events and trigger metrics recording', async () => {
    await service.emit('test.event', { data: 'test' });
    expect(metricsService.recordEventEmitted).toHaveBeenCalled();
  });
});

// Integration Test Example
describe('Event Workflows', () => {
  it('should process events end-to-end with metrics', async () => {
    // Test complete event processing workflow
  });
});
```

---

## 🔧 **Advanced Features**

### Circuit Breaker Implementation

```typescript
// Automatic circuit breaker per handler
@EventHandler('external.api.call', {
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    recoveryTimeout: 60000
  }
})
export class ExternalApiHandler {
  // Handler implementation
}
```

### Dead Letter Queue Usage

```typescript
// Failed events automatically go to DLQ
// Access DLQ for manual processing
@Injectable()
export class DLQProcessor {
  constructor(private dlqService: DeadLetterQueueService) {}

  async processFailedEvents(): Promise<void> {
    const failedEvents = await this.dlqService.getEntries(10);
    // Process and retry failed events
  }
}
```

### Handler Pools

```typescript
// Custom handler pools for isolation
@EventHandler('cpu.intensive.task', {
  poolName: 'heavy-processing',
  poolConfig: {
    maxConcurrency: 5,
    queueSize: 100,
    timeoutMs: 60000
  }
})
export class CpuIntensiveHandler {
  // Handler implementation
}
```

---

## 📚 **API Reference**

### EventEmitterService

| Method | Parameters | Description |
|--------|------------|-------------|
| `emit(eventName, payload, options?)` | Event name, payload, emit options | Emit an event |
| `emitWithPersistence(eventName, payload, options?)` | Event name, payload, emit options | Emit with persistence |
| `on(eventName, handler)` | Event name, handler function | Register simple handler |
| `off(eventName, handler?)` | Event name, optional handler | Remove handler(s) |
| `registerAdvancedHandler(handler)` | RegisteredHandler object | Register advanced handler |
| `getEventNames()` | None | Get all registered event names |
| `getHandlerCount(eventName)` | Event name | Get handler count for event |
| `getAllHandlers()` | None | Get all registered handlers |
| `isShuttingDown()` | None | Check if service is shutting down |

### Event Interfaces

```typescript
interface Event<T = unknown> {
  readonly metadata: EventMetadata;
  readonly payload: T;
}

interface EventMetadata {
  readonly id: string;
  readonly name: string;
  readonly timestamp: number;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly version?: number;
  readonly retryCount?: number;
  readonly priority?: EventPriority;
  readonly tenantId?: string;
}

interface EmitOptions {
  correlationId?: string;
  causationId?: string;
  headers?: Record<string, unknown>;
  priority?: EventPriority;
  timeout?: number;
  retryable?: boolean;
  tenantId?: string;
}
```

---

## 🐛 **Troubleshooting**

### Common Issues

1. **Handlers Not Discovered**
   - Ensure @EventHandler and @Injectable decorators are present
   - Check that handler classes are in modules imported by EventEmitterModule

2. **High Memory Usage**
   - Review stream buffer sizes and metrics retention settings
   - Check for handler memory leaks and circular references

3. **Events Not Processing**
   - Verify EventEmitterModule.forRoot() configuration
   - Check handler execution timeouts and circuit breaker states

4. **Test Failures**
   - Ensure proper async/await usage in tests
   - Use proper Jest configuration files for different test types

### Debug Commands

```bash
# Debug with inspector
npm run start:debug

# View metrics and health
# Access MetricsService.logSummary() in your application

# Test specific handler
npm run test -- --testNamePattern="HandlerName"
```

---

## 📋 **Development Checklist**

### Before Implementation
- [ ] Analyze service architecture impact
- [ ] Plan event handler registration strategy  
- [ ] Review stream processing requirements
- [ ] Assess performance and memory implications

### During Development
- [ ] Follow NestJS service architecture patterns
- [ ] Implement comprehensive tests (unit/integration/e2e)
- [ ] Add proper TypeScript types and interfaces
- [ ] Document service interactions and dependencies

### After Implementation  
- [ ] Run full test suite: `npm run test:all:cov`
- [ ] Verify build: `npm run build`
- [ ] Test development mode: `npm run start:dev`
- [ ] Check code quality: `npm run lint && npm run format`
- [ ] Validate event processing workflows
- [ ] Review metrics and monitoring integration

---

## 🔄 **Development Workflow**

1. **Feature Development**
   ```bash
   git checkout -b feature/new-handler
   # Implement handler with tests
   npm run test:all
   npm run lint
   git commit -m "feat: add new event handler"
   ```

2. **Testing Strategy**
   ```bash
   npm run test:unit          # Test service isolation
   npm run test:int           # Test service integration
   npm run test:e2e           # Test full workflows
   npm run test:all:cov       # Comprehensive coverage
   ```

3. **Quality Assurance**
   ```bash
   npm run build              # Verify compilation
   npm run lint               # Check code quality  
   npm run format             # Format code
   npm run start:dev          # Test in development
   ```

---

**Project Version**: 2.0.0 | **NestJS**: ^11.0.1 | **TypeScript**: ^5.7.3 | **RxJS**: ^7.8.1

For additional support or questions, refer to the test examples in `test/` directory and service implementations in `src/modules/rx-event-emitter/services/`.