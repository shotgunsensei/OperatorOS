import { defineConfig, devices } from '@playwright/test';
import { assertLocalBrowserTestEnvironment, stripExternalProviderEnvironment } from '../../scripts/parity/lib/database.mjs';

const environment = stripExternalProviderEnvironment(process.env);
const safety = assertLocalBrowserTestEnvironment(environment);
const isolated = {
  ...environment, APP_ENV: 'test', NODE_ENV: 'test', DATABASE_URL: safety.database.url,
  SESSION_SECRET: 'ecosystem-ui-disposable-session-secret-only',
  SSO_CODE_ENCRYPTION_SECRET: 'ecosystem-ui-disposable-code-secret-only',
  INTERNAL_SERVICE_HOST: '127.0.0.1', RUNNER_MODE: 'disabled',
  INTERNAL_API_URL: 'http://127.0.0.1:5001',
};

// Compiled local presentation and authenticated API checks with disposable data.
// Exact-host production supervisor acceptance has its own existing harness.
export default defineConfig({
  testDir: './e2e', testMatch: ['ecosystem-guided-polish.spec.ts', 'ecosystem-messenger-polish.spec.ts', 'core-suite-guided-polish.spec.ts'],
  workers: 1, retries: 0, timeout: 90_000, expect: { timeout: 15_000 }, reporter: 'list',
  outputDir: 'test-results/ecosystem-polish',
  use: { ...devices['Desktop Chrome'], trace: 'off', screenshot: 'only-on-failure', video: 'off' },
  webServer: [
    { command: 'node --conditions=production ../api/dist/apps/api/src/index.js', url: 'http://127.0.0.1:5001/healthz', timeout: 60_000, reuseExistingServer: false, env: { ...isolated, PORT: '5001' } },
    { command: 'node node_modules/next/dist/bin/next start -H localhost -p 5000', url: 'http://localhost:5000', timeout: 60_000, reuseExistingServer: false, env: { ...isolated, NODE_ENV: 'production', DATABASE_URL: '' } },
  ],
});
