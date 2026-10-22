import { defineConfig } from '@playwright/test';

const baseURL = process.env.TOOL_PRODUCTS_TEST_URL || 'http://127.0.0.1:5125';
const target = new URL(baseURL);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
  || target.protocol !== 'http:' || target.username || target.password
  || target.search || target.hash || target.pathname !== '/') {
  throw new Error('Tool-product browser acceptance is loopback-only');
}
export default defineConfig({
  testDir: './e2e', testMatch: ['tool-products.spec.ts', 'officeexit-link.spec.ts', 'tool-commerce-built.spec.ts'], workers: 1, retries: 0,
  timeout: 30_000, outputDir: process.env.TOOL_PRODUCTS_OUTPUT || 'output/playwright/tool-products',
  use: { baseURL, headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
