import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db.js';
import { resolutionStorageTables } from '../generated/techdeck-resolution-storage.js';
import { appendActivityEvent } from './shared-usage-activity.js';
import { parseResolutionInput, validateResolutionLinks, type ResolutionContext } from './techdeck-resolution-ingestion.js';
import { ResolutionInputError, sha256 } from './techdeck-resolution-validation.js';
import { extractResolutionIdentifiers, resolutionSearchText } from './techdeck-resolution-search.js';

type Executor = Pick<typeof db, 'execute'>;
type Filters = { clientId?: string; assetId?: string; review?: string; validation?: string; limit: number; cursor?: string };
const rank = { viewer: 0, member: 0, admin: 1, owner: 2 };
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,36}$/.test(value);
const sectionNames = ['incident_assets', 'symptoms', 'identifiers', 'components', 'root_causes', 'actions', 'commands', 'side_effects', 'evidence_links', 'changes', 'validations', 'followups', 'warnings', 'lessons', 'escalation_conditions', 'automation_opportunities', 'automation_steps', 'ip_opportunities', 'quality_notes', 'artifact_references', 'tags', 'relationships'] as const;
export const resolutionSections: readonly string[] = sectionNames;
const tables = new Map(resolutionStorageTables.map(table => [table.name as string, Object.keys(table.columns)]));
const publicIncident = tables.get('techdeck_resolution_incidents')!.filter(key => !['tenant_id', 'created_by_user_id', 'updated_by_user_id', 'archived_at'].includes(key));
const selectIncident = sql.join(publicIncident.map(key => sql`i.${sql.identifier(key)}`), sql`,`);

function visibility(context: ResolutionContext, alias = 'i'): SQL {
  const prefix = sql.identifier(alias);
  const roles = context.role === 'owner' ? ['member', 'admin', 'owner'] : context.role === 'admin' ? ['member', 'admin'] : ['member'];
  return sql`${prefix}.tenant_id=${context.tenantId} AND ${prefix}.archived_at IS NULL AND ${prefix}.active_revision IS NOT NULL AND ${prefix}.minimum_role IN (${sql.join(roles.map(role => sql`${role}`), sql`,`)})`;
}
function filtersClause(filters: Filters): SQL {
  return sql`${filters.clientId ? sql`AND i.directory_organization_id=${filters.clientId}` : sql``}
    ${filters.assetId ? sql`AND EXISTS (SELECT 1 FROM techdeck_resolution_incident_assets asset WHERE asset.tenant_id=i.tenant_id AND asset.incident_id=i.id AND asset.revision=i.active_revision AND asset.asset_id=${filters.assetId})` : sql``}
    ${filters.review ? sql`AND i.review_status=${filters.review}` : sql``}
    ${filters.validation ? sql`AND i.validation_status=${filters.validation}` : sql``}`;
}
export function resolutionFilters(input: unknown, allowed: string[] = []): Filters {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ResolutionInputError('RESOLUTION_QUERY_INVALID', 400);
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['clientId', 'assetId', 'review', 'validation', 'limit', 'cursor', ...allowed].includes(key))) throw new ResolutionInputError('RESOLUTION_QUERY_INVALID', 400);
  for (const key of ['clientId', 'assetId']) if (value[key] !== undefined && !validId(value[key])) throw new ResolutionInputError('RESOLUTION_QUERY_INVALID', 400);
  if (value.review !== undefined && !['reviewed', 'unreviewed'].includes(String(value.review))) throw new ResolutionInputError('RESOLUTION_QUERY_INVALID', 400);
  if (value.validation !== undefined && (typeof value.validation !== 'string' || !/^[A-Z_ -]{1,50}$/.test(value.validation))) throw new ResolutionInputError('RESOLUTION_QUERY_INVALID', 400);
  const limit = value.limit === undefined ? 20 : Number(value.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (value.cursor !== undefined && (typeof value.cursor !== 'string' || value.cursor.length > 500))) throw new ResolutionInputError('RESOLUTION_QUERY_INVALID', 400);
  return { clientId: value.clientId as string | undefined, assetId: value.assetId as string | undefined, review: value.review as string | undefined, validation: value.validation as string | undefined, limit, cursor: value.cursor as string | undefined };
}
function decodeCursor(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try { const result = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); if (result && typeof result === 'object' && !Array.isArray(result)) return result; } catch { /* Generic, non-reflecting error. */ }
  throw new ResolutionInputError('RESOLUTION_CURSOR_INVALID', 400);
}
const encodeCursor = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
function offsetCursor(cursor: string | undefined, scope: string, maximum = 15_000): number {
  const decoded = decodeCursor(cursor); if (!decoded) return 0;
  if (decoded.scope !== scope || !Number.isSafeInteger(decoded.offset) || Number(decoded.offset) < 0 || Number(decoded.offset) > maximum) throw new ResolutionInputError('RESOLUTION_CURSOR_INVALID', 400);
  return Number(decoded.offset);
}
function missing(): never { throw new ResolutionInputError('RESOLUTION_NOT_FOUND', 404); }
async function incident(context: ResolutionContext, id: string, executor: Executor = db, lock = false) {
  if (!validId(id)) missing();
  const result = await executor.execute(sql`SELECT ${selectIncident} FROM techdeck_resolution_incidents i WHERE ${visibility(context)} AND i.id=${id} ${lock ? sql`FOR UPDATE` : sql``}`);
  return result.rows[0] ?? missing();
}

export async function listResolutionIncidents(context: ResolutionContext, filters: Filters) {
  const scope = sha256(JSON.stringify([context.tenantId, context.role, filters.clientId, filters.assetId, filters.review, filters.validation]));
  const cursor = decodeCursor(filters.cursor);
  if (cursor && (cursor.scope !== scope || !validId(cursor.id) || typeof cursor.at !== 'string' || !Number.isFinite(Date.parse(cursor.at)))) throw new ResolutionInputError('RESOLUTION_CURSOR_INVALID', 400);
  const result = await db.execute(sql`SELECT i.id,left(i.title,500) AS title,left(i.issue_summary,500) AS issue_summary,left(i.one_line_resolution,500) AS one_line_resolution,i.source_status,i.validation_status,i.root_cause_confidence,i.review_status,i.created_at,i.created_at::text AS cursor_timestamp,left(i.client_label,200) AS client_label,i.active_revision,i.version
    FROM techdeck_resolution_incidents i WHERE ${visibility(context)} ${filtersClause(filters)}
    ${cursor ? sql`AND (i.created_at,i.id)<(${cursor.at}::timestamptz,${cursor.id})` : sql``}
    ORDER BY i.created_at DESC,i.id DESC LIMIT ${filters.limit + 1}`);
  const items = result.rows.slice(0, filters.limit), last = items.at(-1);
  return { items: items.map(({ cursor_timestamp, ...row }) => row), nextCursor: result.rows.length > filters.limit && last ? encodeCursor({ scope, at: last.cursor_timestamp, id: last.id }) : null };
}
export async function resolutionSummary(context: ResolutionContext, filters: Filters) {
  const result = await db.execute(sql`SELECT count(*)::int AS incidents,count(*) FILTER(WHERE i.review_status='unreviewed')::int AS unreviewed,
    count(*) FILTER(WHERE i.follow_up_required IS TRUE OR i.validation_status IS DISTINCT FROM 'COMPLETE' AND i.validation_status IS DISTINCT FROM 'PASSED')::int AS needs_validation
    FROM techdeck_resolution_incidents i WHERE ${visibility(context)} ${filtersClause(filters)}`);
  return { ...result.rows[0], searchMode: 'exact_and_full_text', embeddings: 'not_enabled' };
}
function sectionGate(section: string, context: ResolutionContext): SQL {
  // Cross-incident edges are authorized at the target too, before counts or expansion.
  return section === 'relationships' ? sql`AND EXISTS (SELECT 1 FROM techdeck_resolution_nodes target JOIN techdeck_resolution_incidents target_incident ON target_incident.tenant_id=target.tenant_id AND target_incident.id=target.incident_id AND target_incident.active_revision=target.revision WHERE target.tenant_id=c.tenant_id AND target.id=c.target_node_id AND ${visibility(context, 'target_incident')})` : sql``;
}
export async function resolutionDetail(context: ResolutionContext, id: string) {
  if (!validId(id)) missing();
  const counts = sectionNames.map(section => sql`${section}::text,(SELECT count(*)::int FROM ${sql.identifier(`techdeck_resolution_${section}`)} c WHERE c.tenant_id=i.tenant_id AND c.incident_id=i.id AND c.revision=i.active_revision ${sectionGate(section, context)})`);
  const result = await db.execute(sql`SELECT ${selectIncident},jsonb_build_object(${sql.join(counts, sql`,`)}) AS section_counts FROM techdeck_resolution_incidents i WHERE ${visibility(context)} AND i.id=${id}`);
  return result.rows[0] ?? missing();
}
export async function resolutionSection(context: ResolutionContext, id: string, section: string, filters: Filters) {
  if (!sectionNames.includes(section as typeof sectionNames[number])) missing();
  const current = await incident(context, id);
  const scope = sha256(JSON.stringify([context.tenantId, context.role, id, current.active_revision, current.version, section]));
  const offset = offsetCursor(filters.cursor, scope), table = `techdeck_resolution_${section}`;
  const columns = tables.get(table)!.filter(key => !['tenant_id', 'created_by_user_id', 'search_text', 'content_sha256', 'redactor_version'].includes(key));
  const order = section === 'actions' || section === 'changes' ? sql`c.observed_at ASC NULLS LAST,c.sequence ASC NULLS LAST,c.id` : section === 'commands' ? sql`c.sequence ASC NULLS LAST,c.id` : sql`c.source_pointer,c.id`;
  const result = await db.execute(sql`SELECT ${sql.join(columns.map(key => sql`c.${sql.identifier(key)}`), sql`,`)} FROM ${sql.identifier(table)} c
    JOIN techdeck_resolution_incidents i ON i.tenant_id=c.tenant_id AND i.id=c.incident_id AND i.active_revision=c.revision
    WHERE ${visibility(context)} AND i.id=${id} AND i.version=${current.version} ${sectionGate(section, context)} ORDER BY ${order} LIMIT ${filters.limit + 1} OFFSET ${offset}`);
  return { revision: current.active_revision, items: result.rows.slice(0, filters.limit), nextCursor: result.rows.length > filters.limit ? encodeCursor({ scope, offset: offset + filters.limit }) : null };
}
export async function resolutionHistory(context: ResolutionContext, id: string, filters: Filters) {
  const current = await incident(context, id), scope = sha256(JSON.stringify([context.tenantId, context.role, id, current.version, 'history']));
  const offset = offsetCursor(filters.cursor, scope);
  const result = await db.execute(sql`SELECT raw.revision,raw.schema_version,raw.normalizer_version,raw.redactor_version,raw.created_at,raw.validation_report FROM techdeck_resolution_raw_exports raw
    JOIN techdeck_resolution_incidents i ON i.tenant_id=raw.tenant_id AND i.id=raw.incident_id WHERE ${visibility(context)} AND i.id=${id} AND i.version=${current.version}
    ORDER BY raw.revision DESC LIMIT ${filters.limit + 1} OFFSET ${offset}`);
  return { items: result.rows.slice(0, filters.limit), nextCursor: result.rows.length > filters.limit ? encodeCursor({ scope, offset: offset + filters.limit }) : null };
}
export async function downloadResolutionRaw(context: ResolutionContext, id: string, revision: number) {
  if (rank[context.role] < rank.admin) throw new ResolutionInputError('RESOLUTION_ADMIN_REQUIRED', 403);
  if (!Number.isSafeInteger(revision) || revision < 1) missing();
  return db.transaction(async tx => {
    await incident(context, id, tx, true);
    const result = await tx.execute(sql`SELECT raw_text FROM techdeck_resolution_raw_exports WHERE tenant_id=${context.tenantId} AND incident_id=${id} AND revision=${revision}`);
    if (!result.rows[0]) missing();
    await appendActivityEvent({ tenantId: context.tenantId, moduleId: context.moduleId, actorUserId: context.actorUserId, objectType: 'techdeck_resolution_incident', objectId: id, eventType: 'techdeck.resolution.raw_downloaded', summary: 'Resolution source downloaded', metadata: { revision }, correlationId: context.correlationId }, tx);
    return String(result.rows[0].raw_text);
  });
}
export async function updateResolutionIncident(context: ResolutionContext, id: string, input: unknown, archive = false) {
  if (context.role === 'viewer') throw new ResolutionInputError('RESOLUTION_WRITE_REQUIRED', 403);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ResolutionInputError('RESOLUTION_BODY_INVALID', 400);
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !(archive ? ['expectedVersion'] : ['expectedVersion', 'reviewStatus', 'minimumRole', 'links']).includes(key))) throw new ResolutionInputError('RESOLUTION_FIELD_NOT_ALLOWED', 400);
  if (!Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1) throw new ResolutionInputError('RESOLUTION_VERSION_REQUIRED', 400);
  if ((archive || value.minimumRole !== undefined) && rank[context.role] < rank.admin) throw new ResolutionInputError('RESOLUTION_ADMIN_REQUIRED', 403);
  if (value.reviewStatus !== undefined && !['reviewed', 'unreviewed'].includes(String(value.reviewStatus))) throw new ResolutionInputError('RESOLUTION_BODY_INVALID', 400);
  if (value.minimumRole !== undefined && (!['member', 'admin', 'owner'].includes(String(value.minimumRole)) || rank[value.minimumRole as keyof typeof rank] > rank[context.role])) throw new ResolutionInputError('RESOLUTION_ACCESS_DENIED', 403);
  const links = value.links === undefined ? null : parseResolutionInput({ rawText: '{}', links: value.links }).links;
  if (links?.assets) throw new ResolutionInputError('RESOLUTION_REPROCESS_REQUIRED', 400); // Revision-bound observations remain immutable.
  if (!archive && value.reviewStatus === undefined && value.minimumRole === undefined && !links) throw new ResolutionInputError('RESOLUTION_BODY_INVALID', 400);
  return db.transaction(async tx => {
    const current = await incident(context, id, tx, true);
    if (Number(current.version) !== value.expectedVersion) throw new ResolutionInputError('RESOLUTION_VERSION_CONFLICT', 409);
    if (links) await validateResolutionLinks(context, links, tx);
    const assignments: SQL[] = [sql`version=version+1`, sql`updated_at=NOW()`, sql`updated_by_user_id=${context.actorUserId}`];
    if (archive) assignments.push(sql`archived_at=NOW()`);
    if (value.reviewStatus !== undefined) assignments.push(sql`review_status=${value.reviewStatus}`);
    if (value.minimumRole !== undefined) assignments.push(sql`minimum_role=${value.minimumRole}`);
    // Supplying links replaces all native parent links, including explicit clearing with {}.
    if (links) assignments.push(sql`directory_organization_id=${links.directoryOrganizationId ?? null}`, sql`directory_site_id=${links.directorySiteId ?? null}`, sql`ticket_id=${links.ticketId ?? null}`);
    await tx.execute(sql`UPDATE techdeck_resolution_incidents SET ${sql.join(assignments, sql`,`)} WHERE tenant_id=${context.tenantId} AND id=${id}`);
    await appendActivityEvent({ tenantId: context.tenantId, moduleId: context.moduleId, actorUserId: context.actorUserId, objectType: 'techdeck_resolution_incident', objectId: id,
      eventType: archive ? 'techdeck.resolution.archived' : 'techdeck.resolution.reviewed', summary: archive ? 'Resolution incident archived' : 'Resolution review metadata updated',
      metadata: { version: Number(current.version) + 1, fields: Object.keys(value).filter(key => key !== 'expectedVersion') }, correlationId: context.correlationId }, tx);
    return { id, version: Number(current.version) + 1, archived: archive };
  });
}

export async function searchResolutionIncidents(context: ResolutionContext, input: Record<string, unknown>, large = false) {
  const filters = resolutionFilters(input, ['q']);
  const text = resolutionSearchText(input.q, large), identifiers = extractResolutionIdentifiers(text);
  const scope = sha256(JSON.stringify([context.tenantId, context.role, text, filters.clientId, filters.assetId, filters.review, filters.validation]));
  const offset = offsetCursor(filters.cursor, scope, 10_000);
  const ports = identifiers.filter(identifier => identifier.kind === 'port');
  // normalize-v1 did not project port rows. Match explicit port context in its
  // safe search documents without rewriting immutable imports or reading raw JSON.
  const portMatches = ports.length ? sql`SELECT DISTINCT 'port' AS kind,port.value AS value FROM (VALUES ${sql.join(ports.map(port => sql`(${port.value})`), sql`,`)}) port(value)
    WHERE EXISTS (SELECT 1 FROM techdeck_resolution_search_documents document WHERE document.tenant_id=i.tenant_id AND document.incident_id=i.id AND document.revision=i.active_revision
      AND document.search_text ~* ('\\mport[[:space:]]{0,32}([:=#][[:space:]]{0,32})?' || port.value || '\\M'))` : sql`SELECT NULL::text AS kind,NULL::text AS value WHERE FALSE`;
  const exact = identifiers.length ? sql.join(identifiers.map(identifier => identifier.kind === 'literal'
    ? sql`identifier.normalized_value=${identifier.value}`
    : identifier.kind === 'basename'
      ? sql`identifier.kind='file_path' AND regexp_replace(identifier.normalized_value,'^.*[\\/]','')=${identifier.value}`
      : sql`identifier.kind=${identifier.kind} AND identifier.normalized_value=${identifier.value}`), sql` OR `) : sql`FALSE`;
  // MATERIALIZED is deliberate: candidate authorization precedes each retrieval signal.
  // Diagnostic prose is parameterized and never included in audit or response metadata.
  const result = await db.execute(sql`WITH authorized AS MATERIALIZED (SELECT i.* FROM techdeck_resolution_incidents i WHERE ${visibility(context)} ${filtersClause(filters)}),
    query AS (SELECT websearch_to_tsquery('english',${text.slice(0, 8000)}) AS terms),
    ranked AS (SELECT i.id,i.title,left(i.issue_summary,500) AS issue_summary,left(i.one_line_resolution,500) AS one_line_resolution,i.validation_status,i.review_status,i.root_cause_confidence,i.created_at,i.active_revision,
      COALESCE(exact.matches,0)::int AS exact_score,COALESCE(fulltext.score,0)::float AS text_score,COALESCE(exact.reasons,'[]'::jsonb) AS match_reasons,
      (SELECT count(*)::int FROM techdeck_resolution_warnings w WHERE w.tenant_id=i.tenant_id AND w.incident_id=i.id AND w.revision=i.active_revision) AS warning_count,
      (SELECT count(*)::int FROM techdeck_resolution_actions a WHERE a.tenant_id=i.tenant_id AND a.incident_id=i.id AND a.revision=i.active_revision AND a.kind='failed') AS failed_action_count
    FROM authorized i CROSS JOIN query
    LEFT JOIN LATERAL (SELECT count(*) AS matches,jsonb_agg(jsonb_build_object('kind',matched.kind,'value',matched.value)) AS reasons FROM (
      SELECT DISTINCT identifier.kind,left(identifier.original_value,200) AS value FROM techdeck_resolution_identifiers identifier
      WHERE identifier.tenant_id=i.tenant_id AND identifier.incident_id=i.id AND identifier.revision=i.active_revision AND (${exact})
      UNION ${portMatches}) matched) exact ON true
    LEFT JOIN LATERAL (SELECT max(ts_rank_cd(document.search_vector,query.terms)) AS score FROM techdeck_resolution_search_documents document
      WHERE document.tenant_id=i.tenant_id AND document.incident_id=i.id AND document.revision=i.active_revision AND document.search_vector@@query.terms) fulltext ON true)
    SELECT * FROM ranked WHERE exact_score>0 OR text_score>0 ORDER BY (exact_score>0) DESC,exact_score DESC,text_score DESC,created_at DESC,id DESC LIMIT ${filters.limit + 1} OFFSET ${offset}`);
  return { items: result.rows.slice(0, filters.limit), nextCursor: result.rows.length > filters.limit && offset + filters.limit <= 10_000 ? encodeCursor({ scope, offset: offset + filters.limit }) : null, ranking: 'exact_then_full_text_v1', embeddings: 'not_enabled', fullTextTruncated: text.length > 8000 };
}

export async function relatedResolutionIncidents(context: ResolutionContext, id: string) {
  if (!validId(id)) missing();
  await incident(context, id);
  const result = await db.execute(sql`WITH authorized AS MATERIALIZED (SELECT i.id,i.tenant_id,i.active_revision,i.title,i.validation_status,i.review_status,i.created_at FROM techdeck_resolution_incidents i WHERE ${visibility(context)}),
    source AS MATERIALIZED (SELECT identifier.kind,identifier.normalized_value FROM techdeck_resolution_identifiers identifier JOIN authorized source ON source.tenant_id=identifier.tenant_id AND source.id=identifier.incident_id AND source.active_revision=identifier.revision WHERE source.id=${id})
    SELECT i.id,i.title,i.validation_status,i.review_status,count(DISTINCT (identifier.kind,identifier.normalized_value))::int AS exact_score,
      jsonb_agg(DISTINCT jsonb_build_object('kind',identifier.kind,'value',left(identifier.original_value,200))) AS match_reasons
    FROM authorized i JOIN techdeck_resolution_identifiers identifier ON identifier.tenant_id=i.tenant_id AND identifier.incident_id=i.id AND identifier.revision=i.active_revision
    JOIN source ON source.kind=identifier.kind AND source.normalized_value=identifier.normalized_value WHERE i.id<>${id}
    GROUP BY i.id,i.title,i.validation_status,i.review_status,i.created_at ORDER BY exact_score DESC,i.created_at DESC,i.id DESC LIMIT 20`);
  return { items: result.rows };
}

export async function resolutionLinkOptions(context: ResolutionContext, query: Record<string, unknown>) {
  if (Object.keys(query).some(key => !['kind', 'q', 'clientId'].includes(key)) || typeof query.q !== 'string' && query.q !== undefined || String(query.q ?? '').length > 100 || query.clientId !== undefined && !validId(query.clientId)) throw new ResolutionInputError('RESOLUTION_QUERY_INVALID', 400);
  const pattern = `%${String(query.q ?? '').replace(/[\\%_]/g, '\\$&')}%`;
  const kind = query.kind;
  const select = kind === 'client' ? sql`SELECT id,name AS label FROM directory_organizations WHERE tenant_id=${context.tenantId} AND archived_at IS NULL AND status='active' AND name ILIKE ${pattern} ORDER BY name,id LIMIT 30`
    : kind === 'site' && query.clientId ? sql`SELECT id,name AS label FROM directory_sites WHERE tenant_id=${context.tenantId} AND organization_id=${query.clientId} AND archived_at IS NULL AND status='active' AND name ILIKE ${pattern} ORDER BY name,id LIMIT 30`
    : kind === 'asset' ? sql`SELECT id,name AS label FROM techdeck_assets WHERE tenant_id=${context.tenantId} AND deleted_at IS NULL AND name ILIKE ${pattern} ORDER BY name,id LIMIT 30`
    : kind === 'ticket' ? sql`SELECT id,title AS label FROM techdeck_tickets WHERE tenant_id=${context.tenantId} AND deleted_at IS NULL AND title ILIKE ${pattern} ORDER BY title,id LIMIT 30` : null;
  if (!select) throw new ResolutionInputError('RESOLUTION_QUERY_INVALID', 400);
  return { items: (await db.execute(select)).rows };
}
