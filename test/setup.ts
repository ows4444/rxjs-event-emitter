import { config } from 'dotenv';

config({ path: '.env.test' });

import { Logger } from '@nestjs/common';

// Suppress logs during testing for cleaner output
Logger.overrideLogger([]);

// Global test environment setup following CHECKPOINT_PROCESS.md requirements
beforeAll(async () => {
  // Use real timers for NestJS service lifecycle management
  jest.useRealTimers();
  
  // Set test timeout for integration tests
  jest.setTimeout(30000);
}, 60000);

afterAll(async () => {
  // Comprehensive cleanup for enterprise testing
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
  
  // Allow time for async cleanup
  await new Promise(resolve => setTimeout(resolve, 100));
}, 10000);

beforeEach(() => {
  // Clear all mocks before each test for isolation
  jest.clearAllMocks();
});

afterEach(() => {
  // Minimal cleanup for performance while maintaining isolation
  jest.clearAllTimers();
  
  // Restore console methods if they were mocked
  if (jest.isMockFunction(console.log)) {
    (console.log as jest.MockedFunction<typeof console.log>).mockRestore();
  }
  if (jest.isMockFunction(console.error)) {
    (console.error as jest.MockedFunction<typeof console.error>).mockRestore();
  }
  if (jest.isMockFunction(console.warn)) {
    (console.warn as jest.MockedFunction<typeof console.warn>).mockRestore();
  }
});
