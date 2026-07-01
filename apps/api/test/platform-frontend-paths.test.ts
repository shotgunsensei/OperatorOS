import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PlatformApiError,
  normalizePlatformPath,
  platformApiCall,
  platformApiUrl,
} from '../../web/src/lib/platform-api.ts';
import {
  PLATFORM_COMMAND_BASE,
  pathToPlatformView,
  platformViewToPath,
} from '../../web/src/lib/platform-routes.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

type FrontendContract = {
  name: string;
  frontend: string | RegExp;
  backend: string | string[];
};

const PLATFORM_PAGE_CONTRACTS: FrontendContract[] = [
  { name: 'SSO settings', frontend: '/platform/sso/settings', backend: '/v1/platform/sso/settings' },
  { name: 'overview stats', frontend: '/platform/stats', backend: '/v1/platform/stats' },
  { name: 'health', frontend: '/platform/health', backend: '/v1/platform/health' },
  { name: 'audit', frontend: '/platform/audit?', backend: '/v1/platform/audit' },
  { name: 'tenant list', frontend: '/platform/tenants?', backend: '/v1/platform/tenants' },
  { name: 'tenant create', frontend: '/platform/tenants', backend: '/v1/platform/tenants' },
  { name: 'tenant detail', frontend: '/platform/tenants/${id}/detail', backend: '/v1/platform/tenants/:id/detail' },
  {
    name: 'tenant lifecycle',
    frontend: '/platform/tenants/${id}/${action}',
    backend: [
      '/v1/platform/tenants/:id/suspend',
      '/v1/platform/tenants/:id/reactivate',
      '/v1/platform/tenants/:id/archive',
    ],
  },
  { name: 'tenant restore', frontend: '/platform/tenants/${t.id}/restore', backend: '/v1/platform/tenants/:id/restore' },
  { name: 'tenant patch', frontend: '/platform/tenants/${tenant.id}', backend: '/v1/platform/tenants/:id' },
  { name: 'tenant delete', frontend: '/platform/tenants/${id}?confirm=', backend: '/v1/platform/tenants/:id' },
  { name: 'tenant user module access', frontend: '/platform/tenants/${id}/users/${userId}/module-access', backend: '/v1/platform/tenants/:id/users/:userId/module-access' },
  { name: 'module list', frontend: '/platform/modules?includeArchived=1', backend: '/v1/platform/modules' },
  { name: 'module create', frontend: '/platform/modules', backend: '/v1/platform/modules' },
  { name: 'module patch', frontend: '/platform/modules/${m.slug}', backend: '/v1/platform/modules/:slug' },
  { name: 'component list', frontend: '/platform/components', backend: '/v1/platform/components' },
  { name: 'module component patch', frontend: '/platform/modules/${m.slug}/component', backend: '/v1/platform/modules/:slug/component' },
  { name: 'module archive', frontend: '/platform/modules/${slug}/archive', backend: '/v1/platform/modules/:slug/archive' },
  { name: 'plan list', frontend: '/platform/plans', backend: '/v1/platform/plans' },
  { name: 'module plan mapping', frontend: '/platform/modules/${moduleSlug}/plan-mapping', backend: '/v1/platform/modules/:slug/plan-mapping' },
  { name: 'pricing list', frontend: '/platform/pricing', backend: '/v1/platform/pricing' },
  { name: 'pricing stripe sync', frontend: '/platform/pricing/${encodeURIComponent(slug)}/sync-from-stripe', backend: '/v1/platform/pricing/:slug/sync-from-stripe' },
  { name: 'pricing stripe create', frontend: '/platform/pricing/${encodeURIComponent(slug)}/create-stripe-price', backend: '/v1/platform/pricing/:slug/create-stripe-price' },
  { name: 'addon price read', frontend: '/platform/modules/${m.slug}/stripe-price', backend: '/v1/platform/modules/:slug/stripe-price' },
  { name: 'addon price update', frontend: '/platform/modules/${m.slug}/addon-price', backend: '/v1/platform/modules/:slug/addon-price' },
  { name: 'addon price history', frontend: '/platform/modules/${m.slug}/addon-price-history', backend: '/v1/platform/modules/:slug/addon-price-history' },
  { name: 'addon stripe price id update', frontend: '/platform/modules/${m.slug}/stripe-price-id', backend: '/v1/platform/modules/:slug/stripe-price-id' },
  { name: 'module members', frontend: '/platform/modules/${moduleSlug}/members', backend: '/v1/platform/modules/:slug/members' },
  { name: 'billing event list', frontend: '/platform/billing/events', backend: '/v1/platform/billing/events' },
  { name: 'billing event retry', frontend: '/platform/billing/events/${id}/retry', backend: '/v1/platform/billing/events/:id/retry' },
  { name: 'user list', frontend: '/platform/users?', backend: '/v1/platform/users' },
  { name: 'user detail', frontend: '/platform/users/${id}', backend: '/v1/platform/users/:id' },
  { name: 'user status', frontend: '/platform/users/${id}/status', backend: '/v1/platform/users/:id/status' },
  { name: 'user role', frontend: '/platform/users/${id}/role', backend: '/v1/platform/users/:id/role' },
  { name: 'user platform role', frontend: '/platform/users/${id}/platform-role', backend: '/v1/platform/users/:id/platform-role' },
  { name: 'user plan', frontend: '/platform/users/${id}/plan', backend: '/v1/platform/users/:id/plan' },
  { name: 'user subscription status', frontend: '/platform/users/${id}/subscription-status', backend: '/v1/platform/users/:id/subscription-status' },
  { name: 'user trial', frontend: '/platform/users/${id}/trial', backend: '/v1/platform/users/:id/trial' },
  { name: 'user unlock', frontend: '/platform/users/${id}/unlock', backend: '/v1/platform/users/:id/unlock' },
  { name: 'user hard delete', frontend: '/platform/users/${id}/hard', backend: '/v1/platform/users/:id/hard' },
  { name: 'billing resync', frontend: '/platform/billing/resync/${id}', backend: '/v1/platform/billing/resync/:userId' },
  { name: 'module override list', frontend: '/platform/users/${userId}/module-overrides', backend: '/v1/platform/users/:id/module-overrides' },
  { name: 'module override create', frontend: '/platform/users/${userId}/module-overrides', backend: '/v1/platform/users/:id/module-overrides' },
  { name: 'module override delete', frontend: '/platform/users/${userId}/module-overrides/${overrideId}', backend: '/v1/platform/users/:id/module-overrides/:overrideId' },
];

const ADMIN_PAGE_CONTRACTS: FrontendContract[] = [
  { name: 'tenant entitlement grant', frontend: '/admin/tenants/${id}/entitlements', backend: '${prefix}/tenants/:tenantId/entitlements' },
  { name: 'tenant entitlement revoke', frontend: '/admin/tenants/${id}/entitlements/${encodeURIComponent(slug)}', backend: '${prefix}/tenants/:tenantId/entitlements/:moduleId' },
  { name: 'tenant audit log', frontend: '/admin/audit-logs?tenantId=${id}&limit=100', backend: '${prefix}/audit-logs' },
];

function hasFrontendNeedle(source: string, needle: string | RegExp): boolean {
  return typeof needle === 'string' ? source.includes(needle) : needle.test(source);
}

test('platform API helper normalizes legacy and proxy-prefixed inputs', () => {
  assert.equal(normalizePlatformPath('/v1/platform/health'), '/platform/health');
  assert.equal(normalizePlatformPath('/platform/health'), '/platform/health');
  assert.equal(normalizePlatformPath('platform/health'), '/platform/health');
  assert.equal(normalizePlatformPath('/api/platform/health'), '/platform/health');
  assert.equal(platformApiUrl('/v1/platform/health'), '/api/platform/health');
  assert.equal(platformApiUrl('/api/platform/health'), '/api/platform/health');
});

test('Platform route parsing emits canonical /app/platform paths, including SSO', () => {
  assert.equal(PLATFORM_COMMAND_BASE, '/app/platform');
  assert.deepEqual(pathToPlatformView(undefined), { kind: 'dashboard' });
  assert.deepEqual(pathToPlatformView([]), { kind: 'dashboard' });
  assert.deepEqual(pathToPlatformView(['tenants']), { kind: 'tenants' });
  assert.deepEqual(pathToPlatformView(['tenants', 'tenant-id']), { kind: 'tenant', id: 'tenant-id' });
  assert.deepEqual(pathToPlatformView(['modules']), { kind: 'modules' });
  assert.deepEqual(pathToPlatformView(['modules', 'module-slug']), { kind: 'module', slug: 'module-slug' });
  assert.deepEqual(pathToPlatformView(['users']), { kind: 'users' });
  assert.deepEqual(pathToPlatformView(['users', 'user-id']), { kind: 'user', id: 'user-id' });
  assert.deepEqual(pathToPlatformView(['billing']), { kind: 'billing' });
  assert.deepEqual(pathToPlatformView(['pricing']), { kind: 'pricing' });
  assert.deepEqual(pathToPlatformView(['health']), { kind: 'health' });
  assert.deepEqual(pathToPlatformView(['audit']), { kind: 'audit' });
  assert.deepEqual(pathToPlatformView(['sso']), { kind: 'sso' });

  assert.equal(platformViewToPath({ kind: 'dashboard' }), '/app/platform');
  assert.equal(platformViewToPath({ kind: 'tenants' }), '/app/platform/tenants');
  assert.equal(platformViewToPath({ kind: 'tenant', id: 'tenant-id' }), '/app/platform/tenants/tenant-id');
  assert.equal(platformViewToPath({ kind: 'modules' }), '/app/platform/modules');
  assert.equal(platformViewToPath({ kind: 'module', slug: 'module-slug' }), '/app/platform/modules/module-slug');
  assert.equal(platformViewToPath({ kind: 'users' }), '/app/platform/users');
  assert.equal(platformViewToPath({ kind: 'user', id: 'user-id' }), '/app/platform/users/user-id');
  assert.equal(platformViewToPath({ kind: 'billing' }), '/app/platform/billing');
  assert.equal(platformViewToPath({ kind: 'pricing' }), '/app/platform/pricing');
  assert.equal(platformViewToPath({ kind: 'health' }), '/app/platform/health');
  assert.equal(platformViewToPath({ kind: 'audit' }), '/app/platform/audit');
  assert.equal(platformViewToPath({ kind: 'sso' }), '/app/platform/sso');
});

test('platformApiCall sends normalized proxy URL with auth, tenant, credentials, and JSON body', async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = (globalThis as any).window;
  const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];

  (globalThis as any).window = {
    localStorage: {
      getItem(key: string) {
        if (key === 'token') return 'jwt-fixture';
        if (key === 'activeTenantId') return 'tenant-fixture';
        return null;
      },
    },
  };
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await platformApiCall('/v1/platform/health', {
      method: 'POST',
      body: { probe: true },
    });

    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/platform/health');
    assert.equal(calls[0].init?.credentials, 'include');
    assert.equal(calls[0].init?.body, JSON.stringify({ probe: true }));

    const headers = calls[0].init?.headers as Headers;
    assert.equal(headers.get('Authorization'), 'Bearer jwt-fixture');
    assert.equal(headers.get('X-Tenant-Id'), 'tenant-fixture');
    assert.equal(headers.get('Content-Type'), 'application/json');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = previousWindow;
  }
});

test('platformApiCall surfaces text, JSON, endpoint, action, and network failures', async () => {
  const previousFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async () => {
      return new Response('upstream unavailable', { status: 503, statusText: 'Service Unavailable' });
    }) as typeof fetch;
    await assert.rejects(
      platformApiCall('/platform/health'),
      (err: unknown) => {
        assert.ok(err instanceof PlatformApiError);
        assert.equal(err.status, 503);
        assert.equal(err.code, undefined);
        assert.equal(err.body, 'upstream unavailable');
        assert.equal(err.endpoint, '/api/platform/health');
        assert.equal(err.action, 'GET /platform/health');
        assert.equal(err.message, 'Service Unavailable');
        return true;
      },
    );

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: 'No access', code: 'PLATFORM_ROLE_REQUIRED' }), { status: 403 });
    }) as typeof fetch;
    await assert.rejects(
      platformApiCall('/platform/users', { action: 'Load platform users' }),
      (err: unknown) => {
        assert.ok(err instanceof PlatformApiError);
        assert.equal(err.status, 403);
        assert.equal(err.code, 'PLATFORM_ROLE_REQUIRED');
        assert.equal(err.endpoint, '/api/platform/users');
        assert.equal(err.action, 'Load platform users');
        assert.equal(err.message, 'No access');
        return true;
      },
    );

    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await assert.rejects(
      platformApiCall('/platform/pricing'),
      (err: unknown) => {
        assert.ok(err instanceof PlatformApiError);
        assert.equal(err.status, 0);
        assert.equal(err.code, 'NETWORK_ERROR');
        assert.equal(err.endpoint, '/api/platform/pricing');
        assert.equal(err.action, 'GET /platform/pricing');
        assert.equal(err.message, 'Failed to fetch');
        return true;
      },
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('Platform Command and admin health source do not call /v1/platform from the browser', () => {
  const platformPage = readRepoFile('apps/web/src/components/pages/PlatformPage.tsx');
  const adminHealth = readRepoFile('apps/web/src/app/admin/health/page.tsx');
  const platformRoute = readRepoFile('apps/web/src/app/platform/[[...slug]]/page.tsx');
  const canonicalRoute = readRepoFile('apps/web/src/app/app/platform/[[...slug]]/page.tsx');
  const browserSources = `${platformPage}\n${adminHealth}\n${platformRoute}\n${canonicalRoute}`;

  assert.doesNotMatch(browserSources, /(?:apiCall|platformApiCall)\(\s*['"`]\/v1\/platform/);
  assert.doesNotMatch(browserSources, /apiCall\(\s*`\/v1\/platform/);
  assert.doesNotMatch(browserSources, /\/api\/v1\/platform/);
  assert.match(platformPage, /from ['"]@\/lib\/platform-api['"]/);
  assert.match(adminHealth, /platformApiCall<HealthResponse>\('\/platform\/health'\)/);
  assert.doesNotMatch(platformPage, /async function apiCall|const API\s*=/);
  assert.doesNotMatch(adminHealth, /async function apiCall|const API\s*=/);
});

test('canonical Platform route, legacy redirects, and middleware auth gate stay wired', () => {
  const nextConfig = readRepoFile('apps/web/next.config.js');
  const middleware = readRepoFile('apps/web/src/middleware.ts');
  const platformRoute = readRepoFile('apps/web/src/app/platform/[[...slug]]/page.tsx');
  const canonicalRoute = readRepoFile('apps/web/src/app/app/platform/[[...slug]]/page.tsx');

  assert.match(nextConfig, /source:\s*'\/platform'/);
  assert.match(nextConfig, /destination:\s*'\/app\/platform'/);
  assert.match(nextConfig, /source:\s*'\/platform\/:path\*'/);
  assert.match(nextConfig, /destination:\s*'\/app\/platform\/:path\*'/);
  assert.match(platformRoute, /platformViewToPath/);
  assert.match(canonicalRoute, /export \{ default \} from '..\/..\/..\/platform\/\[\[\.\.\.slug\]\]\/page'/);
  assert.match(middleware, /url\.pathname = '\/login'/);
  assert.match(middleware, /next=\$\{encodeURIComponent\(target\)\}/);
  assert.match(middleware, /matcher:\s*\[[\s\S]*'\/app\/:path\*'/);
});

test('Platform Command frontend calls have registered backend route contracts', () => {
  const platformPage = readRepoFile('apps/web/src/components/pages/PlatformPage.tsx');
  const platformRoutes = readRepoFile('apps/api/src/routes/platform-routes.ts');
  const adminRoutes = readRepoFile('apps/api/src/routes/admin-routes.ts');

  for (const contract of PLATFORM_PAGE_CONTRACTS) {
    assert.ok(
      hasFrontendNeedle(platformPage, contract.frontend),
      `${contract.name} frontend call was not found`,
    );
    for (const backend of Array.isArray(contract.backend) ? contract.backend : [contract.backend]) {
      assert.ok(
        platformRoutes.includes(backend),
        `${contract.name} backend route ${backend} was not found`,
      );
    }
  }

  for (const contract of ADMIN_PAGE_CONTRACTS) {
    assert.ok(
      hasFrontendNeedle(platformPage, contract.frontend),
      `${contract.name} frontend call was not found`,
    );
    for (const backend of Array.isArray(contract.backend) ? contract.backend : [contract.backend]) {
      assert.ok(
        adminRoutes.includes(backend),
        `${contract.name} backend route ${backend} was not found`,
      );
    }
  }

  assert.doesNotMatch(platformPage, /<option value="free">free<\/option>/);
  assert.match(platformPage, /select-change-platform-role/);
});

test('Platform Command auth, last-admin, and failure-logging invariants stay wired', () => {
  const platformRoutes = readRepoFile('apps/api/src/routes/platform-routes.ts');
  const tenantAuth = readRepoFile('apps/api/src/lib/tenant-auth.ts');
  const auth = readRepoFile('apps/api/src/lib/auth.ts');
  const webAuth = readRepoFile('apps/web/src/lib/auth.ts');
  const authProvider = readRepoFile('apps/web/src/components/AuthProvider.tsx');
  const audit = readRepoFile('apps/api/src/lib/audit.ts');

  assert.match(tenantAuth, /await authenticate\(request, reply\);[\s\S]*hasPlatformAdminAuthority\(user\)/);
  assert.match(tenantAuth, /code: 'PLATFORM_ROLE_REQUIRED'/);
  assert.match(auth, /const authHeader = request\.headers\.authorization/);
  assert.match(auth, /const cookieToken = \(request as any\)\.cookies\?\.token/);
  assert.match(auth, /authHeader\?\.startsWith\('Bearer '\) \? authHeader\.slice\(7\) : cookieToken/);
  assert.match(auth, /case 'suspended':[\s\S]*code: 'ACCOUNT_SUSPENDED'/);
  assert.match(auth, /case 'deleted':[\s\S]*code: 'ACCOUNT_DELETED'/);
  assert.match(auth, /case 'pending':[\s\S]*code: 'ACCOUNT_PENDING'/);
  assert.match(webAuth, /localStorage\.getItem\('token'\)/);
  assert.match(webAuth, /headers\['Authorization'\] = `Bearer \$\{token\}`/);
  assert.match(webAuth, /credentials: 'include'/);
  assert.match(webAuth, /me: \(\) => apiFetch\('\/auth\/me'\)/);
  assert.match(authProvider, /const \{ user \} = await authApi\.me\(\)/);
  assert.match(authProvider, /localStorage\.removeItem\('token'\)/);
  assert.match(authProvider, /localStorage\.setItem\('token', data\.token\)/);
  assert.match(authProvider, /setActiveTenantId\(data\.user\?\.currentTenantId \?\? null\)/);

  assert.match(platformRoutes, /registerPlatformFailureLogging\(app, \{ prefixes: \['\/v1\/platform\/'\] \}\)/);
  assert.match(audit, /platform_command_failure/);
  assert.match(audit, /actorUserId: request\.user\?\.id \?\? null/);
  assert.doesNotMatch(audit, /request\.body|authorization|request\.headers/);

  assert.match(platformRoutes, /function lastPlatformSuperAdmin/);
  assert.match(platformRoutes, /code: 'LAST_SUPER_ADMIN'/);
  assert.match(platformRoutes, /\/v1\/platform\/users\/:id\/platform-role/);
  assert.match(platformRoutes, /user_platform_role_changed/);
});
