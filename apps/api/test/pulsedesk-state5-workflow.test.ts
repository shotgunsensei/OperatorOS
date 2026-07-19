process.env.SESSION_SECRET ||= 'operatoros-pulsedesk-state5-test-v1';
process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  directoryOrganizations,
  modules,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
} from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let member: any;
let viewer: any;
let moduleRow: any;
let moduleCreated = false;
let signToken: typeof import('../src/lib/auth.js').signToken;

function headers(actor: any, extra: Record<string, string> = {}) {
  const tenantId = actor === ownerB ? ownerB.currentTenantId : ownerA.currentTenantId;
  return {
    authorization: `Bearer ${signToken({ userId: actor.id, email: actor.email, role: actor.role, tokenVersion: actor.tokenVersion, sessionType: 'platform' })}`,
    'x-tenant-id': tenantId,
    ...extra,
  };
}

async function inject(method: string, url: string, actor: any, payload?: unknown, extraHeaders: Record<string, string> = {}) {
  return app.inject({ method, url, headers: headers(actor, extraHeaders), ...(payload === undefined ? {} : { payload }) });
}

async function buildApp() {
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerPulseDeskRoutes } = await import('../src/routes/pulsedesk-routes.js');
  const { registerPulseDeskServiceDeskRoutes } = await import('../src/routes/pulsedesk-service-desk-routes.js');
  const instance = Fastify();
  await instance.register(cookie);
  await registerPulseDeskRoutes(instance);
  await registerPulseDeskServiceDeskRoutes(instance);
  await instance.ready();
  return instance;
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  member = await createTestUser();
  viewer = await createTestUser();
  [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'pulsedesk')).limit(1);
  if (!moduleRow) { moduleRow = await createTestModule('pulsedesk'); moduleCreated = true; }
  await db.insert(tenantUsers).values([
    { tenantId: ownerA.currentTenantId, userId: member.id, role: 'member' },
    { tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'member' },
  ]);
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUserModuleAccess).values([
    { tenantId: ownerA.currentTenantId, userId: member.id, moduleId: moduleRow.id, accessLevel: 'user' },
    { tenantId: ownerA.currentTenantId, userId: viewer.id, moduleId: moduleRow.id, accessLevel: 'viewer' },
  ]);
  app = await buildApp();
});

after(async () => {
  if (app) await app.close();
  if (ownerA) {
    const tenantId = ownerA.currentTenantId;
    for (const table of ['shared_attachment_blobs', 'shared_jobs', 'shared_attachments', 'shared_outbox_messages'] as const) {
      try {
        await db.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id = '${tenantId.replaceAll("'", "''")}'`));
      } catch {}
    }
    for (const table of [
      'pulsedesk_ticket_tags', 'pulsedesk_vendor_engagements', 'pulsedesk_time_entries',
      'pulsedesk_sla_events', 'pulsedesk_ticket_assignments', 'pulsedesk_ticket_messages',
      'pulsedesk_supply_requests', 'pulsedesk_facility_requests', 'pulsedesk_request_events',
      'pulsedesk_requests', 'pulsedesk_assets', 'pulsedesk_team_members', 'pulsedesk_teams',
      'pulsedesk_queues', 'pulsedesk_ticket_options', 'pulsedesk_sla_policies',
      'pulsedesk_knowledge_articles', 'pulsedesk_saved_views', 'pulsedesk_notification_preferences',
      'pulsedesk_tags', 'pulsedesk_departments', 'pulsedesk_request_sequences',
      'pulsedesk_service_client_profiles', 'directory_site_contacts', 'directory_organization_contacts',
      'directory_contacts', 'directory_sites', 'directory_organizations', 'activity_feed',
    ] as const) {
      try {
        await db.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id = '${tenantId.replaceAll("'", "''")}'`));
      } catch {}
    }
  }
  if (moduleRow && ownerA && ownerB) {
    const tenantIds = [ownerA.currentTenantId, ownerB.currentTenantId];
    await db.delete(tenantUserModuleAccess).where(and(eq(tenantUserModuleAccess.moduleId, moduleRow.id), inArray(tenantUserModuleAccess.tenantId, tenantIds)));
    await db.delete(tenantModules).where(and(eq(tenantModules.moduleId, moduleRow.id), inArray(tenantModules.tenantId, tenantIds)));
  }
  for (const actor of [viewer, member, ownerA, ownerB]) if (actor) await cleanupUser(actor.id);
  if (moduleRow && moduleCreated) await cleanupModule(moduleRow.id);
});

test('PulseDesk completes the shared-directory service-desk workflow with privacy, role, tenant, idempotency, and restart isolation', async () => {
  const clientResponse = await inject('POST', '/v1/modules/pulsedesk/clients', ownerA, {
    name: 'Northstar Health Operations', type: 'client', facilityCategory: 'healthcare operations', phiRestricted: true,
  });
  assert.equal(clientResponse.statusCode, 201, clientResponse.body);
  const client = clientResponse.json();
  assert.equal(client.profile.phiRestricted, true);

  const siteResponse = await inject('POST', '/v1/modules/pulsedesk/facilities', ownerA, {
    organizationId: client.id, name: 'Northstar Main Facility', type: 'facility', timezone: 'America/New_York',
  });
  assert.equal(siteResponse.statusCode, 201, siteResponse.body);
  const site = siteResponse.json();

  const departmentResponse = await inject('POST', '/v1/modules/pulsedesk/departments', ownerA, {
    name: 'Facilities Operations', description: 'Operational facilities response', directoryOrganizationId: client.id, directorySiteId: site.id,
  });
  assert.equal(departmentResponse.statusCode, 201, departmentResponse.body);
  const department = departmentResponse.json();

  const contactResponse = await inject('POST', '/v1/modules/pulsedesk/contacts', ownerA, {
    organizationId: client.id, siteId: site.id, firstName: 'Alex', lastName: 'Rivera',
    email: 'alex.rivera@example.test', title: 'Operations requester', role: 'requester', isPrimary: true,
  });
  assert.equal(contactResponse.statusCode, 201, contactResponse.body);
  const contact = contactResponse.json();
  assert.equal(contact.organizationAssociation.organizationId, client.id);
  assert.equal(contact.siteAssociation.siteId, site.id);

  const queueResponse = await inject('POST', '/v1/modules/pulsedesk/queues', ownerA, { name: 'Healthcare Operations', description: 'Operational service queue' });
  assert.equal(queueResponse.statusCode, 201, queueResponse.body);
  const queue = queueResponse.json();
  const teamResponse = await inject('POST', '/v1/modules/pulsedesk/teams', ownerA, { name: 'Facilities Team', queueId: queue.id });
  assert.equal(teamResponse.statusCode, 201, teamResponse.body);
  const team = teamResponse.json();
  const teamMemberResponse = await inject('POST', `/v1/modules/pulsedesk/teams/${team.id}/members`, ownerA, { userId: member.id, lead: true });
  assert.equal(teamMemberResponse.statusCode, 201, teamMemberResponse.body);
  const slaResponse = await inject('POST', '/v1/modules/pulsedesk/sla-policies', ownerA, { name: 'Priority operations', responseMinutes: 60, resolutionMinutes: 480, atRiskPercent: 80, defaultPolicy: true });
  assert.equal(slaResponse.statusCode, 201, slaResponse.body);
  const sla = slaResponse.json();

  const assetResponse = await inject('POST', '/v1/modules/pulsedesk/assets', member, {
    assetTag: 'OPS-100', name: 'Backup refrigerator', equipmentType: 'operational_equipment',
    directoryOrganizationId: client.id, directorySiteId: site.id, departmentId: department.id,
    locationLabel: 'Facilities storage', phiAcknowledged: true,
  });
  assert.equal(assetResponse.statusCode, 201, assetResponse.body);
  const asset = assetResponse.json();
  const techDeckBoundary = await inject('POST', '/v1/modules/pulsedesk/assets', member, {
    assetTag: 'OPS-TECH', name: 'Prohibited network asset', equipmentType: 'operational_equipment',
    ipAddress: '10.0.0.5', phiAcknowledged: true,
  });
  assert.equal(techDeckBoundary.statusCode, 422, techDeckBoundary.body);
  assert.equal(techDeckBoundary.json().code, 'PULSEDESK_TECHDECK_FIELD_PROHIBITED');

  const ticketResponse = await inject('POST', '/v1/modules/pulsedesk/tickets', member, {
    summary: 'Backup refrigerator temperature alert', description: 'Equipment alarm requires an operational inspection.',
    ticketTypeKey: 'incident', category: 'medical_equipment', priority: 'high', locationLabel: 'Facilities storage',
    directoryOrganizationId: client.id, directorySiteId: site.id, requesterContactId: contact.id,
    departmentId: department.id, assetId: asset.id, queueId: queue.id, teamId: team.id, slaPolicyId: sla.id,
    isPatientImpacting: true, phiAcknowledged: true,
  });
  assert.equal(ticketResponse.statusCode, 201, ticketResponse.body);
  let ticket = ticketResponse.json();
  assert.match(ticket.humanId, /^PD-\d{6}$/);
  assert.equal(ticket.version, 1);
  assert.ok(ticket.responseDueAt);
  assert.ok(ticket.resolutionDueAt);

  const updatedResponse = await inject('PATCH', `/v1/modules/pulsedesk/tickets/${ticket.id}`, member, {
    expectedVersion: ticket.version, priority: 'critical', description: 'Equipment alarm requires immediate operational inspection.', phiAcknowledged: true,
  });
  assert.equal(updatedResponse.statusCode, 200, updatedResponse.body);
  ticket = updatedResponse.json();
  assert.equal(ticket.version, 2);
  const staleUpdate = await inject('PATCH', `/v1/modules/pulsedesk/tickets/${ticket.id}`, member, { expectedVersion: 1, priority: 'low', phiAcknowledged: true });
  assert.equal(staleUpdate.statusCode, 409, staleUpdate.body);

  const assignmentResponse = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/assignments`, ownerA, {
    expectedVersion: ticket.version, assignedToUserId: member.id, queueId: queue.id, teamId: team.id,
  });
  assert.equal(assignmentResponse.statusCode, 200, assignmentResponse.body);
  ticket = assignmentResponse.json().ticket;
  assert.equal(ticket.status, 'assigned');

  const internalMarker = 'Internal vendor triage stays private.';
  const internalNote = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/internal-notes`, member, {
    body: internalMarker, phiAcknowledged: true,
  }, { 'idempotency-key': 'phase6-internal-note-001' });
  assert.equal(internalNote.statusCode, 201, internalNote.body);
  const replyMarker = 'Facilities operations acknowledged the equipment alert.';
  const replyHeaders = { 'idempotency-key': 'phase6-requester-reply-001' };
  const requesterReply = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/replies`, ownerA, {
    body: replyMarker, phiAcknowledged: true,
  }, replyHeaders);
  assert.equal(requesterReply.statusCode, 201, requesterReply.body);
  assert.equal(requesterReply.json().duplicate, false);
  const duplicateReply = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/replies`, ownerA, {
    body: replyMarker, phiAcknowledged: true,
  }, replyHeaders);
  assert.equal(duplicateReply.statusCode, 200, duplicateReply.body);
  assert.equal(duplicateReply.json().duplicate, true);
  const outbox = await db.execute(sql`SELECT COUNT(*)::int AS count, MIN(body) AS body FROM shared_outbox_messages WHERE tenant_id = ${ownerA.currentTenantId} AND idempotency_key LIKE 'pulsedesk:reply:%'`);
  assert.equal(Number((outbox as any).rows[0].count), 1);
  assert.doesNotMatch(String((outbox as any).rows[0].body), new RegExp(replyMarker));

  const timeHeaders = { 'idempotency-key': 'phase6-time-entry-001' };
  const timeResponse = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/time-entries`, member, {
    minutes: 35, workType: 'onsite', description: 'Inspected equipment power and alarm state.', phiAcknowledged: true,
  }, timeHeaders);
  assert.equal(timeResponse.statusCode, 201, timeResponse.body);
  const duplicateTime = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/time-entries`, member, {
    minutes: 35, workType: 'onsite', description: 'Inspected equipment power and alarm state.', phiAcknowledged: true,
  }, timeHeaders);
  assert.equal(duplicateTime.statusCode, 200, duplicateTime.body);
  assert.equal(duplicateTime.json().duplicate, true);

  const attachmentResponse = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/attachments`, member, {
    originalName: 'equipment-observation.txt', declaredMimeType: 'text/plain', visibility: 'requester',
    contentBase64: Buffer.from('Operational equipment observation only.').toString('base64'), phiAcknowledged: true,
  });
  assert.equal(attachmentResponse.statusCode, 201, attachmentResponse.body);
  const prohibitedAttachment = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/attachments`, member, {
    originalName: 'unsafe.txt', declaredMimeType: 'text/plain', visibility: 'requester',
    contentBase64: Buffer.from('MRN: never-echo-attachment-value').toString('base64'), phiAcknowledged: true,
  });
  assert.equal(prohibitedAttachment.statusCode, 422, prohibitedAttachment.body);
  assert.doesNotMatch(prohibitedAttachment.body, /never-echo-attachment-value/);

  const supplyResponse = await inject('POST', '/v1/modules/pulsedesk/supply-requests', member, {
    ticketId: ticket.id, departmentId: department.id, itemName: 'Temperature probe', quantity: 2, urgency: 'high', phiAcknowledged: true,
  });
  assert.equal(supplyResponse.statusCode, 201, supplyResponse.body);
  const facilityResponse = await inject('POST', '/v1/modules/pulsedesk/facility-requests', member, {
    ticketId: ticket.id, directorySiteId: site.id, departmentId: department.id, requestType: 'electrical_inspection',
    title: 'Inspect equipment outlet', locationLabel: 'Facilities storage', priority: 'high', phiAcknowledged: true,
  });
  assert.equal(facilityResponse.statusCode, 201, facilityResponse.body);

  const [vendor] = await db.insert(directoryOrganizations).values({
    tenantId: ownerA.currentTenantId, name: 'Northstar Equipment Service', normalizedName: 'northstar equipment service',
    type: 'vendor', createdByUserId: ownerA.id, updatedByUserId: ownerA.id,
  }).returning();
  const vendorResponse = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/vendor-engagements`, member, {
    vendorOrganizationId: vendor.id, status: 'requested', referenceCode: 'VENDOR-100',
  });
  assert.equal(vendorResponse.statusCode, 201, vendorResponse.body);

  const articleResponse = await inject('POST', '/v1/modules/pulsedesk/knowledge', ownerA, {
    title: 'Equipment temperature response', summary: 'Operational response checklist',
    body: 'Confirm the equipment alarm and notify facilities operations.', status: 'published', visibility: 'requester', phiAcknowledged: true,
  });
  assert.equal(articleResponse.statusCode, 201, articleResponse.body);
  const savedViewResponse = await inject('POST', '/v1/modules/pulsedesk/saved-views', member, {
    name: 'Critical equipment', filters: { priority: 'critical' }, sort: { field: 'updatedAt', direction: 'desc' }, shared: false,
  });
  assert.equal(savedViewResponse.statusCode, 201, savedViewResponse.body);
  const tagResponse = await inject('POST', '/v1/modules/pulsedesk/tags', member, { name: 'equipment', color: '#0277a8' });
  assert.equal(tagResponse.statusCode, 201, tagResponse.body);
  const tagAssignment = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/tags`, member, { tagIds: [tagResponse.json().id] });
  assert.equal(tagAssignment.statusCode, 200, tagAssignment.body);

  const viewerDetail = await inject('GET', `/v1/modules/pulsedesk/tickets/${ticket.id}`, viewer);
  assert.equal(viewerDetail.statusCode, 200, viewerDetail.body);
  assert.equal(viewerDetail.json().capabilities.canViewInternal, false);
  assert.deepEqual(viewerDetail.json().messages.map((row: any) => row.visibility), ['requester']);
  assert.doesNotMatch(viewerDetail.body, new RegExp(internalMarker));
  assert.equal(viewerDetail.json().timeEntries.length, 0);
  assert.equal(viewerDetail.json().assignments.length, 0);
  assert.equal(viewerDetail.json().vendorEngagements.length, 0);
  const internalAttachmentDenied = await inject('GET', `/v1/modules/pulsedesk/tickets/${ticket.id}/attachments?visibility=internal`, viewer);
  assert.equal(internalAttachmentDenied.statusCode, 403, internalAttachmentDenied.body);
  const viewerWriteDenied = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/internal-notes`, viewer, { body: 'Forbidden', phiAcknowledged: true }, { 'idempotency-key': 'phase6-viewer-forbidden-001' });
  assert.equal(viewerWriteDenied.statusCode, 403, viewerWriteDenied.body);

  const patientMarker = 'never-echo-patient-value';
  const phiDenied = await inject('POST', '/v1/modules/pulsedesk/tickets', member, {
    summary: 'Unsafe operational request', patientName: patientMarker, phiAcknowledged: true,
  });
  assert.equal(phiDenied.statusCode, 422, phiDenied.body);
  assert.equal(phiDenied.json().code, 'PULSEDESK_PHI_FIELD_PROHIBITED');
  assert.doesNotMatch(phiDenied.body, new RegExp(patientMarker));

  const foreignDetail = await inject('GET', `/v1/modules/pulsedesk/tickets/${ticket.id}`, ownerB);
  assert.equal(foreignDetail.statusCode, 404, foreignDetail.body);
  const foreignReference = await inject('POST', '/v1/modules/pulsedesk/tickets', ownerB, {
    summary: 'Foreign reference must remain hidden', directoryOrganizationId: client.id, phiAcknowledged: true,
  });
  assert.equal(foreignReference.statusCode, 404, foreignReference.body);

  ticket = (await inject('GET', `/v1/modules/pulsedesk/tickets/${ticket.id}`, ownerA)).json().ticket;
  await db.execute(sql`UPDATE pulsedesk_requests SET resolution_due_at = NOW() - INTERVAL '5 minutes' WHERE tenant_id = ${ownerA.currentTenantId} AND id = ${ticket.id}`);
  const slaEvaluation = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/sla/evaluate`, member, {});
  assert.equal(slaEvaluation.statusCode, 200, slaEvaluation.body);
  assert.equal(slaEvaluation.json().event.eventType, 'overdue');

  const resolve = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/actions/resolve`, member, { expectedVersion: ticket.version });
  assert.equal(resolve.statusCode, 200, resolve.body);
  ticket = resolve.json();
  const close = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/actions/close`, member, { expectedVersion: ticket.version });
  assert.equal(close.statusCode, 200, close.body);
  ticket = close.json();
  const reopen = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/actions/reopen`, member, { expectedVersion: ticket.version });
  assert.equal(reopen.statusCode, 200, reopen.body);
  ticket = reopen.json();
  assert.equal(ticket.status, 'triage');

  const secondTicketResponse = await inject('POST', '/v1/modules/pulsedesk/tickets', member, { summary: 'Second operational ticket', phiAcknowledged: true });
  assert.equal(secondTicketResponse.statusCode, 201, secondTicketResponse.body);
  const secondTicket = secondTicketResponse.json();
  const bulkStatus = await inject('POST', '/v1/modules/pulsedesk/tickets/bulk', ownerA, { action: 'status', toStatus: 'triage', tickets: [{ id: secondTicket.id, expectedVersion: secondTicket.version }] });
  assert.equal(bulkStatus.statusCode, 200, bulkStatus.body);
  const bulkArchive = await inject('POST', '/v1/modules/pulsedesk/tickets/bulk', ownerA, { action: 'archive', tickets: [{ id: secondTicket.id, expectedVersion: bulkStatus.json().tickets[0].version }] });
  assert.equal(bulkArchive.statusCode, 200, bulkArchive.body);

  const archive = await inject('POST', `/v1/modules/pulsedesk/tickets/${ticket.id}/actions/archive`, ownerA, { expectedVersion: ticket.version });
  assert.equal(archive.statusCode, 200, archive.body);
  ticket = archive.json();
  assert.ok(ticket.archivedAt);
  const hiddenFromDefaultList = await inject('GET', `/v1/modules/pulsedesk/tickets?search=${encodeURIComponent(ticket.summary)}`, ownerA);
  assert.equal(hiddenFromDefaultList.statusCode, 200, hiddenFromDefaultList.body);
  assert.equal(hiddenFromDefaultList.json().pagination.total, 0);

  await app.close();
  app = await buildApp();
  const persistedAfterRestart = await inject('GET', `/v1/modules/pulsedesk/tickets/${ticket.id}`, ownerA);
  assert.equal(persistedAfterRestart.statusCode, 200, persistedAfterRestart.body);
  assert.equal(persistedAfterRestart.json().ticket.humanId, ticket.humanId);
  assert.ok(persistedAfterRestart.json().ticket.archivedAt);
  assert.ok(persistedAfterRestart.json().events.length >= 10);
  assert.ok(persistedAfterRestart.json().slaEvents.some((event: any) => event.eventType === 'overdue'));

  const dashboard = await inject('GET', '/v1/modules/pulsedesk/dashboard', ownerA);
  assert.equal(dashboard.statusCode, 200, dashboard.body);
  assert.equal(dashboard.json().metrics.operationalAssets, 1);
  assert.equal(dashboard.json().metrics.pendingSupplyRequests, 1);
  assert.equal(dashboard.json().metrics.openFacilityRequests, 1);
  const viewerKnowledge = await inject('GET', '/v1/modules/pulsedesk/knowledge', viewer);
  assert.equal(viewerKnowledge.statusCode, 200, viewerKnowledge.body);
  assert.equal(viewerKnowledge.json().articles.length, 1);
});
