import { defineConfig } from '@playwright/test';

const baseURL = process.env.LUNCH_BREAK_TEST_URL || 'http://127.0.0.1:5123';
const target = new URL(baseURL);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
  target.protocol !== 'http:' ||
  target.username ||
  target.password ||
  target.search ||
  target.hash ||
  target.pathname !== '/'
) {
  throw new Error('Lunch Break browser acceptance is loopback-only; no live account or service');
}

export default defineConfig({
  testDir: './e2e',
  testMatch: 'lunch-break.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: 'line',
  outputDir: 'output/playwright/lunch-break',
  use: { baseURL, headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
