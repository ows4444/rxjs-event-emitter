import { config } from 'dotenv';

config({ path: '.env.test' });

import { Logger } from '@nestjs/common';
Logger.overrideLogger([]);

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllTimers();
});
