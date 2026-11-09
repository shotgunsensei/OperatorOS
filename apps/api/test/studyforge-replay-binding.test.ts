import assert from 'node:assert/strict';
import test from 'node:test';
import { compileOpsSql, loadOpsRoute, opsSelectMatches } from './_ops-isolated-route-fixture.js';
import { guards, loadSource, routeCollector, type Row } from './creative-route-quality-fixture.js';

const base = '/v1/modules/studyforge-ai/study-sets/:id';
const setA = '00000000-0000-0000-0000-000000000001';
const setB = '00000000-0000-0000-0000-000000000002';
const questionA = '10000000-0000-0000-0000-000000000001';
const questionB = '10000000-0000-0000-0000-000000000002';
const cardA = '30000000-0000-0000-0000-000000000001';
const cardB = '30000000-0000-0000-0000-000000000002';
const answers = [{ questionId: questionA, selectedIndex: 0 }, { questionId: questionB, selectedIndex: 1 }];
const otherAnswers = answers.map((answer, index) => ({ ...answer, questionId: `10000000-0000-0000-0000-00000000000${index + 3}` }));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// Runs the entire real route module, real write guard, usage reservation and
// daily-activity helper. Only identity/access and persistence are synthetic.
// Transactions are serialized and rolled back by this fixture, not PostgreSQL.
async function fixture(options: { limit?: number; failUsage?: boolean; denyAccess?: boolean } = {}) {
  const sets: Row[] = [setA, setB].map((id, index) => ({ id, tenant_id: 'tenant-a', user_id: 'owner-a', quiz_id: `quiz-${index}`, deck_id: `deck-${index}`, deleted_at: null }));
  const cards = [cardA, cardB].map(id => ({ id, tenant_id: 'tenant-a', deck_id: 'deck-0', deleted_at: null as string | null }));
  const questions: Row[] = [0, 1].flatMap(quiz => (quiz === 0 ? answers : otherAnswers).map((answer, position) => ({
    id: answer.questionId, tenant_id: 'tenant-a', quiz_id: `quiz-${quiz}`, deleted_at: null,
    correct_index: position, explanation: `Original explanation ${position}`, source_excerpt: 'Original source',
  })));
  let state = { attempts: [] as Row[], sessions: [] as Row[], reviews: [] as Row[], usage: [] as Row[], daily: [] as Row[], events: [] as Row[], progress: [{ repetitions: 4, lapses: 2 }] as Row[] };
  const queries: ReturnType<typeof compileOpsSql>[] = [];
  let tail = Promise.resolve(), beforeSetLoad: (() => void) | undefined, beforeSessionLock: (() => void) | undefined;
  let accessChecks = 0;
  const execute = async (statement: Parameters<typeof compileOpsSql>[0]) => {
    const query = compileOpsSql(statement); queries.push(query);
    const text = query.sql.replace(/\s+/g, ' ').trim(), p = query.params;
    if (text.startsWith('SELECT pg_advisory_xact_lock')) {
      assert.match(text, /^SELECT pg_advisory_xact_lock\(hashtextextended\(\$1,0\)\)$/);
      assert.match(String(p[0]), /^tenant-[ab]:owner-[ab]:quiz:/); return { rows: [] };
    }
    if (text.startsWith('SELECT * FROM studyforge_study_sets')) {
      assert.match(text, /FOR SHARE$/);
      beforeSetLoad?.(); beforeSetLoad = undefined;
      return { rows: sets.filter(row => opsSelectMatches(query, row)) };
    }
    if (text.startsWith('SELECT * FROM studyforge_quiz_attempts')) {
      assert.match(queries.at(-3)?.sql ?? '', /pg_advisory_xact_lock/);
      return { rows: state.attempts.filter(row => opsSelectMatches(query, row)) };
    }
    if (text.startsWith('SELECT * FROM studyforge_questions')) return { rows: questions.filter(row => opsSelectMatches(query, row)) };
    if (text.startsWith('INSERT INTO studyforge_usage_counters')) {
      const existing = state.usage.find(row => row.tenant_id === p[0] && row.user_id === p[1]);
      const bound = /WHERE studyforge_usage_counters\.quiz_attempt_count < \$(\d+)/.exec(text);
      if (existing && bound && existing.quiz_attempt_count >= Number(p[Number(bound[1]) - 1])) return { rows: [] };
      const row = existing ?? { tenant_id: p[0], user_id: p[1], generation_count: 0, quiz_attempt_count: 0 };
      if (!existing) state.usage.push(row);
      row.quiz_attempt_count++; return { rows: [row] };
    }
    if (text.startsWith('INSERT INTO studyforge_quiz_attempts')) {
      assert.equal(state.attempts.some(row => row.tenant_id === p[0] && row.user_id === p[2] && row.idempotency_key === p[7]), false, 'Existing unique key must never be inserted again');
      const row = { id: `attempt-${state.attempts.length}`, tenant_id: p[0], quiz_id: p[1], user_id: p[2], answers: JSON.parse(String(p[3])), correct_count: p[4], total_count: p[5], score_percent: p[6], idempotency_key: p[7], review_json: JSON.parse(String(p[8])), completed_at: '2026-11-09T00:00:00Z' };
      state.attempts.push(row); return { rows: [row] };
    }
    if (text.startsWith('SELECT * FROM studyforge_preferences')) return { rows: [] };
    if (text.startsWith('INSERT INTO studyforge_daily_activity')) {
      const row = state.daily.find(item => item.tenant_id === p[0] && item.user_id === p[1]);
      if (row) { row.quiz_attempts += Number(p[5]); row.sessions_completed += Number(p[6]); }
      else state.daily.push({ tenant_id: p[0], user_id: p[1], study_seconds: p[3], cards_reviewed: p[4], quiz_attempts: p[5], sessions_completed: p[6] });
      return { rows: [] };
    }
    if (text.startsWith('SELECT id FROM modules')) { assert.equal(p[0], 'studyforge-ai'); return { rows: [{ id: 'studyforge-module' }] }; }
    if (text.startsWith('INSERT INTO studyforge_learning_sessions')) {
      assert.match(text, /ON CONFLICT \(tenant_id,user_id,client_mutation_id\) DO UPDATE SET client_mutation_id=EXCLUDED.client_mutation_id WHERE studyforge_learning_sessions.study_set_id=EXCLUDED.study_set_id AND studyforge_learning_sessions.session_type=EXCLUDED.session_type RETURNING \*$/);
      assert.match(text, /VALUES \(\$1,\$2,\$3,'flashcards',\$4\)/);
      const existing = state.sessions.find(row => row.tenant_id === p[0] && row.user_id === p[1] && row.client_mutation_id === p[3]);
      if (existing) return { rows: existing.study_set_id === p[2] && existing.session_type === 'flashcards' ? [existing] : [] };
      const row = { id: `20000000-0000-0000-0000-${String(state.sessions.length + 1).padStart(12, '0')}`, tenant_id: p[0], user_id: p[1], study_set_id: p[2], session_type: 'flashcards', client_mutation_id: p[3], cards_seen: 0, cards_known: 0, cards_learning: 0, duration_seconds: 0, started_at: '2026-11-09T00:00:00Z', completed_at: null };
      state.sessions.push(row); return { rows: [row] };
    }
    if (text.startsWith('SELECT set.id FROM studyforge_learning_sessions')) {
      assert.match(text, /FOR SHARE OF set$/);
      const joined = state.sessions.flatMap(session => sets.filter(set => set.tenant_id === session.tenant_id && set.id === session.study_set_id).map(set => ({
        'session.tenant_id': session.tenant_id, 'session.user_id': session.user_id, 'session.id': session.id, 'session.completed_at': session.completed_at,
        'set.user_id': set.user_id, 'set.deleted_at': set.deleted_at, 'set.id': set.id,
      })));
      const predicate = { ...query, sql: query.sql.replace(/FOR SHARE OF set\s*$/, '') };
      return { rows: joined.filter(row => opsSelectMatches(predicate, row)).map(row => ({ id: row['set.id'] })) };
    }
    if (text.startsWith('SELECT session.id FROM studyforge_learning_sessions')) {
      beforeSessionLock?.(); beforeSessionLock = undefined;
      assert.match(text, /set\.user_id=\$4 AND set\.deleted_at IS NULL/);
      assert.match(text, /FOR UPDATE OF session$/);
      assert.match(queries.at(-2)?.sql ?? '', /FOR SHARE OF set/);
      const joined = state.sessions.flatMap(session => sets.filter(set => set.tenant_id === session.tenant_id && set.id === session.study_set_id).flatMap(set => cards.filter(card => card.tenant_id === set.tenant_id && card.deck_id === set.deck_id).map(card => ({
        'session.tenant_id': session.tenant_id, 'session.user_id': session.user_id, 'session.id': session.id, 'session.completed_at': session.completed_at,
        'set.user_id': set.user_id, 'set.deleted_at': set.deleted_at, 'set.id': set.id, 'card.id': card.id, 'card.deleted_at': card.deleted_at,
      }))));
      const predicate = { ...query, sql: query.sql.replace(/FOR UPDATE OF session\s*$/, '') };
      return { rows: joined.filter(row => opsSelectMatches(predicate, row)).map(row => ({ id: row['session.id'] })) };
    }
    if (text.startsWith('INSERT INTO studyforge_session_card_reviews')) {
      assert.match(text, /ON CONFLICT \(tenant_id,user_id,client_mutation_id\) DO NOTHING RETURNING id$/);
      if (state.reviews.some(row => row.tenant_id === p[0] && row.user_id === p[1] && row.client_mutation_id === p[5])) return { rows: [] };
      const row = { id: `review-${state.reviews.length}`, tenant_id: p[0], user_id: p[1], session_id: p[2], card_id: p[3], learning_state: p[4], client_mutation_id: p[5] };
      state.reviews.push(row); return { rows: [{ id: row.id }] };
    }
    if (text.startsWith('SELECT session_id,card_id,learning_state FROM studyforge_session_card_reviews')) {
      assert.match(queries.at(-2)?.sql ?? '', /INSERT INTO studyforge_session_card_reviews/);
      return { rows: state.reviews.filter(row => opsSelectMatches(query, row)) };
    }
    if (text.startsWith('INSERT INTO studyforge_card_progress')) {
      assert.equal(p[0], 'tenant-a'); assert.equal(p[2], 'owner-a');
      const existing = state.progress.find(row => row.card_id === p[1]);
      if (existing) { existing.repetitions += Number(p[3]); existing.lapses += Number(p[4]); }
      else state.progress.push({ card_id: p[1], repetitions: p[3], lapses: p[4] });
      return { rows: [] };
    }
    if (text.startsWith('UPDATE studyforge_learning_sessions SET cards_seen')) {
      const session = state.sessions.find(row => row.tenant_id === p[2] && row.user_id === p[3] && row.id === p[4]); assert.ok(session);
      session.cards_seen++; session.cards_known += Number(p[0]); session.cards_learning += Number(p[1]); return { rows: [] };
    }
    throw new Error(`Unmodeled SQL: ${text}`);
  };
  const database = {
    execute() { throw new Error('These mutations must use the transaction executor'); },
    async transaction<T>(run: (tx: { execute: typeof execute }) => Promise<T>): Promise<T> {
      const prior = tail; let release!: () => void; tail = new Promise<void>(resolve => { release = resolve; });
      await prior; const snapshot = clone(state);
      try { return await run({ execute }); } catch (error) { state = snapshot; throw error; } finally { release(); }
    },
  };
  const material = loadSource('lib/studyforge-phase33.ts');
  const access = loadSource('lib/studyforge-access.ts', { '../db.js': { db: database }, './studyforge-phase33.js': material, './entitlement-resolver.js': {}, './product-entitlements.js': {} });
  const collector = routeCollector();
  const loaded = loadOpsRoute('studyforge-phase33-routes.ts', {
    '../db.js': { db: database }, '../lib/tenant-auth.js': {
      ...guards,
      requireTenantModuleAccess: () => async (_request: unknown, reply: Row) => { if (options.denyAccess) reply.code(403).send({ code: 'MODULE_ACCESS_DENIED' }); },
    },
    '../lib/ai-provider.js': { getAiProvider() { throw new Error('Providers forbidden'); } },
    '../lib/studyforge-phase33.js': material, '../lib/studyforge.js': {},
    '../lib/studyforge-access.js': { consumeStudyForgeUsage: access.consumeStudyForgeUsage, resolveStudyForgeAccess: async () => { accessChecks++; return { limits: { quizAttemptsPerMonth: options.limit ?? 10, spacedRepetition: true } }; } },
    '../lib/shared-usage-activity.js': {
      appendActivityEvent() { throw new Error('Unexpected activity write'); },
      recordUsageEvent: async (event: Row) => {
        if (options.failUsage) throw new Error('Synthetic usage failure');
        // Model the existing shared-event key scope, which excludes userId.
        // The route must supply distinct server-bound keys for distinct attempts.
        if (!state.events.some(row => ['tenantId', 'moduleId', 'operation', 'idempotencyKey'].every(field => row[field] === event[field]))) state.events.push(clone(event));
      },
    },
  });
  await loaded.registerStudyForgePhase33Routes(collector.app);
  return {
    sets, cards, questions, queries, state: () => state, accessChecks: () => accessChecks,
    beforeSetLoad(run: () => void) { beforeSetLoad = run; },
    beforeSessionLock(run: () => void) { beforeSessionLock = run; },
    quiz(body: unknown = { answers, idempotencyKey: 'quiz-retry-key' }, id = setA, request: Row = {}) { return collector.invoke('post', `${base}/quiz-attempts`, { params: { id }, body, ...request }); },
    session(key = 'session-retry-key', id = setA, request: Row = {}) { return collector.invoke('post', `${base}/flashcard-sessions`, { params: { id }, body: { idempotencyKey: key }, ...request }); },
    review(sessionId: string, cardId = cardA, state = 'known', key = 'card-review-key', request: Row = {}) { return collector.invoke('post', '/v1/modules/studyforge-ai/flashcard-sessions/:sessionId/cards/:cardId', { params: { sessionId, cardId }, body: { state, clientMutationId: key }, ...request }); },
  };
}

test('quiz exact and normalized retries preserve the original result and all accounting', async () => {
  const f = await fixture({ limit: 1 }); const first = await f.quiz(); assert.equal(first.status, 201);
  const before = clone(f.state()); f.questions.forEach(question => { question.correct_index = 5; question.explanation = 'Revised'; });
  const reads = f.queries.filter(query => query.sql.includes('FROM studyforge_questions')).length;
  const replay = await f.quiz({ idempotencyKey: 'quiz-retry-key', answers: [...answers].reverse().map(answer => ({ selectedIndex: answer.selectedIndex, unusedLegacyField: true, questionId: answer.questionId })) });
  assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true); assert.deepEqual(clone(replay.body.attempt), clone(first.body.attempt));
  assert.deepEqual(clone(f.state()), before); assert.equal(f.queries.filter(query => query.sql.includes('FROM studyforge_questions')).length, reads);
  assert.equal(f.state().usage[0].quiz_attempt_count, 1); assert.equal(f.state().daily[0].sessions_completed, 1); assert.equal(f.state().events.length, 1);
  assert.equal(f.accessChecks(), 2);
});

test('quiz cross-target and changed-answer keys conflict without exposing cached results', async () => {
  const f = await fixture(); await f.quiz(); const before = clone(f.state());
  for (const result of [await f.quiz(undefined, setB), await f.quiz({ idempotencyKey: 'quiz-retry-key', answers: [{ ...answers[0], selectedIndex: 2 }, answers[1]] })]) {
    assert.equal(result.status, 409); assert.equal(result.body.code, 'STUDYFORGE_IDEMPOTENCY_CONFLICT'); assert.deepEqual(Object.keys(result.body).sort(), ['code', 'error']);
  }
  assert.deepEqual(clone(f.state()), before);
});

test('new quiz attempts preserve submitted answer order and existing extra-field response shape', async () => {
  const f = await fixture(); const original = [...answers].reverse().map(answer => ({ selectedIndex: answer.selectedIndex, legacyNote: 'Retain original submitted payload', questionId: answer.questionId }));
  const first = await f.quiz({ answers: original, idempotencyKey: 'shape-preservation-key' }); assert.equal(first.status, 201); assert.deepEqual(clone(first.body.attempt.answers), original);
  const replay = await f.quiz({ answers, idempotencyKey: 'shape-preservation-key' }); assert.equal(replay.status, 200); assert.deepEqual(clone(replay.body.attempt), clone(first.body.attempt));
});

test('legacy answer properties replay; malformed persisted bindings fail closed without mutation', async () => {
  const f = await fixture(); await f.quiz(); f.state().attempts[0].answers = [...answers].reverse().map(answer => ({ correct: true, ...answer }));
  f.state().events[0].idempotencyKey = 'quiz-retry-key';
  const legacy = clone(f.state()); assert.equal((await f.quiz()).status, 200); assert.deepEqual(clone(f.state()), legacy, 'Historical raw-key usage is neither rewritten nor duplicated');
  for (const invalid of [null, {}, [], [null], [answers[0], answers[0]], [{ questionId: questionA, selectedIndex: '0' }]]) {
    f.state().attempts[0].answers = invalid; const before = clone(f.state()); assert.equal((await f.quiz()).status, 409); assert.deepEqual(clone(f.state()), before);
  }
});

test('malformed quiz intent is rejected before replay or quota writes', async () => {
  const invalidAnswers = [null, {}, [], Array(101).fill(answers[0]), [null], [3], [[]], [answers[0], answers[0]], [{ selectedIndex: 0 }], [{ questionId: 7, selectedIndex: 0 }], [{ questionId: questionA, selectedIndex: '0' }], [{ questionId: questionA, selectedIndex: -1 }], [{ questionId: questionA, selectedIndex: 6 }], [{ questionId: questionA, selectedIndex: 0.5 }], [{ questionId: questionA }]];
  const f = await fixture(); await f.quiz(); const before = clone(f.state());
  for (const value of invalidAnswers) assert.equal((await f.quiz({ answers: value, idempotencyKey: 'quiz-retry-key' })).status, 400);
  for (const body of [null, [], { answers, idempotencyKey: 'short' }, { answers, idempotencyKey: 'quiz-retry-key', tenantId: 'foreign' }]) assert.equal((await f.quiz(body)).status, 400);
  assert.deepEqual(clone(f.state()), before);
});

test('new quiz requests retain question-membership validation, quota rejection and transactional rollback', async () => {
  const f = await fixture();
  for (const value of [[answers[0]], [{ ...answers[0], questionId: '10000000-0000-0000-0000-000000000099' }, answers[1]]]) assert.equal((await f.quiz({ answers: value, idempotencyKey: 'new-quiz-key' })).status, 400);
  assert.equal(f.state().attempts.length, 0); assert.equal(f.state().usage.length, 0);
  const zero = await fixture({ limit: 0 }); assert.equal((await zero.quiz()).status, 402); assert.equal(zero.state().attempts.length, 0); assert.equal(zero.state().usage.length, 0);
  const rollback = await fixture({ failUsage: true }); const before = clone(rollback.state()); await assert.rejects(rollback.quiz(), /Synthetic usage failure/); assert.deepEqual(clone(rollback.state()), before);
});

test('session retries preserve current original-session state; target and server intent are bound', async () => {
  const f = await fixture(); const first = await f.session(); assert.equal(first.status, 201);
  Object.assign(f.state().sessions[0], { cards_seen: 7, cards_known: 5, cards_learning: 2, duration_seconds: 77, completed_at: 'finished', activity_counted_at: 'counted' });
  const before = clone(f.state()); const replay = await f.session(); assert.equal(replay.status, 201); assert.equal(replay.body.id, first.body.id); assert.equal(replay.body.cardsSeen, 7); assert.equal(replay.body.completedAt, 'finished'); assert.deepEqual(clone(f.state()), before);
  assert.equal((await f.session('session-retry-key', setB)).status, 409); assert.deepEqual(clone(f.state()), before);
  for (const type of ['review', 'plan']) {
    f.state().sessions[0].session_type = type; const prior = clone(f.state()); const result = await f.session(); assert.equal(result.status, 409); assert.equal(result.body.code, 'STUDYFORGE_IDEMPOTENCY_CONFLICT'); assert.deepEqual(clone(f.state()), prior);
  }
});

test('tenant/user keys are independent; foreign or deleted owned targets never replay', async () => {
  const f = await fixture(); await f.quiz(); await f.session(); const before = clone(f.state());
  for (const request of [{ user: { id: 'owner-b' } }, { tenantContext: { tenantId: 'tenant-b' } }]) {
    assert.equal((await f.quiz(undefined, setA, request)).status, 404); assert.equal((await f.session('session-retry-key', setA, request)).status, 404);
  }
  f.sets[0].deleted_at = 'deleted'; assert.equal((await f.quiz()).status, 404); assert.equal((await f.session()).status, 404); assert.deepEqual(clone(f.state()), before);
  f.sets[1].user_id = 'owner-b'; const other = { user: { id: 'owner-b' } };
  assert.equal((await f.quiz({ answers: otherAnswers, idempotencyKey: 'quiz-retry-key' }, setB, other)).status, 201); assert.equal((await f.session('session-retry-key', setB, other)).status, 201);
  f.sets[1].tenant_id = 'tenant-b'; const otherTenant = { ...other, tenantContext: { tenantId: 'tenant-b' } }; f.questions.filter(q => q.quiz_id === 'quiz-1').forEach(q => { q.tenant_id = 'tenant-b'; });
  assert.equal((await f.quiz({ answers: otherAnswers, idempotencyKey: 'quiz-retry-key' }, setB, otherTenant)).status, 201); assert.equal((await f.session('session-retry-key', setB, otherTenant)).status, 201);
});

test('ownership is rechecked after advisory acquisition and cached result is withheld', async () => {
  const f = await fixture(); await f.quiz(); const before = clone(f.state()); f.beforeSetLoad(() => { f.sets[0].user_id = 'owner-b'; });
  assert.equal((await f.quiz()).status, 404); assert.deepEqual(clone(f.state()), before);
  assert.match(f.queries.at(-2)?.sql ?? '', /pg_advisory_xact_lock/); assert.match(f.queries.at(-1)?.sql ?? '', /FOR SHARE/);
});

test('module read/write denial applies before cached replies and session input remains validated', async () => {
  const f = await fixture(); await f.quiz(); await f.session(); const before = clone(f.state());
  const viewer = { tenantModuleAccessLevel: 'viewer' }; assert.equal((await f.quiz(undefined, setA, viewer)).status, 403); assert.equal((await f.session('session-retry-key', setA, viewer)).status, 403);
  assert.equal((await f.session('short')).status, 400); assert.equal((await f.session('session-retry-key', setA, { body: [] })).status, 400);
  assert.deepEqual(clone(f.state()), before);
  const denied = await fixture({ denyAccess: true }); assert.equal((await denied.quiz()).status, 403); assert.equal((await denied.session()).status, 403); assert.equal(denied.queries.length, 0);
});

test('simultaneous submissions under modeled serialization account once and distinguish different intent', async () => {
  for (const changed of [false, true]) {
    const f = await fixture(); const results = await Promise.all([f.quiz(), f.quiz({ answers: changed ? [{ ...answers[0], selectedIndex: 2 }, answers[1]] : [...answers].reverse(), idempotencyKey: 'quiz-retry-key' })]);
    assert.deepEqual(results.map(result => result.status).sort(), changed ? [201, 409] : [200, 201]); assert.equal(f.state().attempts.length, 1); assert.equal(f.state().usage[0].quiz_attempt_count, 1); assert.equal(f.state().daily[0].quiz_attempts, 1); assert.equal(f.state().events.length, 1);
    const sessions = await Promise.all([f.session(), f.session('session-retry-key', changed ? setB : setA)]); assert.deepEqual(sessions.map(result => result.status).sort(), changed ? [201, 409] : [201, 201]); assert.equal(f.state().sessions.length, 1);
  }
});

test('card review binds session, card and learning state and preserves counters on every conflict', async () => {
  const f = await fixture(); const session = (await f.session()).body.id; const other = (await f.session('another-session-key')).body.id;
  assert.deepEqual(clone((await f.review(session)).body), { replayed: false }); const before = clone(f.state());
  assert.deepEqual(clone((await f.review(session)).body), { replayed: true });
  for (const result of [await f.review(other), await f.review(session, cardB), await f.review(session, cardA, 'learning')]) {
    assert.equal(result.status, 409); assert.equal(result.body.code, 'STUDYFORGE_IDEMPOTENCY_CONFLICT'); assert.deepEqual(Object.keys(result.body).sort(), ['code', 'error']);
  }
  assert.deepEqual(clone(f.state()), before); assert.equal(f.state().reviews.length, 1); assert.equal(f.state().sessions[0].cards_seen, 1); assert.equal(f.state().progress.at(-1)?.repetitions, 1);
  assert.equal(f.state().daily.length, 0); assert.equal(f.state().usage.length, 0);
});

test('card review retains current owner, tenant, deletion, lifecycle and write checks before replay', async () => {
  const f = await fixture(); const session = (await f.session()).body.id; await f.review(session); const before = clone(f.state());
  for (const request of [{ user: { id: 'owner-b' } }, { tenantContext: { tenantId: 'tenant-b' } }]) assert.equal((await f.review(session, cardA, 'known', 'card-review-key', request)).status, 404);
  assert.equal((await f.review(session, cardA, 'known', 'card-review-key', { tenantModuleAccessLevel: 'viewer' })).status, 403);
  f.cards[0].deleted_at = 'deleted'; assert.equal((await f.review(session)).status, 404); f.cards[0].deleted_at = null;
  f.sets[0].deleted_at = 'deleted'; assert.equal((await f.review(session)).status, 404); f.sets[0].deleted_at = null;
  f.sets[0].user_id = 'owner-b'; assert.equal((await f.review(session)).status, 404); f.sets[0].user_id = 'owner-a';
  assert.deepEqual(clone(f.state()), before); f.state().sessions[0].completed_at = 'finished'; assert.equal((await f.review(session)).status, 404);
});

test('card review validates malformed intent and handles modeled simultaneous conflicts once', async () => {
  const f = await fixture(); const session = (await f.session()).body.id;
  for (const result of [await f.review(session, cardA, 'bad'), await f.review(session, cardA, 'known', 'short'), await f.review(session, cardA, 'known', 'card-review-key', { body: null })]) assert.equal(result.status, 400);
  const same = await Promise.all([f.review(session), f.review(session)]); assert.deepEqual(same.map(result => result.body.replayed).sort(), [false, true]);
  const different = await Promise.all([f.review(session, cardB, 'learning', 'another-review-key'), f.review(session, cardB, 'known', 'another-review-key')]); assert.deepEqual(different.map(result => result.status).sort(), [200, 409]);
  assert.equal(f.state().reviews.length, 2); assert.equal(f.state().sessions[0].cards_seen, 2); assert.equal(f.state().sessions[0].cards_known, 1); assert.equal(f.state().sessions[0].cards_learning, 1);
});

test('card review retains case-sensitive VARCHAR identity semantics on initial requests and retries', async () => {
  for (const uppercase of [false, true]) {
    const f = await fixture(); await f.session();
    const sessionId = 'abcdef00-0000-0000-0000-000000000001'; const cardId = 'abcdef01-0000-0000-0000-000000000001';
    const storedSession = uppercase ? sessionId.toUpperCase() : sessionId;
    const storedCard = uppercase ? cardId.toUpperCase() : cardId;
    f.state().sessions[0].id = storedSession; f.cards[0].id = storedCard;
    assert.equal((await f.review(uppercase ? sessionId : sessionId.toUpperCase(), storedCard)).status, 404);
    assert.equal((await f.review(storedSession, uppercase ? cardId : cardId.toUpperCase())).status, 404);
    assert.equal((await f.review(storedSession, storedCard)).body.replayed, false);
    const before = clone(f.state()); assert.equal((await f.review(storedSession, storedCard)).body.replayed, true); assert.deepEqual(clone(f.state()), before);
  }
});

test('card review rechecks completion after acquiring the owned parent and before inserting', async () => {
  const f = await fixture(); const session = (await f.session()).body.id;
  f.beforeSessionLock(() => { f.state().sessions[0].completed_at = 'completed-while-waiting'; });
  assert.equal((await f.review(session)).status, 404); assert.equal(f.state().reviews.length, 0); assert.equal(f.state().sessions[0].cards_seen, 0); assert.equal(f.state().progress.length, 1);
});

test('two users sharing a client quiz key get attempt-bound shared events and replay neither duplicates', async () => {
  const f = await fixture(); f.sets[1].user_id = 'owner-b';
  const other = { user: { id: 'owner-b' } }; const otherInput = { answers: otherAnswers, idempotencyKey: 'quiz-retry-key' };
  const first = await f.quiz(); const second = await f.quiz(otherInput, setB, other);
  assert.equal(first.status, 201); assert.equal(second.status, 201); assert.equal(f.state().attempts.length, 2); assert.equal(f.state().usage.length, 2); assert.equal(f.state().daily.length, 2); assert.equal(f.state().events.length, 2);
  const ids = [first.body.attempt.id, second.body.attempt.id];
  for (const [index, event] of f.state().events.entries()) {
    assert.equal(event.idempotencyKey, `studyforge.quiz_attempt:${ids[index]}`); assert.equal(event.externalReference, ids[index]); assert.ok(event.idempotencyKey.length <= 160);
  }
  const before = clone(f.state()); assert.equal((await f.quiz()).status, 200); assert.equal((await f.quiz(otherInput, setB, other)).status, 200); assert.deepEqual(clone(f.state()), before);
});
