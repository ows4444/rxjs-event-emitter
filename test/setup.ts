import { config } from 'dotenv';

config({ path: '.env.test' });

import { Logger } from '@nestjs/common';
Logger.overrideLogger([]);

// Optimize for enterprise NestJS service testing
beforeAll(() => {
  // Use real timers for NestJS service lifecycle management
  jest.useRealTimers();
});

afterAll(() => {
  // Fast cleanup for performance
  jest.restoreAllMocks();
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  // Minimal cleanup for performance
  jest.clearAllTimers();
});
