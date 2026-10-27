import { defineConfig } from '@playwright/test';

// Actual account components; explicit local synthetic auth and API boundaries.
// No server, database, account creation, email or remote provider is used.
export default defineConfig({
  testDir: './e2e', testMatch: 'account-quality-component.spec.ts', workers: 1,
  retries: 0, timeout: 45_000, reporter: 'line',
  outputDir: '../../../output/playwright/quality-oct27/core/test-results',
  use: { headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
