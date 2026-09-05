process.env.SESSION_SECRET ||= 'operatoros-application-stack-companion-tier-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { INCLUDED_SEATS } from '@operatoros/sdk';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  modules,
  tenantApplicationSubscriptions,
  tenantEntitlements,
  tenantModules,
  tenants,
} from '../src/schema.js';
import { ensureForwardCommerceContract } from '../src/lib/application-stack-billing-db-init.js';
import { resolveNinjaLaunchAccess } from '../src/lib/ninja-launch-kit-access.js';
import { resolveNinjamationAccess } from '../src/lib/ninjamation-access.js';
import { tenantHasActiveApplicationStackCompanion } from '../src/lib/product-entitlements.js';
import { resolveStudyForgeAccess } from '../src/lib/studyforge-access.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

const companionSlugs = ['studyforge-ai', 'ninja-launch-kit', 'ninjamation'] as const;
let owner: Awaited<ReturnType<typeof createTestUser>>;
let moduleRows: Array<typeof modules.$inferSelect> = [];

before(async () => {
  await ensureSchemaReady();
  await ensureForwardCommerceContract();
  owner = await createTestUser();

  moduleRows = await Promise.all(companionSlugs.map(slug => createTestModule(slug)));
  const bySlug = new Map(moduleRows.map(row => [row.slug, row]));
  await db.insert(tenantModules).values([
    {
      tenantId: owner.currentTenantId,
      moduleId: bySlug.get('studyforge-ai')!.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
      metadata: { features: { studyforgePlan: 'free', studyforgeMonthlyGenerations: 1 } },
    },
    {
      tenantId: owner.currentTenantId,
      moduleId: bySlug.get('ninja-launch-kit')!.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
      metadata: { features: { ninjaLaunchKitPlan: 'free' } },
    },
    {
      tenantId: owner.currentTenantId,
      moduleId: bySlug.get('ninjamation')!.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
      metadata: { features: { ninjamationPlan: 'starter' } },
    },
  ]);

  await db.insert(tenantApplicationSubscriptions).values({
    tenantId: owner.currentTenantId,
    initiatedByUserId: owner.id,
    coreProduct: 'techdeck',
    includedCompanionKey: 'studyforge-ai',
    additionalModuleKeys: ['ninja-launch-kit', 'ninjamation'],
    status: 'active',
    stripeCustomerId: `cus_companion_tier_${owner.id}`,
    stripeSubscriptionId: `sub_companion_tier_${owner.id}`,
    corePriceId: 'price_techdeck_test',
    companionPriceId: 'price_companion_test',
  });
  await db.update(tenants)
    .set({ seatLimit: INCLUDED_SEATS, updatedAt: new Date() })
    .where(eq(tenants.id, owner.currentTenantId));

  await db.insert(tenantEntitlements).values([
    {
      tenantId: owner.currentTenantId,
      entitlementKey: 'studyforge-ai',
      entitlementType: 'companion_module',
      source: 'selected_free_companion',
      stripeSubscriptionId: `sub_companion_tier_${owner.id}`,
    },
    ...(['ninja-launch-kit', 'ninjamation'] as const).map(entitlementKey => ({
      tenantId: owner.currentTenantId,
      entitlementKey,
      entitlementType: 'companion_module' as const,
      source: 'stripe' as const,
      stripeSubscriptionId: `sub_companion_tier_${owner.id}`,
      stripePriceId: 'price_companion_test',
    })),
  ]);
});

after(async () => {
  if (!owner) return;
  await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, owner.currentTenantId));
  await db.delete(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.tenantId, owner.currentTenantId));
  await db.delete(tenantModules).where(eq(tenantModules.tenantId, owner.currentTenantId));
  await cleanupUser(owner.id);
  for (const moduleRow of moduleRows) await cleanupModule(moduleRow.id);
});

test('included and paid Application Stack companions receive the complete application tier', async () => {
  assert.equal(await tenantHasActiveApplicationStackCompanion(owner.currentTenantId, 'studyforge-ai'), true);
  assert.equal(await tenantHasActiveApplicationStackCompanion(owner.currentTenantId, 'ninja-launch-kit'), true);
  assert.equal(await tenantHasActiveApplicationStackCompanion(owner.currentTenantId, 'ninjamation'), true);

  const [study, deploy, script] = await Promise.all([
    resolveStudyForgeAccess(owner.id, owner.currentTenantId),
    resolveNinjaLaunchAccess(owner.id, owner.currentTenantId),
    resolveNinjamationAccess(owner.id, owner.currentTenantId),
  ]);
  assert.deepEqual(
    { plan: study.plan, source: study.source, generations: study.limits.generationsPerMonth, tutorGroups: study.limits.tutorGroups },
    { plan: 'tutor', source: 'application_stack', generations: 500, tutorGroups: true },
  );
  assert.deepEqual(
    { plan: deploy.plan, source: deploy.source, brands: deploy.limits.brandProfiles, whiteLabel: deploy.limits.whiteLabel },
    { plan: 'agency', source: 'application_stack', brands: null, whiteLabel: true },
  );
  assert.deepEqual(
    { plan: script.plan, source: script.source, generations: script.limits.monthlyGenerations, api: script.limits.apiAccess },
    { plan: 'enterprise', source: 'application_stack', generations: null, api: true },
  );
});

test('inactive stack rows cannot promote tiers and legacy tier grants retain their old behavior', async () => {
  await db.update(tenantApplicationSubscriptions)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(eq(tenantApplicationSubscriptions.tenantId, owner.currentTenantId));

  assert.equal(await tenantHasActiveApplicationStackCompanion(owner.currentTenantId, 'studyforge-ai'), false);
  const configured = await Promise.all([
    resolveStudyForgeAccess(owner.id, owner.currentTenantId),
    resolveNinjaLaunchAccess(owner.id, owner.currentTenantId),
    resolveNinjamationAccess(owner.id, owner.currentTenantId),
  ]);
  assert.deepEqual(configured.map(access => [access.plan, access.source]), [
    ['free', 'module_feature'],
    ['free', 'module_feature'],
    ['starter', 'module_feature'],
  ]);

  await Promise.all(moduleRows.map(row => db.update(tenantModules)
    .set({ metadata: { features: {} }, updatedAt: new Date() })
    .where(and(
      eq(tenantModules.tenantId, owner.currentTenantId),
      eq(tenantModules.moduleId, row.id),
    ))));
  await db.insert(tenantEntitlements).values(companionSlugs.map(slug => ({
    tenantId: owner.currentTenantId,
    entitlementKey: `${slug}.pro`,
    entitlementType: 'companion_module' as const,
    source: 'admin' as const,
  })));

  const legacy = await Promise.all([
    resolveStudyForgeAccess(owner.id, owner.currentTenantId),
    resolveNinjaLaunchAccess(owner.id, owner.currentTenantId),
    resolveNinjamationAccess(owner.id, owner.currentTenantId),
  ]);
  assert.deepEqual(legacy.map(access => [access.plan, access.source]), [
    ['pro', 'tenant_entitlement'],
    ['pro', 'tenant_entitlement'],
    ['pro', 'tenant_entitlement'],
  ]);
});
