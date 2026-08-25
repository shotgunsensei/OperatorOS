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
  parseGeneratedScript,
  parseGeneration,
  safeFileName,
  sha256,
} from '../lib/ninjamation.js';
import {
  NINJAMATION_LIBRARY_FORMATS,
  NINJAMATION_PHASE36_CATALOG_COMMIT,
  NINJAMATION_REPOSITORY,
  NINJAMATION_REPOSITORY_BRANCH,
  NinjamationPhase36Error,
  analyzePhase36Script,
  fetchAutomationPacksSnapshot,
  parseLibraryQuery,
  parseSyncRequest,
} from '../lib/ninjamation-phase36.js';
import { runNinjamationCatalogSync } from '../lib/ninjamation-sync.js';
import {
  consumeNinjamationUsage,
  releaseNinjamationUsage,
  resolveNinjamationAccess,
} from '../lib/ninjamation-access.js';
import { getSharedAiProviderAdapter } from '../lib/shared-provider-adapters.js';
import {
  appendActivityEvent,
  beginIdempotentOperation,
  completeIdempotentOperation,
  failIdempotentOperation,
  recordUsageEvent,
  summarizeUsage,
} from '../lib/shared-usage-activity.js';
import { enqueueSharedJob, registerSharedJobHandler } from '../lib/shared-background-jobs.js';
import { createSharedSchedule } from '../lib/shared-schedules-exports.js';
import { writeAudit } from '../lib/audit.js';

const MODULE_SLUG = 'ninjamation';
const BASE = '/v1/modules/ninjamation/product';
const SYNC_HANDLER = 'ninjamation.phase36.github-sync.v1';
const readGuards = [requireTenantModuleAccess(MODULE_SLUG)];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const adminGuards = [...writeGuards, requireTenantAdmin];
type Row = Record<string, any>;

function tenant(request: FastifyRequest) {
  return String((request as any).tenantContext.tenantId);
}
function actor(request: FastifyRequest) {
  return String((request as any).user.id);
}
function params(request: FastifyRequest) {
  return request.params as Record<string, string>;
}
function body(request: FastifyRequest) {
  return (request.body ?? {}) as Record<string, unknown>;
}
function camel(row: Row, includeContent = true) {
  const result: Row = {};
  for (const [key, value] of Object.entries(row)) result[key.replace(/_([a-z])/g, (_, char) => char.toUpperCase())] = value;
  for (const field of ['tenantId', 'createdByUserId', 'approvedByUserId', 'reviewerUserId', 'downloadedByUserId', 'userId', 'promptSha256', 'deletedAt']) delete result[field];
  if (!includeContent) delete result.content;
  if (result.sourceDisplayName) result.displayName = result.sourceDisplayName;
  else if (result.name) result.displayName = result.name;
  return result;
}
function fail(reply: FastifyReply, error: unknown) {
  const value = error as any;
  if (error instanceof NinjamationPhase36Error || value?.code === 'NINJAMATION_INPUT_INVALID') {
    return reply.code(value.statusCode ?? 400).send({ error: value.message, code: value.code, field: value.field });
  }
  if (value?.statusCode && value?.code) return reply.code(value.statusCode).send({ error: value.message, code: value.code });
  throw error;
}
async function moduleId() {
  const result = await db.execute(sql`SELECT id FROM modules WHERE slug=${MODULE_SLUG} LIMIT 1`);
  if (!result.rows[0]) throw Object.assign(new Error('Script Ops module registry is unavailable'), { code: 'NINJAMATION_MODULE_UNAVAILABLE' });
  return String(result.rows[0].id);
}
async function activity(request: FastifyRequest, objectType: string, objectId: string, eventType: string, summary: string, metadata: Row = {}) {
  return appendActivityEvent({
    tenantId: tenant(request), moduleId: await moduleId(), actorUserId: actor(request),
    objectType, objectId, eventType, summary, metadata, correlationId: request.id,
  });
}
async function selectScript(tenantId: string, id: string) {
  const result = await db.execute(sql`
    SELECT script.*,version.id AS script_version_id,version.content,version.content_sha256,
      version.static_analysis,version.provenance_json,version.safety_status,version.created_at AS version_created_at,
      (SELECT count(*)::int FROM ninjamation_downloads download WHERE download.tenant_id=script.tenant_id AND download.script_id=script.id) AS download_count
    FROM ninjamation_scripts script
    JOIN ninjamation_script_versions version ON version.tenant_id=script.tenant_id
      AND version.script_id=script.id AND version.version_number=script.current_version_number
    WHERE script.tenant_id=${tenantId} AND script.id=${id} AND script.deleted_at IS NULL LIMIT 1
  `);
  const selected = result.rows[0] as Row | undefined;
  if (selected && !selected.file_name && Object.hasOwn(NINJAMATION_EXTENSIONS, String(selected.language))) {
    selected.file_name = safeFileName(
      String(selected.source_display_name ?? selected.name),
      selected.language as keyof typeof NINJAMATION_EXTENSIONS,
    );
  }
  return selected;
}

registerSharedJobHandler(SYNC_HANDLER, async (context) => {
  if (!context.requestedByUserId) throw Object.assign(new Error('Sync actor is required'), { code: 'NINJAMATION_SYNC_ACTOR_REQUIRED' });
  let runId = String(context.payload.runId ?? '');
  if (!runId) {
    const scheduled = await db.execute(sql`
      INSERT INTO ninjamation_sync_runs (
        tenant_id,requested_by_user_id,idempotency_key,repository,branch,requested_commit,mode,status,shared_job_id
      ) VALUES (
        ${context.tenantId},${context.requestedByUserId},${`scheduled:${context.id}`},${NINJAMATION_REPOSITORY},
        ${NINJAMATION_REPOSITORY_BRANCH},${NINJAMATION_PHASE36_CATALOG_COMMIT},'incremental','queued',${context.id}
      ) RETURNING id
    `);
    runId = String(scheduled.rows[0].id);
  }
  const selected = await db.execute(sql`
    SELECT requested_commit FROM ninjamation_sync_runs WHERE tenant_id=${context.tenantId} AND id=${runId} LIMIT 1
  `);
  if (!selected.rows[0]) throw Object.assign(new Error('Sync run not found'), { code: 'NINJAMATION_SYNC_NOT_FOUND' });
  const commit = selected.rows[0].requested_commit ? String(selected.rows[0].requested_commit) : NINJAMATION_PHASE36_CATALOG_COMMIT;
  const snapshot = await fetchAutomationPacksSnapshot({ commit });
  await runNinjamationCatalogSync({
    tenantId: context.tenantId, userId: context.requestedByUserId,
    moduleId: context.moduleId, runId, snapshot,
  });
});

export async function registerNinjamationPhase36Routes(app: FastifyInstance) {
  app.get('/v1/public/ninjamation/product', async () => ({
    product: 'Script Ops',
    positioning: 'Reviewed automation scripts and AI-assisted drafts without unsafe web-process execution.',
    repository: { name: NINJAMATION_REPOSITORY, branch: NINJAMATION_REPOSITORY_BRANCH },
    formats: NINJAMATION_LIBRARY_FORMATS,
    plans: [
      { id: 'starter', name: 'Starter', monthlyDownloads: 10, aiGeneration: false, features: ['Script library', 'Checksums and version history', 'Favorites', '10 downloads per month'] },
      { id: 'pro', name: 'Pro', monthlyDownloads: null, monthlyGenerations: 50, aiGeneration: true, features: ['Everything in Starter', 'AI generation', 'Unlimited downloads', '50 generations per month'] },
      { id: 'enterprise', name: 'Enterprise', monthlyDownloads: null, monthlyGenerations: null, aiGeneration: true, features: ['Everything in Pro', 'Unlimited generation', 'OperatorOS API entitlement', 'Team administration'] },
    ],
    billingAuthority: 'OperatorOS',
    executionSupported: false,
  }));

  app.get(`${BASE}/workspace`, { preHandler: readGuards }, async (request) => {
    const tenantId = tenant(request), userId = actor(request), modId = await moduleId();
    const [metrics, categories, sync, recent, access, usage, counter] = await Promise.all([
      db.execute(sql`
        SELECT count(*)::int AS scripts,
          count(*) FILTER (WHERE status='approved' AND sync_state='active')::int AS approved,
          count(*) FILTER (WHERE status='review')::int AS in_review,
          count(*) FILTER (WHERE sync_state='deprecated')::int AS deprecated,
          count(*) FILTER (WHERE source='ai_generated')::int AS generated,
          (SELECT count(*)::int FROM ninjamation_favorites WHERE tenant_id=${tenantId} AND user_id=${userId}) AS favorites,
          (SELECT count(*)::int FROM ninjamation_downloads WHERE tenant_id=${tenantId}) AS downloads
        FROM ninjamation_scripts WHERE tenant_id=${tenantId} AND deleted_at IS NULL
      `),
      db.execute(sql`SELECT category,count(*)::int AS count FROM ninjamation_scripts WHERE tenant_id=${tenantId} AND deleted_at IS NULL AND sync_state='active' GROUP BY category ORDER BY category`),
      db.execute(sql`SELECT * FROM ninjamation_sync_runs WHERE tenant_id=${tenantId} ORDER BY created_at DESC LIMIT 10`),
      db.execute(sql`
        SELECT script.id,COALESCE(script.source_display_name,script.name) AS display_name,script.language,script.category,
          script.status,script.source,script.sync_state,script.updated_at,version.content_sha256,
          EXISTS(SELECT 1 FROM ninjamation_favorites favorite WHERE favorite.tenant_id=script.tenant_id AND favorite.script_id=script.id AND favorite.user_id=${userId}) AS favorite
        FROM ninjamation_scripts script JOIN ninjamation_script_versions version ON version.tenant_id=script.tenant_id
          AND version.script_id=script.id AND version.version_number=script.current_version_number
        WHERE script.tenant_id=${tenantId} AND script.deleted_at IS NULL ORDER BY script.updated_at DESC LIMIT 12
      `),
      resolveNinjamationAccess(userId, tenantId),
      summarizeUsage({ tenantId, moduleId: modId, userId }),
      db.execute(sql`SELECT generation_count,download_count,period_start FROM ninjamation_usage_counters WHERE tenant_id=${tenantId} AND user_id=${userId} AND period_start=date_trunc('month',CURRENT_DATE)::date`),
    ]);
    return {
      metrics: camel(metrics.rows[0] as Row), categories: categories.rows.map((row) => camel(row as Row)),
      syncRuns: sync.rows.map((row) => camel(row as Row, false)), recentScripts: recent.rows.map((row) => camel(row as Row, false)),
      access, usage, planUsage: camel((counter.rows[0] ?? { generation_count: 0, download_count: 0 }) as Row),
      execution: { supported: false, webApiProcess: false, runnerGatewayRequired: true, reasonCode: 'NINJAMATION_LIBRARY_ONLY' },
      catalog: { repository: NINJAMATION_REPOSITORY, branch: NINJAMATION_REPOSITORY_BRANCH, pinnedCommit: NINJAMATION_PHASE36_CATALOG_COMMIT },
    };
  });

  app.get(`${BASE}/scripts`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const query = parseLibraryQuery(request.query), tenantId = tenant(request), userId = actor(request);
      const search = query.search ? `%${query.search}%` : null;
      const offset = (query.page - 1) * query.limit;
      const order = query.sort === 'downloads' ? sql`download_count DESC,display_name`
        : query.sort === 'newest' ? sql`script.created_at DESC,display_name`
          : query.sort === 'updated' ? sql`script.updated_at DESC,display_name`
            : sql`display_name`;
      const rows = await db.execute(sql`
        SELECT script.id,COALESCE(script.source_display_name,script.name) AS display_name,script.description,
          script.language,script.category,script.tags,script.source,script.risk_tier,script.status,script.sync_state,
          script.current_version_number,script.source_repository,script.source_path,script.source_commit,script.file_name,
          script.created_at,script.updated_at,version.content_sha256,version.static_analysis,version.safety_status,
          EXISTS(SELECT 1 FROM ninjamation_favorites favorite WHERE favorite.tenant_id=script.tenant_id AND favorite.script_id=script.id AND favorite.user_id=${userId}) AS favorite,
          (SELECT count(*)::int FROM ninjamation_downloads download WHERE download.tenant_id=script.tenant_id AND download.script_id=script.id) AS download_count
        FROM ninjamation_scripts script
        JOIN ninjamation_script_versions version ON version.tenant_id=script.tenant_id AND version.script_id=script.id
          AND version.version_number=script.current_version_number
        WHERE script.tenant_id=${tenantId} AND script.deleted_at IS NULL
          AND (${query.includeDeprecated} OR script.sync_state='active')
          AND (${query.format}::text IS NULL OR script.language=${query.format})
          AND (${query.category}::text IS NULL OR script.category=${query.category})
          AND (${query.status}::text IS NULL OR script.status=${query.status})
          AND (${query.source}::text IS NULL OR script.source=${query.source})
          AND (NOT ${query.favoritesOnly} OR EXISTS(SELECT 1 FROM ninjamation_favorites favorite WHERE favorite.tenant_id=script.tenant_id AND favorite.script_id=script.id AND favorite.user_id=${userId}))
          AND (NOT ${query.ownedOnly} OR script.owner_user_id=${userId})
          AND (${search}::text IS NULL OR COALESCE(script.source_display_name,script.name) ILIKE ${search} OR COALESCE(script.description,'') ILIKE ${search} OR script.category ILIKE ${search})
        ORDER BY ${order} LIMIT ${query.limit} OFFSET ${offset}
      `);
      const total = await db.execute(sql`
        SELECT count(*)::int AS count FROM ninjamation_scripts script
        WHERE script.tenant_id=${tenantId} AND script.deleted_at IS NULL
          AND (${query.includeDeprecated} OR script.sync_state='active')
          AND (${query.format}::text IS NULL OR script.language=${query.format})
          AND (${query.category}::text IS NULL OR script.category=${query.category})
          AND (${query.status}::text IS NULL OR script.status=${query.status})
          AND (${query.source}::text IS NULL OR script.source=${query.source})
          AND (NOT ${query.favoritesOnly} OR EXISTS(SELECT 1 FROM ninjamation_favorites favorite WHERE favorite.tenant_id=script.tenant_id AND favorite.script_id=script.id AND favorite.user_id=${userId}))
          AND (NOT ${query.ownedOnly} OR script.owner_user_id=${userId})
          AND (${search}::text IS NULL OR COALESCE(script.source_display_name,script.name) ILIKE ${search} OR COALESCE(script.description,'') ILIKE ${search} OR script.category ILIKE ${search})
      `);
      const count = Number(total.rows[0]?.count ?? 0);
      return { scripts: rows.rows.map((row) => camel(row as Row, false)), page: query.page, limit: query.limit, total: count, totalPages: Math.ceil(count / query.limit) };
    } catch (error) { return fail(reply, error); }
  });

  app.get(`${BASE}/scripts/:id`, { preHandler: readGuards }, async (request, reply) => {
    const tenantId = tenant(request), id = params(request).id, userId = actor(request);
    const selected = await selectScript(tenantId, id);
    if (!selected) return reply.code(404).send({ error: 'Script not found', code: 'NINJAMATION_SCRIPT_NOT_FOUND' });
    const [versions, reviews, downloads, syncHistory, favorite] = await Promise.all([
      db.execute(sql`SELECT id,version_number,content_sha256,static_analysis,provenance_json,source_commit,source_blob_sha,safety_status,created_at FROM ninjamation_script_versions WHERE tenant_id=${tenantId} AND script_id=${id} ORDER BY version_number DESC`),
      db.execute(sql`SELECT id,script_version_id,decision,note,created_at FROM ninjamation_reviews WHERE tenant_id=${tenantId} AND script_id=${id} ORDER BY created_at DESC LIMIT 100`),
      db.execute(sql`SELECT id,file_name,content_sha256,created_at FROM ninjamation_downloads WHERE tenant_id=${tenantId} AND script_id=${id} ORDER BY created_at DESC LIMIT 100`),
      db.execute(sql`SELECT item.action,item.source_path,item.source_blob_sha,item.content_sha256,item.safe_metadata,item.created_at,run.resolved_commit,run.snapshot_sha256 FROM ninjamation_sync_items item JOIN ninjamation_sync_runs run ON run.tenant_id=item.tenant_id AND run.id=item.sync_run_id WHERE item.tenant_id=${tenantId} AND item.script_id=${id} ORDER BY item.created_at DESC LIMIT 100`),
      db.execute(sql`SELECT id FROM ninjamation_favorites WHERE tenant_id=${tenantId} AND user_id=${userId} AND script_id=${id} LIMIT 1`),
    ]);
    return {
      script: camel(selected), versions: versions.rows.map((row) => camel(row as Row, false)),
      reviews: reviews.rows.map((row) => camel(row as Row, false)), downloads: downloads.rows.map((row) => camel(row as Row, false)),
      syncHistory: syncHistory.rows.map((row) => camel(row as Row, false)), favorite: Boolean(favorite.rows[0]),
      execution: { supported: false, reasonCode: 'NINJAMATION_LIBRARY_ONLY' },
    };
  });

  app.post(`${BASE}/scripts/:id/favorite`, { preHandler: readGuards }, async (request, reply) => {
    const id = params(request).id;
    const exists = await db.execute(sql`SELECT id FROM ninjamation_scripts WHERE tenant_id=${tenant(request)} AND id=${id} AND deleted_at IS NULL LIMIT 1`);
    if (!exists.rows[0]) return reply.code(404).send({ error: 'Script not found', code: 'NINJAMATION_SCRIPT_NOT_FOUND' });
    const result = await db.execute(sql`INSERT INTO ninjamation_favorites(tenant_id,user_id,script_id) VALUES (${tenant(request)},${actor(request)},${id}) ON CONFLICT (tenant_id,user_id,script_id) DO UPDATE SET created_at=ninjamation_favorites.created_at RETURNING id,created_at`);
    return reply.code(201).send({ favorite: true, ...camel(result.rows[0] as Row) });
  });
  app.delete(`${BASE}/scripts/:id/favorite`, { preHandler: readGuards }, async (request, reply) => {
    await db.execute(sql`DELETE FROM ninjamation_favorites WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND script_id=${params(request).id}`);
    return reply.code(204).send();
  });

  app.post(`${BASE}/scripts/:id/download`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const tenantId = tenant(request), userId = actor(request), selected = await selectScript(tenantId, params(request).id);
      if (!selected || selected.status !== 'approved' || selected.sync_state !== 'active') {
        return reply.code(409).send({ error: 'Only the current active approved version can be downloaded', code: 'NINJAMATION_DOWNLOAD_NOT_APPROVED' });
      }
      const content = String(selected.content);
      if (sha256(content) !== String(selected.content_sha256)) {
        return reply.code(409).send({ error: 'Stored script integrity check failed', code: 'NINJAMATION_DOWNLOAD_INTEGRITY_FAILED' });
      }
      const access = await resolveNinjamationAccess(userId, tenantId);
      const fileName = selected.file_name || safeFileName(String(selected.source_display_name ?? selected.name), selected.language);
      await db.transaction(async (tx) => {
        await consumeNinjamationUsage({ tenantId, userId, kind: 'download', limit: access.limits.monthlyDownloads, executor: tx });
        await tx.execute(sql`INSERT INTO ninjamation_downloads(tenant_id,script_id,script_version_id,downloaded_by_user_id,file_name,content_sha256,request_id) VALUES (${tenantId},${selected.id},${selected.script_version_id},${userId},${fileName},${selected.content_sha256},${request.id})`);
        await recordUsageEvent({ tenantId, moduleId: await moduleId(), userId, operation: 'ninjamation.download', units: 1, unitKind: 'download', idempotencyKey: `ninjamation:download:${request.id}`, externalReference: String(selected.script_version_id), metadata: { scriptId: selected.id, version: selected.current_version_number, contentSha256: selected.content_sha256 } }, tx);
      });
      await activity(request, 'ninjamation_script', String(selected.id), 'script_downloaded', 'Approved script version downloaded', { version: selected.current_version_number, contentSha256: selected.content_sha256 });
      return reply.header('Content-Type', 'text/plain; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${String(fileName).replaceAll('"', '')}"`)
        .header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff')
        .header('X-Ninjamation-Content-SHA256', String(selected.content_sha256))
        .header('X-Ninjamation-Version', String(selected.current_version_number)).send(content);
    } catch (error) { return fail(reply, error); }
  });

  app.post(`${BASE}/generations`, { preHandler: writeGuards }, async (request, reply) => {
    let operation: Awaited<ReturnType<typeof beginIdempotentOperation>> | null = null;
    let usageReserved = false;
    try {
      const input = parseGeneration(request.body), tenantId = tenant(request), userId = actor(request), modId = await moduleId();
      const access = await resolveNinjamationAccess(userId, tenantId);
      if (!access.limits.aiGeneration) return reply.code(403).send({ error: 'AI drafting requires the Script Ops Pro or Enterprise entitlement', code: 'NINJAMATION_AI_ENTITLEMENT_REQUIRED', requiredPlan: 'pro' });
      const provider = getSharedAiProviderAdapter();
      if (provider.status.state === 'disabled') return reply.code(503).send({ error: 'AI generation is unavailable until the shared provider is configured', code: 'AI_PROVIDER_DISABLED', provider: provider.status });
      const safeRequest = { promptSha256: sha256(input.prompt), language: input.language, name: input.name, category: input.category, riskTier: input.riskTier };
      operation = await beginIdempotentOperation({ tenantId, moduleId: modId, scope: 'ninjamation.phase36.generation', idempotencyKey: input.idempotencyKey, request: safeRequest, leaseMs: 120_000 });
      if (operation.state === 'replay') return reply.code(operation.responseStatus).send({ ...(operation.responseJson as Row), replayed: true });
      if (operation.state === 'conflict') return reply.code(409).send({ error: 'Idempotency key was reused for different input', code: 'IDEMPOTENCY_CONFLICT' });
      if (operation.state === 'in_progress') return reply.code(409).send({ error: 'Generation is already processing', code: 'IDEMPOTENCY_IN_PROGRESS' });
      await consumeNinjamationUsage({ tenantId, userId, kind: 'generation', limit: access.limits.monthlyGenerations });
      usageReserved = true;
      const completion = await provider.complete({
        systemPrompt: ['OPERATOROS_NINJAMATION_V1', `Create one ${input.language} automation script.`, 'Return strict JSON with name, description, and content.', 'Use defensive validation and comments. Never include credentials, encoded commands, dynamic eval, remote pipe-to-shell, persistence, security-control bypass, or destructive root operations.', 'This is an unapproved inert draft. Never claim execution, testing, deployment, approval, or universal safety.'].join('\n'),
        userPrompt: JSON.stringify({ prompt: input.prompt, requestedName: input.name, requestedDescription: input.description, language: input.language }),
        responseFormat: 'json', temperature: 0.2, maxTokens: 5_000, timeoutMs: 30_000,
      });
      let generated: ReturnType<typeof parseGeneratedScript>;
      try {
        generated = parseGeneratedScript(completion.text);
      } catch {
        throw new NinjamationPhase36Error('AI provider returned an invalid structured script response', 'NINJAMATION_GENERATED_OUTPUT_INVALID', 502);
      }
      const scriptContent = generated.content, analysis = analyzePhase36Script(scriptContent);
      const response = await db.transaction(async (tx) => {
        const suffix = safeRequest.promptSha256.slice(0, 8);
        const generatedName = `${String(input.name ?? generated.name).slice(0, 168)} [${suffix}]`;
        const inserted = await tx.execute(sql`INSERT INTO ninjamation_scripts(tenant_id,created_by_user_id,owner_user_id,name,source_display_name,description,language,category,source,risk_tier,status,file_name,tags) VALUES (${tenantId},${userId},${userId},${generatedName},${input.name ?? generated.name},${input.description ?? generated.description},${input.language},${input.category},'ai_generated',${input.riskTier},'draft',${safeFileName(input.name ?? generated.name,input.language)},${JSON.stringify([input.language,'ai-generated','review-required'])}::jsonb) RETURNING *`);
        const script = inserted.rows[0] as Row;
        const version = await tx.execute(sql`INSERT INTO ninjamation_script_versions(tenant_id,script_id,version_number,content,content_sha256,static_analysis,created_by_user_id,provenance_json,safety_status) VALUES (${tenantId},${script.id},1,${scriptContent},${analysis.contentSha256},${analysis},${userId},${{ provider: completion.provider, model: completion.model, version: completion.version, promptSha256: safeRequest.promptSha256 }},${analysis.criticalCount ? 'critical_findings' : 'review_required'}) RETURNING *`);
        const generation = await tx.execute(sql`INSERT INTO ninjamation_generations(tenant_id,script_id,user_id,idempotency_key,prompt_sha256,language,provider,model,provider_version,token_count,duration_ms,status,fallback_used,output_sha256,validation_version,safety_summary) VALUES (${tenantId},${script.id},${userId},${input.idempotencyKey},${safeRequest.promptSha256},${input.language},${completion.provider},${completion.model},${completion.version},${completion.tokenCount},${completion.durationMs},'completed',FALSE,${analysis.contentSha256},'ninjamation-phase36-v1',${{ findingCount: analysis.findingCount, criticalCount: analysis.criticalCount, warningCount: analysis.warningCount, secretFindingCount: analysis.secretFindingCount }}) RETURNING *`);
        await recordUsageEvent({ tenantId, moduleId: modId, userId, operation: 'ninjamation.ai_generation', units: 1, unitKind: 'generation', idempotencyKey: `ninjamation:generation:${generation.rows[0].id}`, externalReference: String(generation.rows[0].id), metadata: { language: input.language, tokenCount: completion.tokenCount, contentSha256: analysis.contentSha256, criticalCount: analysis.criticalCount } }, tx);
        const payload = { script: camel({ ...script, ...version.rows[0], id: script.id, script_version_id: version.rows[0].id }), generation: camel(generation.rows[0] as Row, false), reviewRequired: true, executionSupported: false, replayed: false };
        await completeIdempotentOperation({ tenantId, id: operation!.id, leaseExpiresAt: (operation as any).leaseExpiresAt, responseStatus: 201, responseJson: payload }, tx);
        return payload;
      });
      await activity(request, 'ninjamation_generation', String(response.generation.id), 'generation_completed', 'AI script draft generated for review', { provider: response.generation.provider, language: input.language, contentSha256: response.script.contentSha256 });
      return reply.code(201).send(response);
    } catch (error) {
      if (usageReserved) await releaseNinjamationUsage({ tenantId: tenant(request), userId: actor(request), kind: 'generation' }).catch(() => undefined);
      if (operation?.state === 'acquired') await failIdempotentOperation({ tenantId: tenant(request), id: operation.id, leaseExpiresAt: operation.leaseExpiresAt }).catch(() => undefined);
      return fail(reply, error);
    }
  });

  app.post(`${BASE}/sync-runs`, { preHandler: adminGuards }, async (request, reply) => {
    try {
      const input = parseSyncRequest(request.body), tenantId = tenant(request), userId = actor(request), modId = await moduleId();
      const created = await db.execute(sql`INSERT INTO ninjamation_sync_runs(tenant_id,requested_by_user_id,idempotency_key,repository,branch,requested_commit,mode,status) VALUES (${tenantId},${userId},${input.idempotencyKey},${NINJAMATION_REPOSITORY},${NINJAMATION_REPOSITORY_BRANCH},${input.requestedCommit ?? NINJAMATION_PHASE36_CATALOG_COMMIT},${'incremental'},'queued') ON CONFLICT (tenant_id,idempotency_key) DO NOTHING RETURNING *`);
      const run = (created.rows[0] ?? (await db.execute(sql`SELECT * FROM ninjamation_sync_runs WHERE tenant_id=${tenantId} AND idempotency_key=${input.idempotencyKey} LIMIT 1`)).rows[0]) as Row;
      const queued = await enqueueSharedJob({ tenantId, moduleId: modId, requestedByUserId: userId, handlerKey: SYNC_HANDLER, payload: { runId: run.id }, idempotencyKey: `sync:${input.idempotencyKey}`, correlationId: request.id, maxAttempts: 5 });
      await db.execute(sql`UPDATE ninjamation_sync_runs SET shared_job_id=${(queued.job as Row).id},updated_at=NOW() WHERE tenant_id=${tenantId} AND id=${run.id}`);
      await writeAudit({ actorUserId: userId, tenantId, targetType: 'ninjamation_sync_run', targetId: String(run.id), action: 'ninjamation_sync_queued', after: { repository: NINJAMATION_REPOSITORY, commit: run.requested_commit, jobId: (queued.job as Row).id } }, request);
      return reply.code(created.rows[0] ? 202 : 200).send({ syncRun: camel(run, false), job: camel(queued.job as Row, false), replayed: !created.rows[0] });
    } catch (error) { return fail(reply, error); }
  });
  app.get(`${BASE}/sync-runs`, { preHandler: readGuards }, async (request) => ({ runs: (await db.execute(sql`SELECT * FROM ninjamation_sync_runs WHERE tenant_id=${tenant(request)} ORDER BY created_at DESC LIMIT 100`)).rows.map((row) => camel(row as Row, false)) }));
  app.get(`${BASE}/sync-runs/:id`, { preHandler: readGuards }, async (request, reply) => {
    const run = await db.execute(sql`SELECT * FROM ninjamation_sync_runs WHERE tenant_id=${tenant(request)} AND id=${params(request).id} LIMIT 1`);
    if (!run.rows[0]) return reply.code(404).send({ error: 'Sync run not found', code: 'NINJAMATION_SYNC_NOT_FOUND' });
    const items = await db.execute(sql`SELECT script_id,source_path,action,source_blob_sha,content_sha256,reason_code,safe_metadata,created_at FROM ninjamation_sync_items WHERE tenant_id=${tenant(request)} AND sync_run_id=${params(request).id} ORDER BY source_path`);
    return { syncRun: camel(run.rows[0] as Row, false), items: items.rows.map((row) => camel(row as Row, false)) };
  });
  app.post(`${BASE}/sync-runs/:id/retry`, { preHandler: adminGuards }, async (request, reply) => {
    try {
      const input = parseSyncRequest(request.body), prior = await db.execute(sql`SELECT * FROM ninjamation_sync_runs WHERE tenant_id=${tenant(request)} AND id=${params(request).id} AND status='failed' LIMIT 1`);
      if (!prior.rows[0]) return reply.code(409).send({ error: 'Only a failed sync can be retried', code: 'NINJAMATION_SYNC_RETRY_INVALID' });
      const created = await db.execute(sql`INSERT INTO ninjamation_sync_runs(tenant_id,requested_by_user_id,idempotency_key,repository,branch,requested_commit,mode,status) VALUES (${tenant(request)},${actor(request)},${input.idempotencyKey},${NINJAMATION_REPOSITORY},${NINJAMATION_REPOSITORY_BRANCH},${prior.rows[0].requested_commit},'retry','queued') ON CONFLICT (tenant_id,idempotency_key) DO NOTHING RETURNING *`);
      const run = (created.rows[0] ?? (await db.execute(sql`SELECT * FROM ninjamation_sync_runs WHERE tenant_id=${tenant(request)} AND idempotency_key=${input.idempotencyKey} LIMIT 1`)).rows[0]) as Row;
      const job = await enqueueSharedJob({ tenantId: tenant(request), moduleId: await moduleId(), requestedByUserId: actor(request), handlerKey: SYNC_HANDLER, payload: { runId: run.id }, idempotencyKey: `sync:${input.idempotencyKey}`, maxAttempts: 5 });
      await db.execute(sql`UPDATE ninjamation_sync_runs SET shared_job_id=${(job.job as Row).id} WHERE tenant_id=${tenant(request)} AND id=${run.id}`);
      await writeAudit({ actorUserId: actor(request), tenantId: tenant(request), targetType: 'ninjamation_sync_run', targetId: String(run.id), action: 'ninjamation_sync_retried', before: { failedRunId: params(request).id }, after: { jobId: (job.job as Row).id } }, request);
      return reply.code(created.rows[0] ? 202 : 200).send({ syncRun: camel(run, false), replayed: !created.rows[0] });
    } catch (error) { return fail(reply, error); }
  });

  app.get(`${BASE}/account`, { preHandler: readGuards }, async (request) => {
    const user = await db.execute(sql`SELECT id,email,name,avatar_url,platform_role FROM users WHERE id=${actor(request)} LIMIT 1`);
    const access = await resolveNinjamationAccess(actor(request), tenant(request));
    const counter = await db.execute(sql`SELECT generation_count,download_count,period_start FROM ninjamation_usage_counters WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND period_start=date_trunc('month',CURRENT_DATE)::date`);
    const history = await db.execute(sql`SELECT id,script_id,language,provider,model,provider_version,token_count,duration_ms,status,fallback_used,output_sha256,created_at FROM ninjamation_generations WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} ORDER BY created_at DESC LIMIT 100`);
    return { profile: camel(user.rows[0] as Row), access, usage: camel((counter.rows[0] ?? { generation_count: 0, download_count: 0 }) as Row), generationHistory: history.rows.map((row) => camel(row as Row, false)), billingManagementPath: '/app/billing', childBillingAuthority: false };
  });

  app.get(`${BASE}/admin`, { preHandler: adminGuards }, async (request) => {
    const tenantId = tenant(request), access = await resolveNinjamationAccess(actor(request), tenantId);
    const [users, stats, schedules, sync] = await Promise.all([
      db.execute(sql`SELECT user_row.id,user_row.email,user_row.name,user_row.avatar_url,user_row.status,membership.role,membership.joined_at,module_access.access_level FROM tenant_users membership JOIN users user_row ON user_row.id=membership.user_id LEFT JOIN modules module_row ON module_row.slug=${MODULE_SLUG} LEFT JOIN tenant_user_module_access module_access ON module_access.tenant_id=membership.tenant_id AND module_access.user_id=membership.user_id AND module_access.module_id=module_row.id WHERE membership.tenant_id=${tenantId} ORDER BY user_row.email LIMIT 200`),
      db.execute(sql`SELECT (SELECT count(*)::int FROM ninjamation_scripts WHERE tenant_id=${tenantId} AND deleted_at IS NULL) AS scripts,(SELECT count(*)::int FROM ninjamation_scripts WHERE tenant_id=${tenantId} AND status='review' AND deleted_at IS NULL) AS review_queue,(SELECT count(*)::int FROM ninjamation_downloads WHERE tenant_id=${tenantId}) AS downloads,(SELECT count(*)::int FROM ninjamation_generations WHERE tenant_id=${tenantId}) AS generations`),
      db.execute(sql`SELECT id,name,interval_seconds,next_run_at,enabled,last_enqueued_at,last_error_code,version FROM shared_schedules WHERE tenant_id=${tenantId} AND module_id=${await moduleId()} AND handler_key=${SYNC_HANDLER} ORDER BY created_at DESC`),
      db.execute(sql`SELECT * FROM ninjamation_sync_runs WHERE tenant_id=${tenantId} ORDER BY created_at DESC LIMIT 20`),
    ]);
    return { users: users.rows.map((row) => ({ ...camel(row as Row, false), plan: access.plan, planAuthority: 'OperatorOS' })), stats: camel(stats.rows[0] as Row), schedules: schedules.rows.map((row) => camel(row as Row, false)), syncRuns: sync.rows.map((row) => camel(row as Row, false)), management: { users: `/app/platform/tenants/${tenantId}`, billing: '/app/billing', entitlements: `/app/platform/tenants/${tenantId}` }, childTierMutationAvailable: false };
  });
  app.patch(`${BASE}/admin/scripts/:id`, { preHandler: adminGuards }, async (request, reply) => {
    const action = String(body(request).action ?? '');
    if (!['deprecate', 'restore'].includes(action)) return reply.code(400).send({ error: 'action must be deprecate or restore', code: 'NINJAMATION_ADMIN_ACTION_INVALID' });
    const before = await selectScript(tenant(request), params(request).id);
    if (!before) return reply.code(404).send({ error: 'Script not found', code: 'NINJAMATION_SCRIPT_NOT_FOUND' });
    const result = action === 'deprecate'
      ? await db.execute(sql`UPDATE ninjamation_scripts SET sync_state='deprecated',deprecated_at=NOW(),deprecation_reason='Deprecated by OperatorOS tenant administrator',status='retired',retired_at=NOW(),approved_at=NULL,approved_by_user_id=NULL,version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${params(request).id} RETURNING *`)
      : await db.execute(sql`UPDATE ninjamation_scripts SET sync_state='active',deprecated_at=NULL,deprecation_reason=NULL,status='draft',retired_at=NULL,approved_at=NULL,approved_by_user_id=NULL,version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${params(request).id} RETURNING *`);
    await writeAudit({ actorUserId: actor(request), tenantId: tenant(request), targetType: 'ninjamation_script', targetId: params(request).id, action: `ninjamation_script_${action}`, before: { status: before.status, syncState: before.sync_state }, after: { status: result.rows[0].status, syncState: result.rows[0].sync_state } }, request);
    return camel(result.rows[0] as Row, false);
  });
  app.put(`${BASE}/admin/sync-schedule`, { preHandler: adminGuards }, async (request, reply) => {
    try {
      const intervalSeconds = Number(body(request).intervalSeconds ?? 86_400), enabled = body(request).enabled !== false;
      if (!Number.isInteger(intervalSeconds) || intervalSeconds < 3600 || intervalSeconds > 2_592_000) throw new NinjamationPhase36Error('intervalSeconds must be between 3600 and 2592000', 'NINJAMATION_SCHEDULE_INVALID');
      const schedule = await createSharedSchedule({ tenantId: tenant(request), moduleId: await moduleId(), actorUserId: actor(request), name: 'AutomationPacks catalog sync', handlerKey: SYNC_HANDLER, payload: { commit: NINJAMATION_PHASE36_CATALOG_COMMIT }, intervalSeconds, nextRunAt: new Date(Date.now() + intervalSeconds * 1000) });
      if (!enabled) await db.execute(sql`UPDATE shared_schedules SET enabled=FALSE,version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${(schedule as Row).id}`);
      await writeAudit({ actorUserId: actor(request), tenantId: tenant(request), targetType: 'shared_schedule', targetId: String((schedule as Row).id), action: 'ninjamation_sync_schedule_updated', after: { intervalSeconds, enabled } }, request);
      return camel({ ...(schedule as Row), enabled }, false);
    } catch (error) { return fail(reply, error); }
  });

  app.get(`${BASE}/formats`, { preHandler: readGuards }, async () => ({
    library: NINJAMATION_LIBRARY_FORMATS.map((format) => ({ format, extension: NINJAMATION_EXTENSIONS[format as keyof typeof NINJAMATION_EXTENSIONS] ?? null })),
    ai: Object.entries(NINJAMATION_EXTENSIONS).map(([format, extension]) => ({ format, extension })),
    executionSupported: false,
  }));
}
