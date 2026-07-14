import { test, expect, type APIRequestContext, type BrowserContext, type Page, type Request } from '@playwright/test';
import { Client } from 'pg';

const ROOT = process.env.E2E_ROOT_URL || 'https://operatoros.net';
const API = process.env.E2E_API_URL || 'http://127.0.0.1:5001';
const PASSWORD = 'OperatorOS-E2E-Only-94!';

const CORE_MODULES = [
  {
    slug: 'tradeflowkit',
    host: 'tradeflowkit.operatoros.net',
    shellTestId: 'tradeflowkit-module-shell',
  },
  {
    slug: 'techdeck',
    host: 'techdeck.operatoros.net',
    shellTestId: 'techdeck-module-shell',
  },
  {
    slug: 'pulsedesk',
    host: 'pulsedesk.operatoros.net',
    shellTestId: 'pulsedesk-module-shell',
  },
] as const;

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

  for (const module of CORE_MODULES) {
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
    'pulsedesk_request_events',
    'pulsedesk_requests',
    'pulsedesk_departments',
    'pulsedesk_request_sequences',
    'techdeck_tickets',
    'techdeck_ticket_sequences',
    'tradeflowkit_leads',
    'ninja_pool_practice_sessions',
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
  for (const table of tenantTables) {
    try { await pg.query(`delete from ${table} where tenant_id = $1`, [tenantId]); } catch {}
  }
  for (const [sql, params] of [
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
  let identity: SeededIdentity | null = null;

  test.beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for the SSO v1 browser gate');
    pg = new Client({ connectionString: databaseUrl });
    await pg.connect();
  });

  test.afterAll(async () => {
    if (!pg) return;
    await cleanupIdentity(pg, identity).catch(() => undefined);
    await pg.end().catch(() => undefined);
  });

  test('one credential entry establishes root then silently launches every core module', async ({ page, request }) => {
    if (!pg) throw new Error('SSO v1 browser database client was not initialized');
    identity = await registerAndSeed(request, pg);
    const context = page.context();
    let loginPosts = 0;
    context.on('request', req => {
      if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/auth/login') loginPosts += 1;
    });

    await page.goto(`${ROOT}/app`);
    await expect(page).toHaveURL(/^https:\/\/auth\.operatoros\.net\/login\?/);
    const authorizationUrl = new URL(page.url());
    expect(authorizationUrl.searchParams.get('client_id')).toBe('operatoros:web');
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe('https://operatoros.net/sso');
    expect(authorizationUrl.searchParams.get('next')).toBe('https://operatoros.net/app');
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizationUrl.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(authorizationUrl.searchParams.get('nonce')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(authorizationUrl.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    assertNoCredentialQuery(page.url());

    await page.getByTestId('input-email').fill(identity.email);
    await page.getByTestId('input-password').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(/^https:\/\/operatoros\.net\/app(?:[?#].*)?$/, { timeout: 30_000 }),
      page.getByTestId('button-login').click(),
    ]);
    expect(loginPosts).toBe(1);
    assertNoCredentialQuery(page.url());
    await assertHostOnlySession(context, 'auth.operatoros.net');
    await assertHostOnlySession(context, 'operatoros.net');
    await assertNoBrowserCredentialStorage(page);

    await page.getByTestId('nav-my-apps').click();
    await expect(page.getByTestId('page-my-apps')).toBeVisible();

    let lastModulePage: Page | null = null;
    for (const [index, module] of CORE_MODULES.entries()) {
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

      if (index < CORE_MODULES.length - 1) {
        await modulePage.close();
      } else {
        lastModulePage = modulePage;
      }
    }

    const expectedSessionHosts = new Set([
      'auth.operatoros.net',
      'operatoros.net',
      ...CORE_MODULES.map(module => module.host),
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
});
