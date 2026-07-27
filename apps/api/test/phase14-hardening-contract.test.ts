import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('API and web responses apply the shared production security header baseline', () => {
  const api = read('apps/api/src/index.ts');
  const web = read('apps/web/next.config.js');

  for (const header of [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Strict-Transport-Security',
  ]) {
    assert.match(api, new RegExp(header), `API is missing ${header}`);
    assert.match(web, new RegExp(header), `web is missing ${header}`);
  }
  assert.match(web, /frame-ancestors 'none'/);
  assert.match(web, /object-src 'none'/);
});

test('database connections are bounded, configurable, and closed during graceful shutdown', () => {
  const database = read('apps/api/src/db.ts');
  const api = read('apps/api/src/index.ts');

  assert.match(database, /DATABASE_POOL_MAX/);
  assert.match(database, /DATABASE_POOL_IDLE_TIMEOUT_MS/);
  assert.match(database, /DATABASE_POOL_CONNECTION_TIMEOUT_MS/);
  assert.match(database, /new Pool\(/);
  assert.match(database, /closeDatabasePool/);
  assert.match(api, /await closeDatabasePool\(\)/);
});

test('database pool configuration rejects invalid and excessive values', async () => {
  const { resolveDatabasePoolConfig } = await import('../src/db.js');
  assert.deepEqual(
    {
      max: resolveDatabasePoolConfig({}).max,
      idle: resolveDatabasePoolConfig({}).idleTimeoutMillis,
      connect: resolveDatabasePoolConfig({}).connectionTimeoutMillis,
    },
    { max: 10, idle: 30_000, connect: 10_000 },
  );
  assert.throws(
    () => resolveDatabasePoolConfig({ DATABASE_POOL_MAX: '51' }),
    /DATABASE_POOL_MAX must be an integer between 1 and 50/,
  );
  assert.throws(
    () => resolveDatabasePoolConfig({ DATABASE_POOL_IDLE_TIMEOUT_MS: 'not-a-number' }),
    /DATABASE_POOL_IDLE_TIMEOUT_MS must be an integer/,
  );
});

test('Phase 14 records threat coverage for the platform and every registered module', () => {
  for (const path of [
    'docs/security/OPERATOROS_PLATFORM_THREAT_MODEL.md',
    'docs/modules/tradeflowkit/THREAT_MODEL.md',
    'docs/modules/faultlinelab/THREAT_MODEL.md',
    'docs/modules/ninja-launch-kit/THREAT_MODEL.md',
    'docs/modules/callcommand-ai/THREAT_MODEL.md',
    'docs/modules/ninjamation/THREAT_MODEL.md',
    'docs/modules/outcall/THREAT_MODEL.md',
  ]) {
    assert.ok(read(path).length > 500, path);
  }
});

test('load baseline is loopback-only and covers critical public and authenticated boundaries', () => {
  const load = read('scripts/phase14-load-baseline.mjs');
  assert.match(load, /remote and production hosts are refused/);
  for (const scenario of [
    'liveness',
    'readiness',
    'stripe-webhook-signature-boundary',
    'authenticated-session',
    'entitled-launcher',
    'upload-authorization-and-validation-boundary',
  ]) {
    assert.match(load, new RegExp(scenario));
  }
});

test('disabled payment infrastructure fails closed instead of acknowledging a webhook', () => {
  const billingRoutes = read('apps/api/src/routes/billing-routes.ts');
  assert.match(billingRoutes, /reply\.code\(503\).*STRIPE_NOT_CONFIGURED/s);
  assert.doesNotMatch(billingRoutes, /received: true, mode: 'local'/);
});

test('security and billing console logs exclude replay and provider identifiers', () => {
  const ssoRoutes = read('apps/api/src/routes/sso-routes.ts');
  const moduleRoutes = read('apps/api/src/routes/module-routes.ts');
  const billingRoutes = read('apps/api/src/routes/billing-routes.ts');
  const billingService = read('apps/api/src/lib/billing-service.ts');

  assert.match(ssoRoutes, /'jti'/);
  assert.match(moduleRoutes, /'jti'/);
  assert.doesNotMatch(billingRoutes, /event\.id=\$\{/);
  assert.doesNotMatch(billingService, /user=\$\{userId\}|stripe_sub=\$\{stripeSubId\}/);
  assert.match(billingRoutes, /code: 'WEBHOOK_REJECTED'/);
});
