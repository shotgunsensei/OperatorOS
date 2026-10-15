import { defineConfig, devices } from '@playwright/test';

// Public-only, loopback fixture. This suite cannot purchase, enroll or reach a DB.
const web = 'http://127.0.0.1:5100';
process.env.E2E_WEB_BASE_URL = web;
process.env.E2E_WEB_URL = web;
export default defineConfig({
  testDir:'./e2e', testMatch:['audience-lanes.spec.ts', 'pricing-selection.spec.ts', 'flagship-landings.fixture.ts'],
  workers:1, retries:0, timeout:60000, expect:{timeout:15000},
  reporter:[['line']], outputDir:'../../output/playwright/landing-results',
  use:{...devices['Desktop Chrome'], baseURL:web, trace:'retain-on-failure', screenshot:'only-on-failure',
    launchOptions:{args:['--host-resolver-rules=MAP operatoros.net 127.0.0.1, MAP *.operatoros.net 127.0.0.1, EXCLUDE localhost']}},
});
