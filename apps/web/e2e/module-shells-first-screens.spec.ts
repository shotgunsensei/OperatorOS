/**
 * Task #73 — Playwright coverage for the four polished module first-screens
 * (CallCommand AI, Ninjamation, StudyForge AI, Ninja Launch Kit) end-to-end
 * for an Elite-plan tenant member, plus:
 *   - the "Back to My Apps" link is present on every shell route
 *   - a non-entitled tenant member sees the `app-shell-not-accessible`
 *     friendly card instead of the shell
 *
 * Runtime: this is a `@playwright/test` spec, intentionally isolated from
 * the API `node:test` suite because it drives a real browser against the
 * dev servers (web on :5000, api on :5001). Run locally with the dev
 * servers up:
 *
 *   npx playwright test apps/web/e2e/module-shells-first-screens.spec.ts
 *
 * Why this exists: the API tests in apps/api/test/* already prove the
 * route contracts, entitlement gating, and persistence. This spec exists
 * purely to prove the UI wiring — that each shell renders, performs its
 * first meaningful interaction, and surfaces the back-link/denied-card
 * states the product owner depends on.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { Client } from 'pg';

const API = process.env.E2E_API_URL ?? 'http://localhost:5001';
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:5000';

const SHELL_SLUGS = ['callcommand-ai', 'ninjamation', 'studyforge-ai', 'ninja-launch-kit'] as const;

type Slug = typeof SHELL_SLUGS[number];

interface SeedResult {
  userId: string;
  tenantId: string;
  email: string;
}

/** Register and sign in a fresh user via the public API, establishing the
 *  real host-only HttpOnly session in the browser context and returning the
 *  auto-provisioned personal tenant. The user is born as the `owner` of their
 *  personal tenant — exactly the role we need to launch modules. */
async function registerUser(api: APIRequestContext, tag: string): Promise<SeedResult> {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const email = `task73-${tag}-${ts}-${rand}@example.com`;
  const password = 'CorrectHorseBattery9!';

  const reg = await api.post(`${API}/v1/auth/register`, {
    data: { email, password, name: `Task73 ${tag}` },
  });
  expect(reg.ok(), `register ${tag}: ${reg.status()} ${await reg.text()}`).toBeTruthy();

  // Registration is deliberately non-enumerating and does not establish a
  // browser session. Authenticate through the production login contract so
  // this spec receives the same signed HttpOnly cookie as a real browser.
  const login = await api.post(`${API}/v1/auth/login`, {
    data: { email, password },
  });
  expect(login.ok(), `login ${tag}: ${login.status()} ${await login.text()}`).toBeTruthy();
  const { user } = await login.json();

  const setCookie = login.headersArray()
    .find(({ name, value }) => name.toLowerCase() === 'set-cookie' && value.startsWith('operatoros_session='))
    ?.value;
  expect(setCookie, `login ${tag} must issue operatoros_session`).toBeTruthy();
  expect(setCookie, 'operatoros_session must remain HttpOnly').toMatch(/;\s*HttpOnly(?:;|$)/i);
  expect(setCookie, 'operatoros_session must remain host-only').not.toMatch(/;\s*Domain=/i);

  // BrowserContext.request and the page share one private cookie jar. The
  // local API and web servers intentionally use different ports on the same
  // loopback host, so the server-issued host-only cookie reaches the page
  // without copying its value into JavaScript-visible storage.
  const apiHost = new URL(API).hostname;
  const webHost = new URL(WEB).hostname;
  expect(webHost, 'Task #73 E2E requires API and web to share a loopback cookie host').toBe(apiHost);
  const state = await api.storageState();
  const sessionCookie = state.cookies.find(({ name }) => name === 'operatoros_session');
  expect(sessionCookie, `login ${tag} cookie must enter the browser context`).toBeTruthy();
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.domain).toBe(apiHost);

  // The context keeps the Set-Cookie response in its browser-owned cookie jar,
  // so these calls exercise cookie authentication without exposing a bearer.
  const tenantsRes = await api.get(`${API}/v1/me/tenants`);
  expect(tenantsRes.ok(), `list tenants ${tag}: ${tenantsRes.status()}`).toBeTruthy();
  const meTenants = await tenantsRes.json();
  const tenantId: string = meTenants.current ?? meTenants.tenants?.[0]?.id;
  expect(tenantId, `expected personal tenant for ${tag}`).toBeTruthy();

  // Pin server-side so X-Tenant-Id-less code paths resolve the same tenant
  // the UI uses.
  const switched = await api.post(`${API}/v1/tenants/${tenantId}/switch`);
  expect(switched.ok(), `switch tenant ${tag}: ${switched.status()} ${await switched.text()}`).toBeTruthy();

  return { userId: user.id, tenantId, email };
}

/** Plant an Elite subscription + tenant_modules rows for the four shell
 *  slugs so the tenant unlocks them via plan inclusion AND the per-tenant
 *  `requireTenantModuleAccess` pre-handler (which only consults
 *  tenant_modules) passes. Using `allow_all_members=true` mirrors the way
 *  the product enables included-by-plan modules for tenant members. */
async function seedEliteAccess(pg: Client, userId: string, tenantId: string) {
  const elite = await pg.query<{ id: string }>(
    `select id from subscription_plans where slug = 'elite' limit 1`,
  );
  if (elite.rows.length === 0) {
    throw new Error('seedEliteAccess: subscription_plans.slug="elite" not seeded');
  }
  const elitePlanId = elite.rows[0].id;

  // 30-day window keeps the subscription active for the duration of the run.
  const now = new Date();
  const future = new Date(Date.now() + 30 * 86_400_000);
  await pg.query(
    `insert into subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
     values ($1, $2, 'active', $3, $4)`,
    [userId, elitePlanId, now.toISOString(), future.toISOString()],
  );

  for (const slug of SHELL_SLUGS) {
    const mod = await pg.query<{ id: string }>(
      `select id from modules where slug = $1 limit 1`,
      [slug],
    );
    if (mod.rows.length === 0) {
      throw new Error(`seedEliteAccess: module "${slug}" not in modules table; api seed did not run`);
    }
    await pg.query(
      `insert into tenant_modules (tenant_id, module_id, status, source, allow_all_members)
       values ($1, $2, 'enabled', 'included', true)
       on conflict do nothing`,
      [tenantId, mod.rows[0].id],
    );
  }
}

/** Hard cleanup keyed off userId. Matches the order used by the API tests'
 *  `cleanupUser` helper so foreign keys stay happy across schema variants. */
async function cleanupUser(pg: Client, userId: string) {
  try { await pg.query(`delete from subscriptions where user_id = $1`, [userId]); } catch {}
  try { await pg.query(`delete from module_call_logs where user_id = $1`, [userId]); } catch {}
  try { await pg.query(`delete from module_study_sessions where user_id = $1`, [userId]); } catch {}
  try { await pg.query(`delete from module_automations where user_id = $1`, [userId]); } catch {}
  try { await pg.query(`delete from module_scaffolds where user_id = $1`, [userId]); } catch {}
  try { await pg.query(`delete from activity_feed where user_id = $1`, [userId]); } catch {}
  try { await pg.query(`delete from tenant_user_module_access where user_id = $1`, [userId]); } catch {}
  try { await pg.query(`delete from tenant_users where user_id = $1`, [userId]); } catch {}
  // Drop tenants the user owns + their per-tenant child rows.
  try {
    const owned = await pg.query<{ id: string }>(
      `select id from tenants where owner_user_id = $1`,
      [userId],
    );
    for (const t of owned.rows) {
      try { await pg.query(`delete from launchkit_exports where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from launchkit_artifacts where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from launchkit_tasks where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from launchkit_milestones where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from launchkit_phases where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from launchkit_generations where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from launchkit_launches where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from shared_activity_events where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from module_call_logs where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from module_study_sessions where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from module_automations where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from module_scaffolds where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from activity_feed where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from tenant_user_module_access where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from tenant_modules where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from tenant_users where tenant_id = $1`, [t.id]); } catch {}
      try { await pg.query(`delete from tenants where id = $1`, [t.id]); } catch {}
    }
  } catch {}
  try { await pg.query(`delete from users where id = $1`, [userId]); } catch {}
}

/** Per-shell: navigate to /app/apps/<slug>, confirm the shell mounted,
 *  perform a small "first screen" interaction that proves the API wiring
 *  works end-to-end, and assert the Back-to-Apps link is present. */
async function exerciseShell(page: Page, slug: Slug) {
  await page.goto(`${WEB}/app/apps/${slug}`);

  // The shell root carries `shell-<slug>`. Wait for it before any further
  // assertion so a flaky network does not surface as a missing-element
  // failure on a downstream selector.
  await expect(page.getByTestId(`shell-${slug}`)).toBeVisible({ timeout: 15_000 });

  // Every module page renders the same Back-link via the route shell.
  await expect(page.getByTestId('link-back-to-apps')).toBeVisible();

  switch (slug) {
    case 'callcommand-ai': {
      // Telephony is unconfigured in dev — the POST handler synthesises a
      // stub call row with `provider='stub'` and progresses it from
      // `queued` to `completed` synchronously. We assert the row appears
      // AND carries the completed status pill, so a regression that
      // dropped the status field (or stalled at queued) would fail here.
      // We deliberately accept either the terminal `completed` pill or a
      // brief intermediate `queued` pill that then transitions, to keep
      // the assertion robust against either ordering of the synchronous
      // stub progression.
      await page.getByTestId('input-callcommand-phone').fill('+15551234567');
      await page.getByTestId('input-callcommand-name').fill('Task73 Caller');
      await page.getByTestId('button-callcommand-place-test-call').click();
      await expect(page.getByTestId('list-callcommand-calls')).toBeVisible({ timeout: 10_000 });
      const firstRow = page.locator('[data-testid^="row-callcommand-call-"]').first();
      await expect(firstRow).toBeVisible({ timeout: 10_000 });
      // Status progression: when telephony IS configured the row enters
      // `queued` and later flips to `completed`; in the stub path the
      // row lands in `completed` synchronously. Soft-check for the
      // intermediate `queued` pill (so the transition is exercised when
      // present) and then require the terminal `completed` pill — the
      // latter is the firm assertion that proves status semantics.
      await firstRow.getByTestId('status-callcommand-queued')
        .waitFor({ state: 'visible', timeout: 1_500 })
        .catch(() => undefined);
      await expect(firstRow.getByTestId('status-callcommand-completed'))
        .toBeVisible({ timeout: 15_000 });
      break;
    }
    case 'ninjamation': {
      // Activate the first deterministic template, then deactivate it.
      // Activate is idempotent server-side and DELETE removes the
      // automation row outright, so re-runs won't pile up duplicates and
      // the deactivate assertion proves the round-trip wiring.
      const TEMPLATE_ID = 'tradeflow-photo-ticket';
      await expect(page.getByTestId(`card-ninjamation-template-${TEMPLATE_ID}`))
        .toBeVisible({ timeout: 10_000 });
      await page.getByTestId(`button-ninjamation-use-${TEMPLATE_ID}`).click();
      const activeRow = page.getByTestId(`row-ninjamation-active-${TEMPLATE_ID}`);
      await expect(activeRow).toBeVisible({ timeout: 10_000 });
      // Deactivate must remove the active row so the template can be
      // re-activated later — proves the DELETE handler + UI refresh.
      await page.getByTestId(`button-ninjamation-deactivate-${TEMPLATE_ID}`).click();
      await expect(activeRow).toHaveCount(0, { timeout: 10_000 });
      break;
    }
    case 'studyforge-ai': {
      const suffix = Date.now().toString(36);
      await page.getByTestId('input-studyforge-subject-name').fill(`Biology ${suffix}`);
      await page.getByTestId('button-studyforge-subject-create').click();
      await page.getByTestId('input-studyforge-source-title').fill(`Cell notes ${suffix}`);
      await page.getByTestId('textarea-studyforge-source-body').fill(
        'Mitochondria generate ATP through oxidative phosphorylation. Cells use ATP as an energy carrier.',
      );
      await page.getByTestId('button-studyforge-source-create').click();
      await page.getByTestId('select-studyforge-generation-source').selectOption({ label: `Cell notes ${suffix}` });
      await page.getByTestId('input-studyforge-generation-title').fill(`Cell deck ${suffix}`);
      await page.getByTestId('button-studyforge-generation-create').click();
      await expect(page.getByTestId('list-studyforge-cards'))
        .toBeVisible({ timeout: 15_000 });
      const firstCard = page.locator('[data-testid^="card-studyforge-"]').first();
      await expect(firstCard).toBeVisible({ timeout: 15_000 });
      const firstCardId = await firstCard.evaluate((el) =>
        (el.getAttribute('data-testid') ?? '').replace(/^card-studyforge-/, ''),
      );
      expect(firstCardId, 'expected a generated card id').toBeTruthy();
      await expect(page.getByTestId(`text-studyforge-answer-${firstCardId}`))
        .toBeVisible({ timeout: 5_000 });
      break;
    }
    case 'ninja-launch-kit': {
      const suffix = Date.now().toString(36);
      await page.getByTestId('input-launchkit-title').fill(`Task73 launch ${suffix}`);
      await page.getByTestId('input-launchkit-product-type').fill('service');
      await page.getByTestId('select-launchkit-template').selectOption('it-support-msp');
      await page.getByTestId('input-launchkit-audience').fill('MSP owners');
      await page.getByTestId('input-launchkit-problem').fill('Scattered launch execution');
      await page.getByTestId('input-launchkit-offer').fill('A focused launch package');
      await page.getByTestId('button-launchkit-create').click();
      await expect(page.getByText(`Task73 launch ${suffix}`, { exact: true }).first())
        .toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('text-launchkit-readiness'))
        .toBeVisible({ timeout: 10_000 });
      break;
    }
  }
}

test.describe('Module first-screens (Task #73)', () => {
  let pg: Client;
  const seededUserIds: string[] = [];

  test.beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must be set for Task #73 e2e');
    pg = new Client({ connectionString: databaseUrl });
    await pg.connect();
  });

  test.afterAll(async () => {
    for (const id of seededUserIds) {
      await cleanupUser(pg, id).catch(() => undefined);
    }
    await pg.end().catch(() => undefined);
  });

  test('Elite-plan tenant member can use all four module first-screens', async ({ page }) => {
    const elite = await registerUser(page.context().request, 'elite');
    seededUserIds.push(elite.userId);
    await seedEliteAccess(pg, elite.userId, elite.tenantId);

    // AuthProvider now boots from the HttpOnly cookie, calls /auth/me, and
    // derives activeTenantId from the server-owned current tenant.
    for (const slug of SHELL_SLUGS) {
      await exerciseShell(page, slug);
    }
  });

  test('Non-entitled tenant member sees the app-shell-not-accessible card', async ({ page }) => {
    // No Elite subscription, no tenant_modules rows — the personal tenant
    // is a "blank" tenant with zero module entitlements. requireTenantMember
    // will pass (the user owns the tenant), but GET /v1/modules/:slug will
    // return `unlocked: false`, which the page renders as the friendly
    // not-accessible card.
    const denied = await registerUser(page.context().request, 'denied');
    seededUserIds.push(denied.userId);

    // Probe every shell slug — the denied card must render for each, not
    // the shell.
    for (const slug of SHELL_SLUGS) {
      await page.goto(`${WEB}/app/apps/${slug}`);
      await expect(page.getByTestId('app-shell-not-accessible'))
        .toBeVisible({ timeout: 15_000 });
      // Back-link is the only navigation off the denied card — must be
      // present so users can return to /app and pick another module.
      await expect(page.getByTestId('link-back-to-apps')).toBeVisible();
      // And the shell itself must NOT have mounted.
      await expect(page.getByTestId(`shell-${slug}`)).toHaveCount(0);
    }
  });
});
