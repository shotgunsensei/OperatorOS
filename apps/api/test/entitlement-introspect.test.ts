/**
 * Task #108 — GET /v1/sso/entitlements/introspect service-token auth.
 *
 *   - missing token       -> 401 SERVICE_TOKEN_REQUIRED
 *   - wrong token         -> 401 SERVICE_TOKEN_INVALID
 *   - valid token         -> 200 + canonical snapshot
 *   - missing query params -> 400 INTROSPECT_PARAMS_REQUIRED
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { tenants, tenantUsers } from '../src/schema.js';
import { ensureSchemaReady, createTestUser, cleanupUser } from './_setup.js';

let app: any, owner: any, tenant: any;
const TOKEN = 'svc-token-test-1234567890abcdef';
const PREV_TOKEN = process.env.OPERATOROS_SERVICE_TOKEN;

before(async () => {
  process.env.OPERATOROS_SERVICE_TOKEN = TOKEN;
  await ensureSchemaReady();
  owner = await createTestUser();
  [tenant] = await db.insert(tenants).values({
    name: 'Introspect', slug: `intro-${owner.id}`,
    type: 'company', ownerUserId: owner.id,
  }).returning();
  await db.insert(tenantUsers).values({ tenantId: tenant.id, userId: owner.id, role: 'owner' });

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerEntitlementRoutes } = await import('../src/routes/entitlement-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  await registerEntitlementRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenant.id)); } catch {}
  try { await db.delete(tenants).where(eq(tenants.id, tenant.id)); } catch {}
  if (owner) await cleanupUser(owner.id);
  if (PREV_TOKEN === undefined) delete process.env.OPERATOROS_SERVICE_TOKEN;
  else process.env.OPERATOROS_SERVICE_TOKEN = PREV_TOKEN;
});

test('missing service token -> 401', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/sso/entitlements/introspect?user_id=${owner.id}&tenant_id=${tenant.id}`,
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().code, 'SERVICE_TOKEN_REQUIRED');
});

test('wrong service token -> 401 INVALID', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/sso/entitlements/introspect?user_id=${owner.id}&tenant_id=${tenant.id}`,
    headers: { authorization: 'Bearer wrong-token-but-long-enough-1234' },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().code, 'SERVICE_TOKEN_INVALID');
});

test('missing query params -> 400', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/sso/entitlements/introspect`,
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'INTROSPECT_PARAMS_REQUIRED');
});

test('valid token + valid params -> 200 + snapshot', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/sso/entitlements/introspect?user_id=${owner.id}&tenant_id=${tenant.id}`,
    headers: { 'x-service-token': TOKEN },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.version, 1);
  assert.equal(body.user.id, owner.id);
  assert.equal(body.tenant.id, tenant.id);
  assert.equal(body.tenant.role_alias, 'owner');
});
