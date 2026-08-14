process.env.SESSION_SECRET ||= 'operatoros-tradeflowkit-public-intake-test-v1';
process.env.TRADEFLOWKIT_PUBLIC_INTAKE_HMAC_SECRET ||= 'tradeflowkit-public-intake-test-secret-at-least-32-bytes';

import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { tenantModules, tradeflowkitLeads } from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let owner: any;
let moduleRow: any;
let signToken: typeof import('../src/lib/auth.js').signToken;

function authHeaders(key?: string) {
  return {
    authorization: `Bearer ${signToken({
      userId: owner.id,
      email: owner.email,
      role: owner.role,
      tokenVersion: owner.tokenVersion,
      sessionType: 'platform',
    })}`,
    'x-tenant-id': owner.currentTenantId,
    ...(key ? { 'idempotency-key': key } : {}),
  };
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  owner = await createTestUser();
  moduleRow = await createTestModule('tradeflowkit');
  await db.insert(tenantModules).values({
    tenantId: owner.currentTenantId,
    moduleId: moduleRow.id,
    status: 'enabled',
    source: 'admin',
    allowAllMembers: true,
  });
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  app = Fastify();
  await app.register(cookie);
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request: any, body: Buffer, done: any) => {
    request.rawBody = body;
    try { done(null, body.length ? JSON.parse(body.toString('utf8')) : undefined); } catch (error) { done(error); }
  });
  const { registerModuleShellRoutes } = await import('../src/routes/module-shell-routes.js');
  await registerModuleShellRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (moduleRow) {
    try { await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id)); } catch {}
  }
  if (owner) await cleanupUser(owner.id);
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('public intake is admin-enabled, consent-bound, replay-safe, and supports signed adapters', async () => {
  const settingsResponse = await app.inject({
    method: 'GET',
    url: '/v1/modules/tradeflowkit/leads/settings',
    headers: authHeaders(),
  });
  assert.equal(settingsResponse.statusCode, 200, settingsResponse.body);
  const capture = settingsResponse.json().captureForm;

  const configuredResponse = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/tradeflowkit/leads/capture-form/${capture.id}`,
    headers: authHeaders(),
    payload: {
      expectedVersion: capture.version,
      publicIntakeEnabled: true,
      privacyNoticeUrl: 'https://example.test/privacy',
      consentText: 'I agree that this business may process my request under the linked privacy notice.',
      consentVersion: 'privacy-2026-08',
      allowedAdapterKeys: ['n8n'],
      rotateToken: true,
      revealAdapterSecrets: true,
    },
  });
  assert.equal(configuredResponse.statusCode, 200, configuredResponse.body);
  const configured = configuredResponse.json();
  assert.match(configured.publicToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(configured.adapterSecrets.n8n, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(configured.captureForm.publicTokenHash, undefined);

  const publicUrl = `/v1/public/tradeflowkit/leads/capture/${configured.publicToken}`;
  const formResponse = await app.inject({ method: 'GET', url: publicUrl });
  assert.equal(formResponse.statusCode, 200, formResponse.body);
  assert.equal(formResponse.json().consentVersion, 'privacy-2026-08');
  assert.equal(formResponse.headers['cache-control'], 'no-store');

  const payload = {
    name: 'Public Customer',
    email: 'public.customer@example.test',
    serviceType: 'Repair estimate',
    description: 'Please contact me about the requested repair.',
    privacyConsent: true,
    consentVersion: 'privacy-2026-08',
    consentToSms: false,
    website: '',
  };
  const staleConsent = await app.inject({
    method: 'POST',
    url: publicUrl,
    headers: { 'idempotency-key': 'public-intake-stale-v1' },
    payload: { ...payload, consentVersion: 'old-version' },
  });
  assert.equal(staleConsent.statusCode, 409, staleConsent.body);

  const accepted = await app.inject({
    method: 'POST',
    url: publicUrl,
    headers: { 'idempotency-key': 'public-intake-accepted-v1' },
    payload,
  });
  assert.equal(accepted.statusCode, 201, accepted.body);
  const acceptedBody = accepted.json();
  const [stored] = await db.select().from(tradeflowkitLeads).where(and(
    eq(tradeflowkitLeads.id, acceptedBody.submissionId),
    eq(tradeflowkitLeads.tenantId, owner.currentTenantId),
  ));
  assert.equal(stored.createdByUserId, null);
  assert.equal(stored.source, 'public_form');
  assert.equal(stored.captureFormId, capture.id);
  assert.equal(stored.intakeConsentVersion, 'privacy-2026-08');

  const replay = await app.inject({
    method: 'POST',
    url: publicUrl,
    headers: { 'idempotency-key': 'public-intake-accepted-v1' },
    payload,
  });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.json().submissionId, acceptedBody.submissionId);

  const adapterPayload = { ...payload, name: 'Signed Adapter Customer' };
  const rawAdapterPayload = JSON.stringify(adapterPayload);
  const signature = createHmac('sha256', configured.adapterSecrets.n8n).update(rawAdapterPayload).digest('hex');
  const adapterUrl = `/v1/public/tradeflowkit/leads/source/${configured.publicToken}/n8n`;
  const rejectedSignature = await app.inject({
    method: 'POST', url: adapterUrl,
    headers: { 'content-type': 'application/json', 'idempotency-key': 'adapter-invalid-signature-v1', 'x-tradeflowkit-signature': 'sha256=' + '0'.repeat(64) },
    payload: rawAdapterPayload,
  });
  assert.equal(rejectedSignature.statusCode, 401, rejectedSignature.body);
  const acceptedAdapter = await app.inject({
    method: 'POST', url: adapterUrl,
    headers: { 'content-type': 'application/json', 'idempotency-key': 'adapter-valid-signature-v1', 'x-tradeflowkit-signature': `sha256=${signature}` },
    payload: rawAdapterPayload,
  });
  assert.equal(acceptedAdapter.statusCode, 201, acceptedAdapter.body);

  let saturated: any = null;
  let saturatedKey = '';
  for (let attempt = 1; attempt <= 7; attempt += 1) {
    const key = `public-intake-rate-extra-${attempt}`;
    const response = await app.inject({
      method: 'POST', url: publicUrl,
      headers: { 'idempotency-key': key },
      payload: { ...payload, name: `Rate Limit ${attempt}` },
    });
    if (response.statusCode === 429) {
      saturated = response;
      saturatedKey = key;
      break;
    }
    assert.equal(response.statusCode, 201, response.body);
  }
  assert.ok(saturated, 'the persistent client bucket must saturate within seven additional submissions');
  assert.equal(saturated.json().code, 'RATE_LIMITED');
  const saturatedClaim = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM shared_idempotency_keys
    WHERE tenant_id = ${owner.currentTenantId}
      AND scope = 'tradeflowkit.public-lead-intake.website-form.v1'
      AND idempotency_key = ${saturatedKey}
  `);
  assert.equal(Number(saturatedClaim.rows[0]?.count), 0);
});
