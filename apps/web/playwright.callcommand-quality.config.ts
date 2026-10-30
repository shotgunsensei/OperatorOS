import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'callcommand-quality-component.spec.ts',
  workers: 1, retries: 0, timeout: 30_000, reporter: 'line',
  outputDir: '../../../output/playwright/final-quality-oct30/' + (process.env.QUALITY_SCREENSHOT_LABEL || 'current'),
  use: { headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
