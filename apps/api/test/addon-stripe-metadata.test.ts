/**
 * Gate 2 — Addon Stripe metadata + webhook classification.
 *
 * Asserts:
 *   - classifyWebhookEvent surfaces tenantId, initiatedByUserId, and
 *     internalAddonSubscriptionId when present in object.metadata.
 *   - Falls back gracefully (all nullable) when only legacy keys are present.
 *   - processAddonWebhookEvent prefers the metadata-pointed `incomplete`
 *     row over inserting a fresh active row (no duplicate created).
 *   - Tenant id from metadata is back-filled onto the promoted row.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users, tenants, modules, addonSubscriptions } from '../src/schema.js';
import { ensureSchemaReady, createTestUser, createTestModule, cleanupUser, cleanupModule, uniqueId } from './_setup.js';
import { classifyWebhookEvent, processAddonWebhookEvent } from '../src/lib/billing-service.js';

let buyer: any;
let mod: any;
let tenant: any;

before(async () => {
  await ensureSchemaReady();
  buyer = await createTestUser();
  mod = await createTestModule(`stripe-md-${uniqueId("m").replace(/_/g,"-")}`);
  [tenant] = await db.insert(tenants).values({
    name: 'Stripe MD Tenant', slug: `stripe-md-${uniqueId("t").replace(/_/g,"-")}`,
    type: 'company', ownerUserId: buyer.id,
  }).returning();
});

after(async () => {
  try { await db.delete(addonSubscriptions).where(eq(addonSubscriptions.moduleId, mod.id)); } catch {}
  if (tenant) try { await db.delete(tenants).where(eq(tenants.id, tenant.id)); } catch {}
  if (mod) await cleanupModule(mod.id);
  if (buyer) await cleanupUser(buyer.id);
});

test('classifyWebhookEvent surfaces all Gate 2 fields from object.metadata', () => {
  const cls = classifyWebhookEvent({
    type: 'checkout.session.completed',
    data: { object: { metadata: {
      type: 'addon', user_id: 'u1', module_slug: 'mymod',
      tenant_id: 't1', initiated_by_user_id: 'u2',
      internal_addon_subscription_id: 's1',
    } } },
  });
  assert.equal(cls.isAddon, true);
  assert.equal(cls.userId, 'u1');
  assert.equal(cls.moduleSlug, 'mymod');
  assert.equal(cls.tenantId, 't1');
  assert.equal(cls.initiatedByUserId, 'u2');
  assert.equal(cls.internalAddonSubscriptionId, 's1');
});

test('classifyWebhookEvent falls back to userId for initiatedByUserId when missing', () => {
  const cls = classifyWebhookEvent({
    type: 'checkout.session.completed',
    data: { object: { metadata: { type: 'addon', user_id: 'u1', module_slug: 'mymod' } } },
  });
  assert.equal(cls.initiatedByUserId, 'u1', 'falls back to userId');
  assert.equal(cls.tenantId, null);
  assert.equal(cls.internalAddonSubscriptionId, null);
});

test('classifyWebhookEvent returns nulls for plan events', () => {
  const cls = classifyWebhookEvent({
    type: 'customer.subscription.updated',
    data: { object: { metadata: { kind: 'plan', userId: 'u1' } } },
  });
  assert.equal(cls.isAddon, false);
  assert.equal(cls.tenantId, null);
  assert.equal(cls.internalAddonSubscriptionId, null);
});

test('processAddonWebhookEvent promotes the pre-created incomplete row, no duplicate', async () => {
  // Pre-create the 'incomplete' row that subscribeToAddon would insert.
  const [pending] = await db.insert(addonSubscriptions).values({
    userId: buyer.id, moduleId: mod.id, status: 'incomplete',
    tenantId: null, amount: 0, currentPeriodStart: new Date(),
  }).returning();

  const event = {
    id: uniqueId('evt'),
    type: 'checkout.session.completed' as const,
    data: { object: {
      id: uniqueId('cs'),
      subscription: uniqueId('sub'),
      customer: uniqueId('cus'),
      amount_total: 1500,
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
      metadata: {
        type: 'addon',
        user_id: buyer.id, userId: buyer.id,
        module_slug: mod.slug, moduleSlug: mod.slug,
        tenant_id: tenant.id, tenantId: tenant.id,
        initiated_by_user_id: buyer.id, initiatedByUserId: buyer.id,
        internal_addon_subscription_id: pending.id,
        internalAddonSubscriptionId: pending.id,
      },
    } },
  };

  const result = await processAddonWebhookEvent(event);
  assert.equal(result.handled, true);

  const rows = await db.select().from(addonSubscriptions)
    .where(and(eq(addonSubscriptions.userId, buyer.id), eq(addonSubscriptions.moduleId, mod.id)));
  assert.equal(rows.length, 1, 'no duplicate row inserted; pre-created row was promoted');
  assert.equal(rows[0].id, pending.id);
  assert.equal(rows[0].status, 'active');
  assert.equal(rows[0].tenantId, tenant.id, 'tenant id back-filled from metadata');
});
