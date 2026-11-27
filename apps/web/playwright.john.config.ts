import { defineConfig, devices } from '@playwright/test';
import { stripExternalProviderEnvironment } from '../../scripts/parity/lib/database.mjs';

// Public portfolio only: loopback web runtime, no API/database/provider setup.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'john-portfolio.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['line']],
  outputDir: '../../output/playwright/john-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3127',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3127',
    url: 'http://127.0.0.1:3127/john',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...stripExternalProviderEnvironment(process.env),
      NODE_ENV: 'production',
      APP_ENV: 'test',
      DATABASE_URL: '',
      INTERNAL_API_URL: 'http://127.0.0.1:5001',
    },
  },
});
