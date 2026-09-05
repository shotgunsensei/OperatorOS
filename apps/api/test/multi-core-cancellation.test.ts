/**
 * Task #133 — multi-core cancellation recompute.
 *
 * Cancelling ONE core subscription previously deactivated that subscription's
 * rows but then zeroed `tenants.seat_limit` unconditionally — wiping a tenant
 * that still owned a second active core product. The fix recomputes the seat
 * limit from what REMAINS active:
 *   - another active core remains -> INCLUDED_SEATS + active seat-pack quantities
 *   - no active core remains       -> 0
 * Included-app entitlements from the surviving subscription must stay active.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { tenantEntitlements, tenants } from '../src/schema.js';
import { FREE_WITH_ANY_ACCOUNT, INCLUDED_SEATS } from '@operatoros/sdk';
import {
  ensureSchemaReady,
  createTestUser,
  cleanupUser,
  uniqueId,
} from './_setup.js';

process.env.NODE_ENV ??= 'test';
process.env.SESSION_SECRET ??= 'test-session-secret-multi-core';

let user: any;
const subA = uniqueId('sub_core_a');
const subB = uniqueId('sub_core_b');

before(async () => {
  await ensureSchemaReady();
  user = await createTestUser();

  const { grantStackEntitlements } = await import('../src/lib/product-entitlements.js');
  // Create the supported forward-sale subscription first.
  await grantStackEntitlements({
    tenantId: user.currentTenantId,
    coreProduct: 'tradeflowkit',
    freeCompanionModule: 'snapproofos',
    additionalModules: [],
    additionalSeats: 3,
    stripeSubscriptionId: subA,
  });

  // Defensive compatibility fixture: a tenant may still contain two historic
  // core grants from before the one-flagship contract. The forward grant API
  // correctly rejects creating this state now, so materialize only the legacy
  // rows needed to prove cancellation remains safe for grandfathered data.
  await db.insert(tenantEntitlements).values({
    tenantId: user.currentTenantId,
    entitlementKey: 'pulsedesk',
    entitlementType: 'core_product',
    source: 'stripe',
    stripeSubscriptionId: subB,
    metadata: { legacyCompatibilityFixture: true, includedSeats: INCLUDED_SEATS },
  });
  await db.insert(tenantEntitlements).values(
    FREE_WITH_ANY_ACCOUNT.map(app => ({
      tenantId: user.currentTenantId,
      entitlementKey: app.key,
      entitlementType: 'included_app' as const,
      source: 'included_with_core' as const,
      stripeSubscriptionId: subB,
      metadata: { legacyCompatibilityFixture: true, includedWithCoreProduct: 'pulsedesk' },
    })),
  );
  await db.insert(tenantEntitlements).values([
    {
      tenantId: user.currentTenantId,
      entitlementKey: 'brandforgeos',
      entitlementType: 'companion_module',
      source: 'selected_free_companion',
      stripeSubscriptionId: subB,
      metadata: { legacyCompatibilityFixture: true, includedPriceCents: 0 },
    },
    {
      tenantId: user.currentTenantId,
      entitlementKey: 'additional-seats',
      entitlementType: 'seat_pack',
      source: 'stripe',
      stripeSubscriptionId: subB,
      metadata: { legacyCompatibilityFixture: true, quantity: 2 },
    },
  ]);
});

after(async () => {
  if (user?.id) {
    try { await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, user.currentTenantId)); } catch {}
    await cleanupUser(user.id);
  }
});

test('cancelling one core keeps the other core + recomputes seat limit', async () => {
  const { deactivateSubscriptionEntitlements } = await import('../src/lib/product-entitlements.js');
  await deactivateSubscriptionEntitlements(subA);

  // subA rows are deactivated.
  const subARows = await db.select().from(tenantEntitlements)
    .where(and(
      eq(tenantEntitlements.stripeSubscriptionId, subA),
      eq(tenantEntitlements.active, true),
    ));
  assert.equal(subARows.length, 0, 'cancelled subscription rows must be inactive');

  // subB core + included apps remain active.
  const subBCore = await db.select().from(tenantEntitlements)
    .where(and(
      eq(tenantEntitlements.stripeSubscriptionId, subB),
      eq(tenantEntitlements.entitlementType, 'core_product'),
      eq(tenantEntitlements.active, true),
    ));
  assert.equal(subBCore.length, 1, 'surviving core product must stay active');

  const subBIncluded = await db.select().from(tenantEntitlements)
    .where(and(
      eq(tenantEntitlements.stripeSubscriptionId, subB),
      eq(tenantEntitlements.entitlementType, 'included_app'),
      eq(tenantEntitlements.active, true),
    ));
  assert.ok(subBIncluded.length > 0, 'surviving included apps must stay active');

  // Seat limit recomputed from remaining: base + subB seat pack (2).
  const [t1] = await db.select({ seatLimit: tenants.seatLimit })
    .from(tenants).where(eq(tenants.id, user.currentTenantId));
  assert.equal(t1.seatLimit, INCLUDED_SEATS + 2,
    'seat limit must be the included base plus the surviving seat pack');
});

test('cancelling the last core collapses the seat limit to 0', async () => {
  const { deactivateSubscriptionEntitlements } = await import('../src/lib/product-entitlements.js');
  await deactivateSubscriptionEntitlements(subB);

  const [t2] = await db.select({ seatLimit: tenants.seatLimit })
    .from(tenants).where(eq(tenants.id, user.currentTenantId));
  assert.equal(t2.seatLimit, 0, 'no active core remaining must zero the seat limit');
});
