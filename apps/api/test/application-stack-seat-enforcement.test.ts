import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  modules,
  planModules,
  subscriptionPlans,
  subscriptions,
  tenantApplicationSubscriptions,
  tenantEntitlements,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
  tenants,
} from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { resolveEntitlements } from '../src/lib/entitlement-resolver.js';
import { getUserModules } from '../src/lib/entitlement-service.js';
import { resolveTenantModuleAccess } from '../src/lib/tenant-entitlements.js';
import { requireTenantModuleAccess } from '../src/lib/tenant-auth.js';
import { ensureForwardCommerceContract } from '../src/lib/application-stack-billing-db-init.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
  uniqueId,
} from './_setup.js';

process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

type TestUser = Awaited<ReturnType<typeof createTestUser>>;
type TestModule = typeof modules.$inferSelect;

let app: any;
let owner: TestUser;
let inLimitMember: TestUser;
let overLimitMember: TestUser;
let tenant: typeof tenants.$inferSelect;
let coreModule: TestModule;
let companionModule: TestModule;
let freeModule: TestModule;
let legacyModule: TestModule;
let legacySubscriptionId: string;
const createdModuleIds = new Set<string>();

async function ensureModule(slug: string): Promise<TestModule> {
  const [existing] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
  if (existing) return existing;
  const created = await createTestModule(slug);
  createdModuleIds.add(created.id);
  return created;
}

function bearer(user: TestUser) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionType: 'platform',
    })}`,
    'x-tenant-id': tenant.id,
  };
}

function moduleFromSnapshot(snapshot: Awaited<ReturnType<typeof resolveEntitlements>>, slug: string) {
  return snapshot?.modules.find(module => module.slug === slug);
}

before(async () => {
  await ensureSchemaReady();
  await ensureForwardCommerceContract();

  owner = await createTestUser();
  inLimitMember = await createTestUser();
  overLimitMember = await createTestUser();

  [tenant] = await db.insert(tenants).values({
    name: 'Application Stack Seat Contract',
    slug: uniqueId('stack-seat').replaceAll('_', '-'),
    type: 'company',
    status: 'active',
    ownerUserId: owner.id,
    seatLimit: 2,
  }).returning();
  await db.insert(tenantUsers).values([
    {
      tenantId: tenant.id,
      userId: owner.id,
      role: 'owner',
      joinedAt: new Date('2025-01-01T00:00:00.000Z'),
    },
    {
      tenantId: tenant.id,
      userId: inLimitMember.id,
      role: 'member',
      joinedAt: new Date('2025-01-02T00:00:00.000Z'),
    },
    {
      tenantId: tenant.id,
      userId: overLimitMember.id,
      role: 'member',
      joinedAt: new Date('2025-01-03T00:00:00.000Z'),
    },
  ]);

  coreModule = await ensureModule('tradeflowkit');
  companionModule = await ensureModule('brandforgeos');
  freeModule = await ensureModule('torqueshed');
  legacyModule = await ensureModule(uniqueId('legacy-seat-exempt').replaceAll('_', '-'));

  const stripeSubscriptionId = uniqueId('sub_stack_seat');
  await db.insert(tenantApplicationSubscriptions).values({
    tenantId: tenant.id,
    initiatedByUserId: owner.id,
    coreProduct: 'tradeflowkit',
    includedCompanionKey: 'brandforgeos',
    additionalModuleKeys: [],
    additionalSeats: 0,
    status: 'active',
    stripeCustomerId: uniqueId('cus_stack_seat'),
    stripeSubscriptionId,
    corePriceId: uniqueId('price_stack_core'),
    currentPeriodStart: new Date('2025-01-01T00:00:00.000Z'),
  });
  await db.insert(tenantEntitlements).values([
    {
      tenantId: tenant.id,
      entitlementKey: coreModule.slug,
      entitlementType: 'core_product',
      source: 'stripe',
      stripeSubscriptionId,
    },
    {
      tenantId: tenant.id,
      entitlementKey: companionModule.slug,
      entitlementType: 'companion_module',
      source: 'selected_free_companion',
      stripeSubscriptionId,
    },
    {
      tenantId: tenant.id,
      entitlementKey: freeModule.slug,
      entitlementType: 'included_app',
      source: 'included_with_core',
      stripeSubscriptionId,
    },
  ]);

  // The flagship exercises the tenant-wide allowAll path. The companion
  // exercises explicit user/manager grants. Both must still require a seat.
  await db.insert(tenantModules).values([
    {
      tenantId: tenant.id,
      moduleId: coreModule.id,
      status: 'purchased',
      source: 'addon',
      allowAllMembers: true,
    },
    {
      tenantId: tenant.id,
      moduleId: companionModule.id,
      status: 'purchased',
      source: 'addon',
      allowAllMembers: false,
    },
    {
      tenantId: tenant.id,
      moduleId: freeModule.id,
      status: 'enabled',
      source: 'included',
      allowAllMembers: true,
      metadata: { freeWithAnyAccount: true },
    },
  ]);
  await db.insert(tenantUserModuleAccess).values([
    {
      tenantId: tenant.id,
      userId: owner.id,
      moduleId: companionModule.id,
      accessLevel: 'manager',
      grantedByUserId: owner.id,
    },
    {
      tenantId: tenant.id,
      userId: inLimitMember.id,
      moduleId: companionModule.id,
      accessLevel: 'user',
      grantedByUserId: owner.id,
    },
    {
      tenantId: tenant.id,
      userId: overLimitMember.id,
      moduleId: companionModule.id,
      accessLevel: 'manager',
      grantedByUserId: owner.id,
    },
  ]);

  // Preserve the pre-v60 contract: an unrelated grandfathered plan grant is
  // not reclassified as an Application Stack benefit and remains seat-exempt.
  const [legacyPlan] = await db.select().from(subscriptionPlans)
    .where(eq(subscriptionPlans.slug, 'pro'))
    .limit(1);
  assert.ok(legacyPlan, 'test bootstrap must provision the legacy Pro plan');
  await db.insert(planModules).values({ planId: legacyPlan.id, moduleId: legacyModule.id });
  const [legacySubscription] = await db.insert(subscriptions).values({
    userId: owner.id,
    tenantId: tenant.id,
    planId: legacyPlan.id,
    status: 'active',
  }).returning({ id: subscriptions.id });
  legacySubscriptionId = legacySubscription.id;
  await db.execute(sql`
    UPDATE subscriptions
    SET legacy_access_grandfathered_at = NOW()
    WHERE id = ${legacySubscriptionId}
  `);

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerModuleRoutes } = await import('../src/routes/module-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'application-stack-seat-test-secret' });
  await registerModuleRoutes(app);
  for (const module of [coreModule, companionModule, freeModule, legacyModule]) {
    app.get(
      `/v1/test/seat/${module.slug}`,
      { preHandler: [requireTenantModuleAccess(module.slug)] },
      async () => ({ ok: true, moduleSlug: module.slug }),
    );
  }
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (tenant) {
    try {
      await db.delete(tenantUserModuleAccess)
        .where(eq(tenantUserModuleAccess.tenantId, tenant.id));
    } catch {}
    try {
      await db.delete(tenantModules)
        .where(eq(tenantModules.tenantId, tenant.id));
    } catch {}
    try {
      await db.delete(tenantEntitlements)
        .where(eq(tenantEntitlements.tenantId, tenant.id));
    } catch {}
    try {
      await db.delete(tenantApplicationSubscriptions)
        .where(eq(tenantApplicationSubscriptions.tenantId, tenant.id));
    } catch {}
    try {
      await db.delete(subscriptions)
        .where(and(eq(subscriptions.tenantId, tenant.id), eq(subscriptions.userId, owner.id)));
    } catch {}
    if (legacyModule) {
      try { await db.delete(planModules).where(eq(planModules.moduleId, legacyModule.id)); } catch {}
    }
    try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, tenant.id)); } catch {}
    try { await db.delete(tenants).where(eq(tenants.id, tenant.id)); } catch {}
  }
  for (const user of [overLimitMember, inLimitMember, owner]) {
    if (user) await cleanupUser(user.id);
  }
  for (const module of [legacyModule, freeModule, companionModule, coreModule]) {
    if (module && createdModuleIds.has(module.id)) await cleanupModule(module.id);
  }
});

test('paid Stack grants cannot bypass the seat boundary while free and legacy apps remain accessible', async () => {
  const overCore = await resolveTenantModuleAccess(overLimitMember.id, tenant.id, coreModule.slug);
  assert.equal(overCore.hasAccess, false, 'allowAllMembers must not bypass the paid flagship seat');
  assert.equal(overCore.reason, 'seat_limit_exceeded');
  assert.equal(overCore.accessLevel, 'none');

  const overCompanion = await resolveTenantModuleAccess(overLimitMember.id, tenant.id, companionModule.slug);
  assert.equal(overCompanion.hasAccess, false, 'an explicit manager grant must not bypass a paid companion seat');
  assert.equal(overCompanion.reason, 'seat_limit_exceeded');
  assert.equal(overCompanion.accessLevel, 'none');

  const free = await resolveTenantModuleAccess(overLimitMember.id, tenant.id, freeModule.slug);
  assert.equal(free.hasAccess, true, 'free-account apps never consume a paid Stack seat');

  const legacy = await resolveTenantModuleAccess(overLimitMember.id, tenant.id, legacyModule.slug);
  assert.equal(legacy.hasAccess, true, 'grandfathered legacy-plan-only access remains seat-exempt');
  assert.equal(legacy.source, 'plan');

  for (const user of [owner, inLimitMember]) {
    assert.equal(
      (await resolveTenantModuleAccess(user.id, tenant.id, coreModule.slug)).hasAccess,
      true,
      `${user.id} must be inside the purchased seat allocation`,
    );
    assert.equal(
      (await resolveTenantModuleAccess(user.id, tenant.id, companionModule.slug)).hasAccess,
      true,
      `${user.id} must receive its assigned companion within the purchased seat allocation`,
    );
  }
});

test('guard, snapshot, marketplace resolver, and launchpad agree for an over-limit member', async () => {
  const summaries = await getUserModules(overLimitMember.id, tenant.id);
  const snapshot = await resolveEntitlements(overLimitMember.id, tenant.id);
  assert.ok(snapshot);

  for (const paid of [coreModule, companionModule]) {
    const summary = summaries.find(row => row.module.slug === paid.slug);
    assert.equal(summary?.unlocked, false);
    assert.equal(summary?.reason, 'seat_limit_exceeded');
    assert.equal(summary?.module_access_level, 'none');
    assert.equal(moduleFromSnapshot(snapshot, paid.slug)?.enabled, false);
    assert.equal(moduleFromSnapshot(snapshot, paid.slug)?.accessLevel, 'none');

    const guarded = await app.inject({
      method: 'GET',
      url: `/v1/test/seat/${paid.slug}`,
      headers: bearer(overLimitMember),
    });
    assert.equal(guarded.statusCode, 403, guarded.body);
    assert.equal(guarded.json().code, 'TENANT_SEAT_LIMIT_EXCEEDED');
  }

  for (const accessible of [freeModule, legacyModule]) {
    const summary = summaries.find(row => row.module.slug === accessible.slug);
    assert.equal(summary?.unlocked, true);
    assert.equal(moduleFromSnapshot(snapshot, accessible.slug)?.enabled, true);
    const guarded = await app.inject({
      method: 'GET',
      url: `/v1/test/seat/${accessible.slug}`,
      headers: bearer(overLimitMember),
    });
    assert.equal(guarded.statusCode, 200, guarded.body);
  }

  const launchpad = await app.inject({
    method: 'GET',
    url: '/v1/me/modules',
    headers: bearer(overLimitMember),
  });
  assert.equal(launchpad.statusCode, 200, launchpad.body);
  const launchpadSlugs = launchpad.json().modules.map((module: any) => module.slug);
  assert.equal(launchpadSlugs.includes(coreModule.slug), false);
  assert.equal(launchpadSlugs.includes(companionModule.slug), false);
  assert.equal(launchpadSlugs.includes(freeModule.slug), true);
  assert.equal(launchpadSlugs.includes(legacyModule.slug), true);
});

test('owner and in-limit member receive the same paid modules from guards and launchpad', async () => {
  for (const user of [owner, inLimitMember]) {
    for (const paid of [coreModule, companionModule]) {
      const guarded = await app.inject({
        method: 'GET',
        url: `/v1/test/seat/${paid.slug}`,
        headers: bearer(user),
      });
      assert.equal(guarded.statusCode, 200, guarded.body);
    }

    const launchpad = await app.inject({
      method: 'GET',
      url: '/v1/me/modules',
      headers: bearer(user),
    });
    assert.equal(launchpad.statusCode, 200, launchpad.body);
    const slugs = launchpad.json().modules.map((module: any) => module.slug);
    assert.equal(slugs.includes(coreModule.slug), true);
    assert.equal(slugs.includes(companionModule.slug), true);
  }
});
