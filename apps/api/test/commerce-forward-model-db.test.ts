import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  addonSubscriptions,
  billingEvents,
  modules,
  planModules,
  subscriptionPlans,
  subscriptions,
  tenantApplicationSubscriptions,
  tenantEntitlements,
  tenantUsers,
  tenants,
  users,
} from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import {
  __setStripeTestOverrides,
} from '../src/lib/billing-service.js';
import {
  ensureForwardCommerceContract,
  subscriptionHasLegacyApplicationAccess,
} from '../src/lib/application-stack-billing-db-init.js';
import { evaluateUserEntitlement } from '../src/lib/entitlement-service.js';
import { tenantHasActiveApplicationStackCompanion } from '../src/lib/product-entitlements.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
} from './_setup.js';

process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

const eligibleCompanions = [
  'snapproofos',
  'brandforgeos',
  'studyforge-ai',
  'ninja-launch-kit',
  'callcommand-ai',
  'ninjamation',
] as const;

const excludedFromCompanionSales = [
  'tradeflowkit',
  'pulsedesk',
  'techdeck',
  'torqueshed',
  'faultlinelab',
  'ninja-pool-hall',
  'outcall',
] as const;

const managedEnvKeys = [
  'STRIPE_PRICE_TRADEFLOWKIT_MONTHLY',
  'STRIPE_PRICE_PULSEDESK_MONTHLY',
  'STRIPE_PRICE_TECHDECK_MONTHLY',
  'STRIPE_PRICE_COMPANION_MODULE_MONTHLY',
  'STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY',
  'STRIPE_BILLING_PORTAL_CONFIGURATION_ID',
  'ADDITIONAL_SEAT_PRICE_CENTS',
] as const;

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

let app: any;
let owner: TestUser;
let tenantAdmin: TestUser;
let tenantMember: TestUser;
let platformAdmin: TestUser;
const createdModules: Array<typeof modules.$inferSelect> = [];
const savedEnv = new Map<string, string | undefined>();
let grandfatherBackfillEvidence: {
  activeMarked: boolean;
  trialingMarked: boolean;
  postCutoverMarked: boolean;
};
let v60ConvergenceEvidence: {
  columnsValid: boolean;
  constraintsValid: boolean;
  indexesValid: boolean;
};

let customerCreateCalls = 0;
let checkoutCreateCalls = 0;
let checkoutRetrieveCalls = 0;
const portalCustomers: string[] = [];
const portalConfigurations: string[] = [];
const providerSubscriptions = new Map<string, any>();

function bearer(user: TestUser, tenantId = user.currentTenantId!) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
  };
}

function stackCheckoutEvent(input: {
  id: string;
  applicationSubscriptionId: string;
  tenantId?: string;
  userId?: string;
  checkoutAttemptId?: string;
  customerId?: string;
  checkoutSessionId?: string;
  stripeSubscriptionId?: string;
}) {
  return {
    id: input.id,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: input.checkoutSessionId ?? 'cs_stack_contract_1',
        mode: 'subscription',
        status: 'complete',
        payment_status: 'paid',
        subscription: input.stripeSubscriptionId ?? 'sub_stack_contract_1',
        customer: input.customerId ?? 'cus_tenant_contract_1',
        metadata: {
          billing_model: 'core_product_stack',
          tenant_id: input.tenantId ?? owner.currentTenantId!,
          user_id: input.userId ?? owner.id,
          selected_core_product: 'tradeflowkit',
          selected_free_companion_module: 'snapproofos',
          additional_module_keys: 'brandforgeos',
          additional_seats: '2',
          internal_application_subscription_id: input.applicationSubscriptionId,
          checkout_attempt_id: input.checkoutAttemptId ?? 'checkout-attempt-not-specified',
          billing_interval: 'month',
        },
      },
    },
  };
}

function providerPrice(id: string) {
  const amounts = new Map<string, number>([
    [process.env.STRIPE_PRICE_TRADEFLOWKIT_MONTHLY!, 14900],
    [process.env.STRIPE_PRICE_PULSEDESK_MONTHLY!, 14900],
    [process.env.STRIPE_PRICE_TECHDECK_MONTHLY!, 9900],
    [process.env.STRIPE_PRICE_COMPANION_MODULE_MONTHLY!, 2900],
    [process.env.STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY!, 1500],
  ]);
  return {
    id,
    unit_amount: amounts.get(id),
    currency: 'usd',
    active: true,
    billing_scheme: 'per_unit',
    transform_quantity: null,
    type: 'recurring',
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
  };
}

function providerSubscriptionForCheckout(
  event: ReturnType<typeof stackCheckoutEvent>,
  overrides: { status?: string; cancelAtPeriodEnd?: boolean; seatQuantity?: number } = {},
) {
  const object = event.data.object;
  const metadata = object.metadata;
  const additionalModules = metadata.additional_module_keys
    ? metadata.additional_module_keys.split(',').filter(Boolean)
    : [];
  const additionalSeats = Number.parseInt(metadata.additional_seats, 10);
  const items = [{ price: { id: process.env.STRIPE_PRICE_TRADEFLOWKIT_MONTHLY }, quantity: 1 }];
  if (additionalModules.length > 0) {
    items.push({ price: { id: process.env.STRIPE_PRICE_COMPANION_MODULE_MONTHLY }, quantity: additionalModules.length });
  }
  if (additionalSeats > 0) {
    items.push({
      price: { id: process.env.STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY },
      quantity: overrides.seatQuantity ?? additionalSeats,
    });
  }
  return {
    id: object.subscription,
    customer: object.customer,
    status: overrides.status ?? 'active',
    cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    metadata: { ...metadata },
    items: { data: items },
  };
}

async function sendStackWebhook(event: unknown, signature = 'operatoros-test-signature') {
  return app.inject({
    method: 'POST',
    url: '/v1/billing/webhook',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    payload: JSON.stringify(event),
  });
}

before(async () => {
  for (const key of managedEnvKeys) savedEnv.set(key, process.env[key]);
  process.env.STRIPE_PRICE_TRADEFLOWKIT_MONTHLY = 'price_core_tradeflowkit_monthly';
  process.env.STRIPE_PRICE_PULSEDESK_MONTHLY = 'price_core_pulsedesk_monthly';
  process.env.STRIPE_PRICE_TECHDECK_MONTHLY = 'price_core_techdeck_monthly';
  process.env.STRIPE_PRICE_COMPANION_MODULE_MONTHLY = 'price_companion_monthly';
  process.env.STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY = 'price_seat_monthly';
  process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID = 'bpc_operatoros_restrictive';
  process.env.ADDITIONAL_SEAT_PRICE_CENTS = '1500';

  await ensureSchemaReady();

  assert.equal(
    process.env.PARITY_DATABASE_IS_DISPOSABLE,
    '1',
    'v60 reset is permitted only against the explicitly disposable parity database',
  );
  const leakedStackRows = await db.execute(sql`SELECT COUNT(*)::int AS count FROM tenant_application_subscriptions`);
  assert.equal(
    Number(leakedStackRows.rows[0]?.count ?? -1),
    0,
    'earlier tests must clean every stack row before the bounded v60 reset',
  );
  await db.execute(sql`DROP TABLE IF EXISTS tenant_application_subscriptions`);
  await db.execute(sql`ALTER TABLE subscriptions DROP COLUMN IF EXISTS legacy_access_grandfathered_at`);

  const columnBefore = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='subscriptions'
        AND column_name='legacy_access_grandfathered_at'
    ) AS present
  `);
  assert.equal(
    columnBefore.rows[0]?.present,
    false,
    'commerce migration acceptance requires a brand-new isolated database before v60',
  );
  assert.equal(
    await tenantHasActiveApplicationStackCompanion('pre-v60-tenant', 'studyforge-ai'),
    false,
    'an absent v60 stack table must deny the paid companion tier without breaking a legacy bootstrap',
  );
  assert.equal(
    await subscriptionHasLegacyApplicationAccess('pre-v60-subscription'),
    false,
    'an absent v60 grandfather column must deny legacy application authority without breaking a legacy bootstrap',
  );

  // Simulate an interrupted/partial first v60 attempt. The release initializer
  // must converge this empty shell to the complete contract, not let
  // CREATE TABLE IF NOT EXISTS silently accept it.
  await db.execute(sql`CREATE TABLE tenant_application_subscriptions (id VARCHAR(36))`);

  const activeLegacyUser = await createTestUser();
  const trialingLegacyUser = await createTestUser();
  const postCutoverUser = await createTestUser();
  const [migrationPlan] = await db.select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.slug, 'pro'))
    .limit(1);
  const [activeBefore] = await db.insert(subscriptions).values({
    userId: activeLegacyUser.id,
    tenantId: activeLegacyUser.currentTenantId!,
    planId: migrationPlan.id,
    status: 'active',
  }).returning();
  const [trialingBefore] = await db.insert(subscriptions).values({
    userId: trialingLegacyUser.id,
    tenantId: trialingLegacyUser.currentTenantId!,
    planId: migrationPlan.id,
    status: 'trialing',
  }).returning();

  await ensureForwardCommerceContract();
  const converged = await db.execute(sql`
    SELECT
      (
        SELECT COUNT(*)=20
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='tenant_application_subscriptions'
      ) AS columns_valid,
      (
        SELECT COUNT(*)=9
        FROM pg_constraint
        WHERE conrelid='public.tenant_application_subscriptions'::regclass
          AND conname IN (
            'tenant_application_subscriptions_pkey',
            'tenant_application_subscriptions_tenant_id_fkey',
            'tenant_application_subscriptions_initiated_by_user_id_fkey',
            'tenant_application_subscriptions_tenant_unique',
            'tenant_application_subscriptions_core_check',
            'tenant_application_subscriptions_companion_check',
            'tenant_application_subscriptions_modules_check',
            'tenant_application_subscriptions_seats_check',
            'tenant_application_subscriptions_status_check'
          )
      ) AS constraints_valid,
      to_regclass('public.idx_tenant_application_subscriptions_status') IS NOT NULL
        AND to_regclass('public.uq_tenant_application_subscriptions_customer') IS NOT NULL
        AND to_regclass('public.uq_tenant_application_subscriptions_stripe_subscription') IS NOT NULL
        AND to_regclass('public.uq_tenant_application_subscriptions_checkout_session') IS NOT NULL
        AS indexes_valid
  `);
  v60ConvergenceEvidence = {
    columnsValid: converged.rows[0]?.columns_valid === true,
    constraintsValid: converged.rows[0]?.constraints_valid === true,
    indexesValid: converged.rows[0]?.indexes_valid === true,
  };
  const [postCutover] = await db.insert(subscriptions).values({
    userId: postCutoverUser.id,
    tenantId: postCutoverUser.currentTenantId!,
    planId: migrationPlan.id,
    status: 'active',
  }).returning();
  await ensureForwardCommerceContract();

  const markerRows = await db.execute(sql`
    SELECT id, legacy_access_grandfathered_at IS NOT NULL AS marked
    FROM subscriptions
    WHERE id IN (${activeBefore.id}, ${trialingBefore.id}, ${postCutover.id})
  `);
  const markedById = new Map(markerRows.rows.map(row => [String(row.id), row.marked === true]));
  grandfatherBackfillEvidence = {
    activeMarked: markedById.get(activeBefore.id) === true,
    trialingMarked: markedById.get(trialingBefore.id) === true,
    postCutoverMarked: markedById.get(postCutover.id) === true,
  };
  for (const migrationUser of [activeLegacyUser, trialingLegacyUser, postCutoverUser]) {
    await db.delete(subscriptions).where(eq(subscriptions.userId, migrationUser.id));
    await cleanupUser(migrationUser.id);
  }

  owner = await createTestUser();
  tenantAdmin = await createTestUser();
  tenantMember = await createTestUser();
  platformAdmin = await createTestUser();

  await db.insert(tenantUsers).values([
    { tenantId: owner.currentTenantId!, userId: tenantAdmin.id, role: 'admin' },
    { tenantId: owner.currentTenantId!, userId: tenantMember.id, role: 'member' },
  ]);
  await db.update(users)
    .set({ platformRole: 'super_admin' })
    .where(eq(users.id, platformAdmin.id));

  for (const slug of [...eligibleCompanions, ...excludedFromCompanionSales]) {
    createdModules.push(await createTestModule(slug));
  }

  __setStripeTestOverrides({
    enabled: true,
    client: {
      customers: {
        create: async () => {
          customerCreateCalls += 1;
          return { id: `cus_tenant_contract_${customerCreateCalls}` };
        },
      },
      checkout: {
        sessions: {
          create: async () => {
            checkoutCreateCalls += 1;
            return {
              id: `cs_stack_contract_${checkoutCreateCalls}`,
              url: `https://checkout.stripe.test/stack/${checkoutCreateCalls}`,
            };
          },
          retrieve: async (id: string) => {
            checkoutRetrieveCalls += 1;
            return {
              id,
              status: 'open',
              url: 'https://checkout.stripe.test/stack/1',
            };
          },
        },
      },
      billingPortal: {
        sessions: {
          create: async (input: { customer: string; configuration: string }) => {
            portalCustomers.push(input.customer);
            portalConfigurations.push(input.configuration);
            return { url: 'https://billing.stripe.test/tenant-portal' };
          },
        },
        configurations: {
          retrieve: async (id: string) => ({
            id,
            active: true,
            features: {
              subscription_update: { enabled: false },
              subscription_pause: { enabled: false },
            },
          }),
        },
      },
      subscriptions: {
        update: async (id: string, input: any) => {
          const current = providerSubscriptions.get(id);
          if (!current) throw new Error(`missing provider subscription ${id}`);
          const updated = {
            ...current,
            cancel_at_period_end: input.cancel_at_period_end ?? current.cancel_at_period_end,
            metadata: input.metadata ?? current.metadata,
          };
          providerSubscriptions.set(id, updated);
          return updated;
        },
        retrieve: async (id: string) => {
          const subscription = providerSubscriptions.get(id);
          if (!subscription) throw new Error(`missing provider subscription ${id}`);
          return subscription;
        },
      },
      prices: {
        retrieve: async (id: string) => providerPrice(id),
      },
    },
  });

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerBillingRoutes } = await import('../src/routes/billing-routes.js');
  const { registerPlatformRoutes } = await import('../src/routes/platform-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'commerce-forward-model-test-secret' });
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request: any, raw: Buffer, done: any) => {
    request.rawBody = raw;
    try {
      done(null, raw.length ? JSON.parse(raw.toString('utf8')) : undefined);
    } catch (error) {
      done(error);
    }
  });
  await registerBillingRoutes(app);
  await registerPlatformRoutes(app);
  await app.ready();
});

test('v60 grandfathering marks only active/trialing rows that predate its first apply', () => {
  assert.deepEqual(grandfatherBackfillEvidence, {
    activeMarked: true,
    trialingMarked: true,
    postCutoverMarked: false,
  });
});

test('v60 converges a partial empty stack table with every required column, constraint, and index', () => {
  assert.deepEqual(v60ConvergenceEvidence, {
    columnsValid: true,
    constraintsValid: true,
    indexesValid: true,
  });
});

after(async () => {
  if (app) await app.close();
  __setStripeTestOverrides(null);

  for (const user of [owner, tenantAdmin, tenantMember, platformAdmin]) {
    if (!user) continue;
    try { await db.delete(subscriptions).where(eq(subscriptions.userId, user.id)); } catch {}
    try { await db.delete(addonSubscriptions).where(eq(addonSubscriptions.userId, user.id)); } catch {}
  }
  for (const module of createdModules) {
    try { await db.delete(planModules).where(eq(planModules.moduleId, module.id)); } catch {}
  }
  for (const user of [tenantAdmin, tenantMember, platformAdmin, owner]) {
    if (user) await cleanupUser(user.id);
  }
  for (const module of [...createdModules].reverse()) {
    await cleanupModule(module.id);
  }

  for (const key of managedEnvKeys) {
    const prior = savedEnv.get(key);
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
  }
});

test('public billing catalog exposes only the approved monthly application-stack prices', async () => {
  const response = await app.inject({ method: 'GET', url: '/v1/billing/catalog' });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();

  assert.deepEqual(
    body.coreProducts.map((product: any) => ({
      key: product.key,
      monthlyPriceCents: product.monthlyPriceCents,
      includedSeats: product.includedSeats,
    })),
    [
      { key: 'tradeflowkit', monthlyPriceCents: 14900, includedSeats: 5 },
      { key: 'pulsedesk', monthlyPriceCents: 14900, includedSeats: 5 },
      { key: 'techdeck', monthlyPriceCents: 9900, includedSeats: 5 },
    ],
  );
  assert.deepEqual(body.companionModules.map((module: any) => module.key), eligibleCompanions);
  assert.deepEqual(body.includedApps.map((module: any) => module.key), [
    'torqueshed',
    'faultlinelab',
    'ninja-pool-hall',
  ]);
  assert.equal(body.companionModuleMonthlyPriceCents, 2900);
  assert.equal(body.additionalSeatMonthlyPriceCents, 1500);
  assert.equal(body.operatorOsMonthlyPriceCents, 0);
  assert.equal('annualPriceCents' in body, false);
});

test('billing mutations are tenant-owner-only', async () => {
  const attempts = [
    {
      url: '/v1/billing/stack/checkout',
      payload: {
        interval: 'month',
        coreProduct: 'tradeflowkit',
        freeCompanionModule: 'snapproofos',
        additionalModules: [],
        additionalSeats: 0,
      },
    },
    {
      url: '/v1/billing/stack/free-companion',
      payload: { moduleKey: 'brandforgeos' },
    },
    {
      url: '/v1/billing/create-portal-session',
      payload: {},
    },
  ];

  for (const actor of [tenantAdmin, tenantMember]) {
    for (const attempt of attempts) {
      const response = await app.inject({
        method: 'POST',
        url: attempt.url,
        headers: bearer(actor, owner.currentTenantId!),
        payload: attempt.payload,
      });
      assert.equal(response.statusCode, 403, `${actor.id} ${attempt.url}: ${response.body}`);
      assert.equal(response.json().code, 'TENANT_OWNER_REQUIRED');
    }
  }
  assert.equal(customerCreateCalls, 0, 'denied users must not create Stripe customers');
  assert.equal(checkoutCreateCalls, 0, 'denied users must not create Stripe checkout sessions');
  assert.deepEqual(portalCustomers, [], 'denied users must not create Stripe portal sessions');
});

test('raw tenant billing state is restricted to billing administrators and redacted', async () => {
  for (const url of ['/v1/billing/stack', '/v1/billing/subscription', '/v1/billing/history']) {
    const denied = await app.inject({
      method: 'GET',
      url,
      headers: bearer(tenantMember, owner.currentTenantId!),
    });
    assert.equal(denied.statusCode, 403, `${url}: ${denied.body}`);
    assert.equal(denied.json().code, 'TENANT_BILLING_READ_REQUIRED');

    const allowed = await app.inject({
      method: 'GET',
      url,
      headers: bearer(tenantAdmin, owner.currentTenantId!),
    });
    assert.equal(allowed.statusCode, 200, `${url}: ${allowed.body}`);
    assert.doesNotMatch(allowed.body, /stripe_(?:customer|subscription|checkout|event)_id/i);
    assert.doesNotMatch(allowed.body, /cus_[A-Za-z0-9_]+|sub_[A-Za-z0-9_]+|cs_[A-Za-z0-9_]+/);
  }
});

test('application-stack checkout is monthly-only, resumes an open checkout, and enforces one flagship per tenant', async () => {
  for (const interval of ['year', 'annual']) {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/billing/stack/checkout',
      headers: bearer(owner),
      payload: {
        interval,
        coreProduct: 'tradeflowkit',
        freeCompanionModule: 'snapproofos',
        additionalModules: ['brandforgeos'],
        additionalSeats: 2,
      },
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().code, 'APPLICATION_STACK_MONTHLY_ONLY');
  }
  assert.equal(customerCreateCalls, 0, 'invalid annual requests must stop before Stripe');

  const first = await app.inject({
    method: 'POST',
    url: '/v1/billing/stack/checkout',
    headers: bearer(owner),
    payload: {
      interval: 'month',
      coreProduct: 'tradeflowkit',
      freeCompanionModule: 'snapproofos',
      additionalModules: ['brandforgeos'],
      additionalSeats: 2,
    },
  });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().sessionId, 'cs_stack_contract_1');
  assert.equal(first.json().url, 'https://checkout.stripe.test/stack/1');

  const rows = await db.select()
    .from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.tenantId, owner.currentTenantId!));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].initiatedByUserId, owner.id);
  assert.equal(rows[0].coreProduct, 'tradeflowkit');
  assert.equal(rows[0].includedCompanionKey, 'snapproofos');
  assert.deepEqual(rows[0].additionalModuleKeys, ['brandforgeos']);
  assert.equal(rows[0].additionalSeats, 2);
  assert.equal(rows[0].status, 'incomplete');
  assert.equal(rows[0].stripeCustomerId, 'cus_tenant_contract_1');
  assert.equal(rows[0].stripeCheckoutSessionId, 'cs_stack_contract_1');

  const resumed = await app.inject({
    method: 'POST',
    url: '/v1/billing/stack/checkout',
    headers: bearer(owner),
    payload: {
      interval: 'month',
      coreProduct: 'pulsedesk',
      freeCompanionModule: 'studyforge-ai',
      additionalModules: [],
      additionalSeats: 0,
    },
  });
  assert.equal(resumed.statusCode, 200, resumed.body);
  assert.equal(resumed.json().sessionId, 'cs_stack_contract_1');
  assert.equal(resumed.json().url, 'https://checkout.stripe.test/stack/1');
  assert.equal(customerCreateCalls, 1);
  assert.equal(checkoutCreateCalls, 1);
  assert.equal(checkoutRetrieveCalls, 1);

  const [resumedRow] = await db.select()
    .from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.tenantId, owner.currentTenantId!));
  assert.equal(resumedRow.coreProduct, 'tradeflowkit', 'resuming cannot change the pending stack selection');
  assert.equal(resumedRow.includedCompanionKey, 'snapproofos');

});

test('signed stack webhook binds the exact intent, activates every purchased benefit, and rejects foreign or stale metadata', async () => {
  const [pending] = await db.select()
    .from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.tenantId, owner.currentTenantId!));
  assert.ok(pending);

  const forged = await sendStackWebhook(
    stackCheckoutEvent({ id: 'evt_stack_forged', applicationSubscriptionId: pending.id }),
    'forged-signature',
  );
  assert.equal(forged.statusCode, 400, forged.body);
  assert.equal(forged.json().code, 'WEBHOOK_REJECTED');

  const foreign = await sendStackWebhook(stackCheckoutEvent({
    id: 'evt_stack_foreign_tenant',
    applicationSubscriptionId: pending.id,
    tenantId: tenantAdmin.currentTenantId!,
  }));
  assert.equal(foreign.statusCode, 503, foreign.body);
  assert.equal(foreign.json().handled, false);
  assert.equal(foreign.json().code, 'WEBHOOK_PROCESSING_RETRY_REQUIRED');

  const stale = await sendStackWebhook(stackCheckoutEvent({
    id: 'evt_stack_stale_customer',
    applicationSubscriptionId: pending.id,
    customerId: 'cus_stale_foreign_customer',
  }));
  assert.equal(stale.statusCode, 503, stale.body);
  assert.equal(stale.json().handled, false);
  assert.equal(stale.json().code, 'WEBHOOK_PROCESSING_RETRY_REQUIRED');

  const noAccessYet = await db.select()
    .from(tenantEntitlements)
    .where(eq(tenantEntitlements.tenantId, owner.currentTenantId!));
  assert.equal(noAccessYet.length, 0, 'unverified, foreign, and stale events cannot grant access');
  const foreignAccess = await db.select()
    .from(tenantEntitlements)
    .where(eq(tenantEntitlements.tenantId, tenantAdmin.currentTenantId!));
  assert.equal(foreignAccess.length, 0, 'foreign metadata cannot redirect access to another tenant');

  const acceptedEvent = stackCheckoutEvent({
    id: 'evt_stack_exact_binding',
    applicationSubscriptionId: pending.id,
    checkoutAttemptId: String((pending.metadata as any)?.checkout_attempt_id),
  });
  const pendingPaymentEvent = structuredClone(acceptedEvent);
  pendingPaymentEvent.id = 'evt_stack_payment_pending';
  pendingPaymentEvent.data.object.payment_status = 'unpaid';
  const paymentPending = await sendStackWebhook(pendingPaymentEvent);
  assert.equal(paymentPending.statusCode, 200, paymentPending.body);
  assert.equal(paymentPending.json().action, 'core_product_stack_payment_pending');
  assert.equal(
    (await db.select().from(tenantEntitlements)
      .where(eq(tenantEntitlements.tenantId, owner.currentTenantId!))).length,
    0,
    'completed-but-unpaid Checkout must wait for async payment success before granting',
  );
  await db.update(tenants)
    .set({ metadata: { unrelatedTenantSetting: 'preserve-me' } })
    .where(eq(tenants.id, owner.currentTenantId!));
  providerSubscriptions.set(
    'sub_stack_contract_1',
    providerSubscriptionForCheckout(acceptedEvent, { seatQuantity: 99 }),
  );
  const providerMismatch = await sendStackWebhook(acceptedEvent);
  assert.equal(providerMismatch.statusCode, 503, providerMismatch.body);
  assert.equal(providerMismatch.json().code, 'WEBHOOK_PROCESSING_RETRY_REQUIRED');
  const grantsAfterMismatch = await db.select()
    .from(tenantEntitlements)
    .where(eq(tenantEntitlements.tenantId, owner.currentTenantId!));
  assert.equal(grantsAfterMismatch.length, 0, 'wrong provider quantity must never grant access');

  providerSubscriptions.set('sub_stack_contract_1', providerSubscriptionForCheckout(acceptedEvent));
  const accepted = await sendStackWebhook(acceptedEvent);
  assert.equal(accepted.statusCode, 200, accepted.body);
  assert.equal(accepted.json().handled, true);
  assert.equal(accepted.json().action, 'core_product_stack_activated');

  const [settled] = await db.select()
    .from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.id, pending.id));
  assert.equal(settled.tenantId, owner.currentTenantId);
  assert.equal(settled.stripeCustomerId, 'cus_tenant_contract_1');
  assert.equal(settled.stripeCheckoutSessionId, 'cs_stack_contract_1');
  assert.equal(settled.stripeSubscriptionId, 'sub_stack_contract_1');
  assert.equal(settled.status, 'active');

  const claimedDeliveries = await db.select().from(billingEvents)
    .where(eq(billingEvents.stripeEventId, acceptedEvent.id));
  assert.equal(claimedDeliveries.length, 1, 'a provider retry must preserve one Stripe event identity');
  assert.equal(claimedDeliveries[0].retryCount, 1);
  assert.ok(claimedDeliveries[0].processedAt);

  const active = await db.select()
    .from(tenantEntitlements)
    .where(eq(tenantEntitlements.tenantId, owner.currentTenantId!));
  assert.equal(active.length, 7);
  assert.deepEqual(
    active.map(row => `${row.entitlementType}:${row.entitlementKey}:${row.source}`).sort(),
    [
      'companion_module:brandforgeos:stripe',
      'companion_module:snapproofos:selected_free_companion',
      'core_product:tradeflowkit:stripe',
      'included_app:faultlinelab:included_with_core',
      'included_app:ninja-pool-hall:included_with_core',
      'included_app:torqueshed:included_with_core',
      'seat_pack:additional-seats:stripe',
    ],
  );
  const seatPack = active.find(row => row.entitlementType === 'seat_pack');
  assert.equal((seatPack?.metadata as any)?.quantity, 2);
  const [tenant] = await db.select({ seatLimit: tenants.seatLimit, metadata: tenants.metadata })
    .from(tenants)
    .where(eq(tenants.id, owner.currentTenantId!));
  assert.equal(tenant.seatLimit, 7);
  assert.equal((tenant.metadata as any)?.unrelatedTenantSetting, 'preserve-me');
  assert.equal((tenant.metadata as any)?.pricingModel, 'core_product_stack');

  const replay = await sendStackWebhook(acceptedEvent);
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().action, 'duplicate_ignored');
  const afterReplay = await db.select()
    .from(tenantEntitlements)
    .where(eq(tenantEntitlements.tenantId, owner.currentTenantId!));
  assert.equal(afterReplay.length, 7, 'signed event replay must not duplicate entitlements');

  const secondFlagship = await app.inject({
    method: 'POST',
    url: '/v1/billing/stack/checkout',
    headers: bearer(owner),
    payload: {
      interval: 'month',
      coreProduct: 'pulsedesk',
      freeCompanionModule: 'studyforge-ai',
      additionalModules: [],
      additionalSeats: 0,
    },
  });
  assert.equal(secondFlagship.statusCode, 409, secondFlagship.body);
  assert.equal(secondFlagship.json().code, 'STACK_FLAGSHIP_LIMIT');
  assert.equal(customerCreateCalls, 1);
  assert.equal(checkoutCreateCalls, 1);
});

test('tenant billing portal reuses the stack-owned Stripe customer', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/billing/create-portal-session',
    headers: bearer(owner),
    payload: {},
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().url, 'https://billing.stripe.test/tenant-portal');
  assert.deepEqual(portalCustomers, ['cus_tenant_contract_1']);
  assert.deepEqual(portalConfigurations, ['bpc_operatoros_restrictive']);

  const [row] = await db.select({ stripeCustomerId: tenantApplicationSubscriptions.stripeCustomerId })
    .from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.tenantId, owner.currentTenantId!));
  assert.equal(row.stripeCustomerId, portalCustomers[0]);
});

test('billing portal fails closed when one Stripe customer is linked to another tenant', async () => {
  const [plan] = await db.select().from(subscriptionPlans)
    .where(eq(subscriptionPlans.slug, 'pro'))
    .limit(1);
  const [foreignLegacy] = await db.insert(subscriptions).values({
    userId: tenantAdmin.id,
    tenantId: tenantAdmin.currentTenantId!,
    planId: plan.id,
    status: 'active',
    stripeCustomerId: 'cus_tenant_contract_1',
  }).returning();
  await db.execute(sql`
    UPDATE subscriptions
    SET legacy_access_grandfathered_at=clock_timestamp()
    WHERE id=${foreignLegacy.id}
  `);
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/billing/create-portal-session',
      headers: bearer(owner),
      payload: {},
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().code, 'STRIPE_CUSTOMER_TENANT_AMBIGUOUS');
    assert.deepEqual(portalCustomers, ['cus_tenant_contract_1'], 'unsafe portal must not reach Stripe');
  } finally {
    await db.delete(subscriptions).where(eq(subscriptions.id, foreignLegacy.id));
  }
});

test('subscription lifecycle events may bind before checkout but cannot grant or revive a terminal stack', async () => {
  const checkout = await app.inject({
    method: 'POST',
    url: '/v1/billing/stack/checkout',
    headers: bearer(tenantAdmin),
    payload: {
      interval: 'month',
      coreProduct: 'tradeflowkit',
      freeCompanionModule: 'snapproofos',
      additionalModules: ['brandforgeos'],
      additionalSeats: 2,
    },
  });
  assert.equal(checkout.statusCode, 200, checkout.body);
  assert.equal(checkout.json().sessionId, 'cs_stack_contract_2');

  const [pending] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.tenantId, tenantAdmin.currentTenantId!));
  const checkoutEvent = stackCheckoutEvent({
    id: 'evt_stack_checkout_after_terminal',
    applicationSubscriptionId: pending.id,
    tenantId: tenantAdmin.currentTenantId!,
    userId: tenantAdmin.id,
    checkoutAttemptId: String((pending.metadata as any)?.checkout_attempt_id),
    customerId: 'cus_tenant_contract_2',
    checkoutSessionId: 'cs_stack_contract_2',
    stripeSubscriptionId: 'sub_stack_out_of_order',
  });
  const providerSubscription = providerSubscriptionForCheckout(checkoutEvent);
  providerSubscriptions.set('sub_stack_out_of_order', providerSubscription);

  const created = await sendStackWebhook({
    id: 'evt_stack_created_before_checkout',
    type: 'customer.subscription.created',
    data: { object: providerSubscription },
  });
  assert.equal(created.statusCode, 200, created.body);
  assert.equal(created.json().action, 'core_product_stack_created_deferred');
  const [bound] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.id, pending.id));
  assert.equal(bound.status, 'incomplete');
  assert.equal(bound.stripeSubscriptionId, 'sub_stack_out_of_order');
  assert.equal(
    (await db.select().from(tenantEntitlements)
      .where(eq(tenantEntitlements.tenantId, tenantAdmin.currentTenantId!))).length,
    0,
    'subscription.created before checkout may bind but cannot grant',
  );

  const deleted = await sendStackWebhook({
    id: 'evt_stack_deleted_before_checkout',
    type: 'customer.subscription.deleted',
    data: { object: { ...providerSubscription, status: 'canceled' } },
  });
  assert.equal(deleted.statusCode, 200, deleted.body);
  assert.equal(deleted.json().action, 'core_product_stack_deactivated');
  const [terminal] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.id, pending.id));
  assert.equal(terminal.status, 'canceled');

  providerSubscriptions.set(
    'sub_stack_out_of_order',
    providerSubscriptionForCheckout(checkoutEvent, { seatQuantity: 77 }),
  );
  const terminalDrift = await sendStackWebhook({
    id: 'evt_stack_provider_drift_after_terminal',
    type: 'customer.subscription.updated',
    data: { object: providerSubscription },
  });
  assert.equal(terminalDrift.statusCode, 200, terminalDrift.body);
  assert.equal(terminalDrift.json().action, 'core_product_stack_provider_drift_deactivated');
  const [terminalAfterDrift] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.id, pending.id));
  assert.equal(terminalAfterDrift.status, 'canceled', 'provider drift cannot turn a terminal row into a recoverable quarantine');
  providerSubscriptions.set('sub_stack_out_of_order', providerSubscription);

  const staleActiveUpdate = await sendStackWebhook({
    id: 'evt_stack_active_update_after_terminal',
    type: 'customer.subscription.updated',
    data: { object: providerSubscription },
  });
  assert.equal(staleActiveUpdate.statusCode, 200, staleActiveUpdate.body);
  assert.equal(staleActiveUpdate.json().action, 'core_product_stack_terminal_update_ignored');
  const [stillTerminal] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.id, pending.id));
  assert.equal(stillTerminal.status, 'canceled', 'an active provider update cannot revive a terminal local contract');

  const lateCheckout = await sendStackWebhook(checkoutEvent);
  assert.equal(lateCheckout.statusCode, 200, lateCheckout.body);
  assert.equal(lateCheckout.json().action, 'core_product_stack_checkout_rejected_terminal');
  assert.equal(
    (await db.select().from(tenantEntitlements)
      .where(eq(tenantEntitlements.tenantId, tenantAdmin.currentTenantId!))).length,
    0,
    'late checkout cannot revive a provider-terminal stack',
  );
  providerSubscriptions.set('sub_stack_out_of_order', { ...providerSubscription, status: 'canceled' });

  const replacement = await app.inject({
    method: 'POST',
    url: '/v1/billing/stack/checkout',
    headers: bearer(tenantAdmin),
    payload: {
      interval: 'month',
      coreProduct: 'pulsedesk',
      freeCompanionModule: 'studyforge-ai',
      additionalModules: [],
      additionalSeats: 0,
    },
  });
  assert.equal(replacement.statusCode, 200, replacement.body);
  const [replacementPending] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.id, pending.id));
  assert.equal(replacementPending.status, 'incomplete');
  assert.notEqual(
    (replacementPending.metadata as any)?.checkout_attempt_id,
    (pending.metadata as any)?.checkout_attempt_id,
  );

  const staleUpdate = await sendStackWebhook({
    id: 'evt_stack_stale_update_prior_checkout_generation',
    type: 'customer.subscription.updated',
    data: { object: providerSubscription },
  });
  assert.equal(staleUpdate.statusCode, 200, staleUpdate.body);
  assert.equal(staleUpdate.json().action, 'core_product_stack_stale_updated_generation_ignored');

  const staleCreated = await sendStackWebhook({
    id: 'evt_stack_stale_created_prior_checkout_generation',
    type: 'customer.subscription.created',
    data: { object: providerSubscription },
  });
  assert.equal(staleCreated.statusCode, 200, staleCreated.body);
  assert.equal(staleCreated.json().action, 'core_product_stack_stale_created_generation_ignored');

  const staleCheckout = await sendStackWebhook({
    ...checkoutEvent,
    id: 'evt_stack_stale_checkout_prior_checkout_generation',
  });
  assert.equal(staleCheckout.statusCode, 200, staleCheckout.body);
  assert.equal(staleCheckout.json().action, 'core_product_stack_stale_checkout_generation_ignored');

  const stalePriorGeneration = await sendStackWebhook({
    id: 'evt_stack_stale_delete_prior_checkout_generation',
    type: 'customer.subscription.deleted',
    data: { object: { ...providerSubscription, status: 'canceled' } },
  });
  assert.equal(stalePriorGeneration.statusCode, 200, stalePriorGeneration.body);
  assert.equal(stalePriorGeneration.json().action, 'core_product_stack_stale_delete_generation_ignored');
  const [stillPending] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.id, pending.id));
  assert.equal(stillPending.status, 'incomplete');
  assert.equal(stillPending.stripeSubscriptionId, null);

  const replacementMetadata = {
    billing_model: 'core_product_stack',
    tenant_id: tenantAdmin.currentTenantId!,
    user_id: tenantAdmin.id,
    selected_core_product: 'pulsedesk',
    selected_free_companion_module: 'studyforge-ai',
    additional_module_keys: '',
    additional_seats: '0',
    internal_application_subscription_id: replacementPending.id,
    checkout_attempt_id: String((replacementPending.metadata as any)?.checkout_attempt_id),
    billing_interval: 'month',
  };
  const replacementProvider = {
    id: 'sub_stack_replacement_failed',
    customer: replacementPending.stripeCustomerId,
    status: 'active',
    cancel_at_period_end: false,
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    metadata: replacementMetadata,
    items: { data: [{ price: { id: process.env.STRIPE_PRICE_PULSEDESK_MONTHLY }, quantity: 2 }] },
  };
  providerSubscriptions.set(replacementProvider.id, replacementProvider);
  const invalidCreated = await sendStackWebhook({
    id: 'evt_stack_invalid_created_before_replacement_checkout',
    type: 'customer.subscription.created',
    data: { object: replacementProvider },
  });
  assert.equal(invalidCreated.statusCode, 200, invalidCreated.body);
  const [failedReplacement] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.id, pending.id));
  assert.equal(failedReplacement.status, 'checkout_failed');

  const correctedReplacementProvider = {
    ...replacementProvider,
    items: { data: [{ price: { id: process.env.STRIPE_PRICE_PULSEDESK_MONTHLY }, quantity: 1 }] },
  };
  providerSubscriptions.set(replacementProvider.id, correctedReplacementProvider);
  const correctedWithoutCheckout = await sendStackWebhook({
    id: 'evt_stack_corrected_update_without_replacement_checkout',
    type: 'customer.subscription.updated',
    data: { object: correctedReplacementProvider },
  });
  assert.equal(correctedWithoutCheckout.statusCode, 200, correctedWithoutCheckout.body);
  assert.equal(correctedWithoutCheckout.json().action, 'core_product_stack_terminal_update_ignored');
  assert.equal(
    (await db.select().from(tenantEntitlements)
      .where(eq(tenantEntitlements.tenantId, tenantAdmin.currentTenantId!))).length,
    0,
    'a corrected provider update cannot bypass the checkout-completed grant gate',
  );
  const checkoutCallsBeforeBlockedReplacement = checkoutCreateCalls;
  const duplicateProviderCheckout = await app.inject({
    method: 'POST',
    url: '/v1/billing/stack/checkout',
    headers: bearer(tenantAdmin),
    payload: {
      interval: 'month',
      coreProduct: 'techdeck',
      freeCompanionModule: 'snapproofos',
      additionalModules: [],
      additionalSeats: 0,
    },
  });
  assert.equal(duplicateProviderCheckout.statusCode, 409, duplicateProviderCheckout.body);
  assert.equal(duplicateProviderCheckout.json().code, 'STACK_PROVIDER_SUBSCRIPTION_EXISTS');
  assert.equal(checkoutCreateCalls, checkoutCallsBeforeBlockedReplacement, 'a second paid Checkout must not be created');
});

test('provider item drift deactivates access, exact correction recovers it, and cancellation keeps grace access', async () => {
  const [stack] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.tenantId, owner.currentTenantId!));
  const checkoutEvent = stackCheckoutEvent({
    id: 'evt_stack_fixture_for_update',
    applicationSubscriptionId: stack.id,
    checkoutAttemptId: String((stack.metadata as any)?.checkout_attempt_id),
  });
  const wrongQuantity = providerSubscriptionForCheckout(checkoutEvent, { seatQuantity: 12 });
  providerSubscriptions.set('sub_stack_contract_1', wrongQuantity);

  const drift = await sendStackWebhook({
    id: 'evt_stack_update_wrong_quantity',
    type: 'customer.subscription.updated',
    data: { object: wrongQuantity },
  });
  assert.equal(drift.statusCode, 200, drift.body);
  assert.equal(drift.json().action, 'core_product_stack_provider_drift_deactivated');
  const [quarantined] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.id, stack.id));
  assert.equal(quarantined.status, 'past_due');
  assert.equal(
    (await db.select().from(tenantEntitlements).where(and(
      eq(tenantEntitlements.tenantId, owner.currentTenantId!),
      eq(tenantEntitlements.active, true),
    ))).length,
    0,
  );

  const correctedProvider = providerSubscriptionForCheckout(checkoutEvent);
  providerSubscriptions.set('sub_stack_contract_1', correctedProvider);
  const corrected = await sendStackWebhook({
    id: 'evt_stack_update_corrected',
    type: 'customer.subscription.updated',
    data: { object: correctedProvider },
  });
  assert.equal(corrected.statusCode, 200, corrected.body);
  assert.equal(corrected.json().action, 'core_product_stack_updated');
  assert.equal(
    (await db.select().from(tenantEntitlements).where(and(
      eq(tenantEntitlements.tenantId, owner.currentTenantId!),
      eq(tenantEntitlements.active, true),
    ))).length,
    7,
    'only a fully revalidated provider subscription may recover quarantined access',
  );

  const cancel = await app.inject({
    method: 'POST',
    url: '/v1/billing/cancel',
    headers: bearer(owner),
    payload: {},
  });
  assert.equal(cancel.statusCode, 200, cancel.body);
  const [canceling] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.id, stack.id));
  assert.equal(canceling.status, 'canceling');
  assert.equal(canceling.cancelAtPeriodEnd, true);
  assert.equal(
    (await db.select().from(tenantEntitlements).where(and(
      eq(tenantEntitlements.tenantId, owner.currentTenantId!),
      eq(tenantEntitlements.active, true),
    ))).length,
    7,
    'scheduled cancellation keeps paid access through the provider period',
  );

  const reactivate = await app.inject({
    method: 'POST',
    url: '/v1/billing/reactivate',
    headers: bearer(owner),
    payload: {},
  });
  assert.equal(reactivate.statusCode, 200, reactivate.body);
  const [reactivated] = await db.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.id, stack.id));
  assert.equal(reactivated.status, 'active');
  assert.equal(reactivated.cancelAtPeriodEnd, false);
});

test('legacy plan and per-module purchase APIs are closed while existing grants remain readable', async () => {
  for (const url of ['/v1/billing/subscribe', '/v1/billing/create-checkout-session']) {
    const response = await app.inject({
      method: 'POST',
      url,
      headers: bearer(tenantMember),
      payload: { planSlug: 'pro', interval: 'month' },
    });
    assert.equal(response.statusCode, 409, `${url}: ${response.body}`);
    assert.equal(response.json().code, 'LEGACY_PLAN_SALES_CLOSED');
  }

  const addonPurchase = await app.inject({
    method: 'POST',
    url: '/v1/billing/addons/subscribe',
    headers: bearer(owner),
    payload: { moduleSlug: 'brandforgeos' },
  });
  assert.equal(addonPurchase.statusCode, 409, addonPurchase.body);
  assert.equal(addonPurchase.json().code, 'LEGACY_ADDON_SALES_CLOSED');

  const [pro] = await db.select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.slug, 'pro'))
    .limit(1);
  assert.ok(pro, 'canonical pro plan fixture must exist');
  const planModule = createdModules.find(module => module.slug === 'studyforge-ai')!;
  const addonModule = createdModules.find(module => module.slug === 'ninjamation')!;
  await db.insert(planModules).values({ planId: pro.id, moduleId: planModule.id });
  const [legacyPlanSubscription] = await db.insert(subscriptions).values({
    userId: tenantMember.id,
    tenantId: owner.currentTenantId!,
    planId: pro.id,
    status: 'active',
  }).returning();

  assert.equal(
    await evaluateUserEntitlement(tenantMember.id, owner.currentTenantId!, planModule.id),
    null,
    'an active legacy-shaped row created after the v60 cutover is not a sale or an application grant',
  );
  await db.execute(sql`
    UPDATE subscriptions
    SET legacy_access_grandfathered_at=clock_timestamp()
    WHERE id=${legacyPlanSubscription.id}
  `);
  assert.equal(
    await evaluateUserEntitlement(tenantMember.id, owner.currentTenantId!, planModule.id),
    'plan',
  );

  await db.insert(addonSubscriptions).values({
    userId: tenantMember.id,
    tenantId: owner.currentTenantId!,
    moduleId: addonModule.id,
    status: 'active',
    amount: 2900,
  });
  assert.equal(
    await evaluateUserEntitlement(tenantMember.id, owner.currentTenantId!, addonModule.id),
    'addon',
  );
});

test('pricing administration and readiness expose only six shared-price companions and reject per-module mutation', async () => {
  const headers = bearer(platformAdmin);
  const pricingResponse = await app.inject({
    method: 'GET',
    url: '/v1/platform/pricing',
    headers,
  });
  assert.equal(pricingResponse.statusCode, 200, pricingResponse.body);
  const pricingBody = pricingResponse.json();
  assert.deepEqual(pricingBody.pricing.map((row: any) => row.slug).sort(), [...eligibleCompanions].sort());
  assert.equal(pricingBody.total, 6);
  for (const row of pricingBody.pricing) {
    assert.equal(row.declaredAddonPriceCents, 2900);
    assert.equal(row.envKey, 'STRIPE_PRICE_COMPANION_MODULE_MONTHLY');
    assert.equal(row.envKeyConfigured, true);
    assert.equal(row.stripeFetched, true);
    assert.equal(row.mismatch, false);
    assert.equal(row.stripeUnitAmountCents, 2900);
  }
  assert.equal(pricingBody.applicationStackProviderValidated, true);

  const healthResponse = await app.inject({
    method: 'GET',
    url: '/v1/platform/health',
    headers,
  });
  assert.equal(healthResponse.statusCode, 200, healthResponse.body);
  const addonPriceIds = healthResponse.json().modules.addonPriceIds;
  assert.deepEqual(Object.keys(addonPriceIds).sort(), [...eligibleCompanions].sort());
  assert.deepEqual(Object.values(addonPriceIds), [true, true, true, true, true, true]);
  const applicationStackHealth = healthResponse.json().applicationStack;
  assert.equal(applicationStackHealth.envConfigured, true);
  assert.equal(applicationStackHealth.providerValidated, true);
  assert.deepEqual(applicationStackHealth.corePriceIdsProviderValidated, {
    tradeflowkit: true,
    pulsedesk: true,
    techdeck: true,
  });
  assert.equal(applicationStackHealth.companionPriceProviderValidated, true);
  assert.equal(applicationStackHealth.additionalSeatPriceProviderValidated, true);
  assert.equal(applicationStackHealth.portalConfigurationEnvConfigured, true);
  assert.equal(applicationStackHealth.portalConfigurationProviderValidated, true);
  assert.deepEqual(applicationStackHealth.validationErrors, []);

  const targets = ['snapproofos', 'tradeflowkit', 'torqueshed', 'outcall'];
  const mutations = [
    { method: 'POST', suffix: 'sync-from-stripe', payload: undefined },
    { method: 'POST', suffix: 'create-stripe-price', payload: { unitAmountCents: 2900, currency: 'usd' } },
  ];
  for (const slug of targets) {
    for (const mutation of mutations) {
      const response = await app.inject({
        method: mutation.method,
        url: `/v1/platform/pricing/${slug}/${mutation.suffix}`,
        headers,
        payload: mutation.payload,
      });
      assert.equal(response.statusCode, 409, `${slug}/${mutation.suffix}: ${response.body}`);
      assert.equal(response.json().code, 'APPLICATION_STACK_SHARED_PRICE_REQUIRED');
    }

    const binding = await app.inject({
      method: 'PUT',
      url: `/v1/platform/modules/${slug}/stripe-price-id`,
      headers,
      payload: { stripePriceId: 'price_individual_binding_forbidden' },
    });
    assert.equal(binding.statusCode, 409, `${slug}/stripe-price-id: ${binding.body}`);
    assert.equal(binding.json().code, 'APPLICATION_STACK_SHARED_PRICE_REQUIRED');

    const perModulePrice = await app.inject({
      method: 'PUT',
      url: `/v1/platform/modules/${slug}/addon-price`,
      headers,
      payload: { addonPriceCents: 2900 },
    });
    assert.equal(perModulePrice.statusCode, 409, `${slug}/addon-price: ${perModulePrice.body}`);
    assert.equal(perModulePrice.json().code, 'APPLICATION_STACK_SHARED_PRICE_REQUIRED');
  }

  const leakedExcluded = pricingBody.pricing
    .map((row: any) => row.slug)
    .filter((slug: string) => excludedFromCompanionSales.includes(slug as any));
  assert.deepEqual(leakedExcluded, []);
});
