import { defineConfig, devices } from '@playwright/test';

const productionHosts = process.env.E2E_PRODUCTION_HOSTS === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  outputDir: 'test-results/playwright',
  use: {
    ...devices['Desktop Chrome'],
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...(productionHosts ? {
      launchOptions: {
        args: [
          '--host-resolver-rules=MAP operatoros.net 127.0.0.1, MAP *.operatoros.net 127.0.0.1, EXCLUDE localhost',
        ],
      },
    } : {}),
  },
});
