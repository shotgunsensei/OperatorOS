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
import { test, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { Client } from 'pg';

const API = process.env.E2E_API_URL ?? 'http://localhost:5001';
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:5000';

const SHELL_SLUGS = ['callcommand-ai', 'ninjamation', 'studyforge-ai', 'ninja-launch-kit'] as const;

type Slug = typeof SHELL_SLUGS[number];

interface SeedResult {
  userId: string;
  tenantId: string;
  token: string;
  email: string;
}

/** Register a fresh user via the public API and return their session +
 *  auto-provisioned personal tenant. The user is born as the `owner` of
 *  their personal tenant — exactly the role we need to launch modules. */
async function registerUser(api: APIRequestContext, tag: string): Promise<SeedResult> {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const email = `task73-${tag}-${ts}-${rand}@example.com`;
  const password = 'CorrectHorseBattery9!';

  const reg = await api.post(`${API}/v1/auth/register`, {
    data: { email, password, name: `Task73 ${tag}` },
  });
  expect(reg.ok(), `register ${tag}: ${reg.status()} ${await reg.text()}`).toBeTruthy();
  const { token, user } = await reg.json();

  const tenantsRes = await api.get(`${API}/v1/me/tenants`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(tenantsRes.ok(), `list tenants ${tag}: ${tenantsRes.status()}`).toBeTruthy();
  const meTenants = await tenantsRes.json();
  const tenantId: string = meTenants.current ?? meTenants.tenants?.[0]?.id;
  expect(tenantId, `expected personal tenant for ${tag}`).toBeTruthy();

  // Pin server-side so X-Tenant-Id-less code paths resolve the same tenant
  // the UI uses.
  await api.post(`${API}/v1/tenants/${tenantId}/switch`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);

  return { userId: user.id, tenantId, token, email };
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

/** Seed the browser session so AuthProvider boots straight into the
 *  authenticated app. Mirrors the localStorage shape used by the existing
 *  invite-resend spec. */
async function attachSession(page: Page, token: string, tenantId: string) {
  await page.addInitScript(({ token, tenantId }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('activeTenantId', tenantId);
  }, { token, tenantId });
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
      // Load sample populates the textarea + word count without hitting
      // the AI provider; generate then POSTs to /sessions. The mock
      // provider returns a deterministic card array fallback so the list
      // renders without an OPENAI_API_KEY. After generation we click the
      // first card's reveal toggle and assert the answer paragraph
      // mounts — proves the recall-session interaction round-trips.
      await page.getByTestId('button-studyforge-load-sample').click();
      await page.getByTestId('button-studyforge-generate').click();
      await expect(page.getByTestId('list-studyforge-cards'))
        .toBeVisible({ timeout: 15_000 });
      const firstCard = page.locator('[data-testid^="card-studyforge-"]').first();
      await expect(firstCard).toBeVisible({ timeout: 15_000 });
      // Resolve the dynamic card id off the rendered card so we can
      // target its matching toggle + answer testids.
      const firstCardId = await firstCard.evaluate((el) =>
        (el.getAttribute('data-testid') ?? '').replace(/^card-studyforge-/, ''),
      );
      expect(firstCardId, 'expected a generated card id').toBeTruthy();
      // Pre-toggle: the answer must NOT be in the DOM (hidden state).
      await expect(page.getByTestId(`text-studyforge-answer-${firstCardId}`))
        .toHaveCount(0);
      await page.getByTestId(`button-studyforge-toggle-${firstCardId}`).click();
      // Post-toggle: the answer paragraph is rendered.
      await expect(page.getByTestId(`text-studyforge-answer-${firstCardId}`))
        .toBeVisible({ timeout: 5_000 });
      break;
    }
    case 'ninja-launch-kit': {
      // Pick a stack, name it, scaffold. The API persists a `queued`
      // scaffold row and returns it — the shell mounts the scaffold panel.
      await page.getByTestId('button-launchkit-pick-next-fastify').click();
      await page.getByTestId('input-launchkit-name').fill('task73-scaffold');
      await page.getByTestId('button-launchkit-scaffold').click();
      await expect(page.getByTestId('panel-launchkit-scaffold'))
        .toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('list-launchkit-scaffold-files'))
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
    const api = await pwRequest.newContext();
    try {
      const elite = await registerUser(api, 'elite');
      seededUserIds.push(elite.userId);
      await seedEliteAccess(pg, elite.userId, elite.tenantId);

      await attachSession(page, elite.token, elite.tenantId);

      for (const slug of SHELL_SLUGS) {
        await exerciseShell(page, slug);
      }
    } finally {
      await api.dispose().catch(() => undefined);
    }
  });

  test('Non-entitled tenant member sees the app-shell-not-accessible card', async ({ page }) => {
    const api = await pwRequest.newContext();
    try {
      // No Elite subscription, no tenant_modules rows — the personal tenant
      // is a "blank" tenant with zero module entitlements. requireTenantMember
      // will pass (the user owns the tenant), but GET /v1/modules/:slug will
      // return `unlocked: false`, which the page renders as the friendly
      // not-accessible card.
      const denied = await registerUser(api, 'denied');
      seededUserIds.push(denied.userId);

      await attachSession(page, denied.token, denied.tenantId);

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
    } finally {
      await api.dispose().catch(() => undefined);
    }
  });
});
