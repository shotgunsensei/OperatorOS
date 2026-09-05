import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { requireTenantModuleAccess, requireTenantModuleWriteAccess } from '../lib/tenant-auth.js';
import {
  StudyForgeValidationError,
  parseAttempt,
  parseCardPatch,
  parseDocumentSourceInput,
  parseGeneratedMaterial,
  parseGeneration,
  parseLifecycle,
  parseManualDeck,
  parsePlanSessionPatch,
  parseQuestionPatch,
  parseReview,
  parseSessionCompletion,
  parseSourceInput,
  parseSubjectInput,
  sha256,
} from '../lib/studyforge.js';
import { AiProviderDisabledError, getAiProvider, getProviderInfo } from '../lib/ai-provider.js';
import {
  appendActivityEvent,
  beginIdempotentOperation,
  completeIdempotentOperation,
  failIdempotentOperation,
  recordUsageEvent,
} from '../lib/shared-usage-activity.js';
import { createAttachment, getAttachmentContent, getMaxAttachmentBytes } from '../lib/shared-attachments.js';
import { planStudyForgeImport } from '../lib/studyforge-import.js';
import { consumeStudyForgeUsage, releaseStudyForgeUsage, resolveStudyForgeAccess } from '../lib/studyforge-access.js';

const readGuards = [requireTenantModuleAccess('studyforge-ai')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];

type Row = Record<string, any>;
type Executor = Pick<typeof db, 'execute'>;

function context(request: FastifyRequest) {
  return {
    tenantId: String((request as any).tenantContext.tenantId),
    userId: String((request as any).user.id),
  };
}

function validation(reply: FastifyReply, error: unknown) {
  if (!(error instanceof StudyForgeValidationError)) return false;
  reply.code(error.statusCode).send({
    error: error.message,
    code: error.code,
    ...(error.field ? { field: error.field } : {}),
  });
  return true;
}

function notFound(reply: FastifyReply, entity: string) {
  return reply.code(404).send({
    error: `${entity} not found`,
    code: `STUDYFORGE_${entity.toUpperCase().replaceAll(' ', '_')}_NOT_FOUND`,
  });
}

function conflict(reply: FastifyReply, entity: string) {
  return reply.code(409).send({
    error: `${entity} changed; reload before saving`,
    code: 'STUDYFORGE_VERSION_CONFLICT',
  });
}

function camel(row: Row): Row {
  const result: Row = {};
  for (const [key, value] of Object.entries(row)) {
    result[key.replace(/_([a-z])/g, (_, char) => char.toUpperCase())] = value;
  }
  delete result.tenantId;
  delete result.createdByUserId;
  delete result.userId;
  delete result.deletedAt;
  delete result.inputSha256;
  return result;
}

async function moduleId(): Promise<string | null> {
  const result = await db.execute(sql`SELECT id FROM modules WHERE slug='studyforge-ai' LIMIT 1`);
  return result.rows[0] ? String(result.rows[0].id) : null;
}

async function scoped(table: 'subject' | 'source' | 'deck' | 'card' | 'quiz' | 'question' | 'plan' | 'session', tenantId: string, id: string, executor: Executor = db): Promise<Row | null> {
  const result = table === 'subject'
    ? await executor.execute(sql`SELECT * FROM studyforge_subjects WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL LIMIT 1`)
    : table === 'source'
      ? await executor.execute(sql`SELECT * FROM studyforge_sources WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL LIMIT 1`)
      : table === 'deck'
        ? await executor.execute(sql`SELECT * FROM studyforge_decks WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL LIMIT 1`)
        : table === 'card'
          ? await executor.execute(sql`SELECT * FROM studyforge_cards WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL LIMIT 1`)
          : table === 'quiz'
            ? await executor.execute(sql`SELECT * FROM studyforge_quizzes WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL LIMIT 1`)
            : table === 'question'
              ? await executor.execute(sql`SELECT * FROM studyforge_questions WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL LIMIT 1`)
              : table === 'plan'
                ? await executor.execute(sql`SELECT * FROM studyforge_plans WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL LIMIT 1`)
                : await executor.execute(sql`SELECT * FROM studyforge_plan_sessions WHERE tenant_id=${tenantId} AND id=${id} LIMIT 1`);
  return (result.rows[0] as Row | undefined) ?? null;
}

async function sourceText(tenantId: string, source: Row, modId: string): Promise<string> {
  if (source.source_type === 'note') return String(source.body);
  const attachment = await getAttachmentContent({
    tenantId,
    moduleId: modId,
    attachmentId: String(source.attachment_id),
    objectType: 'studyforge_source',
    objectId: String(source.id),
  });
  if (!attachment) throw Object.assign(new Error('Source document is not available'), { code: 'SOURCE_DOCUMENT_NOT_FOUND' });
  const mime = String(attachment.metadata.detected_mime_type);
  if (!['text/plain', 'text/csv', 'application/json'].includes(mime)) {
    throw Object.assign(new Error('Only scanned plain-text, CSV, or JSON documents can be used for generation'), {
      code: 'SOURCE_DOCUMENT_TEXT_REQUIRED',
    });
  }
  const body = attachment.content.toString('utf8').trim();
  if (body.length < 8 || body.length > 100_000) {
    throw Object.assign(new Error('Source document text must be 8-100000 characters'), { code: 'SOURCE_DOCUMENT_INVALID' });
  }
  return body;
}

async function activity(request: FastifyRequest, eventType: string, objectType: string, objectId: string, summary: string, metadata: Row = {}, executor: Executor = db) {
  const modId = await moduleId();
  if (!modId) return;
  const { tenantId, userId } = context(request);
  await appendActivityEvent({
    tenantId,
    moduleId: modId,
    actorUserId: userId,
    objectType,
    objectId,
    eventType,
    summary,
    metadata,
    correlationId: request.id,
  }, executor as any);
}

const transitions: Record<string, readonly string[]> = {
  draft: ['review', 'archived'],
  review: ['draft', 'published', 'archived'],
  published: ['review', 'archived'],
  completed: ['archived'],
  archived: [],
};

async function lists(tenantId: string, userId: string, includeAnswerKey = false) {
  const [subjects, sources, decks, cards, quizzes, questions, attempts, plans, sessions, progress, generations] = await Promise.all([
    db.execute(sql`SELECT * FROM studyforge_subjects WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200`),
    db.execute(sql`SELECT id,tenant_id,subject_id,title,source_type,attachment_id,content_sha256,version,created_at,updated_at
      FROM studyforge_sources WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200`),
    db.execute(sql`SELECT * FROM studyforge_decks WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200`),
    db.execute(sql`SELECT * FROM studyforge_cards WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY deck_id,position LIMIT 1000`),
    db.execute(sql`SELECT * FROM studyforge_quizzes WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200`),
    db.execute(sql`SELECT id,tenant_id,quiz_id,source_id,position,question,choices,correct_index,explanation,source_excerpt,version,created_at,updated_at
      FROM studyforge_questions WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY quiz_id,position LIMIT 1000`),
    db.execute(sql`SELECT * FROM studyforge_quiz_attempts WHERE tenant_id=${tenantId} AND user_id=${userId} ORDER BY completed_at DESC LIMIT 200`),
    db.execute(sql`SELECT * FROM studyforge_plans WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200`),
    db.execute(sql`SELECT s.* FROM studyforge_plan_sessions s JOIN studyforge_plans p
      ON p.tenant_id=s.tenant_id AND p.id=s.plan_id
      WHERE s.tenant_id=${tenantId} AND p.deleted_at IS NULL ORDER BY s.plan_id,s.position LIMIT 1000`),
    db.execute(sql`SELECT * FROM studyforge_card_progress WHERE tenant_id=${tenantId} AND user_id=${userId} ORDER BY due_at LIMIT 1000`),
    db.execute(sql`SELECT id,tenant_id,source_id,generation_type,source_references,provider,model,provider_version,token_count,duration_ms,created_at
      FROM studyforge_generations WHERE tenant_id=${tenantId} ORDER BY created_at DESC LIMIT 100`),
  ]);
  return {
    subjects: subjects.rows.map(camel),
    sources: sources.rows.map(camel),
    decks: decks.rows.map(camel),
    cards: cards.rows.map(camel),
    quizzes: quizzes.rows.map(camel),
    questions: questions.rows.map((row) => {
      const item = camel(row as Row);
      if (!includeAnswerKey) delete item.correctIndex;
      return item;
    }),
    attempts: attempts.rows.map(camel),
    plans: plans.rows.map(camel),
    sessions: sessions.rows.map(camel),
    progress: progress.rows.map(camel),
    generations: generations.rows.map(camel),
  };
}

export async function registerStudyForgeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/modules/studyforge-ai/workspace', { preHandler: readGuards }, async (request, reply) => {
    const { tenantId, userId } = context(request);
    const canAuthor = (request as any).tenantModuleAccessLevel !== 'viewer';
    const data = await lists(tenantId, userId, canAuthor);
    const completedSessions = data.sessions.filter((row) => row.completedAt).length;
    const dueCards = data.progress.filter((row) => new Date(row.dueAt) <= new Date()).length;
    const latestScores = data.attempts.slice(0, 10).map((row) => Number(row.scorePercent));
    const access = await resolveStudyForgeAccess(userId, tenantId);
    return reply.send({
      ...data,
      dashboard: {
        subjects: data.subjects.length,
        sources: data.sources.length,
        publishedDecks: data.decks.filter((row) => row.status === 'published').length,
        publishedQuizzes: data.quizzes.filter((row) => row.status === 'published').length,
        completedSessions,
        dueCards,
        attempts: data.attempts.length,
        averageScore: latestScores.length
          ? Math.round(latestScores.reduce((sum, value) => sum + value, 0) / latestScores.length)
          : 0,
      },
      ai: { ...getProviderInfo(), monthlyLimit: access.limits.generationsPerMonth },
    });
  });

  app.post('/v1/modules/studyforge-ai/subjects', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseSubjectInput(request.body);
      const { tenantId, userId } = context(request);
      const result = await db.execute(sql`INSERT INTO studyforge_subjects
        (tenant_id,created_by_user_id,name,course_code,description)
        VALUES (${tenantId},${userId},${input.name!},${input.courseCode ?? null},${input.description ?? null})
        RETURNING *`);
      await activity(request, 'subject.created', 'studyforge_subject', String(result.rows[0].id), 'Study subject created.');
      return reply.code(201).send({ subject: camel(result.rows[0] as Row) });
    } catch (error) {
      if (validation(reply, error)) return;
      if ((error as any)?.code === '23505') return reply.code(409).send({ error: 'An active subject with that name and course code exists', code: 'STUDYFORGE_SUBJECT_DUPLICATE' });
      throw error;
    }
  });

  app.patch('/v1/modules/studyforge-ai/subjects/:id', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseSubjectInput(request.body, true);
      const { tenantId } = context(request);
      const id = String((request.params as any).id);
      const result = await db.execute(sql`UPDATE studyforge_subjects SET
        name=COALESCE(${input.name ?? null},name),
        course_code=CASE WHEN ${input.courseCode === undefined} THEN course_code ELSE ${input.courseCode ?? null} END,
        description=CASE WHEN ${input.description === undefined} THEN description ELSE ${input.description ?? null} END,
        version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL AND version=${input.expectedVersion}
        RETURNING *`);
      if (!result.rows[0]) return await scoped('subject', tenantId, id) ? conflict(reply, 'subject') : notFound(reply, 'subject');
      return reply.send({ subject: camel(result.rows[0] as Row) });
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.delete('/v1/modules/studyforge-ai/subjects/:id', { preHandler: writeGuards }, async (request, reply) => {
    const { tenantId } = context(request);
    const id = String((request.params as any).id);
    const expected = Number((request.query as any)?.expectedVersion);
    if (!Number.isInteger(expected) || expected < 1) return reply.code(400).send({ error: 'expectedVersion is required', code: 'VERSION_REQUIRED' });
    const result = await db.execute(sql`UPDATE studyforge_subjects SET deleted_at=NOW(),updated_at=NOW(),version=version+1
      WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL AND version=${expected} RETURNING id`);
    if (!result.rows[0]) return await scoped('subject', tenantId, id) ? conflict(reply, 'subject') : notFound(reply, 'subject');
    return reply.send({ ok: true });
  });

  app.post('/v1/modules/studyforge-ai/sources', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseSourceInput(request.body);
      if (input.sourceType !== 'note') {
        return reply.code(400).send({ error: 'Use the document upload endpoint for document sources', code: 'STUDYFORGE_DOCUMENT_UPLOAD_REQUIRED' });
      }
      const { tenantId, userId } = context(request);
      if (input.subjectId && !await scoped('subject', tenantId, input.subjectId)) return notFound(reply, 'subject');
      const result = await db.execute(sql`INSERT INTO studyforge_sources
        (tenant_id,created_by_user_id,subject_id,title,source_type,body,content_sha256)
        VALUES (${tenantId},${userId},${input.subjectId ?? null},${input.title!},'note',${input.body!},${sha256(input.body!)})
        RETURNING id,tenant_id,subject_id,title,source_type,attachment_id,content_sha256,version,created_at,updated_at`);
      await activity(request, 'source.created', 'studyforge_source', String(result.rows[0].id), 'Private note source created.');
      return reply.code(201).send({ source: camel(result.rows[0] as Row) });
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.post('/v1/modules/studyforge-ai/sources/document', {
    bodyLimit: Math.ceil(getMaxAttachmentBytes() * 1.38) + 16_384,
    preHandler: writeGuards,
  }, async (request, reply) => {
    const key = String(request.headers['idempotency-key'] ?? '');
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) {
      return reply.code(400).send({ error: 'A valid Idempotency-Key header is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }
    try {
      const input = parseDocumentSourceInput(request.body);
      const { tenantId, userId } = context(request);
      const { title, subjectId, content } = input;
      if (subjectId && !await scoped('subject', tenantId, subjectId)) return notFound(reply, 'subject');
      const modId = await moduleId();
      if (!modId) return notFound(reply, 'module');
      const sourceId = randomUUID();
      const result = await db.transaction(async (tx) => {
        const operation = await beginIdempotentOperation({
          tenantId, moduleId: modId, scope: 'studyforge.source.document',
          idempotencyKey: key,
          request: {
            subjectId,
            title,
            originalName: input.originalName,
            mimeType: input.mimeType,
            contentSha256: sha256(content),
          },
        }, tx);
        if (operation.state !== 'acquired') return { operation };
        const attachment = await createAttachment({
          tenantId,
          moduleId: modId,
          objectType: 'studyforge_source',
          objectId: sourceId,
          originalName: input.originalName,
          declaredMimeType: input.mimeType,
          content,
          createdByUserId: userId,
          retentionUntil: null,
          correlationId: request.id,
        }, tx);
        const inserted = await tx.execute(sql`INSERT INTO studyforge_sources
          (id,tenant_id,created_by_user_id,subject_id,title,source_type,attachment_id,content_sha256)
          VALUES (${sourceId},${tenantId},${userId},${subjectId},${title},'document',${String(attachment.id)},${String(attachment.sha256)})
          RETURNING id,tenant_id,subject_id,title,source_type,attachment_id,content_sha256,version,created_at,updated_at`);
        const response = camel(inserted.rows[0] as Row);
        await completeIdempotentOperation({
          tenantId, id: operation.id, leaseExpiresAt: operation.leaseExpiresAt,
          responseStatus: 202, responseJson: response,
        }, tx);
        await recordUsageEvent({
          tenantId, moduleId: modId, userId, operation: 'attachment.storage',
          units: content.length, unitKind: 'bytes', idempotencyKey: `studyforge-source:${sourceId}`,
          externalReference: sourceId, metadata: { objectType: 'studyforge_source' },
        }, tx);
        return { response };
      });
      if ('response' in result && result.response) {
        await activity(request, 'source.document_uploaded', 'studyforge_source', String(result.response.id), 'Private document source uploaded for security scanning.');
        return reply.code(202).send({ source: result.response, replayed: false });
      }
      if (result.operation.state === 'replay') return reply.code(result.operation.responseStatus).send({ source: result.operation.responseJson, replayed: true });
      if (result.operation.state === 'conflict') return reply.code(409).send({ error: 'Idempotency key was reused with different content', code: 'IDEMPOTENCY_CONFLICT' });
      return reply.code(409).send({ error: 'Document upload is already processing', code: 'IDEMPOTENCY_IN_PROGRESS' });
    } catch (error) {
      if (validation(reply, error)) return;
      const code = String((error as any)?.code ?? '');
      if (code.includes('SIZE')) return reply.code(413).send({ error: 'Document is too large', code });
      if (code.includes('MIME') || code.includes('SIGNATURE')) return reply.code(422).send({ error: (error as Error).message, code });
      throw error;
    }
  });

  app.delete('/v1/modules/studyforge-ai/sources/:id', { preHandler: writeGuards }, async (request, reply) => {
    const { tenantId } = context(request);
    const id = String((request.params as any).id);
    const expected = Number((request.query as any)?.expectedVersion);
    if (!Number.isInteger(expected) || expected < 1) return reply.code(400).send({ error: 'expectedVersion is required', code: 'VERSION_REQUIRED' });
    const result = await db.execute(sql`UPDATE studyforge_sources SET deleted_at=NOW(),updated_at=NOW(),version=version+1
      WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL AND version=${expected} RETURNING id`);
    if (!result.rows[0]) return await scoped('source', tenantId, id) ? conflict(reply, 'source') : notFound(reply, 'source');
    return reply.send({ ok: true });
  });

  app.post('/v1/modules/studyforge-ai/decks', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseManualDeck(request.body);
      const { tenantId, userId } = context(request);
      if (input.subjectId && !await scoped('subject', tenantId, input.subjectId)) return notFound(reply, 'subject');
      if (input.sourceId && !await scoped('source', tenantId, input.sourceId)) return notFound(reply, 'source');
      const response = await db.transaction(async (tx) => {
        const deck = await tx.execute(sql`INSERT INTO studyforge_decks
          (tenant_id,created_by_user_id,subject_id,source_id,title,description)
          VALUES (${tenantId},${userId},${input.subjectId ?? null},${input.sourceId ?? null},${input.title},${input.description ?? null})
          RETURNING *`);
        const deckId = String(deck.rows[0].id);
        for (const card of input.cards) {
          await tx.execute(sql`INSERT INTO studyforge_cards
            (tenant_id,deck_id,source_id,position,question,answer,source_excerpt)
            VALUES (${tenantId},${deckId},${input.sourceId ?? null},${card.position},${card.question},${card.answer},${card.sourceExcerpt ?? null})`);
        }
        return { deck: camel(deck.rows[0] as Row), cards: input.cards };
      });
      await activity(request, 'deck.created', 'studyforge_deck', String(response.deck.id), 'Draft flashcard deck created.');
      return reply.code(201).send(response);
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.patch('/v1/modules/studyforge-ai/cards/:id', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseCardPatch(request.body);
      const { tenantId } = context(request);
      const id = String((request.params as any).id);
      const current = await db.execute(sql`SELECT c.*, d.status AS deck_status FROM studyforge_cards c
        JOIN studyforge_decks d ON d.tenant_id=c.tenant_id AND d.id=c.deck_id
        WHERE c.tenant_id=${tenantId} AND c.id=${id} AND c.deleted_at IS NULL AND d.deleted_at IS NULL LIMIT 1`);
      if (!current.rows[0]) return notFound(reply, 'card');
      if (current.rows[0].deck_status === 'published' || current.rows[0].deck_status === 'archived') {
        return reply.code(409).send({ error: 'Published or archived cards cannot be edited', code: 'STUDYFORGE_MATERIAL_LOCKED' });
      }
      if (input.sourceExcerpt !== undefined && input.sourceExcerpt !== null) {
        const sourceId = current.rows[0].source_id ? String(current.rows[0].source_id) : null;
        const source = sourceId ? await scoped('source', tenantId, sourceId) : null;
        const modId = await moduleId();
        if (!source || !modId || !(await sourceText(tenantId, source, modId)).includes(input.sourceExcerpt)) {
          return reply.code(422).send({ error: 'sourceExcerpt must be an exact excerpt from the authorized source', code: 'STUDYFORGE_SOURCE_EXCERPT_INVALID' });
        }
      }
      const result = await db.execute(sql`UPDATE studyforge_cards SET
        question=COALESCE(${input.question ?? null},question),
        answer=COALESCE(${input.answer ?? null},answer),
        source_excerpt=CASE WHEN ${input.sourceExcerpt === undefined} THEN source_excerpt ELSE ${input.sourceExcerpt ?? null} END,
        version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL AND version=${input.expectedVersion}
        RETURNING *`);
      if (!result.rows[0]) return await scoped('card', tenantId, id) ? conflict(reply, 'card') : notFound(reply, 'card');
      return reply.send({ card: camel(result.rows[0] as Row) });
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.patch('/v1/modules/studyforge-ai/questions/:id', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseQuestionPatch(request.body);
      const { tenantId } = context(request);
      const id = String((request.params as any).id);
      const current = await db.execute(sql`SELECT q.*, z.status AS quiz_status FROM studyforge_questions q
        JOIN studyforge_quizzes z ON z.tenant_id=q.tenant_id AND z.id=q.quiz_id
        WHERE q.tenant_id=${tenantId} AND q.id=${id} AND q.deleted_at IS NULL AND z.deleted_at IS NULL LIMIT 1`);
      const question = current.rows[0] as Row | undefined;
      if (!question) return notFound(reply, 'question');
      if (question.quiz_status === 'published' || question.quiz_status === 'archived') {
        return reply.code(409).send({ error: 'Published or archived questions cannot be edited', code: 'STUDYFORGE_MATERIAL_LOCKED' });
      }
      const choices = input.choices ?? question.choices as string[];
      const correctIndex = input.correctIndex ?? Number(question.correct_index);
      if (correctIndex >= choices.length) {
        return reply.code(400).send({ error: 'correctIndex must identify one of the saved choices', code: 'STUDYFORGE_INPUT_INVALID' });
      }
      if (input.sourceExcerpt !== undefined && input.sourceExcerpt !== null) {
        const sourceId = question.source_id ? String(question.source_id) : null;
        const source = sourceId ? await scoped('source', tenantId, sourceId) : null;
        const modId = await moduleId();
        if (!source || !modId || !(await sourceText(tenantId, source, modId)).includes(input.sourceExcerpt)) {
          return reply.code(422).send({ error: 'sourceExcerpt must be an exact excerpt from the authorized source', code: 'STUDYFORGE_SOURCE_EXCERPT_INVALID' });
        }
      }
      const result = await db.execute(sql`UPDATE studyforge_questions SET
        question=COALESCE(${input.question ?? null},question),
        choices=COALESCE(${input.choices ? JSON.stringify(input.choices) : null}::jsonb,choices),
        correct_index=${correctIndex},
        explanation=COALESCE(${input.explanation ?? null},explanation),
        source_excerpt=CASE WHEN ${input.sourceExcerpt === undefined} THEN source_excerpt ELSE ${input.sourceExcerpt ?? null} END,
        version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL AND version=${input.expectedVersion}
        RETURNING *`);
      if (!result.rows[0]) return conflict(reply, 'question');
      return reply.send({ question: camel(result.rows[0] as Row) });
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  for (const entity of ['decks', 'quizzes', 'plans'] as const) {
    app.patch(`/v1/modules/studyforge-ai/${entity}/:id/status`, { preHandler: writeGuards }, async (request, reply) => {
      try {
        const values = entity === 'plans'
          ? ['draft', 'review', 'published', 'completed', 'archived']
          : ['draft', 'review', 'published', 'archived'];
        const input = parseLifecycle(request.body, values);
        const { tenantId } = context(request);
        const id = String((request.params as any).id);
        const table = entity === 'decks' ? 'studyforge_decks' : entity === 'quizzes' ? 'studyforge_quizzes' : 'studyforge_plans';
        const current = await scoped(entity === 'decks' ? 'deck' : entity === 'quizzes' ? 'quiz' : 'plan', tenantId, id);
        if (!current) return notFound(reply, entity.slice(0, -1));
        if (!transitions[String(current.status)]?.includes(input.status)) {
          return reply.code(409).send({ error: `Cannot move ${entity.slice(0, -1)} from ${current.status} to ${input.status}`, code: 'STUDYFORGE_INVALID_TRANSITION' });
        }
        const result = entity === 'decks'
          ? await db.execute(sql`UPDATE studyforge_decks SET status=${input.status},version=version+1,updated_at=NOW()
              WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL AND version=${input.expectedVersion} RETURNING *`)
          : entity === 'quizzes'
            ? await db.execute(sql`UPDATE studyforge_quizzes SET status=${input.status},version=version+1,updated_at=NOW()
                WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL AND version=${input.expectedVersion} RETURNING *`)
            : await db.execute(sql`UPDATE studyforge_plans SET status=${input.status},version=version+1,updated_at=NOW()
                WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL AND version=${input.expectedVersion} RETURNING *`);
        if (!result.rows[0]) return conflict(reply, entity.slice(0, -1));
        return reply.send({ [entity.slice(0, -1)]: camel(result.rows[0] as Row) });
      } catch (error) {
        if (validation(reply, error)) return;
        throw error;
      }
    });
  }

  app.post('/v1/modules/studyforge-ai/generations', { preHandler: writeGuards }, async (request, reply) => {
    let operation: Awaited<ReturnType<typeof beginIdempotentOperation>> | null = null;
    let reservedUsage: { tenantId: string; userId: string } | null = null;
    try {
      const input = parseGeneration(request.body);
      const { tenantId, userId } = context(request);
      const source = await scoped('source', tenantId, input.sourceId);
      if (!source) return notFound(reply, 'source');
      if (input.subjectId && !await scoped('subject', tenantId, input.subjectId)) return notFound(reply, 'subject');
      const modId = await moduleId();
      if (!modId) return notFound(reply, 'module');
      const access = await resolveStudyForgeAccess(userId, tenantId);
      const sourceBody = await sourceText(tenantId, source, modId);
      const safeRequest = {
        sourceId: input.sourceId,
        sourceHash: sha256(sourceBody),
        subjectId: input.subjectId,
        type: input.type,
        title: input.title,
        targetDate: input.targetDate,
      };
      operation = await beginIdempotentOperation({
        tenantId,
        moduleId: modId,
        scope: 'studyforge.generation',
        idempotencyKey: input.idempotencyKey,
        request: safeRequest,
        leaseMs: 120_000,
      });
      if (operation.state === 'replay') return reply.code(operation.responseStatus).send({ ...(operation.responseJson as Row), replayed: true });
      if (operation.state === 'conflict') return reply.code(409).send({ error: 'Idempotency key was reused for another generation request', code: 'IDEMPOTENCY_CONFLICT' });
      if (operation.state === 'in_progress') return reply.code(409).send({ error: 'Generation is already processing', code: 'IDEMPOTENCY_IN_PROGRESS' });
      const acquiredOperation = operation;

      await consumeStudyForgeUsage({
        tenantId,
        userId,
        kind: 'generation',
        limit: access.limits.generationsPerMonth,
      });
      reservedUsage = { tenantId, userId };

      const provider = getAiProvider();
      const result = await provider.complete({
        systemPrompt: [
          'OPERATOROS_STUDYFORGE_V1',
          'Generate learner material only from the supplied authorized source.',
          'Every card/question must include an exact sourceExcerpt substring.',
          'Never invent a citation, URL, author, publication, or fact.',
          'Return strict JSON only. Generated material remains draft for human review.',
        ].join('\n'),
        userPrompt: JSON.stringify({
          type: input.type,
          title: input.title,
          targetDate: input.targetDate,
          source: sourceBody,
        }),
        responseFormat: 'json',
        temperature: 0.2,
        maxTokens: 4_000,
      });
      const material = parseGeneratedMaterial(input.type, result.text, sourceBody);
      const response = await db.transaction(async (tx) => {
        const generated = await tx.execute(sql`INSERT INTO studyforge_generations
          (tenant_id,user_id,source_id,generation_type,idempotency_key,input_sha256,output_json,
           source_references,provider,model,provider_version,token_count,duration_ms)
          VALUES (${tenantId},${userId},${input.sourceId},${input.type},${input.idempotencyKey},
            ${sha256(JSON.stringify(safeRequest))},${JSON.stringify(material)}::jsonb,
            ${JSON.stringify([{ sourceId: input.sourceId, contentSha256: source.content_sha256 }])}::jsonb,
            ${result.provider},${result.model},${result.version},${result.tokenCount},${result.durationMs})
          RETURNING *`);
        const generationId = String(generated.rows[0].id);
        let entity: Row;
        if (material.type === 'deck') {
          const inserted = await tx.execute(sql`INSERT INTO studyforge_decks
            (tenant_id,created_by_user_id,subject_id,source_id,generation_id,title,status)
            VALUES (${tenantId},${userId},${input.subjectId ?? source.subject_id ?? null},${input.sourceId},${generationId},${input.title},'draft')
            RETURNING *`);
          entity = camel(inserted.rows[0] as Row);
          for (const [position, card] of material.cards.entries()) {
            await tx.execute(sql`INSERT INTO studyforge_cards
              (tenant_id,deck_id,source_id,position,question,answer,source_excerpt)
              VALUES (${tenantId},${entity.id},${input.sourceId},${position},${card.question},${card.answer},${card.sourceExcerpt})`);
          }
        } else if (material.type === 'quiz') {
          const inserted = await tx.execute(sql`INSERT INTO studyforge_quizzes
            (tenant_id,created_by_user_id,subject_id,source_id,generation_id,title,status)
            VALUES (${tenantId},${userId},${input.subjectId ?? source.subject_id ?? null},${input.sourceId},${generationId},${input.title},'draft')
            RETURNING *`);
          entity = camel(inserted.rows[0] as Row);
          for (const [position, question] of material.questions.entries()) {
            await tx.execute(sql`INSERT INTO studyforge_questions
              (tenant_id,quiz_id,source_id,position,question,choices,correct_index,explanation,source_excerpt)
              VALUES (${tenantId},${entity.id},${input.sourceId},${position},${question.question},${JSON.stringify(question.choices)}::jsonb,
                ${question.correctIndex},${question.explanation},${question.sourceExcerpt})`);
          }
        } else {
          const inserted = await tx.execute(sql`INSERT INTO studyforge_plans
            (tenant_id,created_by_user_id,subject_id,source_id,generation_id,title,target_date,status)
            VALUES (${tenantId},${userId},${input.subjectId ?? source.subject_id ?? null},${input.sourceId},${generationId},
              ${input.title},${input.targetDate ?? null},'draft') RETURNING *`);
          entity = camel(inserted.rows[0] as Row);
          for (const [position, session] of material.sessions.entries()) {
            await tx.execute(sql`INSERT INTO studyforge_plan_sessions
              (tenant_id,plan_id,position,title,focus,scheduled_for,estimated_minutes)
              VALUES (${tenantId},${entity.id},${position},${session.title},${session.focus},${input.targetDate ?? null},${session.estimatedMinutes})`);
          }
        }
        await recordUsageEvent({
          tenantId, moduleId: modId, userId, operation: 'studyforge.ai_generation',
          units: 1, unitKind: 'generation', idempotencyKey: `studyforge:${generationId}`,
          externalReference: generationId, metadata: { type: input.type, tokenCount: result.tokenCount },
        }, tx);
        const payload = {
          generation: camel(generated.rows[0] as Row),
          entity,
          material,
          reviewRequired: true,
          replayed: false,
        };
        await completeIdempotentOperation({
          tenantId,
          id: acquiredOperation.id,
          leaseExpiresAt: acquiredOperation.leaseExpiresAt,
          responseStatus: 201,
          responseJson: payload,
        }, tx);
        return payload;
      });
      reservedUsage = null;
      await activity(request, 'generation.completed', 'studyforge_generation', String(response.generation.id), 'Draft study material generated from an authorized source.', { type: input.type });
      return reply.code(201).send(response);
    } catch (error) {
      if (reservedUsage) {
        await releaseStudyForgeUsage({ ...reservedUsage, kind: 'generation' }).catch(() => undefined);
      }
      if (operation?.state === 'acquired') {
        await failIdempotentOperation({
          tenantId: context(request).tenantId,
          id: operation.id,
          leaseExpiresAt: operation.leaseExpiresAt,
        }).catch(() => undefined);
      }
      if (validation(reply, error)) return;
      if (error instanceof AiProviderDisabledError) return reply.code(503).send({ error: 'AI generation is disabled until the shared provider is configured', code: error.code });
      if ((error as any)?.statusCode === 402) return reply.code(402).send({ error: (error as Error).message, code: (error as any).code });
      const code = String((error as any)?.code ?? '');
      if (code.startsWith('SOURCE_') || code.startsWith('ATTACHMENT_')) {
        return reply.code(code.includes('PENDING') ? 423 : 422).send({ error: (error as Error).message, code });
      }
      throw error;
    }
  });

  app.post('/v1/modules/studyforge-ai/quizzes/:id/attempts', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const answers = parseAttempt(request.body);
      const { tenantId, userId } = context(request);
      const quizId = String((request.params as any).id);
      const quiz = await scoped('quiz', tenantId, quizId);
      if (!quiz || quiz.status !== 'published') return notFound(reply, 'published quiz');
      const questions = await db.execute(sql`SELECT id,correct_index FROM studyforge_questions
        WHERE tenant_id=${tenantId} AND quiz_id=${quizId} AND deleted_at IS NULL ORDER BY position`);
      if (answers.length !== questions.rows.length) {
        return reply.code(400).send({ error: 'Every quiz question must be answered exactly once', code: 'STUDYFORGE_ATTEMPT_INCOMPLETE' });
      }
      const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.selectedIndex]));
      if (answerMap.size !== answers.length || questions.rows.some((question) => !answerMap.has(String(question.id)))) {
        return reply.code(400).send({ error: 'Answers do not match this quiz', code: 'STUDYFORGE_ATTEMPT_QUESTION_MISMATCH' });
      }
      const graded = questions.rows.map((question) => ({
        questionId: String(question.id),
        selectedIndex: answerMap.get(String(question.id))!,
        correct: answerMap.get(String(question.id)) === Number(question.correct_index),
      }));
      const correct = graded.filter((answer) => answer.correct).length;
      const score = Math.round(correct * 100 / graded.length);
      const access = await resolveStudyForgeAccess(userId, tenantId);
      const inserted = await db.transaction(async (tx) => {
        await consumeStudyForgeUsage({
          tenantId,
          userId,
          kind: 'quiz_attempt',
          limit: access.limits.quizAttemptsPerMonth,
          executor: tx,
        });
        return tx.execute(sql`INSERT INTO studyforge_quiz_attempts
          (tenant_id,quiz_id,user_id,answers,correct_count,total_count,score_percent,review_json)
          VALUES (${tenantId},${quizId},${userId},${JSON.stringify(graded)}::jsonb,${correct},${graded.length},${score},${JSON.stringify(graded)}::jsonb) RETURNING *`);
      });
      await activity(request, 'quiz.completed', 'studyforge_quiz', quizId, 'Published quiz attempt completed.', { attemptId: inserted.rows[0].id, scorePercent: score });
      return reply.code(201).send({ attempt: camel(inserted.rows[0] as Row) });
    } catch (error) {
      if (validation(reply, error)) return;
      if ((error as any)?.statusCode === 402) return reply.code(402).send({ error: (error as Error).message, code: (error as any).code });
      throw error;
    }
  });

  app.post('/v1/modules/studyforge-ai/cards/:id/reviews', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseReview(request.body);
      const { tenantId, userId } = context(request);
      const access = await resolveStudyForgeAccess(userId, tenantId);
      const cardId = String((request.params as any).id);
      const card = await db.execute(sql`SELECT c.id FROM studyforge_cards c JOIN studyforge_decks d
        ON d.tenant_id=c.tenant_id AND d.id=c.deck_id
        WHERE c.tenant_id=${tenantId} AND c.id=${cardId} AND c.deleted_at IS NULL AND d.deleted_at IS NULL AND d.status='published' LIMIT 1`);
      if (!card.rows[0]) return notFound(reply, 'published card');
      const current = await db.execute(sql`SELECT * FROM studyforge_card_progress
        WHERE tenant_id=${tenantId} AND user_id=${userId} AND card_id=${cardId} LIMIT 1`);
      if (current.rows[0] && input.expectedVersion !== Number(current.rows[0].version)) return conflict(reply, 'card progress');
      const rating = input.rating;
      const previous = current.rows[0] as Row | undefined;
      const repetitions = rating === 'again' ? 0 : Number(previous?.repetitions ?? 0) + 1;
      const lapses = Number(previous?.lapses ?? 0) + (rating === 'again' ? 1 : 0);
      const base = Math.max(1, Number(previous?.interval_days ?? 0));
      const interval = !access.limits.spacedRepetition ? 0
        : rating === 'again' ? 0 : rating === 'hard' ? Math.max(1, Math.round(base * 1.2))
          : rating === 'good' ? Math.max(1, Math.round(base * 2.5)) : Math.max(2, Math.round(base * 4));
      const ease = Math.max(1300, Math.min(3000, Number(previous?.ease_milli ?? 2500) + ({ again: -200, hard: -100, good: 0, easy: 150 }[rating])));
      const dueAt = new Date(Date.now() + interval * 86_400_000);
      const result = await db.execute(sql`INSERT INTO studyforge_card_progress
        (tenant_id,card_id,user_id,repetitions,lapses,interval_days,ease_milli,due_at,last_rating)
        VALUES (${tenantId},${cardId},${userId},${repetitions},${lapses},${interval},${ease},${dueAt},${rating})
        ON CONFLICT (tenant_id,user_id,card_id) DO UPDATE SET
          repetitions=EXCLUDED.repetitions,lapses=EXCLUDED.lapses,interval_days=EXCLUDED.interval_days,
          ease_milli=EXCLUDED.ease_milli,due_at=EXCLUDED.due_at,last_rating=EXCLUDED.last_rating,
          version=studyforge_card_progress.version+1,updated_at=NOW()
        RETURNING *`);
      return reply.send({ progress: camel(result.rows[0] as Row) });
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.patch('/v1/modules/studyforge-ai/plan-sessions/:id', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseSessionCompletion(request.body);
      const { tenantId, userId } = context(request);
      const id = String((request.params as any).id);
      const result = await db.execute(sql`UPDATE studyforge_plan_sessions SET
        completed_at=CASE WHEN ${input.completed} THEN NOW() ELSE NULL END,
        completed_by_user_id=CASE WHEN ${input.completed} THEN ${userId} ELSE NULL END,
        version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${id} AND version=${input.expectedVersion} RETURNING *`);
      if (!result.rows[0]) return await scoped('session', tenantId, id) ? conflict(reply, 'study session') : notFound(reply, 'study session');
      return reply.send({ session: camel(result.rows[0] as Row) });
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.patch('/v1/modules/studyforge-ai/plan-sessions/:id/content', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parsePlanSessionPatch(request.body);
      const { tenantId } = context(request);
      const id = String((request.params as any).id);
      const result = await db.execute(sql`UPDATE studyforge_plan_sessions s SET
        title=COALESCE(${input.title ?? null},s.title),
        focus=COALESCE(${input.focus ?? null},s.focus),
        scheduled_for=CASE WHEN ${input.scheduledFor === undefined} THEN s.scheduled_for ELSE ${input.scheduledFor ?? null}::date END,
        estimated_minutes=COALESCE(${input.estimatedMinutes ?? null},s.estimated_minutes),
        version=s.version+1,updated_at=NOW()
        FROM studyforge_plans p
        WHERE s.tenant_id=${tenantId} AND s.id=${id} AND s.plan_id=p.id AND s.tenant_id=p.tenant_id
          AND p.deleted_at IS NULL AND p.status IN ('draft','review') AND s.version=${input.expectedVersion}
        RETURNING s.*`);
      if (!result.rows[0]) {
        const current = await scoped('session', tenantId, id);
        if (!current) return notFound(reply, 'study session');
        return reply.code(409).send({ error: 'Published, archived, or stale study sessions cannot be edited', code: 'STUDYFORGE_MATERIAL_LOCKED' });
      }
      return reply.send({ session: camel(result.rows[0] as Row) });
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.get('/v1/modules/studyforge-ai/export', { preHandler: readGuards }, async (request, reply) => {
    const { tenantId, userId } = context(request);
    const format = String((request.query as any)?.format ?? 'json');
    if (!['json', 'csv'].includes(format)) return reply.code(400).send({ error: 'format must be json or csv', code: 'STUDYFORGE_EXPORT_FORMAT_INVALID' });
    const data = await lists(tenantId, userId);
    if (format === 'csv') {
      const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const lines = ['type,id,title,status,subjectId,createdAt'];
      for (const [type, rows] of [['deck', data.decks], ['quiz', data.quizzes], ['plan', data.plans]] as const) {
        for (const row of rows) lines.push([type, row.id, row.title, row.status, row.subjectId, row.createdAt].map(escape).join(','));
      }
      return reply.header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="studyforge-export.csv"')
        .header('Cache-Control', 'private, no-store').send(`${lines.join('\n')}\n`);
    }
    return reply.header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="studyforge-export.json"')
      .header('Cache-Control', 'private, no-store')
      .send(JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), ...data }, null, 2));
  });

  app.post('/v1/modules/studyforge-ai/import/dry-run', { preHandler: writeGuards }, async (request, reply) => {
    try {
      return reply.send(planStudyForgeImport(request.body));
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });
}
