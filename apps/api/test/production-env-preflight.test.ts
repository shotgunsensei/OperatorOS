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
  APP_ENV: 'production',
  NODE_ENV: 'production',
  OPERATOROS_BASE_URL: 'https://operatoros.net',
  OPERATOROS_APPS_URL: 'https://app.operatoros.net/',
  INTERNAL_API_URL: 'http://localhost:5001',
  OPERATOROS_DATABASE_RELEASE_MODE: 'apply',
  TRUST_PROXY: 'true',
};

test('production environment contract is machine-readable and owns core deployment inputs', () => {
  assert.equal(preflight.PRODUCTION_ENVIRONMENT_CONTRACT.contractVersion, 1);
  assert.equal(preflight.PRODUCTION_ENVIRONMENT_CONTRACT.deploymentTarget, 'replit-autoscale');
  assert.equal(preflight.PRODUCTION_ENVIRONMENT_CONTRACT.core.exact.INTERNAL_API_URL, 'http://localhost:5001');
  assert.equal(preflight.PRODUCTION_ENVIRONMENT_CONTRACT.core.exact.OPERATOROS_DATABASE_RELEASE_MODE, 'apply');
  assert.deepEqual(
    preflight.PRODUCTION_ENVIRONMENT_CONTRACT.core.unset,
    ['APP_URL', 'COOKIE_DOMAIN', 'NEXT_PUBLIC_API_URL'],
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
    OPERATOROS_DATABASE_RELEASE_MODE: 'skip',
    ALLOW_LEGACY_SSO_ROLLBACK: 'true',
    ALLOW_UNSAFE_COMMANDS: 'true',
  });
  assert.equal(unsafe.ok, false);
  assert.deepEqual(
    unsafe.issues.map((issue: { name: string }) => issue.name),
    [
      'SESSION_SECRET',
      'INTERNAL_API_URL',
      'OPERATOROS_DATABASE_RELEASE_MODE',
      'APP_URL',
      'COOKIE_DOMAIN',
      'NEXT_PUBLIC_API_URL',
      'ALLOW_LEGACY_SSO_ROLLBACK',
      'ALLOW_UNSAFE_COMMANDS',
    ],
  );
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
    OPENAI_API_KEY: 'sk-test-placeholder',
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

test('CallCommand accepts a bound Replit connector without copied Twilio secrets', () => {
  const report = preflight.evaluateProductionEnvironment({
    ...coreEnv,
    TWILIO_PUBLIC_BASE_URL: 'https://callcommand-ai.operatoros.net',
    REPLIT_CONNECTORS_HOSTNAME: 'connectors.example.invalid',
    REPL_IDENTITY: 'test-identity',
  }, ['core', 'callcommand']);
  assert.equal(report.ok, true);
});
