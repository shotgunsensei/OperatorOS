import { defineConfig } from '@playwright/test';

// The actual component is mounted in an entirely intercepted synthetic page.
// No server, database, session, OAuth account or mailbox is used.
export default defineConfig({
  testDir:'./e2e',testMatch:'pulsedesk-mailbox-component.spec.ts',workers:1,retries:0,
  timeout:30_000,reporter:'line',outputDir:'../../output/playwright/pulsedesk-mailbox',
  use:{headless:true,trace:'retain-on-failure',screenshot:'only-on-failure',video:'off'},
});
