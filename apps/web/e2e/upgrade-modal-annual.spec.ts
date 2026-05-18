/**
 * Task #70 — UI E2E for the UpgradeModal Monthly | Annual toggle.
 *
 * Runtime: `@playwright/test` spec, isolated from the api `node:test`
 * suite. Drives a real browser against the dev servers
 * (web on :5000, api on :5001) and uses raw SQL via `pg` for fixture
 * setup/teardown — same pattern as the other apps/web/e2e/*.spec.ts
 * files.
 *
 * Run locally with the dev servers up:
 *   npx playwright test apps/web/e2e/upgrade-modal-annual.spec.ts
 *
 * What it guards:
 *
 *   Task #67 added a Monthly | Annual toggle to UpgradeModal so
 *   paid-plan customers can pick annual billing from the upgrade flow.
 *   If the toggle silently regresses (e.g. the click handler stops
 *   reading the local `interval` state) every annual checkout would
 *   downgrade back to monthly without any visible UI change. This
 *   test asserts both the visible price flip and — critically — the
 *   exact JSON body sent to /api/billing/subscribe.
 *
 *   Properties asserted:
 *     1. The modal defaults to "Monthly":
 *        - `button-modal-interval-month` is the selected toggle.
 *        - `modal-price-pro-month` is rendered with the monthly
 *          amount from /v1/billing/plans (`displayMonthlyPriceCents`).
 *        - `modal-price-pro-year` is NOT in the DOM.
 *     2. Clicking `button-modal-interval-year` flips the price card:
 *        - `modal-price-pro-year` is rendered with the annual amount
 *          from /v1/billing/plans (`displayAnnualPriceCents`).
 *        - `modal-price-pro-month` is no longer in the DOM.
 *        - The "2 months free vs monthly" hint is visible inside
 *          `modal-plan-pro`.
 *     3. Clicking `modal-btn-pro` posts the annual payload AND the
 *        modal redirects the browser to the returned checkoutUrl:
 *        - A POST is sent to /api/billing/subscribe (Next.js rewrites
 *          to /v1/billing/subscribe on the API).
 *        - The body is exactly { planSlug: "pro", interval: "year" }.
 *        - The browser navigates to the checkoutUrl returned in the
 *          response — proving the Stripe redirect branch of
 *          UpgradeModal (`window.location.href = checkoutUrl`) still
 *          runs.
 *
 * Why deterministic interception via page.route('**\/billing/subscribe'):
 *   Two reasons. First, we capture the exact request body before the
 *   page navigates away. Second, we stub the response with a known
 *   local sentinel as `checkoutUrl` so the redirect assertion does
 *   not depend on Stripe being configured in the dev env — the
 *   real-Stripe URL is a moving target, but the modal's contract
 *   ("if response.checkoutUrl, set window.location.href to it") is
 *   the regression we need to guard.
 *
 * Fixture note: registration (POST /v1/auth/register) intentionally
 * does not create a personal tenant — the boot-time
 * `backfillPersonalTenants` does. We provision the tenant + owner
 * membership directly via SQL so the freshly registered user can
 * actually reach the Billing page. (Followed up separately as
 * tech-debt: "Give new sign-ups a workspace automatically".)
 */
import { test, expect, request as pwRequest } from '@playwright/test';
import { Client } from 'pg';

const API = process.env.E2E_API_URL ?? 'http://localhost:5001';
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:5000';

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to run this spec');
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

test('annual toggle flips the price and sends interval=year to /billing/subscribe', async ({ page }) => {
  const ts = Date.now();
  const email = `task70-upgrade-${ts}@example.com`;
  const password = 'CorrectHorseBattery9!';
  const tenantSlug = `task70-tenant-${ts.toString(36)}`;

  const api = await pwRequest.newContext();
  let userId: string | null = null;
  let tenantId: string | null = null;

  try {
    // 1) Register a fresh user. Registration returns { ok: true } and
    //    does NOT auto-provision a tenant — we plant one below.
    const reg = await api.post(`${API}/v1/auth/register`, {
      data: { email, password, name: 'Task70 Upgrade Test' },
    });
    expect(reg.ok(), `register: ${reg.status()} ${await reg.text()}`).toBeTruthy();

    // 2) Login to obtain a JWT. Login also sets an httpOnly cookie,
    //    but the SPA reads `localStorage.token` for the Authorization
    //    header — so we seed both later.
    const login = await api.post(`${API}/v1/auth/login`, { data: { email, password } });
    expect(login.ok(), `login: ${login.status()} ${await login.text()}`).toBeTruthy();
    const loginBody = await login.json();
    const token: string = loginBody.token;
    userId = loginBody.user.id;
    expect(token, 'login returned a token').toBeTruthy();
    expect(userId, 'login returned a user id').toBeTruthy();

    // 3) Provision a personal tenant + owner membership and set it as
    //    current_tenant_id so the API's tenant context resolver
    //    (apps/api/src/lib/tenant-auth.ts) returns a tenant for this
    //    user. Without this, /v1/billing/usage would 404.
    tenantId = await withDb(async (c) => {
      const t = await c.query(
        `INSERT INTO tenants (name, slug, type, owner_user_id, status)
         VALUES ('Task70 Upgrade Tenant', $1, 'personal', $2, 'active')
         RETURNING id`,
        [tenantSlug, userId],
      );
      const tid: string = t.rows[0].id;
      await c.query(
        `INSERT INTO tenant_users (tenant_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT (tenant_id, user_id) DO NOTHING`,
        [tid, userId],
      );
      await c.query(`UPDATE users SET current_tenant_id = $1 WHERE id = $2`, [tid, userId]);
      return tid;
    });

    // 4) Fetch the Pro plan from the live billing config so the
    //    displayed-price assertion uses whatever the server actually
    //    returns (different envs may seed different cents).
    const plansRes = await api.get(`${API}/v1/billing/plans`);
    expect(plansRes.ok(), `plans: ${plansRes.status()}`).toBeTruthy();
    interface PlanShape {
      slug: string;
      price?: number;
      displayMonthlyPriceCents?: number;
      displayAnnualPriceCents?: number;
    }
    const { plans } = (await plansRes.json()) as { plans: PlanShape[] };
    const pro = plans.find((p) => p.slug === 'pro');
    if (!pro) throw new Error('pro plan missing from /v1/billing/plans');
    // Task #67 contract: the annual price card MUST read from
    // `displayAnnualPriceCents`. Asserting its presence here keeps
    // the test honest — if the API drops the field we want a hard
    // failure, not a silent fallback to `monthly * 10`.
    expect(
      pro.displayAnnualPriceCents,
      'pro plan must expose displayAnnualPriceCents (Task #67 contract)',
    ).toBeGreaterThan(0);
    const monthlyCents = pro.displayMonthlyPriceCents ?? pro.price ?? 0;
    const annualCents = pro.displayAnnualPriceCents as number;
    const monthlyDollars = Math.round(monthlyCents / 100);
    const annualDollars = Math.round(annualCents / 100);

    // 5) Seed browser auth — token + active tenant — then go to the
    //    SPA root. We click into Billing via the sidebar so this is a
    //    real navigation, not a deep link.
    await page.addInitScript(({ token, tenantId }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('activeTenantId', tenantId);
    }, { token, tenantId });

    // 6) Install the deterministic subscribe interceptor BEFORE the
    //    modal is opened. We *override* the response with a stubbed
    //    checkoutUrl pointing at a known local sentinel so the
    //    redirect branch is deterministic regardless of whether
    //    Stripe is configured in the dev env. The original request
    //    body is captured verbatim — that's the must-pass assertion.
    //
    //    The sentinel path is served by Next as a 404 page, which is
    //    fine: we only need a real URL the browser will navigate to
    //    so we can assert window.location.href = checkoutUrl actually
    //    ran inside UpgradeModal (apps/web/src/components/UpgradeModal.tsx).
    const checkoutSentinel = `${WEB}/__task70_checkout_sentinel__?ts=${ts}`;
    const captured: {
      url: string;
      body: string;
      status: number;
      response: string;
    } = { url: '', body: '', status: 0, response: '' };

    await page.route('**/billing/subscribe', async (route) => {
      const req = route.request();
      captured.url = req.url();
      captured.body = req.postData() ?? '';
      const stubbed = JSON.stringify({ checkoutUrl: checkoutSentinel });
      captured.status = 200;
      captured.response = stubbed;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: stubbed,
      });
    });

    await page.goto(WEB);

    // 7) Navigate to Billing via the sidebar nav entry. Mobile/desktop
    //    both render `data-testid="nav-billing"` (sidebar-nav.ts).
    const billingNav = page.getByTestId('nav-billing');
    await billingNav.waitFor({ timeout: 15_000 });
    await billingNav.click();

    // 8) Open the upgrade modal. The button only renders when the
    //    current plan is not "elite" — new users start on the free
    //    tier so it's present.
    const upgradeBtn = page.getByTestId('button-upgrade-plan');
    await expect(upgradeBtn).toBeVisible({ timeout: 15_000 });
    await upgradeBtn.click();

    const modal = page.getByTestId('upgrade-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('modal-plan-pro')).toBeVisible();

    // Property 1 — default monthly state.
    await expect(page.getByTestId('button-modal-interval-month')).toBeVisible();
    await expect(page.getByTestId('button-modal-interval-year')).toBeVisible();
    const monthlyPrice = page.getByTestId('modal-price-pro-month');
    await expect(monthlyPrice).toBeVisible();
    await expect(monthlyPrice).toContainText(`$${monthlyDollars}`);
    await expect(page.getByTestId('modal-price-pro-year')).toHaveCount(0);

    // Property 2 — toggle to annual; price card flips.
    await page.getByTestId('button-modal-interval-year').click();
    const annualPrice = page.getByTestId('modal-price-pro-year');
    await expect(annualPrice).toBeVisible();
    await expect(annualPrice).toContainText(`$${annualDollars}`);
    await expect(page.getByTestId('modal-price-pro-month')).toHaveCount(0);
    await expect(page.getByTestId('modal-plan-pro'))
      .toContainText(/2 months free vs monthly/i);

    // Property 3 — clicking Upgrade posts { planSlug, interval: 'year' }
    // AND the modal redirects the browser to the returned checkoutUrl.
    //
    // The stubbed response always carries `checkoutSentinel` as the
    // checkoutUrl, so this assertion proves the modal actually runs
    // `window.location.href = checkoutUrl` (the Stripe-enabled branch
    // in apps/web/src/components/UpgradeModal.tsx). A regression that
    // dropped the redirect would leave the browser on the billing
    // page and waitForURL would time out.
    await Promise.all([
      page.waitForURL(checkoutSentinel, { timeout: 15_000 }),
      page.getByTestId('modal-btn-pro').click(),
    ]);

    // The interceptor recorded the request before it forwarded the
    // stubbed response, so the captured body is exactly what the
    // browser would have sent to the real API.
    // Browser-side URL is /api/billing/subscribe (Next.js rewrites it
    // to /v1/billing/subscribe on the API — see apps/web/next.config.js).
    expect(new URL(captured.url).pathname,
      `captured URL was ${captured.url}`).toBe('/api/billing/subscribe');
    expect(captured.status).toBe(200);

    const sentBody = JSON.parse(captured.body || '{}');
    expect(sentBody).toEqual({ planSlug: 'pro', interval: 'year' });

    // And the page actually navigated to the checkoutUrl we returned.
    expect(page.url()).toBe(checkoutSentinel);
  } finally {
    // Cleanup — remove the planted tenant + user. Best-effort; do not
    // mask the original test failure if cleanup itself errors.
    await withDb(async (c) => {
      if (tenantId) {
        await c.query(`DELETE FROM tenant_users WHERE tenant_id = $1`, [tenantId]);
        await c.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
      }
      if (userId) {
        await c.query(`DELETE FROM tenant_users WHERE user_id = $1`, [userId]);
        await c.query(`DELETE FROM tenants WHERE owner_user_id = $1`, [userId]);
        await c.query(`DELETE FROM users WHERE id = $1`, [userId]);
      }
    }).catch(() => undefined);
  }
});
