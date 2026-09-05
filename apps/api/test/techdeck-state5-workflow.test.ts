process.env.SESSION_SECRET ||= 'operatoros-techdeck-state5-test-v1';
process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { directoryOrganizations, directorySites, modules, tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let member: any;
let viewer: any;
let moduleRow: any;
let moduleCreated = false;
let organization: any;
let site: any;
let signToken: typeof import('../src/lib/auth.js').signToken;

function headers(actor: any, tenantId: string) {
  return {
    authorization: `Bearer ${signToken({ userId: actor.id, email: actor.email, role: actor.role, tokenVersion: actor.tokenVersion, sessionType: 'platform' })}`,
    'x-tenant-id': tenantId,
  };
}

async function inject(method: string, url: string, actor: any, payload?: unknown) {
  return app.inject({ method, url, headers: headers(actor, actor === ownerB ? ownerB.currentTenantId : ownerA.currentTenantId), ...(payload === undefined ? {} : { payload }) });
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  member = await createTestUser();
  viewer = await createTestUser();
  [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'techdeck')).limit(1);
  if (!moduleRow) { moduleRow = await createTestModule('techdeck'); moduleCreated = true; }
  await db.insert(tenantUsers).values([
    { tenantId: ownerA.currentTenantId, userId: member.id, role: 'member' },
    { tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'viewer' },
  ]);
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUserModuleAccess).values([
    { tenantId: ownerA.currentTenantId, userId: member.id, moduleId: moduleRow.id, accessLevel: 'user' },
    { tenantId: ownerA.currentTenantId, userId: viewer.id, moduleId: moduleRow.id, accessLevel: 'viewer' },
  ]);
  [organization] = await db.insert(directoryOrganizations).values({
    tenantId: ownerA.currentTenantId, name: 'Northstar Managed Services', normalizedName: 'northstar managed services',
    type: 'client', createdByUserId: ownerA.id, updatedByUserId: ownerA.id,
  }).returning();
  [site] = await db.insert(directorySites).values({
    tenantId: ownerA.currentTenantId, organizationId: organization.id, name: 'Main Office', normalizedName: 'main office',
    createdByUserId: ownerA.id, updatedByUserId: ownerA.id,
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
  if (ownerA) {
    const tenantId = ownerA.currentTenantId;
    await db.execute(sql`DELETE FROM shared_attachment_blobs WHERE tenant_id = ${tenantId}`);
    await db.execute(sql`DELETE FROM shared_jobs WHERE tenant_id = ${tenantId}`);
    await db.execute(sql`DELETE FROM shared_attachments WHERE tenant_id = ${tenantId}`);
    for (const table of ['techdeck_document_links', 'techdeck_document_revisions', 'techdeck_evidence', 'techdeck_reports', 'techdeck_time_entries', 'techdeck_ticket_comments', 'techdeck_configuration_relationships', 'techdeck_documents', 'techdeck_document_folders', 'techdeck_tickets', 'techdeck_assets', 'activity_feed'] as const) {
      await db.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id = '${tenantId.replaceAll("'", "''")}'`));
    }
    if (site) await db.delete(directorySites).where(eq(directorySites.id, site.id));
    if (organization) await db.delete(directoryOrganizations).where(eq(directoryOrganizations.id, organization.id));
  }
  if (moduleRow) {
    const tenantIds = [ownerA.currentTenantId, ownerB.currentTenantId];
    await db.delete(tenantUserModuleAccess).where(and(eq(tenantUserModuleAccess.moduleId, moduleRow.id), inArray(tenantUserModuleAccess.tenantId, tenantIds)));
    await db.delete(tenantModules).where(and(eq(tenantModules.moduleId, moduleRow.id), inArray(tenantModules.tenantId, tenantIds)));
  }
  for (const actor of [viewer, member, ownerA, ownerB]) if (actor) await cleanupUser(actor.id);
  if (moduleRow && moduleCreated) await cleanupModule(moduleRow.id);
});

test('TechDeck state-5 managed infrastructure, documentation, evidence, reports, and time are tenant scoped', async () => {
  const definitions = [
    { name: 'Application server', type: 'server', hostname: 'app-01', ipAddress: '10.20.0.10' },
    { name: 'Edge firewall', type: 'firewall', hostname: 'fw-01', ipAddress: '10.20.0.1', health: 'warning' },
    { name: 'Core switch', type: 'switch', hostname: 'sw-01', ipAddress: '10.20.0.2' },
    { name: 'Production VLAN', type: 'vlan', vlanNumber: 120, cidr: '10.20.0.0/24', gateway: '10.20.0.1', dnsServers: ['10.20.0.10'] },
    { name: 'Reserved application IP', type: 'ip_address', ipAddress: '10.20.0.10' },
  ];
  const items = [];
  for (const definition of definitions) {
    const response = await inject('POST', '/v1/modules/techdeck/configuration-items', ownerA, {
      ...definition, directoryOrganizationId: organization.id, directorySiteId: site.id,
    });
    assert.equal(response.statusCode, 201, response.body);
    items.push(response.json());
  }

  const secret = await inject('POST', '/v1/modules/techdeck/configuration-items', ownerA, {
    name: 'Unsafe credential', type: 'credential_reference', externalVaultReference: 'vault://techdeck/northstar/firewall',
    details: { password: 'must-never-be-stored' },
  });
  assert.equal(secret.statusCode, 400, secret.body);
  assert.equal(secret.json().code, 'SECRET_VALUE_FORBIDDEN');
  assert.doesNotMatch(secret.body, /must-never-be-stored/);

  const relation = await inject('POST', '/v1/modules/techdeck/relationships', member, {
    sourceAssetId: items[0].id, targetAssetId: items[1].id, relationshipType: 'depends_on',
  });
  assert.equal(relation.statusCode, 201, relation.body);

  const ticketResponse = await inject('POST', '/v1/modules/techdeck/tickets', member, {
    title: 'Investigate secondary WAN degradation', priority: 'high', directoryOrganizationId: organization.id,
    directorySiteId: site.id, configurationItemId: items[1].id,
  });
  assert.equal(ticketResponse.statusCode, 201, ticketResponse.body);
  const ticket = ticketResponse.json();
  const comment = await inject('POST', `/v1/modules/techdeck/tickets/${ticket.id}/comments`, member, { body: 'Provider circuit test scheduled and evidence attached.' });
  assert.equal(comment.statusCode, 201, comment.body);

  const docOneResponse = await inject('POST', '/v1/modules/techdeck/documents', member, {
    title: 'Application service recovery', pageType: 'runbook', summary: 'Reviewed recovery procedure',
    content: '<script>unsafe()</script>1. Validate health\n2. Follow approved vendor procedure', directoryOrganizationId: organization.id,
  });
  assert.equal(docOneResponse.statusCode, 201, docOneResponse.body);
  let docOne = docOneResponse.json();
  assert.doesNotMatch(docOne.content, /<script>/i);
  const docTwoResponse = await inject('POST', '/v1/modules/techdeck/documents', ownerA, {
    title: 'Northstar network standard', pageType: 'configuration_standard', content: 'VLAN and subnet allocation standard.',
  });
  assert.equal(docTwoResponse.statusCode, 201, docTwoResponse.body);
  const docTwo = docTwoResponse.json();

  const forbiddenRole = await inject('POST', '/v1/modules/techdeck/documents', member, {
    title: 'Member cannot create owner-only content', content: 'Restricted', minimumRole: 'owner',
  });
  assert.equal(forbiddenRole.statusCode, 403, forbiddenRole.body);
  const restrictedResponse = await inject('POST', '/v1/modules/techdeck/documents', ownerA, {
    title: 'Owner-only infrastructure decision', content: 'Restricted operational decision.', minimumRole: 'owner',
  });
  assert.equal(restrictedResponse.statusCode, 201, restrictedResponse.body);
  const restricted = restrictedResponse.json();
  const restrictedRead = await inject('GET', `/v1/modules/techdeck/documents/${restricted.id}`, member);
  assert.equal(restrictedRead.statusCode, 404, restrictedRead.body);
  const restrictedPatch = await inject('PATCH', `/v1/modules/techdeck/documents/${restricted.id}`, member, {
    expectedVersion: restricted.version, summary: 'Unauthorized change',
  });
  assert.equal(restrictedPatch.statusCode, 404, restrictedPatch.body);
  const restrictedAttachment = await inject('GET', `/v1/modules/techdeck/attachments/document/${restricted.id}`, member);
  assert.equal(restrictedAttachment.statusCode, 404, restrictedAttachment.body);
  const restrictedEvidence = await inject('POST', '/v1/modules/techdeck/evidence', member, {
    title: 'Unauthorized association', evidenceType: 'observation', documentId: restricted.id,
  });
  assert.equal(restrictedEvidence.statusCode, 400, restrictedEvidence.body);
  assert.equal(restrictedEvidence.json().field, 'documentId');
  const restrictedLink = await inject('POST', `/v1/modules/techdeck/documents/${docOne.id}/links`, member, {
    targetDocumentId: restricted.id,
  });
  assert.equal(restrictedLink.statusCode, 404, restrictedLink.body);

  const link = await inject('POST', `/v1/modules/techdeck/documents/${docOne.id}/links`, member, { targetDocumentId: docTwo.id, label: 'Related standard' });
  assert.equal(link.statusCode, 201, link.body);
  const review = await inject('POST', `/v1/modules/techdeck/documents/${docOne.id}/review`, member, { expectedVersion: docOne.version });
  assert.equal(review.statusCode, 200, review.body);
  docOne = review.json();
  const memberApproval = await inject('POST', `/v1/modules/techdeck/documents/${docOne.id}/approve`, member, { expectedVersion: docOne.version });
  assert.equal(memberApproval.statusCode, 403, memberApproval.body);
  const approval = await inject('POST', `/v1/modules/techdeck/documents/${docOne.id}/approve`, ownerA, { expectedVersion: docOne.version });
  assert.equal(approval.statusCode, 200, approval.body);
  docOne = approval.json();
  const publish = await inject('POST', `/v1/modules/techdeck/documents/${docOne.id}/publish`, ownerA, { expectedVersion: docOne.version });
  assert.equal(publish.statusCode, 200, publish.body);
  assert.equal(publish.json().status, 'published');

  const evidence = await inject('POST', '/v1/modules/techdeck/evidence', member, {
    title: 'Firewall health observation', evidenceType: 'observation', configurationItemId: items[1].id,
    summary: 'Secondary WAN path is degraded.', observedAt: '2026-07-18T14:00:00.000Z',
  });
  assert.equal(evidence.statusCode, 201, evidence.body);
  const exactEvidence = await inject('GET', `/v1/modules/techdeck/evidence/${evidence.json().id}`, viewer);
  assert.equal(exactEvidence.statusCode, 200, exactEvidence.body);
  assert.equal(exactEvidence.json().title, 'Firewall health observation');

  const attachment = await inject('POST', `/v1/modules/techdeck/attachments/evidence/${evidence.json().id}`, member, {
    originalName: 'observation.txt', declaredMimeType: 'text/plain', contentBase64: Buffer.from('Documented observation only.').toString('base64'),
  });
  assert.equal(attachment.statusCode, 201, attachment.body);
  const attachmentList = await inject('GET', `/v1/modules/techdeck/attachments/evidence/${evidence.json().id}`, viewer);
  assert.equal(attachmentList.statusCode, 200, attachmentList.body);
  assert.equal(attachmentList.json().length, 1);

  const time = await inject('POST', '/v1/modules/techdeck/time', member, {
    workedAt: '2026-07-18T14:15:00.000Z', minutes: 45, billable: true, ticketId: ticket.id, configurationItemId: items[1].id,
    directoryOrganizationId: organization.id, directorySiteId: site.id, notes: 'Reviewed failover health and documented findings.',
  });
  assert.equal(time.statusCode, 201, time.body);
  const foreignReference = await inject('POST', '/v1/modules/techdeck/time', ownerB, {
    workedAt: '2026-07-18T15:00:00.000Z', minutes: 15, configurationItemId: items[1].id,
  });
  assert.equal(foreignReference.statusCode, 400, foreignReference.body);
  assert.equal(foreignReference.json().field, 'configurationItemId');
  const report = await inject('POST', '/v1/modules/techdeck/reports', ownerA, { name: 'Northstar infrastructure baseline', reportType: 'network_inventory' });
  assert.equal(report.statusCode, 201, report.body);
  assert.match(report.json().sha256, /^[0-9a-f]{64}$/);
  assert.equal(report.json().snapshot.configurationItems.total, 5);
  const exactReport = await inject('GET', `/v1/modules/techdeck/reports/${report.json().id}`, viewer);
  assert.equal(exactReport.statusCode, 200, exactReport.body);
  assert.equal(exactReport.json().name, 'Northstar infrastructure baseline');
  const reportJson = await inject('GET', `/v1/modules/techdeck/reports/${report.json().id}/download?format=json`, viewer);
  assert.equal(reportJson.statusCode, 200, reportJson.body);
  assert.match(String(reportJson.headers['content-disposition']), /^attachment; filename="techdeck-report-[a-z0-9-]+\.json"$/);
  assert.equal(reportJson.headers['x-techdeck-snapshot-sha256'], report.json().sha256);
  assert.equal(reportJson.json().schema, 'operatoros.techdeck.operations-report.v1');
  assert.equal(reportJson.json().snapshot.configurationItems.total, 5);
  const reportCsv = await inject('GET', `/v1/modules/techdeck/reports/${report.json().id}/download?format=csv`, viewer);
  assert.equal(reportCsv.statusCode, 200, reportCsv.body);
  assert.match(reportCsv.body, /"configurationItems","total","5"/);
  const invalidReportFormat = await inject('GET', `/v1/modules/techdeck/reports/${report.json().id}/download?format=pdf`, viewer);
  assert.equal(invalidReportFormat.statusCode, 400, invalidReportFormat.body);

  const workspace = await inject('GET', '/v1/modules/techdeck/workspace', viewer);
  assert.equal(workspace.statusCode, 200, workspace.body);
  assert.equal(workspace.json().configurationItems.length, 5);
  assert.equal(workspace.json().documents.length, 2);
  assert.equal(workspace.json().execution.enabled, false);
  const viewerWrite = await inject('POST', '/v1/modules/techdeck/reports', viewer, { name: 'Forbidden', reportType: 'asset_inventory' });
  assert.equal(viewerWrite.statusCode, 403, viewerWrite.body);

  const foreign = await inject('GET', '/v1/modules/techdeck/workspace', ownerB);
  assert.equal(foreign.statusCode, 200, foreign.body);
  assert.equal(foreign.json().configurationItems.length, 0);
  const foreignDetail = await inject('GET', `/v1/modules/techdeck/configuration-items/${items[0].id}`, ownerB);
  assert.equal(foreignDetail.statusCode, 404, foreignDetail.body);
  const foreignEvidence = await inject('GET', `/v1/modules/techdeck/evidence/${evidence.json().id}`, ownerB);
  assert.equal(foreignEvidence.statusCode, 404, foreignEvidence.body);
  const foreignReportDetail = await inject('GET', `/v1/modules/techdeck/reports/${report.json().id}`, ownerB);
  assert.equal(foreignReportDetail.statusCode, 404, foreignReportDetail.body);
  const foreignReport = await inject('GET', `/v1/modules/techdeck/reports/${report.json().id}/download?format=json`, ownerB);
  assert.equal(foreignReport.statusCode, 404, foreignReport.body);

  const execute = await inject('POST', `/v1/modules/techdeck/documents/${docOne.id}/execute`, ownerA, { expectedVersion: docOne.version });
  assert.equal(execute.statusCode, 404, execute.body);
});
