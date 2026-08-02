import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from '../db.js';
import {
  modules,
  tradeflowkitInvoices,
  tradeflowkitJobs,
  tradeflowkitPaymentOauthStates,
  tradeflowkitPaymentProviderAccounts,
  tradeflowkitPayments,
  tradeflowkitSettings,
} from '../schema.js';
import {
  requireTenantAdmin,
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import {
  createTradeFlowKitStripeClient,
  getTradeFlowKitStripeConnectConfig,
} from '../lib/tradeflowkit-payment-provider.js';
import {
  receiveVerifiedWebhook,
  registerSharedWebhookHandler,
  type SharedWebhookContext,
} from '../lib/shared-webhooks.js';
import { appendActivityEvent } from '../lib/shared-usage-activity.js';

const readGuards = [requireTenantMember, requireTenantModuleAccess('tradeflowkit')];
const adminGuards = [...readGuards, requireTenantModuleWriteAccess, requireTenantAdmin];
const WEBHOOK_HANDLER_KEY = 'tradeflowkit.stripe-connect.checkout.v1';
const CHECKOUT_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
]);
let webhookHandlerRegistered = false;

type TenantRequest = FastifyRequest & {
  tenantContext: { tenantId: string };
  user: { id: string };
};

function hashState(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function tenantId(request: FastifyRequest): string {
  return (request as TenantRequest).tenantContext.tenantId;
}

function userId(request: FastifyRequest): string {
  return (request as TenantRequest).user.id;
}

async function tradeFlowKitModuleId(): Promise<string> {
  const [module] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, 'tradeflowkit')).limit(1);
  if (!module) throw new Error('TradeFlowKit module registry row is missing');
  return module.id;
}

function safeAccount(account: typeof tradeflowkitPaymentProviderAccounts.$inferSelect | undefined) {
  if (!account) return null;
  return {
    id: account.id,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
    livemode: account.livemode,
    status: account.status,
    chargesEnabled: account.chargesEnabled,
    payoutsEnabled: account.payoutsEnabled,
    detailsSubmitted: account.detailsSubmitted,
    version: account.version,
    connectedAt: account.connectedAt,
    disconnectedAt: account.disconnectedAt,
    updatedAt: account.updatedAt,
  };
}

function validReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !/^\/modules\/tradeflowkit(?:[/?#][^\r\n]*)?$/.test(value) || value.startsWith('//')) {
    return '/modules/tradeflowkit/settings?section=payments';
  }
  return value.slice(0, 500);
}

export async function processStripeConnectWebhook(context: SharedWebhookContext): Promise<void> {
  const paymentId = String(context.payload.paymentId ?? '');
  const checkoutId = String(context.payload.checkoutId ?? '');
  const providerAccountId = String(context.payload.providerAccountId ?? '');
  const amountTotal = Number(context.payload.amountTotal);
  const currency = String(context.payload.currency ?? '').toUpperCase();
  const paymentStatus = String(context.payload.paymentStatus ?? '');
  if (!paymentId || !checkoutId || !providerAccountId) {
    throw Object.assign(new Error('Stripe Connect webhook is missing safe identifiers'), { code: 'STRIPE_WEBHOOK_IDENTIFIERS_MISSING' });
  }

  if (['checkout.session.expired', 'checkout.session.async_payment_failed'].includes(context.eventType)) {
    await db.update(tradeflowkitPayments).set({
      status: 'failed',
      failureCode: context.eventType === 'checkout.session.expired' ? 'CHECKOUT_EXPIRED' : 'ASYNC_PAYMENT_FAILED',
      providerEventId: context.providerEventId,
      updatedAt: new Date(),
      version: sql`${tradeflowkitPayments.version} + 1`,
    }).where(and(
      eq(tradeflowkitPayments.id, paymentId),
      eq(tradeflowkitPayments.tenantId, context.tenantId),
      eq(tradeflowkitPayments.provider, 'stripe_connect'),
      eq(tradeflowkitPayments.providerReference, checkoutId),
      eq(tradeflowkitPayments.providerAccountId, providerAccountId),
      eq(tradeflowkitPayments.status, 'pending'),
    ));
    return;
  }
  if (paymentStatus !== 'paid' || !Number.isSafeInteger(amountTotal) || amountTotal <= 0 || !/^[A-Z]{3}$/.test(currency)) {
    throw Object.assign(new Error('Stripe Checkout session is not a paid, bounded settlement'), { code: 'STRIPE_PAYMENT_NOT_SETTLED' });
  }

  await db.transaction(async tx => {
    await tx.execute(sql`
      SELECT id FROM tradeflowkit_payments
      WHERE id=${paymentId} AND tenant_id=${context.tenantId}
      FOR UPDATE
    `);
    const [payment] = await tx.select().from(tradeflowkitPayments).where(and(
      eq(tradeflowkitPayments.id, paymentId),
      eq(tradeflowkitPayments.tenantId, context.tenantId),
      eq(tradeflowkitPayments.provider, 'stripe_connect'),
      eq(tradeflowkitPayments.providerReference, checkoutId),
      eq(tradeflowkitPayments.providerAccountId, providerAccountId),
    )).limit(1);
    if (!payment) throw Object.assign(new Error('Stripe payment binding was not found'), { code: 'STRIPE_PAYMENT_BINDING_MISMATCH' });
    if (payment.status === 'succeeded') return;
    if (payment.status !== 'pending') throw Object.assign(new Error('Stripe payment is not pending'), { code: 'STRIPE_PAYMENT_STATE_CONFLICT' });
    if (payment.amountCents !== amountTotal) throw Object.assign(new Error('Stripe payment amount does not match'), { code: 'STRIPE_PAYMENT_AMOUNT_MISMATCH' });

    await tx.execute(sql`
      SELECT id FROM tradeflowkit_invoices
      WHERE id=${payment.invoiceId} AND tenant_id=${context.tenantId}
      FOR UPDATE
    `);
    const [[invoice], [settings]] = await Promise.all([
      tx.select().from(tradeflowkitInvoices).where(and(
        eq(tradeflowkitInvoices.id, payment.invoiceId),
        eq(tradeflowkitInvoices.tenantId, context.tenantId),
        isNull(tradeflowkitInvoices.deletedAt),
      )).limit(1),
      tx.select({ currency: tradeflowkitSettings.currency }).from(tradeflowkitSettings)
        .where(eq(tradeflowkitSettings.tenantId, context.tenantId)).limit(1),
    ]);
    if (!invoice || invoice.balanceCents < amountTotal) throw Object.assign(new Error('Invoice balance changed before settlement'), { code: 'INVOICE_BALANCE_CONFLICT' });
    if ((settings?.currency ?? 'USD').toUpperCase() !== currency) throw Object.assign(new Error('Stripe payment currency does not match'), { code: 'STRIPE_PAYMENT_CURRENCY_MISMATCH' });
    const paidCents = invoice.paidCents + amountTotal;
    const balanceCents = invoice.totalCents - paidCents;
    const settledAt = new Date();
    await tx.update(tradeflowkitPayments).set({
      status: 'succeeded',
      providerEventId: context.providerEventId,
      failureCode: null,
      paidAt: settledAt,
      updatedAt: settledAt,
      version: sql`${tradeflowkitPayments.version} + 1`,
    }).where(and(
      eq(tradeflowkitPayments.id, payment.id),
      eq(tradeflowkitPayments.tenantId, context.tenantId),
      eq(tradeflowkitPayments.status, 'pending'),
    ));
    await tx.update(tradeflowkitInvoices).set({
      paidCents,
      balanceCents,
      status: balanceCents === 0 ? 'paid' : 'processing',
      ...(balanceCents === 0 ? { paidAt: settledAt } : {}),
      paymentMethod: 'stripe_connect',
      paymentReference: checkoutId,
      updatedAt: settledAt,
      version: sql`${tradeflowkitInvoices.version} + 1`,
    }).where(and(
      eq(tradeflowkitInvoices.id, invoice.id),
      eq(tradeflowkitInvoices.tenantId, context.tenantId),
      eq(tradeflowkitInvoices.version, invoice.version),
    ));
    if (balanceCents === 0 && invoice.jobId) {
      await tx.update(tradeflowkitJobs).set({
        status: 'paid',
        updatedAt: settledAt,
        version: sql`${tradeflowkitJobs.version} + 1`,
      }).where(and(eq(tradeflowkitJobs.id, invoice.jobId), eq(tradeflowkitJobs.tenantId, context.tenantId)));
    }
    await appendActivityEvent({
      tenantId: context.tenantId,
      moduleId: context.moduleId,
      actorUserId: null,
      objectType: 'tradeflowkit_invoice',
      objectId: invoice.id,
      eventType: 'stripe_connect_payment_settled',
      summary: 'Stripe Connect payment settled',
      metadata: { paymentId: payment.id, amountCents: amountTotal, currency, providerAccountId },
      correlationId: context.receiptId,
    }, tx);
  });
}

function ensureWebhookHandler(): void {
  if (webhookHandlerRegistered) return;
  registerSharedWebhookHandler(WEBHOOK_HANDLER_KEY, processStripeConnectWebhook);
  webhookHandlerRegistered = true;
}

function stripeAccountState(account: Stripe.Account) {
  return {
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    status: account.charges_enabled ? 'connected' : 'restricted',
  } as const;
}

export async function registerTradeFlowKitPaymentRoutes(app: FastifyInstance): Promise<void> {
  ensureWebhookHandler();

  app.get('/v1/modules/tradeflowkit/payments/provider', { preHandler: [...readGuards] }, async request => {
    const resolved = getTradeFlowKitStripeConnectConfig();
    const [account] = await db.select().from(tradeflowkitPaymentProviderAccounts).where(and(
      eq(tradeflowkitPaymentProviderAccounts.tenantId, tenantId(request)),
      eq(tradeflowkitPaymentProviderAccounts.provider, 'stripe_connect'),
    )).limit(1);
    return {
      provider: 'stripe_connect',
      configured: Boolean(resolved.config),
      mode: resolved.mode,
      reason: resolved.config ? null : resolved.reason,
      account: safeAccount(account),
      ready: Boolean(resolved.config && account?.status === 'connected' && account.chargesEnabled && account.livemode === (resolved.config.mode === 'live')),
    };
  });

  app.get('/v1/modules/tradeflowkit/payments/connect/authorize', { preHandler: [...adminGuards] }, async (request, reply) => {
    const resolved = getTradeFlowKitStripeConnectConfig();
    if (!resolved.config) return reply.code(503).send({ error: resolved.reason, code: 'TRADEFLOWKIT_PAYMENT_PROVIDER_DISABLED' });
    const query = (request.query ?? {}) as Record<string, unknown>;
    const returnPath = validReturnPath(query.returnPath);
    const state = randomBytes(32).toString('base64url');
    await db.insert(tradeflowkitPaymentOauthStates).values({
      tenantId: tenantId(request),
      userId: userId(request),
      stateHash: hashState(state),
      redirectUri: resolved.config.redirectUri,
      returnPath,
      expiresAt: sql`NOW() + INTERVAL '10 minutes'`,
    });
    const authorize = new URL('https://connect.stripe.com/oauth/authorize');
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('client_id', resolved.config.clientId);
    authorize.searchParams.set('scope', 'read_write');
    authorize.searchParams.set('redirect_uri', resolved.config.redirectUri);
    authorize.searchParams.set('state', state);
    return { authorizeUrl: authorize.toString(), expiresInSeconds: 600 };
  });

  app.get('/v1/modules/tradeflowkit/payments/connect/callback', { preHandler: [...adminGuards] }, async (request, reply) => {
    const resolved = getTradeFlowKitStripeConnectConfig();
    if (!resolved.config) return reply.code(503).send({ error: resolved.reason, code: 'TRADEFLOWKIT_PAYMENT_PROVIDER_DISABLED' });
    const query = (request.query ?? {}) as Record<string, unknown>;
    const state = typeof query.state === 'string' ? query.state : '';
    const code = typeof query.code === 'string' ? query.code : '';
    if (!/^[A-Za-z0-9_-]{32,200}$/.test(state)) return reply.code(400).send({ error: 'OAuth state is invalid', code: 'OAUTH_STATE_INVALID' });
    const claimed = await db.transaction(async tx => {
      const [oauthState] = await tx.update(tradeflowkitPaymentOauthStates).set({ consumedAt: new Date() }).where(and(
        eq(tradeflowkitPaymentOauthStates.stateHash, hashState(state)),
        eq(tradeflowkitPaymentOauthStates.tenantId, tenantId(request)),
        eq(tradeflowkitPaymentOauthStates.userId, userId(request)),
        eq(tradeflowkitPaymentOauthStates.redirectUri, resolved.config!.redirectUri),
        isNull(tradeflowkitPaymentOauthStates.consumedAt),
        sql`${tradeflowkitPaymentOauthStates.expiresAt} > NOW()`,
      )).returning();
      return oauthState ?? null;
    });
    if (!claimed) return reply.code(400).send({ error: 'OAuth state expired or was already used', code: 'OAUTH_STATE_INVALID' });
    if (typeof query.error === 'string') {
      return reply.redirect(`${claimed.returnPath}${claimed.returnPath.includes('?') ? '&' : '?'}paymentProvider=declined`);
    }
    if (!/^ac_[A-Za-z0-9_]+$/.test(code)) return reply.code(400).send({ error: 'OAuth authorization code is invalid', code: 'OAUTH_CODE_INVALID' });
    const stripe = createTradeFlowKitStripeClient(resolved.config.secretKey);
    const token = await stripe.oauth.token({ grant_type: 'authorization_code', code });
    if (!token.stripe_user_id) throw new Error('Stripe OAuth response did not include stripe_user_id');
    const retrieved = await stripe.accounts.retrieve(token.stripe_user_id);
    if ('deleted' in retrieved && retrieved.deleted) throw new Error('Stripe connected account is deleted');
    const account = retrieved as Stripe.Account;
    const stateSnapshot = stripeAccountState(account);
    const [stored] = await db.insert(tradeflowkitPaymentProviderAccounts).values({
      tenantId: tenantId(request),
      provider: 'stripe_connect',
      providerAccountId: account.id,
      livemode: resolved.config.mode === 'live',
      ...stateSnapshot,
      createdByUserId: userId(request),
      updatedByUserId: userId(request),
    }).onConflictDoUpdate({
      target: [tradeflowkitPaymentProviderAccounts.tenantId, tradeflowkitPaymentProviderAccounts.provider],
      set: {
        providerAccountId: account.id,
        livemode: resolved.config.mode === 'live',
        ...stateSnapshot,
        updatedByUserId: userId(request),
        disconnectedAt: null,
        connectedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${tradeflowkitPaymentProviderAccounts.version} + 1`,
      },
    }).returning();
    await appendActivityEvent({
      tenantId: tenantId(request),
      moduleId: await tradeFlowKitModuleId(),
      actorUserId: userId(request),
      objectType: 'tradeflowkit_payment_provider',
      objectId: stored.id,
      eventType: 'stripe_connect_connected',
      summary: 'Stripe business-payment account connected',
      metadata: { providerAccountId: stored.providerAccountId, mode: resolved.config.mode, chargesEnabled: stored.chargesEnabled },
    });
    return reply.redirect(`${claimed.returnPath}${claimed.returnPath.includes('?') ? '&' : '?'}paymentProvider=connected`);
  });

  app.delete('/v1/modules/tradeflowkit/payments/connect', { preHandler: [...adminGuards] }, async (request, reply) => {
    const resolved = getTradeFlowKitStripeConnectConfig();
    if (!resolved.config) return reply.code(503).send({ error: resolved.reason, code: 'TRADEFLOWKIT_PAYMENT_PROVIDER_DISABLED' });
    const [account] = await db.select().from(tradeflowkitPaymentProviderAccounts).where(and(
      eq(tradeflowkitPaymentProviderAccounts.tenantId, tenantId(request)),
      eq(tradeflowkitPaymentProviderAccounts.provider, 'stripe_connect'),
    )).limit(1);
    if (!account || account.status === 'disconnected') return reply.code(204).send();
    const stripe = createTradeFlowKitStripeClient(resolved.config.secretKey);
    await stripe.oauth.deauthorize({ client_id: resolved.config.clientId, stripe_user_id: account.providerAccountId });
    const [updated] = await db.update(tradeflowkitPaymentProviderAccounts).set({
      status: 'disconnected',
      chargesEnabled: false,
      payoutsEnabled: false,
      updatedByUserId: userId(request),
      disconnectedAt: new Date(),
      updatedAt: new Date(),
      version: sql`${tradeflowkitPaymentProviderAccounts.version} + 1`,
    }).where(and(
      eq(tradeflowkitPaymentProviderAccounts.id, account.id),
      eq(tradeflowkitPaymentProviderAccounts.tenantId, tenantId(request)),
    )).returning();
    await appendActivityEvent({
      tenantId: tenantId(request),
      moduleId: await tradeFlowKitModuleId(),
      actorUserId: userId(request),
      objectType: 'tradeflowkit_payment_provider',
      objectId: updated.id,
      eventType: 'stripe_connect_disconnected',
      summary: 'Stripe business-payment account disconnected',
      metadata: { providerAccountId: updated.providerAccountId },
    });
    return reply.code(204).send();
  });

  app.post('/v1/webhooks/tradeflowkit/stripe-connect', async (request, reply) => {
    const resolved = getTradeFlowKitStripeConnectConfig();
    if (!resolved.config) return reply.code(503).send({ error: 'TradeFlowKit payment webhooks are unavailable', code: 'WEBHOOK_NOT_CONFIGURED' });
    const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
    const signatureRaw = request.headers['stripe-signature'];
    const signature = Array.isArray(signatureRaw) ? signatureRaw[0] : signatureRaw;
    if (!rawBody || !signature) return reply.code(400).send({ error: 'Webhook signature is required', code: 'WEBHOOK_SIGNATURE_REQUIRED' });
    let event: Stripe.Event;
    try {
      event = createTradeFlowKitStripeClient(resolved.config.secretKey)
        .webhooks.constructEvent(rawBody, signature, resolved.config.webhookSecret);
    } catch {
      return reply.code(400).send({ error: 'Webhook signature was not accepted', code: 'WEBHOOK_SIGNATURE_INVALID' });
    }
    const providerAccountId = typeof event.account === 'string' ? event.account : '';
    if (!providerAccountId || event.livemode !== (resolved.config.mode === 'live')) {
      return reply.code(400).send({ error: 'Webhook account or mode was not accepted', code: 'WEBHOOK_SCOPE_INVALID' });
    }
    const [account] = await db.select().from(tradeflowkitPaymentProviderAccounts).where(and(
      eq(tradeflowkitPaymentProviderAccounts.provider, 'stripe_connect'),
      eq(tradeflowkitPaymentProviderAccounts.providerAccountId, providerAccountId),
      eq(tradeflowkitPaymentProviderAccounts.livemode, event.livemode),
    )).limit(1);
    if (!account) return reply.code(404).send({ error: 'Webhook account was not found', code: 'WEBHOOK_ACCOUNT_NOT_FOUND' });
    if (!CHECKOUT_EVENT_TYPES.has(event.type)) {
      return reply.code(200).send({ received: true, ignored: true });
    }
    const checkout = event.data.object as Stripe.Checkout.Session;
    const paymentId = checkout.metadata?.tradeflowkit_payment_id ?? '';
    const received = await receiveVerifiedWebhook({
      tenantId: account.tenantId,
      moduleId: await tradeFlowKitModuleId(),
      provider: 'stripe_connect',
      providerEventId: event.id,
      eventType: event.type,
      handlerKey: WEBHOOK_HANDLER_KEY,
      rawBody,
      safePayload: {
        providerAccountId,
        checkoutId: checkout.id,
        paymentId,
        paymentStatus: checkout.payment_status,
        amountTotal: checkout.amount_total,
        currency: checkout.currency,
      },
      correlationId: request.id,
      maxAttempts: 8,
    });
    return reply.code(received.duplicate ? 200 : 202).send({ received: true, duplicate: received.duplicate, status: received.status });
  });
}
