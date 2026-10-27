import { defineConfig } from '@playwright/test';

// Real components, wholly synthetic browser-local API boundaries. No database,
// app server, credentials or remote providers are used by this suite.
export default defineConfig({
  testDir: './e2e', testMatch: 'creative-quality-component.spec.ts',
  workers: 1, retries: 0, timeout: 60_000, reporter: 'line',
  outputDir: '../../../output/playwright/quality-oct27/creative/test-results',
  use: { headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
