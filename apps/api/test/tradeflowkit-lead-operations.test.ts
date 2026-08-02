process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-lead-operations-test-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
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
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
    ...(key ? { 'idempotency-key': key } : {}),
  };
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();
  moduleRow = await createTestModule('tradeflowkit');
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'viewer' });
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId,
    userId: viewer.id,
    moduleId: moduleRow.id,
    accessLevel: 'viewer',
  });
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  app = Fastify();
  await app.register(cookie);
  const { registerModuleShellRoutes } = await import('../src/routes/module-shell-routes.js');
  await registerModuleShellRoutes(app);
  await app.ready();
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

test('lead operations persist versioned tenant settings and schedule an actionable playbook', async () => {
  const tenant = ownerA.currentTenantId;
  const initialResponse = await app.inject({
    method: 'GET', url: '/v1/modules/tradeflowkit/leads/settings', headers: headers(ownerA, tenant),
  });
  assert.equal(initialResponse.statusCode, 200, initialResponse.body);
  const initial = initialResponse.json();
  assert.equal(initial.settings.followUpEnabled, false);
  assert.equal(initial.settings.autoRespond, false);
  assert.equal(initial.settings.dryRun, true);
  assert.equal(initial.captureForm.publicIntakeEnabled, false);
  assert.equal(initial.publicIntake.enabled, false);
  assert.equal(initial.templates.length, 7);

  const viewerDenied = await app.inject({
    method: 'PATCH', url: '/v1/modules/tradeflowkit/leads/settings', headers: headers(viewer, tenant),
    payload: { expectedVersion: initial.settings.version, followUpEnabled: true },
  });
  assert.equal(viewerDenied.statusCode, 403, viewerDenied.body);

  const appliedResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads/settings/apply-template', headers: headers(ownerA, tenant),
    payload: {
      templateKey: 'hvac',
      expectedVersion: initial.settings.version,
      expectedCaptureFormVersion: initial.captureForm.version,
    },
  });
  assert.equal(appliedResponse.statusCode, 200, appliedResponse.body);
  const applied = appliedResponse.json();
  assert.equal(applied.settings.tradeTemplate, 'hvac');
  assert.equal(applied.settings.followUpEnabled, true);
  assert.equal(applied.settings.followupSequence.length, 3);
  assert.equal(applied.captureForm.publicIntakeEnabled, false);

  const staleCapture = await app.inject({
    method: 'PATCH', url: '/v1/modules/tradeflowkit/leads/settings', headers: headers(ownerA, tenant),
    payload: {
      expectedVersion: applied.settings.version,
      expectedCaptureFormVersion: initial.captureForm.version,
      serviceArea: 'Must not partially commit',
      captureForm: { name: 'Stale capture attempt' },
    },
  });
  assert.equal(staleCapture.statusCode, 409, staleCapture.body);
  assert.equal(staleCapture.json().code, 'LEAD_CAPTURE_VERSION_CONFLICT');
  const afterCaptureConflict = await app.inject({
    method: 'GET', url: '/v1/modules/tradeflowkit/leads/settings', headers: headers(ownerA, tenant),
  });
  assert.equal(afterCaptureConflict.statusCode, 200, afterCaptureConflict.body);
  assert.equal(afterCaptureConflict.json().settings.version, applied.settings.version);
  assert.notEqual(afterCaptureConflict.json().settings.serviceArea, 'Must not partially commit');
  assert.equal(afterCaptureConflict.json().captureForm.version, applied.captureForm.version);

  const staleTemplate = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads/settings/apply-template', headers: headers(ownerA, tenant),
    payload: {
      templateKey: 'plumbing',
      expectedVersion: initial.settings.version,
      expectedCaptureFormVersion: initial.captureForm.version,
    },
  });
  assert.equal(staleTemplate.statusCode, 409, staleTemplate.body);
  assert.equal(staleTemplate.json().code, 'LEAD_SETTINGS_VERSION_CONFLICT');

  const leadResponse = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads', headers: headers(ownerA, tenant),
    payload: {
      name: 'Playbook Lead',
      email: 'playbook-lead@example.com',
      phone: '+15555550191',
      serviceType: 'Emergency repair',
      consentToSms: false,
    },
  });
  assert.equal(leadResponse.statusCode, 201, leadResponse.body);
  const lead = leadResponse.json();

  const followupResponse = await app.inject({
    method: 'GET', url: `/v1/modules/tradeflowkit/leads/${lead.id}/followups`, headers: headers(viewer, tenant),
  });
  assert.equal(followupResponse.statusCode, 200, followupResponse.body);
  const followups = followupResponse.json().followups;
  assert.equal(followups.length, 3);
  assert.deepEqual(followups.map((row: any) => row.stepNumber), [1, 2, 3]);
  assert.equal(followups[0].channel, 'email');
  assert.equal('messageTemplate' in followups[0], false);

  const foreignFollowups = await app.inject({
    method: 'GET', url: `/v1/modules/tradeflowkit/leads/${lead.id}/followups`, headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreignFollowups.statusCode, 404, foreignFollowups.body);

  const queueKey = 'lead-followup-queue-integration-001';
  const queuedResponse = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/followups/${followups[0].id}/queue`,
    headers: headers(ownerA, tenant, queueKey), payload: { expectedVersion: followups[0].version },
  });
  assert.equal(queuedResponse.statusCode, 202, queuedResponse.body);
  assert.equal(queuedResponse.json().followup.status, 'queued');
  const replay = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/followups/${followups[0].id}/queue`,
    headers: headers(ownerA, tenant, queueKey), payload: { expectedVersion: followups[0].version },
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().duplicate, true);

  const smsDisabled = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/followups/${followups[1].id}/queue`,
    headers: headers(ownerA, tenant, 'lead-followup-sms-disabled-001'), payload: { expectedVersion: followups[1].version },
  });
  assert.equal(smsDisabled.statusCode, 409, smsDisabled.body);
  assert.equal(smsDisabled.json().code, 'LEAD_FOLLOWUP_CHANNEL_DISABLED');

  const completed = await app.inject({
    method: 'POST', url: `/v1/modules/tradeflowkit/leads/${lead.id}/followups/${followups[0].id}/complete`,
    headers: headers(ownerA, tenant), payload: { expectedVersion: queuedResponse.json().followup.version },
  });
  assert.equal(completed.statusCode, 200, completed.body);
  assert.equal(completed.json().status, 'completed');

  const outbox = await db.execute(sql`
    SELECT destination, body, context_json FROM shared_outbox_messages
    WHERE tenant_id = ${tenant} AND idempotency_key = ${queueKey}
  `);
  assert.equal(outbox.rows.length, 1);
  assert.equal(outbox.rows[0].destination, 'playbook-lead@example.com');
  assert.match(String(outbox.rows[0].body), /Playbook Lead/);
  assert.equal(JSON.stringify(outbox.rows[0].context_json).includes('playbook-lead@example.com'), false);

  const patchedResponse = await app.inject({
    method: 'PATCH', url: '/v1/modules/tradeflowkit/leads/settings', headers: headers(ownerA, tenant),
    payload: {
      expectedVersion: applied.settings.version,
      expectedCaptureFormVersion: applied.captureForm.version,
      smsEnabled: true,
      serviceArea: 'North service district',
      captureForm: {
        name: 'HVAC deployment profile',
        sourceLabel: 'website',
        defaultService: 'Emergency repair',
        successMessage: 'Request received. An operator will follow up.',
      },
    },
  });
  assert.equal(patchedResponse.statusCode, 200, patchedResponse.body);
  const patched = patchedResponse.json();
  assert.equal(patched.settings.smsEnabled, true);
  assert.equal(patched.settings.serviceArea, 'North service district');
  assert.equal(patched.captureForm.name, 'HVAC deployment profile');
  assert.equal(patched.captureForm.publicIntakeEnabled, false);
});

test('adapter validation and test email are replay-safe, sanitized, and server-destination only', async () => {
  const tenant = ownerA.currentTenantId;
  const settingsResponse = await app.inject({
    method: 'GET', url: '/v1/modules/tradeflowkit/leads/settings', headers: headers(ownerA, tenant),
  });
  assert.equal(settingsResponse.statusCode, 200, settingsResponse.body);
  const settings = settingsResponse.json().settings;

  const adaptersResponse = await app.inject({
    method: 'GET', url: '/v1/modules/tradeflowkit/leads/source-adapters', headers: headers(viewer, tenant),
  });
  assert.equal(adaptersResponse.statusCode, 200, adaptersResponse.body);
  assert.equal(adaptersResponse.json().adapters.length, 3);
  assert.equal(adaptersResponse.json().adapters.every((row: any) => row.publicIngress === false), true);

  const validationKey = 'lead-adapter-validation-integration-001';
  const sample = { name: 'Private Validation Value', email: 'private-validation@example.com', serviceType: 'Contract check', consentToSms: false };
  const validated = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads/source-adapters/generic-json/validate',
    headers: headers(ownerA, tenant, validationKey), payload: { sample },
  });
  assert.equal(validated.statusCode, 200, validated.body);
  assert.equal(validated.json().valid, true);
  const validationReplay = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads/source-adapters/generic-json/validate',
    headers: headers(ownerA, tenant, validationKey), payload: { sample },
  });
  assert.equal(validationReplay.statusCode, 200, validationReplay.body);
  assert.deepEqual(validationReplay.json(), validated.json());
  const validationDrift = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads/source-adapters/generic-json/validate',
    headers: headers(ownerA, tenant, validationKey), payload: { sample: { ...sample, name: 'Changed' } },
  });
  assert.equal(validationDrift.statusCode, 409, validationDrift.body);
  assert.equal(validationDrift.json().code, 'IDEMPOTENCY_KEY_REUSE');

  const eventsResponse = await app.inject({
    method: 'GET', url: '/v1/modules/tradeflowkit/leads/source-events?limit=20', headers: headers(viewer, tenant),
  });
  assert.equal(eventsResponse.statusCode, 200, eventsResponse.body);
  const validationEvent = eventsResponse.json().events.find((row: any) => row.adapterKey === 'generic-json');
  assert.ok(validationEvent);
  assert.deepEqual(validationEvent.metadata.acceptedFields, ['consentToSms', 'email', 'name', 'serviceType']);
  assert.equal(JSON.stringify(validationEvent).includes('Private Validation Value'), false);
  assert.equal(JSON.stringify(validationEvent).includes('private-validation@example.com'), false);

  const clientDestinationDenied = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads/test-message',
    headers: headers(ownerA, tenant, 'lead-test-client-destination-001'),
    payload: { channel: 'email', confirmDelivery: true, expectedVersion: settings.version, destination: 'attacker@example.com' },
  });
  assert.equal(clientDestinationDenied.statusCode, 400, clientDestinationDenied.body);
  assert.equal(clientDestinationDenied.json().code, 'FIELD_NOT_ALLOWED');
  const viewerTestDenied = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads/test-message',
    headers: headers(viewer, tenant, 'lead-test-viewer-denied-001'),
    payload: { channel: 'email', confirmDelivery: true, expectedVersion: settings.version },
  });
  assert.equal(viewerTestDenied.statusCode, 403, viewerTestDenied.body);

  const testKey = 'lead-test-message-integration-001';
  const testEmail = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads/test-message', headers: headers(ownerA, tenant, testKey),
    payload: { channel: 'email', confirmDelivery: true, expectedVersion: settings.version },
  });
  assert.equal(testEmail.statusCode, 202, testEmail.body);
  const testReplay = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads/test-message', headers: headers(ownerA, tenant, testKey),
    payload: { channel: 'email', confirmDelivery: true, expectedVersion: settings.version },
  });
  assert.equal(testReplay.statusCode, 200, testReplay.body);
  assert.equal(testReplay.json().duplicate, true);
  const testOutbox = await db.execute(sql`
    SELECT destination, context_json FROM shared_outbox_messages
    WHERE tenant_id = ${tenant} AND idempotency_key = ${testKey}
  `);
  assert.equal(testOutbox.rows.length, 1);
  assert.equal(testOutbox.rows[0].destination, ownerA.email);
  assert.equal(JSON.stringify(testOutbox.rows[0].context_json).includes(ownerA.email), false);

  const publicCapture = await app.inject({
    method: 'POST', url: '/v1/modules/tradeflowkit/leads/public/capture',
    payload: { name: 'Anonymous lead' },
  });
  assert.equal(publicCapture.statusCode, 404, publicCapture.body);
});
