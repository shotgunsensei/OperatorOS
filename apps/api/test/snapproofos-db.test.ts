process.env.SESSION_SECRET ||= 'operatoros-snapproofos-phase11b-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
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
  const { registerSnapProofOsPhase32Routes } =
    await import('../src/routes/snapproofos-phase32-routes.js');
  await registerSnapProofOsRoutes(instance);
  await registerSnapProofOsPhase32Routes(instance);
  await instance.ready();
  return instance;
}

async function cleanTenant(tenantId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL operatoros.tenant_hard_delete = 'on'`);
    await tx.execute(sql`DELETE FROM snapproof_exports WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_share_links WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_custody_events WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_comments WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_findings WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_reports WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_evidence_items WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_parts WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_labor WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_branding WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM shared_attachment_blobs WHERE tenant_id=${tenantId} AND attachment_id IN (
      SELECT id FROM shared_attachments WHERE module_id=${moduleRow.id}
    )`);
    await tx.execute(
      sql`DELETE FROM shared_attachments WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`,
    );
    await tx.execute(
      sql`DELETE FROM shared_jobs WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`,
    );
    await tx.execute(
      sql`DELETE FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`,
    );
    await tx.execute(sql`DELETE FROM snapproof_cases WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_customers WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_templates WHERE tenant_id=${tenantId}`);
    await tx.execute(sql`DELETE FROM snapproof_settings WHERE tenant_id=${tenantId}`);
  });
}

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();
  const [existing] = await db
    .select()
    .from(modules)
    .where(eq(modules.slug, 'snapproofos'))
    .limit(1);
  moduleRow = existing ?? (await createTestModule('snapproofos'));
  createdModule = !existing;
  await db.insert(tenantModules).values([
    {
      tenantId: ownerA.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
    },
    {
      tenantId: ownerB.currentTenantId,
      moduleId: moduleRow.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
    },
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
    await db
      .delete(tenantUserModuleAccess)
      .where(eq(tenantUserModuleAccess.moduleId, moduleRow.id));
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
    payload: {
      evidenceId: fileEvidenceId,
      title: 'Label verified',
      description: 'Rack and patch panel labels match the approved plan.',
      severity: 'info',
    },
  });
  assert.equal(finding.statusCode, 201, finding.body);
  const comment = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/cases/${caseId}/comments`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      evidenceId: noteId,
      body: 'Internal reviewer confirmed customer acknowledgement.',
      commentType: 'review',
    },
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
    db.execute(
      sql`UPDATE snapproof_custody_events SET event_type='case_updated' WHERE tenant_id=${ownerA.currentTenantId} AND case_id=${caseId}`,
    ),
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

test('Phase 32 persists the customer to approved branded export and revocable share journey across restart', async () => {
  const customer = await app.inject({
    method: 'POST',
    url: '/v1/modules/snapproofos/customers',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      name: 'Field Proof Customer',
      email: 'field@example.test',
      company: 'Example Operations',
    },
  });
  assert.equal(customer.statusCode, 201, customer.body);
  const customerId = customer.json().customer.id;
  const branding = await app.inject({
    method: 'PATCH',
    url: '/v1/modules/snapproofos/branding',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      companyName: 'Example Field Operations',
      accentColor: '#b91c1c',
      footerText: 'Verified work by Example Field Operations',
    },
  });
  assert.equal(branding.statusCode, 200, branding.body);
  const logoBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const logo = await app.inject({
    method: 'POST',
    url: '/v1/modules/snapproofos/branding/logo',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      originalName: 'example-logo.png',
      declaredMimeType: 'image/png',
      contentBase64: logoBytes.toString('base64'),
    },
  });
  assert.equal(logo.statusCode, 201, logo.body);
  assert.match(logo.json().branding.logoAttachmentId, /^[0-9a-f-]{36}$/i);
  await db.execute(
    sql`UPDATE shared_attachments SET scan_status='unavailable' WHERE tenant_id=${ownerA.currentTenantId} AND id=${logo.json().branding.logoAttachmentId}`,
  );
  const logoDownload = await app.inject({
    method: 'GET',
    url: '/v1/modules/snapproofos/branding/logo',
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(logoDownload.statusCode, 200, logoDownload.body);
  assert.deepEqual(logoDownload.rawPayload, logoBytes);
  const mutationId = 'phase32-job-replay-1';
  const created = await app.inject({
    method: 'POST',
    url: '/v1/modules/snapproofos/jobs',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      title: 'Field installation',
      customerId,
      siteAddress: '100 Main Street',
      jobType: 'installation',
      clientMutationId: mutationId,
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const jobId = created.json().job.id;
  const replay = await app.inject({
    method: 'POST',
    url: '/v1/modules/snapproofos/jobs',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { title: 'Field installation duplicate', customerId, clientMutationId: mutationId },
  });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.json().job.id, jobId);

  const finding = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/jobs/${jobId}/findings`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      issue: 'Damaged termination',
      cause: 'Prior strain',
      resolution: 'Re-terminated and tested',
      recommendation: 'Inspect annually',
      severity: 'high',
    },
  });
  assert.equal(finding.statusCode, 201, finding.body);
  const customerNote = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/jobs/${jobId}/notes`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      body: 'Customer witnessed and accepted the completed test.',
      noteType: 'customer_facing',
    },
  });
  assert.equal(customerNote.statusCode, 201, customerNote.body);
  const internalNote = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/jobs/${jobId}/notes`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { body: 'Internal margin note must never appear publicly.', noteType: 'internal' },
  });
  assert.equal(internalNote.statusCode, 201, internalNote.body);
  const voiceBytes = Buffer.from('ID3voice-note-test', 'ascii');
  const voiceNote = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/jobs/${jobId}/notes`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      body: 'Technician voice note transcript.',
      noteType: 'voice_transcript',
      audioName: 'field-note.mp3',
      declaredMimeType: 'audio/mpeg',
      contentBase64: voiceBytes.toString('base64'),
    },
  });
  assert.equal(voiceNote.statusCode, 201, voiceNote.body);
  assert.ok(voiceNote.json().note.audioAttachmentId);
  await db.execute(
    sql`UPDATE shared_attachments SET scan_status='unavailable' WHERE tenant_id=${ownerA.currentTenantId} AND id=${voiceNote.json().note.audioAttachmentId}`,
  );
  const voiceDownload = await app.inject({
    method: 'GET',
    url: `/v1/modules/snapproofos/notes/${voiceNote.json().note.id}/audio`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(voiceDownload.statusCode, 200, voiceDownload.body);
  assert.deepEqual(voiceDownload.rawPayload, voiceBytes);
  const part = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/jobs/${jobId}/parts`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { name: 'Termination kit', quantity: 2, unitCostCents: 2500, unitPriceCents: 6000 },
  });
  assert.equal(part.statusCode, 201, part.body);
  assert.equal(Number(part.json().part.totalPriceCents), 12000);
  const labor = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/jobs/${jobId}/labor`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { description: 'Installation and test', hours: 2, rateCents: 9000 },
  });
  assert.equal(labor.statusCode, 201, labor.body);
  assert.equal(Number(labor.json().labor.totalCents), 18000);

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
  const filePayload = {
    title: 'Signed completion',
    fileType: 'document',
    caption: 'Customer sign-off',
    capturedAt: new Date().toISOString(),
    sourceType: 'mobile_capture',
    originalName: 'completion.pdf',
    declaredMimeType: 'application/pdf',
    contentBase64: pdf.toString('base64'),
    clientMutationId: 'phase32-file-replay-1',
  };
  const file = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/jobs/${jobId}/files`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: filePayload,
  });
  assert.equal(file.statusCode, 201, file.body);
  const phase32FileId = file.json().file.id;
  const fileReplay = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/jobs/${jobId}/files`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: filePayload,
  });
  assert.equal(fileReplay.statusCode, 200, fileReplay.body);
  assert.equal(fileReplay.json().file.id, phase32FileId);
  const fileMetadata = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/snapproofos/files/${phase32FileId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { caption: 'Signed customer completion record', sortOrder: 2 },
  });
  assert.equal(fileMetadata.statusCode, 200, fileMetadata.body);
  assert.equal(fileMetadata.json().file.sortOrder, 2);
  const invalidFile = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/jobs/${jobId}/files`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      ...filePayload,
      originalName: 'spoofed.pdf',
      contentBase64: Buffer.from('not a pdf').toString('base64'),
      clientMutationId: 'phase32-invalid-file',
    },
  });
  assert.equal(invalidFile.statusCode, 422, invalidFile.body);
  await db.execute(
    sql`UPDATE shared_attachments SET scan_status='unavailable' WHERE tenant_id=${ownerA.currentTenantId} AND id=${file.json().file.attachmentId}`,
  );
  const fileSubmit = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/evidence/${phase32FileId}/submit`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {},
  });
  assert.equal(fileSubmit.statusCode, 200, fileSubmit.body);
  const fileApprove = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/evidence/${phase32FileId}/decision`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: fileSubmit.json().version, decision: 'approve' },
  });
  assert.equal(fileApprove.statusCode, 200, fileApprove.body);
  await app.inject({
    method: 'PATCH',
    url: `/v1/modules/snapproofos/jobs/${jobId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { status: 'completed' },
  });
  const proofSubmit = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/cases/${jobId}/submit`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {},
  });
  assert.equal(proofSubmit.statusCode, 200, proofSubmit.body);
  const proofApprove = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/cases/${jobId}/decision`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: proofSubmit.json().version, decision: 'approve' },
  });
  assert.equal(proofApprove.statusCode, 200, proofApprove.body);

  const generated = await app.inject({
    method: 'POST',
    url: '/v1/modules/snapproofos/reports/generate',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      jobId,
      title: 'Field installation client report',
      reportType: 'full_report',
      tone: 'client_friendly',
    },
  });
  assert.equal(generated.statusCode, 201, generated.body);
  const reportId = generated.json().report.id;
  const snapshot = generated.json().report.content;
  assert.equal(snapshot.totals.totalCents, 30000);
  assert.equal(snapshot.branding.companyName, 'Example Field Operations');
  assert.equal(snapshot.notes.length, 1);
  assert.doesNotMatch(JSON.stringify(snapshot), /Internal margin note/);
  const reportSubmit = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/reports/${reportId}/submit`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {},
  });
  assert.equal(reportSubmit.statusCode, 200, reportSubmit.body);
  const reportApprove = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/reports/${reportId}/decision`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expectedVersion: reportSubmit.json().version, decision: 'approve' },
  });
  assert.equal(reportApprove.statusCode, 200, reportApprove.body);
  const immutable = await app.inject({
    method: 'PATCH',
    url: `/v1/modules/snapproofos/reports/${reportId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { title: 'Rewrite approved history' },
  });
  assert.equal(immutable.statusCode, 409, immutable.body);

  const viewerExport = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/reports/${reportId}/exports`,
    headers: headers(viewer, ownerA.currentTenantId),
    payload: { format: 'pdf' },
  });
  assert.equal(viewerExport.statusCode, 403, viewerExport.body);

  for (const format of ['pdf', 'docx'] as const) {
    const output = await app.inject({
      method: 'POST',
      url: `/v1/modules/snapproofos/reports/${reportId}/exports`,
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: { format },
    });
    assert.equal(output.statusCode, 201, output.body);
    assert.match(output.json().export.exportHash, /^[0-9a-f]{64}$/);
    const download = await app.inject({
      method: 'GET',
      url: `/v1/modules/snapproofos/exports/${output.json().export.id}/download`,
      headers: headers(ownerA, ownerA.currentTenantId),
    });
    assert.equal(download.statusCode, 200, download.body);
    assert.equal(download.rawPayload.length, output.json().export.byteLength);
    if (format === 'pdf')
      assert.equal(download.rawPayload.subarray(0, 5).toString('ascii'), '%PDF-');
    else assert.equal(download.rawPayload.readUInt32LE(0), 0x04034b50);
  }
  const shared = await app.inject({
    method: 'POST',
    url: `/v1/modules/snapproofos/reports/${reportId}/share-links`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { expiresInDays: 7, allowDownload: true },
  });
  assert.equal(shared.statusCode, 201, shared.body);
  const rawToken = shared.json().shareLink.token;
  assert.equal(rawToken.length, 43);
  const stored = await db.execute(
    sql`SELECT token_hash FROM snapproof_share_links WHERE tenant_id=${ownerA.currentTenantId} AND id=${shared.json().shareLink.id}`,
  );
  assert.notEqual(stored.rows[0]?.token_hash, rawToken);
  const publicView = await app.inject({
    method: 'GET',
    url: `/v1/public/snapproofos/reports/${rawToken}`,
  });
  assert.equal(publicView.statusCode, 200, publicView.body);
  assert.doesNotMatch(
    publicView.body,
    /Internal margin note|tenant_id|created_by_user_id|createdByUserId|assignedToUserId|unitCostCents|technicianUserId|audioAttachmentId/,
  );
  const publicDownload = await app.inject({
    method: 'GET',
    url: `/v1/public/snapproofos/reports/${rawToken}/download?format=pdf`,
  });
  assert.equal(publicDownload.statusCode, 200, publicDownload.body);
  assert.equal(publicDownload.rawPayload.subarray(0, 5).toString('ascii'), '%PDF-');
  const access = await db.execute(
    sql`SELECT access_count FROM snapproof_share_links WHERE tenant_id=${ownerA.currentTenantId} AND id=${shared.json().shareLink.id}`,
  );
  assert.equal(Number(access.rows[0]?.access_count), 2);
  const foreign = await app.inject({
    method: 'GET',
    url: `/v1/modules/snapproofos/jobs/${jobId}`,
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreign.statusCode, 404, foreign.body);
  const viewerWrite = await app.inject({
    method: 'POST',
    url: '/v1/modules/snapproofos/customers',
    headers: headers(viewer, ownerA.currentTenantId),
    payload: { name: 'Denied' },
  });
  assert.equal(viewerWrite.statusCode, 403, viewerWrite.body);
  const linkId = shared.json().shareLink.id;
  const revoked = await app.inject({
    method: 'DELETE',
    url: `/v1/modules/snapproofos/share-links/${linkId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(revoked.statusCode, 200, revoked.body);
  const afterRevoke = await app.inject({
    method: 'GET',
    url: `/v1/public/snapproofos/reports/${rawToken}`,
  });
  assert.equal(afterRevoke.statusCode, 404, afterRevoke.body);

  await app.close();
  app = await makeApp();
  const persisted = await app.inject({
    method: 'GET',
    url: `/v1/modules/snapproofos/jobs/${jobId}`,
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(persisted.statusCode, 200, persisted.body);
  assert.equal(persisted.json().job.customerName, 'Field Proof Customer');
  assert.equal(persisted.json().parts.length, 1);
  assert.equal(persisted.json().labor.length, 1);
});
