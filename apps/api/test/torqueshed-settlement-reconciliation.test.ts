process.env.SESSION_SECRET ||= 'phase44-reconciliation-test-secret-32-plus';
process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules } from '../src/schema.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
} from './_setup.js';
import {
  __setTorqueReconciliationProviderForTests,
  reconcileTorquePayment,
} from '../src/lib/operatoros-token-reconciliation.js';

let owner: any;
let moduleRow: any;
let moduleCreated = false;
const vehicleId = randomUUID();
const diagnosticId = randomUUID();
const purchaseId = randomUUID();
const receiptId = randomUUID();
const fixtureSuffix = purchaseId.replaceAll('-', '').slice(0, 16);
const eventId = `evt_phase44_${fixtureSuffix}`;
const paymentIntentId = `pi_${fixtureSuffix}`;
const checkoutId = `cs_test_${fixtureSuffix}`;
let snapshotPriceId = 'price_deterministic_test_catalog';

const metadata = () => ({
  operatoros_kind: 'torque_assist_credit',
  purchase_id: purchaseId,
  tenant_id: owner.currentTenantId,
  user_id: owner.id,
  module_id: moduleRow.id,
  module_slug: 'torqueshed',
  diagnostic_session_id: diagnosticId,
  package_key: 'roadside-25000',
  units: '25000',
  catalog_version: 'torqueshed-credit-v1',
  environment: 'test',
  operatoros_source: 'server_authoritative_catalog',
  stripe_account_id: 'acct_phase44_test',
  provider_product_id: 'prod_phase44_roadside',
  provider_price_id: 'price_deterministic_test_catalog',
});

function snapshot() {
  return {
    account: { id: 'acct_phase44_test', livemode: false },
    paymentIntent: {
      id: paymentIntentId, livemode: false, status: 'succeeded', amount: 500,
      amountReceived: 500, currency: 'usd', created: Math.floor(Date.now() / 1000),
      latestChargeId: 'ch_phase44repair001', metadata: metadata(),
    },
    checkoutSession: {
      id: checkoutId, livemode: false, mode: 'payment', paymentStatus: 'paid',
      status: 'complete', amountTotal: 500, currency: 'usd', paymentIntentId,
      metadata: metadata(),
      lineItems: [{ quantity: 1, priceId: snapshotPriceId, productId: 'prod_phase44_roadside' }],
    },
    charge: {
      id: 'ch_phase44repair001', amountRefunded: 0, refunded: false,
      disputed: false, paymentIntentId,
    },
    events: [{ id: eventId, type: 'checkout.session.completed', created: 1, livemode: false }],
  };
}

before(async () => {
  await ensureSchemaReady();
  owner = await createTestUser();
  [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'torqueshed')).limit(1);
  if (!moduleRow) {
    moduleRow = await createTestModule('torqueshed');
    moduleCreated = true;
  }
  await db.execute(sql`
    INSERT INTO torqueshed_vehicles (
      id,tenant_id,owner_user_id,nickname,year,make,model,created_by_user_id,updated_by_user_id
    ) VALUES (
      ${vehicleId},${owner.currentTenantId},${owner.id},'Phase 44 fixture',2018,'Example','Roadster',${owner.id},${owner.id}
    )
  `);
  await db.execute(sql`
    INSERT INTO torqueshed_diagnostic_sessions (
      id,tenant_id,owner_user_id,vehicle_id,title,customer_concern,created_by_user_id,updated_by_user_id
    ) VALUES (
      ${diagnosticId},${owner.currentTenantId},${owner.id},${vehicleId},
      'Phase 44 settlement','Verify exactly-once recovery',${owner.id},${owner.id}
    )
  `);
  await db.execute(sql`
    INSERT INTO operatoros_token_purchase_intents (
      id,tenant_id,user_id,module_id,diagnostic_session_id,package_key,units,amount_minor,currency,
      provider,provider_mode,provider_checkout_id,status,idempotency_key,catalog_version,
      stripe_account_id,provider_product_id,provider_price_id,success_return_url,cancel_return_url
    ) VALUES (
      ${purchaseId},${owner.currentTenantId},${owner.id},${moduleRow.id},${diagnosticId},
      'roadside-25000',25000,500,'USD','stripe','test',${checkoutId},'checkout_open',
      'phase44:reconcile:purchase','torqueshed-credit-v1','acct_phase44_test',
      'prod_phase44_roadside','price_deterministic_test_catalog',
      'https://torqueshed.operatoros.net/diagnostics/example?purchase=fixture',
      'https://torqueshed.operatoros.net/diagnostics/example?purchase=fixture'
    )
  `);
  await db.execute(sql`
    INSERT INTO shared_webhook_receipts (
      id,tenant_id,module_id,provider,provider_event_id,event_type,handler_key,
      payload_sha256,safe_payload_json,signature_verified,status
    ) VALUES (
      ${receiptId},${owner.currentTenantId},${moduleRow.id},'stripe',${eventId},
      'checkout.session.completed','operatoros.torque-assist.token-purchase.v1',
      ${'a'.repeat(64)},${{
        kind: 'credit', purchaseId, userId: owner.id, amountMinor: 500, currency: 'USD',
        paymentStatus: 'paid', checkoutMode: 'payment', providerReference: paymentIntentId,
        providerChargeReference: 'ch_phase44repair001', incomingMode: 'test',
        catalogVersion: 'torqueshed-credit-v1', stripeAccountId: 'acct_phase44_test',
        providerProductId: 'prod_phase44_roadside', providerPriceId: 'price_deterministic_test_catalog',
        lineItemCount: 1, lineItemQuantity: 1,
      }},TRUE,'pending'
    )
  `);
  __setTorqueReconciliationProviderForTests(async () => snapshot() as any);
});

after(async () => {
  __setTorqueReconciliationProviderForTests(null);
  if (owner) {
    await db.execute(sql`DELETE FROM shared_webhook_receipts WHERE id=${receiptId}`);
    await db.execute(sql`TRUNCATE TABLE torqueshed_token_ledger_entries`);
    await db.execute(sql`DELETE FROM torqueshed_credit_policy_holds WHERE purchase_intent_id=${purchaseId}`);
    await db.execute(sql`DELETE FROM operatoros_token_purchase_intents WHERE id=${purchaseId}`);
    await db.execute(sql`DELETE FROM torqueshed_diagnostic_sessions WHERE id=${diagnosticId}`);
    await db.execute(sql`DELETE FROM torqueshed_vehicles WHERE id=${vehicleId}`);
    await cleanupUser(owner.id);
  }
  if (moduleRow && moduleCreated) await cleanupModule(moduleRow.id);
});

test('reconciliation detects, repairs, and idempotently confirms a verified paid receipt', async () => {
  const dryRun = await reconcileTorquePayment({ paymentIntentId, apply: false });
  assert.deepEqual(dryRun.checks.failures.sort(), ['PAID_EVENT_UNPROCESSED', 'PAID_SESSION_NO_CREDIT']);
  assert.equal(dryRun.checks.eligible, true);
  assert.equal(dryRun.applied, false);

  const repaired = await reconcileTorquePayment({
    paymentIntentId,
    apply: true,
    repairCode: 'REPROCESS_VERIFIED_RECEIPT',
  });
  assert.equal(repaired.applied, true);
  assert.equal(repaired.checks.green, true);
  assert.deepEqual(repaired.findings, []);

  const rows = await db.execute(sql`
    SELECT p.status,r.status AS receipt_status,
      (SELECT COUNT(*)::int FROM torqueshed_token_ledger_entries l
       WHERE l.purchase_intent_id=p.id AND l.entry_kind='credit') AS credits
    FROM operatoros_token_purchase_intents p
    JOIN shared_webhook_receipts r ON r.id=${receiptId}
    WHERE p.id=${purchaseId}
  `);
  assert.equal(rows.rows[0]!.status, 'credited');
  assert.equal(rows.rows[0]!.receipt_status, 'processed');
  assert.equal(rows.rows[0]!.credits, 1);

  const replay = await reconcileTorquePayment({
    paymentIntentId,
    apply: true,
    repairCode: 'REPROCESS_VERIFIED_RECEIPT',
  });
  assert.equal(replay.applied, false);
  assert.equal(replay.repair.noOp, true);
  const creditCount = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM torqueshed_token_ledger_entries
    WHERE purchase_intent_id=${purchaseId} AND entry_kind='credit'
  `);
  assert.equal(creditCount.rows[0]!.count, 1);
});

test('reconciliation reports provider Price drift and refuses ambiguous repair', async () => {
  snapshotPriceId = 'price_wrong_phase44';
  const report = await reconcileTorquePayment({ paymentIntentId, apply: false });
  assert.ok(report.checks.failures.includes('CHECKOUT_PRICE_MISMATCH'));
  assert.equal(report.checks.eligible, false);
  await assert.rejects(
    () => reconcileTorquePayment({
      paymentIntentId,
      apply: true,
      repairCode: 'REPROCESS_VERIFIED_RECEIPT',
    }),
    (error: any) => error?.code === 'TORQUE_RECONCILIATION_REPAIR_BLOCKED',
  );
  snapshotPriceId = 'price_deterministic_test_catalog';
});
