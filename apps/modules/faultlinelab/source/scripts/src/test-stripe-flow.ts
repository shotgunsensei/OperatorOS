/**
 * test-stripe-flow.ts — Stripe purchase end-to-end test for Faultline Lab.
 *
 * What this verifies (against the *test-mode* Stripe Connector, end-to-end
 * through the application's own checkout endpoint):
 *
 *   1. The Stripe schema (`stripe.products`, `stripe.prices`) actually has
 *      the catalog product we want to buy. Catches missing seed data and
 *      stripe-replit-sync regressions.
 *   2. POST `/api/stripe/checkout-by-catalog` (the real app endpoint, with a
 *      test-only auth bypass) provisions the user, picks the right Stripe
 *      price, creates a Stripe Customer, and returns a Checkout Session
 *      whose metadata includes the user id, clerk id, and catalog id.
 *   3. A real test-mode Stripe PaymentIntent for the same customer, amount,
 *      and currency is created and confirmed with the documented
 *      `pm_card_visa` PaymentMethod, proving the Stripe account can
 *      actually process a card charge. (We charge a side-PaymentIntent
 *      rather than the Session's own PaymentIntent because Stripe only
 *      attaches a PaymentIntent to a Checkout Session after the hosted
 *      page is opened — there is no public API to attach one beforehand.)
 *   4. The `checkout.session.completed` event is signed with the secret
 *      from `stripe._managed_webhooks` and POSTed to `/api/stripe/webhook`
 *      using the *real* Checkout Session id (so `stripe-replit-sync`'s
 *      `listLineItems(sessionId)` call against Stripe succeeds) and the
 *      *real* test-mode PaymentIntent id from step (3). The api-server
 *      then creates rows in `user_entitlements` and `purchases`, and
 *      `stripe-replit-sync` mirrors the session into
 *      `stripe.checkout_sessions`.
 *
 *      We always sign + POST the event ourselves rather than waiting for
 *      Stripe to deliver one. Stripe never delivers a `checkout.session.
 *      completed` event for a session whose hosted page was never opened,
 *      so polling for a "live" delivery would always time out. The
 *      ingestion path being exercised is otherwise identical: same
 *      endpoint, same signature verification, same handler.
 *
 * What this does NOT verify (intentionally out of scope):
 *
 *   - Driving the hosted Stripe Checkout page in a headless browser. Stripe
 *     does not expose a public API to "complete" a Checkout Session
 *     directly. The combination of (3) — proving real card processing —
 *     and (4) — exercising the real signed-webhook ingestion path with
 *     real Stripe object ids — is the closest faithful coverage that
 *     stays scriptable.
 *
 * Auth bypass:
 *   The script calls the real protected endpoint by sending two headers:
 *     x-e2e-test-token: <E2E_AUTH_TOKEN>
 *     x-e2e-clerk-id:   <a fresh test clerk id>
 *   `requireAuth` accepts this only when ALL of the following hold:
 *     - REPLIT_DEPLOYMENT !== "1" (not a production deployment)
 *     - ENABLE_E2E_AUTH_BYPASS === "1" on the server
 *     - E2E_AUTH_TOKEN is set on the server and matches the header
 *   See `artifacts/api-server/src/middlewares/requireAuth.ts`. The script
 *   itself reads E2E_AUTH_TOKEN from its own env to send the header.
 *
 * How to run (from the repo root):
 *
 *     # 1. Make sure the api-server workflow is running.
 *     # 2. Make sure Stripe products are seeded:
 *     pnpm --filter @workspace/scripts run seed-products
 *     # 3. Run the test:
 *     pnpm --filter @workspace/scripts run test-stripe-flow
 *
 * Useful environment overrides (all optional):
 *
 *     TEST_CATALOG_PRODUCT_ID   Catalog id to purchase. Default: pack-network-ops.
 *     TEST_API_BASE             Base URL for the api-server. Default:
 *                               https://$REPLIT_DEV_DOMAIN
 *     TEST_WEBHOOK_URL          Override the webhook URL used for the
 *                               fallback synthetic POST. Default: the
 *                               managed webhook in `stripe._managed_webhooks`
 *                               whose URL matches the api-base host.
 *     TEST_KEEP_DATA            "1" → skip cleanup (debugging).
 *     ALLOW_PROD_E2E            "1" → bypass the safety check that refuses
 *                               to run inside a production deployment
 *                               (REPLIT_DEPLOYMENT=1). Use with extreme
 *                               care: it would hit the live Stripe account
 *                               and the live SESSION_SECRET-based bypass.
 *
 * Stripe test cards reference (manual hosted-page path, for humans):
 *     4242 4242 4242 4242  — succeeds
 *     4000 0000 0000 9995  — declines (insufficient_funds)
 *     4000 0025 0000 3155  — requires 3D Secure
 *
 * Exit codes: 0 on success, 1 on any failure.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import Stripe from 'stripe';
import { getUncachableStripeClient } from './stripeClient';

const TEST_CATALOG_PRODUCT_ID =
  process.env.TEST_CATALOG_PRODUCT_ID || 'pack-network-ops';
const KEEP_DATA = process.env.TEST_KEEP_DATA === '1';

function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
// Same path the api-server writes to
// (artifacts/api-server/src/lib/e2eAuthToken.ts).
const E2E_TOKEN_PATH = resolve(findWorkspaceRoot(), '.local/.e2e-auth-token');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
if (!process.env.E2E_AUTH_TOKEN) {
  if (existsSync(E2E_TOKEN_PATH)) {
    const onDisk = readFileSync(E2E_TOKEN_PATH, 'utf8').trim();
    if (onDisk) process.env.E2E_AUTH_TOKEN = onDisk;
  }
}
if (!process.env.E2E_AUTH_TOKEN) {
  console.error(
    'No E2E auth token available. Set ENABLE_E2E_AUTH_BYPASS=1 on the ' +
      'api-server workflow and restart it; the server will write a fresh ' +
      'token to .local/.e2e-auth-token which this script then picks up. ' +
      '(Or set E2E_AUTH_TOKEN explicitly in both processes.)',
  );
  process.exit(1);
}

if (process.env.REPLIT_DEPLOYMENT === '1' && process.env.ALLOW_PROD_E2E !== '1') {
  console.error(
    'Refusing to run inside a production deployment (REPLIT_DEPLOYMENT=1). ' +
      'This script creates real Stripe Checkout Sessions and confirms ' +
      'real (test-mode) PaymentIntents against the configured Stripe ' +
      'account. Run it from the dev workspace. Override with ' +
      'ALLOW_PROD_E2E=1 only if you really know what you are doing.',
  );
  process.exit(1);
}

const API_BASE = (
  process.env.TEST_API_BASE ||
  (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : 'http://localhost:80')
).replace(/\/$/, '');

const EXPECTED_HOST = (() => {
  try {
    return new URL(API_BASE).host;
  } catch {
    console.error(`Invalid TEST_API_BASE: ${API_BASE}`);
    process.exit(1);
  }
})();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let createdUserId: string | null = null;
let createdCustomerId: string | null = null;
const createdClerkId = `test_clerk_e2e_${randomUUID()}`;

// Additional users provisioned by the yearly-preselect verification block.
// Tracked separately so cleanup removes them too.
const extraCreatedUserIds: string[] = [];
const extraCreatedCustomerIds: string[] = [];

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  process.stdout.write(`  • ${label} ... `);
  try {
    const out = await fn();
    process.stdout.write('ok\n');
    return out;
  } catch (err: any) {
    process.stdout.write('FAIL\n');
    console.error(`    ${err?.message || err}`);
    throw err;
  }
}

async function ensureCatalogProduct(): Promise<{
  stripePriceId: string;
  unitAmount: number;
  currency: string;
}> {
  const productRow = await pool.query<{ id: string }>(
    `SELECT id FROM stripe.products
       WHERE active = true AND metadata->>'catalogId' = $1
       LIMIT 1`,
    [TEST_CATALOG_PRODUCT_ID],
  );
  if (productRow.rows.length === 0) {
    throw new Error(
      `No active stripe.products row with metadata.catalogId=${TEST_CATALOG_PRODUCT_ID}. ` +
        `Run "pnpm --filter @workspace/scripts run seed-products" first.`,
    );
  }
  const stripeProductId = productRow.rows[0].id;
  const priceRow = await pool.query<{ id: string; unit_amount: number | null; currency: string }>(
    `SELECT id, unit_amount, currency FROM stripe.prices
       WHERE product = $1 AND active = true
       ORDER BY unit_amount ASC LIMIT 1`,
    [stripeProductId],
  );
  if (priceRow.rows.length === 0) {
    throw new Error(`No active price for stripe product ${stripeProductId}`);
  }
  return {
    stripePriceId: priceRow.rows[0].id,
    unitAmount: priceRow.rows[0].unit_amount ?? 0,
    currency: priceRow.rows[0].currency,
  };
}

async function getWebhookConfig(): Promise<{ url: string; secret: string }> {
  const row = await pool.query<{ url: string; secret: string }>(
    `SELECT url, secret FROM stripe._managed_webhooks
       WHERE status = 'enabled' AND secret IS NOT NULL AND url LIKE $1
       ORDER BY updated_at DESC LIMIT 1`,
    [`%${EXPECTED_HOST}%`],
  );
  if (row.rows.length === 0 || !row.rows[0].secret) {
    throw new Error(
      `No managed webhook found whose URL matches host "${EXPECTED_HOST}". ` +
        'Restart the api-server so it can register one for this environment.',
    );
  }
  const url = process.env.TEST_WEBHOOK_URL || row.rows[0].url;
  const targetHost = new URL(url).host;
  if (targetHost !== EXPECTED_HOST) {
    throw new Error(
      `Refusing to use webhook secret registered for "${row.rows[0].url}" ` +
        `against POST target "${url}" — host mismatch.`,
    );
  }
  return { url, secret: row.rows[0].secret };
}

async function callCheckoutByCatalog(): Promise<{
  url: string;
  id: string;
}> {
  const res = await fetch(`${API_BASE}/api/stripe/checkout-by-catalog`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-e2e-test-token': process.env.E2E_AUTH_TOKEN as string,
      'x-e2e-clerk-id': createdClerkId,
    },
    body: JSON.stringify({ catalogProductId: TEST_CATALOG_PRODUCT_ID }),
  });
  const text = await res.text();
  if (res.status !== 200) {
    throw new Error(`checkout-by-catalog returned HTTP ${res.status}: ${text}`);
  }
  const body = JSON.parse(text) as { url?: string; id?: string };
  if (!body.id || !body.url) {
    throw new Error(`checkout-by-catalog missing id/url in response: ${text}`);
  }
  return { url: body.url, id: body.id };
}

async function loadProvisionedUser(): Promise<{
  userId: string;
  stripeCustomerId: string;
}> {
  const row = await pool.query<{ id: string; stripe_customer_id: string | null }>(
    `SELECT id, stripe_customer_id FROM users WHERE clerk_id = $1`,
    [createdClerkId],
  );
  if (row.rows.length === 0) {
    throw new Error(`Endpoint did not provision a user row for ${createdClerkId}`);
  }
  if (!row.rows[0].stripe_customer_id) {
    throw new Error('User row has no stripe_customer_id');
  }
  createdUserId = row.rows[0].id;
  createdCustomerId = row.rows[0].stripe_customer_id;
  return { userId: row.rows[0].id, stripeCustomerId: row.rows[0].stripe_customer_id };
}

function assertSessionMetadata(
  session: Stripe.Checkout.Session,
  expected: { userId: string; clerkId: string; catalogProductId: string },
): void {
  const md = session.metadata || {};
  if (md.userId !== expected.userId) {
    throw new Error(`session.metadata.userId mismatch: ${md.userId} !== ${expected.userId}`);
  }
  if (md.clerkId !== expected.clerkId) {
    throw new Error(`session.metadata.clerkId mismatch: ${md.clerkId} !== ${expected.clerkId}`);
  }
  if (md.catalogProductId !== expected.catalogProductId) {
    throw new Error(
      `session.metadata.catalogProductId mismatch: ${md.catalogProductId} !== ${expected.catalogProductId}`,
    );
  }
}

async function chargeRealTestPayment(
  stripe: Stripe,
  opts: { customerId: string; amount: number; currency: string },
): Promise<Stripe.PaymentIntent> {
  // We create + confirm a side PaymentIntent (not the Checkout Session's,
  // which Stripe only materialises after the hosted page is opened). This
  // proves the Stripe account can actually process a card charge in test
  // mode. pm_card_visa is Stripe's documented "always succeeds" test
  // PaymentMethod.
  return stripe.paymentIntents.create({
    customer: opts.customerId,
    amount: opts.amount,
    currency: opts.currency,
    payment_method: 'pm_card_visa',
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: { e2eTest: '1' },
  });
}

async function pollForEntitlement(userId: string, productId: string, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await pool.query(
      `SELECT 1 FROM user_entitlements
         WHERE user_id = $1 AND product_id = $2 AND is_active = true LIMIT 1`,
      [userId, productId],
    );
    if (r.rows.length > 0) return true;
    await new Promise((res) => setTimeout(res, 500));
  }
  return false;
}

async function deliverCheckoutCompletedWebhook(
  webhook: { url: string; secret: string },
  realSession: Stripe.Checkout.Session,
  paymentIntentId: string,
): Promise<void> {
  // Sign with the real managed webhook secret and POST to the real
  // /api/stripe/webhook endpoint. The session id is real (so
  // stripe-replit-sync's listLineItems(sessionId) call against Stripe
  // succeeds), and we attach the real test-mode PaymentIntent we just
  // confirmed so anything downstream that follows it has a real object to
  // look at.
  const event = {
    id: `evt_test_e2e_${randomUUID().replace(/-/g, '')}`,
    object: 'event',
    api_version: '2025-08-27.basil',
    created: Math.floor(Date.now() / 1000),
    type: 'checkout.session.completed',
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        ...realSession,
        payment_intent: paymentIntentId,
        payment_status: 'paid',
        status: 'complete',
      },
    },
  };
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhook.secret });
  const res = await fetch(webhook.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    body: payload,
  });
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Webhook POST returned HTTP ${res.status}: ${body}`);
  }
}

async function assertPurchaseRecorded(userId: string, productId: string, sessionId: string): Promise<void> {
  const p = await pool.query<{ status: string }>(
    `SELECT status FROM purchases
       WHERE user_id = $1 AND product_id = $2 AND stripe_session_id = $3`,
    [userId, productId, sessionId],
  );
  if (p.rows.length === 0) {
    throw new Error('No purchases row created for this session');
  }
  if (p.rows[0].status !== 'completed') {
    throw new Error(`Expected purchases.status='completed', got '${p.rows[0].status}'`);
  }
}

async function assertCheckoutSessionSynced(sessionId: string): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    const r = await pool.query(`SELECT id FROM stripe.checkout_sessions WHERE id = $1`, [sessionId]);
    if (r.rows.length > 0) return;
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`stripe.checkout_sessions still missing ${sessionId} after 5s`);
}

async function cleanup(stripe: Stripe): Promise<void> {
  if (KEEP_DATA) {
    console.log('  (TEST_KEEP_DATA=1, skipping cleanup)');
    return;
  }
  if (createdUserId) {
    await pool.query(`DELETE FROM users WHERE id = $1`, [createdUserId]);
  }
  for (const id of extraCreatedUserIds) {
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  }
  if (createdCustomerId) {
    try {
      await stripe.customers.del(createdCustomerId);
    } catch {
      /* best-effort */
    }
  }
  for (const id of extraCreatedCustomerIds) {
    try {
      await stripe.customers.del(id);
    } catch {
      /* best-effort */
    }
  }
}

interface ProSubscriptionPrices {
  monthlyPriceId: string;
  monthlyAmount: number;
  yearlyPriceId: string;
  yearlyAmount: number;
  currency: string;
}

async function loadProSubscriptionPrices(): Promise<ProSubscriptionPrices> {
  const productRow = await pool.query<{ id: string }>(
    `SELECT id FROM stripe.products
       WHERE active = true AND metadata->>'catalogId' = 'pro-subscription'
       LIMIT 1`,
  );
  if (productRow.rows.length === 0) {
    throw new Error(
      `No active stripe.products row with metadata.catalogId=pro-subscription. ` +
        `Run "pnpm --filter @workspace/scripts run seed-products" first.`,
    );
  }
  const stripeProductId = productRow.rows[0].id;
  const priceRows = await pool.query<{
    id: string;
    unit_amount: number | null;
    currency: string;
    recurring: unknown;
  }>(
    `SELECT id, unit_amount, currency, recurring FROM stripe.prices
       WHERE product = $1 AND active = true`,
    [stripeProductId],
  );
  type PriceRow = { id: string; unit_amount: number | null; currency: string };
  let monthly: PriceRow | undefined;
  let yearly: PriceRow | undefined;
  for (const p of priceRows.rows) {
    const parsed: unknown =
      typeof p.recurring === 'string' ? JSON.parse(p.recurring) : p.recurring;
    const interval =
      parsed && typeof parsed === 'object' && 'interval' in parsed
        ? (parsed as { interval?: unknown }).interval
        : undefined;
    if (interval === 'month') monthly = p;
    if (interval === 'year') yearly = p;
  }
  if (!monthly || !yearly) {
    throw new Error(
      `pro-subscription is missing a monthly or yearly price in stripe.prices ` +
        `(monthly=${!!monthly}, yearly=${!!yearly}). Re-run seed-products.`,
    );
  }
  return {
    monthlyPriceId: monthly.id,
    monthlyAmount: monthly.unit_amount ?? 0,
    yearlyPriceId: yearly.id,
    yearlyAmount: yearly.unit_amount ?? 0,
    currency: (monthly.currency || yearly.currency).toLowerCase(),
  };
}

async function callCheckoutForProSubscription(
  clerkId: string,
  interval: 'month' | 'year',
): Promise<{ url: string; id: string }> {
  const res = await fetch(`${API_BASE}/api/stripe/checkout-by-catalog`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-e2e-test-token': process.env.E2E_AUTH_TOKEN as string,
      'x-e2e-clerk-id': clerkId,
    },
    body: JSON.stringify({ catalogProductId: 'pro-subscription', interval }),
  });
  const text = await res.text();
  if (res.status !== 200) {
    throw new Error(`checkout-by-catalog returned HTTP ${res.status}: ${text}`);
  }
  const body = JSON.parse(text) as { url?: string; id?: string };
  if (!body.id || !body.url) {
    throw new Error(`checkout-by-catalog missing id/url in response: ${text}`);
  }
  return { url: body.url, id: body.id };
}

async function trackExtraUser(clerkId: string): Promise<void> {
  const row = await pool.query<{ id: string; stripe_customer_id: string | null }>(
    `SELECT id, stripe_customer_id FROM users WHERE clerk_id = $1`,
    [clerkId],
  );
  if (row.rows.length === 0) {
    throw new Error(`Endpoint did not provision a user row for ${clerkId}`);
  }
  extraCreatedUserIds.push(row.rows[0].id);
  if (row.rows[0].stripe_customer_id) {
    extraCreatedCustomerIds.push(row.rows[0].stripe_customer_id);
  }
}

async function verifyProSubscriptionIntervalRouting(stripe: Stripe): Promise<void> {
  // Verifies that the billing-interval toggle on the pricing page (which is
  // passed end-to-end via openStoreWithProduct → ProductDetail →
  // startStripeCheckout → /api/stripe/checkout-by-catalog) actually causes
  // the resulting Stripe Checkout Session to use the matching recurring
  // Stripe Price. A regression here would silently bill the wrong cadence.
  const prices = await step(
    'look up pro-subscription monthly & yearly prices in stripe.prices',
    () => loadProSubscriptionPrices(),
  );

  for (const interval of ['year', 'month'] as const) {
    const expectedPriceId =
      interval === 'year' ? prices.yearlyPriceId : prices.monthlyPriceId;
    const expectedAmount =
      interval === 'year' ? prices.yearlyAmount : prices.monthlyAmount;
    const clerkId = `test_clerk_e2e_${interval}_${randomUUID()}`;

    const checkout = await step(
      `POST /checkout-by-catalog { pro-subscription, interval: ${interval} }`,
      () => callCheckoutForProSubscription(clerkId, interval),
    );
    await step(`verify endpoint provisioned user for ${interval} flow`, () =>
      trackExtraUser(clerkId),
    );

    const session = await step(
      `retrieve ${interval} Checkout Session from Stripe`,
      () => stripe.checkout.sessions.retrieve(checkout.id),
    );
    if (session.mode !== 'subscription') {
      throw new Error(
        `Expected ${interval} session.mode='subscription', got '${session.mode}'`,
      );
    }
    if (session.metadata?.interval !== interval) {
      throw new Error(
        `session.metadata.interval=${session.metadata?.interval} !== expected ${interval}`,
      );
    }
    await step(
      `verify ${interval} Checkout Session line item uses the ${interval} Stripe price`,
      async () => {
        const items = await stripe.checkout.sessions.listLineItems(checkout.id, {
          limit: 5,
        });
        if (items.data.length !== 1) {
          throw new Error(`Expected 1 line item, got ${items.data.length}`);
        }
        const li = items.data[0];
        if (li.price?.id !== expectedPriceId) {
          throw new Error(
            `${interval} session line item price ${li.price?.id} !== expected ` +
              `${expectedPriceId} (this means the billing interval was NOT ` +
              `honored end-to-end — yearly toggle would silently charge the ` +
              `wrong price).`,
          );
        }
        const recurring = li.price?.recurring;
        if (recurring?.interval !== interval) {
          throw new Error(
            `${interval} session line item recurring.interval=` +
              `${recurring?.interval} !== expected ${interval}`,
          );
        }
        if (li.amount_total !== expectedAmount) {
          throw new Error(
            `${interval} session line item amount_total ${li.amount_total} !== ` +
              `expected ${expectedAmount}`,
          );
        }
      },
    );
  }
}

async function main(): Promise<void> {
  console.log('Faultline Lab — Stripe purchase E2E test');
  console.log(`  api base:        ${API_BASE}`);
  console.log(`  catalog product: ${TEST_CATALOG_PRODUCT_ID}`);
  console.log(`  test clerk id:   ${createdClerkId}`);

  const stripe = await step('connect to Stripe (test mode via Replit Connector)', () =>
    getUncachableStripeClient(),
  );
  const product = await step(
    `look up ${TEST_CATALOG_PRODUCT_ID} in stripe.products / stripe.prices`,
    () => ensureCatalogProduct(),
  );
  const webhook = await step('read managed webhook secret from stripe._managed_webhooks', () =>
    getWebhookConfig(),
  );
  console.log(`    → ${webhook.url}`);

  const checkout = await step(
    'POST /api/stripe/checkout-by-catalog (real app endpoint, test bypass auth)',
    () => callCheckoutByCatalog(),
  );

  const provisioned = await step(
    'verify endpoint provisioned user + Stripe customer',
    () => loadProvisionedUser(),
  );

  const session = await step('retrieve Checkout Session from Stripe', () =>
    stripe.checkout.sessions.retrieve(checkout.id),
  );
  await step('verify Checkout Session metadata is correct', async () =>
    assertSessionMetadata(session, {
      userId: provisioned.userId,
      clerkId: createdClerkId,
      catalogProductId: TEST_CATALOG_PRODUCT_ID,
    }),
  );
  await step('verify Checkout Session line item matches catalog price', async () => {
    const items = await stripe.checkout.sessions.listLineItems(checkout.id, { limit: 5 });
    if (items.data.length !== 1) {
      throw new Error(`Expected 1 line item, got ${items.data.length}`);
    }
    const li = items.data[0];
    if (li.price?.id !== product.stripePriceId) {
      throw new Error(
        `Session line item price ${li.price?.id} !== expected ${product.stripePriceId}`,
      );
    }
    if (li.amount_total !== product.unitAmount) {
      throw new Error(
        `Session line item amount_total ${li.amount_total} !== expected ${product.unitAmount}`,
      );
    }
    if ((li.currency || '').toLowerCase() !== product.currency.toLowerCase()) {
      throw new Error(
        `Session line item currency ${li.currency} !== expected ${product.currency}`,
      );
    }
  });
  if (session.customer !== provisioned.stripeCustomerId) {
    throw new Error(
      `session.customer ${session.customer} !== provisioned customer ${provisioned.stripeCustomerId}`,
    );
  }
  if (session.mode !== 'payment') {
    throw new Error(`Expected session.mode='payment', got '${session.mode}'`);
  }

  const paymentIntent = await step(
    `charge real test PaymentIntent (${product.unitAmount} ${product.currency}) with pm_card_visa`,
    () =>
      chargeRealTestPayment(stripe, {
        customerId: provisioned.stripeCustomerId,
        amount: product.unitAmount,
        currency: product.currency,
      }),
  );
  if (paymentIntent.status !== 'succeeded') {
    throw new Error(`Test PaymentIntent did not succeed; status=${paymentIntent.status}`);
  }

  await step('POST signed checkout.session.completed to real webhook endpoint', () =>
    deliverCheckoutCompletedWebhook(webhook, session, paymentIntent.id),
  );

  const granted = await step('verify user_entitlements row created (poll up to 10s)', () =>
    pollForEntitlement(provisioned.userId, TEST_CATALOG_PRODUCT_ID, 10000),
  );
  if (!granted) throw new Error('Entitlement was not granted after webhook');

  await step('verify purchases row created', () =>
    assertPurchaseRecorded(provisioned.userId, TEST_CATALOG_PRODUCT_ID, checkout.id),
  );
  await step('verify stripe.checkout_sessions row synced', () =>
    assertCheckoutSessionSynced(checkout.id),
  );

  console.log('\n— Yearly preselect verification (pro-subscription) —');
  await verifyProSubscriptionIntervalRouting(stripe);

  console.log('\nAll checks passed.');
}

main()
  .then(async () => {
    const stripe = await getUncachableStripeClient().catch(() => null);
    if (stripe) await cleanup(stripe);
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\nE2E FAILED:', err?.message || err);
    try {
      const stripe = await getUncachableStripeClient();
      await cleanup(stripe);
    } catch {
      /* ignore */
    }
    await pool.end();
    process.exit(1);
  });
