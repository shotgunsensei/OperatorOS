import test from 'node:test';
import assert from 'node:assert/strict';
import { BRANDFORGE_INTEGRATION_CATALOG } from '../src/lib/brandforgeos-phase31.js';
import {
  brandForgeConnectorAvailability,
  brandForgeConnectorFailure,
  brandForgeConnectorPolicy,
  parseBrandForgeConnectorConfiguration,
  parseBrandForgeConnectorSync,
} from '../src/lib/brandforgeos-connector-policy.js';

const production = { NODE_ENV: 'production', APP_ENV: 'production' };
const disposableHarness = {
  NODE_ENV: 'production', APP_ENV: 'test', CI: 'true',
  OPERATOROS_DETERMINISTIC_PROVIDER_MODE: '1', PARITY_DATABASE_IS_DISPOSABLE: '1',
  DATABASE_URL: 'postgres://fixture:fixture@127.0.0.1:15432/brandforge_disposable',
};
const invalidInput = (error: unknown) => {
  assert.equal((error as { code: string }).code, 'BRANDFORGE_INPUT_INVALID');
  assert.equal((error as { statusCode: number }).statusCode, 400);
  return true;
};

test('every catalog provider remains unavailable in production until its live contract exists', () => {
  for (const provider of BRANDFORGE_INTEGRATION_CATALOG) {
    const decision = brandForgeConnectorPolicy(provider.provider, production);
    assert.equal(decision.allowed, false);
    if (decision.allowed) assert.fail('A catalog row is not a live adapter');
    assert.equal(decision.statusCode, 503);
    assert.equal(decision.code, 'PROVIDER_ADAPTER_UNAVAILABLE');
    assert.equal(decision.reasonCode, 'BRANDFORGE_PROVIDER_CONTRACT_REQUIRED');
    assert.equal(decision.externalDelivery, false);
  }
});

test('unsupported provider names are rejected without accepting URLs or aliases', () => {
  for (const provider of ['', '__proto__', 'WEBHOOKS', 'webhooks.other', 'https://example.invalid']) {
    const decision = brandForgeConnectorPolicy(provider, production);
    assert.equal(decision.allowed, false);
    if (decision.allowed) assert.fail('Unknown provider accepted');
    assert.equal(decision.statusCode, 404);
    assert.equal(decision.code, 'BRANDFORGE_PROVIDER_UNSUPPORTED');
  }
});

test('ordinary isolated test modes retain the existing deterministic connector', () => {
  for (const env of [{ NODE_ENV: 'test' }, { APP_ENV: 'test' }]) {
    const decision = brandForgeConnectorPolicy('meta_ads', env);
    assert.equal(decision.allowed, true);
    if (!decision.allowed) assert.fail('Test connector was not available');
    assert.equal(decision.catalog.requiredFeature, 'integrations.starter');
    assert.equal(decision.execution, 'deterministic_test');
    assert.equal(decision.externalDelivery, false);
  }
});

test('one test flag cannot turn a production environment into synthetic readiness', () => {
  for (const env of [{ NODE_ENV: 'production', APP_ENV: 'test' }, { NODE_ENV: 'test', APP_ENV: 'production' }]) {
    assert.equal(brandForgeConnectorPolicy('webhooks', env).allowed, false);
  }
});

test('production-artifact fixtures require the complete existing disposable acceptance gate', () => {
  assert.equal(brandForgeConnectorPolicy('webhooks', disposableHarness).allowed, true);
  for (const missing of ['CI', 'OPERATOROS_DETERMINISTIC_PROVIDER_MODE', 'PARITY_DATABASE_IS_DISPOSABLE', 'DATABASE_URL']) {
    assert.equal(brandForgeConnectorPolicy('webhooks', { ...disposableHarness, [missing]: undefined }).allowed, false, missing);
  }
});

test('a remote, unmarked or retargeted database URL cannot authorize a synthetic production adapter', () => {
  for (const databaseUrl of [
    'postgres://fixture:fixture@db.example.invalid/brandforge_disposable',
    'postgres://fixture:fixture@127.0.0.1/production',
    'postgres://fixture:fixture@127.0.0.1/brandforge_disposable?host=db.example.invalid',
  ]) assert.equal(brandForgeConnectorPolicy('webhooks', { ...disposableHarness, DATABASE_URL: databaseUrl }).allowed, false);
});

test('availability never labels a test fixture as live delivery', () => {
  assert.deepEqual(brandForgeConnectorAvailability('webhooks', { APP_ENV: 'test' }), {
    runtimeAvailable: true, availability: 'test_only', execution: 'deterministic_test',
    externalDelivery: false, reasonCode: 'DETERMINISTIC_TEST_ADAPTER', policyVersion: 'brandforge-connector-policy-v1',
  });
  const unavailable = brandForgeConnectorAvailability('webhooks', production);
  assert.equal(unavailable.runtimeAvailable, false);
  assert.equal(unavailable.execution, 'unavailable');
  assert.equal(unavailable.externalDelivery, false);
});

test('unavailable response contains no input, credential or implied provider receipt', () => {
  const decision = brandForgeConnectorPolicy('webhooks', production);
  if (decision.allowed) assert.fail('Expected unavailable contract');
  const response = brandForgeConnectorFailure(decision);
  assert.equal(response.externalDelivery, false);
  assert.equal(Object.hasOwn(response, 'receipt'), false);
  assert.match(response.error, /provider contract/);
});

test('bounded public metadata survives and browser callback claims never become acceptance proof', () => {
  const input = { mode: 'test', callbackReady: true, publicConfig: { label: 'Synthetic fixture', count: 2, enabled: true, tags: ['draft'], scope: { region: 'test' } } };
  const parsed = parseBrandForgeConnectorConfiguration(input);
  assert.deepEqual(parsed.publicConfig, input.publicConfig);
  assert.equal(parsed.callbackReady, false);
  assert.equal(input.callbackReady, true);
  assert.notEqual(parsed.publicConfig, input.publicConfig);
});

test('live mode cannot be saved through the deterministic test connector', () => {
  assert.throws(() => parseBrandForgeConnectorConfiguration({ mode: 'live', callbackReady: true }), invalidInput);
});

test('raw credential fields and nested prototype keys are not persisted as public configuration', () => {
  for (const publicConfig of [
    { apiKey: 'synthetic-only' }, { nested: { authorization: 'synthetic-only' } },
    { values: [{ password: 'synthetic-only' }] }, JSON.parse('{"__proto__":{"x":"value"}}'),
  ]) assert.throws(() => parseBrandForgeConnectorConfiguration({ mode: 'test', publicConfig }), invalidInput);
  assert.throws(() => parseBrandForgeConnectorConfiguration({ mode: 'test', tenantId: 'client-owned' }), invalidInput);
});

test('non-JSON, excessive depth, count, length and byte-size metadata are rejected before persistence', () => {
  for (const publicConfig of [
    { count: Infinity }, { count: NaN }, { missing: undefined }, { callback: () => true }, { date: new Date(0) },
    { a: { b: { c: { d: { e: 'too-deep' } } } } }, { labels: Array(21).fill('x') }, { label: 'x'.repeat(501) },
    Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`field${i}`, 'x'])),
    Object.fromEntries(Array.from({ length: 35 }, (_, i) => [`field${i}`, 'x'.repeat(500)])),
  ]) assert.throws(() => parseBrandForgeConnectorConfiguration({ mode: 'test', publicConfig }), invalidInput);
});

test('sync accepts a bounded replay key or server-generated fallback, never client authority', () => {
  assert.deepEqual(parseBrandForgeConnectorSync({}), {});
  assert.equal(parseBrandForgeConnectorSync({ idempotencyKey: 'brandforge-sync:webhooks:123' }).idempotencyKey, 'brandforge-sync:webhooks:123');
  for (const input of [
    { idempotencyKey: {} }, { idempotencyKey: '' }, { idempotencyKey: 'x'.repeat(161) },
    { idempotencyKey: 'key with spaces' }, { tenantId: 'foreign' }, { endpointUrl: 'https://example.invalid' },
  ]) assert.throws(() => parseBrandForgeConnectorSync(input), invalidInput);
});
