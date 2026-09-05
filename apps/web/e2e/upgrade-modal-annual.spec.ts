/**
 * Commerce-cutover regression: the former annual legacy-plan modal is gone.
 * The historical filename is retained so existing Playwright invocations do
 * not silently stop covering the customer billing surface.
 *
 * This test performs no checkout interception and never fabricates provider
 * success. It proves an owner sees the one monthly Application Stack path and
 * that Starter/Pro/Elite interval and purchase controls are absent.
 */
import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import {
  E2E_WEB_URL as WEB,
  expectNoScriptReadableAuth,
  registerAndLogin,
} from './session-auth';

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to run this spec');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test('billing exposes Application Stack and no legacy annual purchase controls', async ({ page }) => {
  const email = `stack-monthly-${Date.now()}@example.com`;
  const password = 'CorrectHorseBattery9!';
  let userId: string | null = null;

  try {
    const user = await registerAndLogin(page.context().request, {
      email,
      password,
      name: 'Application Stack Owner',
    });
    userId = user.id;

    await page.goto(WEB);
    await expectNoScriptReadableAuth(page);
    await page.getByTestId('nav-billing').click();

    const billing = page.getByTestId('billing-page');
    await expect(billing).toBeVisible({ timeout: 15_000 });
    await expect(billing).toContainText('Application Stack is the forward offer');
    await expect(billing).toContainText('Monthly billing includes five seats');
    await expect(billing).toContainText('extra companions are $29/month');
    await expect(billing).toContainText('extra seats are $15/month');

    await expect(page.getByTestId('button-interval-year')).toHaveCount(0);
    await expect(page.getByTestId('button-upgrade-plan')).toHaveCount(0);
    await expect(page.getByTestId('button-subscribe-pro')).toHaveCount(0);
    await expect(page.getByTestId('button-build-ecosystem-stack')).toBeVisible();

    await page.getByTestId('button-build-ecosystem-stack').click();
    await page.waitForURL(/\/pricing#build-stack$/);
    await expect(page.getByTestId('stack-checkout-cta')).toBeVisible();
    await expect(page.getByText(/Final price confirmed in secure Stripe Checkout before any charge/i)).toBeVisible();
  } finally {
    if (userId) {
      await withDb(async (client) => {
        await client.query('DELETE FROM tenant_users WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM tenants WHERE owner_user_id = $1', [userId]);
        await client.query('DELETE FROM users WHERE id = $1', [userId]);
      }).catch(() => undefined);
    }
  }
});
