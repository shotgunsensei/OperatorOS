process.env.SESSION_SECRET ||= 'operatoros-techdeck-phase26-test-v1';
process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { directoryOrganizations, directorySites, modules, tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let owner: any;
let portalUser: any;
let foreignOwner: any;
let moduleRow: any;
let moduleCreated = false;
let organization: any;
let site: any;
let signToken: typeof import('../src/lib/auth.js').signToken;

function actorHeaders(actor: any, tenantId: string, extra: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${signToken({ userId: actor.id, email: actor.email, role: actor.role, tokenVersion: actor.tokenVersion, sessionType: 'platform' })}`,
    'x-tenant-id': tenantId,
    ...extra,
  };
}

async function inject(method: string, url: string, actor: any, payload?: unknown, extraHeaders: Record<string, string> = {}) {
  return app.inject({
    method, url,
    headers: actorHeaders(actor, actor === foreignOwner ? foreignOwner.currentTenantId : owner.currentTenantId, extraHeaders),
    ...(payload === undefined ? {} : { payload }),
  });
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  owner = await createTestUser();
  portalUser = await createTestUser();
  foreignOwner = await createTestUser();
  [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'techdeck')).limit(1);
  if (!moduleRow) { moduleRow = await createTestModule('techdeck'); moduleCreated = true; }
  await db.insert(tenantUsers).values({ tenantId: owner.currentTenantId, userId: portalUser.id, role: 'member' });
  await db.insert(tenantModules).values([
    { tenantId: owner.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: foreignOwner.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUserModuleAccess).values({ tenantId: owner.currentTenantId, userId: portalUser.id, moduleId: moduleRow.id, accessLevel: 'user' });
  [organization] = await db.insert(directoryOrganizations).values({
    tenantId: owner.currentTenantId, name: 'Phase 26 Managed Client', normalizedName: 'phase 26 managed client', type: 'client',
    createdByUserId: owner.id, updatedByUserId: owner.id,
  }).returning();
  [site] = await db.insert(directorySites).values({
    tenantId: owner.currentTenantId, organizationId: organization.id, name: 'Primary Site', normalizedName: 'primary site',
    createdByUserId: owner.id, updatedByUserId: owner.id,
  }).returning();
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerModuleShellRoutes } = await import('../src/routes/module-shell-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerModuleShellRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (owner) {
    const tenantId = owner.currentTenantId;
    const literalTables = [
      'techdeck_evidence_file_links', 'techdeck_intake_audit_events', 'techdeck_intake_files', 'techdeck_intake_requests',
      'techdeck_intake_spaces', 'techdeck_intake_policies', 'techdeck_status_subscriptions',
      'techdeck_status_incident_updates', 'techdeck_status_incidents', 'techdeck_status_components', 'techdeck_status_pages',
      'techdeck_license_activations', 'techdeck_license_keys', 'techdeck_license_products',
      'techdeck_appointments', 'techdeck_portal_assignments',
    ];
    for (const table of literalTables) await db.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id = '${tenantId.replaceAll("'", "''")}'`));
    const rateBuckets = ['license:127.0.0.1', 'intake-view:127.0.0.1', 'intake-upload:127.0.0.1', 'intake-password:127.0.0.1']
      .map(value => createHash('sha256').update(value).digest('hex'));
    await db.execute(sql`DELETE FROM techdeck_license_rate_limits WHERE bucket_hash IN (${sql.join(rateBuckets.map(value => sql`${value}`), sql`,`)})`);
    await db.execute(sql`DELETE FROM techdeck_intake_rate_limits WHERE bucket_hash IN (${sql.join(rateBuckets.map(value => sql`${value}`), sql`,`)})`);
    const nativeTables = ['techdeck_document_links', 'techdeck_document_revisions', 'techdeck_evidence', 'techdeck_reports', 'techdeck_time_entries', 'techdeck_ticket_comments', 'techdeck_configuration_relationships', 'techdeck_documents', 'techdeck_document_folders', 'techdeck_tickets', 'techdeck_assets', 'activity_feed'];
    for (const table of nativeTables) await db.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id = '${tenantId.replaceAll("'", "''")}'`));
    if (site) await db.delete(directorySites).where(eq(directorySites.id, site.id));
    if (organization) await db.delete(directoryOrganizations).where(eq(directoryOrganizations.id, organization.id));
  }
  if (moduleRow && owner && foreignOwner) {
    const tenantIds = [owner.currentTenantId, foreignOwner.currentTenantId];
    await db.delete(tenantUserModuleAccess).where(and(eq(tenantUserModuleAccess.moduleId, moduleRow.id), inArray(tenantUserModuleAccess.tenantId, tenantIds)));
    await db.delete(tenantModules).where(and(eq(tenantModules.moduleId, moduleRow.id), inArray(tenantModules.tenantId, tenantIds)));
  }
  for (const actor of [portalUser, owner, foreignOwner]) if (actor) await cleanupUser(actor.id);
  if (moduleRow && moduleCreated) await cleanupModule(moduleRow.id);
});

test('Phase 26 literal workflows preserve source outcomes behind tenant, scope, and abuse controls', async () => {
  const suffix = randomBytes(5).toString('hex');
  const appointment = await inject('POST', '/v1/modules/techdeck/appointments', owner, {
    title: 'Quarterly network review', startsAt: '2026-09-01T14:00:00.000Z', endsAt: '2026-09-01T15:00:00.000Z',
    directoryOrganizationId: organization.id, directorySiteId: site.id,
  });
  assert.equal(appointment.statusCode, 201, appointment.body);

  const recurring = await inject('POST', '/v1/modules/techdeck/recurring-tickets', owner, {
    name: `Daily managed check ${suffix}`, title: 'Review managed infrastructure health', priority: 'medium',
    directoryOrganizationId: organization.id, directorySiteId: site.id, intervalDays: 1,
    nextRunAt: new Date(Date.now() - 1_000).toISOString(),
  });
  assert.equal(recurring.statusCode, 201, recurring.body);
  const { enqueueDueSchedules } = await import('../src/lib/shared-schedules-exports.js');
  const { processSharedJobBatch } = await import('../src/lib/shared-background-jobs.js');
  assert.ok(await enqueueDueSchedules({ limit: 20 }) >= 1);
  assert.ok(await processSharedJobBatch({ workerId: `phase26-schedule-${suffix}`, limit: 20 }) >= 1);
  const recurringTicket = await db.execute(sql`SELECT id FROM techdeck_tickets WHERE tenant_id=${owner.currentTenantId} AND title='Review managed infrastructure health' LIMIT 1`);
  assert.equal(recurringTicket.rows.length, 1);

  const assignment = await inject('POST', '/v1/modules/techdeck/portal-assignments', owner, {
    userId: portalUser.id, directoryOrganizationId: organization.id, directorySiteId: site.id,
    canCreateTickets: true, canComment: true, canViewEvidence: true,
  });
  assert.equal(assignment.statusCode, 201, assignment.body);
  const portal = await inject('GET', '/v1/modules/techdeck/portal/me', portalUser);
  assert.equal(portal.statusCode, 200, portal.body);
  assert.equal(portal.json().assignments.length, 1);
  const portalTicket = await inject('POST', '/v1/modules/techdeck/portal/tickets', portalUser, {
    title: 'Client-visible printer outage', description: 'The assigned site printer is unavailable.', priority: 'high',
    directoryOrganizationId: organization.id, directorySiteId: site.id,
  });
  assert.equal(portalTicket.statusCode, 201, portalTicket.body);
  const portalComment = await inject('POST', `/v1/modules/techdeck/portal/tickets/${portalTicket.json().id}/comments`, portalUser, { body: 'Client confirms the issue remains active.' });
  assert.equal(portalComment.statusCode, 201, portalComment.body);

  const product = await inject('POST', '/v1/modules/techdeck/license/products', owner, { name: 'TechDeck Agent', slug: `techdeck-agent-${suffix}`, description: 'Managed endpoint license' });
  assert.equal(product.statusCode, 201, product.body);
  const issued = await inject('POST', `/v1/modules/techdeck/license/products/${product.json().id}/keys`, owner, { label: 'Primary endpoint', maxActivations: 1 });
  assert.equal(issued.statusCode, 201, issued.body);
  assert.match(issued.json().rawKey, /^tdk_[A-Za-z0-9_-]+$/);
  const validated = await app.inject({ method: 'POST', url: '/v1/public/techdeck/license/validate', payload: { key: issued.json().rawKey, deviceFingerprint: 'phase26-device-a' } });
  assert.equal(validated.statusCode, 200, validated.body);
  assert.equal(validated.json().valid, true);
  const overLimit = await app.inject({ method: 'POST', url: '/v1/public/techdeck/license/validate', payload: { key: issued.json().rawKey, deviceFingerprint: 'phase26-device-b' } });
  assert.equal(overLimit.json().code, 'ACTIVATION_LIMIT_REACHED');
  assert.equal((await inject('POST', `/v1/modules/techdeck/license/keys/${issued.json().key.id}/revoke`, owner)).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/public/techdeck/license/validate', payload: { key: issued.json().rawKey, deviceFingerprint: 'phase26-device-a' } })).json().valid, false);

  const statusPage = await inject('POST', '/v1/modules/techdeck/status/pages', owner, { title: 'Managed services status', publicSlug: `phase26-${suffix}`, description: 'Current managed-service availability.', public: true });
  assert.equal(statusPage.statusCode, 201, statusPage.body);
  const component = await inject('POST', `/v1/modules/techdeck/status/pages/${statusPage.json().id}/components`, owner, { name: 'Remote support', status: 'operational' });
  assert.equal(component.statusCode, 201, component.body);
  const incident = await inject('POST', `/v1/modules/techdeck/status/pages/${statusPage.json().id}/incidents`, owner, { title: 'Elevated latency', description: 'Investigating elevated response time.', severity: 'minor' });
  assert.equal(incident.statusCode, 201, incident.body);
  const resolved = await inject('PATCH', `/v1/modules/techdeck/status/incidents/${incident.json().id}`, owner, { expectedVersion: incident.json().version, status: 'resolved', message: 'Service response returned to normal.' });
  assert.equal(resolved.statusCode, 200, resolved.body);
  const publicStatus = await app.inject({ method: 'GET', url: `/v1/public/techdeck/status/phase26-${suffix}` });
  assert.equal(publicStatus.statusCode, 200, publicStatus.body);
  assert.equal(publicStatus.json().components.length, 1);
  assert.equal(publicStatus.json().incidents[0].updates[0].status, 'resolved');

  const tokenResponse = await inject('POST', '/v1/modules/techdeck/api-tokens', owner, { identityName: `Phase 26 client ${suffix}`, tokenName: 'Read automation', scopes: ['techdeck:read'] });
  assert.equal(tokenResponse.statusCode, 201, tokenResponse.body);
  assert.match(tokenResponse.json().rawToken, /^oos_/);
  const headless = await app.inject({ method: 'GET', url: '/v1/headless/techdeck/tickets', headers: { authorization: `Bearer ${tokenResponse.json().rawToken}` } });
  assert.equal(headless.statusCode, 200, headless.body);
  assert.ok(headless.json().tickets.some((row: any) => row.id === portalTicket.json().id));
  assert.equal((await inject('DELETE', `/v1/modules/techdeck/api-tokens/${tokenResponse.json().token.id}`, owner)).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/headless/techdeck/tickets', headers: { authorization: `Bearer ${tokenResponse.json().rawToken}` } })).statusCode, 401);

  const unsafeWebhook = await inject('POST', '/v1/modules/techdeck/webhooks', owner, { name: 'Blocked loopback', url: 'http://127.0.0.1/hook', secret: 'phase26-signing-secret-value', eventTypes: ['techdeck.status.incident_updated'] });
  assert.equal(unsafeWebhook.statusCode, 400, unsafeWebhook.body);
  assert.equal(unsafeWebhook.json().code, 'WEBHOOK_URL_UNSAFE');

  const space = await inject('POST', '/v1/modules/techdeck/intake/spaces', owner, { name: 'Client evidence', slug: `client-evidence-${suffix}`, allowedFileTypes: ['text/plain'], maxFileSizeBytes: 1024 * 1024, retentionDays: 30, externalUploadsEnabled: true });
  assert.equal(space.statusCode, 201, space.body);
  const intake = await inject('POST', '/v1/modules/techdeck/intake/requests', owner, { spaceId: space.json().id, title: 'Upload diagnostic notes', maxUploads: 2, oneTimeUse: false });
  assert.equal(intake.statusCode, 201, intake.body);
  const intakeView = await app.inject({ method: 'GET', url: `/v1/public/techdeck/intake/${intake.json().rawToken}` });
  assert.equal(intakeView.statusCode, 200, intakeView.body);
  const intakePayload = { fileName: 'diagnostic.txt', mimeType: 'text/plain', contentBase64: Buffer.from('Phase 26 diagnostic evidence').toString('base64') };
  const intakeUpload = await app.inject({ method: 'POST', url: `/v1/public/techdeck/intake/${intake.json().rawToken}/upload`, payload: intakePayload });
  assert.equal(intakeUpload.statusCode, 201, intakeUpload.body);
  assert.match(intakeUpload.json().file.sha256, /^[0-9a-f]{64}$/);
  const intakeDuplicate = await app.inject({ method: 'POST', url: `/v1/public/techdeck/intake/${intake.json().rawToken}/upload`, payload: intakePayload });
  assert.equal(intakeDuplicate.statusCode, 200, intakeDuplicate.body);
  assert.equal(intakeDuplicate.json().duplicate, true);

  const evidence = await inject('POST', '/v1/modules/techdeck/evidence', owner, { title: 'Phase 26 evidence', evidenceType: 'test_result', summary: 'Literal locker acceptance evidence.' });
  assert.equal(evidence.statusCode, 201, evidence.body);
  const evidenceFile = await inject('POST', `/v1/modules/techdeck/evidence/${evidence.json().id}/files`, owner, intakePayload);
  assert.equal(evidenceFile.statusCode, 201, evidenceFile.body);
  const evidenceDuplicate = await inject('POST', `/v1/modules/techdeck/evidence/${evidence.json().id}/files`, owner, intakePayload);
  assert.equal(evidenceDuplicate.statusCode, 201, evidenceDuplicate.body);
  assert.equal(evidenceDuplicate.json().duplicate, true);

  const exportRequest = await inject('POST', '/v1/modules/techdeck/compliance-packets', owner, { filters: {} }, { 'idempotency-key': `phase26-export-${suffix}` });
  assert.equal(exportRequest.statusCode, 202, exportRequest.body);
  assert.ok(await processSharedJobBatch({ workerId: `phase26-export-${suffix}`, limit: 20 }) >= 1);
  assert.ok(await processSharedJobBatch({ workerId: `phase26-export-scan-${suffix}`, limit: 20 }) >= 1);
  const exports = await inject('GET', '/v1/modules/techdeck/compliance-packets', owner);
  assert.equal(exports.statusCode, 200, exports.body);
  assert.equal(exports.json().exports[0].status, 'completed');
  assert.ok(['clean', 'unavailable'].includes(exports.json().exports[0].attachment_scan_status));
  const packetId = exports.json().exports[0].id;
  const packetDownload = await inject('GET', `/v1/modules/techdeck/compliance-packets/${packetId}/download`, portalUser);
  assert.equal(packetDownload.statusCode, 200, packetDownload.body);
  assert.equal(packetDownload.headers['content-type'], 'application/zip');
  assert.match(String(packetDownload.headers['content-disposition']), /^attachment; filename="techdeck-compliance-[a-z0-9]+\.zip"$/);
  assert.equal(packetDownload.rawPayload.subarray(0, 2).toString('ascii'), 'PK');
  const foreignPacketDownload = await inject('GET', `/v1/modules/techdeck/compliance-packets/${packetId}/download`, foreignOwner);
  assert.equal(foreignPacketDownload.statusCode, 404, foreignPacketDownload.body);
  const { buildTechDeckCompliancePacket } = await import('../src/lib/techdeck-compliance-export.js');
  const firstPacket = await buildTechDeckCompliancePacket({ tenantId: owner.currentTenantId, moduleId: moduleRow.id, filters: {} });
  const secondPacket = await buildTechDeckCompliancePacket({ tenantId: owner.currentTenantId, moduleId: moduleRow.id, filters: {} });
  assert.equal(firstPacket.mimeType, 'application/zip');
  assert.equal(firstPacket.content.subarray(0, 2).toString('ascii'), 'PK');
  assert.equal(createHash('sha256').update(firstPacket.content).digest('hex'), createHash('sha256').update(secondPacket.content).digest('hex'));

  const literalWorkspace = await inject('GET', '/v1/modules/techdeck/literal-workspace', owner);
  assert.equal(literalWorkspace.statusCode, 200, literalWorkspace.body);
  assert.equal(literalWorkspace.json().appointments.length, 1);
  assert.equal(literalWorkspace.json().portalAssignments.length, 1);
  assert.equal(literalWorkspace.json().licenseProducts.length, 1);
  assert.equal(literalWorkspace.json().statusPages.length, 1);
  assert.equal(literalWorkspace.json().intakeSpaces.length, 1);
  const foreignWorkspace = await inject('GET', '/v1/modules/techdeck/literal-workspace', foreignOwner);
  assert.equal(foreignWorkspace.statusCode, 200, foreignWorkspace.body);
  assert.equal(foreignWorkspace.json().appointments.length, 0);
  assert.equal(foreignWorkspace.json().portalAssignments.length, 0);
});
