process.env.SESSION_SECRET ||= 'operatoros-brandforge-snapproof-application-stack-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { ensureForwardCommerceContract } from '../src/lib/application-stack-billing-db-init.js';
import {
  modules,
  tenantApplicationSubscriptions,
  tenantEntitlements,
  tenantModules,
  tenants,
} from '../src/schema.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
} from './_setup.js';

let app: ReturnType<typeof Fastify>;
let owner: Awaited<ReturnType<typeof createTestUser>>;
let signToken: typeof import('../src/lib/auth.js').signToken;
const moduleRows = new Map<string, typeof modules.$inferSelect>();
const createdModuleIds = new Set<string>();

function headers() {
  return {
    authorization: `Bearer ${signToken({
      userId: owner.id,
      email: owner.email,
      role: owner.role,
      tokenVersion: owner.tokenVersion,
      sessionType: 'platform',
    })}`,
    'x-tenant-id': owner.currentTenantId,
  };
}

async function assertCompleteStackAccess() {
  const templates = await app.inject({
    method: 'GET',
    url: '/v1/modules/brandforgeos/templates',
    headers: headers(),
  });
  assert.equal(templates.statusCode, 200, templates.body);
  const premiumTemplates = templates.json().templates.filter((item: any) => item.is_premium);
  assert.ok(premiumTemplates.length > 0, 'the seeded premium template catalog must be present');
  assert.ok(premiumTemplates.every((item: any) => item.usable === true));

  const integrations = await app.inject({
    method: 'GET',
    url: '/v1/modules/brandforgeos/integrations',
    headers: headers(),
  });
  assert.equal(integrations.statusCode, 200, integrations.body);
  assert.ok(integrations.json().integrations.length > 0);
  assert.ok(integrations.json().integrations.every((item: any) => item.entitled === true));

  const usage = await app.inject({
    method: 'GET',
    url: '/v1/modules/brandforgeos/plan-usage',
    headers: headers(),
  });
  assert.equal(usage.statusCode, 200, usage.body);
  assert.equal(usage.json().accessModel, 'application_stack');
  assert.equal(usage.json().completeAccess, true);
  assert.deepEqual(usage.json().module, { status: 'enabled', source: 'application_stack' });
  assert.equal(usage.json().credits.limit, null);
  assert.equal(usage.json().credits.unmetered, true);

  const billing = await app.inject({
    method: 'GET',
    url: '/v1/modules/snapproofos/billing',
    headers: headers(),
  });
  assert.equal(billing.statusCode, 200, billing.body);
  assert.equal(billing.json().billing.accessModel, 'application_stack');
  assert.equal(billing.json().billing.planName, 'Application Stack');
  assert.equal(billing.json().billing.completeAccess, true);
  assert.equal(billing.json().manageUrl, '/app?page=billing');
}

before(async () => {
  await ensureSchemaReady();
  await ensureForwardCommerceContract();
  ({ signToken } = await import('../src/lib/auth.js'));
  owner = await createTestUser();
  await db.update(tenants).set({ seatLimit: 5 }).where(eq(tenants.id, owner.currentTenantId));

  for (const slug of ['brandforgeos', 'snapproofos']) {
    const [existing] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
    const row = existing ?? await createTestModule(slug);
    moduleRows.set(slug, row);
    if (!existing) createdModuleIds.add(row.id);
  }

  await db.insert(tenantModules).values([
    {
      tenantId: owner.currentTenantId,
      moduleId: moduleRows.get('brandforgeos')!.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
      metadata: { features: {} },
    },
    {
      tenantId: owner.currentTenantId,
      moduleId: moduleRows.get('snapproofos')!.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
    },
  ]);

  const subscriptionId = `sub_brandforge_snapproof_stack_${owner.id}`;
  await db.insert(tenantApplicationSubscriptions).values({
    tenantId: owner.currentTenantId,
    initiatedByUserId: owner.id,
    coreProduct: 'techdeck',
    includedCompanionKey: 'brandforgeos',
    additionalModuleKeys: ['snapproofos'],
    status: 'active',
    stripeCustomerId: `cus_brandforge_snapproof_stack_${owner.id}`,
    stripeSubscriptionId: subscriptionId,
    corePriceId: 'price_techdeck_test',
    companionPriceId: 'price_companion_test',
  });
  await db.insert(tenantEntitlements).values([
    {
      tenantId: owner.currentTenantId,
      entitlementKey: 'brandforgeos',
      entitlementType: 'companion_module',
      source: 'selected_free_companion',
      stripeSubscriptionId: subscriptionId,
    },
    {
      tenantId: owner.currentTenantId,
      entitlementKey: 'snapproofos',
      entitlementType: 'companion_module',
      source: 'stripe',
      stripeSubscriptionId: subscriptionId,
      stripePriceId: 'price_companion_test',
    },
  ]);

  app = Fastify();
  await app.register(cookie);
  const { registerBrandForgeOsPhase31Routes } = await import('../src/routes/brandforgeos-phase31-routes.js');
  const { registerSnapProofOsPhase32Routes } = await import('../src/routes/snapproofos-phase32-routes.js');
  await registerBrandForgeOsPhase31Routes(app);
  await registerSnapProofOsPhase32Routes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (!owner) return;
  await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, owner.currentTenantId));
  await db.delete(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.tenantId, owner.currentTenantId));
  await db.delete(tenantModules).where(eq(tenantModules.tenantId, owner.currentTenantId));
  await cleanupUser(owner.id);
  for (const moduleId of createdModuleIds) await cleanupModule(moduleId);
});

test('selected-free and paid-additional companion sources receive the complete application behavior', async () => {
  await assertCompleteStackAccess();

  await db.update(tenantApplicationSubscriptions).set({
    includedCompanionKey: 'snapproofos',
    additionalModuleKeys: ['brandforgeos'],
    updatedAt: new Date(),
  }).where(eq(tenantApplicationSubscriptions.tenantId, owner.currentTenantId));
  await db.update(tenantEntitlements).set({
    source: 'stripe',
    stripePriceId: 'price_companion_test',
    updatedAt: new Date(),
  }).where(and(
    eq(tenantEntitlements.tenantId, owner.currentTenantId),
    eq(tenantEntitlements.entitlementKey, 'brandforgeos'),
  ));
  await db.update(tenantEntitlements).set({
    source: 'selected_free_companion',
    stripePriceId: null,
    updatedAt: new Date(),
  }).where(and(
    eq(tenantEntitlements.tenantId, owner.currentTenantId),
    eq(tenantEntitlements.entitlementKey, 'snapproofos'),
  ));

  await assertCompleteStackAccess();
});

test('inactive stacks fall back to grandfathered/manual BrandForge and SnapProof projections', async () => {
  await db.update(tenantApplicationSubscriptions).set({ status: 'canceled', updatedAt: new Date() })
    .where(eq(tenantApplicationSubscriptions.tenantId, owner.currentTenantId));

  const templates = await app.inject({
    method: 'GET',
    url: '/v1/modules/brandforgeos/templates',
    headers: headers(),
  });
  assert.equal(templates.statusCode, 200, templates.body);
  assert.ok(templates.json().templates.some((item: any) => item.is_premium && item.usable === false));

  const integrations = await app.inject({
    method: 'GET',
    url: '/v1/modules/brandforgeos/integrations',
    headers: headers(),
  });
  assert.equal(integrations.statusCode, 200, integrations.body);
  assert.ok(integrations.json().integrations.every((item: any) => item.entitled === false));

  const usage = await app.inject({
    method: 'GET',
    url: '/v1/modules/brandforgeos/plan-usage',
    headers: headers(),
  });
  assert.equal(usage.statusCode, 200, usage.body);
  assert.equal(usage.json().accessModel, 'grandfathered_or_manual');
  assert.equal(usage.json().completeAccess, false);

  const billing = await app.inject({
    method: 'GET',
    url: '/v1/modules/snapproofos/billing',
    headers: headers(),
  });
  assert.equal(billing.statusCode, 200, billing.body);
  assert.equal(billing.json().billing.accessModel, 'grandfathered_or_manual');
  assert.equal(billing.json().billing.completeAccess, true);
});

test('BrandForge handoff rejects incomplete audience, offer, and action before destination work begins', async () => {
  const { deliverNativeWorkflow } = await import('../src/lib/cross-module-workflow-adapters.js');
  const completeCampaign = {
    id: 'campaign-1',
    version: 1,
    brand_id: 'brand-1',
    brand_name: 'Complete Brand',
    target_audience: 'Commercial property managers',
    offer: 'A documented field-service package',
    core_message: 'Schedule a proof-backed site visit',
  };

  for (const [field, expectedLabel] of [
    ['target_audience', 'target audience'],
    ['offer', 'offer'],
    ['core_message', 'desired action / core message'],
  ] as const) {
    let queryCount = 0;
    const executor = {
      execute: async () => {
        queryCount += 1;
        return { rows: [{ ...completeCampaign, [field]: 'TBD' }] };
      },
    } as any;
    await assert.rejects(
      () => deliverNativeWorkflow('brandforgeos.campaign_to_launchkit', {
        tenantId: owner.currentTenantId,
        actorUserId: owner.id,
        eventId: `event-${field}`,
        workflowRunId: `run-${field}`,
        sourceModuleId: 'brandforgeos',
        destinationModuleId: 'ninja-launch-kit',
        aggregateId: 'campaign-1',
        payload: { expectedSourceVersion: 1 },
        sourceCanReviewAll: true,
        executor,
      }),
      (error: any) => error?.code === 'FABRIC_SOURCE_NOT_READY'
        && String(error.message).includes(expectedLabel),
    );
    assert.equal(queryCount, 1, `${expectedLabel} must fail before destination access or writes`);
  }
});
