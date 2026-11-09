// Prepared PostgreSQL regression. Typechecked only during the 2026-11-09
// source repair; execution requires a separately approved disposable database.
process.env.SESSION_SECRET ||= 'operatoros-studyforge-replay-db-test-v1';
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db, databasePool } from '../src/db.js';
import { modules, tenantModules, tenantUsers } from '../src/schema.js';
import { ensureStudyForgeTables } from '../src/lib/studyforge-db-init.js';
import { ensureStudyForgePhase33Tables } from '../src/lib/studyforge-phase33-db-init.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

type Row = Record<string, any>;
const base = '/v1/modules/studyforge-ai';
let app: ReturnType<typeof Fastify>;
let owner: Awaited<ReturnType<typeof createTestUser>>;
let peer: Awaited<ReturnType<typeof createTestUser>>;
let moduleRow: typeof modules.$inferSelect;
let createdModule = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
const sets: Row[] = [];

function headers(user = owner) {
  return { authorization: `Bearer ${signToken({ userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion, sessionType: 'platform' })}`, 'x-tenant-id': owner.currentTenantId };
}
const post = async (url: string, payload: Row) => app.inject({ method: 'POST', url: base + url, headers: headers(), payload });
const quiz = (set: Row, key: string, answers = set.questions.map((q: Row) => ({ questionId: q.id, selectedIndex: 0 }))) => post(`/study-sets/${set.id}/quiz-attempts`, { answers, idempotencyKey: key });
const start = (set: Row, key: string) => post(`/study-sets/${set.id}/flashcard-sessions`, { idempotencyKey: key });
const review = (sessionId: string, cardId: string, state: string, key: string) => post(`/flashcard-sessions/${sessionId}/cards/${cardId}`, { state, clientMutationId: key });

async function waitForBlockedQuery(blockerPid: number, pattern: RegExp): Promise<number> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const check = await databasePool.query<{ pid: number; query: string }>('SELECT pid,query FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))', [blockerPid]);
    const blocked = check.rows.find(row => pattern.test(row.query));
    if (blocked) return blocked.pid;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Request did not block at the expected statement: ${pattern}`);
}

async function accounting() {
  const result = await db.execute(sql`SELECT
    (SELECT count(*)::int FROM studyforge_quiz_attempts WHERE tenant_id=${owner.currentTenantId} AND user_id=${owner.id}) AS attempts,
    (SELECT COALESCE(sum(quiz_attempt_count),0)::int FROM studyforge_usage_counters WHERE tenant_id=${owner.currentTenantId} AND user_id=${owner.id}) AS usage,
    (SELECT COALESCE(sum(quiz_attempts),0)::int FROM studyforge_daily_activity WHERE tenant_id=${owner.currentTenantId} AND user_id=${owner.id}) AS daily,
    (SELECT count(*)::int FROM shared_usage_events WHERE tenant_id=${owner.currentTenantId} AND user_id=${owner.id} AND operation='studyforge.quiz_attempt') AS events,
    (SELECT count(*)::int FROM studyforge_session_card_reviews WHERE tenant_id=${owner.currentTenantId} AND user_id=${owner.id}) AS reviews,
    (SELECT COALESCE(sum(cards_seen),0)::int FROM studyforge_learning_sessions WHERE tenant_id=${owner.currentTenantId} AND user_id=${owner.id}) AS cards,
    (SELECT COALESCE(sum(repetitions+lapses),0)::int FROM studyforge_card_progress WHERE tenant_id=${owner.currentTenantId} AND user_id=${owner.id}) AS progress`);
  return result.rows[0] as Row;
}

before(async () => {
  // This validates the pool's captured URL before any DDL or fixture writes.
  // Missing, remote, query-retargeted and persistent targets fail, never skip.
  await ensureSchemaReady();
  await ensureStudyForgeTables();
  await ensureStudyForgePhase33Tables();
  owner = await createTestUser();
  const [existing] = await db.select().from(modules).where(eq(modules.slug, 'studyforge-ai')).limit(1);
  moduleRow = existing ?? await createTestModule('studyforge-ai'); createdModule = !existing;
  await db.insert(tenantModules).values({ tenantId: owner.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true, metadata: { features: { studyforgePlan: 'pro', studyforgeMonthlyGenerations: 100 } } });
  ({ signToken } = await import('../src/lib/auth.js'));
  app = Fastify(); await app.register(cookie);
  const { registerStudyForgePhase33Routes } = await import('../src/routes/studyforge-phase33-routes.js');
  await registerStudyForgePhase33Routes(app); await app.ready();
  for (let index = 0; index < 2; index++) {
    const created = await post('/study-sets', { title: `Replay fixture ${index}`, notes: 'Mitochondria generate ATP through oxidative phosphorylation. Cells use ATP as an energy carrier. Glycolysis occurs in the cytoplasm and produces pyruvate.', generationMode: 'deterministic', idempotencyKey: `replay-fixture-set-${index}` });
    assert.equal(created.statusCode, 201, created.body);
    const detail = await app.inject({ method: 'GET', url: `${base}/study-sets/${created.json().set.id}`, headers: headers() });
    assert.equal(detail.statusCode, 200, detail.body); sets.push(detail.json());
  }
});

after(async () => {
  if (app) await app.close();
  if (owner) await cleanupUser(owner.id);
  if (peer) await cleanupUser(peer.id);
  if (createdModule && moduleRow) await cleanupModule(moduleRow.id);
});

test('PostgreSQL quiz exact/changed/cross-target races persist and account once per winning key', async () => {
  for (const kind of ['exact', 'answers', 'quiz'] as const) {
    const key = `pg-quiz-race-${kind}`; const before = await accounting();
    const submitted = sets[0].questions.map((q: Row) => ({ questionId: q.id, selectedIndex: 0 }));
    const results = await Promise.all([quiz(sets[0], key, submitted), quiz(kind === 'quiz' ? sets[1] : sets[0], key, kind === 'answers' ? submitted.map((a: Row) => ({ ...a, selectedIndex: 1 })) : kind === 'exact' ? [...submitted].reverse() : undefined)]);
    assert.deepEqual(results.map(r => r.statusCode).sort(), kind === 'exact' ? [200, 201] : [201, 409], results.map(r => r.body).join('\n'));
    const after = await accounting(); for (const field of ['attempts', 'usage', 'daily', 'events']) assert.equal(after[field], before[field] + 1);
  }
  const first = await quiz(sets[0], 'pg-quiz-revision'); assert.equal(first.statusCode, 201, first.body);
  await db.execute(sql`UPDATE studyforge_questions SET explanation='Revised after accepted attempt',correct_index=(correct_index+1)%jsonb_array_length(choices),version=version+1 WHERE tenant_id=${owner.currentTenantId} AND quiz_id=${sets[0].quizId}`);
  const before = await accounting(); const replay = await quiz(sets[0], 'pg-quiz-revision'); assert.equal(replay.statusCode, 200); assert.deepEqual(replay.json().attempt, first.json().attempt); assert.deepEqual(await accounting(), before);
});

test('PostgreSQL two users sharing a quiz client key receive separate attempt-bound usage events', async () => {
  peer = await createTestUser();
  await db.insert(tenantUsers).values({ tenantId: owner.currentTenantId, userId: peer.id, role: 'member' });
  const created = await app.inject({ method: 'POST', url: `${base}/study-sets`, headers: headers(peer), payload: { title: 'Peer replay set', notes: 'Cells use ATP as an energy carrier. Mitochondria generate ATP through oxidative phosphorylation. Glycolysis produces pyruvate.', generationMode: 'deterministic', idempotencyKey: 'pg-peer-study-set' } });
  assert.equal(created.statusCode, 201, created.body); const set = created.json().set;
  const detail = await app.inject({ method: 'GET', url: `${base}/study-sets/${set.id}`, headers: headers(peer) }); assert.equal(detail.statusCode, 200, detail.body);
  const key = 'pg-two-users-shared-key';
  const submitPeer = async () => app.inject({ method: 'POST', url: `${base}/study-sets/${set.id}/quiz-attempts`, headers: headers(peer), payload: { answers: detail.json().questions.map((q: Row) => ({ questionId: q.id, selectedIndex: 0 })), idempotencyKey: key } });
  const [first, second] = await Promise.all([quiz(sets[0], key), submitPeer()]); assert.equal(first.statusCode, 201, first.body); assert.equal(second.statusCode, 201, second.body);
  const ids = [first.json().attempt.id, second.json().attempt.id];
  const events = await db.execute(sql`SELECT user_id,idempotency_key,external_reference FROM shared_usage_events WHERE tenant_id=${owner.currentTenantId} AND operation='studyforge.quiz_attempt' AND external_reference IN (${ids[0]},${ids[1]}) ORDER BY user_id`);
  assert.equal(events.rows.length, 2); assert.equal(new Set(events.rows.map(row => row.user_id)).size, 2);
  for (const row of events.rows) assert.equal(row.idempotency_key, `studyforge.quiz_attempt:${row.external_reference}`);
  const before = await accounting(); assert.equal((await quiz(sets[0], key)).statusCode, 200); assert.equal((await submitPeer()).statusCode, 200); assert.deepEqual(await accounting(), before);
  const count = await db.execute(sql`SELECT count(*)::int AS count FROM shared_usage_events WHERE tenant_id=${owner.currentTenantId} AND operation='studyforge.quiz_attempt' AND external_reference IN (${ids[0]},${ids[1]})`); assert.equal(count.rows[0].count, 2);
});

test('PostgreSQL flashcard session atomic upsert binds target and stored server intent', async () => {
  const exact = await Promise.all([start(sets[0], 'pg-session-exact'), start(sets[0], 'pg-session-exact')]); assert.deepEqual(exact.map(r => r.statusCode), [201, 201]); assert.equal(exact[0].json().id, exact[1].json().id);
  const mixed = await Promise.all([start(sets[0], 'pg-session-mixed'), start(sets[1], 'pg-session-mixed')]); assert.deepEqual(mixed.map(r => r.statusCode).sort(), [201, 409]);
  await db.execute(sql`UPDATE studyforge_learning_sessions SET session_type='review',cards_seen=4,completed_at=NOW() WHERE tenant_id=${owner.currentTenantId} AND user_id=${owner.id} AND client_mutation_id='pg-session-exact'`);
  const before = await accounting(); assert.equal((await start(sets[0], 'pg-session-exact')).statusCode, 409); assert.deepEqual(await accounting(), before);
});

test('PostgreSQL card review races bind state and session with exactly-once progress', async () => {
  const a = (await start(sets[0], 'pg-cards-session-a')).json().id; const b = (await start(sets[0], 'pg-cards-session-b')).json().id;
  for (const kind of ['exact', 'state', 'session', 'card'] as const) {
    const key = `pg-cards-race-${kind}`; const before = await accounting();
    const results = await Promise.all([review(a, sets[0].cards[0].id, 'known', key), review(kind === 'session' ? b : a, sets[0].cards[kind === 'card' ? 1 : 0].id, kind === 'state' ? 'learning' : 'known', key)]);
    assert.deepEqual(results.map(r => r.statusCode).sort(), kind === 'exact' ? [200, 200] : [200, 409], results.map(r => r.body).join('\n'));
    if (kind === 'exact') assert.deepEqual(results.map(r => r.json().replayed).sort(), [false, true]);
    const after = await accounting(); for (const field of ['reviews', 'cards', 'progress']) assert.equal(after[field], before[field] + 1);
  }
});

test('PostgreSQL conflict loser reads a previously invisible committed card-review winner', async () => {
  const session = (await start(sets[0], 'pg-invisible-session')).json().id;
  const otherSession = (await start(sets[0], 'pg-invisible-other-session')).json().id;
  const client = await databasePool.connect(); let request: ReturnType<typeof review> | undefined;
  try {
    await client.query('BEGIN');
    const { rows: [{ pid }] } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    await client.query('INSERT INTO studyforge_session_card_reviews(tenant_id,user_id,session_id,card_id,learning_state,client_mutation_id) VALUES ($1,$2,$3,$4,$5,$6)', [owner.currentTenantId, owner.id, session, sets[0].cards[0].id, 'known', 'pg-invisible-key']);
    // Use a different session so the winner's FK KEY SHARE does not block the
    // request's session FOR UPDATE before it reaches the unique-key conflict.
    request = review(otherSession, sets[0].cards[0].id, 'learning', 'pg-invisible-key');
    await waitForBlockedQuery(pid, /INSERT INTO studyforge_session_card_reviews/);
    await client.query('COMMIT'); const before = await accounting(); const response = await request;
    assert.equal(response.statusCode, 409, response.body); assert.equal(response.json().code, 'STUDYFORGE_IDEMPOTENCY_CONFLICT'); assert.deepEqual(await accounting(), before);
    assert.equal((await review(session, sets[0].cards[0].id, 'known', 'pg-invisible-key')).json().replayed, true);
  } finally { await client.query('ROLLBACK'); client.release(); if (request) await request; }
});

test('PostgreSQL completion committed while review waits is rechecked before effects', async () => {
  const session = (await start(sets[0], 'pg-completion-first')).json().id;
  const client = await databasePool.connect(); let request: ReturnType<typeof review> | undefined;
  try {
    await client.query('BEGIN'); const { rows: [{ pid }] } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    await client.query('UPDATE studyforge_learning_sessions SET completed_at=NOW() WHERE tenant_id=$1 AND user_id=$2 AND id=$3', [owner.currentTenantId, owner.id, session]);
    const before = await accounting(); request = review(session, sets[0].cards[0].id, 'known', 'pg-completion-first-review');
    await waitForBlockedQuery(pid, /SELECT session.id FROM studyforge_learning_sessions/);
    await client.query('COMMIT'); assert.equal((await request).statusCode, 404); assert.deepEqual(await accounting(), before);
  } finally { await client.query('ROLLBACK'); client.release(); if (request) await request; }
});

test('PostgreSQL review holding the session lock finishes before completion counts cards', async () => {
  const session = (await start(sets[0], 'pg-review-first')).json().id; const cardId = sets[0].cards[0].id;
  // A real progress-row lock pauses the handler after it owns the session row.
  await db.execute(sql`INSERT INTO studyforge_card_progress(tenant_id,card_id,user_id) VALUES (${owner.currentTenantId},${cardId},${owner.id}) ON CONFLICT (tenant_id,user_id,card_id) DO NOTHING`);
  const client = await databasePool.connect(); let request: ReturnType<typeof review> | undefined; let completion: Promise<Awaited<ReturnType<typeof app.inject>>> | undefined;
  try {
    await client.query('BEGIN'); const { rows: [{ pid }] } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    await client.query('SELECT card_id FROM studyforge_card_progress WHERE tenant_id=$1 AND user_id=$2 AND card_id=$3 FOR UPDATE', [owner.currentTenantId, owner.id, cardId]);
    request = review(session, cardId, 'known', 'pg-review-first-review');
    const reviewPid = await waitForBlockedQuery(pid, /INSERT INTO studyforge_card_progress/);
    completion = Promise.resolve(app.inject({ method: 'PATCH', url: `${base}/flashcard-sessions/${session}/complete`, headers: headers(), payload: { durationSeconds: 10 } }));
    await waitForBlockedQuery(reviewPid, /SELECT \* FROM studyforge_learning_sessions/);
    await client.query('COMMIT'); assert.equal((await request).statusCode, 200); const done = await completion; assert.equal(done.statusCode, 200, done.body); assert.equal(done.json().cardsSeen, 1); assert.ok(done.json().completedAt);
    const before = await accounting(); assert.equal((await review(session, cardId, 'known', 'pg-review-first-review')).statusCode, 404); assert.deepEqual(await accounting(), before);
  } finally { await client.query('ROLLBACK'); client.release(); if (request) await request; if (completion) await completion; }
});
