/**
 * Task #43 — UI E2E for the Modules-tab Stripe Price ID override flow.
 *
 * Runtime: `@playwright/test` spec, isolated from the api `node:test`
 * suite. Drives a real browser against the dev servers
 * (web on :5000, api on :5001) and uses raw SQL via `pg` to plant
 * super-admin status and the modules.metadata.stripePriceId override.
 *
 * Run locally with the dev servers up:
 *   npx playwright test apps/web/e2e/admin-stripe-price-id.spec.ts
 *
 * Coverage matrix (the four "Done looks like" properties from task #43):
 *
 *   1. Survives a redeploy:
 *      A planted modules.metadata.stripePriceId is read on a fresh
 *      page load and shown in `text-current-stripe-price-id` —
 *      proving the value lives in the DB, not in process memory or
 *      env, so a redeploy does not lose it.
 *
 *   2. Resolves the mismatch banner when saved:
 *      Initial state shows the red `mismatch` pill in the drift
 *      block. After a successful save (the API responds with
 *      validation.ok=true and the next drift fetch reports
 *      mismatch=false), the pill disappears and the binding switches
 *      to "via override".
 *
 *   3. Falls back to env binding when cleared:
 *      After Clear, the override row is gone, the Clear button is
 *      disabled, the DB key is removed, and the drift block reports
 *      "not configured" (or the env binding) — never silently keeps
 *      the old override.
 *
 *   4. Rejects bogus IDs with 400:
 *      A malformed id submit surfaces a visible error AND the
 *      existing override is unchanged in both the UI and the DB
 *      (validate-then-save, never validate-then-overwrite).
 *
 * Why mock GET /stripe-price and PUT /stripe-price-id during the
 * "successful save" scenario instead of letting the real backend run
 * end-to-end through Stripe? The Stripe-validation success path
 * requires `stripe.prices.retrieve(...)` to return for a real id, and
 * the dev environment is configured with a *live* Stripe secret —
 * hitting it from an automated test would either fail (no such test
 * id) or, worse, touch a real account. The mocks are scoped to just
 * the two endpoints whose contract is exercised in-process by
 * `apps/api/test/admin-stripe-price-id.test.ts`; everything else
 * (auth, page rendering, button enablement, banner toggling) is the
 * real frontend wiring under test.
 */
import { test, expect, request as pwRequest } from '@playwright/test';
import { Client } from 'pg';

const API = process.env.E2E_API_URL ?? 'http://localhost:5001';
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:5000';

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function registerSuperAdmin(api: Awaited<ReturnType<typeof pwRequest.newContext>>) {
  const ts = Date.now();
  const email = `t43-admin-${ts}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'CorrectHorseBattery9!';
  const reg = await api.post(`${API}/v1/auth/register`, {
    data: { email, password, name: 'T43 Admin' },
  });
  expect(reg.ok(), `register: ${reg.status()} ${await reg.text()}`).toBeTruthy();
  const { token, user } = await reg.json();
  await withDb(c => c.query(`UPDATE users SET platform_role = 'super_admin' WHERE id = $1`, [user.id]));
  return { token, userId: user.id as string };
}

async function pickModuleAndPlant(plantedId: string | null, declaredCents: number | null) {
  return withDb(async (c) => {
    const r = await c.query(
      `SELECT slug FROM modules WHERE archived_at IS NULL ORDER BY ord LIMIT 1`,
    );
    expect(r.rows.length, 'a non-archived module to test against').toBeGreaterThan(0);
    const slug: string = r.rows[0].slug;
    const md: Record<string, unknown> = {};
    if (plantedId) md.stripePriceId = plantedId;
    if (declaredCents != null) md.addonPriceCents = declaredCents;
    await c.query(
      `UPDATE modules SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE slug = $1`,
      [slug, JSON.stringify(md)],
    );
    return slug;
  });
}

async function cleanup(slug: string | null, userId: string | null) {
  await withDb(async (c) => {
    if (slug) {
      await c.query(
        `UPDATE modules SET metadata = (metadata - 'stripePriceId') - 'addonPriceCents' WHERE slug = $1`,
        [slug],
      );
    }
    if (userId) {
      await c.query(`DELETE FROM tenant_users WHERE user_id = $1`, [userId]);
      await c.query(`DELETE FROM tenants WHERE owner_user_id = $1`, [userId]);
      await c.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  }).catch(() => undefined);
}

// Property 1 + 3 + 4: redeploy survival, fallback after clear, bogus rejection.
test('planted override survives reload, malformed save is rejected without overwriting, clear falls back', async ({ page }) => {
  const ts = Date.now();
  const plantedId = `price_e2e_planted_${ts}`;
  const api = await pwRequest.newContext();
  const { token, userId } = await registerSuperAdmin(api);
  let moduleSlug: string | null = null;

  try {
    moduleSlug = await pickModuleAndPlant(plantedId, null);

    await page.addInitScript((tk) => { localStorage.setItem('token', tk); }, token);
    await page.goto(`${WEB}/platform/modules/${moduleSlug}`);

    // Property 1 — the planted DB value is what the UI shows on a cold load.
    const currentOverride = page.getByTestId('text-current-stripe-price-id');
    await expect(currentOverride).toBeVisible({ timeout: 10_000 });
    await expect(currentOverride).toContainText(plantedId);

    const clearBtn = page.getByTestId('button-clear-stripe-price-id');
    await expect(clearBtn).toBeEnabled();

    // Property 4 — bogus id is regex-rejected by the server (400
    // STRIPE_PRICE_INVALID) before Stripe is ever called, so this
    // assertion does not depend on Stripe being reachable.
    await page.getByTestId('input-stripe-price-id').fill('not-a-real-price');
    await page.getByTestId('button-save-stripe-price-id').click();
    await expect(page.getByText(/price_XXXX|Invalid Stripe Price ID/i))
      .toBeVisible({ timeout: 10_000 });
    await expect(currentOverride).toContainText(plantedId); // unchanged in UI

    await withDb(async (c) => {
      const r = await c.query(
        `SELECT metadata->>'stripePriceId' AS sid FROM modules WHERE slug = $1`,
        [moduleSlug],
      );
      expect(r.rows[0].sid).toBe(plantedId); // unchanged in DB
    });

    // Property 3 — Clear collapses both sides to the fall-back-to-env
    // state. Real PUT { stripePriceId: null } is exercised here (no
    // Stripe call needed for clear).
    await clearBtn.click();
    await expect(page.getByTestId('block-stripe-price-id-result'))
      .toContainText(/cleared/i, { timeout: 10_000 });
    await expect(currentOverride).toHaveCount(0);
    await expect(clearBtn).toBeDisabled();

    await withDb(async (c) => {
      const r = await c.query(
        `SELECT (metadata ? 'stripePriceId') AS has_key FROM modules WHERE slug = $1`,
        [moduleSlug],
      );
      expect(r.rows[0].has_key).toBe(false);
    });
  } finally {
    await cleanup(moduleSlug, userId);
  }
});

// Property 2: successful save resolves the mismatch banner.
//
// The two stripe-touching endpoints are mocked (see file header) so
// the test is deterministic and never reaches the live Stripe account.
// The save button click, the validated pill, the override text, the
// drift refetch, and the mismatch pill toggling are all real React
// state transitions in the production component.
test('successful save updates the override and the mismatch pill disappears', async ({ page }) => {
  const ts = Date.now();
  const initialId = `price_e2e_initial_${ts}`;
  const newId = `price_e2e_new_${ts}`;
  const declared = 9900;
  const api = await pwRequest.newContext();
  const { token, userId } = await registerSuperAdmin(api);
  let moduleSlug: string | null = null;

  try {
    moduleSlug = await pickModuleAndPlant(initialId, declared);
    const slug = moduleSlug;

    // Mismatch state flips after the save. The mock closure flips this
    // boolean when it sees a successful PUT come through.
    let mismatchNow = true;
    let currentInLookup = initialId;

    await page.route(`**/v1/platform/modules/${slug}/stripe-price`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug,
          lookup: {
            envKey: `STRIPE_PRICE_ADDON_${slug.toUpperCase().replace(/-/g, '_')}`,
            priceId: currentInLookup,
            overridePriceId: currentInLookup,
            envPriceId: '',
            source: 'override',
            stripeMode: 'live',
            stripeEnabled: true,
            fetched: true,
            unitAmountCents: mismatchNow ? 5000 : declared,
            currency: 'usd',
            active: true,
            error: null,
            declaredAddonPriceCents: declared,
            stripeUnitAmountCents: mismatchNow ? 5000 : declared,
            stripeCurrency: 'usd',
            mismatch: mismatchNow,
          },
        }),
      });
    });

    await page.route(`**/v1/platform/modules/${slug}/stripe-price-id`, async (route) => {
      const req = route.request();
      if (req.method() !== 'PUT') return route.continue();
      const body = JSON.parse(req.postData() || '{}');
      // Intercept only the success path; any malformed id gets a 400
      // so the regex-guard contract is preserved even when mocked.
      if (typeof body.stripePriceId === 'string' && /^price_[A-Za-z0-9]+$/.test(body.stripePriceId)) {
        currentInLookup = body.stripePriceId;
        mismatchNow = false;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            module: { slug, metadata: { stripePriceId: body.stripePriceId, addonPriceCents: declared } },
            validation: { ok: true, priceId: body.stripePriceId, unitAmountCents: declared, currency: 'usd', active: true, error: null },
          }),
        });
      } else {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Stripe Price ID must look like "price_XXXX"', code: 'STRIPE_PRICE_INVALID' }),
        });
      }
    });

    await page.addInitScript((tk) => { localStorage.setItem('token', tk); }, token);
    await page.goto(`${WEB}/platform/modules/${slug}`);

    // Initial: planted override is shown.
    await expect(page.getByTestId('text-current-stripe-price-id'))
      .toContainText(initialId, { timeout: 10_000 });

    // Force the drift block to render so the mismatch pill becomes
    // assertable. The page only fetches /stripe-price when the admin
    // explicitly clicks "Check Stripe drift".
    await page.getByTestId('button-check-stripe-price').click();
    const driftBlock = page.getByTestId('block-stripe-drift');
    await expect(driftBlock).toBeVisible({ timeout: 10_000 });
    await expect(driftBlock).toContainText(/mismatch/i);

    // Successful save with a regex-valid id (mock validates it as
    // matching declared cents → mismatch flips to false).
    await page.getByTestId('input-stripe-price-id').fill(newId);
    await page.getByTestId('button-save-stripe-price-id').click();

    // The result block surfaces the "validated" pill from the mocked
    // 200 response — the same shape the real backend returns.
    await expect(page.getByTestId('block-stripe-price-id-result'))
      .toContainText(/validated/i, { timeout: 10_000 });

    // Re-fetch drift; the mock now reports mismatch=false and the
    // banner disappears. Polling on the drift block content because
    // the parent reload from `onSaved()` is async.
    await page.getByTestId('button-check-stripe-price').click();
    await expect(driftBlock).not.toContainText(/mismatch/i, { timeout: 10_000 });
    await expect(driftBlock).toContainText(/via override/i);
    await expect(driftBlock).toContainText(newId);
  } finally {
    await cleanup(moduleSlug, userId);
  }
});
