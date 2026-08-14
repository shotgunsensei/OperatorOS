import Stripe from 'stripe';

export type TradeFlowKitStripeMode = 'test' | 'live';

export type TradeFlowKitStripeConnectConfig = {
  mode: TradeFlowKitStripeMode;
  secretKey: string;
  clientId: string;
  webhookSecret: string;
  redirectUri: string;
  publicBaseUrl: string;
};

export type TradeFlowKitPaymentProviderStatus =
  | { kind: 'test'; configured: true; reason: null; mode: 'test' }
  | { kind: 'stripe_connect'; configured: true; reason: null; mode: TradeFlowKitStripeMode }
  | { kind: 'disabled'; configured: false; reason: string; mode: TradeFlowKitStripeMode | null };

export interface TradeFlowKitPaymentSession {
  provider: 'test' | 'stripe_connect';
  providerReference: string;
  providerAccountId: string | null;
  checkoutUrl: string;
}

export interface TradeFlowKitPaymentProvider {
  readonly status: TradeFlowKitPaymentProviderStatus;
  createSession(input: {
    tenantId: string;
    invoiceId: string;
    invoiceNumber: number | null;
    paymentId: string;
    amountCents: number;
    currency: string;
    idempotencyKey: string;
    providerAccountId: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<TradeFlowKitPaymentSession>;
}

function exactHttpsUrl(value: string | undefined, expectedPath?: string): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (expectedPath && parsed.pathname !== expectedPath) return null;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function getTradeFlowKitStripeConnectConfig(
  env: Record<string, string | undefined> = process.env,
): { config: TradeFlowKitStripeConnectConfig | null; reason: string; mode: TradeFlowKitStripeMode | null } {
  const mode = env.STRIPE_MODE === 'live' ? 'live' : env.STRIPE_MODE === 'test' ? 'test' : null;
  if (env.TRADEFLOWKIT_PAYMENT_PROVIDER !== 'stripe_connect') {
    return { config: null, reason: 'TRADEFLOWKIT_PAYMENT_PROVIDER is not stripe_connect.', mode };
  }
  if (!mode) return { config: null, reason: 'STRIPE_MODE must be exactly test or live.', mode: null };
  const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? '';
  if (!secretKey.startsWith(mode === 'live' ? 'sk_live_' : 'sk_test_')) {
    return { config: null, reason: `STRIPE_SECRET_KEY does not match STRIPE_MODE=${mode}.`, mode };
  }
  const clientId = env.STRIPE_CLIENT_ID?.trim() ?? '';
  if (!/^ca_[A-Za-z0-9_]+$/.test(clientId)) {
    return { config: null, reason: 'STRIPE_CLIENT_ID is missing or invalid.', mode };
  }
  const webhookSecret = env.TRADEFLOWKIT_STRIPE_CONNECT_WEBHOOK_SECRET?.trim() ?? '';
  if (!webhookSecret.startsWith('whsec_')) {
    return { config: null, reason: 'TRADEFLOWKIT_STRIPE_CONNECT_WEBHOOK_SECRET is missing or invalid.', mode };
  }
  const redirectUri = exactHttpsUrl(
    env.TRADEFLOWKIT_STRIPE_CONNECT_REDIRECT_URI,
    '/v1/modules/tradeflowkit/payments/connect/callback',
  );
  if (!redirectUri) {
    return { config: null, reason: 'TRADEFLOWKIT_STRIPE_CONNECT_REDIRECT_URI must be the exact HTTPS callback URL.', mode };
  }
  const publicBaseUrl = exactHttpsUrl(env.TRADEFLOWKIT_PUBLIC_BASE_URL);
  if (!publicBaseUrl) {
    return { config: null, reason: 'TRADEFLOWKIT_PUBLIC_BASE_URL must be an exact HTTPS origin.', mode };
  }
  const parsedBase = new URL(publicBaseUrl);
  if (parsedBase.pathname !== '/') {
    return { config: null, reason: 'TRADEFLOWKIT_PUBLIC_BASE_URL must not contain a path.', mode };
  }
  return {
    config: { mode, secretKey, clientId, webhookSecret, redirectUri, publicBaseUrl },
    reason: '',
    mode,
  };
}

export function createTradeFlowKitStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });
}

class TestTradeFlowKitPaymentProvider implements TradeFlowKitPaymentProvider {
  readonly status = { kind: 'test', configured: true, reason: null, mode: 'test' } as const;

  async createSession(input: Parameters<TradeFlowKitPaymentProvider['createSession']>[0]): Promise<TradeFlowKitPaymentSession> {
    const reference = Buffer.from(`${input.tenantId}:${input.invoiceId}:${input.idempotencyKey}`)
      .toString('base64url').slice(0, 80);
    return {
      provider: 'test',
      providerReference: `tfk_test_${reference}`,
      providerAccountId: input.providerAccountId,
      checkoutUrl: `https://payments.test/operatoros/${encodeURIComponent(input.invoiceId)}?ref=${encodeURIComponent(reference)}`,
    };
  }
}

class StripeConnectTradeFlowKitPaymentProvider implements TradeFlowKitPaymentProvider {
  readonly status;

  constructor(
    private readonly config: TradeFlowKitStripeConnectConfig,
    private readonly stripe: Stripe,
  ) {
    this.status = { kind: 'stripe_connect', configured: true, reason: null, mode: config.mode } as const;
  }

  async createSession(input: Parameters<TradeFlowKitPaymentProvider['createSession']>[0]): Promise<TradeFlowKitPaymentSession> {
    if (!input.providerAccountId) {
      throw Object.assign(new Error('A connected Stripe account is required.'), { code: 'TRADEFLOWKIT_PAYMENT_ACCOUNT_REQUIRED' });
    }
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.invoiceId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: input.amountCents,
          product_data: { name: `Invoice ${input.invoiceNumber ?? input.invoiceId.slice(0, 8)}` },
        },
      }],
      metadata: {
        operatoros_module: 'tradeflowkit',
        tradeflowkit_payment_id: input.paymentId,
        tradeflowkit_invoice_id: input.invoiceId,
      },
    }, {
      stripeAccount: input.providerAccountId,
      idempotencyKey: `tfk:${input.tenantId}:${input.paymentId}`,
    });
    if (!session.url) throw Object.assign(new Error('Stripe Checkout did not return a URL.'), { code: 'STRIPE_CHECKOUT_URL_MISSING' });
    return {
      provider: 'stripe_connect',
      providerReference: session.id,
      providerAccountId: input.providerAccountId,
      checkoutUrl: session.url,
    };
  }
}

class DisabledTradeFlowKitPaymentProvider implements TradeFlowKitPaymentProvider {
  readonly status;

  constructor(reason: string, mode: TradeFlowKitStripeMode | null = null) {
    this.status = { kind: 'disabled', configured: false, reason, mode } as const;
  }

  async createSession(): Promise<TradeFlowKitPaymentSession> {
    throw Object.assign(new Error(this.status.reason), { code: 'TRADEFLOWKIT_PAYMENT_PROVIDER_DISABLED' });
  }
}

export function getTradeFlowKitPaymentProvider(
  env: Record<string, string | undefined> = process.env,
  stripeClient?: Stripe,
): TradeFlowKitPaymentProvider {
  if (env.NODE_ENV === 'test' && env.TRADEFLOWKIT_PAYMENT_PROVIDER === 'test') {
    return new TestTradeFlowKitPaymentProvider();
  }
  const resolved = getTradeFlowKitStripeConnectConfig(env);
  if (!resolved.config) return new DisabledTradeFlowKitPaymentProvider(resolved.reason, resolved.mode);
  return new StripeConnectTradeFlowKitPaymentProvider(
    resolved.config,
    stripeClient ?? createTradeFlowKitStripeClient(resolved.config.secretKey),
  );
}
