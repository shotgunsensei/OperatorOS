import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPERATOROS_MODULE_REGISTRY,
  getModuleById,
} from '../../../packages/modules/registry.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

test('SSO contract v1 registry uses exact HTTPS callbacks without wildcards or localhost', () => {
  const registry = JSON.parse(read('config/operatoros-module-registry.json')) as Array<any>;
  assert.deepEqual(
    registry.map(row => row.moduleId).sort(),
    OPERATOROS_MODULE_REGISTRY.map(row => row.id).sort(),
    'deployment and runtime registries must contain the exact same modules',
  );

  for (const row of registry) {
    assert.equal(row.contractVersion, 'v1');
    const runtime = getModuleById(row.moduleId);
    assert.ok(runtime, `runtime registry missing ${row.moduleId}`);
    assert.equal(
      row.enabled,
      runtime.status === 'active',
      `${row.moduleId} enabled flag must match runtime availability`,
    );
    assert.ok(row.exactRedirectUris.length > 0);
    for (const uri of [...row.exactRedirectUris, ...row.exactLogoutUris, ...row.exactAllowedOrigins]) {
      assert.match(uri, /^https:\/\//);
      assert.doesNotMatch(uri, /\*|localhost|127\.0\.0\.1/i);
    }
  }
});

test('machine-readable deployment registry matches the runtime registry', () => {
  const registry = JSON.parse(read('config/operatoros-module-registry.json')) as Array<any>;
  for (const row of registry) {
    const runtime = getModuleById(row.moduleId);
    assert.ok(runtime, `runtime registry missing ${row.moduleId}`);
    assert.equal(runtime.clientId, row.clientId);
    assert.equal(runtime.productionBaseUrl, row.productionBaseUrl);
    assert.equal(runtime.entitlementKey, row.entitlementKey);
    assert.equal(runtime.callbackPath, row.callbackPath);
    assert.equal(runtime.launchPath, row.launchPath);
    assert.deepEqual(runtime.exactRedirectUris, row.exactRedirectUris);
    assert.deepEqual(runtime.exactLogoutUris, row.exactLogoutUris);
    assert.deepEqual(runtime.exactAllowedOrigins, row.exactAllowedOrigins);
  }
});

test('SSO client groups cover every deployment client exactly once', () => {
  const registry = JSON.parse(read('config/operatoros-module-registry.json')) as Array<any>;
  const contract = JSON.parse(read('config/operatoros-sso-contract.json')) as Record<string, unknown>;
  const groups = ['platformClients', 'coreClients', 'freeClients', 'addonClients', 'plannedClients']
    .flatMap(key => Array.isArray(contract[key]) ? contract[key] as string[] : []);

  assert.deepEqual(contract.platformClients, ['operatoros:web']);
  assert.deepEqual(contract.coreClients, [
    'operatoros:tradeflowkit',
    'operatoros:techdeck',
    'operatoros:pulsedesk',
  ]);

  assert.equal(new Set(groups).size, groups.length, 'SSO client groups must not overlap');
  assert.deepEqual(
    [...groups].sort(),
    registry.map(row => row.clientId).sort(),
    'SSO client groups must cover the deployment registry exactly',
  );
});

test('browser clients use cookies and never persist or attach the session JWT', () => {
  const browserSources = [
    'apps/web/src/components/AuthProvider.tsx',
    'apps/web/src/components/pages/SettingsPage.tsx',
    'apps/web/src/lib/auth.ts',
    'apps/web/src/lib/admin-api.ts',
    'apps/web/src/lib/platform-api.ts',
    'apps/web/src/lib/module-launch.ts',
  ].map(read).join('\n');

  assert.doesNotMatch(browserSources, /localStorage\.(?:getItem|setItem)\(['"]token['"]/);
  assert.doesNotMatch(browserSources, /Authorization[^\n]*Bearer/);
  assert.match(browserSources, /credentials:\s*['"]include['"]/);
});

test('imported standalone adapters remain code-only rollback references', () => {
  const adapters = [
    read('apps/modules/pulsedesk/source/server/routes/sso.ts'),
    read('apps/modules/techdeck/source/server/auth/sso.ts'),
    read('apps/modules/tradeflowkit/source/server/routes/sso.ts'),
  ];

  for (const adapter of adapters) {
    assert.match(adapter, /code/);
    assert.match(adapter, /session\.regenerate/);
    assert.doesNotMatch(adapter, /req\.query\.token/);
  }
});

test('unified runtime owns the browser callback and host-only session exchange', () => {
  const callback = read('apps/web/src/app/sso/page.tsx');
  const route = read('apps/api/src/routes/sso-routes.ts');
  const middleware = read('apps/web/src/middleware.ts');

  assert.match(callback, /\/api\/sso\/browser-exchange/);
  assert.match(callback, /window\.history\.replaceState/);
  assert.match(route, /sso\/browser-exchange/);
  assert.match(route, /SSO_VERIFIER_COOKIE_NAME/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /consumed_at IS NULL/);
  assert.match(middleware, /code_challenge_method/);
  assert.match(middleware, /SSO_TRANSACTION_MAX_AGE_SECONDS/);
  assert.doesNotMatch(read('packages/sso/index.ts'), /\/sso\?token=/);
  assert.doesNotMatch(read('apps/api/src/routes/platform-routes.ts'), /\/sso\?token=/);
});

test('host session cookie is host-only and authorization responses are no-store', () => {
  const auth = read('packages/auth/index.ts');
  const authRoutes = read('apps/api/src/routes/auth-routes.ts');
  const middleware = read('apps/web/src/middleware.ts');

  assert.match(auth, /SESSION_COOKIE_NAME = 'operatoros_session'/);
  assert.doesNotMatch(auth, /domain:\s*['"]\.operatoros\.net/);
  assert.match(authRoutes, /Cache-Control', 'no-store/);
  assert.match(middleware, /Referrer-Policy', 'no-referrer/);
});

test('global logout revokes all host sessions through token-version rotation', () => {
  const authRoutes = read('apps/api/src/routes/auth-routes.ts');

  assert.match(authRoutes, /\/v1\/auth\/logout-all/);
  assert.match(authRoutes, /\/api\/auth\/logout-all/);
  assert.match(authRoutes, /tokenVersion:\s*sql`token_version \+ 1`/);
  assert.match(authRoutes, /logout_all/);
  assert.match(authRoutes, /revokedAllSessions:\s*true/);
});
