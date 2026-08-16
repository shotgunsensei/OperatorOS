import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { retrieveTorqueStripeReconciliationSnapshot } from './billing-service.js';
import { registerTorqueTokenWebhookHandler } from './operatoros-token-billing.js';
import { processWebhookReceiptById } from './shared-webhooks.js';
import { isOperatorOSTestEnvironment } from './shared-service-safety.js';

type Snapshot = Awaited<ReturnType<typeof retrieveTorqueStripeReconciliationSnapshot>>;
type SnapshotProvider = (paymentIntentId: string) => Promise<Snapshot>;
let snapshotProviderForTests: SnapshotProvider | null = null;

export function __setTorqueReconciliationProviderForTests(provider: SnapshotProvider | null) {
  if (!isOperatorOSTestEnvironment()) throw new Error('Torque reconciliation override is test-only');
  snapshotProviderForTests = provider;
}

type Finding = {
  code: string;
  severity: 'error' | 'warning';
  repairable: boolean;
  action: string;
};

function first(result: Awaited<ReturnType<typeof db.execute>>): Record<string, any> | null {
  return (result.rows[0] as Record<string, any> | undefined) ?? null;
}

function safePurchase(row: Record<string, any> | null) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    moduleId: row.module_id,
    packageKey: row.package_key,
    units: Number(row.units),
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    provider: row.provider,
    providerMode: row.provider_mode,
    stripeAccountId: row.stripe_account_id,
    providerProductId: row.provider_product_id,
    providerPriceId: row.provider_price_id,
    catalogVersion: row.catalog_version,
    providerCheckoutId: row.provider_checkout_id,
    paymentIntentId: row.payment_intent_id,
    status: row.status,
    settlementPolicyState: row.settlement_policy_state,
    settlementPolicyUnits: Number(row.settlement_policy_units ?? 0),
  };
}

function addFinding(findings: Finding[], code: string, input: Partial<Omit<Finding, 'code'>> = {}) {
  if (findings.some((finding) => finding.code === code)) return;
  findings.push({
    code,
    severity: input.severity ?? 'error',
    repairable: input.repairable ?? false,
    action: input.action ?? 'Investigate provider and OperatorOS records; do not mutate an ambiguous purchase.',
  });
}

export async function reconcileTorquePayment(input: {
  paymentIntentId: string;
  apply: boolean;
  repairCode?: 'REPROCESS_VERIFIED_RECEIPT';
}): Promise<Record<string, any>> {
  const provider = await (snapshotProviderForTests ?? retrieveTorqueStripeReconciliationSnapshot)(input.paymentIntentId);
  const metadata = {
    ...provider.paymentIntent.metadata,
    ...(provider.checkoutSession?.metadata ?? {}),
  };
  const purchaseId = String(metadata.purchase_id || '');
  const providerMode = provider.paymentIntent.livemode ? 'live' : 'test';
  const purchase = /^[0-9a-f-]{36}$/i.test(purchaseId)
    ? first(await db.execute(sql`
        SELECT * FROM operatoros_token_purchase_intents WHERE id=${purchaseId} LIMIT 1
      `))
    : provider.checkoutSession
      ? first(await db.execute(sql`
          SELECT * FROM operatoros_token_purchase_intents
          WHERE provider_mode=${providerMode}
            AND provider_checkout_id=${provider.checkoutSession.id} LIMIT 1
        `))
      : null;
  const ledger = purchase ? await db.execute(sql`
    SELECT id,entry_kind,operation_type,units,external_event_ref,created_at
    FROM torqueshed_token_ledger_entries
    WHERE tenant_id=${purchase.tenant_id} AND purchase_intent_id=${purchase.id}
    ORDER BY created_at,id
  `) : { rows: [] };
  const eventIds = provider.events.map((event) => event.id);
  const receipts = eventIds.length ? await db.execute(sql`
    SELECT id,provider_event_id,event_type,status,signature_verified,attempt_count,
      last_error_code,received_at,processed_at
    FROM shared_webhook_receipts
    WHERE provider_event_id IN (${sql.join(eventIds.map((id) => sql`${id}`), sql`,`)})
    ORDER BY received_at,id
  `) : { rows: [] };
  const billingEvents = eventIds.length ? await db.execute(sql`
    SELECT id,stripe_event_id,event_type,processed_at,error_message,created_at
    FROM billing_events
    WHERE stripe_event_id IN (${sql.join(eventIds.map((id) => sql`${id}`), sql`,`)})
    ORDER BY created_at,id
  `) : { rows: [] };
  const audits = purchase ? await db.execute(sql`
    SELECT id,action,created_at FROM admin_audit_logs
    WHERE tenant_id=${purchase.tenant_id}
      AND details->>'targetType'='operatoros_token_purchase'
      AND details->>'targetId'=${purchase.id}
    ORDER BY created_at,id
  `) : { rows: [] };
  const holds = purchase ? await db.execute(sql`
    SELECT hold_kind,units,status,reason_code,provider_event_id,updated_at
    FROM torqueshed_credit_policy_holds
    WHERE tenant_id=${purchase.tenant_id} AND purchase_intent_id=${purchase.id}
    ORDER BY hold_kind
  `) : { rows: [] };
  const balance = purchase ? first(await db.execute(sql`
    SELECT COALESCE(SUM(CASE
      WHEN entry_kind IN ('credit','debit_reversal','adjustment_credit') THEN units
      ELSE -units END),0)::bigint AS balance
    FROM torqueshed_token_ledger_entries
    WHERE tenant_id=${purchase.tenant_id} AND module_id=${purchase.module_id}
      AND user_id=${purchase.user_id}
  `)) : null;

  const findings: Finding[] = [];
  if (!purchase) addFinding(findings, 'ORPHAN_PROVIDER_SESSION');
  const expectedAccount = String(purchase?.stripe_account_id || process.env.STRIPE_EXPECTED_ACCOUNT_ID || '');
  if (!expectedAccount || provider.account.id !== expectedAccount) addFinding(findings, 'STRIPE_ACCOUNT_MISMATCH');
  if (provider.checkoutSession && provider.checkoutSession.livemode !== provider.paymentIntent.livemode) {
    addFinding(findings, 'PROVIDER_OBJECT_MODE_MISMATCH');
  }
  if (purchase && purchase.provider_mode !== providerMode) addFinding(findings, 'PURCHASE_PROVIDER_MODE_MISMATCH');

  const checkout = provider.checkoutSession;
  const paid = provider.paymentIntent.status === 'succeeded'
    && !!checkout
    && checkout.mode === 'payment'
    && checkout.paymentStatus === 'paid';
  if (!paid) addFinding(findings, 'PROVIDER_PAYMENT_NOT_SETTLED');
  if (!checkout) addFinding(findings, 'CHECKOUT_SESSION_NOT_FOUND');

  if (purchase) {
    for (const [key, expected] of [
      ['purchase_id', purchase.id],
      ['tenant_id', purchase.tenant_id],
      ['user_id', purchase.user_id],
      ['module_id', purchase.module_id],
      ['package_key', purchase.package_key],
      ['units', purchase.units],
      ['diagnostic_session_id', purchase.diagnostic_session_id],
      ['catalog_version', purchase.catalog_version],
      ['environment', purchase.provider_mode],
      ['module_slug', 'torqueshed'],
      ['operatoros_source', 'server_authoritative_catalog'],
      ['stripe_account_id', purchase.stripe_account_id],
      ['provider_product_id', purchase.provider_product_id],
      ['provider_price_id', purchase.provider_price_id],
    ]) {
      if (purchase.catalog_version || !['diagnostic_session_id','catalog_version','environment','module_slug',
        'operatoros_source','stripe_account_id','provider_product_id','provider_price_id'].includes(key)) {
        if (String((metadata as any)[key] || '') !== String(expected)) {
          addFinding(findings, `METADATA_${key.toUpperCase()}_MISMATCH`);
        }
      }
    }
    if (purchase.provider_checkout_id !== checkout?.id) addFinding(findings, 'PURCHASE_CHECKOUT_MISMATCH');
    if (Number(provider.paymentIntent.amountReceived) !== Number(purchase.amount_minor)
      || Number(checkout?.amountTotal ?? 0) !== Number(purchase.amount_minor)) {
      addFinding(findings, 'PAYMENT_AMOUNT_MISMATCH');
    }
    if (String(provider.paymentIntent.currency).toUpperCase() !== String(purchase.currency)
      || String(checkout?.currency || '').toUpperCase() !== String(purchase.currency)) {
      addFinding(findings, 'PAYMENT_CURRENCY_MISMATCH');
    }
    if (purchase.catalog_version) {
      const lineItems = checkout?.lineItems ?? [];
      if (lineItems.length !== 1 || Number(lineItems[0]?.quantity) !== 1) {
        addFinding(findings, 'CHECKOUT_LINE_ITEM_MISMATCH');
      }
      if (String(lineItems[0]?.priceId || '') !== String(purchase.provider_price_id)) {
        addFinding(findings, 'CHECKOUT_PRICE_MISMATCH');
      }
      if (String(lineItems[0]?.productId || '') !== String(purchase.provider_product_id)) {
        addFinding(findings, 'CHECKOUT_PRODUCT_MISMATCH');
      }
    }
  }

  const credits = ledger.rows.filter((row: any) => row.entry_kind === 'credit');
  const creditUnits = credits.reduce((total, row: any) => total + Number(row.units), 0);
  if (credits.length > 1) addFinding(findings, 'DUPLICATE_PURCHASE_CREDIT');
  if (purchase && credits.length === 1 && creditUnits !== Number(purchase.units)) {
    addFinding(findings, 'PURCHASE_CREDIT_UNITS_MISMATCH');
  }
  if (paid && purchase && credits.length === 0) {
    addFinding(findings, 'PAID_SESSION_NO_CREDIT', {
      repairable: true,
      action: 'Reprocess exactly one matching signature-verified webhook receipt.',
    });
  }
  if (!paid && credits.length > 0) addFinding(findings, 'CREDIT_WITHOUT_PAID_SESSION');

  const paidEvent = provider.events.find((event) =>
    event.type === 'checkout.session.async_payment_succeeded'
      || event.type === 'checkout.session.completed');
  if (paid && !paidEvent) addFinding(findings, 'PAID_PROVIDER_EVENT_NOT_FOUND');
  const paidReceipt = paidEvent
    ? receipts.rows.find((row: any) => row.provider_event_id === paidEvent.id && row.signature_verified === true)
    : null;
  if (paidEvent && (!paidReceipt || (paidReceipt as any).status !== 'processed')) {
    addFinding(findings, 'PAID_EVENT_UNPROCESSED', {
      repairable: !!paidReceipt && ['pending','retry','dead_letter'].includes(String((paidReceipt as any).status)),
      action: paidReceipt
        ? 'Reprocess the existing signature-verified receipt.'
        : 'Replay the original Stripe event through the signed webhook endpoint; do not synthesize a receipt.',
    });
  }

  if (purchase && ['pending','creating_checkout','checkout_open','payment_pending','paid_pending_credit','checkout_created']
    .includes(String(purchase.status))) {
    const thresholdMs = Math.max(5, Number(process.env.TORQUE_RECONCILIATION_PENDING_MINUTES || 30)) * 60_000;
    if (Date.now() - new Date(purchase.updated_at || purchase.created_at).getTime() > thresholdMs) {
      addFinding(findings, 'PURCHASE_STUCK_PENDING');
    }
  }
  const reversalUnits = ledger.rows
    .filter((row: any) => row.entry_kind === 'credit_reversal')
    .reduce((total, row: any) => total + Number(row.units), 0);
  const openHoldUnits = holds.rows
    .filter((row: any) => row.status === 'open')
    .reduce((total, row: any) => total + Number(row.units), 0);
  if (provider.charge?.amountRefunded) {
    const expectedUnits = purchase
      ? provider.charge.amountRefunded >= Number(purchase.amount_minor)
        ? Number(purchase.units)
        : Math.floor((Number(purchase.units) * provider.charge.amountRefunded) / Number(purchase.amount_minor))
      : 0;
    if (purchase && reversalUnits + openHoldUnits < expectedUnits) addFinding(findings, 'REFUND_WITHOUT_POLICY_STATE');
  }
  if (provider.charge?.disputed && purchase
    && purchase.status !== 'disputed' && purchase.settlement_policy_state !== 'dispute_frozen') {
    addFinding(findings, 'DISPUTE_WITHOUT_POLICY_STATE');
  }
  if (Number(balance?.balance ?? 0) < 0) addFinding(findings, 'NEGATIVE_LEDGER_BALANCE');

  const repairableCodes = new Set(['PAID_SESSION_NO_CREDIT', 'PAID_EVENT_UNPROCESSED']);
  const repairEligible = findings.length > 0
    && findings.every((finding) => repairableCodes.has(finding.code) && finding.repairable)
    && !!paidReceipt;
  let applied = false;
  const report = {
    schema: 'operatoros.torque-payment-reconciliation.v2',
    paymentIntentId: input.paymentIntentId,
    mode: 'dry-run',
    provider,
    local: {
      purchase: safePurchase(purchase),
      ledger: ledger.rows,
      webhookReceipts: receipts.rows,
      billingEvents: billingEvents.rows,
      audits: audits.rows,
      policyHolds: holds.rows,
      balance: Number(balance?.balance ?? 0),
    },
    findings,
    checks: {
      green: findings.length === 0,
      eligible: repairEligible,
      alreadyCredited: credits.length === 1 && purchase?.status === 'credited',
      failures: findings.map((finding) => finding.code),
    },
    applied,
  };
  if (input.apply) {
    if (findings.length === 0 && report.checks.alreadyCredited) {
      return {
        ...report,
        mode: 'apply',
        repair: { code: input.repairCode ?? null, alreadySettled: true, noOp: true },
      };
    }
    if (input.repairCode !== 'REPROCESS_VERIFIED_RECEIPT' || !repairEligible || !paidReceipt) {
      throw Object.assign(new Error('Requested reconciliation repair is not safe for these findings'), {
        code: 'TORQUE_RECONCILIATION_REPAIR_BLOCKED',
      });
    }
    registerTorqueTokenWebhookHandler();
    const receiptId = String((paidReceipt as any).id);
    await db.execute(sql`
      UPDATE shared_webhook_receipts
      SET status='retry',next_attempt_at=NOW(),lease_owner=NULL,lease_expires_at=NULL,
        max_attempts=GREATEST(max_attempts,attempt_count+1),updated_at=NOW()
      WHERE id=${receiptId} AND signature_verified=TRUE
        AND status IN ('pending','retry','dead_letter')
    `);
    const processed = await processWebhookReceiptById(receiptId, `reconcile-${randomUUID()}`);
    if (!processed || processed.status !== 'processed') {
      throw Object.assign(new Error('Verified webhook receipt repair did not settle'), {
        code: 'TORQUE_RECONCILIATION_REPAIR_FAILED',
      });
    }
    applied = true;
    const after: Record<string, any> = await reconcileTorquePayment({
      paymentIntentId: input.paymentIntentId,
      apply: false,
    });
    return {
      ...after,
      mode: 'apply',
      applied,
      repair: { code: input.repairCode, receiptId, beforeFindings: findings.map((finding) => finding.code) },
    };
  }

  return report;
}
