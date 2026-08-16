import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { writeAudit } from './audit.js';
import {
  createUsageCreditCheckoutSession,
  getStripeRuntimeMode,
  resolveStripePaymentMetadata,
  retrieveTorqueStripeCheckoutEvidence,
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
import {
  getValidatedTorqueShedPrice,
  TORQUESHED_CREDIT_CATALOG_VERSION,
} from './torqueshed-credit-catalog.js';

const HANDLER_KEY = 'operatoros.torque-assist.token-purchase.v1';

type CheckoutCreator = typeof createUsageCreditCheckoutSession;
let checkoutCreatorForTests: CheckoutCreator | null = null;
export function __setTorqueCheckoutCreatorForTests(creator: CheckoutCreator | null) {
  if (!isOperatorOSTestEnvironment()) throw new Error('Torque checkout test override is test-only');
  checkoutCreatorForTests = creator;
}

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
) {
  const url = new URL(`/diagnostics/${encodeURIComponent(diagnosticSessionId)}`, baseUrl);
  if (url.protocol !== 'https:' && !(isOperatorOSTestEnvironment() && url.protocol === 'http:')) {
    throw new OperatorOsTokenBillingError(
      'TorqueShed canonical return URL is invalid',
      'TORQUE_CHECKOUT_RETURN_INVALID',
      503,
    );
  }
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
    SELECT id,module_id,diagnostic_session_id,package_key,units,amount_minor,currency,
      catalog_version,provider_mode,status,failure_code,checkout_created_at,
      settlement_policy_state,settlement_policy_units,payment_intent_id,
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
  const creditCount = Number(ledger?.credit_count ?? 0);
  const state = stored === 'pending' ? 'payment_pending'
    : stored === 'checkout_created' ? 'checkout_open'
      : stored === 'partially_refunded' ? 'refunded'
        : stored === 'credited' && creditCount !== 1 ? 'paid_pending_credit'
          : stored;
  const terminal = ['credited', 'cancelled', 'expired', 'failed', 'refunded', 'disputed'].includes(state);
  return {
    purchaseId: String(purchase.id), state, packageKey: String(purchase.package_key),
    diagnosticSessionId: purchase.diagnostic_session_id ? String(purchase.diagnostic_session_id) : null,
    units: Number(purchase.units), amountMinor: Number(purchase.amount_minor),
    currency: String(purchase.currency), failureCode: purchase.failure_code ?? null,
    catalogVersion: purchase.catalog_version ?? null, providerMode: purchase.provider_mode,
    paymentIntentId: purchase.payment_intent_id ?? null,
    settlementPolicy: {
      state: purchase.settlement_policy_state ?? 'none',
      units: Number(purchase.settlement_policy_units ?? 0),
    },
    credited: creditCount === 1 && stored === 'credited', terminal,
    balance: Number(ledger?.balance ?? 0), createdAt: purchase.created_at,
    checkoutCreatedAt: purchase.checkout_created_at,
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
  const catalogMapping = testMode ? null : await getValidatedTorqueShedPrice({
    environment: providerMode,
    packageKey: selectedPackage.key,
  });
  const purchaseId = randomUUID();
  const returnUrl = canonicalReturnUrl(module.baseUrl, input.diagnosticSessionId, purchaseId);
  const catalogVersion = catalogMapping?.catalogVersion ?? TORQUESHED_CREDIT_CATALOG_VERSION;
  const stripeAccountId = catalogMapping?.stripeAccountId ?? 'deterministic-test-account';
  const productId = catalogMapping?.stripeProductId ?? 'deterministic-test-product';
  const priceId = catalogMapping?.stripePriceId ?? 'price_deterministic_test_catalog';

  const inserted = first(
    await db.execute(sql`
      INSERT INTO operatoros_token_purchase_intents (
        id,tenant_id,user_id,module_id,diagnostic_session_id,package_key,units,amount_minor,currency,
        provider,provider_mode,catalog_version,stripe_account_id,provider_product_id,
        provider_price_id,success_return_url,cancel_return_url,status,idempotency_key
      ) VALUES (
        ${purchaseId},${input.tenantId},${input.userId},${module.id},${input.diagnosticSessionId},${selectedPackage.key},
        ${selectedPackage.units},${selectedPackage.amountMinor},${selectedPackage.currency},
        ${provider},${providerMode},${catalogVersion},${stripeAccountId},${productId},${priceId},
        ${returnUrl},${returnUrl},'creating_checkout',${input.idempotencyKey}
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
    if (purchase.package_key !== selectedPackage.key || purchase.diagnostic_session_id !== input.diagnosticSessionId) {
      throw new OperatorOsTokenBillingError(
        'Idempotency key was reused for another package',
        'TORQUE_PURCHASE_IDEMPOTENCY_CONFLICT',
        409,
      );
    }
    return { purchase: camel(purchase), replayed: true };
  }

  try {
    const checkoutCreator = checkoutCreatorForTests ?? createUsageCreditCheckoutSession;
    const checkout = testMode && !checkoutCreatorForTests
      ? { sessionId: `test_checkout_${purchase.id}`, url: null }
      : await checkoutCreator({
          purchaseId: String(purchase.id),
          tenantId: input.tenantId,
          userId: input.userId,
          moduleId: module.id,
          packageKey: selectedPackage.key,
          packageName: selectedPackage.name,
          priceId,
          productId,
          stripeAccountId,
          diagnosticSessionId: input.diagnosticSessionId,
          catalogVersion,
          environment: providerMode,
          units: selectedPackage.units,
          amountMinor: selectedPackage.amountMinor,
          currency: selectedPackage.currency,
          successUrl: returnUrl,
          cancelUrl: returnUrl,
        });
    const updated = first(
      await db.execute(sql`
        UPDATE operatoros_token_purchase_intents
        SET provider_checkout_id=${checkout.sessionId},provider_checkout_url=${checkout.url},
          status='checkout_open',checkout_created_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${input.tenantId} AND id=${String(purchase.id)}
          AND status='creating_checkout'
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
      SET status='failed',failure_code=${safeCode(error)},failed_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${input.tenantId} AND id=${String(purchase.id)}
        AND status='creating_checkout'
    `);
    throw new OperatorOsTokenBillingError(
      'Checkout was not created. Nothing was charged.',
      'TORQUE_CHECKOUT_NOT_CREATED',
      502,
      {
        userMessage: 'Checkout was not created. Nothing was charged.',
        retryable: false,
        administratorAction: `Inspect the failed purchase intent using code ${safeCode(error)} before allowing a new idempotency key.`,
        checks: readiness.checks,
      },
    );
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
  // Purchases created before the Phase 43 contract do not have the new
  // immutable snapshots. Keep those already-open sessions settleable under
  // their original signed metadata, while requiring the expanded contract for
  // every purchase created after the catalog version snapshot was introduced.
  if (purchase.catalog_version) {
    for (const [metadataKey, expected] of [
      ['diagnostic_session_id', purchase.diagnostic_session_id],
      ['catalog_version', purchase.catalog_version],
      ['environment', purchase.provider_mode],
      ['module_slug', 'torqueshed'],
      ['operatoros_source', 'server_authoritative_catalog'],
      ['stripe_account_id', purchase.stripe_account_id],
      ['provider_product_id', purchase.provider_product_id],
      ['provider_price_id', purchase.provider_price_id],
    ] as const) {
      if (String(metadata[metadataKey] || '') !== String(expected)) {
        throw new OperatorOsTokenBillingError(
          'Signed payment metadata does not match the purchase intent',
          'TORQUE_PAYMENT_SCOPE_CONFLICT',
          409,
        );
      }
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
  let settlementEvidence: Awaited<ReturnType<typeof retrieveTorqueStripeCheckoutEvidence>> | null = null;
  if (kind === 'credit' && purchase.catalog_version) {
    if (purchase.provider === 'stripe') {
      settlementEvidence = await retrieveTorqueStripeCheckoutEvidence(String(purchase.provider_checkout_id));
    } else {
      const lineItems = Array.isArray(object.line_items?.data) ? object.line_items.data : [];
      const item = lineItems[0] ?? {};
      const price = item.price ?? {};
      settlementEvidence = {
        accountId: String(event.account || metadata.stripe_account_id || ''),
        checkoutSessionId: String(object.id || ''),
        paymentIntentId: String(object.payment_intent || ''),
        lineItemCount: lineItems.length,
        quantity: Number(item.quantity ?? 0),
        priceId: String(price.id || ''),
        productId: typeof price.product === 'string' ? price.product : String(price.product?.id || ''),
        amountMinor: Number(object.amount_total ?? 0),
        currency: String(object.currency || '').toUpperCase(),
        paymentStatus: String(object.payment_status || ''),
        checkoutMode: String(object.mode || ''),
      };
    }
    for (const [field, actual, expected] of [
      ['account', settlementEvidence.accountId, purchase.stripe_account_id],
      ['checkout', settlementEvidence.checkoutSessionId, purchase.provider_checkout_id],
      ['Price', settlementEvidence.priceId, purchase.provider_price_id],
      ['Product', settlementEvidence.productId, purchase.provider_product_id],
      ['amount', settlementEvidence.amountMinor, purchase.amount_minor],
      ['currency', settlementEvidence.currency, purchase.currency],
    ] as const) {
      if (String(actual) !== String(expected)) {
        throw new OperatorOsTokenBillingError(
          `Stripe ${field} evidence does not match the purchase intent`,
          `TORQUE_PAYMENT_${String(field).toUpperCase()}_CONFLICT`,
          409,
        );
      }
    }
    if (settlementEvidence.lineItemCount !== 1 || settlementEvidence.quantity !== 1) {
      throw new OperatorOsTokenBillingError(
        'Stripe Checkout must contain exactly one package line item',
        'TORQUE_PAYMENT_LINE_ITEM_CONFLICT',
        409,
      );
    }
    if (settlementEvidence.checkoutMode !== 'payment') {
      throw new OperatorOsTokenBillingError(
        'Stripe Checkout mode does not match a one-time purchase',
        'TORQUE_PAYMENT_CHECKOUT_MODE_CONFLICT',
        409,
      );
    }
  }
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
      catalogVersion: purchase.catalog_version ?? null,
      stripeAccountId: settlementEvidence?.accountId ?? purchase.stripe_account_id ?? null,
      providerProductId: settlementEvidence?.productId ?? purchase.provider_product_id ?? null,
      providerPriceId: settlementEvidence?.priceId ?? purchase.provider_price_id ?? null,
      lineItemCount: settlementEvidence?.lineItemCount ?? null,
      lineItemQuantity: settlementEvidence?.quantity ?? null,
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
  return receiveVerifiedWebhook({
    ...verified,
    rawBody: input.rawBody,
    handlerKey: HANDLER_KEY,
    maxAttempts: 5,
  });
}

type SettlementExecutor = Pick<typeof db, 'execute'>;

async function lockTorqueSettlementBalance(
  executor: SettlementExecutor,
  tenantId: string,
  userId: string,
): Promise<void> {
  await executor.execute(sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`torqueshed:token-balance:${tenantId}:${userId}`}, 0)
    )
  `);
  await executor.execute(sql`SELECT id FROM users WHERE id=${userId} FOR UPDATE`);
}

async function finishSettlementReceipt(
  executor: SettlementExecutor,
  context: SharedWebhookContext,
): Promise<void> {
  if (context.receiptId.startsWith('reconcile:')) return;
  const completed = await executor.execute(sql`
    UPDATE shared_webhook_receipts
    SET status='processed',attempt_count=attempt_count+1,processed_at=NOW(),
      lease_owner=NULL,lease_expires_at=NULL,last_error_code=NULL,updated_at=NOW()
    WHERE id=${context.receiptId} AND tenant_id=${context.tenantId}
      AND provider_event_id=${context.providerEventId} AND status='processing'
    RETURNING id
  `);
  if (!completed.rows[0]) {
    throw new OperatorOsTokenBillingError(
      'Settlement receipt could not be atomically completed',
      'TORQUE_PAYMENT_RECEIPT_CONFLICT',
      409,
    );
  }
}

async function applyBoundedPolicyReversal(input: {
  executor: SettlementExecutor;
  context: SharedWebhookContext;
  purchase: Record<string, any>;
  originalCredit: Record<string, any>;
  targetUnits: number;
  operationType: 'token_purchase_refund' | 'token_purchase_dispute';
  holdKind: 'refund_debt' | 'dispute_freeze';
  metadata: Record<string, unknown>;
}) {
  const existing = first(await input.executor.execute(sql`
    SELECT COALESCE(SUM(units),0)::bigint AS units
    FROM torqueshed_token_ledger_entries
    WHERE tenant_id=${input.context.tenantId}
      AND purchase_intent_id=${String(input.purchase.id)}
      AND entry_kind='credit_reversal'
  `));
  const outstanding = Math.max(0, input.targetUnits - Number(existing?.units ?? 0));
  const balance = first(await input.executor.execute(sql`
    SELECT COALESCE(SUM(CASE
      WHEN entry_kind IN ('credit','debit_reversal','adjustment_credit') THEN units
      ELSE -units END),0)::bigint AS balance
    FROM torqueshed_token_ledger_entries
    WHERE tenant_id=${input.context.tenantId} AND module_id=${input.context.moduleId}
      AND user_id=${String(input.purchase.user_id)}
  `));
  const appliedUnits = Math.min(outstanding, Math.max(0, Number(balance?.balance ?? 0)));
  const eventReference = `${input.context.provider}:${input.purchase.provider_mode}:${input.context.providerEventId}`;
  if (appliedUnits > 0) {
    await input.executor.execute(sql`
      INSERT INTO torqueshed_token_ledger_entries (
        tenant_id,user_id,module_id,entry_kind,operation_type,units,idempotency_key,
        external_event_ref,purchase_intent_id,reverses_entry_id,metadata_json,created_by_user_id
      ) VALUES (
        ${input.context.tenantId},${input.purchase.user_id},${input.context.moduleId},
        'credit_reversal',${input.operationType},${appliedUnits},
        ${`${input.operationType}:${input.context.providerEventId}`},${eventReference},
        ${String(input.purchase.id)},${String(input.originalCredit.id)},${input.metadata},
        ${input.purchase.user_id}
      ) ON CONFLICT DO NOTHING
    `);
  }
  const heldUnits = Math.max(0, outstanding - appliedUnits);
  await input.executor.execute(sql`
    INSERT INTO torqueshed_credit_policy_holds (
      tenant_id,user_id,module_id,purchase_intent_id,hold_kind,units,status,
      reason_code,provider_event_id,resolved_at
    ) VALUES (
      ${input.context.tenantId},${input.purchase.user_id},${input.context.moduleId},
      ${String(input.purchase.id)},${input.holdKind},${heldUnits},
      ${heldUnits > 0 ? 'open' : 'resolved'},
      ${heldUnits > 0 ? 'SPENT_CREDIT_ADMIN_REVIEW' : 'POLICY_SATISFIED'},
      ${input.context.providerEventId},${heldUnits > 0 ? null : new Date()}
    ) ON CONFLICT (tenant_id,purchase_intent_id,hold_kind) DO UPDATE SET
      units=EXCLUDED.units,status=EXCLUDED.status,reason_code=EXCLUDED.reason_code,
      provider_event_id=EXCLUDED.provider_event_id,updated_at=NOW(),resolved_at=EXCLUDED.resolved_at
  `);
  return { outstanding, appliedUnits, heldUnits };
}

export async function settleTorqueTokenPurchase(context: SharedWebhookContext): Promise<void> {
  const payload = context.payload;
  const purchaseId = String(payload.purchaseId || '');
  const kind = String(payload.kind || '');
  await db.transaction(async (tx) => {
    if (!context.receiptId.startsWith('reconcile:')) {
      const receipt = first(await tx.execute(sql`
        SELECT id FROM shared_webhook_receipts
        WHERE id=${context.receiptId} AND tenant_id=${context.tenantId}
          AND provider_event_id=${context.providerEventId} AND status='processing'
        FOR UPDATE
      `));
      if (!receipt) {
        throw new OperatorOsTokenBillingError(
          'Settlement receipt is not exclusively claimed',
          'TORQUE_PAYMENT_RECEIPT_CONFLICT',
          409,
        );
      }
    }
    const purchase = first(await tx.execute(sql`
      SELECT * FROM operatoros_token_purchase_intents
      WHERE tenant_id=${context.tenantId} AND id=${purchaseId} AND module_id=${context.moduleId}
      FOR UPDATE
    `));
    if (!purchase) {
      throw new OperatorOsTokenBillingError(
        'Token purchase intent was not found in the verified scope',
        'TORQUE_PAYMENT_PURCHASE_NOT_FOUND',
        404,
      );
    }
    await lockTorqueSettlementBalance(tx, context.tenantId, String(purchase.user_id));
    let completed = false;
    try {
      const eventReference = `${context.provider}:${purchase.provider_mode}:${context.providerEventId}`;
      if (kind === 'credit') {
        const existingCredit = first(await tx.execute(sql`
          SELECT id FROM torqueshed_token_ledger_entries
          WHERE tenant_id=${context.tenantId} AND purchase_intent_id=${purchaseId}
            AND entry_kind='credit' LIMIT 1 FOR UPDATE
        `));
        if (purchase.status === 'credited' && existingCredit) {
          completed = true;
          return;
        }
        if (!['pending','checkout_created','checkout_open','payment_pending','paid_pending_credit'].includes(String(purchase.status))) {
          throw new OperatorOsTokenBillingError(
            'Paid event is not legal from the current purchase state',
            'TORQUE_PAYMENT_STATE_CONFLICT',
            409,
          );
        }
        if (payload.paymentStatus !== 'paid' && payload.paymentStatus !== 'complete') {
          await tx.execute(sql`
            UPDATE operatoros_token_purchase_intents
            SET status='payment_pending',last_provider_event_at=NOW(),updated_at=NOW()
            WHERE tenant_id=${context.tenantId} AND id=${purchaseId}
          `);
          completed = true;
          return;
        }
        if (payload.checkoutMode && payload.checkoutMode !== 'payment') {
          throw new OperatorOsTokenBillingError(
            'Checkout Session mode does not match a one-time credit purchase',
            'TORQUE_PAYMENT_CHECKOUT_MODE_CONFLICT',
            409,
          );
        }
        if (Number(payload.amountMinor) !== Number(purchase.amount_minor)
          || String(payload.currency) !== String(purchase.currency)) {
          throw new OperatorOsTokenBillingError(
            'Paid amount does not match the OperatorOS package snapshot',
            'TORQUE_PAYMENT_AMOUNT_CONFLICT',
            409,
          );
        }
        if (purchase.catalog_version) {
          for (const [actual, expected] of [
            [payload.catalogVersion, purchase.catalog_version],
            [payload.stripeAccountId, purchase.stripe_account_id],
            [payload.providerProductId, purchase.provider_product_id],
            [payload.providerPriceId, purchase.provider_price_id],
            [payload.lineItemCount, 1],
            [payload.lineItemQuantity, 1],
          ]) {
            if (String(actual) !== String(expected)) {
              throw new OperatorOsTokenBillingError(
                'Provider settlement evidence conflicts with the purchase snapshot',
                'TORQUE_PAYMENT_EVIDENCE_CONFLICT',
                409,
              );
            }
          }
        }
        await tx.execute(sql`
          UPDATE operatoros_token_purchase_intents SET status='paid_pending_credit',updated_at=NOW()
          WHERE tenant_id=${context.tenantId} AND id=${purchaseId}
        `);
        let credit = existingCredit;
        const providerReference = String(payload.providerReference || purchase.provider_checkout_id || '');
        if (!credit) {
          credit = first(await tx.execute(sql`
            INSERT INTO torqueshed_token_ledger_entries (
              tenant_id,user_id,module_id,entry_kind,operation_type,units,idempotency_key,
              external_event_ref,purchase_intent_id,metadata_json,created_by_user_id
            ) VALUES (
              ${context.tenantId},${purchase.user_id},${context.moduleId},'credit','token_purchase',
              ${Number(purchase.units)},${`purchase:${purchaseId}`},
              ${`${context.provider}:${purchase.provider_mode}:${providerReference}`},${purchaseId},
              ${{
                packageKey: purchase.package_key,
                amountMinor: Number(purchase.amount_minor),
                currency: purchase.currency,
                catalogVersion: purchase.catalog_version,
                providerPriceId: purchase.provider_price_id,
              }},${purchase.user_id}
            ) ON CONFLICT DO NOTHING RETURNING id
          `));
        }
        if (!credit) {
          throw new OperatorOsTokenBillingError(
            'Token credit could not be confirmed',
            'TORQUE_PAYMENT_CREDIT_UNAVAILABLE',
            409,
          );
        }
        await tx.execute(sql`
          UPDATE operatoros_token_purchase_intents
          SET status='credited',credited_at=COALESCE(credited_at,NOW()),failure_code=NULL,
            payment_intent_id=${providerReference || null},
            provider_charge_id=${String(payload.providerChargeReference || '') || null},
            settled_provider_event_id=COALESCE(settled_provider_event_id,${context.providerEventId}),
            last_provider_event_at=NOW(),updated_at=NOW()
          WHERE tenant_id=${context.tenantId} AND id=${purchaseId}
        `);
        await writeAudit({
          actorUserId: String(purchase.user_id), tenantId: context.tenantId,
          targetType: 'operatoros_token_purchase', targetId: purchaseId,
          action: 'token_purchase_credited',
          after: { units: Number(purchase.units), providerEventId: context.providerEventId },
        }, undefined, tx);
        completed = true;
        return;
      }

      if (kind === 'failed' || kind === 'expired') {
        if (['credited','partially_refunded','refunded','disputed'].includes(String(purchase.status))) {
          completed = true;
          return;
        }
        await tx.execute(sql`
          UPDATE operatoros_token_purchase_intents
          SET status=${kind === 'expired' ? 'expired' : 'failed'},
            failure_code=${kind === 'expired' ? 'CHECKOUT_EXPIRED' : 'PAYMENT_FAILED'},
            payment_intent_id=COALESCE(payment_intent_id,${String(payload.providerReference || '') || null}),
            provider_charge_id=COALESCE(provider_charge_id,${String(payload.providerChargeReference || '') || null}),
            last_provider_event_at=NOW(),updated_at=NOW()
          WHERE tenant_id=${context.tenantId} AND id=${purchaseId}
            AND status IN ('pending','creating_checkout','checkout_open','payment_pending','checkout_created','paid_pending_credit','failed','expired')
        `);
        await writeAudit({
          actorUserId: String(purchase.user_id), tenantId: context.tenantId,
          targetType: 'operatoros_token_purchase', targetId: purchaseId,
          action: kind === 'expired' ? 'token_purchase_expired' : 'token_purchase_failed',
          after: { providerEventId: context.providerEventId },
        }, undefined, tx);
        completed = true;
        return;
      }

      const originalCredit = first(await tx.execute(sql`
        SELECT id,units FROM torqueshed_token_ledger_entries
        WHERE tenant_id=${context.tenantId} AND purchase_intent_id=${purchaseId}
          AND entry_kind='credit' LIMIT 1 FOR UPDATE
      `));
      if (!originalCredit) {
        throw new OperatorOsTokenBillingError(
          `${kind === 'refund' ? 'Refund' : 'Dispute'} arrived before a matching credit`,
          kind === 'refund' ? 'TORQUE_PAYMENT_REFUND_WITHOUT_CREDIT' : 'TORQUE_PAYMENT_DISPUTE_WITHOUT_CREDIT',
          409,
        );
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
            UPDATE torqueshed_credit_policy_holds SET status='resolved',units=0,
              reason_code='DISPUTE_WON',provider_event_id=${context.providerEventId},
              updated_at=NOW(),resolved_at=NOW()
            WHERE tenant_id=${context.tenantId} AND purchase_intent_id=${purchaseId}
              AND hold_kind='dispute_freeze'
          `);
          await tx.execute(sql`
            UPDATE operatoros_token_purchase_intents
            SET status='credited',failure_code=NULL,settlement_policy_state='none',
              settlement_policy_units=0,last_provider_event_at=NOW(),updated_at=NOW()
            WHERE tenant_id=${context.tenantId} AND id=${purchaseId} AND status='disputed'
          `);
          completed = true;
          return;
        }
        if (kind === 'dispute_closed' && disputeStatus !== 'lost') {
          completed = true;
          return;
        }
        const policy = await applyBoundedPolicyReversal({
          executor: tx, context, purchase, originalCredit,
          targetUnits: Number(originalCredit.units),
          operationType: 'token_purchase_dispute', holdKind: 'dispute_freeze',
          metadata: { disputeStatus },
        });
        const policyState = kind === 'dispute_closed' ? 'dispute_lost' : 'dispute_frozen';
        await tx.execute(sql`
          UPDATE operatoros_token_purchase_intents
          SET status='disputed',failure_code='PAYMENT_DISPUTED',
            settlement_policy_state=${policyState},settlement_policy_units=${policy.heldUnits},
            last_provider_event_at=NOW(),updated_at=NOW()
          WHERE tenant_id=${context.tenantId} AND id=${purchaseId}
        `);
        await writeAudit({
          actorUserId: String(purchase.user_id), tenantId: context.tenantId,
          targetType: 'operatoros_token_purchase', targetId: purchaseId,
          action: 'token_purchase_disputed',
          after: {
            providerEventId: context.providerEventId, disputeStatus,
            reversedUnits: policy.appliedUnits, reviewUnits: policy.heldUnits,
          },
        }, undefined, tx);
        completed = true;
        return;
      }

      if (kind !== 'refund') {
        throw new OperatorOsTokenBillingError(
          'Verified token-payment action is invalid',
          'TORQUE_PAYMENT_EVENT_INVALID',
          422,
        );
      }
      const refundedAmount = Number(payload.amountMinor);
      if (!Number.isSafeInteger(refundedAmount) || refundedAmount <= 0
        || refundedAmount > Number(purchase.amount_minor)) {
        throw new OperatorOsTokenBillingError(
          'Refund amount is invalid',
          'TORQUE_PAYMENT_REFUND_INVALID',
          422,
        );
      }
      const targetReversalUnits = refundedAmount === Number(purchase.amount_minor)
        ? Number(purchase.units)
        : Math.floor((Number(purchase.units) * refundedAmount) / Number(purchase.amount_minor));
      const policy = await applyBoundedPolicyReversal({
        executor: tx, context, purchase, originalCredit, targetUnits: targetReversalUnits,
        operationType: 'token_purchase_refund', holdKind: 'refund_debt',
        metadata: { amountRefundedMinor: refundedAmount, currency: purchase.currency },
      });
      const fullyRefunded = targetReversalUnits >= Number(purchase.units);
      await tx.execute(sql`
        UPDATE operatoros_token_purchase_intents
        SET status=${fullyRefunded ? 'refunded' : 'partially_refunded'},
          refunded_at=CASE WHEN ${fullyRefunded} THEN NOW() ELSE refunded_at END,
          failure_code=${policy.heldUnits > 0 ? 'REFUND_REVIEW_REQUIRED' : null},
          settlement_policy_state=${policy.heldUnits > 0 ? 'refund_review' : 'none'},
          settlement_policy_units=${policy.heldUnits},last_provider_event_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${context.tenantId} AND id=${purchaseId}
      `);
      await writeAudit({
        actorUserId: String(purchase.user_id), tenantId: context.tenantId,
        targetType: 'operatoros_token_purchase', targetId: purchaseId,
        action: 'token_purchase_refunded',
        after: {
          reversalUnits: policy.appliedUnits, reviewUnits: policy.heldUnits,
          targetReversalUnits, providerEventId: context.providerEventId,
        },
      }, undefined, tx);
      completed = true;
    } finally {
      if (completed) await finishSettlementReceipt(tx, context);
    }
  });
}

export function registerTorqueTokenWebhookHandler(): void {
  registerSharedWebhookHandler(HANDLER_KEY, settleTorqueTokenPurchase);
}

export function torqueTokenWebhookHandlerKey(): string {
  return HANDLER_KEY;
}
