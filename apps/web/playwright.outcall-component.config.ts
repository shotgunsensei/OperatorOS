import { defineConfig } from '@playwright/test';
import { assertDisposableDatabaseEnvironment } from '../../scripts/parity/lib/database.mjs';

assertDisposableDatabaseEnvironment(process.env);
export default defineConfig({
  testDir: './e2e', testMatch: 'outcall-readiness-component.spec.ts',
  workers: 1, retries: 0, timeout: 60_000, reporter: 'line',
  outputDir: 'test-results/outcall-component',
  use: { headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
