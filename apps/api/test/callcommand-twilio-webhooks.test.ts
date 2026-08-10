process.env.SESSION_SECRET ||= 'operatoros-callcommand-signed-webhook-test-v2';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
process.env.TWILIO_ACCOUNT_SID = 'ACtest_account_sid';
process.env.TWILIO_AUTH_TOKEN = 'test-auth-token-deadbeef';
process.env.TWILIO_FROM_NUMBER = '+15555550100';
process.env.TWILIO_PUBLIC_BASE_URL = 'http://localhost:3001';

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules } from '../src/schema.js';
import { ensureCallCommandTables } from '../src/lib/callcommand-db-init.js';
import { phoneFingerprint } from '../src/lib/callcommand.js';
import { clearTelephonyCache } from '../src/lib/telephony.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

const BASE = process.env.TWILIO_PUBLIC_BASE_URL!;
const SID = `CA${'a'.repeat(30)}`;
const INBOUND_SID = `CA${'c'.repeat(30)}`;
const RECORDING_SID = `RE${'b'.repeat(30)}`;
let app: ReturnType<typeof Fastify>;
let user: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let callId = '';
let channelId = '';

function sign(url: string, body: Record<string, string>) {
  let data = url;
  for (const key of Object.keys(body).sort()) data += key + body[key];
  return createHmac('sha1', process.env.TWILIO_AUTH_TOKEN!).update(data).digest('base64');
}

async function call() {
  const result = await db.execute(sql`SELECT * FROM callcommand_calls WHERE id=${callId} LIMIT 1`);
  return result.rows[0] as Record<string, any>;
}

before(async () => {
  await ensureSchemaReady();
  await ensureCallCommandTables();
  user = await createTestUser();
  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'callcommand-ai')).limit(1);
  moduleRow = existing ?? await createTestModule('callcommand-ai');
  createdModule = !existing;
  await db.insert(tenantModules).values({
    tenantId: user.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true,
  });
  const channel = await db.execute(sql`INSERT INTO callcommand_channels
    (tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,recording_enabled)
    VALUES (${user.currentTenantId},${user.id},'Signed callback line','+15550002222','UTC','Consent required.',FALSE) RETURNING id`);
  channelId = String(channel.rows[0].id);
  const profile = await db.execute(sql`INSERT INTO callcommand_profiles
    (tenant_id,created_by_user_id,name,mode,greeting) VALUES (${user.currentTenantId},${user.id},'Intake','intake','Hello') RETURNING id`);
  const fingerprint = phoneFingerprint('+15551234567');
  const consent = await db.execute(sql`INSERT INTO callcommand_consents
    (tenant_id,recorded_by_user_id,phone_fingerprint,phone_masked,phone_e164,purpose,source,evidence)
    VALUES (${user.currentTenantId},${user.id},${fingerprint},'+15••••4567','+15551234567','support','test','Signed callback fixture') RETURNING id`);
  const inserted = await db.execute(sql`INSERT INTO callcommand_calls
    (tenant_id,created_by_user_id,channel_id,profile_id,consent_id,phone_fingerprint,phone_masked,phone_e164,purpose,provider,provider_call_sid,status,idempotency_key,recording_status)
    VALUES (${user.currentTenantId},${user.id},${channelId},${String(profile.rows[0].id)},${String(consent.rows[0].id)},
      ${fingerprint},'+15••••4567','+15551234567','support','twilio',${SID},'queued','signed-webhook-fixture','disabled') RETURNING id`);
  callId = String(inserted.rows[0].id);
  clearTelephonyCache();
  app = Fastify();
  await app.register(cookie);
  const { registerCallCommandRoutes } = await import('../src/routes/callcommand-routes.js');
  await registerCallCommandRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (user) {
    await db.execute(sql`DELETE FROM callcommand_events WHERE tenant_id=${user.currentTenantId}`);
    await db.execute(sql`DELETE FROM callcommand_calls WHERE tenant_id=${user.currentTenantId}`);
    await db.execute(sql`DELETE FROM callcommand_consents WHERE tenant_id=${user.currentTenantId}`);
    await db.execute(sql`DELETE FROM callcommand_profiles WHERE tenant_id=${user.currentTenantId}`);
    await db.execute(sql`DELETE FROM callcommand_channels WHERE tenant_id=${user.currentTenantId}`);
    await db.execute(sql`DELETE FROM shared_webhook_receipts WHERE tenant_id=${user.currentTenantId} AND module_id=${moduleRow.id}`);
    await db.execute(sql`DELETE FROM operatoros_sms_consent_events WHERE consent_record_id IN (SELECT id FROM operatoros_sms_consent_records WHERE phone_e164='+15551234567')`);
    await db.execute(sql`DELETE FROM operatoros_sms_consent_records WHERE phone_e164='+15551234567'`);
    await db.delete(tenantModules).where(eq(tenantModules.tenantId, user.currentTenantId));
    await cleanupUser(user.id);
  }
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('signed platform messaging callback records STOP while a forged callback fails closed', async () => {
  const path = '/v1/modules/callcommand-ai/webhooks/twilio/messaging';
  const url = `${BASE}${path}`;
  const body = {
    MessageSid: `SM${'d'.repeat(30)}`,
    From: '+15551234567',
    To: process.env.TWILIO_FROM_NUMBER!,
    Body: 'STOP',
    OptOutType: 'STOP',
  };
  const forged = await app.inject({
    method: 'POST', url: path,
    headers: { 'x-twilio-signature': 'forged', 'content-type': 'application/json' }, payload: body,
  });
  assert.equal(forged.statusCode, 403, forged.body);
  const signed = await app.inject({
    method: 'POST', url: path,
    headers: { 'x-twilio-signature': sign(url, body), 'content-type': 'application/json' }, payload: body,
  });
  assert.equal(signed.statusCode, 200, signed.body);
  assert.equal(signed.body, '<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  const record = await db.execute(sql`SELECT status,revoked_at,revocation_mechanism FROM operatoros_sms_consent_records WHERE phone_e164='+15551234567'`);
  assert.equal(record.rows.length, 1);
  assert.equal(record.rows[0].status, 'revoked');
  assert.ok(record.rows[0].revoked_at);
  assert.equal(record.rows[0].revocation_mechanism, 'twilio_keyword');
});

test('signed status callbacks transition once and replay safely', async () => {
  const url = `${BASE}/v1/modules/callcommand-ai/webhooks/twilio/status`;
  const body = { CallSid: SID, CallStatus: 'completed', SequenceNumber: '1' };
  const first = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/webhooks/twilio/status',
    headers: { 'x-twilio-signature': sign(url, body), 'content-type': 'application/json' }, payload: body,
  });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().duplicate, false);
  assert.equal((await call()).status, 'completed');
  const replay = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/webhooks/twilio/status',
    headers: { 'x-twilio-signature': sign(url, body), 'content-type': 'application/json' }, payload: body,
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().duplicate, true);
  const events = await db.execute(sql`SELECT id FROM callcommand_events WHERE call_id=${callId} AND event_type='provider.status.completed'`);
  assert.equal(events.rows.length, 1);
});

test('forged status callback fails closed', async () => {
  const response = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/webhooks/twilio/status',
    headers: { 'x-twilio-signature': 'forged', 'content-type': 'application/json' },
    payload: { CallSid: SID, CallStatus: 'completed' },
  });
  assert.equal(response.statusCode, 403, response.body);
});

test('signed inbound DTMF intake persists once without consent, recording, or transcript data', async () => {
  const incomingPath = '/v1/modules/callcommand-ai/webhooks/twilio/incoming';
  const incomingUrl = `${BASE}${incomingPath}`;
  const incomingBody = {
    CallSid: INBOUND_SID,
    From: '+15557654321',
    To: '+15550002222',
  };
  const first = await app.inject({
    method: 'POST',
    url: incomingPath,
    headers: {
      'x-twilio-signature': sign(incomingUrl, incomingBody),
      'content-type': 'application/json',
    },
    payload: incomingBody,
  });
  assert.equal(first.statusCode, 200, first.body);
  assert.match(first.headers['content-type'] || '', /text\/xml/);
  assert.match(first.body, /Signed callback line|Hello/);
  assert.match(first.body, /input="dtmf"/);
  assert.doesNotMatch(first.body, /\+15557654321/);
  const replay = await app.inject({
    method: 'POST',
    url: incomingPath,
    headers: {
      'x-twilio-signature': sign(incomingUrl, incomingBody),
      'content-type': 'application/json',
    },
    payload: incomingBody,
  });
  assert.equal(replay.statusCode, 200, replay.body);
  const inboundRows = await db.execute(sql`SELECT * FROM callcommand_calls
    WHERE tenant_id=${user.currentTenantId} AND provider_call_sid=${INBOUND_SID}`);
  assert.equal(inboundRows.rows.length, 1);
  const inbound = inboundRows.rows[0] as Record<string, any>;
  assert.equal(inbound.channel_id, channelId);
  assert.equal(inbound.direction, 'inbound');
  assert.equal(inbound.consent_id, null);
  assert.equal(inbound.recording_status, 'disabled');
  assert.equal(inbound.transcript, null);
  const incomingEvents = await db.execute(sql`SELECT id FROM callcommand_events
    WHERE call_id=${String(inbound.id)} AND event_type='provider.inbound.received'`);
  assert.equal(incomingEvents.rows.length, 1);

  const intakePath = `/v1/modules/callcommand-ai/webhooks/twilio/intake?call_id=${encodeURIComponent(String(inbound.id))}`;
  const intakeUrl = `${BASE}${intakePath}`;
  const intakeBody = { CallSid: INBOUND_SID, Digits: '2' };
  const intake = await app.inject({
    method: 'POST',
    url: intakePath,
    headers: {
      'x-twilio-signature': sign(intakeUrl, intakeBody),
      'content-type': 'application/json',
    },
    payload: intakeBody,
  });
  assert.equal(intake.statusCode, 200, intake.body);
  const intakeReplay = await app.inject({
    method: 'POST',
    url: intakePath,
    headers: {
      'x-twilio-signature': sign(intakeUrl, intakeBody),
      'content-type': 'application/json',
    },
    payload: intakeBody,
  });
  assert.equal(intakeReplay.statusCode, 200, intakeReplay.body);
  const completed = await db.execute(sql`SELECT purpose,status,disposition,recording_status,transcript
    FROM callcommand_calls WHERE id=${String(inbound.id)}`);
  assert.equal(completed.rows[0].purpose, 'appointment');
  assert.equal(completed.rows[0].status, 'completed');
  assert.equal(completed.rows[0].disposition, 'follow_up_required');
  assert.equal(completed.rows[0].recording_status, 'disabled');
  assert.equal(completed.rows[0].transcript, null);
  const intakeEvents = await db.execute(sql`SELECT id FROM callcommand_events
    WHERE call_id=${String(inbound.id)} AND event_type='provider.inbound.intake_completed'`);
  assert.equal(intakeEvents.rows.length, 1);
});

test('recording callback is replay-audited but cannot activate recording storage', async () => {
  const url = `${BASE}/v1/modules/callcommand-ai/webhooks/twilio/recording`;
  const body = {
    CallSid: SID,
    RecordingSid: RECORDING_SID,
    RecordingUrl: `https://api.twilio.test/recordings/${RECORDING_SID}`,
  };
  const response = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/webhooks/twilio/recording',
    headers: { 'x-twilio-signature': sign(url, body), 'content-type': 'application/json' }, payload: body,
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().duplicate, false);
  const replay = await app.inject({
    method: 'POST', url: '/v1/modules/callcommand-ai/webhooks/twilio/recording',
    headers: { 'x-twilio-signature': sign(url, body), 'content-type': 'application/json' }, payload: body,
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().duplicate, true);
  const row = await call();
  assert.equal(row.recording_sid, null);
  assert.equal(row.recording_status, 'disabled');
  assert.equal('recording_url' in row, false);
  const event = await db.execute(sql`SELECT safe_payload FROM callcommand_events WHERE call_id=${callId} AND event_type='provider.recording.rejected'`);
  assert.equal(event.rows.length, 1);
  assert.deepEqual(event.rows[0].safe_payload, {
    provider: 'twilio',
    accepted: false,
    reason: 'recording_disabled',
  });
});
