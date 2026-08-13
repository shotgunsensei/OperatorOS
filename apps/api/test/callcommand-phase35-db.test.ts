process.env.SESSION_SECRET ||= 'operatoros-callcommand-phase35-db-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules } from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: ReturnType<typeof Fastify>;
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
let profileId = '';
let channelId = '';
let flowId = '';
let callId = '';
let sessionId = '';

function headers(user: typeof ownerA, tenantId = user.currentTenantId) {
  return {
    authorization: `Bearer ${signToken({ userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion, sessionType: 'platform' })}`,
    'x-tenant-id': tenantId,
  };
}

async function clean(tenantId: string) {
  await db.execute(sql`DELETE FROM callcommand_reports WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_transfer_logs WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_action_runs WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_flow_traces WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_live_sessions WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_ingestion_events WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_ingestion_tokens WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_tickets WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_leads WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_tasks WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_automation_rules WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_events WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_followups WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_calls WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_channels WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_flow_versions WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_flows WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_transfer_targets WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_profiles WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_consents WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM callcommand_suppressions WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser(); ownerB = await createTestUser();
  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'callcommand-ai')).limit(1);
  moduleRow = existing ?? await createTestModule('callcommand-ai'); createdModule = !existing;
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  app = Fastify(); await app.register(cookie);
  const { registerCallCommandPhase35Routes } = await import('../src/routes/callcommand-phase35-routes.js');
  await registerCallCommandPhase35Routes(app); await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (ownerA) await clean(ownerA.currentTenantId);
  if (ownerB) await clean(ownerB.currentTenantId);
  if (moduleRow) await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id));
  if (ownerA) await cleanupUser(ownerA.id); if (ownerB) await cleanupUser(ownerB.id);
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('Phase 35 enforces OperatorOS auth and builds tenant-scoped receptionist configuration', async () => {
  const anonymous = await app.inject({ method: 'GET', url: '/v1/modules/callcommand-ai/product/workspace' });
  assert.equal(anonymous.statusCode, 401, anonymous.body);
  const profile = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/profiles', headers: headers(ownerA), payload: {
    name: 'MSP operations receptionist', mode: 'receptionist', productMode: 'msp', greeting: 'Thank you for calling operations.',
    intakeSchema: [{ key: 'caller_name', label: 'Caller name' }, { key: 'request', label: 'Request' }], escalationRules: [],
  } });
  assert.equal(profile.statusCode, 201, profile.body); profileId = profile.json().profile.id;
  const channel = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/channels', headers: headers(ownerA), payload: {
    name: 'Primary MSP line', phone: '+15550003535', timezone: 'America/New_York', profileId,
    liveBehavior: 'ai_receptionist', afterHoursBehavior: 'voicemail', recordingEnabled: true,
    requireRecordingConsent: true, businessHours: { always: true }, productMode: 'msp', consentScript: 'This call may be recorded only with consent.',
  } });
  assert.equal(channel.statusCode, 201, channel.body); channelId = channel.json().channel.id;
  assert.equal(channel.json().channel.phoneE164, undefined, 'raw phone must not leave the API');
  const foreign = await app.inject({ method: 'GET', url: '/v1/modules/callcommand-ai/product/workspace', headers: headers(ownerB) });
  assert.equal(foreign.statusCode, 200, foreign.body); assert.equal(foreign.json().channels.length, 0);
});

test('Phase 35 versions and publishes a validated flow, then binds it to a channel', async () => {
  const graph = { start: 'priority', nodes: [
    { key: 'priority', type: 'condition', config: { field: 'priority', operator: 'equals', value: 'urgent' }, yes: 'ticket', no: 'task' },
    { key: 'ticket', type: 'action', config: { actionType: 'ticket', title: 'Urgent response' } },
    { key: 'task', type: 'action', config: { actionType: 'task', title: 'Review request' } },
  ] };
  const flow = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/flows', headers: headers(ownerA), payload: { name: 'Priority dispatch', graph } });
  assert.equal(flow.statusCode, 201, flow.body); flowId = flow.json().flow.id; assert.equal(flow.json().validation.reachable, 3);
  const versioned = await app.inject({ method: 'PUT', url: `/v1/modules/callcommand-ai/product/flows/${flowId}`, headers: headers(ownerA), payload: { graph } });
  assert.equal(versioned.statusCode, 200, versioned.body); assert.equal(versioned.json().flow.version, 2);
  const published = await app.inject({ method: 'POST', url: `/v1/modules/callcommand-ai/product/flows/${flowId}/publish`, headers: headers(ownerA), payload: {} });
  assert.equal(published.statusCode, 200, published.body); assert.equal(published.json().flow.activeVersion, 2);
  const bound = await app.inject({ method: 'PATCH', url: `/v1/modules/callcommand-ai/product/channels/${channelId}`, headers: headers(ownerA), payload: { activeFlowId: flowId } });
  assert.equal(bound.statusCode, 200, bound.body); assert.equal(bound.json().channel.activeFlowId, flowId);
});

test('Phase 35 runs complete call intelligence, flow trace, rule actions, work queues, and PDF export', async () => {
  const rule = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/automation-rules', headers: headers(ownerA), payload: {
    name: 'Urgent ticket', priority: 1, conditions: { priority: 'urgent' }, actions: [{ actionType: 'ticket', title: 'Urgent caller response' }],
  } });
  assert.equal(rule.statusCode, 201, rule.body);
  const simulated = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/simulate', headers: headers(ownerA), payload: {
    channelId, profileId, callerPhone: '+14155550142', callerName: 'Jordan Lee',
    transcript: 'The production service is down. We cannot operate and need an urgent technician response. Call me at +1 415-555-0142.',
    idempotencyKey: 'phase35-complete-journey-1',
  } });
  assert.equal(simulated.statusCode, 201, simulated.body); callId = simulated.json().call.id; sessionId = simulated.json().session.id;
  assert.equal(simulated.json().simulation, true); assert.equal(simulated.json().providerActionConfirmed, false);
  const detail = await app.inject({ method: 'GET', url: `/v1/modules/callcommand-ai/product/calls/${callId}`, headers: headers(ownerA) });
  assert.equal(detail.statusCode, 200, detail.body); assert.equal(detail.json().call.priority, 'urgent');
  assert.ok(detail.json().traces.length >= 2); assert.ok(detail.json().actions.some((item: Record<string, unknown>) => item.actionType === 'ticket' && item.status === 'completed'));
  const workspace = await app.inject({ method: 'GET', url: '/v1/modules/callcommand-ai/product/workspace', headers: headers(ownerA) });
  assert.equal(workspace.statusCode, 200, workspace.body); assert.ok(workspace.json().tickets.length >= 1); assert.equal(workspace.json().analytics.totalCalls, 1);
  const report = await app.inject({ method: 'POST', url: `/v1/modules/callcommand-ai/product/calls/${callId}/report`, headers: headers(ownerA), payload: {} });
  assert.equal(report.statusCode, 200, report.body); assert.match(String(report.headers['content-type']), /application\/pdf/); assert.equal(report.rawPayload.subarray(0, 5).toString('ascii'), '%PDF-');
});

test('Phase 35 switchboard returns honest provider-unavailable transfer and supports session quick actions', async () => {
  const target = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/transfer-targets', headers: headers(ownerA), payload: { label: 'On-call operator', kind: 'external', phone: '+15550004545', verified: true } });
  assert.equal(target.statusCode, 201, target.body);
  const update = await app.inject({ method: 'PATCH', url: `/v1/modules/callcommand-ai/product/switchboard/sessions/${sessionId}`, headers: headers(ownerA), payload: { urgent: true, note: 'Operator acknowledged.' } });
  assert.equal(update.statusCode, 200, update.body); assert.equal(update.json().session.urgent, true);
  const transfer = await app.inject({ method: 'POST', url: `/v1/modules/callcommand-ai/product/switchboard/sessions/${sessionId}/transfer`, headers: headers(ownerA), payload: { targetId: target.json().target.id } });
  assert.equal(transfer.statusCode, 503, transfer.body); assert.equal(transfer.json().providerActionConfirmed, false); assert.equal(transfer.json().transfer.status, 'provider_unavailable');
});

test('Phase 35 ingestion token is one-time-visible, replay-safe, and tenant-routed', async () => {
  const token = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/ingestion-tokens', headers: headers(ownerA), payload: { label: 'Generic recorder', source: 'generic' } });
  assert.equal(token.statusCode, 201, token.body); assert.match(token.json().token, /^cci_/); assert.equal(token.json().configuration.tokenHash, undefined);
  const payload = { eventId: 'recorder-event-1', callerPhone: '+15551234567', customerName: 'Recording caller', transcript: 'Caller needs a normal support callback about a workstation issue.' };
  const first = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/ingest/generic', headers: { authorization: `Bearer ${token.json().token}` }, payload });
  assert.equal(first.statusCode, 202, first.body); assert.equal(first.json().duplicate, false);
  const replay = await app.inject({ method: 'POST', url: '/v1/modules/callcommand-ai/product/ingest/generic', headers: { authorization: `Bearer ${token.json().token}` }, payload });
  assert.equal(replay.statusCode, 200, replay.body); assert.equal(replay.json().duplicate, true);
  const leaked = await db.execute(sql`SELECT token_hash FROM callcommand_ingestion_tokens WHERE tenant_id=${ownerA.currentTenantId}`);
  assert.notEqual(String(leaked.rows[0]?.token_hash), token.json().token);
});
