import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { retrieveTorqueStripeReconciliationSnapshot } from './billing-service.js';
import { settleTorqueTokenPurchase } from './operatoros-token-billing.js';

type Snapshot = Awaited<ReturnType<typeof retrieveTorqueStripeReconciliationSnapshot>>;

function first(result: Awaited<ReturnType<typeof db.execute>>): Record<string, any> | null {
  return (result.rows[0] as Record<string, any> | undefined) ?? null;
}

function safePurchase(row: Record<string, any> | null) {
  if (!row) return null;
  return {
    id: row.id, tenantId: row.tenant_id, userId: row.user_id, moduleId: row.module_id,
    packageKey: row.package_key, units: Number(row.units), amountMinor: Number(row.amount_minor),
    currency: row.currency, provider: row.provider, providerMode: row.provider_mode,
    providerCheckoutId: row.provider_checkout_id, status: row.status,
  };
}

export async function reconcileTorquePayment(input: {
  paymentIntentId: string;
  apply: boolean;
}) {
  const provider = await retrieveTorqueStripeReconciliationSnapshot(input.paymentIntentId);
  const metadata = {
    ...provider.paymentIntent.metadata,
    ...(provider.checkoutSession?.metadata ?? {}),
  };
  const purchaseId = String(metadata.purchase_id || '');
  const purchase = /^[0-9a-f-]{36}$/i.test(purchaseId)
    ? first(await db.execute(sql`
        SELECT * FROM operatoros_token_purchase_intents WHERE id=${purchaseId} LIMIT 1
      `))
    : provider.checkoutSession
      ? first(await db.execute(sql`
          SELECT * FROM operatoros_token_purchase_intents
          WHERE provider='stripe' AND provider_mode='live'
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
    SELECT id,provider_event_id,event_type,status,attempt_count,last_error_code,received_at,processed_at
    FROM shared_webhook_receipts WHERE provider_event_id = ANY(${eventIds}::text[])
    ORDER BY received_at,id
  `) : { rows: [] };
  const billingEvents = eventIds.length ? await db.execute(sql`
    SELECT id,stripe_event_id,event_type,processed_at,error_message,created_at
    FROM billing_events WHERE stripe_event_id = ANY(${eventIds}::text[])
    ORDER BY created_at,id
  `) : { rows: [] };
  const audits = purchase ? await db.execute(sql`
    SELECT id,action,created_at FROM admin_audit_logs
    WHERE tenant_id=${purchase.tenant_id}
      AND details->>'targetType'='operatoros_token_purchase'
      AND details->>'targetId'=${purchase.id}
    ORDER BY created_at,id
  `) : { rows: [] };

  const failures: string[] = [];
  const expectedAccount = String(process.env.STRIPE_EXPECTED_ACCOUNT_ID || '');
  if (!expectedAccount || provider.account.id !== expectedAccount) failures.push('STRIPE_ACCOUNT_MISMATCH');
  if (!provider.paymentIntent.livemode || !provider.checkoutSession?.livemode) failures.push('NOT_LIVE_MODE');
  if (provider.paymentIntent.status !== 'succeeded' || provider.paymentIntent.amountReceived !== 500) failures.push('PAYMENT_NOT_SETTLED_500');
  if (provider.paymentIntent.currency !== 'usd') failures.push('PAYMENT_CURRENCY_MISMATCH');
  if (!provider.checkoutSession || provider.checkoutSession.mode !== 'payment' || provider.checkoutSession.paymentStatus !== 'paid') failures.push('CHECKOUT_NOT_PAID_PAYMENT_MODE');
  if (provider.checkoutSession?.amountTotal !== 500 || provider.checkoutSession?.currency !== 'usd') failures.push('CHECKOUT_AMOUNT_CURRENCY_MISMATCH');
  if (metadata.operatoros_kind !== 'torque_assist_credit') failures.push('PURCHASE_METADATA_KIND_MISSING');
  if (!purchase) failures.push('PURCHASE_INTENT_NOT_FOUND');
  if (purchase) {
    for (const [key, expected] of [
      ['purchase_id', purchase.id], ['tenant_id', purchase.tenant_id], ['user_id', purchase.user_id],
      ['module_id', purchase.module_id], ['package_key', purchase.package_key], ['units', purchase.units],
    ]) if (String((metadata as any)[key] || '') !== String(expected)) failures.push(`METADATA_${key.toUpperCase()}_MISMATCH`);
    if (purchase.provider !== 'stripe' || purchase.provider_mode !== 'live') failures.push('PURCHASE_PROVIDER_MODE_MISMATCH');
    if (purchase.provider_checkout_id !== provider.checkoutSession?.id) failures.push('PURCHASE_CHECKOUT_MISMATCH');
    if (Number(purchase.amount_minor) !== 500 || String(purchase.currency) !== 'USD') failures.push('PURCHASE_AMOUNT_CURRENCY_MISMATCH');
    if (purchase.package_key !== 'roadside-25000' || Number(purchase.units) !== 25_000) failures.push('ROADSIDE_PACKAGE_MISMATCH');
  }
  if (provider.charge?.amountRefunded) failures.push('PAYMENT_REFUNDED');
  if (provider.charge?.disputed) failures.push('PAYMENT_DISPUTED');
  const credits = ledger.rows.filter((row: any) => row.entry_kind === 'credit');
  if (credits.length > 1) failures.push('DUPLICATE_PURCHASE_CREDIT');
  const paidEvent = provider.events.find((event) =>
    event.type === 'checkout.session.async_payment_succeeded' || event.type === 'checkout.session.completed');
  if (!paidEvent) failures.push('PAID_PROVIDER_EVENT_NOT_FOUND');

  const alreadyCredited = credits.length === 1 && purchase?.status === 'credited';
  const eligible = failures.length === 0 && !alreadyCredited;
  let applied = false;
  if (input.apply && eligible && purchase && paidEvent) {
    await settleTorqueTokenPurchase({
      receiptId: `reconcile:${input.paymentIntentId}`,
      tenantId: String(purchase.tenant_id), moduleId: String(purchase.module_id),
      provider: 'stripe', providerEventId: paidEvent.id, eventType: paidEvent.type,
      payload: {
        kind: 'credit', purchaseId: String(purchase.id), amountMinor: provider.checkoutSession!.amountTotal,
        currency: provider.checkoutSession!.currency.toUpperCase(), paymentStatus: 'paid',
        checkoutMode: 'payment', providerReference: provider.paymentIntent.id,
        providerChargeReference: provider.charge?.id ?? '', incomingMode: 'live',
      },
      correlationId: `reconcile:${input.paymentIntentId}`,
    });
    applied = true;
  }
  return {
    schema: 'operatoros.torque-payment-reconciliation.v1', paymentIntentId: input.paymentIntentId,
    mode: input.apply ? 'apply' : 'dry-run', provider, local: {
      purchase: safePurchase(purchase), ledger: ledger.rows, webhookReceipts: receipts.rows,
      billingEvents: billingEvents.rows, audits: audits.rows,
    }, checks: { eligible, alreadyCredited, failures: [...new Set(failures)] }, applied,
  };
}
