import { defineConfig, devices } from '@playwright/test';
import { assertLocalBrowserTestEnvironment } from '../../scripts/parity/lib/database.mjs';

const productionHosts = process.env.E2E_PRODUCTION_HOSTS === '1';
const browserSafety = assertLocalBrowserTestEnvironment(
  process.env,
  { requireExactHosts: productionHosts },
);
process.env.E2E_API_URL ??= browserSafety.apiUrl;
process.env.E2E_WEB_URL ??= browserSafety.webUrl;
process.env.E2E_ROOT_URL ??= browserSafety.rootUrl;
process.env.INTERNAL_API_URL ??= browserSafety.apiUrl;

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
  // Chromium text metrics and rasterization differ between the supported
  // Windows workstation and Linux release runners. Keep the same strict pixel
  // threshold while selecting an explicitly reviewed baseline for each OS.
  snapshotPathTemplate: '{testDir}/visual-baselines/{arg}-{platform}{ext}',
  use: {
    ...devices['Desktop Chrome'],
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: [
        '--no-proxy-server',
        '--ignore-certificate-errors',
        '--host-resolver-rules=MAP operatoros.net 127.0.0.1, MAP *.operatoros.net 127.0.0.1, EXCLUDE localhost',
      ],
    },
  },
});
