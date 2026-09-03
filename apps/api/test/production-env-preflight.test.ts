import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const preflight = await import(pathToFileURL(resolve(__dirname, '../../../scripts/production-env-preflight.mjs')).href);

const coreEnv = {
  ...preflight.CANONICAL_MODULE_URLS,
  DATABASE_URL: 'postgresql://example.invalid/operatoros',
  SESSION_SECRET: 'test-only-session-secret-32-plus',
  SSO_CODE_ENCRYPTION_SECRET: 'test-only-code-encryption-secret-32-plus',
  SHARED_SECRET_ENCRYPTION_KEY: 'abababababababababababababababababababababababababababababababab',
  APP_ENV: 'production',
  NODE_ENV: 'production',
  OPERATOROS_BASE_URL: 'https://operatoros.net',
  OPERATOROS_APPS_URL: 'https://app.operatoros.net/',
  INTERNAL_API_URL: 'http://localhost:5001',
  RUNNER_MODE: 'disabled',
  TRUST_PROXY: 'true',
};

test('production environment contract is machine-readable and owns core deployment inputs', () => {
  assert.equal(preflight.PRODUCTION_ENVIRONMENT_CONTRACT.contractVersion, 2);
  assert.equal(preflight.PRODUCTION_ENVIRONMENT_CONTRACT.deploymentTarget, 'replit-autoscale');
  assert.equal(preflight.PRODUCTION_ENVIRONMENT_CONTRACT.core.exact.INTERNAL_API_URL, 'http://localhost:5001');
  assert.equal(preflight.PRODUCTION_ENVIRONMENT_CONTRACT.core.exact.OPERATOROS_DATABASE_RELEASE_MODE, undefined);
  assert.equal(preflight.PRODUCTION_ENVIRONMENT_CONTRACT.core.exact.RUNNER_MODE, 'disabled');
  assert.equal(
    preflight.PRODUCTION_ENVIRONMENT_CONTRACT.callcommand.exact.TWILIO_PUBLIC_BASE_URL,
    'https://callcommand-ai.operatoros.net',
  );
  assert.deepEqual(
    preflight.PRODUCTION_ENVIRONMENT_CONTRACT.callcommand.allowedValues.CALLCOMMAND_REALTIME_MODEL,
    ['gpt-realtime-2.1-mini', 'gpt-realtime-2.1'],
  );
  assert.deepEqual(
    preflight.PRODUCTION_ENVIRONMENT_CONTRACT.core.unset,
    ['APP_URL', 'COOKIE_DOMAIN', 'NEXT_PUBLIC_API_URL', 'OPERATOROS_DATABASE_RELEASE_MODE'],
  );
});

test('core preflight requires every exact OperatorOS module subdomain', () => {
  const { TECHDECK_URL: _omitted, ...missingTechDeck } = coreEnv;
  const missing = preflight.evaluateProductionEnvironment(missingTechDeck);
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.issues.map((issue: { name: string }) => issue.name), ['TECHDECK_URL']);

  const legacyDomain = preflight.evaluateProductionEnvironment({
    ...coreEnv,
    PULSEDESK_URL: 'https://pulsedesk.support',
  });
  assert.equal(legacyDomain.ok, false);
  assert.deepEqual(legacyDomain.issues.map((issue: { name: string }) => issue.name), ['PULSEDESK_URL']);
});

test('production preflight defaults to core and rejects unsafe authority configuration', () => {
  assert.deepEqual(preflight.resolveProfiles([]), ['core']);
  assert.deepEqual(preflight.resolveProfiles(['--', '--all']), ['core', 'revenue', 'email', 'callcommand', 'outcall', 'ai']);
  assert.equal(preflight.evaluateProductionEnvironment(coreEnv).ok, true);

  const unsafe = preflight.evaluateProductionEnvironment({
    ...coreEnv,
    SESSION_SECRET: 'short',
    APP_URL: 'https://legacy.example',
    COOKIE_DOMAIN: '.operatoros.net',
    NEXT_PUBLIC_API_URL: 'http://localhost:5001',
    INTERNAL_API_URL: 'http://127.0.0.1:5001',
    OPERATOROS_DATABASE_RELEASE_MODE: 'apply',
    OPERATOROS_DATABASE_RELEASE_VERIFIED: '1',
    RUNNER_MODE: 'local',
    ALLOW_LEGACY_SSO_ROLLBACK: 'true',
    ALLOW_UNSAFE_COMMANDS: 'true',
  });
  assert.equal(unsafe.ok, false);
  assert.deepEqual(
    unsafe.issues.map((issue: { name: string }) => issue.name),
    [
      'SESSION_SECRET',
      'INTERNAL_API_URL',
      'RUNNER_MODE',
      'APP_URL',
      'COOKIE_DOMAIN',
      'NEXT_PUBLIC_API_URL',
      'OPERATOROS_DATABASE_RELEASE_MODE',
      'OPERATOROS_DATABASE_RELEASE_VERIFIED',
      'ALLOW_LEGACY_SSO_ROLLBACK',
      'ALLOW_UNSAFE_COMMANDS',
    ],
  );
});

test('P22-PREFLIGHT-001: core readiness requires an exact 32-byte shared secret encryption key', () => {
  const missing = { ...coreEnv } as Record<string, string>;
  delete missing.SHARED_SECRET_ENCRYPTION_KEY;
  const missingReport = preflight.evaluateProductionEnvironment(missing);
  assert.equal(missingReport.ok, false);
  assert.deepEqual(missingReport.issues.map((issue: { name: string }) => issue.name), ['SHARED_SECRET_ENCRYPTION_KEY']);

  const malformed = preflight.evaluateProductionEnvironment({ ...coreEnv, SHARED_SECRET_ENCRYPTION_KEY: 'x'.repeat(64) });
  assert.equal(malformed.ok, false);
  assert.ok(malformed.issues.some((issue: { name: string }) => issue.name === 'SHARED_SECRET_ENCRYPTION_KEY'));
});

test('enabled self-service trials require a stable identity HMAC and transactional email', () => {
  const missing = preflight.evaluateProductionEnvironment({
    ...coreEnv,
    OPERATOROS_SELF_SERVICE_TRIALS_ENABLED: '1',
  });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.issues.map((issue: { name: string }) => issue.name), [
    'OPERATOROS_TRIAL_IDENTITY_HMAC_SECRET',
    'RESEND_API_KEY',
    'EMAIL_FROM',
  ]);

  const configured = preflight.evaluateProductionEnvironment({
    ...coreEnv,
    OPERATOROS_SELF_SERVICE_TRIALS_ENABLED: '1',
    OPERATOROS_TRIAL_IDENTITY_HMAC_SECRET: 'trial-identity-test-secret-32-characters-plus',
    RESEND_API_KEY: 're_test_placeholder',
    EMAIL_FROM: 'OperatorOS <hello@operatoros.net>',
  });
  assert.equal(configured.ok, true);
});

test('production preflight rejects wildcard, insecure, credentialed, and localhost CORS origins', () => {
  for (const value of [
    '*',
    'http://example.com',
    'https://user:pass@example.com',
    'https://localhost:3000',
    'not-a-url',
  ]) {
    const report = preflight.evaluateProductionEnvironment({ ...coreEnv, CORS_ALLOWED_ORIGINS: value });
    assert.equal(report.ok, false, value);
    assert.deepEqual(report.issues.map((issue: { name: string }) => issue.name), ['CORS_ALLOWED_ORIGINS']);
  }
  assert.equal(preflight.evaluateProductionEnvironment({
    ...coreEnv,
    CORS_ALLOWED_ORIGINS: 'https://ops.example.com,https://status.example.com',
  }).ok, true);
});

test('all readiness profiles pass with live shared-runtime providers', () => {
  const env = {
    ...coreEnv,
    STRIPE_MODE: 'live',
    STRIPE_SECRET_KEY: 'sk_live_test_placeholder',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_placeholder',
    STRIPE_WEBHOOK_ENDPOINT_URL: 'https://api.operatoros.net/v1/billing/webhook',
    STRIPE_WEBHOOK_EVENTS: 'checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,payment_intent.payment_failed,charge.refunded,charge.dispute.created,charge.dispute.closed',
    STRIPE_EXPECTED_ACCOUNT_ID: 'acct_testplaceholder',
    TORQUESHED_CREDIT_PURCHASES_ENABLED: '1',
    TORQUESHED_CREDIT_PURCHASES_MODE: 'live',
    TORQUESHED_CREDIT_PURCHASES_EXPECTED_RELEASE_COMMIT: 'a'.repeat(40),
    STRIPE_PRICE_TRADEFLOWKIT_MONTHLY: 'price_tradeflowkit',
    STRIPE_PRICE_PULSEDESK_MONTHLY: 'price_pulsedesk',
    STRIPE_PRICE_TECHDECK_MONTHLY: 'price_techdeck',
    STRIPE_PRICE_COMPANION_MODULE_MONTHLY: 'price_companion',
    STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY: 'price_seat',
    RESEND_API_KEY: 're_test_placeholder',
    EMAIL_FROM: 'OperatorOS <hello@operatoros.net>',
    TWILIO_ACCOUNT_SID: 'ACtestplaceholder',
    TWILIO_AUTH_TOKEN: 'test-placeholder',
    TWILIO_FROM_NUMBER: '+15555550100',
    TWILIO_PUBLIC_BASE_URL: 'https://callcommand-ai.operatoros.net',
    OUTCALL_PUBLIC_URL: 'https://outcall.operatoros.net',
    OUTCALL_FIELD_ENCRYPTION_KEY: 'outcall-field-encryption-test-key-32-plus',
    OUTCALL_LOOKUP_HMAC_KEY: 'outcall-lookup-hmac-test-key-32-plus',
    TWILIO_VERIFY_SERVICE_SID: 'VAtestplaceholder',
    TWILIO_PHONE_NUMBER: '+15555550101',
    TWILIO_ALLOWED_COUNTRIES: 'US,CA',
    OUTCALL_LIVE_PROVIDER: 'enabled',
    OPENAI_API_KEY: 'sk-test-placeholder',
    OPENAI_PROJECT_ID: 'proj_testplaceholder',
    OPENAI_WEBHOOK_SECRET: 'whsec_testplaceholder',
    CALLCOMMAND_SIP_ROUTE_SECRET: 'callcommand-sip-route-secret-32-plus',
    CALLCOMMAND_REALTIME_MODEL: 'gpt-realtime-2.1-mini',
    STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY: 'price_callcommand_lane',
    STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY: 'price_callcommand_local_number',
    STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY: 'price_callcommand_toll_free_number',
  };
  const profiles = preflight.resolveProfiles(['--all']);
  const report = preflight.evaluateProductionEnvironment(env, profiles);
  assert.equal(report.ok, true);
  assert.equal(report.profiles.length, 6);
  assert.match(preflight.formatReport(report), /PASS callcommand/);
  assert.match(preflight.formatReport(report), /PASS outcall/);
});

test('preflight output contains names and messages but never secret values', () => {
  const secret = 'do-not-print-this-secret-value';
  const report = preflight.evaluateProductionEnvironment({
    ...coreEnv,
    STRIPE_MODE: 'test',
    STRIPE_SECRET_KEY: secret,
  }, ['core', 'revenue']);
  const output = preflight.formatReport(report);
  assert.equal(report.ok, false);
  assert.match(output, /STRIPE_SECRET_KEY/);
  assert.match(output, /STRIPE_WEBHOOK_SECRET/);
  assert.doesNotMatch(output, new RegExp(secret));
});

test('revenue preflight requires the TorqueShed kill switch, mode, and release pin', () => {
  const report = preflight.evaluateProductionEnvironment({
    ...coreEnv,
    STRIPE_MODE: 'live',
    STRIPE_SECRET_KEY: 'sk_live_test_placeholder',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_placeholder',
    STRIPE_WEBHOOK_ENDPOINT_URL: 'https://api.operatoros.net/v1/billing/webhook',
    STRIPE_WEBHOOK_EVENTS: 'checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,payment_intent.payment_failed,charge.refunded,charge.dispute.created,charge.dispute.closed',
    STRIPE_EXPECTED_ACCOUNT_ID: 'acct_testplaceholder',
    STRIPE_PRICE_TRADEFLOWKIT_MONTHLY: 'price_tradeflowkit',
    STRIPE_PRICE_PULSEDESK_MONTHLY: 'price_pulsedesk',
    STRIPE_PRICE_TECHDECK_MONTHLY: 'price_techdeck',
    STRIPE_PRICE_COMPANION_MODULE_MONTHLY: 'price_companion',
    STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY: 'price_seat',
    TORQUESHED_CREDIT_PURCHASES_ENABLED: '0',
    TORQUESHED_CREDIT_PURCHASES_MODE: 'test',
    TORQUESHED_CREDIT_PURCHASES_EXPECTED_RELEASE_COMMIT: 'short',
  }, ['core', 'revenue']);
  assert.equal(report.ok, false);
  assert.deepEqual(
    report.issues
      .filter((issue: { name: string }) => issue.name.startsWith('TORQUESHED_'))
      .map((issue: { name: string }) => issue.name),
    [
      'TORQUESHED_CREDIT_PURCHASES_ENABLED',
      'TORQUESHED_CREDIT_PURCHASES_MODE',
      'TORQUESHED_CREDIT_PURCHASES_EXPECTED_RELEASE_COMMIT',
    ],
  );
});

test('CallCommand accepts a bound Replit connector without copied Twilio secrets only when shared providers are ready', () => {
  const connectorEnv = {
    ...coreEnv,
    TWILIO_PUBLIC_BASE_URL: 'https://callcommand-ai.operatoros.net',
    REPLIT_CONNECTORS_HOSTNAME: 'connectors.example.invalid',
    REPL_IDENTITY: 'test-identity',
  };
  const missingProviders = preflight.evaluateProductionEnvironment(connectorEnv, ['core', 'callcommand']);
  assert.equal(missingProviders.ok, false);
  assert.ok(missingProviders.issues.some((issue: { name: string }) => issue.name === 'OPENAI_API_KEY'));
  assert.ok(missingProviders.issues.some((issue: { name: string }) => issue.name === 'TWILIO_VERIFY_SERVICE_SID'));
  assert.ok(missingProviders.issues.some(
    (issue: { name: string }) => issue.name === 'STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY',
  ));
  assert.equal(missingProviders.issues.some((issue: { name: string }) => issue.name === 'TWILIO_CREDENTIALS'), false);

  const report = preflight.evaluateProductionEnvironment({
    ...connectorEnv,
    OPENAI_API_KEY: 'sk-test-placeholder',
    OPENAI_PROJECT_ID: 'proj_testplaceholder',
    OPENAI_WEBHOOK_SECRET: 'whsec_testplaceholder',
    CALLCOMMAND_SIP_ROUTE_SECRET: 'callcommand-sip-route-secret-32-plus',
    CALLCOMMAND_REALTIME_MODEL: 'gpt-realtime-2.1-mini',
    TWILIO_VERIFY_SERVICE_SID: 'VAtestplaceholder',
    STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY: 'price_callcommand_lane',
    STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY: 'price_callcommand_local_number',
    STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY: 'price_callcommand_toll_free_number',
  }, ['core', 'callcommand']);
  assert.equal(report.ok, true);
});

test('CallCommand readiness requires the Realtime, verification, and lane billing runtime contract', () => {
  const report = preflight.evaluateProductionEnvironment({
    ...coreEnv,
    TWILIO_PUBLIC_BASE_URL: 'https://callcommand-ai.operatoros.net',
    TWILIO_ACCOUNT_SID: 'ACtestplaceholder',
    TWILIO_AUTH_TOKEN: 'test-placeholder',
    TWILIO_FROM_NUMBER: '+15555550100',
  }, ['core', 'callcommand']);

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.issues
      .filter((issue: { profile: string }) => issue.profile === 'callcommand')
      .map((issue: { name: string }) => issue.name),
    [
      'OPENAI_API_KEY',
      'OPENAI_PROJECT_ID',
      'OPENAI_WEBHOOK_SECRET',
      'CALLCOMMAND_SIP_ROUTE_SECRET',
      'CALLCOMMAND_REALTIME_MODEL',
      'TWILIO_VERIFY_SERVICE_SID',
      'STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY',
      'STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY',
      'STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY',
    ],
  );
});

test('CallCommand readiness rejects malformed provider identifiers, weak routing secrets, and unsupported models', () => {
  const report = preflight.evaluateProductionEnvironment({
    ...coreEnv,
    TWILIO_PUBLIC_BASE_URL: 'https://callcommand-ai.operatoros.net',
    TWILIO_ACCOUNT_SID: 'ACtestplaceholder',
    TWILIO_AUTH_TOKEN: 'test-placeholder',
    TWILIO_FROM_NUMBER: '+15555550100',
    OPENAI_API_KEY: 'sk-test-placeholder',
    OPENAI_PROJECT_ID: 'project-not-openai-shaped',
    OPENAI_WEBHOOK_SECRET: 'openai-webhook-secret',
    CALLCOMMAND_SIP_ROUTE_SECRET: 'too-short',
    CALLCOMMAND_REALTIME_MODEL: 'gpt-realtime-experimental',
    TWILIO_VERIFY_SERVICE_SID: 'verify-service',
    STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY: 'callcommand-lane-price',
    STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY: 'callcommand-local-number-price',
    STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY: 'callcommand-toll-free-number-price',
  }, ['core', 'callcommand']);

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.issues
      .filter((issue: { profile: string }) => issue.profile === 'callcommand')
      .map((issue: { name: string }) => issue.name),
    [
      'CALLCOMMAND_SIP_ROUTE_SECRET',
      'OPENAI_PROJECT_ID',
      'OPENAI_WEBHOOK_SECRET',
      'TWILIO_VERIFY_SERVICE_SID',
      'STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY',
      'STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY',
      'STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY',
      'CALLCOMMAND_REALTIME_MODEL',
    ],
  );
});
