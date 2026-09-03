process.env.SESSION_SECRET ||= 'operatoros-callcommand-lane-settlement-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
process.env.STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY = 'price_callcommand_lane_settlement_test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  CALLCOMMAND_LANE_ENTITLEMENT_KEY,
  CALLCOMMAND_LANE_FEATURE_KEY,
  createOrUpdateCallCommandLaneCheckout,
  processCallCommandLaneWebhookEvent,
} from '../src/lib/callcommand-lane-billing.js';
import { __setStripeTestOverrides } from '../src/lib/billing-service.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

type User = Awaited<ReturnType<typeof createTestUser>>;
type CapacityRow = {
  additional_lanes: number;
  pending_additional_lanes: number;
  billing_status: string;
  last_stripe_event_created: string | number;
  last_billing_event_id: string | null;
};
type BillingCapacityRow = {
  additional_lanes: number;
  pending_additional_lanes: number;
  billing_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_item_id: string | null;
};

const PRICE_ID = 'price_callcommand_lane_settlement_test';
let owner: User;
let moduleId: string;

function metadata(additionalLanes: number) {
  return {
    type: 'feature_addon',
    kind: 'feature_addon',
    operatoros_module: 'callcommand-ai',
    module_slug: 'callcommand-ai',
    feature: CALLCOMMAND_LANE_FEATURE_KEY,
    entitlement: CALLCOMMAND_LANE_ENTITLEMENT_KEY,
    billing_type: 'licensed_quantity',
    tenant_id: owner.currentTenantId,
    user_id: owner.id,
    requested_additional_lanes: String(additionalLanes),
  };
}

async function capacity(): Promise<CapacityRow> {
  const result = await db.execute(sql`
    SELECT additional_lanes,pending_additional_lanes,billing_status,
      last_stripe_event_created,last_billing_event_id
    FROM callcommand_capacity_entitlements WHERE tenant_id=${owner.currentTenantId}
  `);
  return result.rows[0] as unknown as CapacityRow;
}

async function billingCapacity(): Promise<BillingCapacityRow> {
  const result = await db.execute(sql`
    SELECT additional_lanes,pending_additional_lanes,billing_status,
      stripe_customer_id,stripe_subscription_id,stripe_subscription_item_id
    FROM callcommand_capacity_entitlements WHERE tenant_id=${owner.currentTenantId}
  `);
  return result.rows[0] as unknown as BillingCapacityRow;
}

async function setCapacity(input: {
  additionalLanes: number;
  pendingAdditionalLanes?: number;
  billingStatus: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  subscriptionItemId?: string | null;
}) {
  await db.execute(sql`
    INSERT INTO callcommand_capacity_entitlements(
      tenant_id,base_lanes,additional_lanes,pending_additional_lanes,billing_status,
      stripe_customer_id,stripe_subscription_id,stripe_subscription_item_id,
      stripe_price_id,price_lookup_key,last_stripe_event_created
    ) VALUES (
      ${owner.currentTenantId},1,${input.additionalLanes},${input.pendingAdditionalLanes ?? 0},
      ${input.billingStatus},${input.customerId ?? null},${input.subscriptionId ?? null},
      ${input.subscriptionItemId ?? null},${PRICE_ID},
      'operatoros_callcommand_concurrent_lane_monthly_v1',0
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
      additional_lanes=EXCLUDED.additional_lanes,
      pending_additional_lanes=EXCLUDED.pending_additional_lanes,
      billing_status=EXCLUDED.billing_status,
      stripe_customer_id=EXCLUDED.stripe_customer_id,
      stripe_subscription_id=EXCLUDED.stripe_subscription_id,
      stripe_subscription_item_id=EXCLUDED.stripe_subscription_item_id,
      stripe_price_id=EXCLUDED.stripe_price_id,
      price_lookup_key=EXCLUDED.price_lookup_key,
      last_stripe_event_created=0,
      last_billing_event_id=NULL,
      updated_at=NOW()
  `);
}

before(async () => {
  await ensureSchemaReady();
  moduleId = (await createTestModule('callcommand-ai')).id;
  owner = await createTestUser();
  await db.execute(sql`
    INSERT INTO callcommand_capacity_entitlements(
      tenant_id,base_lanes,additional_lanes,pending_additional_lanes,billing_status,
      stripe_customer_id,stripe_price_id,price_lookup_key,last_stripe_event_created
    ) VALUES (
      ${owner.currentTenantId},1,0,4,'pending','cus_callcommand_lane_test',${PRICE_ID},
      'operatoros_callcommand_concurrent_lane_monthly_v1',0
    )
  `);
});

after(async () => {
  __setStripeTestOverrides(null);
  if (!owner) return;
  await db.execute(sql`DELETE FROM callcommand_capacity_entitlements WHERE tenant_id=${owner.currentTenantId}`);
  await cleanupUser(owner.id);
  if (moduleId) await cleanupModule(moduleId);
});

test('only a paid lane event settles pending quantity and stale events cannot overwrite it', async () => {
  const checkoutObserved = await processCallCommandLaneWebhookEvent({
    id: 'evt_callcommand_checkout_observed',
    created: 100,
    type: 'checkout.session.completed',
    data: {
      object: {
        customer: 'cus_callcommand_lane_test',
        subscription: 'sub_callcommand_lane_test',
        payment_status: 'unpaid',
        metadata: metadata(4),
      },
    },
  });
  assert.equal(checkoutObserved.handled, true);
  assert.equal(checkoutObserved.action, 'callcommand_lane_state_observed');
  assert.equal(checkoutObserved.rowsAffected, 1);
  assert.deepEqual(await capacity(), {
    additional_lanes: 0,
    pending_additional_lanes: 4,
    billing_status: 'pending',
    last_stripe_event_created: '100',
    last_billing_event_id: 'evt_callcommand_checkout_observed',
  });

  const paid = await processCallCommandLaneWebhookEvent({
    id: 'evt_callcommand_invoice_paid',
    created: 200,
    type: 'invoice.paid',
    data: {
      object: {
        customer: 'cus_callcommand_lane_test',
        subscription: 'sub_callcommand_lane_test',
        paid: true,
        amount_remaining: 0,
        metadata: metadata(3),
        lines: {
          data: [{
            id: 'il_callcommand_lane_test',
            subscription_item: 'si_callcommand_lane_test',
            quantity: 3,
            price: { id: PRICE_ID },
            metadata: metadata(3),
            period: { start: 1_788_134_400, end: 1_790_812_800 },
          }],
        },
      },
    },
  });
  assert.equal(paid.handled, true);
  assert.equal(paid.action, 'callcommand_lane_quantity_settled');
  assert.equal(paid.rowsAffected, 1);
  assert.deepEqual(await capacity(), {
    additional_lanes: 3,
    pending_additional_lanes: 0,
    billing_status: 'active',
    last_stripe_event_created: '200',
    last_billing_event_id: 'evt_callcommand_invoice_paid',
  });

  const staleFailure = await processCallCommandLaneWebhookEvent({
    id: 'evt_callcommand_stale_failure',
    created: 150,
    type: 'invoice.payment_failed',
    data: {
      object: {
        customer: 'cus_callcommand_lane_test',
        subscription: 'sub_callcommand_lane_test',
        metadata: metadata(3),
      },
    },
  });
  assert.equal(staleFailure.handled, true);
  assert.equal(staleFailure.action, 'callcommand_lane_payment_failed');
  assert.equal(staleFailure.rowsAffected, 0);
  assert.deepEqual(await capacity(), {
    additional_lanes: 3,
    pending_additional_lanes: 0,
    billing_status: 'active',
    last_stripe_event_created: '200',
    last_billing_event_id: 'evt_callcommand_invoice_paid',
  });
});

test('lane checkout is exactly-once and persists pending quantity without granting capacity', async () => {
  await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id=${owner.currentTenantId}`);
  await db.execute(sql`DELETE FROM callcommand_capacity_entitlements WHERE tenant_id=${owner.currentTenantId}`);
  const customers: Array<{ params: Record<string, unknown>; options: { idempotencyKey: string } }> = [];
  const checkouts: Array<{ params: Record<string, unknown>; options: { idempotencyKey: string } }> = [];
  __setStripeTestOverrides({
    enabled: true,
    client: {
      customers: {
        create: async (params: Record<string, unknown>, options: { idempotencyKey: string }) => {
          customers.push({ params, options });
          return { id: 'cus_callcommand_checkout_once' };
        },
      },
      checkout: {
        sessions: {
          create: async (params: Record<string, unknown>, options: { idempotencyKey: string }) => {
            checkouts.push({ params, options });
            return { id: 'cs_callcommand_checkout_once', url: 'https://checkout.stripe.test/callcommand-once' };
          },
        },
      },
      subscriptions: { update: async () => { throw new Error('unexpected update'); } },
    },
  });

  const input = {
    tenantId: owner.currentTenantId,
    userId: owner.id,
    additionalLanes: 2,
    idempotencyKey: 'callcommand-lane-checkout-0001',
  };
  const first = await createOrUpdateCallCommandLaneCheckout(input);
  const replay = await createOrUpdateCallCommandLaneCheckout(input);

  assert.deepEqual(first, {
    action: 'checkout_created',
    additionalLanes: 2,
    effectiveLanesBeforeSettlement: 1,
    effectiveLanesAfterSettlement: 3,
    checkoutUrl: 'https://checkout.stripe.test/callcommand-once',
  });
  assert.deepEqual(replay, first);
  assert.equal(customers.length, 1);
  assert.equal(checkouts.length, 1);
  assert.match(customers[0].options.idempotencyKey, /^operatoros_cc_lane_customer_[0-9a-f]{64}$/);
  assert.match(checkouts[0].options.idempotencyKey, /^operatoros_cc_lane_checkout_[0-9a-f]{64}$/);
  assert.deepEqual((checkouts[0].params.line_items as unknown[]), [{ price: PRICE_ID, quantity: 2 }]);
  assert.deepEqual(await billingCapacity(), {
    additional_lanes: 0,
    pending_additional_lanes: 2,
    billing_status: 'pending',
    stripe_customer_id: 'cus_callcommand_checkout_once',
    stripe_subscription_id: null,
    stripe_subscription_item_id: null,
  });

  await assert.rejects(
    createOrUpdateCallCommandLaneCheckout({ ...input, additionalLanes: 3 }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'CALLCOMMAND_LANE_IDEMPOTENCY_CONFLICT');
      return true;
    },
  );
  assert.equal(checkouts.length, 1);
});

test('zero schedules cancellation exactly once and a settled cancellation permits a fresh checkout', async () => {
  await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id=${owner.currentTenantId}`);
  await setCapacity({
    additionalLanes: 4,
    billingStatus: 'active',
    customerId: 'cus_callcommand_cancel',
    subscriptionId: 'sub_callcommand_cancel',
    subscriptionItemId: 'si_callcommand_cancel',
  });
  const updates: Array<{
    id: string;
    params: Record<string, unknown>;
    options: { idempotencyKey: string };
  }> = [];
  __setStripeTestOverrides({
    enabled: true,
    client: {
      customers: { create: async () => { throw new Error('unexpected customer'); } },
      checkout: { sessions: { create: async () => { throw new Error('unexpected checkout'); } } },
      subscriptions: {
        update: async (
          id: string,
          params: Record<string, unknown>,
          options: { idempotencyKey: string },
        ) => {
          updates.push({ id, params, options });
          return { id };
        },
      },
    },
  });

  const input = {
    tenantId: owner.currentTenantId,
    userId: owner.id,
    additionalLanes: 0,
    idempotencyKey: 'callcommand-lane-cancel-0001',
  };
  const first = await createOrUpdateCallCommandLaneCheckout(input);
  const replay = await createOrUpdateCallCommandLaneCheckout(input);
  assert.deepEqual(first, {
    action: 'quantity_update_pending',
    additionalLanes: 0,
    effectiveLanesBeforeSettlement: 5,
    effectiveLanesAfterSettlement: 1,
    subscriptionId: 'sub_callcommand_cancel',
  });
  assert.deepEqual(replay, first);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 'sub_callcommand_cancel');
  assert.equal(updates[0].params.cancel_at_period_end, true);
  assert.equal('items' in updates[0].params, false);
  assert.equal(
    (updates[0].params.metadata as Record<string, string>).requested_additional_lanes,
    '0',
  );
  assert.match(updates[0].options.idempotencyKey, /^operatoros_cc_lane_update_[0-9a-f]{64}$/);
  assert.deepEqual(await billingCapacity(), {
    additional_lanes: 4,
    pending_additional_lanes: 0,
    billing_status: 'active',
    stripe_customer_id: 'cus_callcommand_cancel',
    stripe_subscription_id: 'sub_callcommand_cancel',
    stripe_subscription_item_id: 'si_callcommand_cancel',
  });

  const settled = await processCallCommandLaneWebhookEvent({
    id: 'evt_callcommand_cancel_settled',
    created: 300,
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: 'sub_callcommand_cancel',
        customer: 'cus_callcommand_cancel',
        metadata: metadata(0),
      },
    },
  });
  assert.equal(settled.handled, true);
  assert.equal(settled.action, 'callcommand_lane_canceled');
  assert.deepEqual(await billingCapacity(), {
    additional_lanes: 0,
    pending_additional_lanes: 0,
    billing_status: 'canceled',
    stripe_customer_id: 'cus_callcommand_cancel',
    stripe_subscription_id: null,
    stripe_subscription_item_id: null,
  });

  const freshCheckouts: Array<Record<string, unknown>> = [];
  __setStripeTestOverrides({
    enabled: true,
    client: {
      customers: { create: async () => { throw new Error('existing customer should be retained'); } },
      checkout: {
        sessions: {
          create: async (params: Record<string, unknown>) => {
            freshCheckouts.push(params);
            return { id: 'cs_callcommand_after_cancel', url: 'https://checkout.stripe.test/after-cancel' };
          },
        },
      },
      subscriptions: { update: async () => { throw new Error('canceled subscription must not be updated'); } },
    },
  });
  const repurchase = await createOrUpdateCallCommandLaneCheckout({
    tenantId: owner.currentTenantId,
    userId: owner.id,
    additionalLanes: 2,
    idempotencyKey: 'callcommand-lane-after-cancel-0001',
  });
  assert.equal(repurchase.action, 'checkout_created');
  assert.equal(repurchase.additionalLanes, 2);
  assert.equal(repurchase.checkoutUrl, 'https://checkout.stripe.test/after-cancel');
  assert.equal(freshCheckouts.length, 1);
  assert.equal(freshCheckouts[0].customer, 'cus_callcommand_cancel');
  assert.deepEqual(freshCheckouts[0].line_items, [{ price: PRICE_ID, quantity: 2 }]);
});

test('lane checkout never reuses a base subscription customer from another tenant', async () => {
  await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id=${owner.currentTenantId}`);
  await db.execute(sql`DELETE FROM callcommand_capacity_entitlements WHERE tenant_id=${owner.currentTenantId}`);
  const otherTenantOwner = await createTestUser();
  const crossTenantCustomerId = 'cus_cross_tenant_must_not_be_used';
  const createdCustomerId = 'cus_target_tenant_lane_checkout';
  const plan = await db.execute(sql`SELECT id FROM subscription_plans ORDER BY created_at LIMIT 1`);
  assert.ok(plan.rows[0]?.id);
  await db.execute(sql`
    INSERT INTO subscriptions(
      user_id,plan_id,status,stripe_customer_id,stripe_subscription_id,tenant_id
    ) VALUES (
      ${owner.id},${String(plan.rows[0].id)},'active',${crossTenantCustomerId},
      'sub_cross_tenant_must_not_be_used',${otherTenantOwner.currentTenantId}
    )
  `);
  const createdCustomers: string[] = [];
  const checkoutCustomers: string[] = [];
  __setStripeTestOverrides({
    enabled: true,
    client: {
      customers: {
        create: async () => {
          createdCustomers.push(createdCustomerId);
          return { id: createdCustomerId };
        },
      },
      checkout: {
        sessions: {
          create: async (params: Record<string, unknown>) => {
            checkoutCustomers.push(String(params.customer));
            return { id: 'cs_target_tenant', url: 'https://checkout.stripe.test/target-tenant' };
          },
        },
      },
      subscriptions: { update: async () => { throw new Error('unexpected update'); } },
    },
  });

  try {
    await createOrUpdateCallCommandLaneCheckout({
      tenantId: owner.currentTenantId,
      userId: owner.id,
      additionalLanes: 1,
      idempotencyKey: 'callcommand-lane-tenant-scope-0001',
    });
    assert.deepEqual(createdCustomers, [createdCustomerId]);
    assert.deepEqual(checkoutCustomers, [createdCustomerId]);
    assert.notEqual(checkoutCustomers[0], crossTenantCustomerId);
  } finally {
    await db.execute(sql`DELETE FROM callcommand_capacity_entitlements WHERE tenant_id=${owner.currentTenantId}`);
    await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id=${owner.currentTenantId}`);
    await db.execute(sql`DELETE FROM subscriptions WHERE stripe_customer_id=${crossTenantCustomerId}`);
    await cleanupUser(otherTenantOwner.id);
  }
});

test('lane billing validates zero-to-one-hundred quantity and a bounded idempotency key before provider access', async () => {
  let providerCalls = 0;
  __setStripeTestOverrides({
    enabled: true,
    client: {
      customers: { create: async () => { providerCalls += 1; return { id: 'cus_unexpected' }; } },
      checkout: { sessions: { create: async () => { providerCalls += 1; return { id: 'cs_unexpected', url: 'https://checkout.stripe.test/unexpected' }; } } },
      subscriptions: { update: async () => { providerCalls += 1; } },
    },
  });
  for (const additionalLanes of [-1, 101, 1.5]) {
    await assert.rejects(
      createOrUpdateCallCommandLaneCheckout({
        tenantId: owner.currentTenantId,
        userId: owner.id,
        additionalLanes,
        idempotencyKey: 'callcommand-lane-invalid-quantity',
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'CALLCOMMAND_LANE_QUANTITY_INVALID');
        return true;
      },
    );
  }
  for (const idempotencyKey of ['', 'short', 'contains spaces', 'x'.repeat(161)]) {
    await assert.rejects(
      createOrUpdateCallCommandLaneCheckout({
        tenantId: owner.currentTenantId,
        userId: owner.id,
        additionalLanes: 1,
        idempotencyKey,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'CALLCOMMAND_LANE_IDEMPOTENCY_KEY_INVALID');
        return true;
      },
    );
  }
  assert.equal(providerCalls, 0);
});
