import { randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db.js';
import { getEmbeddingProvider, validateEmbeddingVector, EmbeddingError, type EmbeddingProvider } from './embedding-provider.js';
import { resolutionVectorCapability } from './techdeck-resolution-semantic-db.js';
import { screenResolutionSecrets, RESOLUTION_REDACTOR_VERSION } from './techdeck-resolution-redaction.js';
import { sha256, ResolutionInputError } from './techdeck-resolution-validation.js';
import type { ResolutionContext } from './techdeck-resolution-ingestion.js';
import { enqueueSharedJob, registerSharedJobHandler, type SharedJobContext } from './shared-background-jobs.js';
import { appendActivityEvent, recordUsageEvent } from './shared-usage-activity.js';
import { resolveTenantModuleAccess, tenantHasModuleEntitlement } from './tenant-entitlements.js';

type Executor = Pick<typeof db, 'execute'>;
type Row = Record<string, any>;
const HANDLER = 'techdeck.resolution.embed.v1';
export const EMBEDDING_REDACTOR = `${RESOLUTION_REDACTOR_VERSION}:egress-v1`;
export const SEMANTIC_CANDIDATE_LIMIT = 2000;
const MAX_CHUNKS = 200;
const CHUNK_LENGTH = 1500;
const roles = (role: ResolutionContext['role']) => role === 'owner' ? ['member','admin','owner'] : role === 'admin' ? ['member','admin'] : ['member'];
function fail(code: string, status = 409): never { throw new ResolutionInputError(code, status); }
const admin = (context: ResolutionContext) => { if (!['admin','owner'].includes(context.role)) fail('RESOLUTION_ADMIN_REQUIRED', 403); };
const audit = (context: ResolutionContext, id: string, event: string, metadata: Row, executor: Executor) => appendActivityEvent({ tenantId: context.tenantId, moduleId: context.moduleId, actorUserId: context.actorUserId, objectType: 'techdeck_resolution_semantic', objectId: id, eventType: `techdeck.resolution.${event}`, summary: 'Resolution semantic search settings or indexing updated', metadata, correlationId: context.correlationId }, executor);

async function settings(context: ResolutionContext, executor: Executor = db, lock = false) {
  const result = await executor.execute(sql`SELECT enabled,daily_request_limit,version FROM techdeck_resolution_semantic_settings WHERE tenant_id=${context.tenantId} ${lock ? sql`FOR UPDATE` : sql``}`);
  return result.rows[0] as { enabled: boolean; daily_request_limit: number; version: number } | undefined;
}
export async function semanticStatus(context: ResolutionContext) {
  const [config, capability] = await Promise.all([settings(context), resolutionVectorCapability()]);
  const adapter = getEmbeddingProvider();
  const state = !adapter ? 'provider_disabled' : !capability.installed ? 'vector_unavailable' : !config?.enabled ? 'organization_disabled' : 'available';
  return { state, provider: adapter ? { ...adapter.identity, state: adapter.state } : null, enabled: config?.enabled ?? false, dailyRequestLimit: config?.daily_request_limit ?? 100, version: config?.version ?? 0, candidateLimit: SEMANTIC_CANDIDATE_LIMIT };
}
export async function saveSemanticSettings(context: ResolutionContext, input: unknown) {
  admin(context);
  const value = input as Row;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['enabled','dailyRequestLimit','expectedVersion','egressReviewed'].includes(key)) || typeof value.enabled !== 'boolean' || !Number.isInteger(value.dailyRequestLimit) || value.dailyRequestLimit < 1 || value.dailyRequestLimit > 1000 || !Number.isInteger(value.expectedVersion) || value.expectedVersion < 0) fail('RESOLUTION_BODY_INVALID',400);
  if (value.enabled && value.egressReviewed !== true) fail('RESOLUTION_EGRESS_REVIEW_REQUIRED',400);
  if (value.enabled && (!(getEmbeddingProvider()) || !(await resolutionVectorCapability()).installed)) fail('RESOLUTION_SEMANTIC_UNAVAILABLE');
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resolution-semantic:${context.tenantId}`},0))`);
    const current = await settings(context,tx,true);
    if ((current?.version ?? 0) !== value.expectedVersion) fail('RESOLUTION_VERSION_CONFLICT');
    await tx.execute(sql`INSERT INTO techdeck_resolution_semantic_settings(tenant_id,enabled,daily_request_limit,updated_by_user_id)
      VALUES (${context.tenantId},${value.enabled},${value.dailyRequestLimit},${context.actorUserId})
      ON CONFLICT(tenant_id) DO UPDATE SET enabled=excluded.enabled,daily_request_limit=excluded.daily_request_limit,updated_by_user_id=excluded.updated_by_user_id,version=techdeck_resolution_semantic_settings.version+1,updated_at=NOW()`);
    await audit(context,context.tenantId,'semantic_settings_updated',{ enabled: value.enabled, dailyRequestLimit: value.dailyRequestLimit },tx);
  });
  return semanticStatus(context);
}

async function source(context: ResolutionContext, id: string, executor: Executor = db, lock = false) {
  const result = await executor.execute(sql`SELECT i.* FROM techdeck_resolution_incidents i WHERE i.tenant_id=${context.tenantId} AND i.id=${id} AND i.archived_at IS NULL AND i.active_revision IS NOT NULL AND i.minimum_role IN (${sql.join(roles(context.role).map(r => sql`${r}`),sql`,`)}) ${lock ? sql`FOR UPDATE` : sql``}`);
  return result.rows[0] as Row | undefined;
}
/** Heuristic masking, never a de-identification guarantee. The full output is reviewed before egress. */
export function screenEmbeddingText(text: string, privateLabels: string[] = []) {
  if (screenResolutionSecrets(text,null).length) fail('RESOLUTION_REDACTION_REQUIRED',422);
  let safe = text;
  for (const label of privateLabels.filter(label => label.length > 1).sort((a,b) => b.length-a.length)) safe = safe.split(label).join('[PRIVATE LABEL]');
  safe = safe.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[EMAIL]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[IP OR BUILD]')
    .replace(/https?:\/\/[^\s<>"']+/gi,'[URL]')
    .replace(/[A-Z]:\\Users\\[^\\\s]+/gi,'C:\\Users\\[USER]');
  if (screenResolutionSecrets(safe,null).length) fail('RESOLUTION_REDACTION_REQUIRED',422);
  return safe;
}
type Chunk = { documentId: string; offset: number; sourceHash: string; inputHash: string; text: string; pointer: string };
async function chunks(context: ResolutionContext, incident: Row, executor: Executor) {
  const identifiers = await executor.execute(sql`SELECT original_value FROM techdeck_resolution_identifiers WHERE tenant_id=${context.tenantId} AND incident_id=${incident.id} AND revision=${incident.active_revision} AND kind='hostname'`);
  const labels = [incident.client_label,incident.organization_label,incident.technician_label,...identifiers.rows.map(r => r.original_value)].filter(value => typeof value === 'string') as string[];
  // Raw exports, commands, links and unrecognized extension fields never enter egress.
  const documents = await executor.execute(sql`SELECT id,source_pointer,title,search_text,content_sha256 FROM techdeck_resolution_search_documents
    WHERE tenant_id=${context.tenantId} AND incident_id=${incident.id} AND revision=${incident.active_revision}
      AND split_part(section,':',1) IN ('incident','symptoms','root_causes','actions','side_effects','validations','warnings','lessons','quality_notes','components')
    ORDER BY source_pointer COLLATE "C",id LIMIT ${MAX_CHUNKS+1}`);
  const result: Chunk[] = [];
  for (const doc of documents.rows) {
    const text = screenEmbeddingText(`${doc.title}\n${doc.search_text}`,labels);
    // Split by codepoint to avoid splitting surrogate pairs.
    const points = Array.from(text);
    for (let offset=0;offset<points.length;offset+=CHUNK_LENGTH) {
      const input = points.slice(offset,offset+CHUNK_LENGTH).join('');
      if (input.trim()) result.push({ documentId: String(doc.id),offset,sourceHash:String(doc.content_sha256),inputHash:sha256(input),text:input,pointer:String(doc.source_pointer) });
      if (result.length > MAX_CHUNKS) fail('RESOLUTION_EMBEDDING_SIZE_LIMIT',413);
    }
  }
  if (!result.length) fail('RESOLUTION_EMBEDDING_EMPTY',422);
  return result;
}
async function preview(context: ResolutionContext,id: string,version: number,executor: Executor,lock=false) {
  const incident = await source(context,id,executor,lock);
  if (!incident) fail('RESOLUTION_NOT_FOUND',404);
  if (incident!.version !== version) fail('RESOLUTION_VERSION_CONFLICT');
  const adapter = getEmbeddingProvider();
  if (!adapter) fail('RESOLUTION_SEMANTIC_UNAVAILABLE');
  const parts = await chunks(context,incident!,executor);
  return { incident: incident!, parts, identity: adapter!.identity, previewSha256:sha256(JSON.stringify([incident!.id,version,incident!.active_revision,adapter!.identity,EMBEDDING_REDACTOR,parts])) };
}
function parseReview(input: unknown,queue=false) {
  const value=input as Row;
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k => !(queue ? ['expectedVersion','previewSha256','privacyReviewed'] : ['expectedVersion']).includes(k)) || !Number.isInteger(value.expectedVersion) || value.expectedVersion<1) fail('RESOLUTION_BODY_INVALID',400);
  if (queue && (value.privacyReviewed!==true || !/^[a-f0-9]{64}$/.test(value.previewSha256))) fail('RESOLUTION_EGRESS_REVIEW_REQUIRED',400);
  return value;
}
export async function previewSemanticIndex(context: ResolutionContext,id: string,input: unknown) {
  admin(context); const value=parseReview(input);
  const result=await db.transaction(tx => preview(context,id,value.expectedVersion,tx));
  return { expectedVersion:value.expectedVersion,previewSha256:result.previewSha256,provider:result.identity,redactorVersion:EMBEDDING_REDACTOR,chunks:result.parts.map(part => ({ text:part.text,sourcePointer:part.pointer })),requestCount:result.parts.length };
}
export async function queueSemanticIndex(context: ResolutionContext,id: string,input: unknown) {
  admin(context); const value=parseReview(input,true);
  if (!(await resolutionVectorCapability()).installed) fail('RESOLUTION_SEMANTIC_UNAVAILABLE');
  return db.transaction(async tx => {
    const config=await settings(context,tx,true); if (!config?.enabled) fail('RESOLUTION_SEMANTIC_UNAVAILABLE');
    const result=await preview(context,id,value.expectedVersion,tx,true);
    if (result.previewSha256!==value.previewSha256) fail('RESOLUTION_PREVIEW_CHANGED');
    let queued=0;
    for (const part of result.parts) {
      const generation=randomUUID();
      const inserted=await tx.execute(sql`INSERT INTO techdeck_resolution_embeddings(tenant_id,incident_id,revision,source_version,document_id,chunk_offset,source_hash,input_hash,redactor_version,provider,model,dimensions,settings_version,generation,requested_by_user_id)
        VALUES (${context.tenantId},${id},${result.incident.active_revision},${value.expectedVersion},${part.documentId},${part.offset},${part.sourceHash},${part.inputHash},${EMBEDDING_REDACTOR},${result.identity.provider},${result.identity.model},${result.identity.dimensions},${config!.version},${generation},${context.actorUserId})
        ON CONFLICT(tenant_id,document_id,chunk_offset,provider,model,dimensions,redactor_version) DO UPDATE SET source_version=excluded.source_version,source_hash=excluded.source_hash,input_hash=excluded.input_hash,settings_version=excluded.settings_version,generation=excluded.generation,requested_by_user_id=excluded.requested_by_user_id,status='pending',embedding=NULL,last_error_code=NULL,updated_at=NOW()
        WHERE techdeck_resolution_embeddings.source_version<>excluded.source_version OR techdeck_resolution_embeddings.settings_version<>excluded.settings_version OR techdeck_resolution_embeddings.status='stale'
          OR (techdeck_resolution_embeddings.status='failed' AND NOT EXISTS(SELECT 1 FROM shared_jobs j WHERE j.tenant_id=excluded.tenant_id AND j.handler_key=${HANDLER} AND j.payload_json->>'generation'=techdeck_resolution_embeddings.generation AND j.status IN ('pending','retry','processing')))
        RETURNING id`);
      if (!inserted.rows[0]) continue;
      await enqueueSharedJob({ tenantId:context.tenantId,moduleId:context.moduleId,requestedByUserId:context.actorUserId,handlerKey:HANDLER,payload:{ embeddingId:inserted.rows[0].id,generation },idempotencyKey:generation,maxAttempts:3,correlationId:context.correlationId },tx); queued++;
    }
    await audit(context,id,'semantic_index_queued',{ queued,revision:result.incident.active_revision,sourceVersion:value.expectedVersion,previewSha256:result.previewSha256 },tx);
    return { queued,total:result.parts.length };
  });
}
export async function semanticIndexStatus(context:ResolutionContext,id:string) {
  const incident=await source(context,id); if (!incident) fail('RESOLUTION_NOT_FOUND',404);
  const identity=getEmbeddingProvider()?.identity;
  if (!identity) return { state:'provider_disabled',items:[] };
  const config=await settings(context);
  const result=await db.execute(sql`SELECT CASE WHEN e.settings_version=${config?.version??0} THEN e.status ELSE 'stale' END AS status,e.last_error_code,count(*)::int AS count FROM techdeck_resolution_embeddings e
    WHERE e.tenant_id=${context.tenantId} AND e.incident_id=${id} AND e.revision=${incident!.active_revision} AND e.source_version=${incident!.version}
      AND e.provider=${identity.provider} AND e.model=${identity.model} AND e.dimensions=${identity.dimensions} AND e.redactor_version=${EMBEDDING_REDACTOR}
    GROUP BY e.status,e.settings_version,e.last_error_code`);
  return { state:result.rows.length?'recorded':'not_indexed',items:result.rows };
}
/** Re-authorize background actors; a saved queue payload is never authority. */
async function currentContext(tenantId:string,userId:string,moduleId:string,write=false):Promise<ResolutionContext> {
  const result=await db.execute(sql`SELECT m.role FROM tenant_users m JOIN tenants t ON t.id=m.tenant_id JOIN users u ON u.id=m.user_id JOIN modules app ON app.id=${moduleId} AND app.slug='techdeck'
    WHERE m.tenant_id=${tenantId} AND m.user_id=${userId} AND t.status='active'
      AND NOT EXISTS(SELECT 1 FROM techdeck_portal_assignments p WHERE p.tenant_id=m.tenant_id AND p.user_id=m.user_id AND p.revoked_at IS NULL)`);
  const role=String(result.rows[0]?.role);
  const access=await resolveTenantModuleAccess(userId,tenantId,moduleId);
  if (!['viewer','member','admin','owner'].includes(role) || !access.hasAccess || write && !['user','manager'].includes(access.accessLevel) || !(await tenantHasModuleEntitlement(tenantId,moduleId))) throw new EmbeddingError('EMBEDDING_ACCESS_REVOKED');
  return { tenantId,actorUserId:userId,moduleId,role:role as ResolutionContext['role'] };
}
/** Reserve attempts atomically before network I/O. Failed/time-out attempts also consume the cap. */
async function embedBudgeted(context:ResolutionContext,text:string,adapter:EmbeddingProvider,requiredSettingsVersion?:number) {
  const attempt=randomUUID();
  await db.transaction(async tx => {
    const config=await settings(context,tx,true);
    if (!config?.enabled || requiredSettingsVersion!==undefined && config.version!==requiredSettingsVersion) throw new EmbeddingError('EMBEDDING_SETTINGS_CHANGED');
    const usage=await tx.execute(sql`SELECT count(*)::int AS n FROM shared_usage_events WHERE tenant_id=${context.tenantId} AND module_id=${context.moduleId} AND operation='resolution.embedding.attempt' AND occurred_at>=date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
    if (Number(usage.rows[0].n)>=config.daily_request_limit) throw new EmbeddingError('EMBEDDING_DAILY_LIMIT');
    await recordUsageEvent({ tenantId:context.tenantId,moduleId:context.moduleId,userId:context.actorUserId,operation:'resolution.embedding.attempt',units:1,unitKind:'request_attempt',idempotencyKey:attempt },tx);
  });
  const result=await adapter.embed(text);
  validateEmbeddingVector(result.vector,adapter.identity.dimensions);
  if (!Number.isSafeInteger(result.inputTokens) || result.inputTokens<1) throw new EmbeddingError('EMBEDDING_RESPONSE_INVALID');
  await recordUsageEvent({ tenantId:context.tenantId,moduleId:context.moduleId,userId:context.actorUserId,operation:'resolution.embedding.input',units:result.inputTokens,unitKind:'provider_input_tokens',idempotencyKey:attempt,metadata:{ provider:adapter.identity.provider,model:adapter.identity.model } });
  return result.vector;
}
async function processEmbeddingJob(job:SharedJobContext) {
  const rows=await db.execute(sql`SELECT * FROM techdeck_resolution_embeddings WHERE tenant_id=${job.tenantId} AND id=${String(job.payload.embeddingId)} AND generation=${String(job.payload.generation)}`);
  const row=rows.rows[0] as Row|undefined;
  if (!row || row.status==='ready' || row.status==='stale') return;
  try {
    const context=await currentContext(job.tenantId,job.requestedByUserId??'',job.moduleId,true);
    if (!['admin','owner'].includes(context.role)) throw new EmbeddingError('EMBEDDING_ACCESS_REVOKED');
    const adapter=getEmbeddingProvider();
    if (!adapter || adapter.identity.provider!==row.provider || adapter.identity.model!==row.model || adapter.identity.dimensions!==row.dimensions || row.redactor_version!==EMBEDDING_REDACTOR || !(await resolutionVectorCapability()).installed) throw new EmbeddingError('EMBEDDING_CONFIGURATION_CHANGED');
    const incident=await source(context,row.incident_id);
    if (!incident || incident.version!==row.source_version || incident.active_revision!==row.revision) throw new EmbeddingError('EMBEDDING_SOURCE_CHANGED');
    const part=(await chunks(context,incident,db)).find(p => p.documentId===row.document_id && p.offset===row.chunk_offset);
    if (!part || part.inputHash!==row.input_hash || part.sourceHash!==row.source_hash) throw new EmbeddingError('EMBEDDING_SOURCE_CHANGED');
    const vector=await embedBudgeted(context,part.text,adapter,row.settings_version);
    const fresh=await currentContext(job.tenantId,job.requestedByUserId??'',job.moduleId,true);
    if (!['admin','owner'].includes(fresh.role)) throw new EmbeddingError('EMBEDDING_ACCESS_REVOKED');
    await db.transaction(async tx => {
      const config=await settings(fresh,tx,true);
      const current=await source(fresh,row.incident_id,tx,true);
      if (!config?.enabled || config.version!==row.settings_version || !current || current.version!==row.source_version || current.active_revision!==row.revision) throw new EmbeddingError('EMBEDDING_SOURCE_CHANGED');
      await tx.execute(sql`UPDATE techdeck_resolution_embeddings SET embedding=${`{${vector.join(',')}}`}::real[],status='ready',last_error_code=NULL,updated_at=NOW() WHERE tenant_id=${job.tenantId} AND id=${row.id} AND generation=${row.generation}`);
    });
  } catch(error) {
    const code=error instanceof EmbeddingError?error.code:error instanceof ResolutionInputError?error.code:'EMBEDDING_FAILED';
    const stale=['EMBEDDING_ACCESS_REVOKED','EMBEDDING_SOURCE_CHANGED','EMBEDDING_SETTINGS_CHANGED','EMBEDDING_CONFIGURATION_CHANGED'].includes(code);
    await db.execute(sql`UPDATE techdeck_resolution_embeddings SET status=${stale?'stale':'failed'},embedding=NULL,last_error_code=${code},updated_at=NOW() WHERE tenant_id=${job.tenantId} AND id=${row.id} AND generation=${row.generation}`);
    if (!stale) throw new EmbeddingError(code);
  }
}
registerSharedJobHandler(HANDLER,processEmbeddingJob);

export type SemanticQuery = { state:string; vector?:number[]; identity?:EmbeddingProvider['identity']; settingsVersion?:number; partial?:boolean };
/** Search is explicitly opt-in per request; ordinary exact/text queries never cause egress. */
export async function semanticQuery(context:ResolutionContext,text:string,authorized:SQL):Promise<SemanticQuery> {
  try {
    const state=await semanticStatus(context); if (state.state!=='available') return { state:state.state };
    const adapter=getEmbeddingProvider()!;
    const eligible=await db.execute(sql`WITH authorized AS MATERIALIZED (${authorized}) SELECT count(*)::int AS n FROM (SELECT e.id FROM techdeck_resolution_embeddings e JOIN authorized i ON i.tenant_id=e.tenant_id AND i.id=e.incident_id AND i.active_revision=e.revision AND i.version=e.source_version WHERE e.status='ready' AND e.provider=${adapter.identity.provider} AND e.model=${adapter.identity.model} AND e.dimensions=${adapter.identity.dimensions} AND e.redactor_version=${EMBEDDING_REDACTOR} AND e.settings_version=${state.version} LIMIT ${SEMANTIC_CANDIDATE_LIMIT+1}) eligible`);
    const count=Number(eligible.rows[0].n);
    if (!count) return { state:'not_indexed' };
    // Avoid unstable pagination or silent truncation. Large corpora use exact/text
    // until narrowed by existing filters; no approximate index is implied.
    if (count>SEMANTIC_CANDIDATE_LIMIT) return { state:'narrow_filters' };
    const input=screenEmbeddingText(text);
    if (Buffer.byteLength(input)>6000) return { state:'query_too_long' };
    const before=await currentContext(context.tenantId,context.actorUserId,context.moduleId);
    if (before.role!==context.role) throw new EmbeddingError('EMBEDDING_ACCESS_REVOKED');
    const vector=await embedBudgeted(context,input,adapter,state.version);
    const fresh=await currentContext(context.tenantId,context.actorUserId,context.moduleId);
    if (fresh.role!==context.role) throw new EmbeddingError('EMBEDDING_ACCESS_REVOKED');
    const current=await settings(fresh);
    if (!current?.enabled || current.version!==state.version) return { state:'organization_disabled' };
    return { state:'available',vector,identity:adapter.identity,settingsVersion:state.version };
  } catch(error) {
    if (error instanceof EmbeddingError && error.code==='EMBEDDING_ACCESS_REVOKED') fail('RESOLUTION_ACCESS_DENIED',403);
    if (error instanceof ResolutionInputError && error.code==='RESOLUTION_REDACTION_REQUIRED') throw error;
    return { state:error instanceof EmbeddingError && error.code==='EMBEDDING_DAILY_LIMIT'?'daily_limit':'provider_unavailable' };
  }
}
