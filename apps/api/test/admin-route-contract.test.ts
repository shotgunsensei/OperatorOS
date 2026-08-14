import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

let app: any;

const PROTECTED_ADMIN_ROUTES: Array<{
  method: 'GET' | 'POST' | 'DELETE';
  url: string;
}> = [
  { method: 'GET', url: '/v1/admin/tenants' },
  { method: 'GET', url: '/v1/admin/tenants/tenant-fixture' },
  { method: 'GET', url: '/v1/admin/tenants/tenant-fixture/entitlements' },
  { method: 'POST', url: '/v1/admin/tenants/tenant-fixture/entitlements' },
  { method: 'DELETE', url: '/v1/admin/tenants/tenant-fixture/entitlements/techdeck' },
  { method: 'GET', url: '/v1/admin/users' },
  { method: 'GET', url: '/v1/admin/modules' },
  { method: 'GET', url: '/v1/admin/audit-logs' },
  { method: 'GET', url: '/api/admin/tenants' },
  { method: 'POST', url: '/api/admin/tenants/tenant-fixture/entitlements' },
  { method: 'DELETE', url: '/api/admin/tenants/tenant-fixture/entitlements/techdeck' },
  { method: 'GET', url: '/api/admin/audit-logs' },
];

before(async () => {
  process.env.SESSION_SECRET ||= 'admin-route-contract-test-secret';
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerAdminRoutes } = await import('../src/routes/admin-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  await registerAdminRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

test('registered admin route surface is protected before tenant, entitlement, or audit DB work', async () => {
  for (const route of PROTECTED_ADMIN_ROUTES) {
    const res = await app.inject({ method: route.method, url: route.url });
    assert.equal(
      res.statusCode,
      401,
      `${route.method} ${route.url} should be registered and protected by requireSuperAdmin`,
    );
    assert.equal(res.json().code, 'AUTH_REQUIRED', `${route.method} ${route.url} should use AUTH_REQUIRED`);
  }
});

test('admin routes use the canonical prefix and avoid accidental /v1/v1 aliases', async () => {
  const canonical = await app.inject({ method: 'GET', url: '/v1/admin/tenants' });
  assert.equal(canonical.statusCode, 401);
  assert.equal(canonical.json().code, 'AUTH_REQUIRED');

  const doubled = await app.inject({ method: 'GET', url: '/v1/v1/admin/tenants' });
  assert.equal(doubled.statusCode, 404);
});
