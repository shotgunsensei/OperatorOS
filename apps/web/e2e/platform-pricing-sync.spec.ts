/**
 * Historical filename retained after the forward-commerce cutover.
 * The Platform Pricing page is now a read-only readiness view over one shared
 * $29/month companion Price; no browser test may create, sync, or bind prices.
 */
import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { E2E_WEB_URL as WEB, expectNoScriptReadableAuth, registerAndLogin } from './session-auth';

const APPROVED_COMPANIONS = [
  'snapproofos',
  'brandforgeos',
  'studyforge-ai',
  'ninja-launch-kit',
  'callcommand-ai',
  'ninjamation',
] as const;

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to run this spec');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

test('platform pricing shows only six shared-price companions and no mutation controls', async ({ page }) => {
  const user = await registerAndLogin(page.context().request, {
    email: `stack-pricing-admin-${Date.now()}@example.com`,
    password: 'CorrectHorseBattery9!',
    name: 'Stack Pricing Admin',
  });
  await withDb(client => client.query("UPDATE users SET platform_role = 'super_admin' WHERE id = $1", [user.id]));

  try {
    await page.goto(`${WEB}/platform/pricing`);
    await expectNoScriptReadableAuth(page);
    const readiness = page.getByTestId('application-stack-pricing-readiness');
    await expect(readiness).toBeVisible({ timeout: 15_000 });
    await expect(readiness).toContainText('Exactly six companions are eligible');
    await expect(readiness).toContainText('$29/month');
    await expect(readiness).toContainText('read-only');

    for (const slug of APPROVED_COMPANIONS) {
      await expect(page.getByTestId(`row-pricing-${slug}`)).toBeVisible();
    }
    for (const excluded of ['tradeflowkit', 'pulsedesk', 'techdeck', 'torqueshed', 'faultlinelab', 'ninja-pool-hall', 'outcall']) {
      await expect(page.getByTestId(`row-pricing-${excluded}`)).toHaveCount(0);
    }
    await expect(page.locator('[data-testid^="button-sync-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="button-create-"]')).toHaveCount(0);
    await expect(page.getByTestId('button-save-addon-price')).toHaveCount(0);
    await expect(page.getByTestId('button-save-stripe-price-id')).toHaveCount(0);
  } finally {
    await withDb(async client => {
      await client.query('DELETE FROM tenant_users WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM tenants WHERE owner_user_id = $1', [user.id]);
      await client.query('DELETE FROM users WHERE id = $1', [user.id]);
    }).catch(() => undefined);
  }
});
