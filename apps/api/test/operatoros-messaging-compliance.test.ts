process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
process.env.SESSION_SECRET ||= 'operatoros-messaging-compliance-test-key-v1';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import Fastify from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { ensureOperatorOsMessagingComplianceTables } from '../src/lib/operatoros-messaging-compliance-db-init.js';
import {
  OPERATOROS_SMS_DISCLOSURE,
  OPERATOROS_SMS_DISCLOSURE_VERSION,
  OPERATOROS_SMS_PROGRAM,
  isOperatorOsSmsRevoked,
  recordOperatorOsMessagingKeyword,
} from '../src/lib/operatoros-messaging-compliance.js';
import { registerOperatorOsMessagingComplianceRoutes } from '../src/routes/operatoros-messaging-compliance-routes.js';
import { processOutboxMessage, setOutboundAdapterResolverForTests } from '../src/lib/shared-notification-outbox.js';

const suffix = String(1000 + Math.floor(Math.random() * 8000));
const phoneE164 = `+1202555${suffix}`;
const displayPhone = `(202) 555-${suffix}`;
let app: ReturnType<typeof Fastify>;

before(async () => {
  await ensureOperatorOsMessagingComplianceTables();
  await db.execute(sql`DELETE FROM operatoros_sms_consent_rate_limits`);
  app = Fastify();
  await registerOperatorOsMessagingComplianceRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await db.execute(sql`DELETE FROM operatoros_sms_consent_events WHERE program=${OPERATOROS_SMS_PROGRAM} AND phone_fingerprint IN (SELECT phone_fingerprint FROM operatoros_sms_consent_records WHERE phone_e164=${phoneE164})`);
  await db.execute(sql`DELETE FROM operatoros_sms_consent_records WHERE program=${OPERATOROS_SMS_PROGRAM} AND phone_e164=${phoneE164}`);
  await db.execute(sql`DELETE FROM operatoros_sms_consent_rate_limits`);
});

test('public consent contract exposes versions but no secret or phone data', async () => {
  const response = await app.inject({ method: 'GET', url: '/v1/public/operatoros/sms-consent' });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.headers['cache-control'], 'no-store');
  const body = response.json();
  assert.equal(body.consentCategory, 'service');
  assert.equal(body.disclosure, OPERATOROS_SMS_DISCLOSURE);
  assert.equal(body.disclosureVersion, OPERATOROS_SMS_DISCLOSURE_VERSION);
  assert.doesNotMatch(response.body, /AUTH_TOKEN|SESSION_SECRET|TWILIO_ACCOUNT_SID/);
});

test('public consent requires an affirmative checkbox and valid US phone', async () => {
  const unchecked = await app.inject({
    method: 'POST', url: '/v1/public/operatoros/sms-consent',
    payload: { phoneNumber: displayPhone, smsConsent: false, website: '' },
  });
  assert.equal(unchecked.statusCode, 422, unchecked.body);
  assert.equal(unchecked.json().code, 'SMS_CONSENT_REQUIRED');

  const invalid = await app.inject({
    method: 'POST', url: '/v1/public/operatoros/sms-consent',
    payload: { phoneNumber: '123', smsConsent: true, website: '' },
  });
  assert.equal(invalid.statusCode, 422, invalid.body);
  assert.equal(invalid.json().code, 'SMS_PHONE_INVALID');
});

test('consent persists exact evidence and duplicate submission is idempotent', async () => {
  const payload = { phoneNumber: displayPhone, smsConsent: true, website: '' };
  const first = await app.inject({
    method: 'POST', url: '/v1/public/operatoros/sms-consent',
    headers: { 'user-agent': 'OperatorOS compliance test browser' }, payload,
  });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(first.json().accepted, true);
  assert.equal(first.json().duplicate, false);
  assert.match(first.json().reference, /^SMS-[0-9A-F-]{8}$/);

  const duplicate = await app.inject({
    method: 'POST', url: '/v1/public/operatoros/sms-consent',
    headers: { 'user-agent': 'OperatorOS compliance test browser' }, payload,
  });
  assert.equal(duplicate.statusCode, 200, duplicate.body);
  assert.equal(duplicate.json().duplicate, true);

  const record = await db.execute(sql`SELECT * FROM operatoros_sms_consent_records WHERE phone_e164=${phoneE164} AND program=${OPERATOROS_SMS_PROGRAM}`);
  assert.equal(record.rows.length, 1);
  assert.equal(record.rows[0].status, 'opted_in');
  assert.equal(record.rows[0].disclosure_text, OPERATOROS_SMS_DISCLOSURE);
  assert.equal(record.rows[0].disclosure_version, OPERATOROS_SMS_DISCLOSURE_VERSION);
  assert.equal(record.rows[0].opt_in_mechanism, 'public_web_form');
  assert.equal(record.rows[0].user_agent_summary, 'OperatorOS compliance test browser');
  assert.match(String(record.rows[0].client_ip_hash), /^[0-9a-f]{64}$/);
  const events = await db.execute(sql`SELECT event_type FROM operatoros_sms_consent_events WHERE consent_record_id=${String(record.rows[0].id)}`);
  assert.deepEqual(events.rows.map(row => row.event_type), ['opt_in']);
});

test('STOP revokes locally, HELP records evidence, and START only re-enrolls a revoked number', async () => {
  const stopped = await recordOperatorOsMessagingKeyword({
    phoneNumber: phoneE164,
    body: 'unsubscribe',
    optOutType: 'STOP',
    providerEventId: `SMstop${suffix}`,
    sourceUrl: 'https://outcall.operatoros.net/api/modules/outcall/webhooks/twilio/sms',
  });
  assert.equal(stopped.handled, true);
  assert.equal(stopped.type, 'STOP');
  assert.equal(stopped.changed, true);
  assert.equal(await isOperatorOsSmsRevoked(phoneE164), true);

  const replay = await recordOperatorOsMessagingKeyword({
    phoneNumber: phoneE164,
    body: 'unsubscribe',
    optOutType: 'STOP',
    providerEventId: `SMstop${suffix}`,
    sourceUrl: 'https://outcall.operatoros.net/api/modules/outcall/webhooks/twilio/sms',
  });
  assert.equal(replay.duplicate, true);

  const help = await recordOperatorOsMessagingKeyword({
    phoneNumber: phoneE164,
    body: 'HELP',
    providerEventId: `SMhelp${suffix}`,
    sourceUrl: 'https://outcall.operatoros.net/api/modules/outcall/webhooks/twilio/sms',
  });
  assert.equal(help.type, 'HELP');

  const started = await recordOperatorOsMessagingKeyword({
    phoneNumber: phoneE164,
    body: 'START',
    optOutType: 'START',
    providerEventId: `SMstart${suffix}`,
    sourceUrl: 'https://outcall.operatoros.net/api/modules/outcall/webhooks/twilio/sms',
  });
  assert.equal(started.changed, true);
  assert.equal(await isOperatorOsSmsRevoked(phoneE164), false);
  const record = await db.execute(sql`SELECT status,revoked_at,opt_in_mechanism FROM operatoros_sms_consent_records WHERE phone_e164=${phoneE164}`);
  assert.equal(record.rows[0].status, 'opted_in');
  assert.equal(record.rows[0].revoked_at, null);
  assert.equal(record.rows[0].opt_in_mechanism, 'twilio_start_keyword');
});

test('shared outbox cancels revoked SMS before resolving or calling a provider', async () => {
  await recordOperatorOsMessagingKeyword({
    phoneNumber: phoneE164,
    body: 'STOP',
    providerEventId: `SMoutboxstop${suffix}`,
    sourceUrl: 'https://callcommand-ai.operatoros.net/v1/modules/callcommand-ai/webhooks/twilio/messaging',
  });
  let providerResolved = false;
  setOutboundAdapterResolverForTests(async () => {
    providerResolved = true;
    throw new Error('provider must not be resolved for a revoked destination');
  });
  const calls: unknown[] = [];
  const executor = {
    execute: async (query: unknown) => {
      calls.push(query);
      return { rows: calls.length === 1 ? [{ revoked: true }] : [] };
    },
  };
  try {
    await processOutboxMessage({
      id: 'outbox-test-id', tenant_id: 'tenant-test-id', module_id: 'module-test-id',
      channel: 'sms', destination: phoneE164, body: 'OperatorOS test', idempotency_key: 'sms-revoked-test',
      attempt_count: 0, lease_owner: 'worker-test',
    }, executor as any);
  } finally {
    setOutboundAdapterResolverForTests(null);
  }
  assert.equal(providerResolved, false);
  assert.equal(calls.length, 3, 'suppression lookup, delivery-attempt audit, and outbox cancellation should execute');
});
