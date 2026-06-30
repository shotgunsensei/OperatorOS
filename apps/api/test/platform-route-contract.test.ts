import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

let app: any;

const PROTECTED_PLATFORM_ROUTES: Array<{
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
}> = [
  { method: 'GET', url: '/v1/platform/tenants' },
  { method: 'GET', url: '/v1/platform/tenants/tenant-fixture/detail' },
  { method: 'GET', url: '/v1/platform/stats' },
  { method: 'POST', url: '/v1/platform/tenants' },
  { method: 'PATCH', url: '/v1/platform/tenants/tenant-fixture' },
  { method: 'POST', url: '/v1/platform/tenants/tenant-fixture/suspend' },
  { method: 'POST', url: '/v1/platform/tenants/tenant-fixture/reactivate' },
  { method: 'POST', url: '/v1/platform/tenants/tenant-fixture/archive' },
  { method: 'POST', url: '/v1/platform/tenants/tenant-fixture/restore' },
  { method: 'DELETE', url: '/v1/platform/tenants/tenant-fixture' },
  { method: 'GET', url: '/v1/platform/sso/settings' },
  { method: 'POST', url: '/v1/platform/tenants/tenant-fixture/modules/module-fixture/enable' },
  { method: 'POST', url: '/v1/platform/tenants/tenant-fixture/modules/module-fixture/disable' },
  { method: 'POST', url: '/v1/platform/tenants/tenant-fixture/users/user-fixture/module-access' },
  { method: 'GET', url: '/v1/platform/modules' },
  { method: 'POST', url: '/v1/platform/modules' },
  { method: 'PATCH', url: '/v1/platform/modules/module-fixture' },
  { method: 'GET', url: '/v1/platform/components' },
  { method: 'PATCH', url: '/v1/platform/modules/module-fixture/component' },
  { method: 'POST', url: '/v1/platform/modules/module-fixture/archive' },
  { method: 'GET', url: '/v1/platform/health' },
  { method: 'GET', url: '/v1/platform/plans' },
  { method: 'GET', url: '/v1/platform/pricing' },
  { method: 'POST', url: '/v1/platform/pricing/module-fixture/sync-from-stripe' },
  { method: 'POST', url: '/v1/platform/pricing/module-fixture/create-stripe-price' },
  { method: 'POST', url: '/v1/platform/__test__/stripe-override' },
  { method: 'GET', url: '/v1/platform/audit' },
  { method: 'GET', url: '/v1/platform/billing/events' },
  { method: 'POST', url: '/v1/platform/billing/events/event-fixture/retry' },
  { method: 'GET', url: '/v1/platform/users' },
  { method: 'GET', url: '/v1/platform/users/user-fixture' },
  { method: 'PUT', url: '/v1/platform/users/user-fixture/status' },
  { method: 'PUT', url: '/v1/platform/users/user-fixture/role' },
  { method: 'PUT', url: '/v1/platform/users/user-fixture/platform-role' },
  { method: 'PUT', url: '/v1/platform/users/user-fixture/plan' },
  { method: 'PUT', url: '/v1/platform/users/user-fixture/subscription-status' },
  { method: 'PUT', url: '/v1/platform/users/user-fixture/trial' },
  { method: 'PUT', url: '/v1/platform/users/user-fixture/unlock' },
  { method: 'DELETE', url: '/v1/platform/users/user-fixture' },
  { method: 'DELETE', url: '/v1/platform/users/user-fixture/hard' },
  { method: 'POST', url: '/v1/platform/billing/resync/user-fixture' },
  { method: 'PUT', url: '/v1/platform/modules/module-fixture/addon-price' },
  { method: 'GET', url: '/v1/platform/modules/module-fixture/addon-price-history' },
  { method: 'GET', url: '/v1/platform/modules/module-fixture/stripe-price' },
  { method: 'PUT', url: '/v1/platform/modules/module-fixture/stripe-price-id' },
  { method: 'GET', url: '/v1/platform/modules/module-fixture/members' },
  { method: 'POST', url: '/v1/platform/modules/module-fixture/plan-mapping' },
  { method: 'GET', url: '/v1/platform/users/user-fixture/module-overrides' },
  { method: 'POST', url: '/v1/platform/users/user-fixture/module-overrides' },
  { method: 'DELETE', url: '/v1/platform/users/user-fixture/module-overrides/override-fixture' },
];

before(async () => {
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerPlatformRoutes } = await import('../src/routes/platform-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  await registerPlatformRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

test('backend registers GET /v1/platform/health and not /v1/v1/platform/health', async () => {
  const canonical = await app.inject({
    method: 'GET',
    url: '/v1/platform/health',
  });
  assert.equal(canonical.statusCode, 401);
  assert.equal(canonical.json().code, 'AUTH_REQUIRED');

  const doubled = await app.inject({
    method: 'GET',
    url: '/v1/v1/platform/health',
  });
  assert.equal(doubled.statusCode, 404);
});

test('platform plans route is real and protected under the canonical prefix', async () => {
  const unauth = await app.inject({ method: 'GET', url: '/v1/platform/plans' });
  assert.equal(unauth.statusCode, 401);
  assert.equal(unauth.json().code, 'AUTH_REQUIRED');

  const doubled = await app.inject({
    method: 'GET',
    url: '/v1/v1/platform/plans',
  });
  assert.equal(doubled.statusCode, 404);
});

test('registered Platform Command route surface is protected before any DB contract work', async () => {
  for (const route of PROTECTED_PLATFORM_ROUTES) {
    const res = await app.inject({ method: route.method, url: route.url });
    assert.equal(
      res.statusCode,
      401,
      `${route.method} ${route.url} should be registered and protected by requireSuperAdmin`,
    );
    assert.equal(res.json().code, 'AUTH_REQUIRED', `${route.method} ${route.url} should use AUTH_REQUIRED`);
  }
});
