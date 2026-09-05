import test from 'node:test';
import assert from 'node:assert/strict';

const ISOLATED_ENV = {
  APP_ENV: 'production',
  NODE_ENV: 'production',
  CI: 'true',
  OPERATOROS_DETERMINISTIC_PROVIDER_MODE: '1',
  PARITY_DATABASE_IS_DISPOSABLE: '1',
  DATABASE_URL: 'postgresql://operator:synthetic@127.0.0.1:5432/operatoros_disposable_provider_test',
  OPENAI_API_KEY: 'sk-live-deterministic-provider-test-only',
  OPENAI_PROJECT_ID: 'proj_deterministic_provider_test',
  OPENAI_WEBHOOK_SECRET: 'whsec_deterministic_provider_test_only',
  OPENAI_MODEL: 'gpt-4o-mini',
  RESEND_API_KEY: 're_deterministic_provider_test_only',
  EMAIL_FROM: 'OperatorOS Test <test@example.test>',
  STRIPE_MODE: 'live',
  STRIPE_SECRET_KEY: 'sk_live_deterministic_provider_test_only',
  STRIPE_WEBHOOK_SECRET: 'whsec_deterministic_provider_test_only',
  STRIPE_CLIENT_ID: 'ca_deterministic_provider_test',
  TRADEFLOWKIT_PAYMENT_PROVIDER: 'stripe_connect',
  TRADEFLOWKIT_STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_deterministic_provider_test_only',
  TRADEFLOWKIT_STRIPE_CONNECT_REDIRECT_URI: 'https://tradeflowkit.operatoros.net/v1/modules/tradeflowkit/payments/connect/callback',
  TRADEFLOWKIT_PUBLIC_BASE_URL: 'https://tradeflowkit.operatoros.net',
  TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
  TWILIO_AUTH_TOKEN: 'deterministic-provider-test-auth-token',
  TWILIO_API_KEY_SID: `SK${'b'.repeat(32)}`,
  TWILIO_API_KEY_SECRET: 'deterministic-provider-test-api-secret',
  TWILIO_FROM_NUMBER: '+15555550101',
  TWILIO_PHONE_NUMBER: '+15555550101',
  TWILIO_VERIFY_SERVICE_SID: `VA${'c'.repeat(32)}`,
  TWILIO_ALLOWED_COUNTRIES: 'US,CA',
  TWILIO_PUBLIC_BASE_URL: 'https://callcommand-ai.operatoros.net',
  OUTCALL_PUBLIC_URL: 'https://outcall.operatoros.net',
  OUTCALL_LIVE_PROVIDER: 'enabled',
  REPLIT_CONNECTORS_HOSTNAME: 'connectors.example.test',
  REPL_IDENTITY: 'synthetic-connector-identity',
  CALLCOMMAND_SIP_ROUTE_SECRET: 'deterministic-callcommand-route-secret-at-least-32-bytes',
  CALLCOMMAND_REALTIME_MODEL: 'gpt-realtime-2.1-mini',
} as const;

test('production-artifact acceptance cannot select or call inherited live providers', async () => {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(ISOLATED_ENV)) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('external fetch must not execute during deterministic acceptance');
  }) as typeof fetch;

  try {
    const { getAiProvider, getProviderInfo } = await import('../src/lib/ai-provider.js');
    const { getEmailFromHealth, sendInviteEmail } = await import('../src/lib/email-service.js');
    const {
      getOutboundProviderAdapter,
      getPaymentProviderAdapter,
      getSharedAiProviderAdapter,
    } = await import('../src/lib/shared-provider-adapters.js');
    const { clearTelephonyCache, getTelephonyInfo, resolveTelephonyConfig } = await import('../src/lib/telephony.js');
    const { outCallProviderState } = await import('../src/lib/outcall-provider.js');
    const {
      getTradeFlowKitPaymentProvider,
      getTradeFlowKitStripeConnectConfig,
    } = await import('../src/lib/tradeflowkit-payment-provider.js');
    const { isStripeEnabled } = await import('../src/lib/billing-service.js');
    const { inspectCallCommandRealtimeReadiness } = await import('../src/lib/callcommand-realtime.js');
    const { transcribeCallAudio } = await import('../src/lib/callcommand-phase35.js');
    const { fetchAutomationPacksSnapshot } = await import('../src/lib/ninjamation-phase36.js');
    const { createCallCommandCommercialNumberProvider } = await import('../src/routes/callcommand-commercial-routes.js');
    const { runAgentLoop } = await import('../src/agent.js');

    assert.equal(getAiProvider().name, 'test');
    assert.deepEqual(getProviderInfo(), { name: 'test', configured: false });
    assert.deepEqual(getSharedAiProviderAdapter().status, { kind: 'ai', name: 'test', state: 'test' });
    assert.deepEqual(getEmailFromHealth(), { configured: false, provider: 'test' });
    assert.deepEqual(await sendInviteEmail({
      to: 'recipient@example.test', tenantName: 'Disposable Tenant', inviterName: 'Test Operator',
      inviterEmail: 'operator@example.test', role: 'member',
      acceptUrl: 'https://app.operatoros.net/invites/synthetic',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    }), { ok: true, provider: 'test', id: 'operatoros-test-invite' });

    const email = await getOutboundProviderAdapter('email');
    const sms = await getOutboundProviderAdapter('sms');
    assert.equal(email.status.state, 'test');
    assert.equal(sms.status.state, 'test');
    assert.equal((await email.send({ destination: 'recipient@example.test', body: 'Synthetic', idempotencyKey: 'email-1' })).externalDelivery, false);
    assert.equal((await sms.send({ destination: '+15555550102', body: 'Synthetic', idempotencyKey: 'sms-1' })).externalDelivery, false);
    assert.equal(getPaymentProviderAdapter().status.state, 'test');

    clearTelephonyCache();
    assert.equal(await resolveTelephonyConfig(), null);
    assert.equal((await getTelephonyInfo()).connectorAvailable, false);
    assert.deepEqual(outCallProviderState(), {
      name: 'disabled', configured: false, ready: false,
      reason: 'Live phone verification and calling are not configured.',
    });

    const tradeFlowProvider = getTradeFlowKitPaymentProvider(process.env);
    assert.equal(tradeFlowProvider.status.kind, 'test');
    assert.equal(getTradeFlowKitStripeConnectConfig(process.env).config, null);
    const paymentSession = await tradeFlowProvider.createSession({
      tenantId: 'tenant-test', invoiceId: 'invoice-test', invoiceNumber: 1,
      paymentId: 'payment-test', amountCents: 100, currency: 'USD', idempotencyKey: 'payment-1',
      providerAccountId: 'acct_synthetic', successUrl: 'https://tradeflowkit.operatoros.net/success',
      cancelUrl: 'https://tradeflowkit.operatoros.net/cancel',
    });
    assert.equal(paymentSession.provider, 'test');
    assert.equal(isStripeEnabled(), false);
    assert.equal(inspectCallCommandRealtimeReadiness(process.env).ready, false);
    await assert.rejects(
      () => transcribeCallAudio(Buffer.from([1, 2, 3])),
      (error: any) => error?.code === 'CALLCOMMAND_TRANSCRIPTION_UNAVAILABLE',
    );
    await assert.rejects(
      () => fetchAutomationPacksSnapshot(),
      (error: any) => error?.code === 'NINJAMATION_CATALOG_NETWORK_DISABLED',
    );

    let commercialProviderFactoryCalls = 0;
    assert.throws(
      () => createCallCommandCommercialNumberProvider(process.env, () => {
        commercialProviderFactoryCalls += 1;
        throw new Error('commercial provider factory must not execute during deterministic acceptance');
      }),
      (error: any) => error?.code === 'CALLCOMMAND_PROVIDER_ACTION_DISABLED_DURING_ACCEPTANCE',
    );
    assert.equal(commercialProviderFactoryCalls, 0);

    const events: Array<Record<string, unknown>> = [];
    const agentResult = await runAgentLoop(
      'Synthetic goal', 'synthetic-profile', {},
      async (event) => { events.push(event); },
      async () => ({ success: true, output: 'not reached' }),
    );
    assert.equal(agentResult.success, false);
    assert.equal(events[0]?.type, 'ERROR');
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
