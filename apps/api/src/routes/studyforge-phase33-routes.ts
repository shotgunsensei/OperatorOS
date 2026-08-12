import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { getAiProvider } from '../lib/ai-provider.js';
import {
  requireSuperAdmin,
  requireTenantAdmin,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import { appendActivityEvent, recordUsageEvent } from '../lib/shared-usage-activity.js';
import { resolveStudyForgeAccess, consumeStudyForgeUsage } from '../lib/studyforge-access.js';
import {
  calendarDayInTimeZone,
  countdownDays,
  resolveStudyForgeCompleteGeneration,
  type GenerationMode,
  type StudyForgeCompleteMaterial,
} from '../lib/studyforge-phase33.js';
import { sha256 } from '../lib/studyforge.js';

const MODULE_SLUG = 'studyforge-ai';
const base = '/v1/modules/studyforge-ai';
const readGuards = [requireTenantModuleAccess(MODULE_SLUG)];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const adminGuards = [...writeGuards, requireTenantAdmin];
type Row = Record<string, any>;
type Executor = Pick<typeof db, 'execute'>;

class InputError extends Error {
  readonly code: string;
  readonly statusCode: number;
  constructor(message: string, code = 'STUDYFORGE_INPUT_INVALID', statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

const tenant = (request: FastifyRequest) => String((request as any).tenantContext.tenantId);
const actor = (request: FastifyRequest) => String((request as any).user.id);
const params = (request: FastifyRequest) => request.params as Row;
const identifier = (request: FastifyRequest, key = 'id') => {
  const value = String(params(request)[key] ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) throw new InputError(`${key} is invalid`);
  return value;
};
const camelKey = (value: string) => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const camel = (row: unknown) => Object.fromEntries(Object.entries(row as Row)
  .filter(([key]) => !['tenant_id', 'user_id', 'created_by_user_id', 'deleted_at'].includes(key))
  .map(([key, value]) => [camelKey(key), value]));

function body(request: FastifyRequest): Row {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    throw new InputError('A JSON object is required');
  }
  const value = request.body as Row;
  for (const field of ['tenantId', 'tenant_id', 'userId', 'user_id', 'plan', 'entitlement', 'role']) {
    if (field in value) throw new InputError(`${field} is resolved from the trusted OperatorOS session`);
  }
  return value;
}

function text(value: unknown, field: string, min = 1, max = 5000, optional = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw new InputError(`${field} is required`);
  }
  if (typeof value !== 'string') throw new InputError(`${field} must be text`);
  const result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
    throw new InputError(`${field} must be ${min}-${max} valid characters`);
  }
  return result;
}

function optionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const result = text(value, field, 36, 36)!;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(result)) throw new InputError(`${field} is invalid`);
  return result;
}

function integer(value: unknown, field: string, min: number, max: number, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new InputError(`${field} must be an integer from ${min} to ${max}`);
  }
  return Number(value);
}

function date(value: unknown, field: string, optional = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw new InputError(`${field} is required`);
  }
  const result = text(value, field, 10, 10)!;
  const parsed = new Date(`${result}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new InputError(`${field} must be a valid YYYY-MM-DD date`);
  }
  return result;
}

function idempotency(value: unknown): string {
  const result = text(value, 'idempotencyKey', 8, 160)!;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(result)) throw new InputError('idempotencyKey has invalid characters');
  return result;
}

function failure(reply: FastifyReply, error: unknown) {
  const value = error as any;
  if (value?.statusCode && value.statusCode >= 400 && value.statusCode < 500) {
    return reply.code(value.statusCode).send({ error: value.message, code: value.code ?? 'STUDYFORGE_REQUEST_FAILED' });
  }
  if (value instanceof InputError) return reply.code(value.statusCode).send({ error: value.message, code: value.code });
  throw error;
}

async function moduleId(executor: Executor = db): Promise<string> {
  const result = await executor.execute(sql`SELECT id FROM modules WHERE slug=${MODULE_SLUG} LIMIT 1`);
  if (!result.rows[0]) throw Object.assign(new Error('StudyForge module registry is unavailable'), { code: 'STUDYFORGE_MODULE_UNAVAILABLE' });
  return String((result.rows[0] as Row).id);
}

function createInput(value: Row) {
  const allowed = new Set(['title', 'course', 'subjectId', 'folderId', 'notes', 'difficulty', 'examDate', 'generationMode', 'idempotencyKey', 'sourceSetId']);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new InputError(`Unknown field: ${unknown}`);
  const difficulty = String(value.difficulty ?? 'medium');
  if (!['easy', 'medium', 'hard'].includes(difficulty)) throw new InputError('difficulty is invalid');
  const generationMode = String(value.generationMode ?? 'auto');
  if (!['auto', 'ai', 'deterministic'].includes(generationMode)) throw new InputError('generationMode is invalid');
  return {
    title: text(value.title, 'title', 1, 200)!,
    course: text(value.course, 'course', 1, 160, true),
    subjectId: optionalId(value.subjectId, 'subjectId'),
    folderId: optionalId(value.folderId, 'folderId'),
    notes: text(value.notes, 'notes', 8, 100_000)!,
    difficulty: difficulty as 'easy' | 'medium' | 'hard',
    examDate: date(value.examDate, 'examDate', true),
    generationMode: generationMode as GenerationMode,
    idempotencyKey: idempotency(value.idempotencyKey),
    sourceSetId: optionalId(value.sourceSetId, 'sourceSetId'),
  };
}

async function loadStudySet(tenantId: string, userId: string, id: string, executor: Executor = db): Promise<Row> {
  const result = await executor.execute(sql`
    SELECT * FROM studyforge_study_sets
    WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${id} AND deleted_at IS NULL LIMIT 1
  `);
  if (!result.rows[0]) throw new InputError('Study set not found', 'STUDYFORGE_SET_NOT_FOUND', 404);
  return result.rows[0] as Row;
}

async function loadCompleteSet(tenantId: string, userId: string, id: string): Promise<Row> {
  const set = await loadStudySet(tenantId, userId, id);
  const [cards, questions, shortAnswers, planSessions, attempts, progress] = await Promise.all([
    db.execute(sql`SELECT * FROM studyforge_cards WHERE tenant_id=${tenantId} AND deck_id=${set.deck_id} AND deleted_at IS NULL ORDER BY position`),
    db.execute(sql`SELECT id,tenant_id,quiz_id,position,question,choices,explanation,source_excerpt,version,created_at,updated_at FROM studyforge_questions WHERE tenant_id=${tenantId} AND quiz_id=${set.quiz_id} AND deleted_at IS NULL ORDER BY position`),
    db.execute(sql`SELECT * FROM studyforge_short_answers WHERE tenant_id=${tenantId} AND study_set_id=${id} AND deleted_at IS NULL ORDER BY position`),
    db.execute(sql`SELECT * FROM studyforge_plan_sessions WHERE tenant_id=${tenantId} AND plan_id=${set.plan_id} ORDER BY position`),
    db.execute(sql`SELECT id,quiz_id,correct_count,total_count,score_percent,review_json,completed_at FROM studyforge_quiz_attempts WHERE tenant_id=${tenantId} AND user_id=${userId} AND quiz_id=${set.quiz_id} ORDER BY completed_at DESC LIMIT 100`),
    db.execute(sql`SELECT progress.* FROM studyforge_card_progress progress JOIN studyforge_cards card ON card.tenant_id=progress.tenant_id AND card.id=progress.card_id WHERE progress.tenant_id=${tenantId} AND progress.user_id=${userId} AND card.deck_id=${set.deck_id}`),
  ]);
  return {
    ...camel(set),
    cards: cards.rows.map(camel),
    questions: questions.rows.map(camel),
    shortAnswers: shortAnswers.rows.map(camel),
    studyPlan: planSessions.rows.map(camel),
    attempts: attempts.rows.map(camel),
    progress: progress.rows.map(camel),
  };
}

async function persistCompleteSet(args: {
  request: FastifyRequest;
  input: ReturnType<typeof createInput>;
  material: StudyForgeCompleteMaterial;
  provenance: Awaited<ReturnType<typeof resolveStudyForgeCompleteGeneration>>['provenance'];
  access: Awaited<ReturnType<typeof resolveStudyForgeAccess>>;
}) {
  const tenantId = tenant(args.request);
  const userId = actor(args.request);
  const modId = await moduleId();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${userId}:${args.input.idempotencyKey}`},0))`);
    const replay = await tx.execute(sql`SELECT * FROM studyforge_study_sets WHERE tenant_id=${tenantId} AND user_id=${userId} AND idempotency_key=${args.input.idempotencyKey} LIMIT 1`);
    if (replay.rows[0]) return { row: replay.rows[0] as Row, replayed: true };
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${userId}:active-sets`},0))`);
    if (args.access.limits.activeSets !== null) {
      const count = await tx.execute(sql`SELECT count(*)::int AS count FROM studyforge_study_sets WHERE tenant_id=${tenantId} AND user_id=${userId} AND deleted_at IS NULL AND status='active'`);
      if (Number((count.rows[0] as Row).count) >= args.access.limits.activeSets) {
        throw new InputError('Active study set limit reached for this OperatorOS entitlement', 'STUDYFORGE_SET_LIMIT_REACHED', 402);
      }
    }
    if (args.input.folderId) {
      const folder = await tx.execute(sql`SELECT 1 FROM studyforge_folders WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${args.input.folderId} AND deleted_at IS NULL`);
      if (!folder.rows[0]) throw new InputError('Folder not found', 'STUDYFORGE_FOLDER_NOT_FOUND', 404);
    }
    let subjectId = args.input.subjectId;
    if (subjectId) {
      const subject = await tx.execute(sql`SELECT 1 FROM studyforge_subjects WHERE tenant_id=${tenantId} AND id=${subjectId} AND deleted_at IS NULL`);
      if (!subject.rows[0]) throw new InputError('Subject not found', 'STUDYFORGE_SUBJECT_NOT_FOUND', 404);
    } else {
      const subjectName = args.input.course ?? args.input.title;
      const existing = await tx.execute(sql`SELECT id FROM studyforge_subjects WHERE tenant_id=${tenantId} AND lower(name)=lower(${subjectName}) AND deleted_at IS NULL LIMIT 1`);
      if (existing.rows[0]) subjectId = String((existing.rows[0] as Row).id);
      else {
        const created = await tx.execute(sql`INSERT INTO studyforge_subjects(tenant_id,created_by_user_id,name) VALUES (${tenantId},${userId},${subjectName}) RETURNING id`);
        subjectId = String((created.rows[0] as Row).id);
      }
    }
    await consumeStudyForgeUsage({ tenantId, userId, kind: 'generation', limit: args.access.limits.generationsPerMonth, executor: tx });
    const source = await tx.execute(sql`
      INSERT INTO studyforge_sources(tenant_id,created_by_user_id,subject_id,title,source_type,body,content_sha256)
      VALUES (${tenantId},${userId},${subjectId},${`${args.input.title} notes`},'note',${args.input.notes},${sha256(args.input.notes)}) RETURNING *
    `);
    const sourceId = String((source.rows[0] as Row).id);
    const generation = await tx.execute(sql`
      INSERT INTO studyforge_generations(tenant_id,user_id,source_id,generation_type,idempotency_key,input_sha256,output_json,source_references,provider,model,provider_version,token_count,duration_ms)
      VALUES (${tenantId},${userId},${sourceId},'complete_set',${args.input.idempotencyKey},${sha256(JSON.stringify(args.input))},${JSON.stringify(args.material)}::jsonb,${JSON.stringify([{ sourceId, contentSha256: sha256(args.input.notes) }])}::jsonb,${args.provenance.provider},${args.provenance.model},${args.provenance.providerVersion},${args.provenance.tokenCount},${args.provenance.durationMs}) RETURNING id
    `);
    const generationId = String((generation.rows[0] as Row).id);
    const deck = await tx.execute(sql`INSERT INTO studyforge_decks(tenant_id,created_by_user_id,subject_id,source_id,generation_id,title,description,status) VALUES (${tenantId},${userId},${subjectId},${sourceId},${generationId},${`${args.input.title} flashcards`},${args.material.summary},'published') RETURNING id`);
    const deckId = String((deck.rows[0] as Row).id);
    for (const [position, card] of args.material.flashcards.slice(0, args.access.limits.flashcardsPerSet).entries()) {
      await tx.execute(sql`INSERT INTO studyforge_cards(tenant_id,deck_id,source_id,position,question,answer,source_excerpt) VALUES (${tenantId},${deckId},${sourceId},${position},${card.front},${card.back},${card.sourceExcerpt})`);
    }
    const quiz = await tx.execute(sql`INSERT INTO studyforge_quizzes(tenant_id,created_by_user_id,subject_id,source_id,generation_id,title,status) VALUES (${tenantId},${userId},${subjectId},${sourceId},${generationId},${`${args.input.title} quiz`},'published') RETURNING id`);
    const quizId = String((quiz.rows[0] as Row).id);
    for (const [position, question] of args.material.mcqs.entries()) {
      await tx.execute(sql`INSERT INTO studyforge_questions(tenant_id,quiz_id,source_id,position,question,choices,correct_index,explanation,source_excerpt) VALUES (${tenantId},${quizId},${sourceId},${position},${question.question},${JSON.stringify(question.choices)}::jsonb,${question.correctIndex},${question.explanation},${question.sourceExcerpt})`);
    }
    const plan = await tx.execute(sql`INSERT INTO studyforge_plans(tenant_id,created_by_user_id,subject_id,source_id,generation_id,title,target_date,status) VALUES (${tenantId},${userId},${subjectId},${sourceId},${generationId},${`${args.input.title} plan`},${args.input.examDate},'published') RETURNING id`);
    const planId = String((plan.rows[0] as Row).id);
    for (const [position, session] of args.material.studyPlan.entries()) {
      await tx.execute(sql`INSERT INTO studyforge_plan_sessions(tenant_id,plan_id,position,title,focus,scheduled_for,estimated_minutes) VALUES (${tenantId},${planId},${position},${`${session.topic}: day ${session.day}`},${session.focus},${session.date},${session.estimatedMinutes})`);
    }
    const created = await tx.execute(sql`
      INSERT INTO studyforge_study_sets(tenant_id,user_id,folder_id,subject_id,source_id,generation_id,deck_id,quiz_id,plan_id,title,course,difficulty,exam_date,summary,key_terms,review_sheet,quality_score,generation_provenance,idempotency_key,source_set_id)
      VALUES (${tenantId},${userId},${args.input.folderId},${subjectId},${sourceId},${generationId},${deckId},${quizId},${planId},${args.input.title},${args.input.course},${args.input.difficulty},${args.input.examDate},${args.material.summary},${JSON.stringify(args.material.keyTerms)}::jsonb,${JSON.stringify(args.material.reviewSheet)}::jsonb,${args.material.qualityScore},${JSON.stringify(args.provenance)}::jsonb,${args.input.idempotencyKey},${args.input.sourceSetId}) RETURNING *
    `);
    const set = created.rows[0] as Row;
    for (const [position, question] of args.material.shortAnswers.entries()) {
      await tx.execute(sql`INSERT INTO studyforge_short_answers(tenant_id,study_set_id,source_id,position,question,answer,topic,source_excerpt) VALUES (${tenantId},${set.id},${sourceId},${position},${question.question},${question.answer},${question.topic},${question.sourceExcerpt})`);
    }
    await recordUsageEvent({ tenantId, moduleId: modId, userId, operation: 'studyforge.complete_generation', units: 1, unitKind: 'generation', idempotencyKey: args.input.idempotencyKey, externalReference: String(set.id), metadata: { effectiveMode: args.provenance.effectiveMode, provider: args.provenance.provider, tokenCount: args.provenance.tokenCount } }, tx);
    await appendActivityEvent({ tenantId, moduleId: modId, actorUserId: userId, objectType: 'studyforge_study_set', objectId: String(set.id), eventType: 'studyforge.set.created', summary: `Created complete study set ${args.input.title}`, metadata: { generationMode: args.provenance.effectiveMode, qualityScore: args.material.qualityScore }, correlationId: args.request.id }, tx);
    return { row: set, replayed: false };
  });
}

async function createSet(request: FastifyRequest, input: ReturnType<typeof createInput>) {
  const tenantId = tenant(request);
  const userId = actor(request);
  const replay = await db.execute(sql`SELECT * FROM studyforge_study_sets WHERE tenant_id=${tenantId} AND user_id=${userId} AND idempotency_key=${input.idempotencyKey} LIMIT 1`);
  if (replay.rows[0]) return { row: replay.rows[0] as Row, replayed: true };
  const access = await resolveStudyForgeAccess(userId, tenantId);
  const maxFlashcards = access.limits.flashcardsPerSet;
  const anchorDate = new Date().toISOString().slice(0, 10);
  const generated = await resolveStudyForgeCompleteGeneration({
    input: { notes: input.notes, title: input.title, subject: input.course ?? input.title, difficulty: input.difficulty, examDate: input.examDate, maxFlashcards, anchorDate },
    mode: input.generationMode,
    provider: getAiProvider(),
  });
  return persistCompleteSet({ request, input, material: generated.material, provenance: generated.provenance, access });
}

function calculateStreak(rows: unknown[], today: string) {
  const days = new Set(rows.map((row) => String((row as Row).activity_date).slice(0, 10)));
  let current = 0;
  const cursor = new Date(`${today}T00:00:00.000Z`);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  const ordered = [...days].sort();
  let longest = 0;
  let running = 0;
  let previous = '';
  for (const day of ordered) {
    const expected = previous ? new Date(`${previous}T00:00:00.000Z`) : null;
    if (expected) expected.setUTCDate(expected.getUTCDate() + 1);
    running = expected?.toISOString().slice(0, 10) === day ? running + 1 : 1;
    longest = Math.max(longest, running);
    previous = day;
  }
  return { current, longest };
}

async function preference(tenantId: string, userId: string, executor: Executor = db) {
  const result = await executor.execute(sql`SELECT * FROM studyforge_preferences WHERE tenant_id=${tenantId} AND user_id=${userId} LIMIT 1`);
  return (result.rows[0] as Row | undefined) ?? { time_zone: 'UTC', onboarding_complete: false, default_difficulty: 'medium', daily_goal_minutes: 30, version: 0 };
}

async function recordDaily(args: { tenantId: string; userId: string; executor: Executor; studySeconds?: number; cardsReviewed?: number; quizAttempts?: number; sessionsCompleted?: number }) {
  const settings = await preference(args.tenantId, args.userId, args.executor);
  const day = calendarDayInTimeZone(new Date(), String(settings.time_zone));
  await args.executor.execute(sql`
    INSERT INTO studyforge_daily_activity(tenant_id,user_id,activity_date,study_seconds,cards_reviewed,quiz_attempts,sessions_completed)
    VALUES (${args.tenantId},${args.userId},${day},${args.studySeconds ?? 0},${args.cardsReviewed ?? 0},${args.quizAttempts ?? 0},${args.sessionsCompleted ?? 0})
    ON CONFLICT (tenant_id,user_id,activity_date) DO UPDATE SET
      study_seconds=studyforge_daily_activity.study_seconds+EXCLUDED.study_seconds,
      cards_reviewed=studyforge_daily_activity.cards_reviewed+EXCLUDED.cards_reviewed,
      quiz_attempts=studyforge_daily_activity.quiz_attempts+EXCLUDED.quiz_attempts,
      sessions_completed=studyforge_daily_activity.sessions_completed+EXCLUDED.sessions_completed,
      updated_at=NOW()
  `);
}

async function completeWorkspacePayload(request: FastifyRequest) {
  const tenantId = tenant(request), userId = actor(request);
  const settings = await preference(tenantId, userId);
  const today = calendarDayInTimeZone(new Date(), String(settings.time_zone));
  const [sets, folders, countdowns, activity, usage, attempts] = await Promise.all([
    db.execute(sql`SELECT id,title,course,folder_id,difficulty,exam_date,summary,quality_score,generation_provenance,status,version,created_at,updated_at FROM studyforge_study_sets WHERE tenant_id=${tenantId} AND user_id=${userId} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200`),
    db.execute(sql`SELECT * FROM studyforge_folders WHERE tenant_id=${tenantId} AND user_id=${userId} AND deleted_at IS NULL ORDER BY name`),
    db.execute(sql`SELECT * FROM studyforge_exam_countdowns WHERE tenant_id=${tenantId} AND user_id=${userId} AND deleted_at IS NULL ORDER BY exam_date LIMIT 100`),
    db.execute(sql`SELECT * FROM studyforge_daily_activity WHERE tenant_id=${tenantId} AND user_id=${userId} AND activity_date >= CURRENT_DATE-INTERVAL '365 days' ORDER BY activity_date`),
    db.execute(sql`SELECT * FROM studyforge_usage_counters WHERE tenant_id=${tenantId} AND user_id=${userId} AND period_start=date_trunc('month',CURRENT_DATE)::date`),
    db.execute(sql`SELECT score_percent,completed_at FROM studyforge_quiz_attempts WHERE tenant_id=${tenantId} AND user_id=${userId} ORDER BY completed_at DESC LIMIT 100`),
  ]);
  const access = await resolveStudyForgeAccess(userId, tenantId);
  const streak = calculateStreak(activity.rows, today);
  return {
    preferences: camel(settings), plan: access, usage: camel(usage.rows[0] ?? { generation_count: 0, quiz_attempt_count: 0 }),
    metrics: {
      activeSets: sets.rows.filter((row) => (row as Row).status === 'active').length,
      totalStudyMinutes: Math.round(activity.rows.reduce((total, row) => total + Number((row as Row).study_seconds), 0) / 60),
      cardsReviewed: activity.rows.reduce((total, row) => total + Number((row as Row).cards_reviewed), 0),
      averageQuizScore: attempts.rows.length ? Math.round(attempts.rows.reduce((total, row) => total + Number((row as Row).score_percent), 0) / attempts.rows.length) : null,
      currentStreak: streak.current, longestStreak: streak.longest,
    },
    folders: folders.rows.map(camel), sets: sets.rows.map(camel),
    countdowns: countdowns.rows.map((row) => ({ ...camel(row), daysRemaining: countdownDays(String((row as Row).exam_date).slice(0, 10), today) })),
    activity: activity.rows.map(camel), quizTrend: attempts.rows.map(camel),
  };
}

export async function registerStudyForgePhase33Routes(app: FastifyInstance): Promise<void> {
  app.get(`${base}/complete-workspace`, { preHandler: readGuards }, completeWorkspacePayload);
  app.get(`${base}/dashboard`, { preHandler: readGuards }, completeWorkspacePayload);

  app.put(`${base}/preferences`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const timeZone = text(input.timeZone ?? 'UTC', 'timeZone', 1, 100)!;
      calendarDayInTimeZone(new Date(), timeZone);
      const difficulty = String(input.defaultDifficulty ?? 'medium');
      if (!['easy', 'medium', 'hard'].includes(difficulty)) throw new InputError('defaultDifficulty is invalid');
      const complete = input.onboardingComplete === undefined ? true : Boolean(input.onboardingComplete);
      const result = await db.execute(sql`
        INSERT INTO studyforge_preferences(tenant_id,user_id,time_zone,onboarding_complete,default_difficulty,daily_goal_minutes)
        VALUES (${tenant(request)},${actor(request)},${timeZone},${complete},${difficulty},${integer(input.dailyGoalMinutes, 'dailyGoalMinutes', 5, 480, 30)})
        ON CONFLICT (tenant_id,user_id) DO UPDATE SET time_zone=EXCLUDED.time_zone,onboarding_complete=EXCLUDED.onboarding_complete,default_difficulty=EXCLUDED.default_difficulty,daily_goal_minutes=EXCLUDED.daily_goal_minutes,version=studyforge_preferences.version+1,updated_at=NOW()
        RETURNING *
      `);
      return camel(result.rows[0]);
    } catch (error) { return failure(reply, error); }
  });

  app.get(`${base}/templates`, { preHandler: readGuards }, async () => ({ templates: [
    { id: 'exam-review', name: 'Exam review', difficulty: 'medium', description: 'Balanced flashcards, questions, review sheet, and seven-day plan.' },
    { id: 'rapid-recall', name: 'Rapid recall', difficulty: 'easy', description: 'Concise recall practice for a short source.' },
    { id: 'deep-mastery', name: 'Deep mastery', difficulty: 'hard', description: 'Longer sessions and high-density question practice.' },
  ] }));

  app.get(`${base}/folders`, { preHandler: readGuards }, async (request) => {
    const result = await db.execute(sql`SELECT * FROM studyforge_folders WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND deleted_at IS NULL ORDER BY name`);
    return { folders: result.rows.map(camel) };
  });

  app.post(`${base}/folders`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const result = await db.execute(sql`INSERT INTO studyforge_folders(tenant_id,user_id,name,color) VALUES (${tenant(request)},${actor(request)},${text(input.name, 'name', 1, 160)},${text(input.color ?? '#7c3aed', 'color', 7, 7)}) RETURNING *`);
      return reply.code(201).send(camel(result.rows[0]));
    } catch (error) { return failure(reply, error); }
  });

  app.patch(`${base}/folders/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const result = await db.execute(sql`UPDATE studyforge_folders SET name=COALESCE(${text(input.name, 'name', 1, 160, true)},name),color=COALESCE(${text(input.color, 'color', 7, 7, true)},color),version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${identifier(request)} AND deleted_at IS NULL AND version=${integer(input.expectedVersion, 'expectedVersion', 1, 2_147_483_647)} RETURNING *`);
      if (!result.rows[0]) throw new InputError('Folder changed or was not found', 'STUDYFORGE_FOLDER_CONFLICT', 409);
      return camel(result.rows[0]);
    } catch (error) { return failure(reply, error); }
  });

  app.delete(`${base}/folders/:id`, { preHandler: writeGuards }, async (request, reply) => {
    const tenantId = tenant(request), userId = actor(request), id = identifier(request);
    const removed = await db.transaction(async (tx) => {
      await tx.execute(sql`UPDATE studyforge_study_sets SET folder_id=NULL,version=version+1,updated_at=NOW() WHERE tenant_id=${tenantId} AND user_id=${userId} AND folder_id=${id}`);
      return tx.execute(sql`UPDATE studyforge_folders SET deleted_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${id} AND deleted_at IS NULL RETURNING id`);
    });
    if (!removed.rows[0]) return reply.code(404).send({ error: 'Folder not found', code: 'STUDYFORGE_FOLDER_NOT_FOUND' });
    return reply.code(204).send();
  });

  app.get(`${base}/study-sets`, { preHandler: readGuards }, async (request) => {
    const query = (request.query ?? {}) as Row;
    const status = query.status === 'archived' ? 'archived' : query.status === 'all' ? null : 'active';
    const folderId = optionalId(query.folderId, 'folderId');
    const search = typeof query.search === 'string' && query.search.trim() ? `%${query.search.trim().slice(0, 160)}%` : null;
    const result = await db.execute(sql`SELECT id,title,course,folder_id,difficulty,exam_date,summary,quality_score,generation_provenance,status,version,created_at,updated_at FROM studyforge_study_sets WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND deleted_at IS NULL AND (${status}::text IS NULL OR status=${status}) AND (${folderId}::text IS NULL OR folder_id=${folderId}) AND (${search}::text IS NULL OR title ILIKE ${search} OR course ILIKE ${search}) ORDER BY updated_at DESC LIMIT 200`);
    return { sets: result.rows.map(camel) };
  });

  app.post(`${base}/study-sets`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const result = await createSet(request, createInput(body(request)));
      return reply.code(result.replayed ? 200 : 201).send({ set: camel(result.row), replayed: result.replayed });
    } catch (error) { return failure(reply, error); }
  });

  app.get(`${base}/study-sets/:id`, { preHandler: readGuards }, async (request, reply) => {
    try { return await loadCompleteSet(tenant(request), actor(request), identifier(request)); }
    catch (error) { return failure(reply, error); }
  });

  app.patch(`${base}/study-sets/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const folderId = input.folderId === undefined ? undefined : optionalId(input.folderId, 'folderId');
      if (folderId) {
        const folder = await db.execute(sql`SELECT 1 FROM studyforge_folders WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${folderId} AND deleted_at IS NULL`);
        if (!folder.rows[0]) throw new InputError('Folder not found', 'STUDYFORGE_FOLDER_NOT_FOUND', 404);
      }
      const status = input.status === undefined ? undefined : String(input.status);
      if (status && !['active', 'archived'].includes(status)) throw new InputError('status is invalid');
      const difficulty = input.difficulty === undefined ? undefined : String(input.difficulty);
      if (difficulty && !['easy', 'medium', 'hard'].includes(difficulty)) throw new InputError('difficulty is invalid');
      const result = await db.execute(sql`UPDATE studyforge_study_sets SET title=COALESCE(${text(input.title, 'title', 1, 200, true)},title),course=CASE WHEN ${input.course === undefined} THEN course ELSE ${text(input.course, 'course', 1, 160, true)} END,folder_id=CASE WHEN ${input.folderId === undefined} THEN folder_id ELSE ${folderId ?? null} END,difficulty=COALESCE(${difficulty ?? null},difficulty),exam_date=CASE WHEN ${input.examDate === undefined} THEN exam_date ELSE ${date(input.examDate, 'examDate', true)} END,status=COALESCE(${status ?? null},status),archived_at=CASE WHEN ${status ?? null}='archived' THEN NOW() WHEN ${status ?? null}='active' THEN NULL ELSE archived_at END,version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${identifier(request)} AND deleted_at IS NULL AND version=${integer(input.expectedVersion, 'expectedVersion', 1, 2_147_483_647)} RETURNING *`);
      if (!result.rows[0]) throw new InputError('Study set changed or was not found', 'STUDYFORGE_SET_CONFLICT', 409);
      return camel(result.rows[0]);
    } catch (error) { return failure(reply, error); }
  });

  app.delete(`${base}/study-sets/:id`, { preHandler: writeGuards }, async (request, reply) => {
    const tenantId = tenant(request), userId = actor(request), id = identifier(request);
    try {
      const set = await loadStudySet(tenantId, userId, id);
      await db.transaction(async (tx) => {
        await tx.execute(sql`UPDATE studyforge_short_answers SET deleted_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenantId} AND study_set_id=${id}`);
        await tx.execute(sql`UPDATE studyforge_cards SET deleted_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenantId} AND deck_id=${set.deck_id}`);
        await tx.execute(sql`UPDATE studyforge_questions SET deleted_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenantId} AND quiz_id=${set.quiz_id}`);
        await tx.execute(sql`UPDATE studyforge_decks SET deleted_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenantId} AND id=${set.deck_id}`);
        await tx.execute(sql`UPDATE studyforge_quizzes SET deleted_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenantId} AND id=${set.quiz_id}`);
        await tx.execute(sql`UPDATE studyforge_plans SET deleted_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenantId} AND id=${set.plan_id}`);
        await tx.execute(sql`UPDATE studyforge_sources SET deleted_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenantId} AND id=${set.source_id}`);
        await tx.execute(sql`UPDATE studyforge_study_sets SET deleted_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${id}`);
      });
      return reply.code(204).send();
    } catch (error) { return failure(reply, error); }
  });

  for (const action of ['duplicate', 'regenerate'] as const) {
    app.post(`${base}/study-sets/:id/${action}`, { preHandler: writeGuards }, async (request, reply) => {
      try {
        const original = await loadStudySet(tenant(request), actor(request), identifier(request));
        const source = await db.execute(sql`SELECT body FROM studyforge_sources WHERE tenant_id=${tenant(request)} AND id=${original.source_id} AND source_type='note' LIMIT 1`);
        if (!source.rows[0]) throw new InputError('The original note source is unavailable', 'STUDYFORGE_SOURCE_NOT_FOUND', 404);
        const inputBody = body(request);
        const result = await createSet(request, createInput({
          title: inputBody.title ?? `${original.title}${action === 'duplicate' ? ' copy' : ' regenerated'}`,
          course: original.course,
          subjectId: original.subject_id,
          folderId: original.folder_id,
          notes: (source.rows[0] as Row).body,
          difficulty: original.difficulty,
          examDate: original.exam_date ? String(original.exam_date).slice(0, 10) : null,
          generationMode: inputBody.generationMode ?? 'auto',
          idempotencyKey: inputBody.idempotencyKey,
          sourceSetId: original.id,
        }));
        if (action === 'regenerate' && !result.replayed) await db.execute(sql`UPDATE studyforge_study_sets SET status='archived',archived_at=NOW(),version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${original.id}`);
        return reply.code(result.replayed ? 200 : 201).send({ set: camel(result.row), replayed: result.replayed });
      } catch (error) { return failure(reply, error); }
    });
  }

  app.post(`${base}/study-sets/:id/quiz-attempts`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const tenantId = tenant(request), userId = actor(request), set = await loadStudySet(tenantId, userId, identifier(request));
      const input = body(request), key = idempotency(input.idempotencyKey);
      if (!Array.isArray(input.answers) || !input.answers.length || input.answers.length > 100) throw new InputError('answers must contain 1-100 items');
      const access = await resolveStudyForgeAccess(userId, tenantId);
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${userId}:quiz:${key}`},0))`);
        const replay = await tx.execute(sql`SELECT * FROM studyforge_quiz_attempts WHERE tenant_id=${tenantId} AND user_id=${userId} AND idempotency_key=${key} LIMIT 1`);
        if (replay.rows[0]) return { row: replay.rows[0], replayed: true };
        const questions = await tx.execute(sql`SELECT * FROM studyforge_questions WHERE tenant_id=${tenantId} AND quiz_id=${set.quiz_id} AND deleted_at IS NULL ORDER BY position`);
        const answers = input.answers as Row[];
        if (answers.length !== questions.rows.length) throw new InputError('Every quiz question must be answered');
        const submitted = new Map(answers.map((answer) => [String(answer.questionId), integer(answer.selectedIndex, 'selectedIndex', 0, 5)]));
        const review = questions.rows.map((value) => {
          const question = value as Row;
          if (!submitted.has(String(question.id))) throw new InputError('Every quiz question must be answered');
          const selectedIndex = submitted.get(String(question.id))!;
          return { questionId: question.id, selectedIndex, correctIndex: Number(question.correct_index), correct: selectedIndex === Number(question.correct_index), explanation: question.explanation, sourceExcerpt: question.source_excerpt };
        });
        await consumeStudyForgeUsage({ tenantId, userId, kind: 'quiz_attempt', limit: access.limits.quizAttemptsPerMonth, executor: tx });
        const correct = review.filter((item) => item.correct).length;
        const created = await tx.execute(sql`INSERT INTO studyforge_quiz_attempts(tenant_id,quiz_id,user_id,answers,correct_count,total_count,score_percent,idempotency_key,review_json) VALUES (${tenantId},${set.quiz_id},${userId},${JSON.stringify(answers)}::jsonb,${correct},${review.length},${Math.round(correct / review.length * 100)},${key},${JSON.stringify(review)}::jsonb) RETURNING *`);
        await recordDaily({ tenantId, userId, executor: tx, quizAttempts: 1, sessionsCompleted: 1 });
        await recordUsageEvent({ tenantId, moduleId: await moduleId(tx), userId, operation: 'studyforge.quiz_attempt', units: 1, unitKind: 'attempt', idempotencyKey: key, externalReference: String((created.rows[0] as Row).id) }, tx);
        return { row: created.rows[0], replayed: false };
      });
      return reply.code(result.replayed ? 200 : 201).send({ attempt: camel(result.row), replayed: result.replayed });
    } catch (error) { return failure(reply, error); }
  });

  app.get(`${base}/quiz-attempts`, { preHandler: readGuards }, async (request) => {
    const result = await db.execute(sql`SELECT attempt.id,attempt.quiz_id,attempt.correct_count,attempt.total_count,attempt.score_percent,attempt.review_json,attempt.completed_at,set.id AS study_set_id,set.title FROM studyforge_quiz_attempts attempt LEFT JOIN studyforge_study_sets set ON set.tenant_id=attempt.tenant_id AND set.quiz_id=attempt.quiz_id AND set.user_id=attempt.user_id WHERE attempt.tenant_id=${tenant(request)} AND attempt.user_id=${actor(request)} ORDER BY attempt.completed_at DESC LIMIT 200`);
    return { attempts: result.rows.map(camel) };
  });

  app.post(`${base}/study-sets/:id/flashcard-sessions`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const set = await loadStudySet(tenant(request), actor(request), identifier(request));
      const key = idempotency(body(request).idempotencyKey);
      const result = await db.execute(sql`INSERT INTO studyforge_learning_sessions(tenant_id,user_id,study_set_id,session_type,client_mutation_id) VALUES (${tenant(request)},${actor(request)},${set.id},'flashcards',${key}) ON CONFLICT (tenant_id,user_id,client_mutation_id) DO UPDATE SET client_mutation_id=EXCLUDED.client_mutation_id RETURNING *`);
      return reply.code(201).send(camel(result.rows[0]));
    } catch (error) { return failure(reply, error); }
  });

  app.patch(`${base}/flashcards/:id/status`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const tenantId = tenant(request), userId = actor(request), cardId = identifier(request);
      const state = String(body(request).state);
      if (!['learning', 'known'].includes(state)) throw new InputError('state is invalid');
      const access = await resolveStudyForgeAccess(userId, tenantId);
      const valid = await db.execute(sql`SELECT card.id FROM studyforge_cards card JOIN studyforge_study_sets set ON set.tenant_id=card.tenant_id AND set.deck_id=card.deck_id WHERE card.tenant_id=${tenantId} AND card.id=${cardId} AND card.deleted_at IS NULL AND set.user_id=${userId} AND set.deleted_at IS NULL LIMIT 1`);
      if (!valid.rows[0]) throw new InputError('Flashcard not found', 'STUDYFORGE_CARD_NOT_FOUND', 404);
      const interval = access.limits.spacedRepetition ? state === 'known' ? 3 : 1 : 0;
      const result = await db.execute(sql`INSERT INTO studyforge_card_progress(tenant_id,card_id,user_id,repetitions,lapses,interval_days,due_at,last_rating,learning_state) VALUES (${tenantId},${cardId},${userId},${state === 'known' ? 1 : 0},${state === 'learning' ? 1 : 0},${interval},NOW()+(${interval} || ' days')::interval,${state === 'known' ? 'good' : 'again'},${state}) ON CONFLICT (tenant_id,user_id,card_id) DO UPDATE SET repetitions=studyforge_card_progress.repetitions+${state === 'known' ? 1 : 0},lapses=studyforge_card_progress.lapses+${state === 'learning' ? 1 : 0},interval_days=${interval},due_at=NOW()+(${interval} || ' days')::interval,last_rating=${state === 'known' ? 'good' : 'again'},learning_state=${state},version=studyforge_card_progress.version+1,updated_at=NOW() RETURNING *`);
      return { progress: camel(result.rows[0]) };
    } catch (error) { return failure(reply, error); }
  });

  app.post(`${base}/flashcard-sessions/:sessionId/cards/:cardId`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const tenantId = tenant(request), userId = actor(request), sessionId = identifier(request, 'sessionId'), cardId = identifier(request, 'cardId');
      const input = body(request), state = String(input.state);
      if (!['learning', 'known'].includes(state)) throw new InputError('state is invalid');
      const key = idempotency(input.clientMutationId);
      const access = await resolveStudyForgeAccess(userId, tenantId);
      const result = await db.transaction(async (tx) => {
        const valid = await tx.execute(sql`SELECT session.id FROM studyforge_learning_sessions session JOIN studyforge_study_sets set ON set.tenant_id=session.tenant_id AND set.id=session.study_set_id JOIN studyforge_cards card ON card.tenant_id=set.tenant_id AND card.deck_id=set.deck_id WHERE session.tenant_id=${tenantId} AND session.user_id=${userId} AND session.id=${sessionId} AND session.completed_at IS NULL AND card.id=${cardId} AND card.deleted_at IS NULL`);
        if (!valid.rows[0]) throw new InputError('Session or card not found', 'STUDYFORGE_SESSION_CARD_NOT_FOUND', 404);
        const inserted = await tx.execute(sql`INSERT INTO studyforge_session_card_reviews(tenant_id,user_id,session_id,card_id,learning_state,client_mutation_id) VALUES (${tenantId},${userId},${sessionId},${cardId},${state},${key}) ON CONFLICT (tenant_id,user_id,client_mutation_id) DO NOTHING RETURNING id`);
        if (!inserted.rows[0]) return { replayed: true };
        const interval = access.limits.spacedRepetition ? state === 'known' ? 3 : 1 : 0;
        await tx.execute(sql`INSERT INTO studyforge_card_progress(tenant_id,card_id,user_id,repetitions,lapses,interval_days,due_at,last_rating,learning_state) VALUES (${tenantId},${cardId},${userId},${state === 'known' ? 1 : 0},${state === 'learning' ? 1 : 0},${interval},NOW()+(${interval} || ' days')::interval,${state === 'known' ? 'good' : 'again'},${state}) ON CONFLICT (tenant_id,user_id,card_id) DO UPDATE SET repetitions=studyforge_card_progress.repetitions+${state === 'known' ? 1 : 0},lapses=studyforge_card_progress.lapses+${state === 'learning' ? 1 : 0},interval_days=${interval},due_at=NOW()+(${interval} || ' days')::interval,last_rating=${state === 'known' ? 'good' : 'again'},learning_state=${state},version=studyforge_card_progress.version+1,updated_at=NOW()`);
        await tx.execute(sql`UPDATE studyforge_learning_sessions SET cards_seen=cards_seen+1,cards_known=cards_known+${state === 'known' ? 1 : 0},cards_learning=cards_learning+${state === 'learning' ? 1 : 0} WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${sessionId}`);
        return { replayed: false };
      });
      return reply.send(result);
    } catch (error) { return failure(reply, error); }
  });

  app.patch(`${base}/flashcard-sessions/:id/complete`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const input = body(request), duration = integer(input.durationSeconds, 'durationSeconds', 0, 86_400);
      const tenantId = tenant(request), userId = actor(request), id = identifier(request);
      const result = await db.transaction(async (tx) => {
        const locked = await tx.execute(sql`SELECT * FROM studyforge_learning_sessions WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${id} FOR UPDATE`);
        if (!locked.rows[0]) throw new InputError('Session not found', 'STUDYFORGE_SESSION_NOT_FOUND', 404);
        const current = locked.rows[0] as Row;
        const countActivity = current.activity_counted_at === null;
        const completed = await tx.execute(sql`UPDATE studyforge_learning_sessions SET completed_at=COALESCE(completed_at,NOW()),duration_seconds=CASE WHEN completed_at IS NULL THEN ${duration} ELSE duration_seconds END,activity_counted_at=CASE WHEN activity_counted_at IS NULL THEN NOW() ELSE activity_counted_at END WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${id} RETURNING *`);
        const row = completed.rows[0] as Row;
        if (countActivity) await recordDaily({ tenantId, userId, executor: tx, studySeconds: duration, cardsReviewed: Number(row.cards_seen), sessionsCompleted: 1 });
        return row;
      });
      return camel(result);
    } catch (error) { return failure(reply, error); }
  });

  app.patch(`${base}/study-sets/:setId/plan-sessions/:sessionId/complete`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const tenantId = tenant(request), userId = actor(request), set = await loadStudySet(tenantId, userId, identifier(request, 'setId'));
      const sessionId = identifier(request, 'sessionId'), input = body(request), completed = input.completed !== false;
      const result = await db.transaction(async (tx) => {
        const locked = await tx.execute(sql`SELECT * FROM studyforge_plan_sessions WHERE tenant_id=${tenantId} AND plan_id=${set.plan_id} AND id=${sessionId} FOR UPDATE`);
        if (!locked.rows[0]) throw new InputError('Plan session not found', 'STUDYFORGE_PLAN_SESSION_NOT_FOUND', 404);
        const countActivity = completed && (locked.rows[0] as Row).activity_counted_at === null;
        const changed = await tx.execute(sql`UPDATE studyforge_plan_sessions SET completed_at=CASE WHEN ${completed} THEN COALESCE(completed_at,NOW()) ELSE NULL END,completed_by_user_id=CASE WHEN ${completed} THEN ${userId} ELSE NULL END,activity_counted_at=CASE WHEN ${countActivity} THEN NOW() ELSE activity_counted_at END,version=version+1,updated_at=NOW() WHERE tenant_id=${tenantId} AND plan_id=${set.plan_id} AND id=${sessionId} RETURNING *`);
        if (countActivity) await recordDaily({ tenantId, userId, executor: tx, studySeconds: Number((changed.rows[0] as Row).estimated_minutes) * 60, sessionsCompleted: 1 });
        return changed.rows[0];
      });
      return camel(result);
    } catch (error) { return failure(reply, error); }
  });

  app.get(`${base}/exam-countdowns`, { preHandler: readGuards }, async (request) => {
    const tenantId = tenant(request), userId = actor(request), settings = await preference(tenantId, userId);
    const today = calendarDayInTimeZone(new Date(), String(settings.time_zone));
    const rows = await db.execute(sql`SELECT * FROM studyforge_exam_countdowns WHERE tenant_id=${tenantId} AND user_id=${userId} AND deleted_at IS NULL ORDER BY exam_date`);
    return { countdowns: rows.rows.map((row) => ({ ...camel(row), daysRemaining: countdownDays(String((row as Row).exam_date).slice(0, 10), today) })) };
  });

  app.post(`${base}/exam-countdowns`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const tenantId = tenant(request), userId = actor(request), access = await resolveStudyForgeAccess(userId, tenantId);
      if (!access.limits.examCountdowns) throw new InputError('Exam countdowns require a Pro or Tutor OperatorOS entitlement', 'STUDYFORGE_FEATURE_NOT_ENTITLED', 403);
      const input = body(request), settings = await preference(tenantId, userId);
      const timeZone = text(input.timeZone ?? settings.time_zone, 'timeZone', 1, 100)!;
      calendarDayInTimeZone(new Date(), timeZone);
      const setId = optionalId(input.studySetId, 'studySetId');
      if (setId) await loadStudySet(tenantId, userId, setId);
      const result = await db.execute(sql`INSERT INTO studyforge_exam_countdowns(tenant_id,user_id,study_set_id,title,exam_date,time_zone) VALUES (${tenantId},${userId},${setId},${text(input.title, 'title', 1, 200)},${date(input.examDate, 'examDate')},${timeZone}) RETURNING *`);
      return reply.code(201).send(camel(result.rows[0]));
    } catch (error) { return failure(reply, error); }
  });

  app.delete(`${base}/exam-countdowns/:id`, { preHandler: writeGuards }, async (request, reply) => {
    const result = await db.execute(sql`UPDATE studyforge_exam_countdowns SET deleted_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${identifier(request)} AND deleted_at IS NULL RETURNING id`);
    if (!result.rows[0]) return reply.code(404).send({ error: 'Countdown not found', code: 'STUDYFORGE_COUNTDOWN_NOT_FOUND' });
    return reply.code(204).send();
  });

  app.get(`${base}/study-sets/:id/export`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const data = await loadCompleteSet(tenant(request), actor(request), identifier(request));
      const format = String(((request.query ?? {}) as Row).format ?? 'json');
      const access = await resolveStudyForgeAccess(actor(request), tenant(request));
      if (format === 'csv' && !access.limits.advancedExport) throw new InputError('CSV export requires a Pro or Tutor OperatorOS entitlement', 'STUDYFORGE_FEATURE_NOT_ENTITLED', 403);
      if (format === 'json') return reply.header('content-type', 'application/json').header('content-disposition', `attachment; filename="studyforge-${data.id}.json"`).send(JSON.stringify({ schemaVersion: 2, exportedAt: new Date().toISOString(), set: data }, null, 2));
      if (format !== 'csv') throw new InputError('format must be json or csv');
      const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const rows = [['artifact', 'prompt', 'answer', 'sourceExcerpt'], ...data.cards.map((item: Row) => ['flashcard', item.question, item.answer, item.sourceExcerpt]), ...data.questions.map((item: Row) => ['mcq', item.question, JSON.stringify(item.choices), item.sourceExcerpt]), ...data.shortAnswers.map((item: Row) => ['short_answer', item.question, item.answer, item.sourceExcerpt])];
      return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="studyforge-${data.id}.csv"`).send(rows.map((row: unknown[]) => row.map(quote).join(',')).join('\r\n'));
    } catch (error) { return failure(reply, error); }
  });

  app.get(`${base}/account`, { preHandler: readGuards }, async (request) => {
    const access = await resolveStudyForgeAccess(actor(request), tenant(request));
    const usage = await db.execute(sql`SELECT generation_count,quiz_attempt_count,period_start FROM studyforge_usage_counters WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND period_start=date_trunc('month',CURRENT_DATE)::date`);
    return { plan: access, usage: camel(usage.rows[0] ?? { generation_count: 0, quiz_attempt_count: 0, period_start: new Date().toISOString().slice(0, 7) + '-01' }), billingAuthority: 'OperatorOS', childCheckoutAvailable: false };
  });

  app.get(`${base}/admin/stats`, { preHandler: adminGuards }, async (request) => {
    const result = await db.execute(sql`SELECT count(DISTINCT user_id)::int AS learners,count(*) FILTER (WHERE deleted_at IS NULL)::int AS study_sets,count(*) FILTER (WHERE status='active' AND deleted_at IS NULL)::int AS active_sets,COALESCE(avg(quality_score) FILTER (WHERE deleted_at IS NULL),0)::numeric(5,1) AS average_quality FROM studyforge_study_sets WHERE tenant_id=${tenant(request)}`);
    const activity = await db.execute(sql`SELECT COALESCE(sum(study_seconds),0)::int AS study_seconds,COALESCE(sum(cards_reviewed),0)::int AS cards_reviewed,COALESCE(sum(quiz_attempts),0)::int AS quiz_attempts FROM studyforge_daily_activity WHERE tenant_id=${tenant(request)}`);
    return { ...camel(result.rows[0]), ...camel(activity.rows[0]), authority: 'OperatorOS tenant admin' };
  });

  app.get(`${base}/platform/admin/stats`, { preHandler: [requireSuperAdmin] }, async () => {
    const result = await db.execute(sql`SELECT count(DISTINCT tenant_id)::int AS tenants,count(DISTINCT user_id)::int AS learners,count(*) FILTER (WHERE deleted_at IS NULL)::int AS study_sets FROM studyforge_study_sets`);
    return { ...camel(result.rows[0]), authority: 'OperatorOS platform admin' };
  });
}
