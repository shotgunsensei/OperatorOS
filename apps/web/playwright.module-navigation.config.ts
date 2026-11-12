import { defineConfig } from '@playwright/test';

// Actual shell, styles and Radix dialog; synthetic router, no server or account.
export default defineConfig({
  testDir: './e2e', testMatch: 'module-navigation.spec.ts', workers: 1, retries: 0,
  timeout: 15000, outputDir: './test-results/module-navigation', reporter: [['list']],
  use: {
    browserName: 'chromium', headless: true,
    launchOptions: { args: ['--disable-background-networking', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'] },
  },
});
