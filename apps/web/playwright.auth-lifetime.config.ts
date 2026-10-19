import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'auth-tenant-lifetimes.spec.ts',
  fullyParallel: false, workers: 1, retries: 0, timeout: 30_000,
  use: { browserName: 'chromium', headless: true, serviceWorkers: 'block', viewport: { width: 1280, height: 900 } },
});
