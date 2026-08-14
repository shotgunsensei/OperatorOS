process.env.SESSION_SECRET ||= 'operatoros-faultlinelab-workflow-test-v1';
process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
import { FAULTLINELAB_STARTER_CHALLENGES } from '../src/lib/faultlinelab-starter-content.js';
import { createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let viewer: any;
let moduleRow: any;
let signToken: typeof import('../src/lib/auth.js').signToken;

function headers(actor: any) {
  const tenantId = actor === ownerB ? ownerB.currentTenantId : ownerA.currentTenantId;
  return {
    authorization: `Bearer ${signToken({
      userId: actor.id,
      email: actor.email,
      role: actor.role,
      tokenVersion: actor.tokenVersion,
      sessionType: 'platform',
    })}`,
    'x-tenant-id': tenantId,
  };
}

function inject(method: string, url: string, actor: any, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: headers(actor),
    ...(payload === undefined ? {} : { payload }),
  });
}

async function buildApp() {
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerFaultlineLabRoutes } = await import('../src/routes/faultlinelab-routes.js');
  const instance = Fastify();
  await instance.register(cookie);
  await registerFaultlineLabRoutes(instance);
  await instance.ready();
  return instance;
}

before(async () => {
  await ensureSchemaReady();
  const { ensureFaultlineLabTables } = await import('../src/lib/faultlinelab-db-init.js');
  await ensureFaultlineLabTables();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();
  [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'faultlinelab')).limit(1);
  moduleRow ??= await createTestModule('faultlinelab');
  await db.insert(tenantUsers).values({
    tenantId: ownerA.currentTenantId,
    userId: viewer.id,
    role: 'member',
  });
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
  await db.insert(tenantUserModuleAccess).values({
    tenantId: ownerA.currentTenantId,
    userId: viewer.id,
    moduleId: moduleRow.id,
    accessLevel: 'viewer',
  });
  app = await buildApp();
});

after(async () => {
  if (app) await app.close();
  // The database is a disposable Phase 10A container. Append-only challenge
  // evidence is intentionally not weakened merely to make fixture cleanup easy.
});

test('FaultlineLab persists a server-scored investigation with strict tenant and role boundaries', async () => {
  const catalogResponse = await inject('GET', '/v1/modules/faultlinelab/challenges', ownerA);
  assert.equal(catalogResponse.statusCode, 200, catalogResponse.body);
  const catalog = catalogResponse.json().challenges;
  assert.equal(catalog.length, FAULTLINELAB_STARTER_CHALLENGES.length);
  assert.equal(catalogResponse.json().facets.total, FAULTLINELAB_STARTER_CHALLENGES.length);
  assert.ok(catalog.every((item: any) => item.sourceId), 'every compiled source case must expose its provenance id');
  const source = FAULTLINELAB_STARTER_CHALLENGES[0]!;
  const challenge = catalog.find((item: any) => item.slug === source.slug);
  assert.ok(challenge);

  const detailResponse = await inject(
    'GET',
    `/v1/modules/faultlinelab/challenges/${challenge.id}`,
    ownerA,
  );
  assert.equal(detailResponse.statusCode, 200, detailResponse.body);
  assert.equal(detailResponse.body.includes(source.content.rootCause.technicalDetail), false);
  assert.equal(detailResponse.body.includes(source.content.commands[0]!.output), false);
  assert.equal(
    (await inject('GET', `/v1/modules/faultlinelab/challenges/${challenge.id}`, ownerB)).statusCode,
    404,
  );
  assert.equal(
    (await inject('POST', '/v1/modules/faultlinelab/sessions', viewer, {
      challengeId: challenge.id,
      mode: 'standard',
      clientStartKey: 'viewer-write-denied-001',
    })).statusCode,
    403,
  );

  const startPayload = {
    challengeId: challenge.id,
    mode: 'standard',
    clientStartKey: 'phase10a-standard-attempt-001',
  };
  const startResponse = await inject('POST', '/v1/modules/faultlinelab/sessions', ownerA, startPayload);
  assert.equal(startResponse.statusCode, 201, startResponse.body);
  let session = startResponse.json();
  assert.equal(session.session.state, 'active');
  assert.equal(session.evidence.length, 0);
  const sessionId = session.session.id;
  const duplicateStart = await inject('POST', '/v1/modules/faultlinelab/sessions', ownerA, startPayload);
  assert.equal(duplicateStart.statusCode, 200, duplicateStart.body);
  assert.equal(duplicateStart.json().session.id, sessionId);
  assert.equal(
    (await inject('GET', `/v1/modules/faultlinelab/sessions/${sessionId}`, ownerB)).statusCode,
    404,
  );
  assert.equal(
    (await inject('GET', `/v1/modules/faultlinelab/sessions/${sessionId}`, viewer)).statusCode,
    404,
  );

  const lockedEvidence = source.content.evidence.find((item) => item.category === 'clue')!.id;
  const lockedSubmission = await inject(
    'POST',
    `/v1/modules/faultlinelab/sessions/${sessionId}/submit`,
    ownerA,
    {
      expectedVersion: session.session.version,
      clientSubmissionId: 'phase10a-locked-submit-001',
      hypothesis: 'A deliberately premature hypothesis.',
      selectedRootCauseId: source.content.rootCause.id,
      evidenceIds: [lockedEvidence],
      remediation: source.content.remediationKeywords.join(' '),
      proofNote: 'Locked evidence must fail closed.',
    },
  );
  assert.equal(lockedSubmission.statusCode, 422, lockedSubmission.body);
  assert.equal(lockedSubmission.json().code, 'FAULTLINE_EVIDENCE_LOCKED');

  const actions = [
    ...source.content.commands.map((item) => ({ kind: 'command', target: item.command })),
    ...source.content.events.map((item) => ({ kind: 'event', target: item.id })),
    ...source.content.tickets.map((item) => ({ kind: 'ticket', target: item.id })),
  ];
  for (const [index, action] of actions.entries()) {
    const response = await inject(
      'POST',
      `/v1/modules/faultlinelab/sessions/${sessionId}/actions`,
      ownerA,
      {
        expectedVersion: session.session.version,
        clientActionId: `phase10a-action-${String(index).padStart(3, '0')}`,
        ...action,
      },
    );
    assert.equal(response.statusCode, 200, response.body);
    session = response.json();
  }
  const clueIds = source.content.evidence
    .filter((item) => item.category === 'clue')
    .map((item) => item.id);
  for (const id of clueIds) assert.ok(session.session.unlockedEvidence.includes(id), `missing ${id}`);

  const submitPayload = {
    expectedVersion: session.session.version,
    clientSubmissionId: 'phase10a-final-submit-001',
    hypothesis: source.content.rootCause.description,
    selectedRootCauseId: source.content.rootCause.id,
    evidenceIds: clueIds,
    remediation: source.content.remediationKeywords.join(' '),
    proofNote: 'Validated against the original failure conditions.',
  };
  const submissionResponse = await inject(
    'POST',
    `/v1/modules/faultlinelab/sessions/${sessionId}/submit`,
    ownerA,
    submitPayload,
  );
  assert.equal(submissionResponse.statusCode, 200, submissionResponse.body);
  session = submissionResponse.json();
  assert.equal(session.session.state, 'completed');
  assert.equal(session.session.passed, true);
  assert.equal(session.submission.scoreBreakdown.diagnosisAccuracy, 45);
  assert.equal(session.submission.scoreBreakdown.evidenceQuality, 25);
  assert.equal(session.debrief.rootCause.id, source.content.rootCause.id);

  const duplicateSubmission = await inject(
    'POST',
    `/v1/modules/faultlinelab/sessions/${sessionId}/submit`,
    ownerA,
    submitPayload,
  );
  assert.equal(duplicateSubmission.statusCode, 200, duplicateSubmission.body);
  assert.equal(duplicateSubmission.json().submission.id, session.submission.id);

  const assignmentResponse = await inject('POST', '/v1/modules/faultlinelab/assignments', ownerA, {
    challengeId: challenge.id,
    assigneeUserId: viewer.id,
    title: 'Phase 10A bounded assignment',
    instructions: 'Investigate without relying on client-side answer state.',
  });
  assert.equal(assignmentResponse.statusCode, 201, assignmentResponse.body);
  const assignmentId = assignmentResponse.json().assignment.id;
  const viewerAssignments = await inject('GET', '/v1/modules/faultlinelab/assignments', viewer);
  assert.equal(viewerAssignments.statusCode, 200, viewerAssignments.body);
  assert.ok(viewerAssignments.json().assignments.some((item: any) => item.id === assignmentId));
  assert.equal(
    (await inject('POST', '/v1/modules/faultlinelab/assignments', viewer, {
      challengeId: challenge.id,
      assigneeUserId: viewer.id,
    })).statusCode,
    403,
  );

  const draftResponse = await inject(
    'POST',
    '/v1/modules/faultlinelab/authoring/challenges',
    ownerA,
    {
      slug: 'phase10a-private-lab',
      title: 'Phase 10A Private Lab',
      category: source.category,
      difficulty: source.difficulty,
      content: source.content,
      scope: 'personal',
      changeNote: 'Acceptance-test authoring fixture',
    },
  );
  assert.equal(draftResponse.statusCode, 201, draftResponse.body);
  const draft = draftResponse.json().challenge;
  assert.equal(
    (await inject('GET', `/v1/modules/faultlinelab/challenges/${draft.id}`, ownerB)).statusCode,
    404,
  );
  const staleUpdate = await inject(
    'PATCH',
    `/v1/modules/faultlinelab/authoring/challenges/${draft.id}`,
    ownerA,
    { expectedVersion: 99, content: source.content },
  );
  assert.equal(staleUpdate.statusCode, 409, staleUpdate.body);
  assert.equal(staleUpdate.json().code, 'FAULTLINE_VERSION_CONFLICT');

  await assert.rejects(
    db.execute(sql`
      UPDATE faultlinelab_session_actions SET output='tampered'
      WHERE tenant_id=${ownerA.currentTenantId} AND session_id=${sessionId}
    `),
    (error: any) => error?.cause?.code === '55000' || error?.code === '55000',
  );

  const progress = await inject('GET', '/v1/modules/faultlinelab/progress', ownerA);
  assert.equal(progress.statusCode, 200, progress.body);
  assert.equal(progress.json().progress.attemptsCompleted, 1);
  assert.equal(progress.json().progress.challengesSolved, 1);

  await app.close();
  app = await buildApp();
  const persisted = await inject('GET', `/v1/modules/faultlinelab/sessions/${sessionId}`, ownerA);
  assert.equal(persisted.statusCode, 200, persisted.body);
  assert.equal(persisted.json().session.state, 'completed');
  assert.equal(persisted.json().submission.id, session.submission.id);
});
