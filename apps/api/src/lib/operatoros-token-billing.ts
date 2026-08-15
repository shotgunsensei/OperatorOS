import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { writeAudit } from './audit.js';
import {
  createUsageCreditCheckoutSession,
  getStripeRuntimeMode,
  resolveStripePaymentMetadata,
} from './billing-service.js';
import { getPaymentProviderAdapter, ProviderDisabledError } from './shared-provider-adapters.js';
import {
  isOperatorOSDeterministicProviderTestEnvironment,
  isOperatorOSTestEnvironment,
} from './shared-service-safety.js';
import {
  registerSharedWebhookHandler,
  receiveVerifiedWebhook,
  type SharedWebhookContext,
  type VerifiedWebhookEvent,
  type WebhookVerifier,
} from './shared-webhooks.js';
import { torqueTokenPackage, TORQUE_TOKEN_PACKAGES } from './torque-assist-domain.js';
import {
  getTorqueCreditPurchaseReadiness,
  type TorqueCreditPurchaseReadiness,
} from './torque-credit-readiness.js';

const HANDLER_KEY = 'operatoros.torque-assist.token-purchase.v1';

export class OperatorOsTokenBillingError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 400,
    readonly diagnostics?: Pick<
      TorqueCreditPurchaseReadiness,
      'userMessage' | 'retryable' | 'administratorAction' | 'checks'
    >,
  ) {
    super(message);
    this.name = 'OperatorOsTokenBillingError';
  }
}

function first(result: Awaited<ReturnType<typeof db.execute>>): Record<string, any> | null {
  return (result.rows[0] as Record<string, any> | undefined) ?? null;
}

function camel(row: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
}

export async function torqueShedModule(): Promise<{ id: string; baseUrl: string }> {
  const row = first(
    await db.execute(
      sql`SELECT id,base_url FROM modules WHERE slug='torqueshed' AND status='live' AND archived_at IS NULL LIMIT 1`,
    ),
  );
  if (!row) {
    throw new OperatorOsTokenBillingError(
      'TorqueShed module registry row is unavailable',
      'TORQUE_MODULE_UNAVAILABLE',
      503,
    );
  }
  return { id: String(row.id), baseUrl: String(row.base_url) };
}

function canonicalReturnUrl(
  baseUrl: string,
  diagnosticSessionId: string,
  purchaseId: string,
  result: 'success' | 'cancelled',
) {
  const url = new URL(`/diagnostics/${encodeURIComponent(diagnosticSessionId)}`, baseUrl);
  if (url.protocol !== 'https:' && !(isOperatorOSTestEnvironment() && url.protocol === 'http:')) {
    throw new OperatorOsTokenBillingError(
      'TorqueShed canonical return URL is invalid',
      'TORQUE_CHECKOUT_RETURN_INVALID',
      503,
    );
  }
  url.searchParams.set('tokenPurchase', result);
  url.searchParams.set('purchase', purchaseId);
  return url.toString();
}

export function listTorqueTokenPackages() {
  return TORQUE_TOKEN_PACKAGES.map((item) => ({ ...item }));
}

export async function torqueTokenPurchaseReadiness(): Promise<TorqueCreditPurchaseReadiness> {
  let baseUrl: string | null = null;
  try {
    baseUrl = (await torqueShedModule()).baseUrl;
  } catch {
    // The composite readiness result owns the safe unavailable state. Do not
    // expose registry or database details through this customer endpoint.
  }
  return getTorqueCreditPurchaseReadiness({ moduleBaseUrl: baseUrl });
}

export async function getTorqueTokenPurchaseStatus(input: {
  tenantId: string;
  userId: string;
  purchaseId: string;
}) {
  const purchase = first(await db.execute(sql`
    SELECT id,module_id,package_key,units,amount_minor,currency,status,failure_code,
      created_at,updated_at,credited_at,refunded_at
    FROM operatoros_token_purchase_intents
    WHERE tenant_id=${input.tenantId} AND user_id=${input.userId} AND id=${input.purchaseId}
    LIMIT 1
  `));
  if (!purchase) {
    throw new OperatorOsTokenBillingError(
      'Token purchase was not found',
      'TORQUE_PURCHASE_NOT_FOUND',
      404,
    );
  }
  const ledger = first(await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE purchase_intent_id=${input.purchaseId} AND entry_kind='credit')::int AS credit_count,
      COALESCE(SUM(CASE WHEN entry_kind IN ('credit','debit_reversal','adjustment_credit') THEN units ELSE -units END),0)::bigint AS balance
    FROM torqueshed_token_ledger_entries
    WHERE tenant_id=${input.tenantId} AND module_id=${purchase.module_id} AND user_id=${input.userId}
  `));
  const stored = String(purchase.status);
  const state = stored === 'pending' ? 'payment_pending'
    : stored === 'partially_refunded' ? 'refunded'
      : stored;
  return {
    purchaseId: String(purchase.id), state, packageKey: String(purchase.package_key),
    units: Number(purchase.units), amountMinor: Number(purchase.amount_minor),
    currency: String(purchase.currency), failureCode: purchase.failure_code ?? null,
    credited: Number(ledger?.credit_count ?? 0) === 1 && stored === 'credited',
    balance: Number(ledger?.balance ?? 0), createdAt: purchase.created_at,
    updatedAt: purchase.updated_at, creditedAt: purchase.credited_at,
    refundedAt: purchase.refunded_at, authority: 'operatoros_ledger',
  };
}

export async function createTorqueTokenPurchase(input: {
  tenantId: string;
  userId: string;
  diagnosticSessionId: string;
  packageKey: unknown;
  idempotencyKey: string;
  request?: unknown;
}) {
  const selectedPackage = torqueTokenPackage(input.packageKey);
  const module = await torqueShedModule();
  const readiness = await getTorqueCreditPurchaseReadiness({ moduleBaseUrl: module.baseUrl });
  if (!readiness.ready) {
    await writeAudit(
      {
        actorUserId: input.userId,
        tenantId: input.tenantId,
        targetType: 'operatoros_token_purchase',
        targetId: null,
        action: 'token_purchase_readiness_blocked',
        after: {
          code: readiness.code,
          checks: readiness.checks.map((check) => ({ key: check.key, ready: check.ready })),
        },
      },
      input.request,
    );
    throw new OperatorOsTokenBillingError(
      readiness.userMessage,
      readiness.code,
      503,
      readiness,
    );
  }
  const testMode = isOperatorOSDeterministicProviderTestEnvironment();
  const stripeMode = getStripeRuntimeMode();
  if (!testMode && stripeMode === 'disabled') {
    throw new ProviderDisabledError('payments');
  }
  const provider = testMode ? 'deterministic-test' : 'stripe';
  const providerMode = testMode ? 'test' : stripeMode;
  if (providerMode === 'disabled') throw new ProviderDisabledError('payments');

  const inserted = first(
    await db.execute(sql`
      INSERT INTO operatoros_token_purchase_intents (
        tenant_id,user_id,module_id,package_key,units,amount_minor,currency,
        provider,provider_mode,status,idempotency_key
      ) VALUES (
        ${input.tenantId},${input.userId},${module.id},${selectedPackage.key},
        ${selectedPackage.units},${selectedPackage.amountMinor},${selectedPackage.currency},
        ${provider},${providerMode},'payment_pending',${input.idempotencyKey}
      )
      ON CONFLICT (tenant_id,user_id,module_id,idempotency_key) DO NOTHING
      RETURNING *
    `),
  );
  let purchase = inserted;
  if (!purchase) {
    purchase = first(
      await db.execute(sql`
        SELECT * FROM operatoros_token_purchase_intents
        WHERE tenant_id=${input.tenantId} AND user_id=${input.userId}
          AND module_id=${module.id} AND idempotency_key=${input.idempotencyKey}
        LIMIT 1
      `),
    );
    if (!purchase) {
      throw new OperatorOsTokenBillingError(
        'Purchase idempotency claim failed',
        'TORQUE_PURCHASE_IDEMPOTENCY_FAILED',
        409,
      );
    }
    if (purchase.package_key !== selectedPackage.key) {
      throw new OperatorOsTokenBillingError(
        'Idempotency key was reused for another package',
        'TORQUE_PURCHASE_IDEMPOTENCY_CONFLICT',
        409,
      );
    }
    return { purchase: camel(purchase), replayed: true };
  }

  try {
    const checkout = testMode
      ? { sessionId: `test_checkout_${purchase.id}`, url: null }
      : await createUsageCreditCheckoutSession({
          purchaseId: String(purchase.id),
          tenantId: input.tenantId,
          userId: input.userId,
          moduleId: module.id,
          packageKey: selectedPackage.key,
          packageName: selectedPackage.name,
          units: selectedPackage.units,
          amountMinor: selectedPackage.amountMinor,
          currency: selectedPackage.currency,
          successUrl: canonicalReturnUrl(module.baseUrl, input.diagnosticSessionId, String(purchase.id), 'success'),
          cancelUrl: canonicalReturnUrl(module.baseUrl, input.diagnosticSessionId, String(purchase.id), 'cancelled'),
        });
    const updated = first(
      await db.execute(sql`
        UPDATE operatoros_token_purchase_intents
        SET provider_checkout_id=${checkout.sessionId},provider_checkout_url=${checkout.url},
          status='checkout_created',updated_at=NOW()
        WHERE tenant_id=${input.tenantId} AND id=${String(purchase.id)}
          AND status IN ('pending','payment_pending')
        RETURNING *
      `),
    )!;
    await writeAudit(
      {
        actorUserId: input.userId,
        tenantId: input.tenantId,
        targetType: 'operatoros_token_purchase',
        targetId: String(purchase.id),
        action: 'token_purchase_checkout_created',
        after: {
          packageKey: selectedPackage.key,
          units: selectedPackage.units,
          amountMinor: selectedPackage.amountMinor,
          currency: selectedPackage.currency,
          provider,
          providerMode,
        },
      },
      input.request,
    );
    return { purchase: camel(updated), replayed: false };
  } catch (error) {
    await db.execute(sql`
      UPDATE operatoros_token_purchase_intents
      SET status='failed',failure_code=${safeCode(error)},updated_at=NOW()
      WHERE tenant_id=${input.tenantId} AND id=${String(purchase.id)}
        AND status IN ('pending','payment_pending')
    `);
    throw error;
  }
}

function safeCode(error: unknown): string {
  const value =
    error && typeof error === 'object' && 'code' in error ? String((error as any).code) : '';
  return /^[A-Z0-9_:-]{2,120}$/.test(value) ? value : 'TOKEN_PAYMENT_FAILED';
}

function eventMetadata(eventObject: Record<string, any>): Record<string, any> {
  return eventObject.metadata && typeof eventObject.metadata === 'object'
    ? eventObject.metadata
    : {};
}

type TorqueSettlementKind = 'credit' | 'refund' | 'failed' | 'expired' | 'dispute' | 'dispute_closed';

function eventKind(type: string): TorqueSettlementKind {
  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') return 'credit';
  if (type === 'charge.refunded') return 'refund';
  if (type === 'checkout.session.expired') return 'expired';
  if (type === 'charge.dispute.created') return 'dispute';
  if (type === 'charge.dispute.closed') return 'dispute_closed';
  if (
    type === 'checkout.session.async_payment_failed' || type === 'payment_intent.payment_failed'
  )
    return 'failed';
  throw new OperatorOsTokenBillingError(
    'Unsupported token-payment event',
    'TORQUE_PAYMENT_EVENT_UNSUPPORTED',
    422,
  );
}

async function resolvedTorqueMetadata(event: Record<string, any>) {
  const object = event.data?.object;
  if (!object || typeof object !== 'object') {
    throw new OperatorOsTokenBillingError(
      'Payment event object is invalid',
      'TORQUE_PAYMENT_EVENT_INVALID',
      400,
    );
  }
  const direct = eventMetadata(object);
  if (direct.operatoros_kind === 'torque_assist_credit') {
    return {
      object,
      metadata: direct,
      paymentIntentId: String(object.payment_intent || (String(object.id || '').startsWith('pi_') ? object.id : '')),
      chargeId: String(object.charge || (String(object.id || '').startsWith('ch_') ? object.id : '')),
    };
  }
  const resolved = await resolveStripePaymentMetadata(event as any);
  return { object, ...resolved };
}

/** Classify after signature verification and before the generic billing claim. */
export async function isTorqueTokenStripeEvent(event: Record<string, any>): Promise<boolean> {
  if (!event || typeof event.type !== 'string') return false;
  if (![
    'checkout.session.completed', 'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed', 'checkout.session.expired',
    'payment_intent.payment_failed', 'charge.refunded',
    'charge.dispute.created', 'charge.dispute.closed',
  ].includes(event.type)) return false;
  const resolved = await resolvedTorqueMetadata(event);
  return resolved.metadata.operatoros_kind === 'torque_assist_credit';
}

async function prepareTorqueTokenWebhookEvent(
  event: Record<string, any>,
): Promise<Omit<VerifiedWebhookEvent, 'rawBody' | 'handlerKey'>> {
  if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') {
    throw new OperatorOsTokenBillingError(
      'Payment event envelope is invalid',
      'TORQUE_PAYMENT_EVENT_INVALID',
      400,
    );
  }
  const { object, metadata, paymentIntentId, chargeId } = await resolvedTorqueMetadata(event);
  if (metadata.operatoros_kind !== 'torque_assist_credit') {
    throw new OperatorOsTokenBillingError(
      'Payment event is not a Torque Assist credit event',
      'TORQUE_PAYMENT_EVENT_SCOPE_INVALID',
      422,
    );
  }
  const purchaseId = String(metadata.purchase_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(purchaseId)) {
    throw new OperatorOsTokenBillingError(
      'Payment purchase reference is invalid',
      'TORQUE_PAYMENT_EVENT_SCOPE_INVALID',
      422,
    );
  }
  const purchase = first(
    await db.execute(
      sql`SELECT * FROM operatoros_token_purchase_intents WHERE id=${purchaseId} LIMIT 1`,
    ),
  );
  if (!purchase) {
    throw new OperatorOsTokenBillingError(
      'Payment purchase reference was not found',
      'TORQUE_PAYMENT_PURCHASE_NOT_FOUND',
      404,
    );
  }
  for (const [metadataKey, expected] of [
    ['tenant_id', purchase.tenant_id],
    ['user_id', purchase.user_id],
    ['module_id', purchase.module_id],
    ['package_key', purchase.package_key],
    ['units', purchase.units],
  ] as const) {
    if (String(metadata[metadataKey] || '') !== String(expected)) {
      throw new OperatorOsTokenBillingError(
        'Signed payment metadata does not match the purchase intent',
        'TORQUE_PAYMENT_SCOPE_CONFLICT',
        409,
      );
    }
  }
  const incomingMode = event.livemode === true ? 'live' : 'test';
  if (incomingMode !== purchase.provider_mode) {
    throw new OperatorOsTokenBillingError(
      'Payment test/live mode does not match the purchase intent',
      'TORQUE_PAYMENT_MODE_CONFLICT',
      409,
    );
  }
  if (
    event.type.startsWith('checkout.session.') &&
    String(object.id || '') !== String(purchase.provider_checkout_id || '')
  ) {
    throw new OperatorOsTokenBillingError(
      'Checkout Session does not match the purchase intent',
      'TORQUE_PAYMENT_CHECKOUT_CONFLICT',
      409,
    );
  }
  const kind = eventKind(event.type);
  const adapter = getPaymentProviderAdapter();
  return {
    tenantId: String(purchase.tenant_id),
    moduleId: String(purchase.module_id),
    provider: adapter.status.name,
    providerEventId: event.id,
    eventType: event.type,
    safePayload: {
      kind,
      purchaseId,
      userId: String(purchase.user_id),
      amountMinor:
        kind === 'refund'
          ? Number(object.amount_refunded ?? 0)
          : Number(object.amount_total ?? object.amount_received ?? object.amount ?? 0),
      currency: String(object.currency || '').toUpperCase(),
      paymentStatus: String(object.payment_status || object.status || ''),
      checkoutMode: String(object.mode || ''),
      disputeStatus: String(object.status || ''),
      providerReference: String(paymentIntentId || object.payment_intent || object.id || ''),
      providerChargeReference: String(chargeId || ''),
      incomingMode,
    },
    correlationId: null,
  };
}

export function torqueTokenWebhookVerifier(): WebhookVerifier {
  return {
    async verify(input) {
      const adapter = getPaymentProviderAdapter();
      if (adapter.status.state === 'disabled') throw new ProviderDisabledError('payments');
      const signatureValue = input.headers['stripe-signature'];
      const signature = Array.isArray(signatureValue) ? signatureValue[0] : signatureValue;
      if (!signature) {
        throw new OperatorOsTokenBillingError(
          'Missing stripe-signature header',
          'TORQUE_PAYMENT_SIGNATURE_REQUIRED',
          400,
        );
      }
      const event = (await adapter.verifyWebhook(input.rawBody, signature)) as Record<string, any>;
      return prepareTorqueTokenWebhookEvent(event);
    },
  };
}

export async function receiveVerifiedTorqueTokenStripeEvent(input: {
  event: Record<string, any>;
  rawBody: string | Buffer;
}) {
  const verified = await prepareTorqueTokenWebhookEvent(input.event);
  if (verified.safePayload.kind === 'credit') {
    await db.execute(sql`
      UPDATE operatoros_token_purchase_intents
      SET status=CASE
        WHEN status IN ('credited','partially_refunded','refunded','disputed') THEN status
        ELSE 'paid_pending_credit' END,
        updated_at=NOW()
      WHERE tenant_id=${verified.tenantId}
        AND id=${String(verified.safePayload.purchaseId)}
    `);
  }
  return receiveVerifiedWebhook({
    ...verified,
    rawBody: input.rawBody,
    handlerKey: HANDLER_KEY,
    maxAttempts: 5,
  });
}

export async function settleTorqueTokenPurchase(context: SharedWebhookContext): Promise<void> {
  const payload = context.payload;
  const purchaseId = String(payload.purchaseId || '');
  const kind = String(payload.kind || '');
  await db.transaction(async (tx) => {
    const purchase = first(
      await tx.execute(sql`
        SELECT * FROM operatoros_token_purchase_intents
        WHERE tenant_id=${context.tenantId} AND id=${purchaseId} AND module_id=${context.moduleId}
        FOR UPDATE
      `),
    );
    if (!purchase) {
      throw new OperatorOsTokenBillingError(
        'Token purchase intent was not found in the verified scope',
        'TORQUE_PAYMENT_PURCHASE_NOT_FOUND',
        404,
      );
    }
    const eventReference = `${context.provider}:${purchase.provider_mode}:${context.providerEventId}`;
    if (kind === 'credit') {
      if (payload.paymentStatus !== 'paid' && payload.paymentStatus !== 'complete') {
        await tx.execute(sql`
          UPDATE operatoros_token_purchase_intents
          SET status='payment_pending',updated_at=NOW()
          WHERE tenant_id=${context.tenantId} AND id=${purchaseId}
            AND status NOT IN ('credited','partially_refunded','refunded','disputed')
        `);
        return;
      }
      if (payload.checkoutMode && payload.checkoutMode !== 'payment') {
        throw new OperatorOsTokenBillingError(
          'Checkout Session mode does not match a one-time credit purchase',
          'TORQUE_PAYMENT_CHECKOUT_MODE_CONFLICT',
          409,
        );
      }
      if (
        Number(payload.amountMinor) !== Number(purchase.amount_minor) ||
        String(payload.currency) !== String(purchase.currency)
      ) {
        throw new OperatorOsTokenBillingError(
          'Paid amount does not match the OperatorOS package snapshot',
          'TORQUE_PAYMENT_AMOUNT_CONFLICT',
          409,
        );
      }
      const providerReference = String(payload.providerReference || purchase.provider_checkout_id || '');
      let existingCredit = first(await tx.execute(sql`
        SELECT id FROM torqueshed_token_ledger_entries
        WHERE tenant_id=${context.tenantId} AND purchase_intent_id=${purchaseId}
          AND entry_kind='credit' LIMIT 1 FOR UPDATE
      `));
      if (!existingCredit) {
        existingCredit = first(await tx.execute(sql`
          INSERT INTO torqueshed_token_ledger_entries (
            tenant_id,user_id,module_id,entry_kind,operation_type,units,idempotency_key,
            external_event_ref,purchase_intent_id,metadata_json,created_by_user_id
          ) VALUES (
            ${context.tenantId},${purchase.user_id},${context.moduleId},'credit','token_purchase',
            ${Number(purchase.units)},${`purchase:${purchaseId}`},
            ${`${context.provider}:${purchase.provider_mode}:${providerReference}`},
            ${purchaseId},${{ packageKey: purchase.package_key, amountMinor: purchase.amount_minor, currency: purchase.currency }},
            ${purchase.user_id}
          ) ON CONFLICT DO NOTHING RETURNING id
        `));
      }
      if (!existingCredit) {
        throw new OperatorOsTokenBillingError(
          'Token credit could not be confirmed',
          'TORQUE_PAYMENT_CREDIT_UNAVAILABLE',
          409,
        );
      }
      await tx.execute(sql`
        UPDATE operatoros_token_purchase_intents
        SET status='credited',credited_at=COALESCE(credited_at,NOW()),failure_code=NULL,updated_at=NOW()
        WHERE tenant_id=${context.tenantId} AND id=${purchaseId}
      `);
      await writeAudit(
        {
          actorUserId: String(purchase.user_id),
          tenantId: context.tenantId,
          targetType: 'operatoros_token_purchase',
          targetId: purchaseId,
          action: 'token_purchase_credited',
          after: { units: Number(purchase.units), providerEventId: context.providerEventId },
        },
        undefined,
        tx,
      );
      return;
    }
    if (kind === 'failed' || kind === 'expired') {
      await tx.execute(sql`
        UPDATE operatoros_token_purchase_intents
        SET status=${kind === 'expired' ? 'expired' : 'failed'},
          failure_code=${kind === 'expired' ? 'CHECKOUT_EXPIRED' : 'PAYMENT_FAILED'},updated_at=NOW()
        WHERE tenant_id=${context.tenantId} AND id=${purchaseId}
          AND status IN ('pending','payment_pending','checkout_created','paid_pending_credit')
      `);
      await writeAudit(
        {
          actorUserId: String(purchase.user_id),
          tenantId: context.tenantId,
          targetType: 'operatoros_token_purchase',
          targetId: purchaseId,
          action: kind === 'expired' ? 'token_purchase_expired' : 'token_purchase_failed',
          after: { providerEventId: context.providerEventId },
        },
        undefined,
        tx,
      );
      return;
    }
    if (kind === 'dispute' || kind === 'dispute_closed') {
      const disputeStatus = String(payload.disputeStatus || '');
      if (kind === 'dispute_closed' && disputeStatus === 'won') {
        const reversed = first(await tx.execute(sql`
          SELECT COALESCE(SUM(units),0)::bigint AS units
          FROM torqueshed_token_ledger_entries
          WHERE tenant_id=${context.tenantId} AND purchase_intent_id=${purchaseId}
            AND entry_kind='credit_reversal' AND operation_type='token_purchase_dispute'
        `));
        const restoredUnits = Number(reversed?.units ?? 0);
        if (restoredUnits > 0) {
          await tx.execute(sql`
            INSERT INTO torqueshed_token_ledger_entries (
              tenant_id,user_id,module_id,entry_kind,operation_type,units,idempotency_key,
              external_event_ref,purchase_intent_id,metadata_json,created_by_user_id
            ) VALUES (
              ${context.tenantId},${purchase.user_id},${context.moduleId},'adjustment_credit',
              'token_purchase_dispute_won',${restoredUnits},${`dispute-won:${purchaseId}`},
              ${eventReference},${purchaseId},${{ disputeStatus }},${purchase.user_id}
            ) ON CONFLICT DO NOTHING
          `);
        }
        await tx.execute(sql`
          UPDATE operatoros_token_purchase_intents SET status='credited',failure_code=NULL,updated_at=NOW()
          WHERE tenant_id=${context.tenantId} AND id=${purchaseId} AND status='disputed'
        `);
        return;
      }
      if (kind === 'dispute_closed' && disputeStatus !== 'lost') return;
      const originalCredit = first(await tx.execute(sql`
        SELECT id,units FROM torqueshed_token_ledger_entries
        WHERE tenant_id=${context.tenantId} AND purchase_intent_id=${purchaseId}
          AND entry_kind='credit' LIMIT 1
      `));
      if (originalCredit) {
        const existingReversals = first(await tx.execute(sql`
          SELECT COALESCE(SUM(units),0)::bigint AS units
          FROM torqueshed_token_ledger_entries
          WHERE tenant_id=${context.tenantId} AND purchase_intent_id=${purchaseId}
            AND entry_kind='credit_reversal'
        `));
        const units = Math.max(0, Number(originalCredit.units) - Number(existingReversals?.units ?? 0));
        if (units > 0) {
          await tx.execute(sql`
            INSERT INTO torqueshed_token_ledger_entries (
              tenant_id,user_id,module_id,entry_kind,operation_type,units,idempotency_key,
              external_event_ref,purchase_intent_id,reverses_entry_id,metadata_json,created_by_user_id
            ) VALUES (
              ${context.tenantId},${purchase.user_id},${context.moduleId},'credit_reversal',
              'token_purchase_dispute',${units},${`dispute:${purchaseId}`},${eventReference},
              ${purchaseId},${String(originalCredit.id)},${{ disputeStatus }},${purchase.user_id}
            ) ON CONFLICT DO NOTHING
          `);
        }
      }
      await tx.execute(sql`
        UPDATE operatoros_token_purchase_intents
        SET status='disputed',failure_code='PAYMENT_DISPUTED',updated_at=NOW()
        WHERE tenant_id=${context.tenantId} AND id=${purchaseId}
      `);
      await writeAudit({
        actorUserId: String(purchase.user_id), tenantId: context.tenantId,
        targetType: 'operatoros_token_purchase', targetId: purchaseId,
        action: 'token_purchase_disputed', after: { providerEventId: context.providerEventId, disputeStatus },
      }, undefined, tx);
      return;
    }
    if (kind !== 'refund') {
      throw new OperatorOsTokenBillingError(
        'Verified token-payment action is invalid',
        'TORQUE_PAYMENT_EVENT_INVALID',
        422,
      );
    }
    const originalCredit = first(
      await tx.execute(sql`
        SELECT id,units FROM torqueshed_token_ledger_entries
        WHERE tenant_id=${context.tenantId} AND purchase_intent_id=${purchaseId} AND entry_kind='credit'
        LIMIT 1
      `),
    );
    if (!originalCredit) {
      throw new OperatorOsTokenBillingError(
        'Refund arrived before a matching credit',
        'TORQUE_PAYMENT_REFUND_WITHOUT_CREDIT',
        409,
      );
    }
    const refundedAmount = Number(payload.amountMinor);
    if (
      !Number.isSafeInteger(refundedAmount) ||
      refundedAmount <= 0 ||
      refundedAmount > purchase.amount_minor
    ) {
      throw new OperatorOsTokenBillingError(
        'Refund amount is invalid',
        'TORQUE_PAYMENT_REFUND_INVALID',
        422,
      );
    }
    const targetReversalUnits =
      refundedAmount === Number(purchase.amount_minor)
        ? Number(purchase.units)
        : Math.floor((Number(purchase.units) * refundedAmount) / Number(purchase.amount_minor));
    const existing = first(
      await tx.execute(sql`
        SELECT COALESCE(SUM(units),0)::bigint AS units
        FROM torqueshed_token_ledger_entries
        WHERE tenant_id=${context.tenantId} AND purchase_intent_id=${purchaseId}
          AND entry_kind='credit_reversal'
      `),
    );
    const reversalUnits = targetReversalUnits - Number(existing?.units ?? 0);
    if (reversalUnits > 0) {
      await tx.execute(sql`
        INSERT INTO torqueshed_token_ledger_entries (
          tenant_id,user_id,module_id,entry_kind,operation_type,units,idempotency_key,
          external_event_ref,purchase_intent_id,reverses_entry_id,metadata_json,created_by_user_id
        ) VALUES (
          ${context.tenantId},${purchase.user_id},${context.moduleId},'credit_reversal','token_purchase_refund',
          ${reversalUnits},${`refund:${context.providerEventId}`},${eventReference},${purchaseId},
          ${String(originalCredit.id)},${{ amountRefundedMinor: refundedAmount, currency: purchase.currency }},
          ${purchase.user_id}
        ) ON CONFLICT DO NOTHING
      `);
    }
    const fullyRefunded = targetReversalUnits >= Number(purchase.units);
    await tx.execute(sql`
      UPDATE operatoros_token_purchase_intents
      SET status=${fullyRefunded ? 'refunded' : 'partially_refunded'},
        refunded_at=CASE WHEN ${fullyRefunded} THEN NOW() ELSE refunded_at END,updated_at=NOW()
      WHERE tenant_id=${context.tenantId} AND id=${purchaseId}
    `);
    await writeAudit(
      {
        actorUserId: String(purchase.user_id),
        tenantId: context.tenantId,
        targetType: 'operatoros_token_purchase',
        targetId: purchaseId,
        action: 'token_purchase_refunded',
        after: {
          reversalUnits: Math.max(0, reversalUnits),
          targetReversalUnits,
          providerEventId: context.providerEventId,
        },
      },
      undefined,
      tx,
    );
  });
}

export function registerTorqueTokenWebhookHandler(): void {
  registerSharedWebhookHandler(HANDLER_KEY, settleTorqueTokenPurchase);
}

export function torqueTokenWebhookHandlerKey(): string {
  return HANDLER_KEY;
}
