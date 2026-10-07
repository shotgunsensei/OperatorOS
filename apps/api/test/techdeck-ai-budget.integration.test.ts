process.env.APP_ENV = 'test';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'operatoros-ai-budget-test-session-secret';

import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { sql, eq } from 'drizzle-orm';
import { db, closeDatabasePool } from '../src/db.js';
import { modules, tenantModules, tenantUsers, tenantUserModuleAccess } from '../src/schema.js';
import { createTestUser, createTestModule, ensureSchemaReady } from './_setup.js';
import { ensureSharedAiBudgetTables } from '../src/lib/shared-ai-budget-db-init.js';
import { runTechdeckGuidance } from '../src/lib/techdeck-ai-guidance.js';
import { priceUsageMicros, type AiPricing } from '../src/lib/ai-cost-control.js';
import { assertDisposableDatabaseEnvironment } from '../../../scripts/parity/lib/database.mjs';

assertDisposableDatabaseEnvironment(process.env);
const pricing: AiPricing = { model: 'synthetic-model', currency: 'USD', effectiveDate: new Date().toISOString().slice(0, 10),
  inputMicrosPerMillion: 2_000_000, cachedInputMicrosPerMillion: 200_000,
  cacheWriteMicrosPerMillion: 2_500_000, outputMicrosPerMillion: 10_000_000 };
const config = { OPERATOROS_AI_SPEND_ENABLED: '1', OPERATOROS_BUDGETED_AI_PROVIDER: 'openai-responses',
  OPENAI_API_KEY: 'synthetic-never-transmitted', OPERATOROS_BUDGETED_AI_MODEL: pricing.model,
  OPERATOROS_BUDGETED_AI_PRICING_JSON: JSON.stringify(pricing) };
const usage = { inputTokens: 1000, outputTokens: 100, cachedInputTokens: 200, cacheWriteTokens: 300 };
const guidance = { summary: 'Review synthetic recorded service evidence.', checks: ['Compare the recorded event timestamps.'],
  reviewRequired: true, executionPerformed: false };
let owner: any; let foreign: any; let viewer: any; let moduleId: string; let app: any;
let signToken: any;
let calls = 0;
const originalFetch = globalThis.fetch;
const previous = new Map(Object.keys(config).map(key => [key, process.env[key]]));

function installResponse(text = JSON.stringify(guidance), measured = true) {
  globalThis.fetch = (async () => {
    calls++;
    return Response.json({ model: pricing.model, service_tier: 'default', status: 'completed',
      output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] }],
      ...(measured ? { usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
        input_tokens_details: { cached_tokens: usage.cachedInputTokens, cache_write_tokens: usage.cacheWriteTokens } } } : {}) });
  }) as typeof fetch;
}
function headers(user = owner, tenantId = owner.currentTenantId) {
  return { authorization: `Bearer ${signToken({ userId: user.id, email: user.email, role: user.role,
    tokenVersion: user.tokenVersion, sessionType: 'platform' })}`, 'x-tenant-id': tenantId,
    'idempotency-key': 'synthetic-guidance-001' };
}
const route = '/v1/modules/techdeck/itops/query';
async function resetPolicy(daily = 10_000_000) {
  await db.execute(sql`DELETE FROM shared_ai_requests WHERE tenant_id=${owner.currentTenantId}`);
  await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id=${owner.currentTenantId}`);
  await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id=${owner.currentTenantId}`);
  await db.execute(sql`INSERT INTO shared_ai_budget_policies
    (tenant_id,module_id,enabled,per_call_micros,daily_micros,monthly_micros,updated_by_user_id)
    VALUES (${owner.currentTenantId},${moduleId},true,52000,${daily},${daily},${owner.id})
    ON CONFLICT (tenant_id,module_id) DO UPDATE SET enabled=true,per_call_micros=52000,daily_micros=${daily},monthly_micros=${daily}`);
  calls = 0; installResponse();
}

before(async () => {
  await ensureSchemaReady(); await ensureSharedAiBudgetTables(); await ensureSharedAiBudgetTables();
  owner = await createTestUser(); foreign = await createTestUser(); viewer = await createTestUser();
  [moduleId] = (await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, 'techdeck')).limit(1)).map(row => row.id);
  if (!moduleId) moduleId = (await createTestModule('techdeck')).id;
  await db.insert(tenantUsers).values({ tenantId: owner.currentTenantId, userId: viewer.id, role: 'member' });
  await db.insert(tenantModules).values({ tenantId: owner.currentTenantId, moduleId, status: 'enabled', source: 'admin', allowAllMembers: true }).onConflictDoNothing();
  await db.insert(tenantUserModuleAccess).values({ tenantId: owner.currentTenantId, userId: viewer.id, moduleId, accessLevel: 'viewer' });
  ({ signToken } = await import('../src/lib/auth.js'));
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerTechDeckLiteralRoutes } = await import('../src/routes/techdeck-literal-routes.js');
  app = Fastify(); await app.register(cookie); await registerTechDeckLiteralRoutes(app); await app.ready();
  Object.assign(process.env, config);
  installResponse();
});
after(async () => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  if (app) await app.close();
  await closeDatabasePool(); // Entire fresh container is removed by the calling verification task.
});

test('missing tenant policy and zero-spend flag deny before provider dispatch', async () => {
  const first = await app.inject({ method: 'POST', url: route, headers: headers(), payload: { query: 'Synthetic service issue' } });
  assert.equal(first.statusCode, 503); assert.equal(first.json().code, 'AI_BUDGET_DISABLED');
  await resetPolicy(); delete process.env.OPERATOROS_AI_SPEND_ENABLED;
  const disabled = await app.inject({ method: 'POST', url: route, headers: headers(), payload: { query: 'Synthetic service issue' } });
  assert.equal(disabled.statusCode, 503); assert.equal(disabled.json().code, 'AI_SPEND_DISABLED');
  process.env.OPERATOROS_AI_SPEND_ENABLED = '1'; assert.equal(calls, 0);
});

test('existing route rejects anonymous, foreign tenant, viewer, unentitled and client-owned provider/budget scope', async () => {
  await resetPolicy();
  for (const request of [
    { headers: {}, expected: 401 }, { headers: headers(owner, foreign.currentTenantId), expected: 404 },
    { headers: headers(viewer), expected: 403 }, { headers: headers(foreign, foreign.currentTenantId), expected: 403 },
  ]) {
    const response = await app.inject({ method: 'POST', url: route, headers: request.headers, payload: { query: 'Synthetic issue' } });
    assert.equal(response.statusCode, request.expected, response.body);
  }
  for (const payload of [{ query: 'Synthetic', tenantId: foreign.currentTenantId }, { query: 'Synthetic', model: 'expensive' },
    { query: 'Synthetic', budget: 999999 }, { query: 'Synthetic', tools: ['run-script'] }]) {
    const response = await app.inject({ method: 'POST', url: route, headers: headers(), payload });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(calls, 0);
});

test('authorized guidance is structured, visible to caller, durably measured and replayed without a second call', async () => {
  await resetPolicy();
  const request = { method: 'POST' as const, url: route, headers: headers(), payload: { query: 'Synthetic service issue' } };
  const first = await app.inject(request); assert.equal(first.statusCode, 200, first.body);
  assert.deepEqual(first.json().guidance, guidance); assert.equal(first.json().executionAvailable, false);
  const replay = await app.inject(request); assert.deepEqual(replay.json(), first.json()); assert.equal(calls, 1);
  const ledger = (await db.execute(sql`SELECT * FROM shared_ai_requests WHERE tenant_id=${owner.currentTenantId}`)).rows;
  assert.equal(ledger.length, 1); assert.equal(ledger[0].status, 'completed');
  assert.equal(Number(ledger[0].measured_micros), priceUsageMicros(usage, pricing));
  assert.equal(ledger[0].usage_json.cacheWriteTokens, 300);
  assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM shared_usage_events WHERE tenant_id=${owner.currentTenantId}`)).rows[0].n, 1);
  const conflict = await app.inject({ ...request, payload: { query: 'Changed request' } });
  assert.equal(conflict.statusCode, 409); assert.equal(calls, 1);
});

test('concurrent reservations cannot exceed tenant budget and unknown holds survive month rollover', async () => {
  await resetPolicy(52_000);
  const input = { tenantId: owner.currentTenantId, moduleId, userId: owner.id, query: 'Synthetic issue', correlationId: 'synthetic-correlation' };
  let unblock!: () => void;
  const wait = new Promise<void>(resolve => { unblock = resolve; });
  let dispatched!: () => void;
  const entered = new Promise<void>(resolve => { dispatched = resolve; });
  const provider = { name: 'openai-responses', async complete() { calls++; dispatched(); await wait;
    return { text: JSON.stringify(guidance), tokenCount: 0, durationMs: 1, provider: 'openai-responses', model: pricing.model, version: 'synthetic' }; } };
  const first = runTechdeckGuidance({ ...input, idempotencyKey: 'concurrent-first' }, { env: config, provider });
  await entered;
  await assert.rejects(runTechdeckGuidance({ ...input, idempotencyKey: 'concurrent-second' }, { env: config, provider }), { code: 'AI_BUDGET_EXCEEDED' });
  unblock(); await assert.rejects(first, { code: 'AI_USAGE_UNKNOWN' }); assert.equal(calls, 1);
  await db.execute(sql`UPDATE shared_ai_requests SET created_at=NOW()-INTERVAL '2 months' WHERE tenant_id=${owner.currentTenantId}`);
  await assert.rejects(runTechdeckGuidance({ ...input, idempotencyKey: 'concurrent-third' }, { env: config, provider }), { code: 'AI_BUDGET_EXCEEDED' });
});

test('invalid guidance charges measured provider cost and never returns unvalidated text', async () => {
  await resetPolicy(); installResponse('unvalidated output');
  const response = await app.inject({ method: 'POST', url: route, headers: headers(), payload: { query: 'Synthetic issue' } });
  assert.equal(response.statusCode, 502); assert.equal(response.json().code, 'AI_GUIDANCE_INVALID');
  assert.doesNotMatch(response.body, /unvalidated output/);
  const row = (await db.execute(sql`SELECT * FROM shared_ai_requests WHERE tenant_id=${owner.currentTenantId}`)).rows[0];
  assert.equal(row.status, 'failed'); assert.equal(row.response_json, null); assert.equal(Number(row.measured_micros), 2790);
});

test('missing usage and transport ambiguity retain full holds without zero-cost settlement or automatic retries', async () => {
  await resetPolicy(); installResponse(JSON.stringify(guidance), false);
  const request = { method: 'POST' as const, url: route, headers: headers(), payload: { query: 'Synthetic issue' } };
  assert.equal((await app.inject(request)).statusCode, 502);
  assert.equal((await app.inject(request)).statusCode, 409); assert.equal(calls, 1);
  const row = (await db.execute(sql`SELECT * FROM shared_ai_requests WHERE tenant_id=${owner.currentTenantId}`)).rows[0];
  assert.equal(row.status, 'unknown'); assert.equal(row.measured_micros, null); assert.equal(Number(row.reserved_micros), 52000);
  await resetPolicy(); globalThis.fetch = (async () => { calls++; throw new Error('synthetic timeout'); }) as typeof fetch;
  assert.equal((await app.inject(request)).statusCode, 502);
  assert.equal((await app.inject(request)).statusCode, 409); assert.equal(calls, 1);
});

test('an observed envelope overrun is fully accounted and disables further tenant spending', async () => {
  await resetPolicy();
  globalThis.fetch = (async () => { calls++; return Response.json({ model: pricing.model, service_tier: 'default', status: 'completed',
    output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(guidance) }] }],
    usage: { input_tokens: 1_000_000, output_tokens: 100, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } } }); }) as typeof fetch;
  const response = await app.inject({ method: 'POST', url: route, headers: headers(), payload: { query: 'Synthetic issue' } });
  assert.equal(response.statusCode, 502); assert.equal(response.json().code, 'AI_USAGE_ENVELOPE_EXCEEDED');
  const row = (await db.execute(sql`SELECT status,measured_micros FROM shared_ai_requests WHERE tenant_id=${owner.currentTenantId}`)).rows[0];
  assert.equal(row.status, 'overrun'); assert.equal(Number(row.measured_micros), 2_001_000);
  const disabled = await app.inject({ method: 'POST', url: route, headers: { ...headers(), 'idempotency-key': 'after-overrun' }, payload: { query: 'Synthetic issue' } });
  assert.equal(disabled.statusCode, 503); assert.equal(calls, 1);
});
