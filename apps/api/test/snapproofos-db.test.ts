process.env.SESSION_SECRET ||= 'operatoros-snapproofos-phase11b-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  modules,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
} from '../src/schema.js';
import {
  cleanupModule,
  cleanupUser,
  createTestModule,
  createTestUser,
  ensureSchemaReady,
} from './_setup.js';

let app: ReturnType<typeof Fastify>;
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let viewer: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
let caseId = '';
let noteId = '';
let fileEvidenceId = '';

function headers(user: typeof ownerA, tenantId: string) {
  return {
    authorization: `Bearer ${signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
  };
}

async function makeApp() {
  const instance = Fastify({ bodyLimit: 35_000_000 });
  await instance.register(cookie);
  const { registerSnapProofOsRoutes } = await import('../src/routes/snapproofos-routes.js');
  await registerSnapProofOsRoutes(instance);
  await instance.ready();
  return instance;
}

async function cleanTenant(tenantId: string) {
  await db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL operatoros.tenant_hard_delete = 'on'`);
    await tx.execute(sql`DELETE FROM snapproof_exports WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_custody_events WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_comments WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_findings WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_reports WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_evidence_items WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM shared_attachment_blobs WHERE tenant_id=${tenantId} AND attachment_id IN (
      SELECT id FROM shared_attachments WHERE module_id=${moduleRow.id}
    )`);
    await tx.execute(sql`DELETE FROM shared_attachments WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
    await tx.execute(sql`DELETE FROM shared_jobs WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
    await tx.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
    await tx.execute(sql`DELETE FROM snapproof_cases WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_settings WHERE tenant_id=${tenantId}`);
  });
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();
  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'snapproofos')).limit(1);
  moduleRow = existing ?? await createTestModule('snapproofos');
  createdModule = !existing;
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUsers).values({
    tenantId: ownerA.currentTenantId,
    userId: viewer.id,
    role: 'member',
  });
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId,
    userId: viewer.id,
    moduleId: moduleRow.id,
    accessLevel: 'viewer',
  });
  app = await makeApp();
});

after(async () => {
  if (app) await app.close();
  if (ownerA && moduleRow) await cleanTenant(ownerA.currentTenantId);
  if (ownerB && moduleRow) await cleanTenant(ownerB.currentTenantId);
  if (moduleRow) {
    await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.moduleId, moduleRow.id));
    await db.delete(tenantModules).where(eq(tenantModules.moduleId, moduleRow.id));
  }
  for (const user of [viewer, ownerA, ownerB]) if (user) await cleanupUser(user.id);
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('SnapProofOS requires OperatorOS entitlement and rejects browser tenant authority', async () => {
  const anonymous = await app.inject({ method: 'GET', url: '/v1/modules/snapproofos/dashboard' });
  assert.equal(anonymous.statusCode, 401, anonymous.body);
  const override = await app.inject({
    method: 'POST',
    url: '/v1/modules/snapproofos/cases',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { reference: 'BAD-1', title: 'Client authority', tenantId: ownerB.currentTenantId },
  });
  assert.equal(override.statusCode, 400, override.body);
  assert.match(override.json().error, /trusted OperatorOS session/);
});

test('SnapProofOS persists private evidence, review, findings, custody, reports, and real exports', async () => {
  const createdCase = await app.inject({
    method: 'POST',
    url: '/v1/modules/snapproofos/cases',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      reference: 'SP-INTEGRATION-001',
      title: 'Network installation proof',
      description: 'Customer installation completion evidence.',
      sourceContext: { captureChannel: 'api_test' },
    },
  });
  assert.equal(createdCase.statusCode, 201, createdCase.body);
  caseId = createdCase.json().id;

  const note = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/cases/${caseId}/evidence`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      title: 'Technician completion note',
      evidenceType: 'note',
      description: 'Rack installed, labeled, and accepted.',
      sourceType: 'technician_note',
      capturedAt: new Date().toISOString(),
      captureContext: { workOrder: 'WO-100' },
    },
  });
  assert.equal(note.statusCode, 201, note.body);
  noteId = note.json().id;

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
  const upload = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/cases/${caseId}/evidence`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      title: 'Signed completion document',
      evidenceType: 'document',
      description: 'Signed customer completion record.',
      sourceType: 'customer_upload',
      capturedAt: new Date().toISOString(),
      originalName: 'completion.pdf',
      declaredMimeType: 'application/pdf',
      contentBase64: pdf.toString('base64'),
      captureContext: { workOrder: 'WO-100' },
    },
  });
  assert.equal(upload.statusCode, 201, upload.body);
  fileEvidenceId = upload.json().id;
  assert.match(upload.json().attachmentSha256, /^[0-9a-f]{64}$/);
  await db.execute(sql`
    UPDATE shared_attachments SET scan_status='unavailable'
    WHERE tenant_id=${ownerA.currentTenantId} AND id=${upload.json().attachmentId}
  `);

  for (const evidence of [note.json(), upload.json()]) {
    const submitted = await app.inject({
      method: 'POST',
      url: `/v1/modules/snapproofos/evidence/${evidence.id}/submit`,
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: {},
    });
    assert.equal(submitted.statusCode, 200, submitted.body);
    const decided = await app.inject({
      method: 'POST',
      url: `/v1/modules/snapproofos/evidence/${evidence.id}/decision`,
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: { expectedVersion: submitted.json().version, decision: 'approve' },
    });
    assert.equal(decided.statusCode, 200, decided.body);
    assert.equal(decided.json().status, 'verified');
  }

  const download = await app.inject({
    method: 'GET',
    url: `/v1/modules/snapproofos/evidence/${fileEvidenceId}/download`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(download.statusCode, 200, download.body);
  assert.equal(download.rawPayload.equals(pdf), true);
  assert.equal(download.headers['cache-control'], 'private, no-store');

  const finding = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/cases/${caseId}/findings`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { evidenceId: fileEvidenceId, title: 'Label verified', description: 'Rack and patch panel labels match the approved plan.', severity: 'info' },
  });
  assert.equal(finding.statusCode, 201, finding.body);
  const comment = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/cases/${caseId}/comments`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { evidenceId: noteId, body: 'Internal reviewer confirmed customer acknowledgement.', commentType: 'review' },
  });
  assert.equal(comment.statusCode, 201, comment.body);

  const prematureReport = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/cases/${caseId}/reports`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { title: 'Report before approval' },
  });
  assert.equal(prematureReport.statusCode, 409, prematureReport.body);
  assert.equal(prematureReport.json().code, 'SNAPPROOF_CASE_NOT_APPROVED');

  const submittedCase = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/cases/${caseId}/submit`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {},
  });
  assert.equal(submittedCase.statusCode, 200, submittedCase.body);
  const approvedCase = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/cases/${caseId}/decision`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: submittedCase.json().version, decision: 'approve' },
  });
  assert.equal(approvedCase.statusCode, 200, approvedCase.body);
  assert.equal(approvedCase.json().status, 'approved');

  const lateFinding = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/cases/${caseId}/findings`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      title: 'Post-approval mutation',
      description: 'Approved report inputs must remain stable.',
      severity: 'medium',
    },
  });
  assert.equal(lateFinding.statusCode, 409, lateFinding.body);
  assert.equal(lateFinding.json().code, 'SNAPPROOF_CASE_STATE_CONFLICT');

  const report = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/cases/${caseId}/reports`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { title: 'Network installation completion report' },
  });
  assert.equal(report.statusCode, 201, report.body);
  assert.match(report.json().contentHash, /^[0-9a-f]{64}$/);
  const reportSubmit = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/reports/${report.json().id}/submit`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {},
  });
  const reportApproval = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/reports/${report.json().id}/decision`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: reportSubmit.json().version, decision: 'approve' },
  });
  assert.equal(reportApproval.statusCode, 200, reportApproval.body);
  const exported = await app.inject({
    method: 'GET',
    url: `/v1/modules/snapproofos/reports/${report.json().id}/export?format=json`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(exported.statusCode, 200, exported.body);
  assert.match(String(exported.headers['x-snapproof-export-sha256']), /^[0-9a-f]{64}$/);
  assert.equal(JSON.parse(exported.body).provenance.reportContentHash, report.json().contentHash);

  const chain = await app.inject({
    method: 'GET',
    url: `/v1/modules/snapproofos/cases/${caseId}/custody`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(chain.statusCode, 200, chain.body);
  assert.ok(chain.json().events.length >= 12);
  for (let index = 1; index < chain.json().events.length; index += 1) {
    assert.equal(chain.json().events[index].previousHash, chain.json().events[index - 1].eventHash);
  }
  await assert.rejects(
    db.execute(sql`UPDATE snapproof_custody_events SET event_type='case_updated' WHERE tenant_id=${ownerA.currentTenantId} AND case_id=${caseId}`),
    (error: any) => {
      const databaseError = error?.cause ?? error;
      return /append-only/i.test(String(databaseError?.message));
    },
  );
});

test('SnapProofOS prevents cross-tenant enumeration and viewer mutation', async () => {
  const foreignCase = await app.inject({
    method: 'GET',
    url: `/v1/modules/snapproofos/cases/${caseId}`,
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreignCase.statusCode, 404, foreignCase.body);
  const foreignEvidence = await app.inject({
    method: 'GET',
    url: `/v1/modules/snapproofos/evidence/${fileEvidenceId}`,
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreignEvidence.statusCode, 404, foreignEvidence.body);
  const viewerRead = await app.inject({
    method: 'GET',
    url: '/v1/modules/snapproofos/dashboard',
    headers: headers(viewer, ownerA.currentTenantId),
  });
  assert.equal(viewerRead.statusCode, 200, viewerRead.body);
  const viewerWrite = await app.inject({
    method: 'POST',
    url: '/v1/modules/snapproofos/cases',
    headers: headers(viewer, ownerA.currentTenantId),
    payload: { reference: 'VIEWER-1', title: 'Viewer cannot create' },
  });
  assert.equal(viewerWrite.statusCode, 403, viewerWrite.body);
  assert.equal(viewerWrite.json().code, 'TENANT_MODULE_WRITE_ACCESS_REQUIRED');
});
