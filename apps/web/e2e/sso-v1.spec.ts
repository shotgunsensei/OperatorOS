import { test, expect, type APIRequestContext, type BrowserContext, type Page, type Request } from '@playwright/test';
import { Client } from 'pg';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.E2E_ROOT_URL || 'https://operatoros.net';
const API = process.env.E2E_API_URL || 'http://127.0.0.1:5001';
const PASSWORD = 'OperatorOS-E2E-Only-94!';
let registrationSequence = 0;

const SHELL_TEST_IDS: Record<string, string> = {
  tradeflowkit: 'tradeflowkit-module-shell',
  torqueshed: 'torqueshed-module-shell',
  techdeck: 'techdeck-module-shell',
  pulsedesk: 'pulsedesk-module-shell',
  faultlinelab: 'faultlinelab-module-shell',
  'ninja-pool-hall': 'ninja-pool-hall-module-shell',
  brandforgeos: 'brandforgeos-module-shell',
  snapproofos: 'snapproofos-module-shell',
  'studyforge-ai': 'studyforge-module-shell',
  'ninja-launch-kit': 'launchkit-module-shell',
  'callcommand-ai': 'callcommand-module-shell',
  ninjamation: 'ninjamation-module-shell',
  outcall: 'shell-outcall',
};

type BrowserModule = {
  slug: string;
  host: string;
  shellTestId: string;
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const deploymentRegistry = JSON.parse(
  readFileSync(resolve(repoRoot, 'config/operatoros-module-registry.json'), 'utf8'),
) as Array<{
  moduleId: string;
  slug: string;
  productionBaseUrl: string;
  enabled: boolean;
}>;

const ENABLED_MODULES: BrowserModule[] = deploymentRegistry
  .filter((entry) => entry.moduleId !== 'operatoros' && entry.enabled)
  .map((entry) => {
    const shellTestId = SHELL_TEST_IDS[entry.slug];
    if (!shellTestId) throw new Error(`Missing browser shell selector for ${entry.slug}`);
    return {
      slug: entry.slug,
      host: new URL(entry.productionBaseUrl).hostname,
      shellTestId,
    };
  });

if (ENABLED_MODULES.length !== 12) {
  throw new Error(`Expected 12 enabled modules while OutCall is source-recovery locked, found ${ENABLED_MODULES.length}`);
}

const PUBLIC_AUTH_HEADERS = {
  host: 'auth.operatoros.net',
  'x-forwarded-host': 'auth.operatoros.net',
  'x-forwarded-proto': 'https',
};

type SeededIdentity = {
  userId: string;
  tenantId: string;
  email: string;
};

function forbiddenCredentialParams(url: URL): string[] {
  const forbidden = new Set([
    'token',
    'jwt',
    'access_token',
    'id_token',
    'refresh_token',
    'session',
    'session_token',
  ]);
  return [...url.searchParams.keys()].filter(key => forbidden.has(key.toLowerCase()));
}

function assertNoCredentialQuery(url: string) {
  expect(forbiddenCredentialParams(new URL(url)), `credential query parameter leaked in ${url}`).toEqual([]);
}

async function registerAndSeed(
  request: APIRequestContext,
  pg: Client,
): Promise<SeededIdentity> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `sso-v1-${suffix}@example.com`;
  const registrationIp = `10.78.0.${10 + (registrationSequence++ % 200)}`;
  const response = await request.post(`${API}/v1/auth/register`, {
    headers: { ...PUBLIC_AUTH_HEADERS, 'x-forwarded-for': registrationIp },
    data: { email, password: PASSWORD, name: 'SSO V1 Browser Gate' },
  });
  expect(response.status(), `register: ${await response.text()}`).toBe(202);

  const identity = await pg.query<{ user_id: string; tenant_id: string }>(
    `select u.id as user_id, u.current_tenant_id as tenant_id
       from users u
      where u.email = $1
      limit 1`,
    [email],
  );
  expect(identity.rows).toHaveLength(1);
  const userId = identity.rows[0].user_id;
  const tenantId = identity.rows[0].tenant_id;
  expect(userId).toBeTruthy();
  expect(tenantId).toBeTruthy();

  const elite = await pg.query<{ id: string }>(
    `select id from subscription_plans where slug = 'elite' and is_active = true limit 1`,
  );
  expect(elite.rows, 'the API startup seed must provide the Elite plan').toHaveLength(1);

  await pg.query(
    `insert into subscriptions
       (user_id, plan_id, status, current_period_start, current_period_end, tenant_id, scope_type)
     values ($1, $2, 'active', now(), now() + interval '30 days', $3, 'tenant')`,
    [userId, elite.rows[0].id, tenantId],
  );

  for (const module of ENABLED_MODULES) {
    const moduleRow = await pg.query<{ id: string }>(
      `select id from modules where slug = $1 limit 1`,
      [module.slug],
    );
    expect(moduleRow.rows, `seeded module ${module.slug}`).toHaveLength(1);
    await pg.query(
      `insert into tenant_modules
         (tenant_id, module_id, status, source, allow_all_members)
       values ($1, $2, 'enabled', 'included', true)
       on conflict do nothing`,
      [tenantId, moduleRow.rows[0].id],
    );
  }

  return { userId, tenantId, email };
}

async function cleanupIdentity(pg: Client, identity: SeededIdentity | null) {
  if (!identity) return;
  const { userId, tenantId } = identity;
  const tenantTables = [
    'techdeck_intake_audit_events',
    'techdeck_intake_files',
    'techdeck_intake_requests',
    'techdeck_intake_spaces',
    'techdeck_intake_policies',
    'techdeck_intake_rate_limits',
    'techdeck_status_incident_updates',
    'techdeck_status_incidents',
    'techdeck_status_components',
    'techdeck_status_subscriptions',
    'techdeck_status_pages',
    'techdeck_license_activations',
    'techdeck_license_keys',
    'techdeck_license_products',
    'techdeck_license_rate_limits',
    'techdeck_evidence_file_links',
    'techdeck_appointments',
    'techdeck_portal_assignments',
    'shared_delivery_attempts',
    'shared_webhook_deliveries',
    'shared_webhook_endpoints',
    'shared_api_tokens',
    'shared_service_identities',
    'shared_exports',
    'shared_schedules',
    'shared_secret_references',
    'outcall_events',
    'outcall_call_requests',
    'outcall_triggers',
    'outcall_profiles',
    'outcall_settings',
    'callcommand_followups',
    'callcommand_events',
    'callcommand_calls',
    'callcommand_suppressions',
    'callcommand_consents',
    'callcommand_transfer_targets',
    'callcommand_profiles',
    'callcommand_channels',
    'launchkit_exports',
    'launchkit_artifacts',
    'launchkit_tasks',
    'launchkit_milestones',
    'launchkit_phases',
    'launchkit_generations',
    'launchkit_launches',
    'studyforge_card_progress',
    'studyforge_quiz_attempts',
    'studyforge_cards',
    'studyforge_questions',
    'studyforge_plan_sessions',
    'studyforge_decks',
    'studyforge_quizzes',
    'studyforge_plans',
    'studyforge_generations',
    'studyforge_sources',
    'studyforge_subjects',
    'snapproof_exports',
    'snapproof_custody_events',
    'snapproof_comments',
    'snapproof_findings',
    'snapproof_reports',
    'snapproof_evidence_items',
    'shared_notifications',
    'shared_outbox_messages',
    'shared_attachment_blobs',
    'shared_attachments',
    'snapproof_cases',
    'snapproof_settings',
    'shared_notification_templates',
    'shared_jobs',
    'shared_webhook_receipts',
    'shared_usage_events',
    'shared_activity_events',
    'shared_idempotency_keys',
    'brandforge_calendar_items',
    'brandforge_copy_assets',
    'brandforge_campaign_metrics',
    'brandforge_generations',
    'brandforge_campaigns',
    'brandforge_personas',
    'brandforge_brands',
    'brandforge_workspace_settings',
    'faultlinelab_submissions',
    'faultlinelab_session_actions',
    'faultlinelab_daily_outcomes',
    'faultlinelab_badge_awards',
    'faultlinelab_user_challenge_progress',
    'faultlinelab_user_progress',
    'faultlinelab_sessions',
    'faultlinelab_assignments',
    'faultlinelab_challenge_versions',
    'faultlinelab_challenges',
    'faultlinelab_migration_refs',
    'tradeflowkit_invoices',
    'tradeflowkit_quotes',
    'tradeflowkit_jobs',
    'tradeflowkit_customers',
    'tradeflowkit_leads',
    'pulsedesk_ticket_tags',
    'pulsedesk_vendor_engagements',
    'pulsedesk_time_entries',
    'pulsedesk_sla_events',
    'pulsedesk_ticket_assignments',
    'pulsedesk_ticket_messages',
    'pulsedesk_supply_requests',
    'pulsedesk_facility_requests',
    'pulsedesk_request_events',
    'pulsedesk_requests',
    'pulsedesk_assets',
    'pulsedesk_team_members',
    'pulsedesk_teams',
    'pulsedesk_queues',
    'pulsedesk_ticket_options',
    'pulsedesk_sla_policies',
    'pulsedesk_knowledge_articles',
    'pulsedesk_saved_views',
    'pulsedesk_notification_preferences',
    'pulsedesk_tags',
    'pulsedesk_departments',
    'pulsedesk_request_sequences',
    'pulsedesk_service_client_profiles',
    'techdeck_migration_refs',
    'techdeck_ticket_comments',
    'techdeck_time_entries',
    'techdeck_reports',
    'techdeck_evidence',
    'techdeck_document_links',
    'techdeck_document_revisions',
    'techdeck_documents',
    'techdeck_document_folders',
    'techdeck_configuration_relationships',
    'techdeck_runbooks',
    'techdeck_assets',
    'techdeck_tickets',
    'techdeck_ticket_sequences',
    'techdeck_managed_client_profiles',
    'module_workflow_items',
    'directory_site_contacts',
    'directory_organization_contacts',
    'directory_relationships',
    'directory_sites',
    'directory_addresses',
    'directory_contacts',
    'directory_organizations',
    'ninja_pool_match_events',
    'ninja_pool_match_sessions',
    'ninja_pool_player_profiles',
    'ninja_pool_practice_sessions',
    'ninjamation_generations',
    'ninjamation_downloads',
    'ninjamation_reviews',
    'ninjamation_script_versions',
    'ninjamation_scripts',
    'module_call_logs',
    'module_study_sessions',
    'module_automations',
    'module_scaffolds',
    'tenant_user_module_access',
    'tenant_entitlements',
    'tenant_invites',
    'tenant_modules',
    'tenant_users',
  ];
  await pg.query('begin');
  try {
    await pg.query(`set local operatoros.tenant_hard_delete = 'on'`);
    for (const table of tenantTables) {
      try { await pg.query(`delete from ${table} where tenant_id = $1`, [tenantId]); } catch {}
    }
    await pg.query('commit');
  } catch (error) {
    await pg.query('rollback').catch(() => undefined);
    throw error;
  }
  for (const [sql, params] of [
    [`delete from outcall_phone_owners where user_id = $1`, [userId]],
    [`delete from sso_handoff_tokens where user_id = $1`, [userId]],
    [`delete from subscriptions where user_id = $1`, [userId]],
    [`delete from activity_feed where user_id = $1`, [userId]],
    [`delete from admin_audit_logs where admin_id = $1 or target_user_id = $1`, [userId]],
    [`delete from tenants where id = $1`, [tenantId]],
    [`delete from users where id = $1`, [userId]],
  ] as Array<[string, string[]]>) {
    try { await pg.query(sql, params); } catch {}
  }
}

function sessionCookies(context: BrowserContext) {
  return context.cookies().then(cookies => cookies.filter(cookie => cookie.name === 'operatoros_session'));
}

async function assertHostOnlySession(context: BrowserContext, host: string) {
  const cookies = await sessionCookies(context);
  const cookie = cookies.find(candidate => candidate.domain === host);
  expect(cookie, `${host} must own an independent operatoros_session`).toBeTruthy();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.secure).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(cookie?.domain.startsWith('.')).toBe(false);
  expect(cookies.some(candidate => candidate.domain === '.operatoros.net')).toBe(false);
}

async function assertNoBrowserCredentialStorage(page: Page) {
  const storage = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }));
  for (const [key, value] of [...storage.local, ...storage.session]) {
    expect(key.toLowerCase(), `credential-like storage key ${key}`).not.toMatch(
      /(^|[_-])(token|jwt|access.token|id.token|refresh.token|session.token)($|[_-])/,
    );
    expect(value, `JWT-like browser storage value under ${key}`).not.toMatch(/^eyJ[A-Za-z0-9_-]+\./);
  }
}

async function capturePhase20Evidence(
  page: Page,
  label: string,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('h1, h2').filter({ visible: true }).first()).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    `${label} must not overflow horizontally at ${viewport.width}px`,
  ).toBe(true);

  const primaryControl = page.locator('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
    .filter({ visible: true })
    .first();
  await expect(primaryControl, `${label} must expose a keyboard-focusable primary control`).toBeVisible();
  await primaryControl.focus();
  await expect(primaryControl).toBeFocused();

  const screenshotPath = test.info().outputPath(`phase20-${label}-${viewport.width}px.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await test.info().attach(`phase20-${label}-${viewport.width}px`, {
    path: screenshotPath,
    contentType: 'image/png',
  });
}

async function browserJson<T = Record<string, unknown>>(
  page: Page,
  path: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: T; requestId: string | null }> {
  return page.evaluate(
    async ({ path, method, body, headers }) => {
      const response = await fetch(path, {
        method,
        credentials: 'include',
        headers: body === undefined
          ? headers
          : { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch {}
      return {
        status: response.status,
        body: parsed as T,
        requestId: response.headers.get('x-request-id'),
      };
    },
    { path, method, body, headers },
  );
}

function navigationCollector(context: BrowserContext) {
  const urls: string[] = [];
  const handler = (request: Request) => {
    if (request.isNavigationRequest()) urls.push(request.url());
  };
  context.on('request', handler);
  return {
    urls,
    stop: () => context.off('request', handler),
  };
}

test.describe('OperatorOS SSO contract v1 — production hosts', () => {
  let pg: Client | null = null;
  const identities: SeededIdentity[] = [];

  test.beforeEach(async ({ context }, testInfo) => {
    // The production-host proxy is a local test edge. Give each scenario a
    // stable private client address so legitimate logout/reauth coverage does
    // not exhaust the production per-IP login limit across the whole suite.
    // The proxy appends its own peer address and the API validates the chain
    // only because TRUST_PROXY is explicitly enabled for this gate.
    const titleHash = [...testInfo.title].reduce(
      (hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0,
      0,
    );
    const clientOctet = 10 + ((titleHash + testInfo.retry) % 200);
    await context.setExtraHTTPHeaders({
      'x-forwarded-for': `10.77.0.${clientOctet}`,
    });
  });

  test.beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for the SSO v1 browser gate');
    pg = new Client({ connectionString: databaseUrl });
    await pg.connect();
  });

  test.afterAll(async () => {
    if (!pg) return;
    for (const identity of identities) {
      await cleanupIdentity(pg, identity).catch(() => undefined);
    }
    await pg.end().catch(() => undefined);
  });

  test('one credential entry establishes the canonical app host then launches all active modules in the current page', async ({ page, request }) => {
    test.setTimeout(180_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);
    const context = page.context();
    let loginPosts = 0;
    context.on('request', req => {
      if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/auth/login') loginPosts += 1;
    });

    await page.goto(`${ROOT}/app`);
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    const authorizationUrl = new URL(page.url());
    expect(authorizationUrl.searchParams.get('client_id')).toBe('operatoros:web');
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe('https://app.operatoros.net/sso');
    expect(authorizationUrl.searchParams.get('next')).toBe('https://app.operatoros.net/');
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizationUrl.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(authorizationUrl.searchParams.get('nonce')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(authorizationUrl.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    assertNoCredentialQuery(page.url());

    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    expect(loginPosts).toBe(1);
    assertNoCredentialQuery(page.url());
    await assertHostOnlySession(context, 'auth.operatoros.net');
    await assertHostOnlySession(context, 'app.operatoros.net');
    await assertNoBrowserCredentialStorage(page);

    await page.getByTestId('nav-my-apps').click();
    await expect(page.getByTestId('page-my-apps')).toBeVisible();
    await capturePhase20Evidence(page, 'platform-tool-catalog', { width: 1440, height: 1000 });

    const evidenceViewports = [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 1000 },
    ] as const;
    const initialPageCount = context.pages().length;
    expect(initialPageCount).toBe(1);
    let lastModuleUrl = '';
    for (const [index, module] of ENABLED_MODULES.entries()) {
      const collection = navigationCollector(context);
      await page.getByTestId(`button-launch-${module.slug}`).click();
      const modulePage = page;
      await expect(modulePage.getByTestId(module.shellTestId)).toBeVisible({ timeout: 30_000 });
      await modulePage.waitForLoadState('networkidle', { timeout: 10_000 });
      collection.stop();

      expect(context.pages(), `${module.slug} ordinary launch must reuse the current page`).toHaveLength(initialPageCount);
      expect(loginPosts, `${module.slug} must use the existing auth-host session`).toBe(1);
      expect(new URL(modulePage.url()).hostname).toBe(module.host);
      assertNoCredentialQuery(modulePage.url());

      const authVisits = collection.urls.filter(url => {
        const parsed = new URL(url);
        return parsed.hostname === 'auth.operatoros.net' && parsed.pathname === '/login';
      });
      expect(authVisits.length, `${module.slug} must not loop through central auth`).toBeLessThanOrEqual(1);

      const callbacks = collection.urls.filter(url => {
        const parsed = new URL(url);
        return parsed.hostname === module.host && parsed.pathname === '/sso';
      });
      expect(callbacks, `${module.slug} must complete exactly one registered callback`).toHaveLength(1);
      expect([...new URL(callbacks[0]).searchParams.keys()].sort()).toEqual(['code', 'state']);

      for (const url of collection.urls) assertNoCredentialQuery(url);
      await assertHostOnlySession(context, module.host);
      await assertNoBrowserCredentialStorage(modulePage);

      if (index < evidenceViewports.length) {
        await capturePhase20Evidence(
          modulePage,
          `${module.slug}-same-tab`,
          evidenceViewports[index],
        );
      }

      lastModuleUrl = modulePage.url();
      await modulePage.goBack();
      await expect(modulePage.getByTestId('page-my-apps')).toBeVisible({ timeout: 30_000 });
      expect(context.pages()).toHaveLength(initialPageCount);
    }

    const intentionalLaunch = page.getByTestId(`button-launch-${ENABLED_MODULES[0]!.slug}`);
    const modifierPagePromise = context.waitForEvent('page');
    await intentionalLaunch.click({ modifiers: ['Control'] });
    const modifierPage = await modifierPagePromise;
    await modifierPage.waitForURL(url => (
      url.hostname === ENABLED_MODULES[0]!.host && url.pathname !== '/sso'
    ), { timeout: 30_000 });
    assertNoCredentialQuery(modifierPage.url());
    expect(context.pages()).toHaveLength(initialPageCount + 1);
    await modifierPage.close();

    const middlePagePromise = context.waitForEvent('page');
    await intentionalLaunch.click({ button: 'middle' });
    const middlePage = await middlePagePromise;
    await middlePage.waitForURL(url => (
      url.hostname === ENABLED_MODULES[0]!.host && url.pathname !== '/sso'
    ), { timeout: 30_000 });
    assertNoCredentialQuery(middlePage.url());
    expect(context.pages()).toHaveLength(initialPageCount + 1);
    await middlePage.close();

    const explicitPagePromise = context.waitForEvent('page');
    await page.getByTestId(`button-launch-new-tab-${ENABLED_MODULES[0]!.slug}`).click();
    const explicitPage = await explicitPagePromise;
    await explicitPage.waitForURL(url => (
      url.hostname === ENABLED_MODULES[0]!.host && url.pathname !== '/sso'
    ), { timeout: 30_000 });
    assertNoCredentialQuery(explicitPage.url());
    expect(context.pages()).toHaveLength(initialPageCount + 1);
    expect(await explicitPage.evaluate(() => window.opener)).toBeNull();
    await explicitPage.close();
    expect(context.pages()).toHaveLength(initialPageCount);

    const expectedSessionHosts = new Set([
      'auth.operatoros.net',
      'app.operatoros.net',
      ...ENABLED_MODULES.map(module => module.host),
    ]);
    const cookies = await sessionCookies(context);
    expect(new Set(cookies.map(cookie => cookie.domain))).toEqual(expectedSessionHosts);

    // Global logout revokes every already-issued host token via tokenVersion.
    // The stale module cookie may still exist in the browser, but replay must
    // fail at /me and the client must restart central authentication.
    const logoutAll = await page.evaluate(async () => {
      const response = await fetch('/api/auth/logout-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: response.status, body: await response.text() };
    });
    expect(logoutAll.status, logoutAll.body).toBe(200);
    await page.goto(lastModuleUrl);
    await page.waitForURL(/^https:\/\/auth\.operatoros\.net\/login\?/, { timeout: 30_000 });
    expect(loginPosts).toBe(1);
    assertNoCredentialQuery(page.url());
  });

  test('direct deep link survives login, a sibling tab uses silent SSO, back does not loop, and local logout is host-only', async ({ page, request }) => {
    test.setTimeout(150_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);
    const context = page.context();
    let loginPosts = 0;
    context.on('request', req => {
      if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/auth/login') loginPosts += 1;
    });
    const collection = navigationCollector(context);

    await page.goto('https://techdeck.operatoros.net/assets');
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/techdeck\.operatoros\.net\/assets(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    await expect(page.getByTestId('techdeck-module-shell')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#techdeck-ops')).toBeVisible();
    expect(loginPosts).toBe(1);
    assertNoCredentialQuery(page.url());
    await assertHostOnlySession(context, 'techdeck.operatoros.net');

    const authVisitsBeforeBack = collection.urls.filter(url => {
      const parsed = new URL(url);
      return parsed.hostname === 'auth.operatoros.net' && parsed.pathname === '/login';
    }).length;
    await page.goBack({ waitUntil: 'domcontentloaded' });
    expect(page.url(), 'browser back must not return to central authentication').not.toMatch(
      /^https:\/\/auth\.operatoros\.net\/login\?/,
    );
    const authVisitsAfterBack = collection.urls.filter(url => {
      const parsed = new URL(url);
      return parsed.hostname === 'auth.operatoros.net' && parsed.pathname === '/login';
    }).length;
    expect(authVisitsAfterBack, 'browser back must not restart central authentication').toBe(authVisitsBeforeBack);
    expect(loginPosts).toBe(1);

    await page.goto('https://techdeck.operatoros.net/assets');
    await expect(page.getByTestId('techdeck-module-shell')).toBeVisible({ timeout: 20_000 });
    expect(loginPosts, 'returning to the deep link must reuse the TechDeck host session').toBe(1);

    const sibling = await context.newPage();
    await sibling.goto('https://pulsedesk.operatoros.net/dashboard');
    await expect(sibling.getByTestId('pulsedesk-module-shell')).toBeVisible({ timeout: 30_000 });
    expect(loginPosts, 'a sibling module tab must reuse the auth-host session').toBe(1);
    await assertHostOnlySession(context, 'pulsedesk.operatoros.net');
    assertNoCredentialQuery(sibling.url());

    const asset = await sibling.evaluate(async () => {
      const response = await fetch('/api/modules/pulsedesk/assets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetTag: 'E2E-OPS-01',
          name: 'Facilities Dispatch Console',
          equipmentType: 'operational_equipment',
          status: 'active',
          phiAcknowledged: true,
        }),
      });
      return { status: response.status, body: await response.json() };
    });
    expect(asset.status, JSON.stringify(asset.body)).toBe(201);
    expect(asset.body.id).toBeTruthy();

    await sibling.goto(`https://pulsedesk.operatoros.net/assets/${asset.body.id}/report-issue`);
    await expect(sibling.getByTestId('pulsedesk-service-ticket-create')).toBeVisible({ timeout: 30_000 });
    await expect(sibling.getByRole('status').filter({ hasText: 'Reporting an issue for the equipment selected by this deep link' })).toBeVisible();
    await expect(sibling.locator('select[name="assetId"]')).toHaveValue(asset.body.id);
    const ticketSummary = `E2E operational equipment issue ${Date.now()}`;
    const createForm = sibling.getByTestId('pulsedesk-service-ticket-create');
    await createForm.locator('input[name="summary"]').fill(ticketSummary);
    await createForm.locator('textarea[name="description"]').fill('Facilities dispatch console is unavailable for operational coordination.');
    await createForm.locator('input[name="locationLabel"]').fill('Facilities dispatch');
    await createForm.locator('input[name="phiAcknowledged"]').check();
    await createForm.getByRole('button', { name: 'Create ticket' }).click();
    await expect(sibling.getByRole('status').filter({ hasText: 'Ticket creation completed.' })).toBeVisible({ timeout: 30_000 });

    const createdTicket = await sibling.evaluate(async (summary) => {
      const response = await fetch(`/api/modules/pulsedesk/tickets?search=${encodeURIComponent(summary)}`, {
        credentials: 'include',
      });
      const body = await response.json();
      return { status: response.status, ticket: body.tickets?.[0] ?? null };
    }, ticketSummary);
    expect(createdTicket.status, JSON.stringify(createdTicket)).toBe(200);
    expect(createdTicket.ticket?.id).toBeTruthy();

    await sibling.goto(`https://pulsedesk.operatoros.net/tickets/${createdTicket.ticket.id}`);
    await expect(sibling.getByTestId('pulsedesk-ticket-workspace')).toBeVisible({ timeout: 30_000 });
    await expect(sibling.getByText(ticketSummary, { exact: false }).first()).toBeVisible();
    const internalNote = 'Dispatch supervisor confirmed equipment replacement is staged.';
    const noteForm = sibling.locator('form').filter({ has: sibling.getByRole('button', { name: 'Add internal note' }) });
    await noteForm.locator('textarea[name="body"]').fill(internalNote);
    await noteForm.getByRole('button', { name: 'Add internal note' }).click();
    await expect(sibling.getByText(internalNote, { exact: true })).toBeVisible({ timeout: 30_000 });
    await sibling.reload();
    await expect(sibling.getByText(internalNote, { exact: true })).toBeVisible({ timeout: 30_000 });

    await sibling.goto('https://pulsedesk.operatoros.net/analytics');
    await expect(sibling.getByTestId('pulsedesk-analytics-route')).toBeVisible({ timeout: 30_000 });
    await sibling.goto('https://pulsedesk.operatoros.net/service-desk-admin');
    await expect(sibling.getByTestId('pulsedesk-assignments-route')).toBeVisible({ timeout: 30_000 });
    await sibling.goto('https://pulsedesk.operatoros.net/integrations');
    const connectorLabel = `E2E SendGrid ${Date.now()}`;
    const connectorConsole = sibling.getByTestId('pulsedesk-connector-console');
    await expect(connectorConsole).toBeVisible({ timeout: 30_000 });
    await connectorConsole.locator('input[name="label"]').fill(connectorLabel);
    await connectorConsole.locator('input[name="mailboxAddress"]').fill(`phase27-${Date.now()}@example.invalid`);
    await connectorConsole.locator('input[name="secretReference"]').fill('e2e-encrypted-reference-only');
    await connectorConsole.getByRole('button', { name: 'Save connector' }).click();
    await expect(connectorConsole.getByText(connectorLabel, { exact: true })).toBeVisible({ timeout: 30_000 });
    await connectorConsole.getByRole('button', { name: 'Test intake' }).click();
    await expect(connectorConsole.getByRole('status')).toContainText('Deterministic ingestion completed.', { timeout: 30_000 });

    const publicPolicy = await sibling.evaluate(async () => {
      const response = await fetch('/api/modules/pulsedesk/public-intake-policies', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxRequestsPerHour: 3 }),
      });
      return { status: response.status, body: await response.json() };
    });
    expect(publicPolicy.status, JSON.stringify(publicPolicy.body)).toBe(201);
    const intakePage = await context.newPage();
    await intakePage.goto(`https://pulsedesk.operatoros.net/submit/${publicPolicy.body.public_slug}`);
    await expect(intakePage.getByTestId('pulsedesk-public-intake')).toBeVisible({ timeout: 30_000 });
    await expect(intakePage.locator('aside').filter({ hasText: 'Do not include patient names' })).toBeVisible();
    const serviceWorkerArtifact = await intakePage.evaluate(async () => {
      const response = await fetch('/pulsedesk-sw.js', { cache: 'no-store' });
      return { status: response.status, body: await response.text() };
    });
    expect(serviceWorkerArtifact.status).toBe(200);
    expect(serviceWorkerArtifact.body).toContain("request.method !== 'GET'");
    await intakePage.setViewportSize({ width: 390, height: 844 });
    await expect(intakePage.getByRole('heading', { name: 'Report an operational issue' })).toBeVisible();
    await expect(intakePage.getByRole('button', { name: 'Submit issue' })).toBeVisible();
    await intakePage.close();

    const clientName = `E2E Service Client ${Date.now()}`;
    const client = await sibling.evaluate(async (name) => {
      const response = await fetch('/api/modules/pulsedesk/clients', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: 'client', facilityCategory: 'healthcare_operations', phiRestricted: true }),
      });
      return { status: response.status, body: await response.json() };
    }, clientName);
    expect(client.status, JSON.stringify(client.body)).toBe(201);
    await sibling.goto(`https://pulsedesk.operatoros.net/clients/${client.body.id}`);
    const directory = sibling.getByTestId('pulsedesk-business-directory');
    await expect(directory).toBeVisible({ timeout: 30_000 });
    await expect(directory.locator('.directory-row[data-active="true"]').filter({ hasText: clientName })).toBeVisible();
    await capturePhase20Evidence(sibling, 'pulsedesk-completed', { width: 1440, height: 1000 });

    await page.goto('https://techdeck.operatoros.net/logout');
    await expect(page).toHaveURL(/^https:\/\/operatoros\.net\/signed-out\?signed_out=local$/);
    const cookiesAfterLocalLogout = await sessionCookies(context);
    expect(cookiesAfterLocalLogout.some(cookie => cookie.domain === 'techdeck.operatoros.net')).toBe(false);
    expect(cookiesAfterLocalLogout.some(cookie => cookie.domain === 'auth.operatoros.net')).toBe(true);
    expect(cookiesAfterLocalLogout.some(cookie => cookie.domain === 'pulsedesk.operatoros.net')).toBe(true);
    await sibling.reload();
    await expect(sibling.getByTestId('pulsedesk-module-shell')).toBeVisible({ timeout: 20_000 });

    collection.stop();
    await sibling.close();
  });

  test('TechDeck persists managed infrastructure, topology, documentation, evidence, reports, time, tickets, and exact record deep links', async ({ page, request }) => {
    test.setTimeout(180_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);
    const context = page.context();

    await page.goto('https://techdeck.operatoros.net/assets');
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/techdeck\.operatoros\.net\/assets(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    await expect(page.getByTestId('techdeck-module-shell')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('techdeck-ops-workspace')).toBeVisible();
    await assertHostOnlySession(context, 'techdeck.operatoros.net');
    await assertNoBrowserCredentialStorage(page);

    const suffix = Date.now();
    const firewallName = `E2E Edge Firewall ${suffix}`;
    const subnetName = `E2E Clinical VLAN ${suffix}`;
    const configurationForm = page.getByTestId('techdeck-configuration-create-form');
    await configurationForm.locator('input[placeholder="Name"]').fill(firewallName);
    await configurationForm.locator('select').first().selectOption('firewall');
    await configurationForm.locator('input[placeholder="Hostname"]').fill(`edge-${suffix}.example.test`);
    await configurationForm.locator('input[placeholder="IP address"]').fill('10.77.29.1');
    await configurationForm.getByRole('button', { name: 'Add item' }).click();
    await expect(page.locator('.td-row').filter({ hasText: firewallName })).toBeVisible({ timeout: 30_000 });

    await configurationForm.locator('input[placeholder="Name"]').fill(subnetName);
    await configurationForm.locator('select').first().selectOption('subnet');
    await configurationForm.locator('input[placeholder^="CIDR"]').fill('10.77.29.0/24');
    await configurationForm.locator('input[placeholder="VLAN"]').fill('729');
    await configurationForm.getByRole('button', { name: 'Add item' }).click();
    await expect(page.locator('.td-row').filter({ hasText: subnetName })).toBeVisible({ timeout: 30_000 });

    const workspaceAfterItems = await page.evaluate(async () => {
      const response = await fetch('/api/modules/techdeck/workspace', { credentials: 'include' });
      return { status: response.status, body: await response.json() };
    });
    expect(workspaceAfterItems.status, JSON.stringify(workspaceAfterItems.body)).toBe(200);
    const firewall = workspaceAfterItems.body.configurationItems.find((row: { name: string }) => row.name === firewallName);
    const subnet = workspaceAfterItems.body.configurationItems.find((row: { name: string }) => row.name === subnetName);
    expect(firewall?.id).toBeTruthy();
    expect(subnet?.id).toBeTruthy();

    await page.getByLabel(`Health for ${firewallName}`).selectOption('warning');
    await expect(page.getByLabel(`Health for ${firewallName}`)).toHaveValue('warning');
    await page.goto('https://techdeck.operatoros.net/network');
    const relationshipForm = page.getByTestId('techdeck-relationship-create-form');
    await expect(relationshipForm).toBeVisible({ timeout: 30_000 });
    await relationshipForm.locator('select').nth(0).selectOption(firewall.id);
    await relationshipForm.locator('select').nth(1).selectOption(subnet.id);
    await relationshipForm.locator('select').nth(2).selectOption('protects');
    await relationshipForm.getByRole('button', { name: 'Link' }).click();
    await expect(page.locator('.td-row').filter({ hasText: `${firewallName} protects ${subnetName}` })).toBeVisible({ timeout: 30_000 });

    await page.goto(`https://techdeck.operatoros.net/assets/${firewall.id}`);
    const configurationContext = page.getByTestId('techdeck-route-record-context');
    await expect(configurationContext).toHaveAttribute('data-found', 'true');
    await expect(configurationContext).toContainText(firewallName);
    await expect(page.locator(`.td-row[data-record-id="${firewall.id}"][data-active="true"]`)).toBeVisible();

    const runbookTitle = `E2E Firewall Recovery ${suffix}`;
    await page.goto('https://techdeck.operatoros.net/documentation');
    const documentForm = page.getByTestId('techdeck-document-create-form');
    await documentForm.locator('input[placeholder="Document title"]').fill(runbookTitle);
    await documentForm.locator('select').first().selectOption('runbook');
    await documentForm.locator('input[placeholder="Summary"]').fill('Validated, documentation-only firewall recovery sequence.');
    await documentForm.locator('textarea').fill('1. Verify current configuration.\\n2. Capture evidence.\\n3. Apply the approved manual recovery plan.');
    await documentForm.getByRole('button', { name: 'Save draft' }).click();
    await page.goto('https://techdeck.operatoros.net/runbooks');
    const runbookRow = page.locator('.td-doc').filter({ hasText: runbookTitle });
    await expect(runbookRow).toBeVisible({ timeout: 30_000 });

    const workspaceAfterDocument = await page.evaluate(async () => {
      const response = await fetch('/api/modules/techdeck/workspace', { credentials: 'include' });
      return response.json();
    });
    const runbook = workspaceAfterDocument.documents.find((row: { title: string }) => row.title === runbookTitle);
    expect(runbook?.id).toBeTruthy();
    await page.goto(`https://techdeck.operatoros.net/runbooks/${runbook.id}`);
    await expect(page.getByTestId('techdeck-route-record-context')).toHaveAttribute('data-found', 'true');
    await expect(page.locator(`.td-doc[data-record-id="${runbook.id}"][data-active="true"]`)).toBeVisible();

    const deepLinkedRunbook = page.locator('.td-doc').filter({ hasText: runbookTitle });
    await deepLinkedRunbook.getByRole('button', { name: 'Submit review' }).click();
    await expect(deepLinkedRunbook.getByRole('button', { name: 'Approve' })).toBeVisible({ timeout: 30_000 });
    await deepLinkedRunbook.getByRole('button', { name: 'Approve' }).click();
    await expect(deepLinkedRunbook.getByRole('button', { name: 'Publish' })).toBeVisible({ timeout: 30_000 });
    await deepLinkedRunbook.getByRole('button', { name: 'Publish' }).click();
    await expect(deepLinkedRunbook).toContainText('published', { timeout: 30_000 });
    await page.reload();
    await expect(page.locator(`.td-doc[data-record-id="${runbook.id}"]`)).toContainText('published');

    const evidenceTitle = `E2E Firewall Validation ${suffix}`;
    await page.goto('https://techdeck.operatoros.net/evidence/upload');
    const evidenceForm = page.getByTestId('techdeck-evidence-create-form');
    await evidenceForm.locator('input[placeholder="Evidence title"]').fill(evidenceTitle);
    await evidenceForm.locator('select').first().selectOption('test_result');
    await evidenceForm.locator('select').nth(1).selectOption(firewall.id);
    await evidenceForm.locator('input[placeholder="Summary"]').fill('Post-change connectivity and policy checks passed.');
    await evidenceForm.getByRole('button', { name: 'Record' }).click();
    await expect(page.locator('.td-row').filter({ hasText: evidenceTitle })).toBeVisible({ timeout: 30_000 });

    const reportName = `E2E Managed Infrastructure ${suffix}`;
    await page.goto('https://techdeck.operatoros.net/reports');
    const reportForm = page.getByTestId('techdeck-report-create-form');
    await reportForm.locator('input').fill(reportName);
    await reportForm.getByRole('button', { name: 'Generate' }).click();
    await expect(page.locator('.td-row').filter({ hasText: reportName })).toBeVisible({ timeout: 30_000 });

    const timeNotes = `E2E recovery validation ${suffix}`;
    await page.goto('https://techdeck.operatoros.net/time');
    const timeForm = page.getByTestId('techdeck-time-create-form');
    await timeForm.locator('input[type="number"]').fill('45');
    await timeForm.locator('select').selectOption(firewall.id);
    await timeForm.locator('input[placeholder="Work notes"]').fill(timeNotes);
    await timeForm.getByRole('button', { name: 'Log time' }).click();
    await expect(page.locator('.td-row').filter({ hasText: timeNotes })).toBeVisible({ timeout: 30_000 });

    const ticketTitle = `E2E Firewall Warning ${suffix}`;
    await page.goto('https://techdeck.operatoros.net/tickets');
    await page.getByTestId('techdeck-ticket-title').fill(ticketTitle);
    await page.locator('textarea[placeholder^="Symptoms"]').fill('Monitoring reports a warning posture after the controlled recovery.');
    await page.getByTestId('techdeck-ticket-create').click();
    await expect(page.locator('.techdeck-ticket-card').filter({ hasText: ticketTitle })).toBeVisible({ timeout: 30_000 });
    const ticketResponse = await page.evaluate(async (title) => {
      const response = await fetch(`/api/modules/techdeck/tickets?search=${encodeURIComponent(title)}`, { credentials: 'include' });
      return { status: response.status, body: await response.json() };
    }, ticketTitle);
    expect(ticketResponse.status, JSON.stringify(ticketResponse.body)).toBe(200);
    const ticket = ticketResponse.body.tickets?.find((row: { title: string }) => row.title === ticketTitle);
    expect(ticket?.id).toBeTruthy();
    await page.goto(`https://techdeck.operatoros.net/tickets/${ticket.id}`);
    await expect(page.getByTestId('techdeck-ticket-route-context')).toHaveAttribute('data-found', 'true');
    await expect(page.getByTestId(`techdeck-ticket-${ticket.id}`)).toHaveAttribute('data-active', 'true');
    await page.getByTestId(`techdeck-ticket-status-${ticket.id}`).selectOption('in_progress');
    await expect(page.getByTestId(`techdeck-ticket-status-${ticket.id}`)).toHaveValue('in_progress');
    await page.reload();
    await expect(page.getByTestId(`techdeck-ticket-status-${ticket.id}`)).toHaveValue('in_progress');

    const clientName = `E2E Managed Client ${suffix}`;
    const client = await page.evaluate(async (name) => {
      const organizationResponse = await fetch('/api/modules/techdeck/directory/organizations', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: 'client' }),
      });
      const body = await organizationResponse.json();
      const profileResponse = await fetch(`/api/modules/techdeck/directory/organizations/${body.id}/profile`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceTier: 'managed' }),
      });
      return { organizationStatus: organizationResponse.status, profileStatus: profileResponse.status, body };
    }, clientName);
    expect(client.organizationStatus, JSON.stringify(client.body)).toBe(201);
    expect(client.profileStatus, JSON.stringify(client.body)).toBe(200);
    await page.goto(`https://techdeck.operatoros.net/clients/${client.body.id}`);
    const directory = page.getByTestId('techdeck-business-directory');
    await expect(directory).toBeVisible({ timeout: 30_000 });
    await expect(directory.locator('.directory-row[data-active="true"]').filter({ hasText: clientName })).toBeVisible();

    const persistedWorkspace = await page.evaluate(async () => {
      const response = await fetch('/api/modules/techdeck/workspace', { credentials: 'include' });
      return { status: response.status, body: await response.json() };
    });
    expect(persistedWorkspace.status, JSON.stringify(persistedWorkspace.body)).toBe(200);
    expect(persistedWorkspace.body.configurationItems.find((row: { id: string }) => row.id === firewall.id)?.health).toBe('warning');
    expect(persistedWorkspace.body.relationships.some((row: { sourceAssetId: string; targetAssetId: string }) => row.sourceAssetId === firewall.id && row.targetAssetId === subnet.id)).toBe(true);
    expect(persistedWorkspace.body.documents.find((row: { id: string }) => row.id === runbook.id)?.status).toBe('published');
    expect(persistedWorkspace.body.evidence.some((row: { title: string }) => row.title === evidenceTitle)).toBe(true);
    expect(persistedWorkspace.body.reports.some((row: { name: string }) => row.name === reportName)).toBe(true);
    expect(persistedWorkspace.body.timeEntries.some((row: { notes: string }) => row.notes === timeNotes)).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('https://techdeck.operatoros.net/m/time');
    await expect(page.locator('#techdeck-time')).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await capturePhase20Evidence(page, 'techdeck-completed', { width: 390, height: 844 });

    await page.getByTestId('techdeck-return-command-center').click();
    await expect(page).toHaveURL(/^https:\/\/app\.operatoros\.net\//, { timeout: 30_000 });
    await expect(page.getByTestId('page-my-apps')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('button-launch-techdeck').click();
    const reopened = page;
    await expect(reopened.getByTestId('techdeck-module-shell')).toBeVisible({ timeout: 30_000 });
    await reopened.goto(`https://techdeck.operatoros.net/assets/${firewall.id}`);
    await expect(reopened.getByTestId('techdeck-route-record-context')).toContainText(firewallName);
    await reopened.goto('https://techdeck.operatoros.net/logout');
    await expect(reopened).toHaveURL(/^https:\/\/operatoros\.net\/signed-out\?signed_out=local$/);
    expect((await sessionCookies(context)).some(cookie => cookie.domain === 'techdeck.operatoros.net')).toBe(false);
  });

  test('TechDeck literal restoration is usable across exact-host desktop, public, and mobile surfaces', async ({ browser, page, request }) => {
    test.setTimeout(180_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);

    await page.goto('https://techdeck.operatoros.net/calendar');
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/techdeck\.operatoros\.net\/calendar(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);

    const openLiteralRoute = async (path: string, ids: readonly string[]) => {
      await page.goto(`https://techdeck.operatoros.net${path}`, { waitUntil: 'domcontentloaded' });
      const workspace = page.getByTestId('techdeck-literal-workspace');
      await expect(workspace).toBeVisible({ timeout: 30_000 });
      for (const id of ids) await expect(page.locator(`#${id}`)).toBeVisible();
      return workspace;
    };
    for (const [path, ids] of [
      ['/calendar', ['techdeck-calendar']],
      ['/portal', ['techdeck-portal']],
      ['/licenses', ['techdeck-licenses']],
      ['/status', ['techdeck-status']],
      ['/webhooks', ['techdeck-webhooks']],
      ['/api-tokens', ['techdeck-api-tokens']],
      ['/compliance', ['techdeck-secure-intake', 'techdeck-compliance']],
    ] as const) await openLiteralRoute(path, ids);

    const suffix = Date.now().toString(36);
    const appointmentTitle = `Phase 26 review ${suffix}`;
    const startsAt = new Date(Date.now() + 3_600_000);
    const endsAt = new Date(startsAt.getTime() + 1_800_000);
    const localDateTime = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await openLiteralRoute('/calendar', ['techdeck-calendar']);
    const calendar = page.locator('#techdeck-calendar');
    await calendar.getByPlaceholder('Appointment title').fill(appointmentTitle);
    await calendar.getByLabel('Starts at').fill(localDateTime(startsAt));
    await calendar.getByLabel('Ends at').fill(localDateTime(endsAt));
    await calendar.getByRole('button', { name: 'Schedule' }).click();
    await expect(calendar).toContainText(appointmentTitle, { timeout: 30_000 });

    const productName = `Phase 26 Agent ${suffix}`;
    let literal = await openLiteralRoute('/licenses', ['techdeck-licenses']);
    const licenses = page.locator('#techdeck-licenses');
    await licenses.getByPlaceholder('Product name').fill(productName);
    await licenses.getByPlaceholder('product-slug').fill(`phase-26-agent-${suffix}`);
    await licenses.getByPlaceholder('License purpose').fill('Exact-host browser acceptance product.');
    await licenses.getByRole('button', { name: 'Add product' }).click();
    const productRow = licenses.locator('li').filter({ hasText: productName });
    await expect(productRow).toBeVisible({ timeout: 30_000 });
    await productRow.getByRole('button', { name: 'Issue key' }).click();
    await expect(literal.locator('.tdl-secret code')).toContainText(/^tdk_/, { timeout: 30_000 });

    const statusTitle = `Phase 26 Status ${suffix}`;
    const statusSlug = `phase-26-status-${suffix}`;
    await openLiteralRoute('/status', ['techdeck-status']);
    const status = page.locator('#techdeck-status');
    await status.getByPlaceholder('Status page title').fill(statusTitle);
    await status.getByPlaceholder('public-slug').fill(statusSlug);
    await status.getByPlaceholder('Public summary').fill('Public Phase 26 service status.');
    await status.getByRole('button', { name: 'Publish page' }).click();
    await expect(status).toContainText(statusTitle, { timeout: 30_000 });

    literal = await openLiteralRoute('/api-tokens', ['techdeck-api-tokens']);
    const tokens = page.locator('#techdeck-api-tokens');
    await tokens.getByPlaceholder('Service identity').fill(`phase26-agent-${suffix}`);
    await tokens.getByPlaceholder('Token label').fill('Exact-host read token');
    await tokens.getByRole('button', { name: 'Issue read token' }).click();
    await expect(literal.locator('.tdl-secret code')).not.toBeEmpty({ timeout: 30_000 });

    const intakeName = `Phase 26 Intake ${suffix}`;
    literal = await openLiteralRoute('/compliance', ['techdeck-secure-intake', 'techdeck-compliance']);
    const intake = page.locator('#techdeck-secure-intake');
    await intake.getByPlaceholder('Intake space').fill(intakeName);
    await intake.getByPlaceholder('intake-slug').fill(`phase-26-intake-${suffix}`);
    await intake.getByPlaceholder('Uploader instructions').fill('Upload bounded test evidence.');
    await intake.getByRole('button', { name: 'Create space' }).click();
    const intakeRow = intake.locator('li').filter({ hasText: intakeName });
    await expect(intakeRow).toBeVisible({ timeout: 30_000 });
    await intakeRow.getByRole('button', { name: 'Create request' }).click();
    const intakePath = await literal.locator('.tdl-secret code').textContent();
    expect(intakePath).toMatch(/^\/t\/upload\/tdi_/);

    await openLiteralRoute('/webhooks', ['techdeck-webhooks']);
    const webhooks = page.locator('#techdeck-webhooks');
    await webhooks.getByPlaceholder('Endpoint name').fill('Blocked loopback endpoint');
    await webhooks.getByPlaceholder('https://receiver.example/hook').fill('https://127.0.0.1/hook');
    await webhooks.getByPlaceholder('Signing secret').fill('phase26-browser-signing-secret');
    await webhooks.getByRole('button', { name: 'Add endpoint' }).click();
    await expect(literal.getByRole('alert')).toContainText(/hostname is not public|address is not public|SSRF/i, { timeout: 30_000 });

    await openLiteralRoute('/compliance', ['techdeck-secure-intake', 'techdeck-compliance']);
    const compliance = page.locator('#techdeck-compliance');
    await compliance.getByRole('button', { name: 'Build deterministic ZIP packet' }).click();
    await expect(compliance).toContainText(/queued|integrity artifact ready/i, { timeout: 30_000 });

    const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const publicStatus = await anonymous.newPage();
      await publicStatus.goto(`https://techdeck.operatoros.net/status/${statusSlug}`);
      await expect(publicStatus.getByTestId('techdeck-public-status')).toContainText(statusTitle, { timeout: 30_000 });
      await expect(publicStatus.getByText('Public, no sign-in')).toBeVisible();

      const publicIntake = await anonymous.newPage();
      await publicIntake.goto(`https://techdeck.operatoros.net${intakePath}`);
      await expect(publicIntake.getByTestId('techdeck-public-intake')).toContainText(`Evidence request for ${intakeName}`, { timeout: 30_000 });
      await expect(publicIntake.getByLabel('Evidence file')).toBeVisible();
    } finally {
      await anonymous.close();
    }

    literal = page.getByTestId('techdeck-literal-workspace');
    const interactive = literal.locator('button,input,textarea,select,a');
    const unnamed = await interactive.evaluateAll(elements => elements.filter(element => {
      const html = element as HTMLElement;
      const input = element as HTMLInputElement;
      const visible = getComputedStyle(html).display !== 'none' && html.getBoundingClientRect().width > 0 && html.getBoundingClientRect().height > 0;
      return visible && !(html.getAttribute('aria-label') || html.textContent?.trim() || input.placeholder);
    }).length);
    expect(unnamed, 'literal restoration controls need accessible names').toBe(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('https://techdeck.operatoros.net/compliance-packets');
    await expect(page.getByTestId('techdeck-literal-workspace')).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await capturePhase20Evidence(page, 'techdeck-phase26-literal-mobile', { width: 390, height: 844 });
  });

  test('TorqueShed persists diagnostics, signed Assist accounting, Marketplace, and Community across deep-link reauthentication', async ({ page, request }) => {
    test.setTimeout(240_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);
    const context = page.context();
    const suffix = Date.now().toString(36);
    const vehicleName = `E2E Misfire Rig ${suffix}`;
    const diagnosticTitle = `E2E P0302 investigation ${suffix}`;
    const listingTitle = `E2E diagnostic scope ${suffix}`;
    const postTitle = `E2E evidence-first finding ${suffix}`;
    const commentBody = `Compression evidence independently verified ${suffix}.`;

    await page.goto('https://torqueshed.operatoros.net/diagnostics');
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/torqueshed\.operatoros\.net\/diagnostics(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    await expect(page.getByTestId('torqueshed-module-shell')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('torqueshed-diagnostics')).toBeVisible();
    await assertHostOnlySession(context, 'torqueshed.operatoros.net');
    await assertNoBrowserCredentialStorage(page);
    assertNoCredentialQuery(page.url());

    await page.goto('https://torqueshed.operatoros.net/garage/vehicles/new');
    await expect(page.getByTestId('torqueshed-garage')).toBeVisible({ timeout: 30_000 });
    const vehicleForm = page.getByTestId('torqueshed-garage').locator('form').first();
    await vehicleForm.getByLabel('Year').fill('2018');
    await vehicleForm.getByLabel('Nickname').fill(vehicleName);
    await vehicleForm.getByLabel('Make').fill('Ford');
    await vehicleForm.getByLabel('Model').fill('F-150');
    await vehicleForm.getByLabel('Mileage').fill('84210');
    await vehicleForm.getByLabel('Engine').fill('3.5L EcoBoost');
    await vehicleForm.getByLabel('VIN (masked after save)').fill('1FTFW1EG0JFA12345');
    const vehicleResponse = page.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/modules/torqueshed/vehicles');
    await vehicleForm.getByRole('button', { name: 'Save vehicle' }).click();
    const vehicleReply = await vehicleResponse;
    expect(vehicleReply.status(), await vehicleReply.text()).toBe(201);
    const vehicle = await vehicleReply.json() as { id: string; vinMasked: string };
    expect(vehicle.vinMasked).toBe('***********A12345');
    await page.goto('https://torqueshed.operatoros.net/garage');
    await expect(page.getByTestId('torqueshed-garage')).toContainText(vehicleName);

    await page.goto('https://torqueshed.operatoros.net/diagnostics/new');
    await expect(page.getByTestId('torqueshed-diagnostics')).toBeVisible({ timeout: 30_000 });
    const diagnosticForm = page.getByTestId('torqueshed-diagnostics').locator('form').first();
    await diagnosticForm.getByLabel('Vehicle').selectOption(vehicle.id);
    await diagnosticForm.getByLabel('Title').fill(diagnosticTitle);
    await diagnosticForm.getByLabel('Customer concern').fill('Intermittent misfire under load with no confirmed repair.');
    await diagnosticForm.getByLabel('Symptoms').fill('P0302 returns during controlled acceleration.');
    const diagnosticResponse = page.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/modules/torqueshed/diagnostics');
    await diagnosticForm.getByRole('button', { name: 'Start session' }).click();
    const diagnosticReply = await diagnosticResponse;
    expect(diagnosticReply.status(), await diagnosticReply.text()).toBe(201);
    const diagnostic = await diagnosticReply.json() as { id: string };
    await page.goto(`https://torqueshed.operatoros.net/diagnostics/${diagnostic.id}`);

    const timeline = page.getByTestId('torqueshed-diagnostic-timeline');
    await expect(timeline).toHaveAttribute('data-record-id', diagnostic.id);
    const codeForm = timeline.locator('form').filter({ hasText: 'Trouble code' });
    await codeForm.locator('input[name="code"]').fill('P0302');
    await codeForm.locator('input[name="description"]').fill('Cylinder 2 misfire detected');
    await codeForm.locator('input[name="freezeFrame"]').fill('Load 62 percent at 2,800 RPM');
    await codeForm.getByRole('button', { name: 'Add code' }).click();
    await expect(timeline).toContainText('P0302', { timeout: 30_000 });

    const evidenceForm = timeline.locator('form').filter({ hasText: 'Timeline evidence' });
    await evidenceForm.locator('select[name="kind"]').selectOption('measurement');
    await evidenceForm.locator('input[name="title"]').fill('Cylinder 2 compression');
    await evidenceForm.locator('input[name="valueNumeric"]').fill('165');
    await evidenceForm.locator('input[name="unit"]').fill('psi');
    await evidenceForm.locator('input[name="outcome"]').fill('Within the manufacturer comparison range');
    await evidenceForm.getByRole('button', { name: 'Add evidence' }).click();
    await expect(timeline).toContainText('Cylinder 2 compression', { timeout: 30_000 });

    await timeline.getByRole('link', { name: 'Open Torque Assist for this diagnostic', exact: true }).click();
    await expect(page).toHaveURL(`https://torqueshed.operatoros.net/diagnostics/${diagnostic.id}/assist`);
    const assist = page.getByTestId('torqueshed-torque-assist');
    await expect(assist).toContainText('Preview analysis mode is active', { timeout: 30_000 });
    await page.goto(`https://torqueshed.operatoros.net/billing/credits?diagnostic=${diagnostic.id}`);
    const creditPurchase = page.getByTestId('torqueshed-credits-route');
    await expect(creditPurchase).toBeVisible({ timeout: 30_000 });
    const purchaseResponse = page.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/modules/torqueshed/token-purchases/checkout');
    await creditPurchase.getByRole('button', { name: /Roadside.*25,000 units/ }).click();
    const purchaseReply = await purchaseResponse;
    expect(purchaseReply.status(), await purchaseReply.text()).toBe(201);
    const purchaseBody = await purchaseReply.json() as {
      purchase: {
        id: string; tenantId: string; userId: string; moduleId: string; packageKey: string;
        units: number; amountMinor: number; currency: string; providerCheckoutId: string;
        diagnosticSessionId: string; catalogVersion: string; providerMode: 'test' | 'live';
        stripeAccountId: string; providerProductId: string; providerPriceId: string;
      };
    };
    const purchase = purchaseBody.purchase;
    const eventId = `evt_torqueshed_browser_${suffix}`;
    const payment = await browserJson<Record<string, unknown>>(
      page,
      '/api/billing/webhook',
      'POST',
      {
        id: eventId,
        type: 'checkout.session.completed',
        livemode: false,
        data: {
          object: {
            id: purchase.providerCheckoutId,
            payment_intent: `pi_torqueshed_browser_${suffix}`,
            payment_status: 'paid',
            amount_total: purchase.amountMinor,
            currency: purchase.currency.toLowerCase(),
            metadata: {
              operatoros_kind: 'torque_assist_credit',
              purchase_id: purchase.id,
              tenant_id: purchase.tenantId,
              user_id: purchase.userId,
              module_id: purchase.moduleId,
              package_key: purchase.packageKey,
              units: String(purchase.units),
              diagnostic_session_id: purchase.diagnosticSessionId,
              catalog_version: purchase.catalogVersion,
              environment: purchase.providerMode,
              module_slug: 'torqueshed',
              operatoros_source: 'server_authoritative_catalog',
              stripe_account_id: purchase.stripeAccountId,
              provider_product_id: purchase.providerProductId,
              provider_price_id: purchase.providerPriceId,
            },
            mode: 'payment',
            line_items: {
              data: [{ quantity: 1, price: {
                id: purchase.providerPriceId,
                product: { id: purchase.providerProductId },
              } }],
            },
          },
        },
      },
      { 'stripe-signature': 'operatoros-test-signature' },
    );
    expect(payment.status, JSON.stringify(payment.body)).toBe(200);

    const diagnosticUrl = `https://torqueshed.operatoros.net/diagnostics/${diagnostic.id}`;
    const purchaseStatusUrl = `https://torqueshed.operatoros.net/billing/credits?diagnostic=${diagnostic.id}&purchase=${purchase.id}`;
    await page.goto(purchaseStatusUrl);
    const credits = page.getByTestId('torqueshed-credits-route');
    await expect(credits.getByTestId('torque-purchase-status')).toContainText('Credits added', { timeout: 30_000 });
    await expect(credits).toContainText('25,000', { timeout: 30_000 });
    await page.goto(`${diagnosticUrl}/assist`);
    await expect(page.getByTestId('torqueshed-diagnostic-timeline')).toContainText(diagnosticTitle, { timeout: 30_000 });
    const refreshedAssist = page.getByTestId('torqueshed-torque-assist');
    const assistResponse = page.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/modules/torqueshed/torque-assist');
    await refreshedAssist.getByRole('button', { name: 'Generate diagnostic plan' }).click();
    const assistReply = await assistResponse;
    expect(assistReply.status(), await assistReply.text()).toBe(200);
    const assistBody = await assistReply.json() as { actualUnits: number; result: { disclaimer: string } };
    expect(assistBody.actualUnits).toBeGreaterThan(0);
    expect(assistBody.result.disclaimer).toContain('not a verified repair');
    await expect(refreshedAssist).toContainText('Accepted result recorded.');
    await expect(refreshedAssist).toContainText('Recommended tests');

    const ledger = await browserJson<{
      balance: number;
      entries: Array<{ entryKind: string; purchaseIntentId?: string; diagnosticSessionId?: string }>;
    }>(page, '/api/modules/torqueshed/token-ledger');
    expect(ledger.status, JSON.stringify(ledger.body)).toBe(200);
    expect(ledger.body.entries.filter(entry => entry.entryKind === 'credit' && entry.purchaseIntentId === purchase.id)).toHaveLength(1);
    expect(ledger.body.entries.filter(entry => entry.entryKind === 'debit' && entry.diagnosticSessionId === diagnostic.id)).toHaveLength(1);
    expect(ledger.body.balance).toBeGreaterThan(0);

    await page.goto('https://torqueshed.operatoros.net/marketplace');
    const marketplace = page.getByTestId('torqueshed-marketplace');
    await expect(marketplace).toBeVisible({ timeout: 30_000 });
    const listingForm = marketplace.locator('form').filter({ hasText: 'Create a draft listing' });
    await listingForm.getByLabel('Title').fill(listingTitle);
    await listingForm.getByLabel('Category').selectOption('tools');
    await listingForm.getByLabel('Price (USD)').fill('49.00');
    await listingForm.getByLabel('Locality (no street address)').fill('Raleigh');
    await listingForm.getByLabel('State / region').fill('NC');
    await listingForm.getByLabel('Description').fill('Working automotive diagnostic scope with leads and a verified self-test.');
    const listingResponse = page.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/modules/torqueshed/marketplace/listings');
    await listingForm.getByRole('button', { name: 'Create draft' }).click();
    const listingReply = await listingResponse;
    expect(listingReply.status(), await listingReply.text()).toBe(201);
    const listing = await listingReply.json() as { id: string };
    await marketplace.getByRole('button', { name: 'My listings' }).click();
    const listingCard = marketplace.locator(`article[data-record-id="${listing.id}"]`);
    await expect(listingCard).toContainText(listingTitle);
    const listingPublish = page.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/modules/torqueshed/marketplace/listings/${listing.id}/publish`);
    await listingCard.getByRole('button', { name: 'Publish' }).click();
    expect((await listingPublish).status()).toBe(200);
    await expect(listingCard).toContainText('published');

    await page.goto('https://torqueshed.operatoros.net/community');
    const community = page.getByTestId('torqueshed-community');
    await expect(community).toBeVisible({ timeout: 30_000 });
    const postForm = community.locator('form').filter({ hasText: 'Create a draft post' });
    await postForm.getByLabel('Title').fill(postTitle);
    await postForm.getByLabel('Topic').selectOption('diagnostics');
    await postForm.getByLabel('Tags (comma separated)').fill('acceptance,diagnostics');
    await postForm.getByLabel('Post').fill('Evidence supports a repeatable test plan; no repair is authorized without verification.');
    const postResponse = page.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/modules/torqueshed/community/posts');
    await postForm.getByRole('button', { name: 'Create draft' }).click();
    const postReply = await postResponse;
    expect(postReply.status(), await postReply.text()).toBe(201);
    const post = await postReply.json() as { id: string };
    await community.getByRole('button', { name: 'My posts' }).click();
    const postCard = community.locator(`article[data-record-id="${post.id}"]`);
    await expect(postCard).toContainText(postTitle);
    const postPublish = page.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/modules/torqueshed/community/posts/${post.id}/publish`);
    await postCard.getByRole('button', { name: 'Publish' }).click();
    expect((await postPublish).status()).toBe(200);
    await postCard.getByRole('button', { name: 'Open discussion' }).click();
    const discussion = page.getByTestId('torqueshed-community-discussion');
    await expect(discussion).toHaveAttribute('data-record-id', post.id);
    const reactionResponse = page.waitForResponse(response =>
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname === `/api/modules/torqueshed/community/posts/${post.id}/reaction`);
    await discussion.getByRole('button', { name: 'helpful', exact: true }).click();
    expect((await reactionResponse).status()).toBe(200);
    const commentResponse = page.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/modules/torqueshed/community/posts/${post.id}/comments`);
    await discussion.getByLabel('Add comment').fill(commentBody);
    await discussion.getByRole('button', { name: 'Comment' }).click();
    expect((await commentResponse).status()).toBe(201);
    await expect(discussion).toContainText(commentBody);

    const persisted = await pg.query<{
      vehicles: string; diagnostics: string; codes: string; entries: string; assists: string;
      credits: string; debits: string; listings: string; posts: string; comments: string; reactions: string;
    }>(
      `select
        (select count(*) from torqueshed_vehicles where tenant_id=$1 and id=$2 and vin_sha256 is not null and vin_last6='A12345')::text as vehicles,
        (select count(*) from torqueshed_diagnostic_sessions where tenant_id=$1 and id=$3)::text as diagnostics,
        (select count(*) from torqueshed_diagnostic_trouble_codes where tenant_id=$1 and diagnostic_session_id=$3 and code='P0302')::text as codes,
        (select count(*) from torqueshed_diagnostic_entries where tenant_id=$1 and diagnostic_session_id=$3 and kind='measurement')::text as entries,
        (select count(*) from torqueshed_assist_requests where tenant_id=$1 and diagnostic_session_id=$3 and status='complete')::text as assists,
        (select count(*) from torqueshed_token_ledger_entries where tenant_id=$1 and purchase_intent_id=$4 and entry_kind='credit')::text as credits,
        (select count(*) from torqueshed_token_ledger_entries where tenant_id=$1 and diagnostic_session_id=$3 and entry_kind='debit')::text as debits,
        (select count(*) from torqueshed_marketplace_listings where tenant_id=$1 and id=$5 and status='published' and price_minor=4900)::text as listings,
        (select count(*) from torqueshed_community_posts where tenant_id=$1 and id=$6 and status='published')::text as posts,
        (select count(*) from torqueshed_community_comments where tenant_id=$1 and post_id=$6 and body=$7)::text as comments,
        (select count(*) from torqueshed_community_post_reactions where tenant_id=$1 and post_id=$6 and reaction='helpful')::text as reactions`,
      [identity.tenantId, vehicle.id, diagnostic.id, purchase.id, listing.id, post.id, commentBody],
    );
    for (const [name, count] of Object.entries(persisted.rows[0])) {
      expect(Number(count), `${name} must persist exactly once`).toBe(1);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByTestId('torqueshed-community')).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await capturePhase20Evidence(page, 'torqueshed-completed', { width: 390, height: 844 });

    const logoutAll = await browserJson(page, '/api/auth/logout-all', 'POST', {});
    expect(logoutAll.status, JSON.stringify(logoutAll.body)).toBe(200);
    await page.goto(diagnosticUrl);
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(diagnosticUrl, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    await expect(page.getByTestId('torqueshed-diagnostic-timeline')).toContainText(diagnosticTitle, { timeout: 30_000 });
    await expect(page.getByTestId('torqueshed-diagnostic-timeline')).toContainText('P0302');
    await expect(page.getByTestId('torqueshed-diagnostic-timeline')).toContainText('Cylinder 2 compression');
    await assertNoBrowserCredentialStorage(page);
    assertNoCredentialQuery(page.url());

    await Promise.all([
      page.waitForURL(/^https:\/\/app\.operatoros\.net\//, { timeout: 30_000 }),
      page.getByRole('link', { name: 'My Apps' }).first().click(),
    ]);
    await expect(page.getByTestId('page-my-apps')).toBeVisible();
    await page.getByTestId('button-launch-torqueshed').click();
    const reopened = page;
    await expect(reopened.getByTestId('torqueshed-module-shell')).toBeVisible({ timeout: 30_000 });
    await reopened.goto('https://torqueshed.operatoros.net/marketplace');
    await expect(reopened.getByTestId('torqueshed-marketplace')).toBeVisible({ timeout: 30_000 });
    await reopened.getByTestId('torqueshed-marketplace').getByRole('button', { name: 'My listings' }).click();
    await expect(reopened.locator(`article[data-record-id="${listing.id}"]`)).toContainText(listingTitle);
    await reopened.goto('https://torqueshed.operatoros.net/logout');
    await expect(reopened).toHaveURL(/^https:\/\/operatoros\.net\/signed-out\?signed_out=local$/);
    expect((await sessionCookies(context)).some(cookie => cookie.domain === 'torqueshed.operatoros.net')).toBe(false);
  });

  test('TorqueShed canonical payment return shows exactly-once authoritative credits', async ({ page, request }) => {
    test.setTimeout(120_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);
    const suffix = Date.now().toString(36);

    await page.goto('https://torqueshed.operatoros.net/diagnostics');
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/torqueshed\.operatoros\.net\/diagnostics(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);

    const vehicleReply = await browserJson<{ id: string }>(
      page,
      '/api/modules/torqueshed/vehicles',
      'POST',
      {
        nickname: `Payment proof vehicle ${suffix}`,
        year: 2018,
        make: 'Ford',
        model: 'F-150',
        engine: '3.5L EcoBoost',
        visibility: 'private',
      },
    );
    expect(vehicleReply.status, JSON.stringify(vehicleReply.body)).toBe(201);
    const diagnosticReply = await browserJson<{ id: string }>(
      page,
      '/api/modules/torqueshed/diagnostics',
      'POST',
      {
        vehicleId: vehicleReply.body.id,
        title: `Canonical payment proof ${suffix}`,
        customerConcern: 'Payment acceptance path only; no repair conclusion.',
        symptoms: 'Deterministic exact-host fixture.',
        visibility: 'private',
      },
    );
    expect(diagnosticReply.status, JSON.stringify(diagnosticReply.body)).toBe(201);
    const checkoutReply = await browserJson<{
      purchase: {
        id: string; tenantId: string; userId: string; moduleId: string; packageKey: string;
        units: number; amountMinor: number; currency: string; providerCheckoutId: string;
        diagnosticSessionId: string; catalogVersion: string; providerMode: 'test' | 'live';
        stripeAccountId: string; providerProductId: string; providerPriceId: string;
      };
    }>(
      page,
      '/api/modules/torqueshed/token-purchases/checkout',
      'POST',
      { diagnosticSessionId: diagnosticReply.body.id, packageKey: 'roadside-25000' },
      { 'Idempotency-Key': `exact-host-payment-${suffix}` },
    );
    expect(checkoutReply.status, JSON.stringify(checkoutReply.body)).toBe(201);
    const purchase = checkoutReply.body.purchase;
    const purchaseStatusUrl = `https://torqueshed.operatoros.net/billing/credits?diagnostic=${diagnosticReply.body.id}&purchase=${purchase.id}`;
    await page.goto(purchaseStatusUrl);
    const credits = page.getByTestId('torqueshed-credits-route');
    await expect(credits).toBeVisible({ timeout: 30_000 });
    await expect(credits.getByRole('status')).toContainText('Verifying payment', { timeout: 30_000 });
    if (process.env.PHASE43_CAPTURE_SCREENSHOTS === '1') {
      const screenshotDirectory = resolve(repoRoot, 'docs/phase-43/screenshots');
      mkdirSync(screenshotDirectory, { recursive: true });
      await credits.getByRole('status').screenshot({ path: resolve(screenshotDirectory, 'settlement-verifying.png') });
    }
    const event = {
      id: `evt_exact_host_payment_${suffix}`,
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          id: purchase.providerCheckoutId,
          payment_intent: `pi_exact_host_payment_${suffix}`,
          payment_status: 'paid',
          status: 'complete',
          amount_total: purchase.amountMinor,
          currency: purchase.currency.toLowerCase(),
          metadata: {
            operatoros_kind: 'torque_assist_credit',
            purchase_id: purchase.id,
            tenant_id: purchase.tenantId,
            user_id: purchase.userId,
            module_id: purchase.moduleId,
            package_key: purchase.packageKey,
            units: String(purchase.units),
            diagnostic_session_id: purchase.diagnosticSessionId,
            catalog_version: purchase.catalogVersion,
            environment: purchase.providerMode,
            module_slug: 'torqueshed',
            operatoros_source: 'server_authoritative_catalog',
            stripe_account_id: purchase.stripeAccountId,
            provider_product_id: purchase.providerProductId,
            provider_price_id: purchase.providerPriceId,
          },
          mode: 'payment',
          line_items: {
            data: [{ quantity: 1, price: {
              id: purchase.providerPriceId,
              product: { id: purchase.providerProductId },
            } }],
          },
        },
      },
    };
    const credited = await browserJson<Record<string, unknown>>(
      page,
      '/api/billing/webhook',
      'POST',
      event,
      { 'stripe-signature': 'operatoros-test-signature' },
    );
    expect(credited.status, JSON.stringify(credited.body)).toBe(200);
    await credits.getByRole('button', { name: 'Refresh status' }).click();
    await expect(credits.getByTestId('torque-purchase-status')).toContainText('Credits added', { timeout: 30_000 });
    await expect(credits).toContainText('25,000');
    if (process.env.PHASE43_CAPTURE_SCREENSHOTS === '1') {
      await credits.getByTestId('torque-purchase-status').screenshot({ path: resolve(repoRoot, 'docs/phase-43/screenshots/settlement-credited.png') });
    }
    if (process.env.PHASE45_CAPTURE_SCREENSHOTS === '1') {
      const screenshotDirectory = resolve(repoRoot, 'docs/phase-45/screenshots');
      mkdirSync(screenshotDirectory, { recursive: true });
      await credits.screenshot({ path: resolve(screenshotDirectory, 'torque-assist-credit-availability.png') });
    }
    const replay = await browserJson<{ duplicate?: boolean }>(
      page,
      '/api/billing/webhook',
      'POST',
      event,
      { 'stripe-signature': 'operatoros-test-signature' },
    );
    expect(replay.status, JSON.stringify(replay.body)).toBe(200);
    expect(replay.body.duplicate).toBe(true);
    const ledger = await browserJson<{
      balance: number;
      entries: Array<{ entryKind: string; purchaseIntentId?: string }>;
    }>(page, '/api/modules/torqueshed/token-ledger');
    expect(ledger.status, JSON.stringify(ledger.body)).toBe(200);
    expect(ledger.body.balance).toBe(25_000);
    expect(ledger.body.entries.filter(entry =>
      entry.entryKind === 'credit' && entry.purchaseIntentId === purchase.id,
    )).toHaveLength(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByTestId('torqueshed-credits-route').getByTestId('torque-purchase-status'))
      .toContainText('Credits added', { timeout: 30_000 });
    if (process.env.PHASE45_CAPTURE_SCREENSHOTS === '1') {
      await page.getByTestId('torqueshed-credits-route').screenshot({
        path: resolve(repoRoot, 'docs/phase-45/screenshots/torque-assist-mobile-availability.png'),
      });
    }
    const overflow = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      elements: Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .map(element => {
          const bounds = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            testId: element.dataset.testid ?? null,
            className: typeof element.className === 'string' ? element.className : '',
            left: Math.round(bounds.left),
            right: Math.round(bounds.right),
            width: Math.round(bounds.width),
            text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
          };
        })
        // A closed mobile drawer is intentionally translated off the left
        // edge and does not expand the document. Only right-edge expansion
        // can create user-visible horizontal scrolling.
        .filter(element => element.right > window.innerWidth + 1)
        .slice(0, 20),
    }));
    expect(overflow.documentWidth, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(overflow.viewportWidth);
    expect(overflow.elements, JSON.stringify(overflow, null, 2)).toEqual([]);
  });

  test('tenant denial and the global OutCall activation lock fail closed without issuing a handoff', async ({ page, request }) => {
    test.setTimeout(90_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);

    const deniedModules = await pg.query<{ id: string; slug: string }>(
      `select id, slug from modules where slug in ('techdeck', 'outcall') order by slug`,
    );
    expect(deniedModules.rows).toHaveLength(2);
    await pg.query(
      `update tenant_modules
          set status = 'disabled', updated_at = now()
        where tenant_id = $1 and module_id = any($2::text[])`,
      [identity.tenantId, deniedModules.rows.map(module => module.id)],
    );

    await page.goto(`${ROOT}/app`);
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);

    const denied = await page.evaluate(async (tenantId) => {
      const issue = async (moduleId: string) => {
        const response = await fetch('/api/sso/issue', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            moduleId,
            tenantId,
            clientId: `operatoros:${moduleId}`,
            redirectUri: `https://${moduleId}.operatoros.net/sso`,
            returnTo: '/',
            state: 's'.repeat(43),
            nonce: 'n'.repeat(43),
            codeChallenge: 'c'.repeat(43),
            codeChallengeMethod: 'S256',
          }),
        });
        return { status: response.status, body: await response.json() };
      };
      return {
        tenant: await issue('techdeck'),
        outcall: await issue('outcall'),
      };
    }, identity.tenantId);

    expect(denied.tenant.status).toBe(403);
    expect(denied.tenant.body.code).toBe('MODULE_ACCESS_DENIED');
    expect(denied.tenant.body.launchUrl).toBeUndefined();
    expect(denied.tenant.body.code).not.toMatch(/TOKEN|CREDENTIAL/);

    expect(denied.outcall.status).toBe(403);
    expect(denied.outcall.body.code).toBe('MODULE_UNAVAILABLE');
    expect(denied.outcall.body.launchUrl).toBeUndefined();
    expect(denied.outcall.body.code).not.toMatch(/TOKEN|CREDENTIAL/);

    await page.goto('https://app.operatoros.net/app/apps/techdeck');
    await expect(page.getByTestId('app-shell-not-accessible')).toBeVisible({ timeout: 30_000 });
    await capturePhase20Evidence(page, 'entitlement-denial', { width: 768, height: 1024 });
    assertNoCredentialQuery(page.url());
    await assertNoBrowserCredentialStorage(page);
  });

  test('FaultlineLab persists a server-scored investigation across return, global logout, reauthentication, and deep-link refresh', async ({ page, request }) => {
    test.setTimeout(150_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);

    await page.goto(`${ROOT}/app`);
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    await page.getByTestId('nav-my-apps').click();
    await expect(page.getByTestId('page-my-apps')).toBeVisible();

    await page.getByTestId('button-launch-faultlinelab').click();
    const modulePage = page;
    await expect(modulePage.getByTestId('faultlinelab-module-shell')).toBeVisible({ timeout: 30_000 });
    await modulePage.getByRole('link', { name: 'Browse challenges', exact: true }).click();
    await expect(modulePage).toHaveURL('https://faultlinelab.operatoros.net/challenges');
    await expect(modulePage.getByTestId('faultlinelab-challenge-card').first()).toBeVisible();

    await modulePage.getByTestId('faultlinelab-challenge-card').first().getByRole('button', { name: 'Start' }).click();
    await expect(modulePage.getByTestId('faultlinelab-session')).toBeVisible();
    await expect(modulePage).toHaveURL(/^https:\/\/faultlinelab\.operatoros\.net\/sessions\/[a-f0-9-]+$/);
    const sessionUrl = modulePage.url();
    assertNoCredentialQuery(sessionUrl);

    const terminal = modulePage.locator('article').filter({ has: modulePage.getByRole('heading', { name: 'Terminal' }) });
    await terminal.locator('.fl-chip-row button').first().click();
    await expect(modulePage.getByText(/^#1 command \/ /)).toBeVisible();

    const submission = modulePage.locator('form').filter({ has: modulePage.getByRole('heading', { name: 'Submit diagnosis' }) });
    await submission.locator('textarea[name="hypothesis"]').fill('The recorded evidence identifies the canonical failure mechanism.');
    await submission.locator('select[name="rootCause"]').selectOption({ index: 1 });
    const evidenceCount = await submission.locator('input[name="evidence"]').count();
    for (let index = 0; index < evidenceCount; index += 1) {
      await submission.locator('input[name="evidence"]').nth(index).check();
    }
    await submission.locator('textarea[name="remediation"]').fill('Apply the validated corrective action and verify the original symptom no longer reproduces.');
    await submission.locator('textarea[name="proofNote"]').fill('Phase 10A production-host browser acceptance.');
    await submission.getByRole('button', { name: 'Submit for scoring' }).click();
    const score = modulePage.getByTestId('faultlinelab-server-score');
    await expect(score).toBeVisible();
    const scoreValue = (await score.locator('h2').innerText()).trim();
    const scoreSummary = (await score.locator('strong').innerText()).trim();

    await modulePage.reload();
    await expect(modulePage).toHaveURL(sessionUrl);
    await expect(modulePage.getByTestId('faultlinelab-server-score').locator('h2')).toHaveText(scoreValue);
    await expect(modulePage.getByTestId('faultlinelab-server-score').locator('strong')).toHaveText(scoreSummary);

    await Promise.all([
      modulePage.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      modulePage.getByRole('link', { name: 'My Apps' }).first().click(),
    ]);
    await expect(modulePage.getByTestId('page-my-apps')).toBeVisible();

    const logoutAll = await modulePage.evaluate(async () => {
      const response = await fetch('/api/auth/logout-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: response.status, body: await response.text() };
    });
    expect(logoutAll.status, logoutAll.body).toBe(200);

    await modulePage.goto(sessionUrl);
    await expect(modulePage).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await modulePage.getByTestId('input-email').fill(identity.email);
    await modulePage.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      modulePage.waitForURL(new RegExp(`^${sessionUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), { timeout: 30_000 }),
      modulePage.getByTestId('button-login').click(),
    ]);
    await expect(modulePage.getByTestId('faultlinelab-server-score').locator('h2')).toHaveText(scoreValue);
    await expect(modulePage.getByTestId('faultlinelab-server-score').locator('strong')).toHaveText(scoreSummary);
    await modulePage.reload();
    await expect(modulePage.getByTestId('faultlinelab-server-score').locator('h2')).toHaveText(scoreValue);
    await expect(modulePage.getByTestId('faultlinelab-server-score').locator('strong')).toHaveText(scoreSummary);
    await capturePhase20Evidence(modulePage, 'faultlinelab-completed', { width: 768, height: 1024 });
    await assertHostOnlySession(modulePage.context(), 'faultlinelab.operatoros.net');
    await assertNoBrowserCredentialStorage(modulePage);
    assertNoCredentialQuery(modulePage.url());
  });

  test('BrandForgeOS persists a full creative workflow, meters AI once, and survives return, deep-link refresh, and global reauthentication', async ({ page, request }) => {
    test.setTimeout(180_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);
    const suffix = Date.now().toString(36);
    const brandName = `Phase 11A Brand ${suffix}`;
    const personaName = `Phase 11A Operator ${suffix}`;
    const campaignName = `Phase 11A Campaign ${suffix}`;
    const copyTitle = `Phase 11A Copy ${suffix}`;
    const calendarTitle = `Phase 11A Publish ${suffix}`;

    await page.goto(`${ROOT}/app`);
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    await page.getByTestId('nav-my-apps').click();
    await expect(page.getByTestId('page-my-apps')).toBeVisible();

    await page.getByTestId('button-launch-brandforgeos').click();
    const modulePage = page;
    await expect(modulePage.getByTestId('brandforgeos-workspace')).toBeVisible({ timeout: 30_000 });
    await expect(modulePage.locator('#brandforgeos-dashboard')).toBeVisible();
    expect(await modulePage.getByTestId('brandforgeos-workspace').getAttribute('data-evidence')).toBe('persisted_records_only');
    assertNoCredentialQuery(modulePage.url());

    await modulePage.getByRole('link', { name: 'Brands', exact: true }).click();
    await expect(modulePage).toHaveURL('https://brandforgeos.operatoros.net/brands');
    await modulePage.getByLabel('Brand name').fill(brandName);
    await modulePage.getByLabel('Voice and tone').fill('Direct, technical, and evidence-led');
    await modulePage.getByLabel('Description').fill('A persisted Phase 11A browser acceptance brand.');
    await Promise.all([
      modulePage.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/modules/brandforgeos/brands'
        && response.status() === 201),
      modulePage.getByRole('button', { name: 'Create brand system' }).click(),
    ]);
    await expect(modulePage.getByRole('heading', { name: brandName })).toBeVisible();

    await modulePage.getByRole('link', { name: 'Personas', exact: true }).click();
    await modulePage.getByLabel('Persona name').fill(personaName);
    await modulePage.getByLabel('Pain points').fill('Fragmented creative operations');
    await modulePage.getByLabel('Goals').fill('Ship measurable campaigns');
    await modulePage.getByRole('button', { name: 'Create persona' }).click();
    await expect(modulePage.getByRole('heading', { name: personaName })).toBeVisible();

    await modulePage.getByRole('link', { name: 'Campaigns', exact: true }).click();
    await modulePage.getByLabel('Campaign name').fill(campaignName);
    await modulePage.getByLabel('Objective').fill('Prove the durable OperatorOS creative workflow');
    await modulePage.getByLabel('Brand kit').selectOption({ label: brandName });
    await modulePage.getByLabel('Persona').selectOption({ label: personaName });
    await modulePage.getByRole('button', { name: 'Create campaign' }).click();
    await expect(modulePage.getByRole('heading', { name: campaignName, exact: true })).toBeVisible();
    await modulePage.getByRole('button', { name: 'Move to planning' }).click();
    await expect(modulePage.getByText('planning', { exact: true })).toBeVisible();

    await modulePage.getByRole('link', { name: 'Content & assets', exact: true }).click();
    await expect(modulePage).toHaveURL('https://brandforgeos.operatoros.net/content');
    const copyPanel = modulePage.locator('#brandforgeos-copy');
    await expect(copyPanel).toBeVisible();
    await copyPanel.getByLabel('Title', { exact: true }).fill(copyTitle);
    await copyPanel.getByLabel('Copy content').fill('This copy asset is persisted and linked to the accepted campaign.');
    await copyPanel.getByLabel('Campaign').selectOption({ label: campaignName });
    await copyPanel.getByLabel('Brand kit').selectOption({ label: brandName });
    await copyPanel.getByRole('button', { name: 'Save copy asset' }).click();
    await expect(modulePage.getByRole('heading', { name: copyTitle })).toBeVisible();

    await modulePage.getByRole('link', { name: 'Calendar', exact: true }).click();
    await modulePage.getByLabel('Deliverable title').fill(calendarTitle);
    await modulePage.getByLabel('Scheduled time').fill('2026-08-20T14:00');
    await modulePage.getByLabel('Campaign').selectOption({ label: campaignName });
    await modulePage.getByLabel('Copy asset').selectOption({ label: copyTitle });
    await modulePage.getByRole('button', { name: 'Schedule content' }).click();
    await expect(modulePage.getByText(calendarTitle, { exact: true })).toBeVisible();

    await modulePage.getByRole('link', { name: 'Analytics', exact: true }).click();
    await expect(modulePage).toHaveURL('https://brandforgeos.operatoros.net/analytics');
    const analyticsPanel = modulePage.locator('#brandforgeos-analytics');
    await expect(analyticsPanel).toBeVisible();
    await analyticsPanel.getByLabel('Campaign').selectOption({ label: campaignName });
    await analyticsPanel.getByLabel('Impressions').fill('100');
    await analyticsPanel.getByLabel('Clicks').fill('20');
    await analyticsPanel.getByLabel('Conversions').fill('4');
    await Promise.all([
      modulePage.waitForResponse(response => response.request().method() === 'POST'
        && /\/api\/modules\/brandforgeos\/campaigns\/[^/]+\/metrics$/.test(new URL(response.url()).pathname)
        && response.status() === 201),
      analyticsPanel.getByRole('button', { name: 'Record metrics' }).click(),
    ]);
    await expect(analyticsPanel.getByText('100', { exact: true })).toBeVisible();
    await expect(modulePage.getByRole('link', { name: 'Download real CSV export' })).toHaveAttribute('href', '/api/modules/brandforgeos/export?format=csv');

    await modulePage.getByRole('link', { name: 'AI workflows', exact: true }).click();
    await modulePage.getByLabel('Workflow').selectOption('copy');
    await modulePage.getByLabel('Brief').fill('Write a concise launch message for technical operators who value persistent evidence.');
    await modulePage.getByLabel('Brand kit').selectOption({ label: brandName });
    await modulePage.getByLabel('Campaign').selectOption({ label: campaignName });
    await Promise.all([
      modulePage.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/modules/brandforgeos/generations'
        && response.status() === 201),
      modulePage.getByRole('button', { name: 'Generate material' }).click(),
    ]);
    await expect(modulePage.getByText(/test · [1-9]\d* tokens/)).toBeVisible();

    const usage = await pg.query<{ events: string; units: string }>(
      `select count(*)::text as events, coalesce(sum(units),0)::text as units
         from shared_usage_events sue
         join modules m on m.id=sue.module_id
        where sue.tenant_id=$1 and m.slug='brandforgeos'
          and sue.operation='brandforge.generation'`,
      [identity.tenantId],
    );
    expect(Number(usage.rows[0].events)).toBe(1);
    expect(Number(usage.rows[0].units)).toBeGreaterThan(0);

    await modulePage.reload();
    await expect(modulePage).toHaveURL('https://brandforgeos.operatoros.net/ai-workflows');
    await expect(modulePage.getByText(/test · [1-9]\d* tokens/)).toBeVisible();
    await modulePage.setViewportSize({ width: 390, height: 844 });
    await expect(modulePage.getByRole('button', { name: 'Open BrandForgeOS navigation', exact: true })).toBeVisible();

    await Promise.all([
      modulePage.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      modulePage.getByRole('link', { name: 'My Apps' }).first().click(),
    ]);
    await expect(modulePage.getByTestId('page-my-apps')).toBeVisible();
    const logoutAll = await modulePage.evaluate(async () => {
      const response = await fetch('/api/auth/logout-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: response.status, body: await response.text() };
    });
    expect(logoutAll.status, logoutAll.body).toBe(200);

    const campaignUrl = 'https://brandforgeos.operatoros.net/campaigns';
    await modulePage.goto(campaignUrl);
    await expect(modulePage).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await modulePage.getByTestId('input-email').fill(identity.email);
    await modulePage.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      modulePage.waitForURL(campaignUrl, { timeout: 30_000 }),
      modulePage.getByTestId('button-login').click(),
    ]);
    await expect(modulePage.getByRole('heading', { name: campaignName, exact: true })).toBeVisible();
    await modulePage.reload();
    await expect(modulePage.getByRole('heading', { name: campaignName, exact: true })).toBeVisible();
    await capturePhase20Evidence(modulePage, 'brandforgeos-completed', { width: 1440, height: 1000 });
    await assertHostOnlySession(modulePage.context(), 'brandforgeos.operatoros.net');
    await assertNoBrowserCredentialStorage(modulePage);
    assertNoCredentialQuery(modulePage.url());
  });

  test('StudyForge AI persists source-grounded reviewed learning workflows, meters AI, and survives deep-link reauthentication', async ({ page, request }) => {
    test.setTimeout(210_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);
    const suffix = Date.now().toString(36);
    const subjectName = `Phase 11C Networks ${suffix}`;
    const sourceTitle = `Phase 11C DNS source ${suffix}`;
    const documentTitle = `Phase 11C private document ${suffix}`;
    const deckTitle = `Phase 11C DNS deck ${suffix}`;
    const quizTitle = `Phase 11C DNS quiz ${suffix}`;
    const planTitle = `Phase 11C DNS plan ${suffix}`;

    await page.goto(`${ROOT}/app`);
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    await page.getByTestId('nav-my-apps').click();
    await expect(page.getByTestId('page-my-apps')).toBeVisible();

    await page.getByTestId('button-launch-studyforge-ai').click();
    const modulePage = page;
    const workspace = modulePage.getByTestId('shell-studyforge-ai');
    await expect(workspace).toBeVisible({ timeout: 30_000 });
    await expect(modulePage.locator('#studyforge-dashboard')).toBeVisible();
    expect(await workspace.getAttribute('data-evidence')).toBe('persisted_records_only');
    assertNoCredentialQuery(modulePage.url());

    await modulePage.getByRole('link', { name: 'Sources & notes', exact: true }).click();
    await expect(modulePage).toHaveURL('https://studyforge-ai.operatoros.net/sources');
    await modulePage.getByTestId('input-studyforge-subject-name').fill(subjectName);
    await modulePage.getByLabel('Course code').fill('NET-201');
    await modulePage.getByTestId('button-studyforge-subject-create').click();
    await expect(modulePage.locator('#studyforge-subjects').getByText(subjectName, { exact: true })).toBeVisible();

    await modulePage.getByTestId('input-studyforge-source-title').fill(sourceTitle);
    await modulePage.getByTestId('textarea-studyforge-source-body').fill(
      'Domain Name System resolvers translate host names into IP addresses. Recursive resolvers cache successful answers according to the record time to live.',
    );
    await modulePage.getByTestId('button-studyforge-source-create').click();
    await expect(modulePage.locator('#studyforge-sources').getByText(sourceTitle, { exact: true })).toBeVisible();
    await modulePage.getByTestId('input-studyforge-source-title').fill(documentTitle);
    await modulePage.locator('input[type="file"]').setInputFiles({
      name: 'phase-11c-private-source.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Private tenant-authorized DNS training document for Phase 11C.'),
    });
    const uploadResponse = modulePage.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/modules/studyforge-ai/sources/document'
      && response.status() === 202);
    await modulePage.getByRole('button', { name: 'Upload phase-11c-private-source.txt' }).click();
    await uploadResponse;
    await expect(modulePage.locator('#studyforge-sources').getByText(documentTitle, { exact: true })).toBeVisible();

    const generate = async (type: 'deck' | 'quiz' | 'study_plan', title: string) => {
      await modulePage.getByRole('link', { name: 'AI Studio', exact: true }).click();
      await modulePage.getByTestId('select-studyforge-generation-source').selectOption({ label: sourceTitle });
      await modulePage.getByTestId('select-studyforge-generation-type').selectOption(type);
      await modulePage.getByTestId('input-studyforge-generation-title').fill(title);
      const responsePromise = modulePage.waitForResponse(response =>
        response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/modules/studyforge-ai/generations'
        && response.status() === 201);
      await modulePage.getByTestId('button-studyforge-generation-create').click();
      return (await responsePromise).json() as Promise<{ entity: { id: string } }>;
    };

    const deck = await generate('deck', deckTitle);
    await modulePage.getByRole('link', { name: 'Flashcards', exact: true }).click();
    const deckArticle = modulePage.locator('article').filter({ has: modulePage.getByRole('heading', { name: deckTitle }) });
    await expect(deckArticle).toBeVisible();
    await deckArticle.getByRole('button', { name: 'Edit card' }).first().click();
    await deckArticle.getByLabel('Card question').fill('What does a DNS resolver translate?');
    await deckArticle.getByLabel('Card answer').fill('Host names into IP addresses.');
    await deckArticle.getByRole('button', { name: 'Save card' }).click();
    await expect(deckArticle.getByText('What does a DNS resolver translate?', { exact: true })).toBeVisible();
    await deckArticle.getByRole('button', { name: 'Move to review' }).click();
    await deckArticle.getByRole('button', { name: 'Move to published' }).click();
    await deckArticle.getByRole('button', { name: 'good', exact: true }).first().click();

    const quiz = await generate('quiz', quizTitle);
    await modulePage.getByRole('link', { name: 'Quizzes', exact: true }).click();
    const quizArticle = modulePage.locator('article').filter({ has: modulePage.getByRole('heading', { name: quizTitle }) });
    await expect(quizArticle).toBeVisible();
    await quizArticle.getByRole('button', { name: 'Edit question' }).first().click();
    await quizArticle.getByLabel('Quiz question').fill('What information does DNS resolution return?');
    await quizArticle.getByRole('button', { name: 'Save question' }).click();
    await expect(quizArticle.getByText('What information does DNS resolution return?', { exact: true })).toBeVisible();
    await quizArticle.getByRole('button', { name: 'Move to review' }).click();
    await quizArticle.getByRole('button', { name: 'Move to published' }).click();
    const quizFields = quizArticle.locator('fieldset');
    await expect(quizFields).toHaveCount(2);
    for (let index = 0; index < await quizFields.count(); index += 1) {
      await quizFields.nth(index).locator('input[type="radio"]').first().check();
    }
    await quizArticle.getByRole('button', { name: 'Submit quiz' }).click();

    const plan = await generate('study_plan', planTitle);
    await modulePage.getByRole('link', { name: 'Sessions', exact: true }).click();
    const planArticle = modulePage.locator('article').filter({ has: modulePage.getByRole('heading', { name: planTitle }) });
    await expect(planArticle).toBeVisible();
    await planArticle.getByRole('button', { name: 'Edit session' }).first().click();
    await planArticle.getByLabel('Study session title').fill('Review DNS resolution');
    await planArticle.getByLabel('Study session minutes').fill('25');
    await planArticle.getByRole('button', { name: 'Save session' }).click();
    await expect(planArticle.getByText('Review DNS resolution', { exact: true })).toBeVisible();
    await planArticle.getByRole('button', { name: 'Move to review' }).click();
    await planArticle.getByRole('button', { name: 'Move to published' }).click();
    await planArticle.getByRole('button', { name: 'Complete' }).first().click();
    await expect(planArticle.getByRole('button', { name: 'Reopen' }).first()).toBeVisible();

    const persisted = await pg.query<{
      decks: string; attempts: string; completed_sessions: string; progress: string; document_sources: string;
    }>(
      `select
         (select count(*) from studyforge_decks where tenant_id=$1 and id=$2 and status='published')::text as decks,
         (select count(*) from studyforge_quiz_attempts where tenant_id=$1 and quiz_id=$3)::text as attempts,
         (select count(*) from studyforge_plan_sessions where tenant_id=$1 and plan_id=$4 and completed_at is not null)::text as completed_sessions,
         (select count(*) from studyforge_card_progress where tenant_id=$1)::text as progress,
         (select count(*) from studyforge_sources s join shared_attachments a
            on a.tenant_id=s.tenant_id and a.id=s.attachment_id
           where s.tenant_id=$1 and s.title=$5 and s.source_type='document')::text as document_sources`,
      [identity.tenantId, deck.entity.id, quiz.entity.id, plan.entity.id, documentTitle],
    );
    expect(Number(persisted.rows[0].decks)).toBe(1);
    expect(Number(persisted.rows[0].attempts)).toBe(1);
    expect(Number(persisted.rows[0].completed_sessions)).toBeGreaterThan(0);
    expect(Number(persisted.rows[0].progress)).toBeGreaterThan(0);
    expect(Number(persisted.rows[0].document_sources)).toBe(1);

    const usage = await pg.query<{ events: string; units: string }>(
      `select count(*)::text as events, coalesce(sum(units),0)::text as units
         from shared_usage_events sue join modules m on m.id=sue.module_id
        where sue.tenant_id=$1 and m.slug='studyforge-ai'
          and sue.operation='studyforge.ai_generation'`,
      [identity.tenantId],
    );
    expect(Number(usage.rows[0].events)).toBe(3);
    expect(Number(usage.rows[0].units)).toBe(3);

    const exportResult = await modulePage.evaluate(async () => {
      const response = await fetch('/api/modules/studyforge-ai/export?format=json', { credentials: 'include' });
      return { status: response.status, body: await response.json() };
    });
    expect(exportResult.status).toBe(200);
    expect((exportResult.body as any).decks.some((item: any) => item.id === deck.entity.id)).toBe(true);

    await modulePage.setViewportSize({ width: 390, height: 844 });
    await expect(modulePage.getByRole('button', { name: 'Open StudyForge AI navigation', exact: true })).toBeVisible();
    await Promise.all([
      modulePage.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      modulePage.getByRole('link', { name: 'My Apps' }).first().click(),
    ]);
    await expect(modulePage.getByTestId('page-my-apps')).toBeVisible();

    const logoutAll = await modulePage.evaluate(async () => {
      const response = await fetch('/api/auth/logout-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: response.status, body: await response.text() };
    });
    expect(logoutAll.status, logoutAll.body).toBe(200);

    const deckUrl = `https://studyforge-ai.operatoros.net/decks/${deck.entity.id}`;
    await modulePage.goto(deckUrl);
    await expect(modulePage).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await modulePage.getByTestId('input-email').fill(identity.email);
    await modulePage.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      modulePage.waitForURL(deckUrl, { timeout: 30_000 }),
      modulePage.getByTestId('button-login').click(),
    ]);
    await expect(modulePage.getByRole('heading', { name: deckTitle })).toBeVisible();
    await modulePage.reload();
    await expect(modulePage).toHaveURL(deckUrl);
    await expect(modulePage.getByRole('heading', { name: deckTitle })).toBeVisible();
    await capturePhase20Evidence(modulePage, 'studyforge-ai-completed', { width: 768, height: 1024 });
    await assertHostOnlySession(modulePage.context(), 'studyforge-ai.operatoros.net');
    await assertNoBrowserCredentialStorage(modulePage);
    assertNoCredentialQuery(modulePage.url());
  });

  test('Deploy Ops persists reviewed release execution, evidence readiness, exports, and deep-link reauthentication', async ({ page, request }) => {
    test.setTimeout(210_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);
    const suffix = Date.now().toString(36);
    const launchTitle = `Phase 11D operator launch ${suffix}`;

    await page.goto(`${ROOT}/app`);
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    await page.getByTestId('nav-my-apps').click();
    await expect(page.getByTestId('page-my-apps')).toBeVisible();

    await page.getByTestId('button-launch-ninja-launch-kit').click();
    const modulePage = page;
    await expect(modulePage.getByTestId('shell-ninja-launch-kit-complete')).toBeVisible({ timeout: 30_000 });
    await expect(modulePage.locator('#launchkit-dashboard')).toBeVisible();
    assertNoCredentialQuery(modulePage.url());

    await modulePage.getByRole('link', { name: 'Readiness', exact: true }).click();
    await expect(modulePage.getByTestId('input-launchkit-title')).toBeVisible();
    await modulePage.getByTestId('input-launchkit-title').fill(launchTitle);
    await modulePage.getByTestId('input-launchkit-product-type').fill('SaaS service');
    await modulePage.getByTestId('select-launchkit-template').selectOption('it-support-msp');
    await modulePage.getByTestId('input-launchkit-audience').fill('MSP owners');
    await modulePage.getByTestId('input-launchkit-problem').fill('Disconnected operational products');
    await modulePage.getByLabel('Positioning').fill('One coherent OperatorOS launch');
    await modulePage.getByTestId('input-launchkit-offer').fill('Operator platform launch package');
    await modulePage.getByLabel('Price').fill('149');
    await modulePage.getByLabel('Target date').fill('2026-09-01');
    const createResponse = modulePage.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/modules/ninja-launch-kit/launches'
      && response.status() === 201);
    await modulePage.getByTestId('button-launchkit-create').click();
    const created = await (await createResponse).json() as { launch: { id: string } };
    const launchId = created.launch.id;
    const launchUrl = `https://deployops.operatoros.net/launches/${launchId}`;
    await expect(modulePage.getByText(launchTitle, { exact: true }).first()).toBeVisible();
    await expect(modulePage.getByTestId('text-launchkit-readiness')).not.toHaveText('100%');

    const taskButtons = modulePage.locator('[data-testid^="button-launchkit-task-"]');
    await expect(taskButtons).toHaveCount(6);
    for (let index = 0; index < 6; index += 1) {
      const taskButton = taskButtons.nth(index);
      await taskButton.click();
      await expect(taskButton).toHaveAttribute('aria-pressed', 'true');
    }

    const generationResponse = modulePage.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/modules/ninja-launch-kit/launches/${launchId}/generations`
      && response.status() === 201);
    await modulePage.getByTestId('button-launchkit-generate').click();
    await generationResponse;
    const artifactButtons = modulePage.locator('[data-testid^="button-launchkit-artifact-"]');
    await expect(artifactButtons).toHaveCount(8);
    for (let index = 0; index < 8; index += 1) {
      const artifactButton = artifactButtons.nth(index);
      await artifactButton.click();
      await expect(artifactButton).toHaveText('Approve');
      await artifactButton.click();
      await expect(artifactButton).toHaveText('Return to draft');
    }
    await expect(modulePage.getByTestId('text-launchkit-readiness')).toHaveText('100%');
    await modulePage.getByTestId('button-launchkit-mark-launched').click();
    await expect(modulePage.getByText(/SaaS service · launched/)).toBeVisible();

    const downloadPromise = modulePage.waitForEvent('download');
    await modulePage.getByTestId('button-launchkit-export-markdown').click();
    const download = await downloadPromise;
    expect(await download.suggestedFilename()).toMatch(/\.md$/);
    await expect(modulePage.getByTestId('text-launchkit-export-hash')).toContainText(/[0-9a-f]{64}/);

    const persisted = await pg.query<{
      launches: string; tasks: string; artifacts: string; generations: string; exports: string; usage: string;
    }>(
      `select
        (select count(*) from launchkit_launches where tenant_id=$1 and id=$2 and status='launched')::text as launches,
        (select count(*) from launchkit_tasks where tenant_id=$1 and launch_id=$2 and required=true and status='complete')::text as tasks,
        (select count(*) from launchkit_artifacts where tenant_id=$1 and launch_id=$2 and required=true and status='approved')::text as artifacts,
        (select count(*) from launchkit_generations where tenant_id=$1 and launch_id=$2)::text as generations,
        (select count(*) from launchkit_exports where tenant_id=$1 and launch_id=$2)::text as exports,
        (select count(*) from shared_usage_events u join modules m on m.id=u.module_id
          where u.tenant_id=$1 and m.slug='ninja-launch-kit' and u.operation='launchkit.ai_generation')::text as usage`,
      [identity.tenantId, launchId],
    );
    expect(Number(persisted.rows[0].launches)).toBe(1);
    expect(Number(persisted.rows[0].tasks)).toBe(6);
    expect(Number(persisted.rows[0].artifacts)).toBe(8);
    expect(Number(persisted.rows[0].generations)).toBe(1);
    expect(Number(persisted.rows[0].exports)).toBe(1);
    expect(Number(persisted.rows[0].usage)).toBe(1);

    await modulePage.goto(launchUrl);
    await expect(modulePage).toHaveURL(launchUrl);
    await modulePage.reload();
    await expect(modulePage.getByText(launchTitle, { exact: true }).first()).toBeVisible();
    await modulePage.setViewportSize({ width: 390, height: 844 });
    await expect(modulePage.getByTestId('button-launchkit-mark-launched')).toBeVisible();

    await Promise.all([
      modulePage.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      modulePage.getByRole('link', { name: 'My Apps' }).first().click(),
    ]);
    await expect(modulePage.getByTestId('page-my-apps')).toBeVisible();
    const logoutAll = await modulePage.evaluate(async () => {
      const response = await fetch('/api/auth/logout-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: response.status, body: await response.text() };
    });
    expect(logoutAll.status, logoutAll.body).toBe(200);

    await modulePage.goto(launchUrl);
    await expect(modulePage).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await modulePage.getByTestId('input-email').fill(identity.email);
    await modulePage.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      modulePage.waitForURL(launchUrl, { timeout: 30_000 }),
      modulePage.getByTestId('button-login').click(),
    ]);
    await expect(modulePage.getByText(launchTitle, { exact: true }).first()).toBeVisible();
    await expect(modulePage.getByTestId('text-launchkit-readiness')).toHaveText('100%');
    await capturePhase20Evidence(modulePage, 'ninja-launch-kit-completed', { width: 1440, height: 1000 });
    await assertHostOnlySession(modulePage.context(), 'deployops.operatoros.net');
    await assertNoBrowserCredentialStorage(modulePage);
    assertNoCredentialQuery(modulePage.url());
  });

  test('CallCommand AI persists complete call intelligence and survives exact-host deep-link reauthentication', async ({ page, request }) => {
    test.setTimeout(180_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);
    const phone = `+1555${String(Date.now()).slice(-7)}`;

    await page.goto(`${ROOT}/app`);
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    await page.getByTestId('nav-my-apps').click();
    await expect(page.getByTestId('page-my-apps')).toBeVisible();

    await page.getByTestId('button-launch-callcommand-ai').click();
    const modulePage = page;
    await expect(modulePage.getByTestId('callcommand-module-shell')).toBeVisible({ timeout: 30_000 });
    await expect(modulePage.getByTestId('banner-callcommand-provider')).toContainText('Twilio voice provider');
    assertNoCredentialQuery(modulePage.url());

    await modulePage.getByRole('link', { name: 'Automations', exact: true }).click();
    await modulePage.getByTestId('button-callcommand-create-profile').click();
    await expect(modulePage.locator('#callcommand-receptionists')).toContainText('Operations receptionist');
    await modulePage.getByRole('button', { name: 'Create urgent rule' }).click();

    await modulePage.getByRole('link', { name: 'Numbers and channels', exact: true }).click();
    await modulePage.getByTestId('input-callcommand-channel-phone').fill(phone);
    await modulePage.getByTestId('button-callcommand-create-channel').click();
    await expect(modulePage.locator('#callcommand-configuration')).toContainText('Primary operations line');

    await modulePage.getByRole('link', { name: 'Calls', exact: true }).click();
    await modulePage.getByTestId('button-callcommand-place-test-call').click();
    await expect(modulePage.locator('#callcommand-calls')).toContainText('urgent', { timeout: 20_000 });
    await modulePage.getByRole('link', { name: 'Actions', exact: true }).click();
    await expect(modulePage.locator('#callcommand-work')).toContainText('Urgent caller response');

    const persisted = await pg.query<{
      id: string; calls: string; actions: string; tickets: string; recording_urls: string;
    }>(
      `select
        (select id from callcommand_calls where tenant_id=$1 and provider='simulator' order by created_at desc limit 1)::text as id,
        (select count(*) from callcommand_calls where tenant_id=$1 and provider='simulator' and status='completed' and priority='urgent' and analyzed_at is not null)::text as calls,
        (select count(*) from callcommand_action_runs where tenant_id=$1 and action_type='ticket' and status='completed' and provider_reference is not null)::text as actions,
        (select count(*) from callcommand_tickets where tenant_id=$1 and priority='urgent')::text as tickets,
        (select count(*) from information_schema.columns where table_name='callcommand_calls' and column_name='recording_url')::text as recording_urls`,
      [identity.tenantId],
    );
    expect(Number(persisted.rows[0].calls)).toBe(1);
    expect(Number(persisted.rows[0].actions)).toBe(1);
    expect(Number(persisted.rows[0].tickets)).toBe(1);
    expect(Number(persisted.rows[0].recording_urls)).toBe(0);
    const callUrl = `https://callcommand-ai.operatoros.net/calls/${persisted.rows[0].id}`;

    await modulePage.goto(callUrl);
    await expect(modulePage).toHaveURL(callUrl);
    await modulePage.reload();
    await expect(modulePage.locator('#callcommand-calls')).toContainText('urgent');
    await modulePage.setViewportSize({ width: 390, height: 844 });
    await expect(modulePage.locator('#callcommand-calls')).toBeVisible();
    await capturePhase20Evidence(modulePage, 'callcommand-ai-completed', { width: 390, height: 844 });
    await assertHostOnlySession(modulePage.context(), 'callcommand-ai.operatoros.net');

    await Promise.all([
      modulePage.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      modulePage.getByRole('link', { name: 'My Apps' }).first().click(),
    ]);
    await expect(modulePage.getByTestId('page-my-apps')).toBeVisible();
    const logoutAll = await modulePage.evaluate(async () => {
      const response = await fetch('/api/auth/logout-all', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      });
      return { status: response.status, body: await response.text() };
    });
    expect(logoutAll.status, logoutAll.body).toBe(200);

    await modulePage.goto(callUrl);
    await expect(modulePage).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await modulePage.getByTestId('input-email').fill(identity.email);
    await modulePage.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      modulePage.waitForURL(callUrl, { timeout: 30_000 }),
      modulePage.getByTestId('button-login').click(),
    ]);
    await expect(modulePage.locator('#callcommand-calls')).toContainText('urgent');
    await assertNoBrowserCredentialStorage(modulePage);
    assertNoCredentialQuery(modulePage.url());
  });

  test('SnapProofOS persists private evidence, server review decisions, custody, retention, and approved exports across global reauthentication', async ({ page, request }) => {
    test.setTimeout(210_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);
    const suffix = Date.now().toString(36);
    const reference = `SP-${suffix.toUpperCase()}`;
    const caseTitle = `Phase 11B evidence case ${suffix}`;
    const noteTitle = `Phase 11B evidence note ${suffix}`;
    const fileTitle = `Phase 11B private document ${suffix}`;
    const findingTitle = `Phase 11B verified finding ${suffix}`;
    const reportTitle = `Phase 11B defensible report ${suffix}`;

    await page.goto(`${ROOT}/app`);
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    await page.getByTestId('nav-my-apps').click();
    await expect(page.getByTestId('page-my-apps')).toBeVisible();

    await page.getByTestId('button-launch-snapproofos').click();
    const modulePage = page;
    const workspace = modulePage.locator('#snapproofos-workspace');
    await expect(workspace).toBeVisible({ timeout: 30_000 });
    await expect(modulePage.locator('#snapproofos-dashboard')).toBeVisible();
    expect(await workspace.getAttribute('data-evidence')).toBe('persisted-field-proof-and-private-evidence');
    assertNoCredentialQuery(modulePage.url());

    await modulePage.getByRole('link', { name: 'Evidence cases', exact: true }).click();
    await modulePage.getByLabel('Case reference').fill(reference);
    await modulePage.getByLabel('Title', { exact: true }).fill(caseTitle);
    await modulePage.getByLabel('Description').fill('A real persisted evidence lifecycle exercised through the production-host proxy.');
    const caseResponsePromise = modulePage.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/modules/snapproofos/cases'
      && response.status() === 201);
    await modulePage.getByRole('button', { name: 'Create evidence case' }).click();
    const createdCase = await (await caseResponsePromise).json() as { id: string };
    expect(createdCase.id).toMatch(/^[a-f0-9-]{36}$/);
    await expect(modulePage.getByRole('heading', { name: caseTitle })).toBeVisible();
    const caseUrl = `https://snapproofos.operatoros.net/cases/${createdCase.id}`;
    await expect(modulePage).toHaveURL(caseUrl);

    await modulePage.getByRole('link', { name: 'Evidence integrity', exact: true }).click();
    await modulePage.getByLabel('Evidence type').selectOption('note');
    await modulePage.getByLabel('Title', { exact: true }).fill(noteTitle);
    await modulePage.getByLabel('Source type').fill('acceptance_test');
    await modulePage.getByLabel('Description / note').fill('Persisted evidence note created by the Phase 11B production-host browser gate.');
    await modulePage.getByRole('button', { name: 'Add evidence note' }).click();
    const noteCard = modulePage.locator('article').filter({ has: modulePage.getByRole('heading', { name: noteTitle }) });
    await expect(noteCard).toBeVisible();

    await modulePage.getByLabel('Evidence type').selectOption('document');
    await modulePage.getByLabel('Title', { exact: true }).fill(fileTitle);
    await modulePage.getByLabel('Source type').fill('acceptance_test');
    await modulePage.getByLabel('Description / note').fill('Private attachment used to prove signature, scan, hashing, and authorized download behavior.');
    await modulePage.getByLabel('Private file').setInputFiles({
      name: 'phase-11b-evidence.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('OperatorOS Phase 11B private evidence payload.'),
    });
    await modulePage.getByRole('button', { name: 'Upload evidence' }).click();
    const fileCard = modulePage.locator('article').filter({ has: modulePage.getByRole('heading', { name: fileTitle }) });
    await expect(fileCard).toBeVisible();
    await expect(fileCard.getByText(/SHA-256 [a-f0-9]{64}/)).toBeVisible();

    await expect.poll(async () => {
      const result = await pg!.query<{ scan_status: string }>(
        `select a.scan_status
           from shared_attachments a
           join snapproof_evidence_items e
             on e.tenant_id=a.tenant_id and e.attachment_id=a.id
          where e.tenant_id=$1 and e.case_id=$2 and e.title=$3`,
        [identity.tenantId, createdCase.id, fileTitle],
      );
      return result.rows[0]?.scan_status;
    }, { timeout: 30_000 }).toMatch(/^(clean|unavailable)$/);

    await modulePage.getByRole('link', { name: 'Case findings', exact: true }).click();
    await modulePage.getByLabel('Finding title').fill(findingTitle);
    await modulePage.getByLabel('Description').fill('The private evidence hash and review state remain server authoritative.');
    await modulePage.getByLabel('Severity').selectOption('high');
    await modulePage.getByRole('button', { name: 'Record finding' }).click();
    await expect(modulePage.getByText(findingTitle, { exact: true })).toBeVisible();
    await modulePage.getByLabel('Append-only internal note').fill('Internal reviewer context is append-only and custody linked.');
    await modulePage.getByRole('button', { name: 'Add internal note' }).click();
    await expect(modulePage.getByText('Internal reviewer context is append-only and custody linked.')).toBeVisible();

    await modulePage.getByRole('link', { name: 'Evidence integrity', exact: true }).click();
    await noteCard.getByRole('button', { name: 'Submit for review' }).click();
    await fileCard.getByRole('button', { name: 'Submit for review' }).click();
    await modulePage.getByRole('link', { name: 'Review', exact: true }).click();
    await modulePage.locator('article').filter({ hasText: noteTitle }).getByRole('button', { name: 'Verify' }).click();
    await modulePage.locator('article').filter({ hasText: fileTitle }).getByRole('button', { name: 'Verify' }).click();

    await modulePage.getByRole('link', { name: 'Evidence cases', exact: true }).click();
    await modulePage.getByRole('button', { name: 'Submit case for review' }).click();
    await modulePage.getByRole('link', { name: 'Review', exact: true }).click();
    await modulePage.getByRole('button', { name: 'Approve case' }).click();
    await expect(modulePage.getByRole('button', { name: 'Approve case' })).toBeHidden({ timeout: 30_000 });

    await modulePage.getByRole('link', { name: 'Reports', exact: true }).click();
    const reportTitleInput = modulePage.getByLabel('Report title');
    await reportTitleInput.fill(reportTitle);
    await expect(reportTitleInput).toHaveValue(reportTitle);
    await modulePage.getByRole('button', { name: 'Create report snapshot' }).click();
    const reportCard = workspace
      .getByRole('heading', { name: reportTitle, exact: true })
      .locator('xpath=ancestor::article[1]');
    await expect(reportCard).toBeVisible();
    await reportCard.getByRole('button', { name: 'Submit report' }).click();
    await modulePage.getByRole('link', { name: 'Review', exact: true }).click();
    await workspace
      .getByRole('heading', { name: reportTitle, exact: true })
      .locator('xpath=ancestor::article[1]')
      .getByRole('button', { name: 'Approve report' })
      .click();
    await modulePage.getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(reportCard.getByRole('button', { name: 'JSON' })).toBeVisible();
    await Promise.all([
      modulePage.waitForEvent('download'),
      reportCard.getByRole('button', { name: 'JSON' }).click(),
    ]);

    await modulePage.getByRole('link', { name: 'Custody', exact: true }).click();
    await expect(modulePage.getByText('Displayed custody links are continuous')).toBeVisible();
    await expect(modulePage.getByText('report approved', { exact: true })).toBeVisible();

    await modulePage.getByRole('link', { name: 'Retention', exact: true }).click();
    await modulePage.getByRole('button', { name: 'Place legal hold' }).click();
    await expect(modulePage.getByRole('button', { name: 'Release legal hold' })).toBeVisible();
    await modulePage.setViewportSize({ width: 390, height: 844 });
    await expect(modulePage.getByRole('button', { name: 'Open SnapProofOS navigation', exact: true })).toBeVisible();

    await Promise.all([
      modulePage.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      modulePage.getByRole('link', { name: 'My Apps' }).first().click(),
    ]);
    await expect(modulePage.getByTestId('page-my-apps')).toBeVisible();
    const logoutAll = await modulePage.evaluate(async () => {
      const response = await fetch('/api/auth/logout-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: response.status, body: await response.text() };
    });
    expect(logoutAll.status, logoutAll.body).toBe(200);

    await modulePage.goto(caseUrl);
    await expect(modulePage).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await modulePage.getByTestId('input-email').fill(identity.email);
    await modulePage.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      modulePage.waitForURL(caseUrl, { timeout: 30_000 }),
      modulePage.getByTestId('button-login').click(),
    ]);
    await expect(modulePage.getByRole('heading', { name: caseTitle })).toBeVisible();
    await expect(modulePage.getByText('approved', { exact: true }).last()).toBeVisible();
    await modulePage.reload();
    await expect(modulePage.getByRole('heading', { name: caseTitle })).toBeVisible();
    await capturePhase20Evidence(modulePage, 'snapproofos-completed', { width: 768, height: 1024 });
    await assertHostOnlySession(modulePage.context(), 'snapproofos.operatoros.net');
    await assertNoBrowserCredentialStorage(modulePage);
    assertNoCredentialQuery(modulePage.url());
  });

  test('Operator Pool Hall persists profile and real CPU/hot-seat shot trails across deep links and global reauthentication', async ({ page, request }) => {
    test.setTimeout(180_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);

    await page.goto(`${ROOT}/app`);
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    await page.getByTestId('nav-my-apps').click();
    await expect(page.getByTestId('page-my-apps')).toBeVisible();

    await page.getByTestId('button-launch-ninja-pool-hall').click();
    let modulePage = page;
    await expect(modulePage.getByTestId('ninja-pool-hall-shell')).toBeVisible({ timeout: 30_000 });
    await expect(modulePage.getByTestId('ninja-pool-dashboard')).toBeVisible();
    await expect(modulePage.getByRole('link', { name: 'Online', exact: true })).toBeVisible();
    await expect(modulePage.getByText('Online rooms are coming later', { exact: true })).toHaveCount(0);
    assertNoCredentialQuery(modulePage.url());

    await modulePage.locator('a[href="/profile"]').click();
    await expect(modulePage).toHaveURL('https://operatorpoolhall.operatoros.net/profile');
    const displayName = modulePage.getByLabel('Display name');
    await displayName.fill('Phase 10B Table Ninja');
    await Promise.all([
      modulePage.waitForResponse(response => response.request().method() === 'PUT'
        && new URL(response.url()).pathname === '/api/modules/ninja-pool-hall/profile'
        && response.status() === 200),
      modulePage.getByRole('button', { name: 'Save profile' }).click(),
    ]);

    await modulePage.getByRole('link', { name: 'Vs CPU', exact: true }).click();
    await expect(modulePage.getByTestId('ninja-pool-bot-match')).toBeVisible();
    await modulePage.getByTestId('ninja-pool-start-match').click();
    await expect(modulePage).toHaveURL(/^https:\/\/operatorpoolhall\.operatoros\.net\/matches\/[a-f0-9-]+$/);
    const cpuMatchUrl = modulePage.url();
    const shotStartedAt = Date.now();
    await modulePage.getByTestId('ninja-pool-match-shoot').click();
    await expect(modulePage.locator('.nphm-history small').filter({ hasText: /[1-9]\d* shots/ }).first()).toBeVisible({ timeout: 20_000 });
    expect(Date.now() - shotStartedAt, 'a local deterministic shot should settle and persist within the browser budget').toBeLessThan(20_000);

    await modulePage.reload();
    await expect(modulePage).toHaveURL(cpuMatchUrl);
    await expect(modulePage.getByTestId('ninja-pool-match-detail')).toBeVisible({ timeout: 20_000 });
    await expect(modulePage.getByText('active', { exact: true })).toBeVisible();
    await expect(modulePage.locator('dd').filter({ hasText: /^[1-9]\d*$/ }).first()).toBeVisible();

    await modulePage.getByRole('link', { name: 'Vs CPU', exact: true }).click();
    await expect(modulePage.getByText('Match recovery required')).toBeVisible({ timeout: 20_000 });
    await modulePage.getByRole('button', { name: 'End recovered match' }).click();
    await expect(modulePage.locator('.nphm-history article').filter({ hasText: 'abandoned' }).first()).toBeVisible();

    await modulePage.getByRole('button', { name: 'Local 2P', exact: true }).click();
    await expect(modulePage.getByTestId('ninja-pool-local-match')).toBeVisible();
    await modulePage.getByTestId('ninja-pool-start-match').click();
    await modulePage.getByTestId('ninja-pool-match-shoot').click();
    await expect(modulePage.locator('.nphm-history small').filter({ hasText: /[1-9]\d* shots/ }).first()).toBeVisible({ timeout: 20_000 });
    await modulePage.getByRole('button', { name: 'End match' }).click();
    await expect(modulePage.locator('.nphm-history article').filter({ hasText: 'abandoned' }).first()).toBeVisible();

    await modulePage.setViewportSize({ width: 390, height: 844 });
    await expect(modulePage.getByRole('navigation', { name: 'Operator Pool Hall navigation' })).toBeVisible();
    await expect(modulePage.getByRole('button', { name: 'Profile', exact: true })).toBeVisible();

    await Promise.all([
      modulePage.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      modulePage.getByRole('link', { name: 'My Apps' }).first().click(),
    ]);
    const logoutAll = await modulePage.evaluate(async () => {
      const response = await fetch('/api/auth/logout-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: response.status, body: await response.text() };
    });
    expect(logoutAll.status, logoutAll.body).toBe(200);

    // The signed-in app shell may begin its own central-auth navigation as
    // soon as global revocation completes. Close that page so its redirect
    // cannot race the deliberate module deep-link reauthentication check.
    const browserContext = modulePage.context();
    await modulePage.close();
    modulePage = await browserContext.newPage();
    await modulePage.goto('https://operatorpoolhall.operatoros.net/profile');
    await expect(modulePage).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await modulePage.getByTestId('input-email').fill(identity.email);
    await modulePage.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      modulePage.waitForURL('https://operatorpoolhall.operatoros.net/profile', { timeout: 30_000 }),
      modulePage.getByTestId('button-login').click(),
    ]);
    await expect(modulePage.getByLabel('Display name')).toHaveValue('Phase 10B Table Ninja');
    await capturePhase20Evidence(modulePage, 'ninja-pool-hall-completed', { width: 390, height: 844 });
    await assertHostOnlySession(modulePage.context(), 'operatorpoolhall.operatoros.net');
    await assertNoBrowserCredentialStorage(modulePage);
    assertNoCredentialQuery(modulePage.url());
  });

  test('Script Ops persists reviewed automation, audits the approved download, and survives deep-link reauthentication', async ({ page, request }) => {
    test.setTimeout(180_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);
    const suffix = Date.now().toString(36);
    const scriptName = `E2E inventory check ${suffix}`;

    await page.goto(`${ROOT}/app`);
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    await page.getByTestId('nav-my-apps').click();
    await page.getByTestId('button-launch-ninjamation').click();
    const modulePage = page;
    await expect(modulePage.getByTestId('shell-ninjamation')).toBeVisible({ timeout: 30_000 });
    await expect(modulePage.getByTestId('notice-ninjamation-no-execution')).toContainText('never executes script source');

    await modulePage.getByRole('link', { name: 'Administration', exact: true }).click();
    await modulePage.getByTestId('input-ninjamation-name').fill(scriptName);
    await modulePage.getByTestId('select-ninjamation-language').selectOption('powershell');
    await modulePage.getByTestId('select-ninjamation-risk').selectOption('low');
    await modulePage.getByTestId('textarea-ninjamation-content').fill('Get-Process | Select-Object -First 5');
    await modulePage.getByTestId('button-ninjamation-save').click();
    await expect(modulePage.getByTestId('text-ninjamation-notice')).toContainText('Manual script draft created.');

    const script = await pg.query<{ id: string; status: string }>(
      `select id, status from ninjamation_scripts where tenant_id = $1 and name = $2 and deleted_at is null`,
      [identity.tenantId, scriptName],
    );
    expect(script.rows).toHaveLength(1);
    const scriptId = script.rows[0].id;
    await modulePage.getByTestId('button-ninjamation-submit-review').click();
    await expect(modulePage.getByTestId('text-ninjamation-notice')).toContainText('Submitted for organization-admin review.');
    await modulePage.getByTestId('button-ninjamation-approve').click();
    await expect(modulePage.getByTestId('text-ninjamation-notice')).toContainText('Approved current immutable version.');
    const downloadPromise = modulePage.waitForEvent('download');
    await modulePage.getByTestId('button-ninjamation-download').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.ps1$/);
    await expect.poll(async () => {
      const result = await pg!.query<{ count: string }>(
        `select count(*)::text as count from ninjamation_downloads where tenant_id = $1 and script_id = $2`,
        [identity.tenantId, scriptId],
      );
      return Number(result.rows[0]?.count ?? 0);
    }).toBe(1);

    const deepUrl = `https://scriptops.operatoros.net/scripts/${scriptId}`;
    await modulePage.goto(deepUrl);
    await modulePage.reload();
    await expect(modulePage.getByTestId(`button-ninjamation-script-${scriptId}`)).toContainText(scriptName, { timeout: 30_000 });
    await capturePhase20Evidence(modulePage, 'ninjamation-completed', { width: 768, height: 1024 });
    await Promise.all([
      modulePage.waitForURL(/^https:\/\/app\.operatoros\.net\/(?:[?#].*)?$/, { timeout: 30_000 }),
      modulePage.getByRole('link', { name: 'My Apps' }).first().click(),
    ]);
    const logoutAll = await browserJson(modulePage, '/api/auth/logout-all', 'POST', {});
    expect(logoutAll.status, JSON.stringify(logoutAll.body)).toBe(200);
    await modulePage.goto(deepUrl);
    await expect(modulePage).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await modulePage.getByTestId('input-email').fill(identity.email);
    await modulePage.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      modulePage.waitForURL(deepUrl, { timeout: 30_000 }),
      modulePage.getByTestId('button-login').click(),
    ]);
    await expect(modulePage.getByTestId(`button-ninjamation-script-${scriptId}`)).toContainText(scriptName, { timeout: 30_000 });
    await assertHostOnlySession(modulePage.context(), 'scriptops.operatoros.net');
    await assertNoBrowserCredentialStorage(modulePage);
    assertNoCredentialQuery(modulePage.url());
  });

});
