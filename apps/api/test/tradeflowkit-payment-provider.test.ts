import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTradeFlowKitPaymentProvider,
  getTradeFlowKitStripeConnectConfig,
} from '../src/lib/tradeflowkit-payment-provider.js';

const completeEnv = {
  NODE_ENV: 'production',
  TRADEFLOWKIT_PAYMENT_PROVIDER: 'stripe_connect',
  STRIPE_MODE: 'test',
  STRIPE_SECRET_KEY: 'sk_test_not-a-real-secret',
  STRIPE_CLIENT_ID: 'ca_test_client',
  TRADEFLOWKIT_STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_not-a-real-secret',
  TRADEFLOWKIT_STRIPE_CONNECT_REDIRECT_URI: 'https://tradeflowkit.example.test/v1/modules/tradeflowkit/payments/connect/callback',
  TRADEFLOWKIT_PUBLIC_BASE_URL: 'https://tradeflowkit.example.test',
};

test('Stripe Connect configuration fails closed on mode or callback mismatch', () => {
  assert.equal(getTradeFlowKitStripeConnectConfig({ ...completeEnv, STRIPE_SECRET_KEY: 'sk_live_wrong-mode' }).config, null);
  assert.equal(getTradeFlowKitStripeConnectConfig({ ...completeEnv, TRADEFLOWKIT_STRIPE_CONNECT_REDIRECT_URI: 'http://tradeflowkit.example.test/v1/modules/tradeflowkit/payments/connect/callback' }).config, null);
  assert.equal(getTradeFlowKitStripeConnectConfig({ ...completeEnv, TRADEFLOWKIT_STRIPE_CONNECT_REDIRECT_URI: 'https://tradeflowkit.example.test/wrong' }).config, null);
  assert.equal(getTradeFlowKitStripeConnectConfig({ ...completeEnv, TRADEFLOWKIT_PUBLIC_BASE_URL: 'https://tradeflowkit.example.test/unsafe-path' }).config, null);
  assert.equal(getTradeFlowKitStripeConnectConfig(completeEnv).config?.mode, 'test');
});

test('Stripe Connect checkout is a direct charge bound to the connected account and server metadata', async () => {
  let captured: any;
  const stripe = {
    checkout: {
      sessions: {
        create: async (params: any, options: any) => {
          captured = { params, options };
          return { id: 'cs_test_tradeflowkit', url: 'https://checkout.stripe.test/session' };
        },
      },
    },
  } as any;
  const provider = getTradeFlowKitPaymentProvider(completeEnv, stripe);
  assert.equal(provider.status.kind, 'stripe_connect');
  const session = await provider.createSession({
    tenantId: 'tenant-1', invoiceId: 'invoice-1', invoiceNumber: 27,
    paymentId: 'payment-1', amountCents: 12_345, currency: 'USD',
    idempotencyKey: 'customer-payment-v1', providerAccountId: 'acct_connected_1',
    successUrl: 'https://tradeflowkit.example.test/public/tradeflowkit/payment/success',
    cancelUrl: 'https://tradeflowkit.example.test/public/tradeflowkit/payment/canceled',
  });
  assert.equal(session.provider, 'stripe_connect');
  assert.equal(session.providerAccountId, 'acct_connected_1');
  assert.equal(captured.options.stripeAccount, 'acct_connected_1');
  assert.equal(captured.params.line_items[0].price_data.unit_amount, 12_345);
  assert.equal(captured.params.line_items[0].price_data.currency, 'usd');
  assert.deepEqual(captured.params.metadata, {
    operatoros_module: 'tradeflowkit',
    tradeflowkit_payment_id: 'payment-1',
    tradeflowkit_invoice_id: 'invoice-1',
  });
  assert.equal(JSON.stringify(captured).includes('customer@'), false);
});
