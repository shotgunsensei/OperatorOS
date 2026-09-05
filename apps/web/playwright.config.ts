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
process.env.E2E_APP_URL ??= productionHosts
  ? 'https://app.operatoros.net'
  : browserSafety.webUrl;
process.env.HELP_CENTER_E2E_URL ??= productionHosts
  ? 'https://operatoros.net'
  : browserSafety.webUrl;
process.env.INTERNAL_API_URL ??= browserSafety.apiUrl;

export default defineConfig({
  testDir: './e2e',
  testIgnore: /phase17-deployed-acceptance\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }], ['./e2e/fail-on-skipped-reporter.ts']]
    : [['line'], ['./e2e/fail-on-skipped-reporter.ts']],
  outputDir: 'test-results/playwright',
  webServer: process.env.E2E_AUTO_START_WEB === '1' ? {
    command: 'corepack pnpm exec next start -p 5000',
    url: 'http://127.0.0.1:5000',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      APP_ENV: 'test',
      PORT: '5000',
      INTERNAL_API_URL: process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:5001',
    },
  } : undefined,
  use: {
    ...devices['Desktop Chrome'],
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // This is the local-only config. Map every canonical product hostname to
    // the loopback proxy even when a particular spec uses a hard-coded URL;
    // without a local proxy the request fails closed instead of reaching the
    // deployed service. Production acceptance uses the separate deployed config.
    launchOptions: {
      args: [
        '--no-proxy-server',
        '--host-resolver-rules=MAP operatoros.net 127.0.0.1, MAP *.operatoros.net 127.0.0.1, EXCLUDE localhost',
        '--ignore-certificate-errors',
      ],
    },
  },
});
