import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareTorqueRevenueReleaseIdentity,
  evaluateTorqueCreditPurchaseReadiness,
  TORQUE_CREDIT_REQUIRED_WEBHOOK_EVENTS,
} from '../src/lib/torque-credit-readiness.js';

const productionBase = {
  env: {
    NODE_ENV: 'production',
    APP_ENV: 'production',
    TORQUESHED_CREDIT_PURCHASES_ENABLED: '1',
    TORQUESHED_CREDIT_PURCHASES_MODE: 'test',
    STRIPE_MODE: 'test',
    STRIPE_WEBHOOK_ENDPOINT_URL: 'https://api.operatoros.net/v1/billing/webhook',
    STRIPE_WEBHOOK_EVENTS: TORQUE_CREDIT_REQUIRED_WEBHOOK_EVENTS.join(','),
  } as NodeJS.ProcessEnv,
  paymentProviderState: 'configured' as const,
  databaseReady: true,
  moduleBaseUrl: 'https://torqueshed.operatoros.net',
  catalog: { state: 'validated' as const, version: 'v1', mode: 'test' as const },
  release: {
    status: 'identified' as const,
    commit: 'a'.repeat(40),
    expectedCommit: 'a'.repeat(40),
  },
};

test('TorqueShed purchase readiness requires every revenue-integrity check', () => {
  const ready = evaluateTorqueCreditPurchaseReadiness(productionBase);
  assert.equal(ready.ready, true);
  assert.equal(ready.code, 'TORQUE_CREDIT_PURCHASES_READY');
  assert.ok(ready.checks.every((check) => check.ready));

  const cases: Array<[string, Partial<typeof productionBase>, string]> = [
    ['feature disabled', { env: { ...productionBase.env, TORQUESHED_CREDIT_PURCHASES_ENABLED: '0' } }, 'TORQUE_CREDIT_PURCHASES_DISABLED'],
    ['Stripe disabled', { paymentProviderState: 'disabled' }, 'TORQUE_PAYMENT_PROVIDER_DISABLED'],
    ['wrong mode', { env: { ...productionBase.env, STRIPE_MODE: 'live' } }, 'TORQUE_PAYMENT_MODE_MISMATCH'],
    ['missing catalog', { catalog: { state: 'unavailable', version: null, mode: null } }, 'TORQUE_CATALOG_UNAVAILABLE'],
    ['missing webhook', { env: { ...productionBase.env, STRIPE_WEBHOOK_ENDPOINT_URL: '' } }, 'TORQUE_WEBHOOK_NOT_READY'],
    ['stale database', { databaseReady: false }, 'TORQUE_DATABASE_RELEASE_REQUIRED'],
    ['invalid return host', { moduleBaseUrl: 'http://torqueshed.operatoros.net' }, 'TORQUE_RETURN_ROUTE_INVALID'],
    ['release mismatch', { release: { status: 'identified', commit: 'a'.repeat(40), expectedCommit: 'b'.repeat(40) } }, 'TORQUE_RELEASE_IDENTITY_MISMATCH'],
  ];

  for (const [label, override, code] of cases) {
    const result = evaluateTorqueCreditPurchaseReadiness({ ...productionBase, ...override });
    assert.equal(result.ready, false, label);
    assert.equal(result.code, code, label);
    assert.ok(result.userMessage.length > 10, label);
    assert.ok(result.administratorAction.length > 10, label);
  }
});

test('deterministic disposable tests remain explicit and fail closed when explicitly disabled', () => {
  const testInput = {
    ...productionBase,
    env: { NODE_ENV: 'test', APP_ENV: 'test' } as NodeJS.ProcessEnv,
    paymentProviderState: 'test' as const,
    catalog: { state: 'test' as const, version: 'v1-test', mode: 'test' as const },
    release: { status: 'unavailable' as const },
    moduleBaseUrl: 'http://torqueshed.example.test',
  };
  assert.equal(evaluateTorqueCreditPurchaseReadiness(testInput).ready, true);
  assert.equal(
    evaluateTorqueCreditPurchaseReadiness({
      ...testInput,
      env: { ...testInput.env, TORQUESHED_CREDIT_PURCHASES_ENABLED: '0' },
    }).code,
    'TORQUE_CREDIT_PURCHASES_DISABLED',
  );
});

test('source and deployed release mismatch is explicit and machine-readable', () => {
  assert.deepEqual(compareTorqueRevenueReleaseIdentity('a'.repeat(40), 'b'.repeat(40)), {
    matches: false,
    code: 'TORQUE_RELEASE_IDENTITY_MISMATCH',
    sourceCommit: 'a'.repeat(40),
    deployedCommit: 'b'.repeat(40),
  });
  assert.equal(
    compareTorqueRevenueReleaseIdentity('a'.repeat(40), 'a'.repeat(40)).code,
    'TORQUE_RELEASE_IDENTITY_MATCH',
  );
});
