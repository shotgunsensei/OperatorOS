import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AdminApiError,
  adminApiCall,
  adminApiUrl,
  normalizeAdminPath,
} from '../../web/src/lib/admin-api.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

test('admin API route surface is server-side protected and delegates entitlement mutations centrally', () => {
  const adminRoutes = readRepoFile('apps/api/src/routes/admin-routes.ts');
  const index = readRepoFile('apps/api/src/index.ts');
  const tenantAuth = readRepoFile('apps/api/src/lib/tenant-auth.ts');
  const rootAuth = readRepoFile('packages/auth/index.ts');

  for (const route of [
    '/tenants',
    '/tenants/:tenantId',
    '/tenants/:tenantId/entitlements',
    '/tenants/:tenantId/entitlements/:moduleId',
    '/users',
    '/modules',
    '/audit-logs',
  ]) {
    assert.match(adminRoutes, new RegExp(`\\$\\{prefix\\}${route.replace(/[/:]/g, '\\$&')}`));
  }

  assert.match(index, /import \{ registerAdminRoutes \} from '\.\/routes\/admin-routes\.js'/);
  assert.match(index, /await registerAdminRoutes\(app\)/);
  assert.match(adminRoutes, /preHandler:\s*\[requireSuperAdmin\]/);
  assert.match(adminRoutes, /grantModuleEntitlement/);
  assert.match(adminRoutes, /revokeModuleEntitlement/);
  assert.match(adminRoutes, /registerAuditEnforcement\(app, \{ prefixes: ADMIN_PREFIXES/);
  assert.match(adminRoutes, /tenant_module_entitlement_granted|grantModuleEntitlement/);
  assert.match(adminRoutes, /tenant_module_entitlement_revoked|revokeModuleEntitlement/);

  assert.match(tenantAuth, /if \(!hasPlatformAdminAuthority\(user\)\)/);
  assert.match(tenantAuth, /code: 'PLATFORM_ROLE_REQUIRED'/);
  assert.match(rootAuth, /ROOT_SUPER_ADMIN_EMAIL = 'john@shotgunninjas\.com'/);
  assert.match(rootAuth, /user\?\.platformRole === 'super_admin' \|\| isRootSuperAdmin\(user\)/);
});

test('admin API client uses /api/admin proxy URLs and forwards auth, tenant, credentials, and JSON bodies', async () => {
  assert.equal(normalizeAdminPath('/v1/admin/tenants'), '/admin/tenants');
  assert.equal(normalizeAdminPath('/api/admin/tenants'), '/admin/tenants');
  assert.equal(normalizeAdminPath('/admin/tenants'), '/admin/tenants');
  assert.equal(adminApiUrl('/v1/admin/tenants'), '/api/admin/tenants');

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
    const result = await adminApiCall('/admin/tenants/tenant-fixture/entitlements', {
      method: 'POST',
      body: { moduleId: 'techdeck', allowAllMembers: true },
    });

    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/admin/tenants/tenant-fixture/entitlements');
    assert.equal(calls[0].init?.credentials, 'include');
    assert.equal(calls[0].init?.body, JSON.stringify({ moduleId: 'techdeck', allowAllMembers: true }));

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

test('Platform Command exercises the admin entitlement contract without browser /v1 calls', () => {
  const platformPage = readRepoFile('apps/web/src/components/pages/PlatformPage.tsx');
  const adminHelper = readRepoFile('apps/web/src/lib/admin-api.ts');

  assert.match(platformPage, /from ['"]@\/lib\/admin-api['"]/);
  assert.match(platformPage, /adminApiCall\(`\/admin\/tenants\/\$\{id\}\/entitlements`/);
  assert.match(platformPage, /adminApiCall\(`\/admin\/tenants\/\$\{id\}\/entitlements\/\$\{encodeURIComponent\(slug\)\}`/);
  assert.match(platformPage, /adminApiCall\(`\/admin\/audit-logs\?tenantId=\$\{id\}&limit=100`/);
  assert.doesNotMatch(`${platformPage}\n${adminHelper}`, /\/api\/v1\/admin|adminApiCall\(\s*['"`]\/v1\/admin/);
});

test('admin API errors preserve status, code, body, endpoint, and action', async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: 'No access', code: 'PLATFORM_ROLE_REQUIRED' }), { status: 403 });
    }) as typeof fetch;

    await assert.rejects(
      adminApiCall('/admin/tenants', { action: 'Load tenants' }),
      (err: unknown) => {
        assert.ok(err instanceof AdminApiError);
        assert.equal(err.status, 403);
        assert.equal(err.code, 'PLATFORM_ROLE_REQUIRED');
        assert.equal(err.endpoint, '/api/admin/tenants');
        assert.equal(err.action, 'Load tenants');
        assert.equal(err.message, 'No access');
        return true;
      },
    );

    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    await assert.rejects(
      adminApiCall('/admin/audit-logs'),
      (err: unknown) => {
        assert.ok(err instanceof AdminApiError);
        assert.equal(err.status, 0);
        assert.equal(err.code, 'NETWORK_ERROR');
        assert.equal(err.endpoint, '/api/admin/audit-logs');
        assert.equal(err.action, 'GET /admin/audit-logs');
        return true;
      },
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
