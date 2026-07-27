import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  requireTenantAdmin,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import {
  NINJAMATION_EXTENSIONS,
  NinjamationValidationError,
  analyzeScript,
  parseGeneratedScript,
  parseGeneration,
  parseLifecycle,
  parseScriptCreate,
  parseScriptPatch,
  safeFileName,
  sha256,
  type NinjamationLanguage,
} from '../lib/ninjamation.js';
import { AiProviderDisabledError, getAiProvider } from '../lib/ai-provider.js';
import {
  appendActivityEvent,
  beginIdempotentOperation,
  completeIdempotentOperation,
  failIdempotentOperation,
  recordUsageEvent,
} from '../lib/shared-usage-activity.js';

const readGuards = [requireTenantModuleAccess('ninjamation')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const adminGuards = [...writeGuards, requireTenantAdmin];
const GENERATION_LIMIT_PER_USER_MONTH = 50;

type Row = Record<string, any>;
type Executor = Pick<typeof db, 'execute'>;

function context(request: FastifyRequest) {
  return {
    tenantId: String((request as any).tenantContext.tenantId),
    userId: String((request as any).user.id),
  };
}

function validation(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof NinjamationValidationError)) return false;
  reply.code(error.statusCode).send({
    error: error.message,
    code: error.code,
    ...(error.field ? { field: error.field } : {}),
  });
  return true;
}

function notFound(reply: FastifyReply) {
  return reply.code(404).send({
    error: 'Script not found',
    code: 'NINJAMATION_SCRIPT_NOT_FOUND',
  });
}

function conflict(reply: FastifyReply) {
  return reply.code(409).send({
    error: 'Script changed; reload before saving',
    code: 'NINJAMATION_VERSION_CONFLICT',
  });
}

function camel(row: Row, includeContent = true): Row {
  const result: Row = {};
  for (const [key, value] of Object.entries(row)) {
    result[key.replace(/_([a-z])/g, (_, char) => char.toUpperCase())] = value;
  }
  delete result.tenantId;
  delete result.createdByUserId;
  delete result.approvedByUserId;
  delete result.reviewerUserId;
  delete result.downloadedByUserId;
  delete result.userId;
  delete result.deletedAt;
  delete result.promptSha256;
  if (!includeContent) delete result.content;
  return result;
}

async function moduleId(): Promise<string | null> {
  const result = await db.execute(sql`SELECT id FROM modules WHERE slug='ninjamation' LIMIT 1`);
  return result.rows[0] ? String(result.rows[0].id) : null;
}

async function activity(
  request: FastifyRequest,
  eventType: string,
  objectId: string,
  summary: string,
  metadata: Row = {},
  executor: Executor = db,
) {
  const modId = await moduleId();
  if (!modId) return;
  const { tenantId, userId } = context(request);
  await appendActivityEvent({
    tenantId,
    moduleId: modId,
    actorUserId: userId,
    objectType: 'ninjamation_script',
    objectId,
    eventType,
    summary,
    metadata,
    correlationId: request.id,
  }, executor as any);
}

async function script(
  tenantId: string,
  id: string,
  executor: Executor = db,
): Promise<Row | null> {
  const result = await executor.execute(sql`
    SELECT s.*,v.id AS script_version_id,v.content,v.content_sha256,v.static_analysis,
      v.created_at AS version_created_at
    FROM ninjamation_scripts s
    JOIN ninjamation_script_versions v
      ON v.tenant_id=s.tenant_id AND v.script_id=s.id
      AND v.version_number=s.current_version_number
    WHERE s.tenant_id=${tenantId} AND s.id=${id} AND s.deleted_at IS NULL
    LIMIT 1
  `);
  return (result.rows[0] as Row | undefined) ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return String((error as any)?.code ?? '') === '23505';
}

export async function registerNinjamationRoutes(app: FastifyInstance) {
  app.get('/v1/modules/ninjamation/workspace', { preHandler: readGuards }, async (request) => {
    const { tenantId } = context(request);
    const [scripts, reviews, downloads, generations] = await Promise.all([
      db.execute(sql`
        SELECT s.id,s.name,s.description,s.language,s.category,s.source,s.risk_tier,s.status,
          s.current_version_number,s.version,s.approved_at,s.retired_at,s.created_at,s.updated_at,
          v.content_sha256,v.static_analysis,
          COALESCE(d.download_count,0)::integer AS download_count
        FROM ninjamation_scripts s
        JOIN ninjamation_script_versions v
          ON v.tenant_id=s.tenant_id AND v.script_id=s.id
          AND v.version_number=s.current_version_number
        LEFT JOIN (
          SELECT tenant_id,script_id,COUNT(*)::integer AS download_count
          FROM ninjamation_downloads WHERE tenant_id=${tenantId}
          GROUP BY tenant_id,script_id
        ) d ON d.tenant_id=s.tenant_id AND d.script_id=s.id
        WHERE s.tenant_id=${tenantId} AND s.deleted_at IS NULL
        ORDER BY s.updated_at DESC LIMIT 200
      `),
      db.execute(sql`
        SELECT r.id,r.script_id,r.script_version_id,r.decision,r.note,r.created_at,
          COALESCE(u.name,u.email,'Former user') AS reviewer_name
        FROM ninjamation_reviews r
        LEFT JOIN users u ON u.id=r.reviewer_user_id
        WHERE r.tenant_id=${tenantId}
        ORDER BY r.created_at DESC LIMIT 100
      `),
      db.execute(sql`
        SELECT d.id,d.script_id,d.script_version_id,d.file_name,d.content_sha256,d.created_at,
          COALESCE(u.name,u.email,'Former user') AS downloaded_by
        FROM ninjamation_downloads d
        LEFT JOIN users u ON u.id=d.downloaded_by_user_id
        WHERE d.tenant_id=${tenantId}
        ORDER BY d.created_at DESC LIMIT 100
      `),
      db.execute(sql`
        SELECT id,script_id,language,provider,model,provider_version,token_count,duration_ms,created_at
        FROM ninjamation_generations
        WHERE tenant_id=${tenantId}
        ORDER BY created_at DESC LIMIT 100
      `),
    ]);
    return {
      scripts: scripts.rows.map((row) => camel(row as Row, false)),
      reviews: reviews.rows.map((row) => camel(row as Row, false)),
      downloads: downloads.rows.map((row) => camel(row as Row, false)),
      generations: generations.rows.map((row) => camel(row as Row, false)),
      executionSupported: false,
      approvalRequiredForDownload: true,
    };
  });

  app.get('/v1/modules/ninjamation/scripts/:id', { preHandler: readGuards }, async (request, reply) => {
    const { tenantId } = context(request);
    const id = String((request.params as any).id);
    const current = await script(tenantId, id);
    if (!current) return notFound(reply);
    const [versions, reviews] = await Promise.all([
      db.execute(sql`
        SELECT id,version_number,content_sha256,static_analysis,created_at
        FROM ninjamation_script_versions
        WHERE tenant_id=${tenantId} AND script_id=${id}
        ORDER BY version_number DESC LIMIT 100
      `),
      db.execute(sql`
        SELECT r.id,r.script_version_id,r.decision,r.note,r.created_at,
          COALESCE(u.name,u.email,'Former user') AS reviewer_name
        FROM ninjamation_reviews r
        LEFT JOIN users u ON u.id=r.reviewer_user_id
        WHERE r.tenant_id=${tenantId} AND r.script_id=${id}
        ORDER BY r.created_at DESC LIMIT 100
      `),
    ]);
    return {
      script: camel(current),
      versions: versions.rows.map((row) => camel(row as Row, false)),
      reviews: reviews.rows.map((row) => camel(row as Row, false)),
      executionSupported: false,
    };
  });

  app.post('/v1/modules/ninjamation/scripts', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseScriptCreate(request.body);
      const { tenantId, userId } = context(request);
      const analysis = analyzeScript(input.content);
      const created = await db.transaction(async (tx) => {
        const inserted = await tx.execute(sql`
          INSERT INTO ninjamation_scripts (
            tenant_id,created_by_user_id,name,description,language,category,risk_tier
          ) VALUES (
            ${tenantId},${userId},${input.name},${input.description},${input.language},
            ${input.category},${input.riskTier}
          ) RETURNING *
        `);
        const row = inserted.rows[0] as Row;
        const version = await tx.execute(sql`
          INSERT INTO ninjamation_script_versions (
            tenant_id,script_id,version_number,content,content_sha256,static_analysis,created_by_user_id
          ) VALUES (
            ${tenantId},${String(row.id)},1,${input.content},${analysis.contentSha256},
            ${JSON.stringify(analysis)}::jsonb,${userId}
          ) RETURNING *
        `);
        await activity(request, 'script.created', String(row.id), 'Ninjamation script draft created.', {
          language: input.language,
          criticalCount: analysis.criticalCount,
          warningCount: analysis.warningCount,
        }, tx as any);
        return { ...row, ...(version.rows[0] as Row), id: row.id, script_version_id: version.rows[0].id };
      });
      return reply.code(201).send({ script: camel(created), reviewRequired: true });
    } catch (error) {
      if (validation(reply, error)) return;
      if (isUniqueViolation(error)) {
        return reply.code(409).send({
          error: 'A non-archived script with this name already exists',
          code: 'NINJAMATION_SCRIPT_NAME_CONFLICT',
        });
      }
      throw error;
    }
  });

  app.patch('/v1/modules/ninjamation/scripts/:id', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseScriptPatch(request.body);
      const { tenantId, userId } = context(request);
      const id = String((request.params as any).id);
      const updated = await db.transaction(async (tx) => {
        const locked = await tx.execute(sql`
          SELECT * FROM ninjamation_scripts
          WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL
          FOR UPDATE
        `);
        const current = locked.rows[0] as Row | undefined;
        if (!current) return { state: 'missing' as const };
        if (Number(current.version) !== input.expectedVersion) return { state: 'conflict' as const };
        if (current.status === 'retired') return { state: 'retired' as const };

        let nextVersionNumber = Number(current.current_version_number);
        let analysis: ReturnType<typeof analyzeScript> | null = null;
        if (input.content !== undefined) {
          analysis = analyzeScript(input.content);
          const currentVersion = await tx.execute(sql`
            SELECT content_sha256 FROM ninjamation_script_versions
            WHERE tenant_id=${tenantId} AND script_id=${id}
              AND version_number=${nextVersionNumber} LIMIT 1
          `);
          if (String(currentVersion.rows[0]?.content_sha256) !== analysis.contentSha256) {
            nextVersionNumber += 1;
            await tx.execute(sql`
              INSERT INTO ninjamation_script_versions (
                tenant_id,script_id,version_number,content,content_sha256,static_analysis,created_by_user_id
              ) VALUES (
                ${tenantId},${id},${nextVersionNumber},${input.content},${analysis.contentSha256},
                ${JSON.stringify(analysis)}::jsonb,${userId}
              )
            `);
          }
        }
        const result = await tx.execute(sql`
          UPDATE ninjamation_scripts SET
            name=${input.name ?? current.name},
            description=${input.description === undefined ? current.description : input.description},
            language=${input.language ?? current.language},
            category=${input.category ?? current.category},
            risk_tier=${input.riskTier ?? current.risk_tier},
            current_version_number=${nextVersionNumber},
            status='draft',approved_by_user_id=NULL,approved_at=NULL,
            version=version+1,updated_at=NOW()
          WHERE tenant_id=${tenantId} AND id=${id} AND version=${input.expectedVersion}
          RETURNING *
        `);
        await activity(request, 'script.updated', id, 'Ninjamation script updated and returned to draft.', {
          contentChanged: nextVersionNumber !== Number(current.current_version_number),
          scriptVersion: nextVersionNumber,
          criticalCount: analysis?.criticalCount,
          warningCount: analysis?.warningCount,
        }, tx as any);
        return { state: 'ok' as const, row: result.rows[0] as Row };
      });
      if (updated.state === 'missing') return notFound(reply);
      if (updated.state === 'conflict') return conflict(reply);
      if (updated.state === 'retired') {
        return reply.code(409).send({
          error: 'Retired scripts cannot be edited',
          code: 'NINJAMATION_SCRIPT_RETIRED',
        });
      }
      return { script: camel((await script(tenantId, id)) ?? updated.row) };
    } catch (error) {
      if (validation(reply, error)) return;
      if (isUniqueViolation(error)) {
        return reply.code(409).send({
          error: 'A non-archived script with this name already exists',
          code: 'NINJAMATION_SCRIPT_NAME_CONFLICT',
        });
      }
      throw error;
    }
  });

  app.post('/v1/modules/ninjamation/scripts/:id/review', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseLifecycle(request.body);
      const { tenantId, userId } = context(request);
      const id = String((request.params as any).id);
      const result = await db.transaction(async (tx) => {
        const updated = await tx.execute(sql`
          UPDATE ninjamation_scripts SET status='review',version=version+1,updated_at=NOW()
          WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL
            AND status='draft' AND version=${input.expectedVersion}
          RETURNING *
        `);
        if (!updated.rows[0]) return null;
        const version = await tx.execute(sql`
          SELECT id FROM ninjamation_script_versions
          WHERE tenant_id=${tenantId} AND script_id=${id}
            AND version_number=${Number(updated.rows[0].current_version_number)} LIMIT 1
        `);
        await tx.execute(sql`
          INSERT INTO ninjamation_reviews (
            tenant_id,script_id,script_version_id,reviewer_user_id,decision,note
          ) VALUES (
            ${tenantId},${id},${String(version.rows[0].id)},${userId},'submitted',${input.note}
          )
        `);
        await activity(request, 'review.submitted', id, 'Ninjamation script submitted for review.', {}, tx as any);
        return updated.rows[0] as Row;
      });
      if (!result) {
        const current = await script(tenantId, id);
        if (!current) return notFound(reply);
        if (Number(current.version) !== input.expectedVersion) return conflict(reply);
        return reply.code(409).send({
          error: 'Only draft scripts can be submitted for review',
          code: 'NINJAMATION_REVIEW_TRANSITION_INVALID',
        });
      }
      return { script: camel((await script(tenantId, id)) ?? result) };
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.post('/v1/modules/ninjamation/scripts/:id/approve', { preHandler: adminGuards }, async (request, reply) => {
    try {
      const input = parseLifecycle(request.body);
      const { tenantId, userId } = context(request);
      const id = String((request.params as any).id);
      const current = await script(tenantId, id);
      if (!current) return notFound(reply);
      if (Number(current.version) !== input.expectedVersion) return conflict(reply);
      if (current.status !== 'review') {
        return reply.code(409).send({
          error: 'Only scripts in review can be approved',
          code: 'NINJAMATION_APPROVAL_TRANSITION_INVALID',
        });
      }
      const analysis = current.static_analysis as { criticalCount?: number };
      if (Number(analysis?.criticalCount ?? 0) > 0) {
        return reply.code(409).send({
          error: 'Critical static-analysis findings must be resolved before approval',
          code: 'NINJAMATION_CRITICAL_FINDINGS',
          staticAnalysis: analysis,
        });
      }
      const result = await db.transaction(async (tx) => {
        const updated = await tx.execute(sql`
          UPDATE ninjamation_scripts SET
            status='approved',approved_by_user_id=${userId},approved_at=NOW(),
            retired_at=NULL,version=version+1,updated_at=NOW()
          WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL
            AND status='review' AND version=${input.expectedVersion}
          RETURNING *
        `);
        if (!updated.rows[0]) return null;
        await tx.execute(sql`
          INSERT INTO ninjamation_reviews (
            tenant_id,script_id,script_version_id,reviewer_user_id,decision,note
          ) VALUES (
            ${tenantId},${id},${String(current.script_version_id)},${userId},'approved',${input.note}
          )
        `);
        await activity(request, 'script.approved', id, 'Ninjamation script approved for download.', {
          contentSha256: current.content_sha256,
        }, tx as any);
        return updated.rows[0] as Row;
      });
      if (!result) return conflict(reply);
      return { script: camel((await script(tenantId, id)) ?? result) };
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.post('/v1/modules/ninjamation/scripts/:id/reject', { preHandler: adminGuards }, async (request, reply) => {
    try {
      const input = parseLifecycle(request.body);
      const { tenantId, userId } = context(request);
      const id = String((request.params as any).id);
      const current = await script(tenantId, id);
      if (!current) return notFound(reply);
      if (Number(current.version) !== input.expectedVersion) return conflict(reply);
      if (current.status !== 'review') {
        return reply.code(409).send({
          error: 'Only scripts in review can be rejected',
          code: 'NINJAMATION_REJECTION_TRANSITION_INVALID',
        });
      }
      const result = await db.transaction(async (tx) => {
        const updated = await tx.execute(sql`
          UPDATE ninjamation_scripts SET status='draft',version=version+1,updated_at=NOW()
          WHERE tenant_id=${tenantId} AND id=${id} AND status='review'
            AND version=${input.expectedVersion} RETURNING *
        `);
        if (!updated.rows[0]) return null;
        await tx.execute(sql`
          INSERT INTO ninjamation_reviews (
            tenant_id,script_id,script_version_id,reviewer_user_id,decision,note
          ) VALUES (
            ${tenantId},${id},${String(current.script_version_id)},${userId},'rejected',${input.note}
          )
        `);
        await activity(request, 'review.rejected', id, 'Ninjamation script returned to draft.', {}, tx as any);
        return updated.rows[0] as Row;
      });
      if (!result) return conflict(reply);
      return { script: camel((await script(tenantId, id)) ?? result) };
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.post('/v1/modules/ninjamation/scripts/:id/retire', { preHandler: adminGuards }, async (request, reply) => {
    try {
      const input = parseLifecycle(request.body);
      const { tenantId, userId } = context(request);
      const id = String((request.params as any).id);
      const current = await script(tenantId, id);
      if (!current) return notFound(reply);
      if (Number(current.version) !== input.expectedVersion) return conflict(reply);
      if (current.status === 'retired') {
        return reply.code(409).send({
          error: 'Script is already retired',
          code: 'NINJAMATION_SCRIPT_RETIRED',
        });
      }
      const result = await db.transaction(async (tx) => {
        const updated = await tx.execute(sql`
          UPDATE ninjamation_scripts SET status='retired',retired_at=NOW(),
            version=version+1,updated_at=NOW()
          WHERE tenant_id=${tenantId} AND id=${id} AND version=${input.expectedVersion}
          RETURNING *
        `);
        if (!updated.rows[0]) return null;
        await tx.execute(sql`
          INSERT INTO ninjamation_reviews (
            tenant_id,script_id,script_version_id,reviewer_user_id,decision,note
          ) VALUES (
            ${tenantId},${id},${String(current.script_version_id)},${userId},'retired',${input.note}
          )
        `);
        await activity(request, 'script.retired', id, 'Ninjamation script retired.', {}, tx as any);
        return updated.rows[0] as Row;
      });
      if (!result) return conflict(reply);
      return { script: camel((await script(tenantId, id)) ?? result) };
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.post('/v1/modules/ninjamation/scripts/:id/downloads', { preHandler: readGuards }, async (request, reply) => {
    const { tenantId, userId } = context(request);
    const id = String((request.params as any).id);
    const current = await script(tenantId, id);
    if (!current) return notFound(reply);
    if (current.status !== 'approved') {
      return reply.code(409).send({
        error: 'Only the approved current version can be downloaded',
        code: 'NINJAMATION_DOWNLOAD_NOT_APPROVED',
      });
    }
    const fileName = safeFileName(current.name, current.language as NinjamationLanguage);
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO ninjamation_downloads (
          tenant_id,script_id,script_version_id,downloaded_by_user_id,file_name,
          content_sha256,request_id
        ) VALUES (
          ${tenantId},${id},${String(current.script_version_id)},${userId},${fileName},
          ${String(current.content_sha256)},${request.id}
        )
      `);
      await activity(request, 'script.downloaded', id, 'Approved Ninjamation script downloaded.', {
        fileName,
        contentSha256: current.content_sha256,
      }, tx as any);
    });
    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Ninjamation-Content-SHA256', String(current.content_sha256))
      .send(`${String(current.content).trimEnd()}\n`);
  });

  app.post('/v1/modules/ninjamation/generations', { preHandler: writeGuards }, async (request, reply) => {
    let operation: Awaited<ReturnType<typeof beginIdempotentOperation>> | null = null;
    try {
      const input = parseGeneration(request.body);
      const { tenantId, userId } = context(request);
      const modId = await moduleId();
      if (!modId) {
        return reply.code(404).send({ error: 'Module not found', code: 'NINJAMATION_MODULE_NOT_FOUND' });
      }
      const usage = await db.execute(sql`
        SELECT COUNT(*)::integer AS count FROM ninjamation_generations
        WHERE tenant_id=${tenantId} AND user_id=${userId}
          AND created_at >= date_trunc('month',NOW())
      `);
      if (Number(usage.rows[0]?.count ?? 0) >= GENERATION_LIMIT_PER_USER_MONTH) {
        return reply.code(429).send({
          error: 'Monthly script generation limit reached',
          code: 'NINJAMATION_GENERATION_LIMIT',
        });
      }
      const safeRequest = {
        promptSha256: sha256(input.prompt),
        language: input.language,
        name: input.name,
        description: input.description,
        category: input.category,
        riskTier: input.riskTier,
      };
      operation = await beginIdempotentOperation({
        tenantId,
        moduleId: modId,
        scope: 'ninjamation.generation',
        idempotencyKey: input.idempotencyKey,
        request: safeRequest,
        leaseMs: 120_000,
      });
      if (operation.state === 'replay') {
        return reply.code(operation.responseStatus).send({
          ...(operation.responseJson as Row),
          replayed: true,
        });
      }
      if (operation.state === 'conflict') {
        return reply.code(409).send({
          error: 'Idempotency key was reused for different input',
          code: 'IDEMPOTENCY_CONFLICT',
        });
      }
      if (operation.state === 'in_progress') {
        return reply.code(409).send({
          error: 'Script generation is already processing',
          code: 'IDEMPOTENCY_IN_PROGRESS',
        });
      }
      const acquired = operation;
      const completion = await getAiProvider().complete({
        systemPrompt: [
          'OPERATOROS_NINJAMATION_V1',
          `Create one ${input.language} PC automation script from the supplied request.`,
          'Return strict JSON with name, description, and content string fields.',
          'Use readable, defensive code with comments, validation, explicit errors, and no embedded credentials.',
          'Never use encoded commands, dynamic eval, remote pipe-to-shell, persistence, security-control bypasses, or destructive root/volume operations.',
          'The output is an unapproved draft. Do not claim it was executed, tested, deployed, or approved.',
        ].join('\n'),
        userPrompt: JSON.stringify({
          prompt: input.prompt,
          requestedName: input.name,
          requestedDescription: input.description,
          language: input.language,
        }),
        responseFormat: 'json',
        temperature: 0.2,
        maxTokens: 5_000,
      });
      const generated = parseGeneratedScript(completion.text);
      const scriptInput = {
        name: input.name ?? generated.name,
        description: input.description ?? generated.description,
        language: input.language,
        category: input.category,
        riskTier: input.riskTier,
        content: generated.content,
      };
      const analysis = analyzeScript(scriptInput.content);
      const response = await db.transaction(async (tx) => {
        const inserted = await tx.execute(sql`
          INSERT INTO ninjamation_scripts (
            tenant_id,created_by_user_id,name,description,language,category,source,risk_tier
          ) VALUES (
            ${tenantId},${userId},${scriptInput.name},${scriptInput.description},${scriptInput.language},
            ${scriptInput.category},'ai_generated',${scriptInput.riskTier}
          ) RETURNING *
        `);
        const scriptRow = inserted.rows[0] as Row;
        const version = await tx.execute(sql`
          INSERT INTO ninjamation_script_versions (
            tenant_id,script_id,version_number,content,content_sha256,static_analysis,created_by_user_id
          ) VALUES (
            ${tenantId},${String(scriptRow.id)},1,${scriptInput.content},${analysis.contentSha256},
            ${JSON.stringify(analysis)}::jsonb,${userId}
          ) RETURNING *
        `);
        const generation = await tx.execute(sql`
          INSERT INTO ninjamation_generations (
            tenant_id,script_id,user_id,idempotency_key,prompt_sha256,language,
            provider,model,provider_version,token_count,duration_ms
          ) VALUES (
            ${tenantId},${String(scriptRow.id)},${userId},${input.idempotencyKey},
            ${safeRequest.promptSha256},${input.language},${completion.provider},${completion.model},
            ${completion.version},${completion.tokenCount},${completion.durationMs}
          ) RETURNING *
        `);
        await recordUsageEvent({
          tenantId,
          moduleId: modId,
          userId,
          operation: 'ninjamation.ai_generation',
          units: 1,
          unitKind: 'generation',
          idempotencyKey: `ninjamation:${String(generation.rows[0].id)}`,
          externalReference: String(generation.rows[0].id),
          metadata: {
            language: input.language,
            tokenCount: completion.tokenCount,
            criticalCount: analysis.criticalCount,
            warningCount: analysis.warningCount,
          },
        }, tx);
        const payload = {
          script: camel({
            ...scriptRow,
            ...(version.rows[0] as Row),
            id: scriptRow.id,
            script_version_id: version.rows[0].id,
          }),
          generation: camel(generation.rows[0] as Row, false),
          reviewRequired: true,
          executionSupported: false,
          replayed: false,
        };
        await completeIdempotentOperation({
          tenantId,
          id: acquired.id,
          leaseExpiresAt: acquired.leaseExpiresAt,
          responseStatus: 201,
          responseJson: payload,
        }, tx);
        await activity(request, 'generation.completed', String(scriptRow.id), 'AI script draft generated for review.', {
          generationId: generation.rows[0].id,
          language: input.language,
          criticalCount: analysis.criticalCount,
          warningCount: analysis.warningCount,
        }, tx as any);
        return payload;
      });
      return reply.code(201).send(response);
    } catch (error) {
      if (operation?.state === 'acquired') {
        await failIdempotentOperation({
          tenantId: context(request).tenantId,
          id: operation.id,
          leaseExpiresAt: operation.leaseExpiresAt,
        }).catch(() => undefined);
      }
      if (validation(reply, error)) return;
      if (error instanceof AiProviderDisabledError) {
        return reply.code(503).send({
          error: 'AI generation is disabled until the shared provider is configured',
          code: error.code,
        });
      }
      if (isUniqueViolation(error)) {
        return reply.code(409).send({
          error: 'A non-archived script with this name already exists',
          code: 'NINJAMATION_SCRIPT_NAME_CONFLICT',
        });
      }
      throw error;
    }
  });

  app.get('/v1/modules/ninjamation/formats', { preHandler: readGuards }, async () => ({
    languages: Object.entries(NINJAMATION_EXTENSIONS).map(([language, extension]) => ({
      language,
      extension,
    })),
    statuses: ['draft', 'review', 'approved', 'retired'],
    executionSupported: false,
  }));
}
