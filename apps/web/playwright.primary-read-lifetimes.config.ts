import { defineConfig } from '@playwright/test';

// Actual components with synthetic APIs; no app server or external network.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'primary-read-lifetimes.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 15000,
  outputDir: './test-results/primary-read-lifetimes',
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    headless: true,
    launchOptions: { args: ['--disable-background-networking', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'] },
  },
});
