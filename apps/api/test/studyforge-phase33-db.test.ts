process.env.SESSION_SECRET ||= 'operatoros-studyforge-phase33-db-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, tenantUserModuleAccess, tenantUsers } from '../src/schema.js';
import { ensureStudyForgeTables } from '../src/lib/studyforge-db-init.js';
import { ensureStudyForgePhase33Tables } from '../src/lib/studyforge-phase33-db-init.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: ReturnType<typeof Fastify>;
let ownerA: Awaited<ReturnType<typeof createTestUser>>;
let ownerB: Awaited<ReturnType<typeof createTestUser>>;
let viewer: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
let setId = '';
let detail: Record<string, any>;

function headers(user: typeof ownerA, tenantId: string) {
  return {
    authorization: `Bearer ${signToken({ userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion, sessionType: 'platform' })}`,
    'x-tenant-id': tenantId,
  };
}

async function makeApp() {
  const instance = Fastify();
  await instance.register(cookie);
  const { registerStudyForgeRoutes } = await import('../src/routes/studyforge-routes.js');
  const { registerStudyForgePhase33Routes } = await import('../src/routes/studyforge-phase33-routes.js');
  await registerStudyForgeRoutes(instance);
  await registerStudyForgePhase33Routes(instance);
  await instance.ready();
  return instance;
}

async function cleanTenant(tenantId: string) {
  await db.execute(sql`DELETE FROM studyforge_session_card_reviews WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_learning_sessions WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_exam_countdowns WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_short_answers WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_daily_activity WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_generation_reservations WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_usage_counters WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_card_progress WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_quiz_attempts WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_study_sets WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_cards WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_questions WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_plan_sessions WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_decks WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_quizzes WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_plans WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_generations WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_sources WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_subjects WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_folders WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM studyforge_preferences WHERE tenant_id=${tenantId}`);
  await db.execute(sql`DELETE FROM shared_usage_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
  await db.execute(sql`DELETE FROM shared_idempotency_keys WHERE tenant_id=${tenantId} AND module_id=${moduleRow.id}`);
}

function setPayload(title: string, key: string) {
  return {
    title,
    course: 'BIO-201',
    notes: 'Mitochondria generate ATP through oxidative phosphorylation. Cells use ATP as an energy carrier. Glycolysis occurs in the cytoplasm and produces pyruvate. Oxygen accepts electrons at the end of the transport chain.',
    difficulty: 'medium',
    examDate: '2026-09-01',
    generationMode: 'deterministic',
    idempotencyKey: key,
  };
}

async function withUnavailableAiProvider<T>(action: () => Promise<T>): Promise<T> {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAppEnv = process.env.APP_ENV;
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousDeterministicProviderMode = process.env.OPERATOROS_DETERMINISTIC_PROVIDER_MODE;
  process.env.NODE_ENV = 'production';
  process.env.APP_ENV = 'production';
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPERATOROS_DETERMINISTIC_PROVIDER_MODE;
  try {
    return await action();
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousAppEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = previousAppEnv;
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousApiKey;
    if (previousDeterministicProviderMode === undefined) delete process.env.OPERATOROS_DETERMINISTIC_PROVIDER_MODE; else process.env.OPERATOROS_DETERMINISTIC_PROVIDER_MODE = previousDeterministicProviderMode;
  }
}

before(async () => {
  await ensureSchemaReady();
  await ensureStudyForgeTables();
  await ensureStudyForgePhase33Tables();
  ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser();
  ownerB = await createTestUser();
  viewer = await createTestUser();
  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'studyforge-ai')).limit(1);
  moduleRow = existing ?? await createTestModule('studyforge-ai');
  createdModule = !existing;
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true, metadata: { features: { studyforgePlan: 'pro', studyforgeMonthlyGenerations: 100 } } },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true, metadata: { features: { studyforgePlan: 'free' } } },
  ]);
  await db.insert(tenantUsers).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'member' });
  await db.insert(tenantUserModuleAccess).values({ tenantId: ownerA.currentTenantId, userId: viewer.id, moduleId: moduleRow.id, accessLevel: 'viewer' });
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

test('Phase 33 requires OperatorOS authentication, trusted tenant scope, and write authority', async () => {
  const anonymous = await app.inject({ method: 'GET', url: '/v1/modules/studyforge-ai/dashboard' });
  assert.equal(anonymous.statusCode, 401, anonymous.body);
  const override = await app.inject({ method: 'POST', url: '/v1/modules/studyforge-ai/study-sets', headers: headers(ownerA, ownerA.currentTenantId), payload: { ...setPayload('Rejected', 'phase33-rejected-tenant-0001'), tenantId: ownerB.currentTenantId } });
  assert.equal(override.statusCode, 400, override.body);
  const setId = randomUUID();
  const folderId = randomUUID();
  const sessionId = randomUUID();
  const cardId = randomUUID();
  const planSessionId = randomUUID();
  const countdownId = randomUUID();
  for (const request of [
    { method: 'PUT', url: '/v1/modules/studyforge-ai/preferences', payload: {} },
    { method: 'POST', url: '/v1/modules/studyforge-ai/folders', payload: {} },
    { method: 'PATCH', url: `/v1/modules/studyforge-ai/folders/${folderId}`, payload: {} },
    { method: 'DELETE', url: `/v1/modules/studyforge-ai/folders/${folderId}`, payload: undefined },
    { method: 'POST', url: '/v1/modules/studyforge-ai/study-sets', payload: setPayload('Viewer rejected', 'phase33-viewer-rejected-0001') },
    { method: 'PATCH', url: `/v1/modules/studyforge-ai/study-sets/${setId}`, payload: { expectedVersion: 1, status: 'archived' } },
    { method: 'DELETE', url: `/v1/modules/studyforge-ai/study-sets/${setId}`, payload: undefined },
    { method: 'POST', url: `/v1/modules/studyforge-ai/study-sets/${setId}/quiz-attempts`, payload: { answers: [], idempotencyKey: 'phase33-viewer-quiz-0001' } },
    { method: 'POST', url: `/v1/modules/studyforge-ai/study-sets/${setId}/flashcard-sessions`, payload: { idempotencyKey: 'phase33-viewer-session-0001' } },
    { method: 'PATCH', url: `/v1/modules/studyforge-ai/flashcards/${cardId}/status`, payload: { status: 'known' } },
    { method: 'POST', url: `/v1/modules/studyforge-ai/flashcard-sessions/${sessionId}/cards/${cardId}`, payload: { state: 'known', clientMutationId: 'phase33-viewer-review-0001' } },
    { method: 'PATCH', url: `/v1/modules/studyforge-ai/flashcard-sessions/${sessionId}/complete`, payload: { durationSeconds: 60 } },
    { method: 'PATCH', url: `/v1/modules/studyforge-ai/study-sets/${setId}/plan-sessions/${planSessionId}/complete`, payload: { completed: true } },
    { method: 'POST', url: '/v1/modules/studyforge-ai/exam-countdowns', payload: {} },
    { method: 'DELETE', url: `/v1/modules/studyforge-ai/exam-countdowns/${countdownId}`, payload: undefined },
  ]) {
    const response = await app.inject({ method: request.method, url: request.url, headers: headers(viewer, ownerA.currentTenantId), ...(request.payload === undefined ? {} : { payload: request.payload }) });
    assert.equal(response.statusCode, 403, response.body);
  }
});

test('notes create every persisted artifact atomically and idempotent replay reuses the business row', async () => {
  const payload = setPayload('Cell Energy Mastery', 'phase33-complete-set-0001');
  const created = await app.inject({ method: 'POST', url: '/v1/modules/studyforge-ai/study-sets', headers: headers(ownerA, ownerA.currentTenantId), payload });
  assert.equal(created.statusCode, 201, created.body);
  setId = created.json().set.id;
  const replay = await app.inject({ method: 'POST', url: '/v1/modules/studyforge-ai/study-sets', headers: headers(ownerA, ownerA.currentTenantId), payload });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().replayed, true);
  assert.equal(replay.json().set.id, setId);

  const stored = await db.execute(sql`SELECT
    (SELECT count(*) FROM studyforge_study_sets WHERE tenant_id=${ownerA.currentTenantId})::int AS sets,
    (SELECT count(*) FROM studyforge_generations WHERE tenant_id=${ownerA.currentTenantId} AND generation_type='complete_set')::int AS generations,
    (SELECT count(*) FROM studyforge_decks WHERE tenant_id=${ownerA.currentTenantId})::int AS decks,
    (SELECT count(*) FROM studyforge_quizzes WHERE tenant_id=${ownerA.currentTenantId})::int AS quizzes,
    (SELECT count(*) FROM studyforge_plans WHERE tenant_id=${ownerA.currentTenantId})::int AS plans,
    (SELECT count(*) FROM shared_usage_events WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id} AND operation='studyforge.complete_generation')::int AS usage_events`);
  assert.deepEqual({
    sets: Number(stored.rows[0].sets), generations: Number(stored.rows[0].generations),
    decks: Number(stored.rows[0].decks), quizzes: Number(stored.rows[0].quizzes),
    plans: Number(stored.rows[0].plans), usageEvents: Number(stored.rows[0].usage_events),
  }, { sets: 1, generations: 1, decks: 1, quizzes: 1, plans: 1, usageEvents: 1 });

  const response = await app.inject({ method: 'GET', url: `/v1/modules/studyforge-ai/study-sets/${setId}`, headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(response.statusCode, 200, response.body);
  detail = response.json();
  assert.ok(detail.summary.includes('Mitochondria'));
  assert.ok(detail.keyTerms.length > 0);
  assert.ok(detail.cards.length > 0);
  assert.ok(detail.questions.length > 0);
  assert.ok(detail.shortAnswers.length > 0);
  assert.ok(detail.reviewSheet.sections.length > 0);
  assert.ok(detail.studyPlan.length > 0);
  assert.equal(detail.generationProvenance.effectiveMode, 'deterministic');
});

test('quiz, flashcard, and plan sessions persist review/history exactly once', async () => {
  const answers = detail.questions.map((question: Record<string, any>) => ({ questionId: question.id, selectedIndex: 0 }));
  const quizPayload = { answers, idempotencyKey: 'phase33-quiz-attempt-0001' };
  const quiz = await app.inject({ method: 'POST', url: `/v1/modules/studyforge-ai/study-sets/${setId}/quiz-attempts`, headers: headers(ownerA, ownerA.currentTenantId), payload: quizPayload });
  assert.equal(quiz.statusCode, 201, quiz.body);
  assert.equal(quiz.json().attempt.reviewJson.length, detail.questions.length);
  const quizReplay = await app.inject({ method: 'POST', url: `/v1/modules/studyforge-ai/study-sets/${setId}/quiz-attempts`, headers: headers(ownerA, ownerA.currentTenantId), payload: quizPayload });
  assert.equal(quizReplay.statusCode, 200, quizReplay.body);
  assert.equal(quizReplay.json().replayed, true);

  const started = await app.inject({ method: 'POST', url: `/v1/modules/studyforge-ai/study-sets/${setId}/flashcard-sessions`, headers: headers(ownerA, ownerA.currentTenantId), payload: { idempotencyKey: 'phase33-flash-session-0001' } });
  assert.equal(started.statusCode, 201, started.body);
  const sessionId = started.json().id;
  const reviewPayload = { state: 'known', clientMutationId: 'phase33-flash-review-0001' };
  const reviewed = await app.inject({ method: 'POST', url: `/v1/modules/studyforge-ai/flashcard-sessions/${sessionId}/cards/${detail.cards[0].id}`, headers: headers(ownerA, ownerA.currentTenantId), payload: reviewPayload });
  assert.equal(reviewed.statusCode, 200, reviewed.body);
  const reviewReplay = await app.inject({ method: 'POST', url: `/v1/modules/studyforge-ai/flashcard-sessions/${sessionId}/cards/${detail.cards[0].id}`, headers: headers(ownerA, ownerA.currentTenantId), payload: reviewPayload });
  assert.equal(reviewReplay.statusCode, 200, reviewReplay.body);
  assert.equal(reviewReplay.json().replayed, true);
  for (let replay = 0; replay < 2; replay += 1) {
    const completed = await app.inject({ method: 'PATCH', url: `/v1/modules/studyforge-ai/flashcard-sessions/${sessionId}/complete`, headers: headers(ownerA, ownerA.currentTenantId), payload: { durationSeconds: 120 } });
    assert.equal(completed.statusCode, 200, completed.body);
  }
  for (let replay = 0; replay < 2; replay += 1) {
    const completed = await app.inject({ method: 'PATCH', url: `/v1/modules/studyforge-ai/study-sets/${setId}/plan-sessions/${detail.studyPlan[0].id}/complete`, headers: headers(ownerA, ownerA.currentTenantId), payload: { completed: true } });
    assert.equal(completed.statusCode, 200, completed.body);
  }
  const daily = await db.execute(sql`SELECT study_seconds,cards_reviewed,quiz_attempts,sessions_completed FROM studyforge_daily_activity WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
  assert.equal(daily.rows.length, 1);
  assert.equal(Number(daily.rows[0].cards_reviewed), 1);
  assert.equal(Number(daily.rows[0].quiz_attempts), 1);
  assert.equal(Number(daily.rows[0].sessions_completed), 3);
  assert.equal(Number(daily.rows[0].study_seconds), 120 + Number(detail.studyPlan[0].estimatedMinutes) * 60);
});

test('user/tenant isolation, plan projection, countdown, and export gates are enforced', async () => {
  const viewerRead = await app.inject({ method: 'GET', url: `/v1/modules/studyforge-ai/study-sets/${setId}`, headers: headers(viewer, ownerA.currentTenantId) });
  assert.equal(viewerRead.statusCode, 404, viewerRead.body);
  const tenantRead = await app.inject({ method: 'GET', url: `/v1/modules/studyforge-ai/study-sets/${setId}`, headers: headers(ownerB, ownerB.currentTenantId) });
  assert.equal(tenantRead.statusCode, 404, tenantRead.body);
  const account = await app.inject({ method: 'GET', url: '/v1/modules/studyforge-ai/account', headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(account.statusCode, 200, account.body);
  assert.equal(account.json().plan.plan, 'pro');
  assert.equal(account.json().billingAuthority, 'OperatorOS');
  const countdown = await app.inject({ method: 'POST', url: '/v1/modules/studyforge-ai/exam-countdowns', headers: headers(ownerA, ownerA.currentTenantId), payload: { title: 'Certification', examDate: '2026-09-01', timeZone: 'America/New_York', studySetId: setId } });
  assert.equal(countdown.statusCode, 201, countdown.body);
  const csv = await app.inject({ method: 'GET', url: `/v1/modules/studyforge-ai/study-sets/${setId}/export?format=csv`, headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(csv.statusCode, 200, csv.body);
  assert.match(csv.body, /short_answer/);
  const freeCountdown = await app.inject({ method: 'POST', url: '/v1/modules/studyforge-ai/exam-countdowns', headers: headers(ownerB, ownerB.currentTenantId), payload: { title: 'Blocked', examDate: '2026-09-01', timeZone: 'UTC' } });
  assert.equal(freeCountdown.statusCode, 403, freeCountdown.body);
});

test('free and concurrent generation limits fail closed without partial orphan rows', async () => {
  const freeSets: Record<string, any>[] = [];
  for (let index = 1; index <= 3; index += 1) {
    const response = await app.inject({ method: 'POST', url: '/v1/modules/studyforge-ai/study-sets', headers: headers(ownerB, ownerB.currentTenantId), payload: setPayload(`Free set ${index}`, `phase33-free-set-000${index}`) });
    assert.equal(response.statusCode, 201, response.body);
    freeSets.push(response.json().set);
  }
  const blocked = await app.inject({ method: 'POST', url: '/v1/modules/studyforge-ai/study-sets', headers: headers(ownerB, ownerB.currentTenantId), payload: setPayload('Free set 4', 'phase33-free-set-0004') });
  assert.equal(blocked.statusCode, 402, blocked.body);
  const freeCounts = await db.execute(sql`SELECT (SELECT count(*) FROM studyforge_study_sets WHERE tenant_id=${ownerB.currentTenantId})::int AS sets,(SELECT count(*) FROM studyforge_generations WHERE tenant_id=${ownerB.currentTenantId})::int AS generations,(SELECT generation_count FROM studyforge_usage_counters WHERE tenant_id=${ownerB.currentTenantId} AND user_id=${ownerB.id})::int AS usage`);
  assert.deepEqual({ sets: Number(freeCounts.rows[0].sets), generations: Number(freeCounts.rows[0].generations), usage: Number(freeCounts.rows[0].usage) }, { sets: 3, generations: 3, usage: 3 });

  await db.update(tenantModules).set({ metadata: { features: { studyforgePlan: 'pro', studyforgeMonthlyGenerations: 2 } }, updatedAt: new Date() }).where(eq(tenantModules.tenantId, ownerA.currentTenantId));
  await db.execute(sql`UPDATE studyforge_usage_counters SET generation_count=1 WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
  const concurrent = await Promise.all([
    app.inject({ method: 'POST', url: '/v1/modules/studyforge-ai/study-sets', headers: headers(ownerA, ownerA.currentTenantId), payload: setPayload('Concurrent A', 'phase33-concurrent-set-0001') }),
    app.inject({ method: 'POST', url: '/v1/modules/studyforge-ai/study-sets', headers: headers(ownerA, ownerA.currentTenantId), payload: setPayload('Concurrent B', 'phase33-concurrent-set-0002') }),
  ]);
  assert.deepEqual(concurrent.map((response) => response.statusCode).sort(), [201, 402]);
  const usage = await db.execute(sql`SELECT generation_count FROM studyforge_usage_counters WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
  assert.equal(Number(usage.rows[0].generation_count), 2);

  await db.update(tenantModules).set({ metadata: { features: { studyforgePlan: 'free', studyforgeMonthlyGenerations: 100 } }, updatedAt: new Date() }).where(eq(tenantModules.tenantId, ownerB.currentTenantId));
  const archived = await app.inject({ method: 'PATCH', url: `/v1/modules/studyforge-ai/study-sets/${freeSets[0].id}`, headers: headers(ownerB, ownerB.currentTenantId), payload: { status: 'archived', expectedVersion: freeSets[0].version } });
  assert.equal(archived.statusCode, 200, archived.body);
  const replacement = await app.inject({ method: 'POST', url: '/v1/modules/studyforge-ai/study-sets', headers: headers(ownerB, ownerB.currentTenantId), payload: setPayload('Free replacement', 'phase33-free-replacement-0001') });
  assert.equal(replacement.statusCode, 201, replacement.body);
  const restoreBlocked = await app.inject({ method: 'PATCH', url: `/v1/modules/studyforge-ai/study-sets/${freeSets[0].id}`, headers: headers(ownerB, ownerB.currentTenantId), payload: { status: 'active', expectedVersion: archived.json().version } });
  assert.equal(restoreBlocked.statusCode, 402, restoreBlocked.body);
  assert.equal(restoreBlocked.json().code, 'STUDYFORGE_SET_LIMIT_REACHED');
  const removeArchived = await app.inject({ method: 'DELETE', url: `/v1/modules/studyforge-ai/study-sets/${freeSets[0].id}`, headers: headers(ownerB, ownerB.currentTenantId) });
  assert.equal(removeArchived.statusCode, 204, removeArchived.body);

  await db.update(tenantModules).set({ metadata: { features: { studyforgePlan: 'pro', studyforgeMonthlyGenerations: 10 } }, updatedAt: new Date() }).where(eq(tenantModules.tenantId, ownerA.currentTenantId));
  const beforeProviderFailure = await db.execute(sql`SELECT generation_count FROM studyforge_usage_counters WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
  const unavailable = await withUnavailableAiProvider(() => app.inject({ method: 'POST', url: '/v1/modules/studyforge-ai/study-sets', headers: headers(ownerA, ownerA.currentTenantId), payload: { ...setPayload('Provider unavailable', 'phase33-provider-failure-0001'), generationMode: 'ai' } }));
  assert.equal(unavailable.statusCode, 503, unavailable.body);
  const afterProviderFailure = await db.execute(sql`SELECT generation_count FROM studyforge_usage_counters WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
  assert.equal(Number(afterProviderFailure.rows[0].generation_count), Number(beforeProviderFailure.rows[0].generation_count));
  const leakedReservation = await db.execute(sql`SELECT count(*)::int AS count FROM studyforge_generation_reservations WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
  assert.equal(Number(leakedReservation.rows[0].count), 0);

  await db.update(tenantModules).set({ metadata: { features: { studyforgePlan: 'pro', studyforgeMonthlyGenerations: 0 } }, updatedAt: new Date() }).where(eq(tenantModules.tenantId, ownerA.currentTenantId));
  await db.execute(sql`DELETE FROM studyforge_usage_counters WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
  const zeroLimit = await withUnavailableAiProvider(() => app.inject({ method: 'POST', url: '/v1/modules/studyforge-ai/study-sets', headers: headers(ownerA, ownerA.currentTenantId), payload: { ...setPayload('Zero limit', 'phase33-zero-limit-0001'), generationMode: 'ai' } }));
  assert.equal(zeroLimit.statusCode, 402, zeroLimit.body);
  assert.equal(zeroLimit.json().code, 'STUDYFORGE_GENERATION_LIMIT_REACHED');
  const zeroRows = await db.execute(sql`SELECT (SELECT count(*) FROM studyforge_usage_counters WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id})::int AS counters,(SELECT count(*) FROM studyforge_generation_reservations WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id})::int AS reservations`);
  assert.deepEqual({ counters: Number(zeroRows.rows[0].counters), reservations: Number(zeroRows.rows[0].reservations) }, { counters: 0, reservations: 0 });
  await db.update(tenantModules).set({ metadata: { features: { studyforgePlan: 'pro', studyforgeMonthlyGenerations: 100 } }, updatedAt: new Date() }).where(eq(tenantModules.tenantId, ownerA.currentTenantId));
});

test('v42 seeds current-period generation counters from shared OperatorOS usage', async () => {
  await db.execute(sql`DELETE FROM studyforge_usage_counters WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id}`);
  await db.execute(sql`INSERT INTO shared_usage_events(tenant_id,module_id,user_id,operation,units,unit_kind,idempotency_key,occurred_at) VALUES (${ownerA.currentTenantId},${moduleRow.id},${ownerA.id},'studyforge.ai_generation',2,'generation','phase33-backfill-fixture-0001',NOW())`);
  const expected = await db.execute(sql`SELECT COALESCE(sum(units),0)::int AS count FROM shared_usage_events WHERE tenant_id=${ownerA.currentTenantId} AND module_id=${moduleRow.id} AND user_id=${ownerA.id} AND operation IN ('studyforge.ai_generation','studyforge.complete_generation') AND occurred_at>=date_trunc('month',CURRENT_DATE)`);
  await ensureStudyForgePhase33Tables();
  const counter = await db.execute(sql`SELECT generation_count FROM studyforge_usage_counters WHERE tenant_id=${ownerA.currentTenantId} AND user_id=${ownerA.id} AND period_start=date_trunc('month',CURRENT_DATE)::date`);
  assert.equal(Number(counter.rows[0].generation_count), Number(expected.rows[0].count));
});

test('archive/restore and soft-delete cascade remove active generated outcomes without affecting another user', async () => {
  const current = await app.inject({ method: 'GET', url: `/v1/modules/studyforge-ai/study-sets/${setId}`, headers: headers(ownerA, ownerA.currentTenantId) });
  const archived = await app.inject({ method: 'PATCH', url: `/v1/modules/studyforge-ai/study-sets/${setId}`, headers: headers(ownerA, ownerA.currentTenantId), payload: { status: 'archived', expectedVersion: current.json().version } });
  assert.equal(archived.statusCode, 200, archived.body);
  const restored = await app.inject({ method: 'PATCH', url: `/v1/modules/studyforge-ai/study-sets/${setId}`, headers: headers(ownerA, ownerA.currentTenantId), payload: { status: 'active', expectedVersion: archived.json().version } });
  assert.equal(restored.statusCode, 200, restored.body);
  const removed = await app.inject({ method: 'DELETE', url: `/v1/modules/studyforge-ai/study-sets/${setId}`, headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(removed.statusCode, 204, removed.body);
  const gone = await app.inject({ method: 'GET', url: `/v1/modules/studyforge-ai/study-sets/${setId}`, headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(gone.statusCode, 404, gone.body);
  const activeChildren = await db.execute(sql`SELECT
    (SELECT count(*) FROM studyforge_cards card JOIN studyforge_study_sets set ON set.tenant_id=card.tenant_id AND set.deck_id=card.deck_id WHERE set.id=${setId} AND card.deleted_at IS NULL)::int AS cards,
    (SELECT count(*) FROM studyforge_questions question JOIN studyforge_study_sets set ON set.tenant_id=question.tenant_id AND set.quiz_id=question.quiz_id WHERE set.id=${setId} AND question.deleted_at IS NULL)::int AS questions,
    (SELECT count(*) FROM studyforge_short_answers WHERE study_set_id=${setId} AND deleted_at IS NULL)::int AS short_answers`);
  assert.deepEqual({ cards: Number(activeChildren.rows[0].cards), questions: Number(activeChildren.rows[0].questions), shortAnswers: Number(activeChildren.rows[0].short_answers) }, { cards: 0, questions: 0, shortAnswers: 0 });
  const otherTenant = await db.execute(sql`SELECT count(*)::int AS count FROM studyforge_study_sets WHERE tenant_id=${ownerB.currentTenantId} AND deleted_at IS NULL`);
  assert.equal(Number(otherTenant.rows[0].count), 3);
});
