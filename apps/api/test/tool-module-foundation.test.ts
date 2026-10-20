import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  modules, tenantApplicationSubscriptions, tenantEntitlements, tenantModules,
  tenantUserModuleAccess, tenantUsers, tenants, users,
} from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import {
  grantModuleEntitlement, resolveTenantModuleAccess, revokeModuleEntitlement,
  tenantHasModuleEntitlement,
} from '../src/lib/tenant-entitlements.js';
import {
  cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady, uniqueId,
} from './_setup.js';

type TestUser = Awaited<ReturnType<typeof createTestUser>>;
let app: import('fastify').FastifyInstance;
let owner: TestUser;
let member: TestUser;
let support: TestUser;
let tenantId: string;
const tools: (typeof modules.$inferSelect)[] = [];
const bearer = (user: TestUser, selectedTenant = tenantId) => ({
  authorization: `Bearer ${signToken({ userId: user.id, email: user.email, role: user.role, sessionType: 'platform' })}`,
  'x-tenant-id': selectedTenant,
});

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  member = await createTestUser();
  support = await createTestUser();
  tenantId = owner.currentTenantId;
  await db.update(tenants).set({ seatLimit: 0 }).where(eq(tenants.id, tenantId));
  await db.insert(tenantUsers).values({ tenantId, userId: member.id, role: 'member' });
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, support.id));
  for (const slug of ['officeexit', 'vendortrust365']) tools.push(await createTestModule(slug));
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerToolModuleRoutes } = await import('../src/routes/tool-module-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerToolModuleRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  for (const tool of tools) await cleanupModule(tool.id);
  for (const user of [owner, member, support]) if (user) await cleanupUser(user.id);
});

test('real catalog route requires authentication', async () => {
  const response = await app.inject({ method: 'GET', url: '/v1/tools/catalog' });
  assert.equal(response.statusCode, 401);
});

test('free owner with zero Stack seats can read eligibility; paid subscription does not change it', async () => {
  const free = await app.inject({ method: 'GET', url: '/v1/tools/catalog', headers: bearer(owner) });
  assert.equal(free.statusCode, 200);
  assert.equal(free.headers['cache-control'], 'no-store');
  assert.deepEqual(free.json().purchaseEligibility, { eligible: true, reason: 'eligible' });
  assert.equal(free.json().checkoutAvailable, false);
  for (const tool of free.json().tools) {
    assert.equal(tool.salesEnabled, false);
    assert.equal(tool.downloadsAvailable, false);
  }
  const [subscription] = await db.insert(tenantApplicationSubscriptions).values({
    tenantId, initiatedByUserId: owner.id, coreProduct: 'tradeflowkit',
    includedCompanionKey: 'brandforgeos', additionalModuleKeys: [], additionalSeats: 0,
    status: 'active', stripeCustomerId: uniqueId('cus_tool_fixture'),
    stripeSubscriptionId: uniqueId('sub_tool_fixture'), corePriceId: uniqueId('price_tool_fixture'),
  }).returning();
  try {
    const paid = await app.inject({ method: 'GET', url: '/v1/tools/catalog', headers: bearer(owner) });
    assert.equal(paid.statusCode, 200);
    assert.deepEqual(paid.json(), free.json());
  } finally {
    await db.delete(tenantApplicationSubscriptions).where(eq(tenantApplicationSubscriptions.id, subscription.id));
  }
});

test('foreign tenant header and synthetic support ownership cannot authorize catalog context', async () => {
  const outsider = await app.inject({ method: 'GET', url: '/v1/tools/catalog', headers: bearer(owner, member.currentTenantId) });
  const synthetic = await app.inject({ method: 'GET', url: '/v1/tools/catalog', headers: bearer(support) });
  assert.equal(outsider.statusCode, 404);
  assert.equal(synthetic.statusCode, 404);
});

test('real members can see readiness but cannot purchase; role aliases do not bypass ownership', async () => {
  for (const role of ['member', 'viewer', 'admin'] as const) {
    await db.update(tenantUsers).set({ role }).where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, member.id)));
    const response = await app.inject({ method: 'GET', url: '/v1/tools/catalog', headers: bearer(member) });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().purchaseEligibility, { eligible: false, reason: 'owner_required' });
  }
});

test('ownership transfer is re-read rather than trusting a stale owner membership', async () => {
  await db.update(tenants).set({ ownerUserId: member.id }).where(eq(tenants.id, tenantId));
  try {
    const response = await app.inject({ method: 'GET', url: '/v1/tools/catalog', headers: bearer(owner) });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().purchaseEligibility.eligible, false);
  } finally {
    await db.update(tenants).set({ ownerUserId: owner.id }).where(eq(tenants.id, tenantId));
  }
});

test('removed membership, suspended tenant and archived tenant fail closed', async () => {
  await db.delete(tenantUsers).where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, member.id)));
  assert.equal((await app.inject({ method: 'GET', url: '/v1/tools/catalog', headers: bearer(member) })).statusCode, 404);
  for (const [status, expected] of [['suspended', 403], ['archived', 404]] as const) {
    await db.update(tenants).set({ status }).where(eq(tenants.id, tenantId));
    try {
      const response = await app.inject({ method: 'GET', url: '/v1/tools/catalog', headers: bearer(owner) });
      assert.equal(response.statusCode, expected);
    } finally {
      await db.update(tenants).set({ status: 'active' }).where(eq(tenants.id, tenantId));
    }
  }
});

test('foundation registers no purchase, download, activation or execution endpoint', async () => {
  for (const url of ['/v1/tools/checkout', '/v1/tools/officeexit/download', '/v1/tools/vendortrust365/activate', '/v1/tools/vendortrust365/scan']) {
    assert.equal((await app.inject({ method: 'POST', url, headers: bearer(owner), payload: {} })).statusCode, 404);
  }
});

for (const slug of ['officeexit', 'vendortrust365']) {
  test(`${slug} cannot inherit manual grants, assignments, Stack seats, trial or support access`, async () => {
    const tool = tools.find(row => row.slug === slug)!;
    await db.insert(tenantModules).values({ tenantId, moduleId: tool.id, status: 'purchased', source: 'addon', allowAllMembers: true });
    await db.insert(tenantEntitlements).values({ tenantId, entitlementKey: slug, entitlementType: 'system', source: 'manual', active: true });
    await db.insert(tenantUserModuleAccess).values({ tenantId, userId: owner.id, moduleId: tool.id, accessLevel: 'manager', grantedByUserId: owner.id });
    const decision = await resolveTenantModuleAccess(owner.id, tenantId, slug);
    assert.equal(decision.hasAccess, false);
    assert.equal(decision.reason, 'tool_purchase_ledger_required');
    assert.equal(await tenantHasModuleEntitlement(tenantId, slug), false);
    await db.insert(tenantUsers).values({ tenantId, userId: support.id, role: 'owner' });
    try {
      const supportDecision = await resolveTenantModuleAccess(support.id, tenantId, slug);
      assert.equal(supportDecision.hasAccess, false);
      assert.equal(supportDecision.viaPlatformRole, false);
      assert.equal(supportDecision.reason, 'tool_purchase_ledger_required');
    } finally {
      await db.delete(tenantUsers).where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, support.id)));
    }
  });

  test(`${slug} retains kill-switch, explicit-deny and removed-member precedence`, async () => {
    const tool = tools.find(row => row.slug === slug)!;
    await db.update(modules).set({ status: 'hidden' }).where(eq(modules.id, tool.id));
    assert.equal((await resolveTenantModuleAccess(support.id, tenantId, slug)).reason, 'module_disabled');
    await db.update(modules).set({ status: 'live' }).where(eq(modules.id, tool.id));
    await db.update(tenantUserModuleAccess).set({ accessLevel: 'none' }).where(and(eq(tenantUserModuleAccess.tenantId, tenantId), eq(tenantUserModuleAccess.moduleId, tool.id)));
    assert.equal((await resolveTenantModuleAccess(owner.id, tenantId, slug)).reason, 'explicit_deny');
    assert.equal((await resolveTenantModuleAccess(member.id, tenantId, slug)).reason, 'tenant_not_found');
  });

  test(`${slug} generic grant/revoke reject before writes, including archived modules`, async () => {
    const tool = tools.find(row => row.slug === slug)!;
    const snapshot = async () => ({
      modules: await db.select().from(tenantModules).where(eq(tenantModules.moduleId, tool.id)),
      entitlements: await db.select().from(tenantEntitlements).where(eq(tenantEntitlements.entitlementKey, slug)),
    });
    const previous = await snapshot();
    for (const source of ['stripe', 'manual', 'admin', 'included_with_core', 'selected_free_companion', 'trial'] as const) {
      await assert.rejects(grantModuleEntitlement(tenantId, slug, source), { statusCode: 409, code: 'TOOL_PURCHASE_LANE_REQUIRED' });
      await assert.rejects(revokeModuleEntitlement(tenantId, slug, source), { statusCode: 409, code: 'TOOL_PURCHASE_LANE_REQUIRED' });
    }
    await db.update(modules).set({ archivedAt: new Date() }).where(eq(modules.id, tool.id));
    await assert.rejects(grantModuleEntitlement(tenantId, slug), { code: 'TOOL_PURCHASE_LANE_REQUIRED' });
    await db.update(modules).set({ archivedAt: null }).where(eq(modules.id, tool.id));
    assert.deepEqual(await snapshot(), previous);
  });
}
