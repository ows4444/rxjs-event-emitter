import { config } from 'dotenv';

config({ path: '.env.test' });

import { Logger } from '@nestjs/common';
Logger.overrideLogger(['error']);

beforeAll(async () => {
  jest.clearAllMocks();
});

afterAll(async () => {
  jest.restoreAllMocks();
  jest.clearAllTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllTimers();
});
