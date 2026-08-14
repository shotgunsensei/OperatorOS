/**
 * Task 36 — UI coverage for the "Sync from Stripe" button on the
 * super-admin Platform → Pricing page (drift-fix flow #1).
 *
 * Runtime: this is a `@playwright/test` spec. It is intentionally
 * isolated from the `node:test` API suite because it drives a real
 * browser against the dev servers (web on :5000, api on :5001). The
 * API contract is already covered by
 * `apps/api/test/platform-pricing-driftfix.test.ts`; this spec exists
 * purely to prove the UI wiring (mismatch row → click Sync → notice
 * appears → declared cents update → status flips to "ok") does not
 * silently regress.
 *
 * Run locally with the dev servers up:
 *   npx playwright test apps/web/e2e/platform-pricing-sync.spec.ts
 *
 * Stripe is stubbed in-process via the dev/test-only seam endpoint
 *   POST /v1/platform/__test__/stripe-override
 * so the test never hits the real Stripe API. The seam is hard-gated
 * on (super_admin) AND (NODE_ENV !== 'production').
 *
 * Authentication uses the production HttpOnly host-only session cookie.
 * No JWT is returned to or persisted by browser JavaScript.
 */
import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import {
  E2E_API_URL as API,
  E2E_WEB_URL as WEB,
  expectNoScriptReadableAuth,
  registerAndLogin,
} from './session-auth';

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to run this spec');
  const client = new Client({ connectionString: url });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

test('super-admin can sync a drifted module price from Stripe via the Pricing tab', async ({ page }) => {
  const ts = Date.now();
  const adminEmail = `task36-superadmin-${ts}@example.com`;
  const password = 'CorrectHorseBattery9!';
  const slug = `drift-ui-${ts.toString(36)}`;
  const oldPriceId = `price_old_${ts}`;
  const declaredCents = 999;
  const stripeCents = 2499; // what the stubbed Stripe price reports

  const api = page.context().request;

  // 1) Register and sign in a fresh user with the browser's cookie jar.
  const user = await registerAndLogin(api, {
    email: adminEmail,
    password,
    name: 'Task36 SuperAdmin',
  });

  // 2) Seed: elevate to super_admin and create the drifted module.
  //    metadata.addonPriceCents=999, metadata.stripePriceId points at
  //    a fake old price; the Stripe stub will report 2499 → mismatch.
  await withDb(async (c) => {
    await c.query(`UPDATE users SET platform_role = 'super_admin' WHERE id = $1`, [user.id]);
    await c.query(
      `INSERT INTO modules (slug, name, description, category, base_url, status, plan_min, requires_org, ord, metadata)
       VALUES ($1, 'Drift UI Fixture', 'task36 fixture', 'app', 'https://example.test', 'live', 'starter', false, 0, $2::jsonb)`,
      [slug, JSON.stringify({ addonPriceCents: declaredCents, stripePriceId: oldPriceId })],
    );
  });

  // 3) Install the in-process Stripe stub. retrievePrice is what
  //    /v1/platform/pricing's lookup will see for `oldPriceId`.
  const stubRes = await api.post(`${API}/v1/platform/__test__/stripe-override`, {
    data: {
      enabled: true,
      retrievePrice: { unit_amount: stripeCents, currency: 'usd', active: true },
    },
  });
  expect(stubRes.ok(), `install stripe stub: ${stubRes.status()} ${await stubRes.text()}`).toBeTruthy();

  try {
    // 4) Load the Platform → Pricing page directly with cookie auth.
    await page.goto(`${WEB}/platform/pricing`);
    await expectNoScriptReadableAuth(page);

    // 5) The drifted row should render with declared=999, stripe=2499, mismatch.
    const row = page.getByTestId(`row-pricing-${slug}`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`text-declared-${slug}`)).toHaveText(String(declaredCents));
    await expect(page.getByTestId(`text-stripe-${slug}`)).toHaveText(String(stripeCents));
    await expect(row).toContainText(/mismatch/i);

    // 6) Click "Sync from Stripe".
    const syncBtn = page.getByTestId(`button-sync-${slug}`);
    await expect(syncBtn).toBeEnabled();
    await syncBtn.click();

    // 7) Success notice appears with the slug + new cents; declared cell updates.
    const notice = page.getByTestId('pricing-notice');
    await expect(notice).toBeVisible({ timeout: 10_000 });
    await expect(notice).toContainText(slug);
    await expect(notice).toContainText(String(stripeCents));
    await expect(page.getByTestId(`text-declared-${slug}`)).toHaveText(String(stripeCents));
    // Status pill flips from "mismatch" to "ok" once declared==stripe.
    await expect(row).not.toContainText(/mismatch/i);

    // 8) DB persistence + audit row written.
    await withDb(async (c) => {
      const mod = await c.query(`SELECT metadata FROM modules WHERE slug = $1`, [slug]);
      expect(mod.rows[0].metadata.addonPriceCents).toBe(stripeCents);
      const audit = await c.query(
        `SELECT details FROM admin_audit_logs
         WHERE action = 'module_addon_price_synced_from_stripe'
           AND details->>'slug' = $1
         ORDER BY created_at DESC LIMIT 1`,
        [slug],
      );
      expect(audit.rowCount).toBe(1);
      expect(audit.rows[0].details.nextCents).toBe(stripeCents);
      expect(audit.rows[0].details.previousCents).toBe(declaredCents);
    });
  } finally {
    // 9) Cleanup: clear the Stripe stub, drop the fixture module + user.
    await api.post(`${API}/v1/platform/__test__/stripe-override`, {
      data: { reset: true },
    }).catch(() => undefined);
    await withDb(async (c) => {
      await c.query(`DELETE FROM admin_audit_logs WHERE details->>'slug' = $1`, [slug]);
      await c.query(`DELETE FROM modules WHERE slug = $1`, [slug]);
      await c.query(`DELETE FROM users WHERE id = $1`, [user.id]);
    }).catch(() => undefined);
  }
});
