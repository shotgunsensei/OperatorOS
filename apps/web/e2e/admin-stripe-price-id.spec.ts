/**
 * Historical filename retained after retiring per-module Stripe Price-ID
 * overrides. The module detail now explains whether an application is an
 * eligible shared-price companion and exposes no mutation control.
 */
import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { E2E_WEB_URL as WEB, expectNoScriptReadableAuth, registerAndLogin } from './session-auth';

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to run this spec');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

test('eligible companion module detail exposes shared read-only commerce state', async ({ page }) => {
  const user = await registerAndLogin(page.context().request, {
    email: `shared-price-detail-${Date.now()}@example.com`,
    password: 'CorrectHorseBattery9!',
    name: 'Shared Price Detail Admin',
  });
  await withDb(client => client.query("UPDATE users SET platform_role = 'super_admin' WHERE id = $1", [user.id]));

  try {
    await page.goto(`${WEB}/platform/modules/brandforgeos`);
    await expectNoScriptReadableAuth(page);
    const readiness = page.getByTestId('module-stack-commerce-readiness');
    await expect(readiness).toBeVisible({ timeout: 15_000 });
    await expect(readiness).toContainText('one of exactly six eligible');
    await expect(readiness).toContainText('$29/month');
    await expect(readiness).toContainText('per-module amount and Price-ID mutation are closed');

    const legacyMapping = page.getByTestId('form-module-plan-mapping');
    await expect(legacyMapping).toContainText('read-only');
    await expect(legacyMapping).toContainText('grandfathered access only');
    await expect(legacyMapping.locator('input[type="checkbox"]:not(:disabled)')).toHaveCount(0);

    await expect(page.getByTestId('input-addon-price')).toHaveCount(0);
    await expect(page.getByTestId('input-stripe-price-id')).toHaveCount(0);
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
