import { defineConfig } from '@playwright/test';

// Real components in a private, fully intercepted browser page. No server,
// database, session, Stripe account, or external provider is used by this suite.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'billing-read-truth.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'line',
  outputDir: '../../output/playwright/billing-read-truth',
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
  ],
  use: { headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' },
});
