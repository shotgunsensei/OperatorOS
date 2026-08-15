import { defineConfig, devices } from '@playwright/test';

const productionHosts = process.env.E2E_PRODUCTION_HOSTS === '1';

export default defineConfig({
  testDir: './e2e',
  testMatch: [/parity-visual\.spec\.ts/, /tradeflowkit-phase23-visual\.spec\.ts/],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 600_000,
  expect: { timeout: 20_000 },
  reporter: [['line'], ['html', { outputFolder: 'playwright-report/visual', open: 'never' }], ['./e2e/fail-on-skipped-reporter.ts']],
  outputDir: 'test-results/playwright-visual',
  snapshotPathTemplate: '{testDir}/visual-baselines/{arg}{ext}',
  use: {
    ...devices['Desktop Chrome'],
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...(productionHosts ? {
      launchOptions: {
        args: [
          '--ignore-certificate-errors',
          '--host-resolver-rules=MAP operatoros.net 127.0.0.1, MAP *.operatoros.net 127.0.0.1, EXCLUDE localhost',
        ],
      },
    } : {}),
  },
});
