import { defineConfig, devices } from '@playwright/test';
import { assertDeployedBrowserTestEnvironment } from '../../scripts/parity/lib/database.mjs';

assertDeployedBrowserTestEnvironment(process.env);

export default defineConfig({
  testDir: './e2e',
  testMatch: /phase17-deployed-acceptance\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['line'], ['./e2e/fail-on-skipped-reporter.ts']],
  outputDir: 'test-results/playwright-deployed',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
