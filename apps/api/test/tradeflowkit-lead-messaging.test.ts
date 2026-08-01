process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-lead-messaging-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { activityFeed, tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let viewer: any;
let moduleRow: any;
let signToken: typeof import('../src/lib/auth.js').signToken;

function headers(user: any, tenantId: string, key?: string) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id, email: user.email, role: user.role,
      tokenVersion: user.tokenVersion, sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
    ...(key ? { 'idempotency-key': key } : {}),
  };
}

async function createLead(user: any, tenantId: string, consentToSms: boolean) {
  const response = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads', headers: headers(user, tenantId),
    payload: {
      name: consentToSms ? 'Messaging Consent Lead' : 'Messaging No Consent Lead',
      phone: '+15555550199', email: 'messaging-lead@example.com', serviceType: 'Panel repair', consentToSms,
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser(); ownerB = await createTestUser(); viewer = await createTestUser();
  moduleRow = await createTestModule('tradeflowkit');
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'viewer' });
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId, userId: viewer.id, moduleId: moduleRow.id, accessLevel: 'viewer',
  });
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  app = Fastify(); await app.register(cookie);
  const { registerModuleShellRoutes } = await import('../src/routes/module-shell-routes.js');
  await registerModuleShellRoutes(app); await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (moduleRow) {
    try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.moduleId, moduleRow.id)); } catch {}
    try { await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id)); } catch {}
  }
  for (const user of [viewer, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('lead email and consent-gated SMS use the shared replay-safe outbox with server-owned destinations', async () => {
  const tenant = ownerA.currentTenantId;
  const lead = await createLead(ownerA, tenant, true);
  const noConsentLead = await createLead(ownerA, tenant, false);

  const anonymous = await app.inject({ method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/send-email`, payload: {} });
  assert.equal(anonymous.statusCode, 401, anonymous.body);
  const viewerDenied = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/send-email`,
    headers: headers(viewer, tenant, 'lead-viewer-email-001'), payload: {},
  });
  assert.equal(viewerDenied.statusCode, 403, viewerDenied.body);
  const missingKey = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/send-email`, headers: headers(ownerA, tenant), payload: {},
  });
  assert.equal(missingKey.statusCode, 400, missingKey.body);
  assert.equal(missingKey.json().code, 'IDEMPOTENCY_KEY_REQUIRED');
  const clientDestination = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/send-email`,
    headers: headers(ownerA, tenant, 'lead-client-destination-001'), payload: { destination: 'attacker@example.com' },
  });
  assert.equal(clientDestination.statusCode, 400, clientDestination.body);
  assert.equal(clientDestination.json().code, 'FIELD_NOT_ALLOWED');
  const foreign = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/send-email`,
    headers: headers(ownerB, ownerB.currentTenantId, 'lead-foreign-email-001'), payload: {},
  });
  assert.equal(foreign.statusCode, 404, foreign.body);

  const emailKey = 'lead-email-message-001';
  const email = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/send-email`,
    headers: headers(ownerA, tenant, emailKey), payload: { subject: 'Your service request' },
  });
  assert.equal(email.statusCode, 202, email.body);
  assert.equal(email.json().status, 'queued');
  const emailReplay = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/send-email`,
    headers: headers(ownerA, tenant, emailKey), payload: { subject: 'Your service request' },
  });
  assert.equal(emailReplay.statusCode, 200, emailReplay.body);
  assert.equal(emailReplay.json().duplicate, true);
  const emailDrift = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/send-email`,
    headers: headers(ownerA, tenant, emailKey), payload: { subject: 'Changed subject' },
  });
  assert.equal(emailDrift.statusCode, 409, emailDrift.body);
  assert.equal(emailDrift.json().code, 'IDEMPOTENCY_KEY_REUSE');

  const consentDenied = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${noConsentLead.id}/send-sms`,
    headers: headers(ownerA, tenant, 'lead-sms-no-consent-001'), payload: {},
  });
  assert.equal(consentDenied.statusCode, 409, consentDenied.body);
  assert.equal(consentDenied.json().code, 'LEAD_SMS_CONSENT_REQUIRED');
  const smsKey = 'lead-sms-message-001';
  const sms = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/send-sms`,
    headers: headers(ownerA, tenant, smsKey), payload: { template: 'Hi {name}, we are following up about {service}.' },
  });
  assert.equal(sms.statusCode, 202, sms.body);

  const rows = await db.execute(sql`
    SELECT channel, destination, subject, body, idempotency_key, context_json
    FROM shared_outbox_messages
    WHERE tenant_id = ${tenant} AND idempotency_key IN (${emailKey}, ${smsKey})
    ORDER BY channel
  `);
  assert.equal(rows.rows.length, 2);
  const queuedEmail = rows.rows.find(row => row.channel === 'email') as Record<string, any>;
  const queuedSms = rows.rows.find(row => row.channel === 'sms') as Record<string, any>;
  assert.equal(queuedEmail.destination, 'messaging-lead@example.com');
  assert.match(String(queuedEmail.body), /Messaging Consent Lead/);
  assert.equal(queuedSms.destination, '+15555550199');
  assert.match(String(queuedSms.body), /Panel repair/);
  assert.match(String(queuedSms.body), /STOP/i);
  assert.equal(queuedSms.context_json.entityId, lead.id);
  assert.equal(JSON.stringify(queuedSms.context_json).includes('destination'), false);
  const events = await db.select().from(activityFeed).where(eq(activityFeed.tenantId, tenant));
  const consentEvent = events.find(row => row.action === 'created' && row.entityId === lead.id);
  assert.equal((consentEvent?.metadata as Record<string, unknown> | null)?.consentToSms, true);
  assert.equal(events.filter(row => row.action === 'message_queued' && row.entityId === lead.id).length, 3);
});
