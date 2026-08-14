import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUsers, users } from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady, uniqueId } from './_setup.js';

process.env.APP_ENV = 'test';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ||= 'phase22-route-matrix-session-secret';

const { signToken } = await import('../src/lib/auth.js');
let app: any;
let owner: Awaited<ReturnType<typeof createTestUser>>;
let admin: Awaited<ReturnType<typeof createTestUser>>;
let member: Awaited<ReturnType<typeof createTestUser>>;
let viewer: Awaited<ReturnType<typeof createTestUser>>;
let foreignOwner: Awaited<ReturnType<typeof createTestUser>>;
let platformAdmin: Awaited<ReturnType<typeof createTestUser>>;
let moduleId: string;
let insertedModule = false;

function bearer(user: Awaited<ReturnType<typeof createTestUser>>) {
  return { authorization: `Bearer ${signToken({ userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion, sessionType: 'platform' })}` };
}

async function cleanupPhase22Tenant(tenantId: string) {
  await db.execute(sql`DELETE FROM shared_download_grants WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_delivery_attempts WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_webhook_deliveries WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_webhook_endpoints WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_api_tokens WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_service_identities WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_feature_flags WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_provider_configs WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM shared_secret_references WHERE tenant_id = ${tenantId}`);
}

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  admin = await createTestUser();
  member = await createTestUser();
  viewer = await createTestUser();
  foreignOwner = await createTestUser();
  platformAdmin = await createTestUser();
  let [moduleRow] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, 'tradeflowkit')).limit(1);
  if (!moduleRow) { moduleRow = await createTestModule('tradeflowkit'); insertedModule = true; }
  moduleId = moduleRow.id;
  await db.insert(tenantModules).values({ tenantId: owner.currentTenantId!, moduleId, status: 'enabled', source: 'included', allowAllMembers: true }).onConflictDoNothing();
  for (const [user, role] of [[admin, 'admin'], [member, 'member'], [viewer, 'viewer']] as const) {
    await db.insert(tenantUsers).values({ tenantId: owner.currentTenantId!, userId: user.id, role });
    await db.update(users).set({ currentTenantId: owner.currentTenantId!, updatedAt: new Date() }).where(eq(users.id, user.id));
  }
  await db.update(users).set({ platformRole: 'super_admin', updatedAt: new Date() }).where(eq(users.id, platformAdmin.id));
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerSharedPlatformRoutes } = await import('../src/routes/shared-platform-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'phase22-route-cookie-secret' });
  await registerSharedPlatformRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (owner) await cleanupPhase22Tenant(owner.currentTenantId!);
  for (const user of [owner, admin, member, viewer, foreignOwner, platformAdmin]) if (user) await cleanupUser(user.id);
  if (insertedModule && moduleId) await cleanupModule(moduleId);
});

test('P22-RBAC-001: owner, tenant admin, and platform admin can operate while member/viewer are denied', async () => {
  const url = `/v1/tenants/${owner.currentTenantId}/shared-platform/overview`;
  for (const allowed of [owner, admin, platformAdmin]) {
    const response = await app.inject({ method: 'GET', url, headers: bearer(allowed) });
    assert.equal(response.statusCode, 200, `${allowed.email}: ${response.body}`);
  }
  for (const denied of [member, viewer]) {
    const response = await app.inject({ method: 'GET', url, headers: bearer(denied) });
    assert.equal(response.statusCode, 403, `${denied.email}: ${response.body}`);
  }
  const foreign = await app.inject({ method: 'GET', url, headers: bearer(foreignOwner) });
  assert.equal(foreign.statusCode, 404, foreign.body);
  assert.equal(foreign.json().code, 'TENANT_NOT_FOUND');
});

test('P22-ROUTE-SECRET-001: provider mutation is audited and never echoes a raw credential', async () => {
  const secret = uniqueId('provider-secret');
  const response = await app.inject({
    method: 'PUT',
    url: `/v1/tenants/${owner.currentTenantId}/shared-platform/providers/email.primary`,
    headers: bearer(admin),
    payload: { kind: 'email', mode: 'live', callbackReady: true, secretReference: secret },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.body.includes(secret), false);
  assert.equal(response.json().provider.state, 'ready');
  assert.equal(response.json().provider.hasSecretReference, true);
  const encrypted = await db.execute(sql`SELECT encode(ciphertext, 'hex') AS ciphertext FROM shared_secret_references WHERE tenant_id = ${owner.currentTenantId!}`);
  assert.equal(JSON.stringify(encrypted.rows).includes(secret), false);
  const audit = await db.execute(sql`SELECT action, details FROM admin_audit_logs WHERE tenant_id = ${owner.currentTenantId!} AND action = 'shared_provider_config_saved' ORDER BY created_at DESC LIMIT 1`);
  assert.equal(audit.rows[0]?.action, 'shared_provider_config_saved');
  assert.equal(JSON.stringify(audit.rows[0]).includes(secret), false);
});

test('P22-ROUTE-TOKEN-001: API token management returns raw material once and lists only redacted descriptors', async () => {
  const created = await app.inject({
    method: 'POST', url: `/v1/tenants/${owner.currentTenantId}/shared-platform/service-identities`, headers: bearer(owner),
    payload: { identityName: uniqueId('route-reporter'), tokenName: 'primary', scopes: ['usage:read', 'search:read'] },
  });
  assert.equal(created.statusCode, 201, created.body);
  const raw = created.json().rawToken;
  assert.match(raw, /^oos_/);
  const listed = await app.inject({ method: 'GET', url: `/v1/tenants/${owner.currentTenantId}/shared-platform/operations`, headers: bearer(owner) });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.body.includes(raw), false);
  const tokenId = created.json().token.id;
  const revoked = await app.inject({ method: 'DELETE', url: `/v1/tenants/${owner.currentTenantId}/shared-platform/api-tokens/${tokenId}`, headers: bearer(owner) });
  assert.equal(revoked.statusCode, 200, revoked.body);
});

test('P22-ROUTE-SSRF-001: unsafe webhook endpoint is rejected before a secret is persisted', async () => {
  const before = await db.execute(sql`SELECT COUNT(*)::int AS count FROM shared_secret_references WHERE tenant_id = ${owner.currentTenantId!} AND purpose = 'outbound-webhook-hmac'`);
  const response = await app.inject({
    method: 'POST', url: `/v1/tenants/${owner.currentTenantId}/shared-platform/webhook-endpoints`, headers: bearer(owner),
    payload: { moduleSlug: 'tradeflowkit', name: 'unsafe', endpointUrl: 'https://127.0.0.1/hook', signingSecret: 'must-not-persist', eventTypes: ['record.updated'] },
  });
  assert.equal(response.statusCode, 422, response.body);
  assert.equal(response.json().code, 'WEBHOOK_SSRF_BLOCKED');
  const afterCount = await db.execute(sql`SELECT COUNT(*)::int AS count FROM shared_secret_references WHERE tenant_id = ${owner.currentTenantId!} AND purpose = 'outbound-webhook-hmac'`);
  assert.equal(afterCount.rows[0]?.count, before.rows[0]?.count);
});

test('P22-FLAG-001: tenant feature flags are module-validated, versioned, role-gated, and audited', async () => {
  const flagKey = uniqueId('phase22.flag').replaceAll('_', '.');
  const created = await app.inject({
    method: 'PUT', url: `/v1/tenants/${owner.currentTenantId}/shared-platform/feature-flags/${flagKey}`,
    headers: bearer(admin), payload: { moduleSlug: 'tradeflowkit', enabled: true, value: { rollout: 'admin-reviewed' } },
  });
  assert.equal(created.statusCode, 200, created.body);
  assert.equal(created.json().flag.enabled, true);
  assert.equal(created.json().flag.version, 1);
  const stale = await app.inject({
    method: 'PUT', url: `/v1/tenants/${owner.currentTenantId}/shared-platform/feature-flags/${flagKey}`,
    headers: bearer(admin), payload: { moduleSlug: 'tradeflowkit', enabled: false, expectedVersion: 99 },
  });
  assert.equal(stale.statusCode, 409, stale.body);
  assert.equal(stale.json().code, 'FEATURE_FLAG_VERSION_CONFLICT');
  const denied = await app.inject({
    method: 'PUT', url: `/v1/tenants/${owner.currentTenantId}/shared-platform/feature-flags/${flagKey}`,
    headers: bearer(member), payload: { enabled: false },
  });
  assert.equal(denied.statusCode, 403, denied.body);
});
