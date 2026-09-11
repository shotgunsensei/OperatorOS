import { defineConfig, devices } from '@playwright/test';
import { stripExternalProviderEnvironment } from '../../scripts/parity/lib/database.mjs';

// UI fixtures need only compiled Next assets. No API, database, or provider
// is started. Authenticated runtime acceptance uses playwright.config.ts.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'core-suite-guided-polish.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  outputDir: 'test-results/core-suite-ui',
  use: { ...devices['Desktop Chrome'], trace: 'off', screenshot: 'only-on-failure' },
  webServer: {
    command: 'node node_modules/next/dist/bin/next start -H localhost -p 5000',
    url: 'http://localhost:5000',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { ...stripExternalProviderEnvironment(process.env), NODE_ENV: 'production', APP_ENV: 'test', DATABASE_URL: '', INTERNAL_API_URL: 'http://127.0.0.1:5001' },
  },
});
