import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdapterRequest } from '../src/lib/entitlement-adapters.js';

process.env.APP_ENV = 'test';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'deterministic-outbound-isolation-session-secret';
process.env.DATABASE_URL = 'postgresql://operatoros:local-only@127.0.0.1:7349/operatoros_test';

const { dispatchEntitlementPushRequest } = await import('../src/lib/entitlement-propagation.js');
const { processOutboundWebhook } = await import('../src/lib/shared-outbound-webhooks.js');

const deterministicProductionArtifactEnv: NodeJS.ProcessEnv = {
  APP_ENV: 'production',
  NODE_ENV: 'production',
  CI: 'true',
  OPERATOROS_DETERMINISTIC_PROVIDER_MODE: '1',
  PARITY_DATABASE_IS_DISPOSABLE: '1',
  DATABASE_URL: 'postgresql://operatoros:local-only@127.0.0.1:7349/operatoros_test',
};

test('production-artifact deterministic webhook processing records without DNS, secret resolution, or fetch', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('network must not be reached');
  }) as typeof fetch;

  let executeCalls = 0;
  const executor = {
    async execute() {
      executeCalls += 1;
      if (executeCalls === 1) {
        return {
          rows: [{
            endpoint_url: 'https://hooks.example.com/operatoros',
            secret_reference_id: 'must-not-be-resolved',
            enabled: true,
          }],
        };
      }
      return { rows: [] };
    },
  };

  try {
    const result = await processOutboundWebhook({
      id: 'delivery-1',
      tenant_id: 'tenant-1',
      module_id: 'module-1',
      endpoint_id: 'endpoint-1',
      event_type: 'record.updated',
      payload_json: { recordId: 'record-1' },
      attempt_count: 0,
      max_attempts: 5,
      lease_owner: 'worker-1',
    }, executor as never, deterministicProductionArtifactEnv);

    assert.deepEqual(result, {
      status: 'recorded',
      resultState: 'recorded_not_delivered',
      externalDelivery: false,
    });
    assert.equal(executeCalls, 3, 'only endpoint lookup, attempt record, and delivery-state update should run');
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('production-artifact deterministic entitlement propagation reports a local record without fetch', async () => {
  let fetchCalls = 0;
  const request: AdapterRequest = {
    url: 'https://receiver.example.com/v1/entitlements',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"tenantId":"tenant-1"}',
  };

  const result = await dispatchEntitlementPushRequest(
    request,
    deterministicProductionArtifactEnv,
    async () => {
      fetchCalls += 1;
      throw new Error('network must not be reached');
    },
  );

  assert.deepEqual(result, {
    ok: true,
    disposition: 'recorded_not_delivered',
    networkAttempted: false,
    externalDelivery: false,
  });
  assert.equal(fetchCalls, 0);
});
