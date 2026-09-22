import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

process.env.DATABASE_URL = 'postgresql://operatoros:local-only@127.0.0.1:7349/operatoros_test';
process.env.SESSION_SECRET = 'customer-readiness-unit-tests-only';

test('Resend retries keep one bounded key and never share delivery identity across organizations', async () => {
  const names = ['APP_ENV', 'NODE_ENV', 'OPERATOROS_DETERMINISTIC_PROVIDER_MODE', 'RESEND_API_KEY', 'EMAIL_FROM'] as const;
  const previous = new Map(names.map(name => [name, process.env[name]]));
  const fetchBefore = globalThis.fetch;
  const requests: RequestInit[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), 'https://api.resend.com/emails');
    requests.push(init!);
    if (requests.length === 1) throw new Error('Synthetic lost response');
    return new Response(JSON.stringify({ id: 'synthetic-email-receipt' }), { status: 200 });
  }) as typeof fetch;
  try {
    process.env.APP_ENV = 'development'; process.env.NODE_ENV = 'development';
    delete process.env.OPERATOROS_DETERMINISTIC_PROVIDER_MODE;
    process.env.RESEND_API_KEY = 'synthetic-resend-test-only';
    process.env.EMAIL_FROM = 'test@example.invalid';
    const { getOutboundProviderAdapter } = await import('../src/lib/shared-provider-adapters.js');
    const adapter = await getOutboundProviderAdapter('email');
    const delivery = { destination: 'recipient@example.invalid', body: 'Synthetic test', idempotencyKey: 'outbox:team-a:message-1' };
    await assert.rejects(adapter.send(delivery), /Synthetic lost response/);
    assert.equal((await adapter.send(delivery)).providerMessageId, 'synthetic-email-receipt');
    await adapter.send({ ...delivery, idempotencyKey: 'outbox:team-b:message-1' });
    const keys = requests.map(request => new Headers(request.headers).get('Idempotency-Key'));
    assert.equal(keys[0], `operatoros-email-${createHash('sha256').update(delivery.idempotencyKey).digest('hex')}`);
    assert.equal(keys[0], keys[1]);
    assert.notEqual(keys[1], keys[2]);
    assert.ok(keys.every(key => key && key.length < 256));
    assert.equal(requests[0].body, requests[1].body);
  } finally {
    globalThis.fetch = fetchBefore;
    for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});

test('the outbox gives retries the same delivery identity even when caller keys collide', async () => {
  process.env.APP_ENV = 'test'; process.env.NODE_ENV = 'test';
  const { processOutboxMessage, setOutboundAdapterResolverForTests } = await import('../src/lib/shared-notification-outbox.js');
  const keys: string[] = [];
  setOutboundAdapterResolverForTests(async () => ({
    status: { kind: 'email', name: 'synthetic', state: 'test' },
    async send(input) { keys.push(input.idempotencyKey); return { providerMessageId: 'synthetic-receipt', externalDelivery: false }; },
  }));
  const executor = { execute: async () => ({ rows: [] }) };
  const row = { id: 'message-1', tenant_id: 'team-a', module_id: 'module-1', channel: 'email', destination: 'test@example.invalid', body: 'Synthetic', idempotency_key: 'same-caller-key', attempt_count: 0, max_attempts: 3, lease_owner: 'worker' };
  try {
    await processOutboxMessage(row, executor as never);
    await processOutboxMessage({ ...row, attempt_count: 1 }, executor as never);
    await processOutboxMessage({ ...row, tenant_id: 'team-b' }, executor as never);
    assert.deepEqual(keys, ['outbox:team-a:message-1', 'outbox:team-a:message-1', 'outbox:team-b:message-1']);
  } finally { setOutboundAdapterResolverForTests(null); }
});
