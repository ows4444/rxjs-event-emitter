import { config } from 'dotenv';

// Load env for tests
config({ path: '.env.test' });

// Optional: silence Nest logs during tests
import { Logger } from '@nestjs/common';
Logger.overrideLogger(['error', 'warn']);

// Global mock timers or spies
beforeAll(async () => {
  jest.setTimeout(15000);
});

afterAll(async () => {
  jest.restoreAllMocks();
});
