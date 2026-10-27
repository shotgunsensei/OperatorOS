import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'workspace-access-ordering-component.spec.ts', workers: 1,
  retries: 0, timeout: 20_000, reporter: 'line',
  outputDir: '../../../output/playwright/quality-oct27/core/workspace-test-results',
  use: { headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
