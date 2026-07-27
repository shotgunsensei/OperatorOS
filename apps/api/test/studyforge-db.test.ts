process.env.SESSION_SECRET ||= 'operatoros-studyforge-phase11c-db-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  modules, tenantModules, tenantUserModuleAccess, tenantUsers,
} from '../src/schema.js';
import {
  cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady,
} from './_setup.js';
import { ensureStudyForgeTables } from '../src/lib/studyforge-db-init.js';

let app: ReturnType<typeof Fastify>;
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let viewer: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
let subjectId = '';
let sourceId = '';
let documentSourceId = '';
let deckId = '';

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
  const instance = Fastify();
  await instance.register(cookie);
  const { registerStudyForgeRoutes } = await import('../src/routes/studyforge-routes.js');
  await registerStudyForgeRoutes(instance);
  await instance.ready();
  return instance;
}

async function cleanTenant(tenantId: string) {
  await db.execute(sql`DELETE FROM studyforge_card_progress WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_quiz_attempts WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_cards WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_questions WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_plan_sessions WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_decks WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_quizzes WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_plans WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_generations WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_sources WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_subjects WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM shared_jobs WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_attachment_blobs WHERE tenant_id=${tenantId}
    AND attachment_id IN (SELECT id FROM shared_attachments WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id})`);
  await db.execute(sql`DELETE FROM shared_attachments WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
}

before(async () => {
  await ensureSchemaReady();
  await ensureStudyForgeTables();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();
  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'studyforge-ai')).limit(1);
  moduleRow = existing ?? await createTestModule('studyforge-ai');
  createdModule = !existing;
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]);
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'member' });
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

test('StudyForge requires OperatorOS entitlement and server-side write authority', async () => {
  const anonymous = await app.inject({ method: 'GET', url: '/v1/modules/studyforge-ai/workspace' });
  assert.equal(anonymous.statusCode, 401, anonymous.body);
  const browserAuthority = await app.inject({
    method: 'POST',
    url: '/v1/modules/studyforge-ai/subjects',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { name: 'Rejected', tenantId: ownerB.currentTenantId },
  });
  assert.equal(browserAuthority.statusCode, 400, browserAuthority.body);
  assert.equal(browserAuthority.json().field, 'tenantId');
  const viewerWrite = await app.inject({
    method: 'POST',
    url: '/v1/modules/studyforge-ai/subjects',
    headers: headers(viewer, ownerA.currentTenantId),
    payload: { name: 'Viewer rejected' },
  });
  assert.equal(viewerWrite.statusCode, 403, viewerWrite.body);
});

test('StudyForge persists subjects, private sources, grounded AI drafts, review and spaced repetition', async () => {
  const subject = await app.inject({
    method: 'POST', url: '/v1/modules/studyforge-ai/subjects',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { name: 'Cell Biology', courseCode: 'BIO-101' },
  });
  assert.equal(subject.statusCode, 201, subject.body);
  subjectId = subject.json().subject.id;
  const source = await app.inject({
    method: 'POST', url: '/v1/modules/studyforge-ai/sources',
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      subjectId,
      title: 'Cell energy notes',
      sourceType: 'note',
      body: 'Mitochondria generate ATP through oxidative phosphorylation. Cells use ATP as an energy carrier.',
    },
  });
  assert.equal(source.statusCode, 201, source.body);
  sourceId = source.json().source.id;
  const documentPayload = {
    subjectId,
    title: 'Private DNS document',
    originalName: 'dns-notes.txt',
    mimeType: 'text/plain',
    contentBase64: Buffer.from('DNS resolvers translate host names into IP addresses.').toString('base64'),
  };
  const document = await app.inject({
    method: 'POST', url: '/v1/modules/studyforge-ai/sources/document',
    headers: { ...headers(ownerA, ownerA.currentTenantId), 'idempotency-key': 'studyforge-db-document-upload-0001' },
    payload: documentPayload,
  });
  assert.equal(document.statusCode, 202, document.body);
  documentSourceId = document.json().source.id;
  const documentReplay = await app.inject({
    method: 'POST', url: '/v1/modules/studyforge-ai/sources/document',
    headers: { ...headers(ownerA, ownerA.currentTenantId), 'idempotency-key': 'studyforge-db-document-upload-0001' },
    payload: documentPayload,
  });
  assert.equal(documentReplay.statusCode, 202, documentReplay.body);
  assert.equal(documentReplay.json().source.id, documentSourceId);
  assert.equal(documentReplay.json().replayed, true);
  const attachment = await db.execute(sql`SELECT a.tenant_id,a.object_id,a.sha256
    FROM shared_attachments a JOIN studyforge_sources s
      ON s.tenant_id=a.tenant_id AND s.attachment_id=a.id
    WHERE s.tenant_id=${ownerA.currentTenantId} AND s.id=${documentSourceId}`);
  assert.equal(attachment.rows.length, 1);
  assert.equal(String(attachment.rows[0].object_id), documentSourceId);
  const payload = {
    sourceId, subjectId, type: 'deck', title: 'Cell Energy Deck',
    idempotencyKey: 'studyforge-db-deck-generation-0001',
  };
  const generated = await app.inject({
    method: 'POST', url: '/v1/modules/studyforge-ai/generations',
    headers: headers(ownerA, ownerA.currentTenantId), payload,
  });
  assert.equal(generated.statusCode, 201, generated.body);
  assert.equal(generated.json().generation.provider, 'test');
  assert.equal(generated.json().entity.status, 'draft');
  assert.equal(generated.json().reviewRequired, true);
  deckId = generated.json().entity.id;
  const replay = await app.inject({
    method: 'POST', url: '/v1/modules/studyforge-ai/generations',
    headers: headers(ownerA, ownerA.currentTenantId), payload,
  });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.json().entity.id, deckId);
  assert.equal(replay.json().replayed, true);
  const workspace = await app.inject({
    method: 'GET', url: '/v1/modules/studyforge-ai/workspace',
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  assert.equal(workspace.statusCode, 200, workspace.body);
  const deck = workspace.json().decks.find((item: any) => item.id === deckId);
  const card = workspace.json().cards.find((item: any) => item.deckId === deckId);
  assert.ok(card.sourceExcerpt);
  const fabricated = await app.inject({
    method: 'PATCH', url: `/v1/modules/studyforge-ai/cards/${card.id}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { sourceExcerpt: 'A fabricated citation.', expectedVersion: card.version },
  });
  assert.equal(fabricated.statusCode, 422, fabricated.body);
  const edited = await app.inject({
    method: 'PATCH', url: `/v1/modules/studyforge-ai/cards/${card.id}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      question: 'What cellular structure generates ATP?',
      answer: 'Mitochondria',
      sourceExcerpt: card.sourceExcerpt,
      expectedVersion: card.version,
    },
  });
  assert.equal(edited.statusCode, 200, edited.body);
  assert.equal(edited.json().card.question, 'What cellular structure generates ATP?');
  for (const status of ['review', 'published']) {
    const moved = await app.inject({
      method: 'PATCH', url: `/v1/modules/studyforge-ai/decks/${deckId}/status`,
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: { status, expectedVersion: status === 'review' ? deck.version : deck.version + 1 },
    });
    assert.equal(moved.statusCode, 200, moved.body);
  }
  const review = await app.inject({
    method: 'POST', url: `/v1/modules/studyforge-ai/cards/${card.id}/reviews`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { rating: 'good' },
  });
  assert.equal(review.statusCode, 200, review.body);
  assert.equal(review.json().progress.intervalDays, 3);
  const usage = await db.execute(sql`SELECT units FROM shared_usage_events
    WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id}
      AND operation='studyforge.ai_generation'`);
  assert.equal(usage.rows.length, 1);
  assert.equal(Number(usage.rows[0].units), 1);
});

test('StudyForge server-grades published quizzes and persists study-plan completion', async () => {
  const generate = async (type: 'quiz' | 'study_plan', idempotencyKey: string) => {
    const response = await app.inject({
      method: 'POST', url: '/v1/modules/studyforge-ai/generations',
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: { sourceId, subjectId, type, title: `${type} proof`, idempotencyKey },
    });
    assert.equal(response.statusCode, 201, response.body);
    return response.json().entity;
  };
  const quiz = await generate('quiz', 'studyforge-db-quiz-generation-0001');
  const draftWorkspace = await app.inject({
    method: 'GET', url: '/v1/modules/studyforge-ai/workspace',
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  const draftQuestion = draftWorkspace.json().questions.find((item: any) => item.quizId === quiz.id);
  assert.equal(draftQuestion.correctIndex, 0);
  const editedQuestion = await app.inject({
    method: 'PATCH', url: `/v1/modules/studyforge-ai/questions/${draftQuestion.id}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      question: 'Which organelle generates ATP?',
      choices: draftQuestion.choices,
      correctIndex: draftQuestion.correctIndex,
      explanation: 'The authorized notes identify mitochondria.',
      sourceExcerpt: draftQuestion.sourceExcerpt,
      expectedVersion: draftQuestion.version,
    },
  });
  assert.equal(editedQuestion.statusCode, 200, editedQuestion.body);
  for (const [status, expectedVersion] of [['review', quiz.version], ['published', quiz.version + 1]] as const) {
    const response = await app.inject({
      method: 'PATCH', url: `/v1/modules/studyforge-ai/quizzes/${quiz.id}/status`,
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: { status, expectedVersion },
    });
    assert.equal(response.statusCode, 200, response.body);
  }
  const workspace = await app.inject({
    method: 'GET', url: '/v1/modules/studyforge-ai/workspace',
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  const questions = workspace.json().questions.filter((item: any) => item.quizId === quiz.id);
  assert.ok(questions.length > 0);
  assert.equal(questions[0].correctIndex, 0);
  const attempt = await app.inject({
    method: 'POST', url: `/v1/modules/studyforge-ai/quizzes/${quiz.id}/attempts`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { answers: questions.map((question: any) => ({ questionId: question.id, selectedIndex: 0 })) },
  });
  assert.equal(attempt.statusCode, 201, attempt.body);
  assert.equal(attempt.json().attempt.scorePercent, 100);

  const plan = await generate('study_plan', 'studyforge-db-plan-generation-0001');
  const planWorkspace = await app.inject({
    method: 'GET', url: '/v1/modules/studyforge-ai/workspace',
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  const draftSession = planWorkspace.json().sessions.find((item: any) => item.planId === plan.id);
  const editedSession = await app.inject({
    method: 'PATCH', url: `/v1/modules/studyforge-ai/plan-sessions/${draftSession.id}/content`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: {
      title: 'Review cellular energy',
      focus: 'Explain ATP generation from the authorized source.',
      estimatedMinutes: 25,
      scheduledFor: '2026-08-01',
      expectedVersion: draftSession.version,
    },
  });
  assert.equal(editedSession.statusCode, 200, editedSession.body);
  for (const [status, expectedVersion] of [['review', plan.version], ['published', plan.version + 1]] as const) {
    const response = await app.inject({
      method: 'PATCH', url: `/v1/modules/studyforge-ai/plans/${plan.id}/status`,
      headers: headers(ownerA, ownerA.currentTenantId),
      payload: { status, expectedVersion },
    });
    assert.equal(response.statusCode, 200, response.body);
  }
  const refreshed = await app.inject({
    method: 'GET', url: '/v1/modules/studyforge-ai/workspace',
    headers: headers(ownerA, ownerA.currentTenantId),
  });
  const session = refreshed.json().sessions.find((item: any) => item.planId === plan.id);
  const completed = await app.inject({
    method: 'PATCH', url: `/v1/modules/studyforge-ai/plan-sessions/${session.id}`,
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { completed: true, expectedVersion: session.version },
  });
  assert.equal(completed.statusCode, 200, completed.body);
  assert.ok(completed.json().session.completedAt);
});

test('StudyForge prevents cross-tenant enumeration while viewers can read', async () => {
  const foreignGeneration = await app.inject({
    method: 'POST', url: '/v1/modules/studyforge-ai/generations',
    headers: headers(ownerB, ownerB.currentTenantId),
    payload: {
      sourceId, type: 'deck', title: 'Foreign attempt',
      idempotencyKey: 'studyforge-db-cross-tenant-0001',
    },
  });
  assert.equal(foreignGeneration.statusCode, 404, foreignGeneration.body);
  const foreignWorkspace = await app.inject({
    method: 'GET', url: '/v1/modules/studyforge-ai/workspace',
    headers: headers(ownerB, ownerB.currentTenantId),
  });
  assert.equal(foreignWorkspace.statusCode, 200, foreignWorkspace.body);
  assert.equal(foreignWorkspace.json().sources.some((item: any) => item.id === sourceId), false);
  assert.equal(foreignWorkspace.json().sources.some((item: any) => item.id === documentSourceId), false);
  const viewerRead = await app.inject({
    method: 'GET', url: '/v1/modules/studyforge-ai/workspace',
    headers: headers(viewer, ownerA.currentTenantId),
  });
  assert.equal(viewerRead.statusCode, 200, viewerRead.body);
  assert.equal(viewerRead.json().decks.some((item: any) => item.id === deckId), true);
  assert.equal(viewerRead.json().questions.some((item: any) => 'correctIndex' in item), false);
});
