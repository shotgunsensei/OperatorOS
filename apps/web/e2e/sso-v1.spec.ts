import { test, expect, type APIRequestContext, type BrowserContext, type Page, type Request } from '@playwright/test';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.E2E_ROOT_URL || 'https://operatoros.net';
const API = process.env.E2E_API_URL || 'http://127.0.0.1:5001';
const PASSWORD = 'OperatorOS-E2E-Only-94!';

const SHELL_TEST_IDS: Record<string, string> = {
  tradeflowkit: 'tradeflowkit-module-shell',
  torqueshed: 'torqueshed-module-shell',
  techdeck: 'techdeck-module-shell',
  pulsedesk: 'pulsedesk-module-shell',
  faultlinelab: 'faultlinelab-module-shell',
  'ninja-pool-hall': 'ninja-pool-hall-shell',
  brandforgeos: 'brandforgeos-workspace',
  snapproofos: 'snapproofos-workspace',
  'studyforge-ai': 'shell-studyforge-ai',
  'ninja-launch-kit': 'shell-ninja-launch-kit',
  'callcommand-ai': 'shell-callcommand-ai',
  ninjamation: 'shell-ninjamation',
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

if (ENABLED_MODULES.length !== 13) {
  throw new Error(`Expected 13 enabled OperatorOS modules, found ${ENABLED_MODULES.length}`);
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
  const response = await request.post(`${API}/v1/auth/register`, {
    headers: PUBLIC_AUTH_HEADERS,
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

  test('one credential entry establishes the canonical app host then silently launches all thirteen enabled modules', async ({ page, request }) => {
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

    let lastModulePage: Page | null = null;
    for (const [index, module] of ENABLED_MODULES.entries()) {
      const collection = navigationCollector(context);
      const popupPromise = page.waitForEvent('popup');
      await page.getByTestId(`button-launch-${module.slug}`).click();
      const modulePage = await popupPromise;
      await expect(modulePage.getByTestId(module.shellTestId)).toBeVisible({ timeout: 30_000 });
      collection.stop();

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

      await modulePage.reload();
      await expect(modulePage.getByTestId(module.shellTestId)).toBeVisible({ timeout: 20_000 });
      expect(new URL(modulePage.url()).hostname).toBe(module.host);
      assertNoCredentialQuery(modulePage.url());

      if (index < ENABLED_MODULES.length - 1) {
        await modulePage.close();
      } else {
        lastModulePage = modulePage;
      }
    }

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
    expect(lastModulePage).toBeTruthy();
    await lastModulePage!.reload();
    await lastModulePage!.waitForURL(/^https:\/\/auth\.operatoros\.net\/login\?/, { timeout: 30_000 });
    expect(loginPosts).toBe(1);
    assertNoCredentialQuery(lastModulePage!.url());
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
    await expect(sibling.getByTestId('pulsedesk-tab-dashboard')).toHaveAttribute('aria-selected', 'true');
    await sibling.goto('https://pulsedesk.operatoros.net/service-desk-admin');
    await expect(sibling.getByTestId('pulsedesk-tab-admin')).toHaveAttribute('aria-selected', 'true');

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
    const relationshipForm = page.getByTestId('techdeck-relationship-create-form');
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
    const documentForm = page.getByTestId('techdeck-document-create-form');
    await documentForm.locator('input[placeholder="Document title"]').fill(runbookTitle);
    await documentForm.locator('select').first().selectOption('runbook');
    await documentForm.locator('input[placeholder="Summary"]').fill('Validated, documentation-only firewall recovery sequence.');
    await documentForm.locator('textarea').fill('1. Verify current configuration.\\n2. Capture evidence.\\n3. Apply the approved manual recovery plan.');
    await documentForm.getByRole('button', { name: 'Save draft' }).click();
    const runbookRow = page.locator('.td-doc').filter({ hasText: runbookTitle });
    await expect(runbookRow).toBeVisible({ timeout: 30_000 });

    const workspaceAfterDocument = await page.evaluate(async () => {
      const response = await fetch('/api/modules/techdeck/workspace', { credentials: 'include' });
      return response.json();
    });
    const runbook = workspaceAfterDocument.documents.find((row: { title: string }) => row.title === runbookTitle);
    expect(runbook?.id).toBeTruthy();
    await page.goto(`https://techdeck.operatoros.net/kb/${runbook.id}`);
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
    const reportForm = page.getByTestId('techdeck-report-create-form');
    await reportForm.locator('input').fill(reportName);
    await reportForm.getByRole('button', { name: 'Generate' }).click();
    await expect(page.locator('.td-row').filter({ hasText: reportName })).toBeVisible({ timeout: 30_000 });

    const timeNotes = `E2E recovery validation ${suffix}`;
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

    await page.getByTestId('techdeck-return-command-center').click();
    await expect(page).toHaveURL(/^https:\/\/app\.operatoros\.net\//, { timeout: 30_000 });
    await expect(page.getByTestId('page-my-apps')).toBeVisible({ timeout: 30_000 });
    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('button-launch-techdeck').click();
    const reopened = await popupPromise;
    await expect(reopened.getByTestId('techdeck-module-shell')).toBeVisible({ timeout: 30_000 });
    await reopened.goto(`https://techdeck.operatoros.net/assets/${firewall.id}`);
    await expect(reopened.getByTestId('techdeck-route-record-context')).toContainText(firewallName);
    await reopened.goto('https://techdeck.operatoros.net/logout');
    await expect(reopened).toHaveURL(/^https:\/\/operatoros\.net\/signed-out\?signed_out=local$/);
    expect((await sessionCookies(context)).some(cookie => cookie.domain === 'techdeck.operatoros.net')).toBe(false);
    await reopened.close();
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

    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('button-launch-faultlinelab').click();
    const modulePage = await popupPromise;
    await expect(modulePage.getByTestId('faultlinelab-module-shell')).toBeVisible({ timeout: 30_000 });
    await expect(modulePage.getByTestId('faultlinelab-challenge-card').first()).toBeVisible();

    await modulePage.getByTestId('faultlinelab-challenge-card').first().getByRole('button', { name: 'Standard' }).click();
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
    await submission.getByRole('button', { name: 'Submit for server scoring' }).click();
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

    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('button-launch-brandforgeos').click();
    const modulePage = await popupPromise;
    await expect(modulePage.getByTestId('brandforgeos-workspace')).toBeVisible({ timeout: 30_000 });
    await expect(modulePage.locator('#brandforgeos-dashboard')).toBeVisible();
    expect(await modulePage.getByTestId('brandforgeos-workspace').getAttribute('data-evidence')).toBe('persisted_records_only');
    assertNoCredentialQuery(modulePage.url());

    await modulePage.getByRole('button', { name: 'Brand Kits', exact: true }).click();
    await expect(modulePage).toHaveURL('https://brandforgeos.operatoros.net/brands');
    await modulePage.getByLabel('Brand name').fill(brandName);
    await modulePage.getByLabel('Voice and tone').fill('Direct, technical, and evidence-led');
    await modulePage.getByLabel('Description').fill('A persisted Phase 11A browser acceptance brand.');
    await Promise.all([
      modulePage.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/modules/brandforgeos/brands'
        && response.status() === 201),
      modulePage.getByRole('button', { name: 'Create brand kit' }).click(),
    ]);
    await expect(modulePage.getByRole('heading', { name: brandName })).toBeVisible();

    await modulePage.getByRole('button', { name: 'Personas', exact: true }).click();
    await modulePage.getByLabel('Persona name').fill(personaName);
    await modulePage.getByLabel('Pain points').fill('Fragmented creative operations');
    await modulePage.getByLabel('Goals').fill('Ship measurable campaigns');
    await modulePage.getByRole('button', { name: 'Create persona' }).click();
    await expect(modulePage.getByRole('heading', { name: personaName })).toBeVisible();

    await modulePage.getByRole('button', { name: 'Campaigns', exact: true }).click();
    await modulePage.getByLabel('Campaign name').fill(campaignName);
    await modulePage.getByLabel('Objective').fill('Prove the durable OperatorOS creative workflow');
    await modulePage.getByLabel('Brand kit').selectOption({ label: brandName });
    await modulePage.getByLabel('Persona').selectOption({ label: personaName });
    await modulePage.getByRole('button', { name: 'Create campaign' }).click();
    await expect(modulePage.getByRole('heading', { name: campaignName })).toBeVisible();
    await modulePage.getByRole('button', { name: 'Move to planning' }).click();
    await expect(modulePage.getByText('planning', { exact: true })).toBeVisible();

    await modulePage.getByRole('button', { name: 'Copy Studio', exact: true }).click();
    await modulePage.getByLabel('Title').fill(copyTitle);
    await modulePage.getByLabel('Copy content').fill('This copy asset is persisted and linked to the accepted campaign.');
    await modulePage.getByLabel('Campaign').selectOption({ label: campaignName });
    await modulePage.getByLabel('Brand kit').selectOption({ label: brandName });
    await modulePage.getByRole('button', { name: 'Save copy asset' }).click();
    await expect(modulePage.getByRole('heading', { name: copyTitle })).toBeVisible();

    await modulePage.getByRole('button', { name: 'Calendar', exact: true }).click();
    await modulePage.getByLabel('Deliverable title').fill(calendarTitle);
    await modulePage.getByLabel('Scheduled time').fill('2026-08-20T14:00');
    await modulePage.getByLabel('Campaign').selectOption({ label: campaignName });
    await modulePage.getByLabel('Copy asset').selectOption({ label: copyTitle });
    await modulePage.getByRole('button', { name: 'Schedule content' }).click();
    await expect(modulePage.getByText(calendarTitle, { exact: true })).toBeVisible();

    await modulePage.getByRole('button', { name: 'Analytics', exact: true }).click();
    await modulePage.getByLabel('Campaign').selectOption({ label: campaignName });
    await modulePage.getByLabel('Impressions').fill('100');
    await modulePage.getByLabel('Clicks').fill('20');
    await modulePage.getByLabel('Conversions').fill('4');
    await modulePage.getByRole('button', { name: 'Record metrics' }).click();
    await expect(modulePage.locator('#brandforgeos-analytics').getByText('100', { exact: true })).toBeVisible();
    await expect(modulePage.getByRole('link', { name: 'Download real CSV export' })).toHaveAttribute('href', '/api/modules/brandforgeos/export?format=csv');

    await modulePage.getByRole('button', { name: 'AI Workflows', exact: true }).click();
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
    await expect(modulePage.getByRole('navigation', { name: 'BrandForgeOS workspace' })).toBeVisible();
    await expect(modulePage.getByRole('button', { name: 'Campaigns', exact: true })).toBeVisible();

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
    await expect(modulePage.getByRole('heading', { name: campaignName })).toBeVisible();
    await modulePage.reload();
    await expect(modulePage.getByRole('heading', { name: campaignName })).toBeVisible();
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

    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('button-launch-studyforge-ai').click();
    const modulePage = await popupPromise;
    const workspace = modulePage.getByTestId('shell-studyforge-ai');
    await expect(workspace).toBeVisible({ timeout: 30_000 });
    await expect(modulePage.locator('#studyforge-dashboard')).toBeVisible();
    expect(await workspace.getAttribute('data-evidence')).toBe('persisted_records_only');
    assertNoCredentialQuery(modulePage.url());

    await modulePage.getByRole('button', { name: 'Subjects', exact: true }).click();
    await expect(modulePage).toHaveURL('https://studyforge-ai.operatoros.net/subjects');
    await modulePage.getByTestId('input-studyforge-subject-name').fill(subjectName);
    await modulePage.getByLabel('Course code').fill('NET-201');
    await modulePage.getByTestId('button-studyforge-subject-create').click();
    await expect(modulePage.locator('#studyforge-subjects').getByText(subjectName, { exact: true })).toBeVisible();

    await modulePage.getByRole('button', { name: 'Sources', exact: true }).click();
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
      await modulePage.getByRole('button', { name: 'AI Studio', exact: true }).click();
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
    await modulePage.getByRole('button', { name: 'Flashcards', exact: true }).click();
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
    await modulePage.getByRole('button', { name: 'Quizzes', exact: true }).click();
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
    await modulePage.getByRole('button', { name: 'Study Plans', exact: true }).click();
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
    await expect(modulePage.getByRole('navigation', { name: 'StudyForge workspace' })).toBeVisible();
    await expect(modulePage.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();
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
    await assertHostOnlySession(modulePage.context(), 'studyforge-ai.operatoros.net');
    await assertNoBrowserCredentialStorage(modulePage);
    assertNoCredentialQuery(modulePage.url());
  });

  test('Ninja Launch Kit persists reviewed launch execution, evidence readiness, exports, and deep-link reauthentication', async ({ page, request }) => {
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

    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('button-launch-ninja-launch-kit').click();
    const modulePage = await popupPromise;
    await expect(modulePage.getByTestId('shell-ninja-launch-kit')).toBeVisible({ timeout: 30_000 });
    await expect(modulePage.locator('#launchkit-dashboard')).toBeVisible();
    assertNoCredentialQuery(modulePage.url());

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
    const launchUrl = `https://ninjalaunchkit.operatoros.net/launches/${launchId}`;
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
    await assertHostOnlySession(modulePage.context(), 'ninjalaunchkit.operatoros.net');
    await assertNoBrowserCredentialStorage(modulePage);
    assertNoCredentialQuery(modulePage.url());
  });

  test('CallCommand AI enforces consent, persists a test-provider call, blocks suppression, and survives deep-link reauthentication', async ({ page, request }) => {
    test.setTimeout(180_000);
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    const identity = await registerAndSeed(request, pg);
    identities.push(identity);
    const suffix = Date.now().toString(36);
    const contactName = `Phase 11E caller ${suffix}`;
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

    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('button-launch-callcommand-ai').click();
    const modulePage = await popupPromise;
    await expect(modulePage.getByTestId('shell-callcommand-ai')).toBeVisible({ timeout: 30_000 });
    await expect(modulePage.getByTestId('banner-callcommand-provider')).toContainText('Local test adapter');
    assertNoCredentialQuery(modulePage.url());

    await modulePage.getByTestId('button-callcommand-create-channel').click();
    await expect(modulePage.locator('#callcommand-configuration')).toContainText('Primary support line');
    await modulePage.getByTestId('button-callcommand-create-profile').click();
    await expect(modulePage.locator('#callcommand-configuration')).toContainText('Support intake');
    await modulePage.getByTestId('input-callcommand-phone').fill(phone);
    await modulePage.getByTestId('input-callcommand-name').fill(contactName);
    await modulePage.getByTestId('select-callcommand-purpose').selectOption('support');
    await modulePage.getByTestId('input-callcommand-consent-evidence').fill(
      'Customer requested this support callback through the authenticated OperatorOS acceptance workflow.',
    );
    await modulePage.getByTestId('button-callcommand-grant-consent').click();
    await expect(modulePage.getByTestId('text-callcommand-consent-active')).toBeVisible();

    const callResponse = modulePage.waitForResponse(response =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/modules/callcommand-ai/calls'
      && response.status() === 201);
    await modulePage.getByTestId('button-callcommand-place-test-call').click();
    const call = await (await callResponse).json() as { id: string };
    const callUrl = `https://callcommand-ai.operatoros.net/calls/${call.id}`;
    const callRow = modulePage.getByTestId(`row-callcommand-call-${call.id}`);
    await expect(callRow).toBeVisible();
    await expect(callRow.getByTestId('status-callcommand-completed')).toBeVisible();
    await expect(callRow).toContainText('without contacting an external number');
    await modulePage.getByTestId('select-callcommand-disposition').selectOption('follow_up_required');
    await modulePage.getByTestId('input-callcommand-disposition-note').fill(
      'Confirm the support window before any additional contact.',
    );
    await modulePage.getByTestId('button-callcommand-save-disposition').click();
    await expect(modulePage.getByTestId(`text-callcommand-disposition-${call.id}`)).toContainText('follow up required');
    await modulePage.getByTestId('select-callcommand-followup-channel').selectOption('task');
    await modulePage.getByTestId('input-callcommand-followup-body').fill(
      'Confirm the support window before any additional contact.',
    );
    await modulePage.getByTestId('button-callcommand-save-followup').click();
    await expect(modulePage.getByTestId('list-callcommand-followups')).toContainText(
      'Confirm the support window before any additional contact.',
    );

    const persisted = await pg.query<{
      calls: string; events: string; consents: string; followups: string; recording_urls: string;
    }>(
      `select
        (select count(*) from callcommand_calls where tenant_id=$1 and id=$2 and provider='test' and status='completed' and disposition='follow_up_required')::text as calls,
        (select count(*) from callcommand_events where tenant_id=$1 and call_id=$2)::text as events,
        (select count(*) from callcommand_consents where tenant_id=$1 and purpose='support' and revoked_at is null)::text as consents,
        (select count(*) from callcommand_followups where tenant_id=$1 and call_id=$2 and channel='task' and status='draft')::text as followups,
        (select count(*) from information_schema.columns where table_name='callcommand_calls' and column_name='recording_url')::text as recording_urls`,
      [identity.tenantId, call.id],
    );
    expect(Number(persisted.rows[0].calls)).toBe(1);
    expect(Number(persisted.rows[0].events)).toBe(3);
    expect(Number(persisted.rows[0].consents)).toBe(1);
    expect(Number(persisted.rows[0].followups)).toBe(1);
    expect(Number(persisted.rows[0].recording_urls)).toBe(0);

    await modulePage.getByTestId('button-callcommand-suppress').click();
    await modulePage.getByTestId('button-callcommand-place-test-call').click();
    await expect(modulePage.getByTestId('text-callcommand-error')).toContainText('do-not-call');

    await modulePage.goto(callUrl);
    await expect(modulePage).toHaveURL(callUrl);
    await modulePage.reload();
    await expect(modulePage.getByTestId(`row-callcommand-call-${call.id}`)).toBeVisible();
    await expect(modulePage.getByTestId(`text-callcommand-disposition-${call.id}`)).toContainText('follow up required');
    await expect(modulePage.getByTestId('list-callcommand-followups')).toContainText(
      'Confirm the support window before any additional contact.',
    );
    await modulePage.setViewportSize({ width: 390, height: 844 });
    await expect(modulePage.locator('#callcommand-calls')).toBeVisible();
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
    await expect(modulePage.getByTestId(`row-callcommand-call-${call.id}`)).toBeVisible();
    await expect(modulePage.getByTestId(`text-callcommand-disposition-${call.id}`)).toContainText('follow up required');
    await expect(modulePage.getByTestId('list-callcommand-followups')).toContainText(
      'Confirm the support window before any additional contact.',
    );
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

    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('button-launch-snapproofos').click();
    const modulePage = await popupPromise;
    const workspace = modulePage.getByTestId('snapproofos-workspace');
    await expect(workspace).toBeVisible({ timeout: 30_000 });
    await expect(modulePage.locator('#snapproofos-dashboard')).toBeVisible();
    expect(await workspace.getAttribute('data-evidence')).toBe('persisted-private-evidence-only');
    assertNoCredentialQuery(modulePage.url());

    await modulePage.getByRole('button', { name: 'Cases', exact: true }).click();
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

    await modulePage.getByRole('button', { name: 'Evidence', exact: true }).click();
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

    await modulePage.getByRole('button', { name: 'Findings', exact: true }).click();
    await modulePage.getByLabel('Finding title').fill(findingTitle);
    await modulePage.getByLabel('Description').fill('The private evidence hash and review state remain server authoritative.');
    await modulePage.getByLabel('Severity').selectOption('high');
    await modulePage.getByRole('button', { name: 'Record finding' }).click();
    await expect(modulePage.getByText(findingTitle, { exact: true })).toBeVisible();
    await modulePage.getByLabel('Append-only internal note').fill('Internal reviewer context is append-only and custody linked.');
    await modulePage.getByRole('button', { name: 'Add internal note' }).click();
    await expect(modulePage.getByText('Internal reviewer context is append-only and custody linked.')).toBeVisible();

    await modulePage.getByRole('button', { name: 'Evidence', exact: true }).click();
    await noteCard.getByRole('button', { name: 'Submit for review' }).click();
    await fileCard.getByRole('button', { name: 'Submit for review' }).click();
    await modulePage.getByRole('button', { name: 'Review', exact: true }).click();
    await modulePage.locator('article').filter({ hasText: noteTitle }).getByRole('button', { name: 'Verify' }).click();
    await modulePage.locator('article').filter({ hasText: fileTitle }).getByRole('button', { name: 'Verify' }).click();

    await modulePage.getByRole('button', { name: 'Cases', exact: true }).click();
    await modulePage.getByRole('button', { name: 'Submit case for review' }).click();
    await modulePage.getByRole('button', { name: 'Review', exact: true }).click();
    await modulePage.getByRole('button', { name: 'Approve case' }).click();

    await modulePage.getByRole('button', { name: 'Reports', exact: true }).click();
    await modulePage.getByLabel('Report title').fill(reportTitle);
    await modulePage.getByRole('button', { name: 'Create report snapshot' }).click();
    const reportCard = modulePage.locator('article').filter({ has: modulePage.getByRole('heading', { name: reportTitle }) });
    await expect(reportCard).toBeVisible();
    await reportCard.getByRole('button', { name: 'Submit report' }).click();
    await modulePage.getByRole('button', { name: 'Review', exact: true }).click();
    await modulePage.locator('article').filter({ hasText: reportTitle }).getByRole('button', { name: 'Approve report' }).click();
    await modulePage.getByRole('button', { name: 'Reports', exact: true }).click();
    await expect(reportCard.getByRole('button', { name: 'JSON' })).toBeVisible();
    await Promise.all([
      modulePage.waitForEvent('download'),
      reportCard.getByRole('button', { name: 'JSON' }).click(),
    ]);

    await modulePage.getByRole('button', { name: 'Custody', exact: true }).click();
    await expect(modulePage.getByText('Displayed custody links are continuous')).toBeVisible();
    await expect(modulePage.getByText('report approved', { exact: true })).toBeVisible();

    await modulePage.getByRole('button', { name: 'Retention', exact: true }).click();
    await modulePage.getByRole('button', { name: 'Place legal hold' }).click();
    await expect(modulePage.getByRole('button', { name: 'Release legal hold' })).toBeVisible();
    await modulePage.setViewportSize({ width: 390, height: 844 });
    await expect(modulePage.getByRole('navigation', { name: 'SnapProofOS workspace' })).toBeVisible();
    await expect(modulePage.getByRole('button', { name: 'Cases', exact: true })).toBeVisible();

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
    await assertHostOnlySession(modulePage.context(), 'snapproofos.operatoros.net');
    await assertNoBrowserCredentialStorage(modulePage);
    assertNoCredentialQuery(modulePage.url());
  });

  test('Ninja Pool Hall persists profile and real CPU/hot-seat shot trails across deep links and global reauthentication', async ({ page, request }) => {
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

    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('button-launch-ninja-pool-hall').click();
    const modulePage = await popupPromise;
    await expect(modulePage.getByTestId('ninja-pool-hall-shell')).toBeVisible({ timeout: 30_000 });
    await expect(modulePage.getByTestId('ninja-pool-dashboard')).toBeVisible();
    await expect(modulePage.getByText('Online room intentionally disabled')).toBeVisible();
    assertNoCredentialQuery(modulePage.url());

    await modulePage.getByRole('button', { name: 'Profile', exact: true }).click();
    await expect(modulePage).toHaveURL('https://ninja-pool-hall.operatoros.net/profile');
    const displayName = modulePage.getByLabel('Display name');
    await displayName.fill('Phase 10B Table Ninja');
    await Promise.all([
      modulePage.waitForResponse(response => response.request().method() === 'PUT'
        && new URL(response.url()).pathname === '/api/modules/ninja-pool-hall/profile'
        && response.status() === 200),
      modulePage.getByRole('button', { name: 'Save profile' }).click(),
    ]);

    await modulePage.getByRole('button', { name: 'Vs CPU', exact: true }).click();
    await expect(modulePage.getByTestId('ninja-pool-bot-match')).toBeVisible();
    await modulePage.getByTestId('ninja-pool-start-match').click();
    await expect(modulePage).toHaveURL(/^https:\/\/ninja-pool-hall\.operatoros\.net\/matches\/[a-f0-9-]+$/);
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

    await modulePage.getByRole('button', { name: 'Vs CPU', exact: true }).click();
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
    await expect(modulePage.getByRole('navigation', { name: 'Ninja Pool Hall navigation' })).toBeVisible();
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

    await modulePage.goto('https://ninja-pool-hall.operatoros.net/profile');
    await expect(modulePage).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    await modulePage.getByTestId('input-email').fill(identity.email);
    await modulePage.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      modulePage.waitForURL('https://ninja-pool-hall.operatoros.net/profile', { timeout: 30_000 }),
      modulePage.getByTestId('button-login').click(),
    ]);
    await expect(modulePage.getByLabel('Display name')).toHaveValue('Phase 10B Table Ninja');
    await assertHostOnlySession(modulePage.context(), 'ninja-pool-hall.operatoros.net');
    await assertNoBrowserCredentialStorage(modulePage);
    assertNoCredentialQuery(modulePage.url());
  });
});
