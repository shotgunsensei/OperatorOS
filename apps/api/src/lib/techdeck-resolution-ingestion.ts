import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { resolutionStorageTables } from '../generated/techdeck-resolution-storage.js';
import { appendActivityEvent, beginIdempotentOperation, completeIdempotentOperation } from './shared-usage-activity.js';
import { normalizeResolutionExport, RESOLUTION_NORMALIZER_VERSION } from './techdeck-resolution-normalization.js';
import { RESOLUTION_REDACTOR_VERSION } from './techdeck-resolution-redaction.js';
import { ResolutionInputError, sha256, validateResolutionExport } from './techdeck-resolution-validation.js';

export type ResolutionContext = { tenantId: string; moduleId: string; actorUserId: string; role: 'member' | 'admin' | 'owner'; tokenId?: string; correlationId?: string };
export type ResolutionLinks = { directoryOrganizationId?: string; directorySiteId?: string; ticketId?: string; assets?: Array<{ index: number; assetId: string }> };
export type ResolutionInput = { rawText: string; humanReport: string | null; links: ResolutionLinks };
type Executor = Pick<typeof db, 'execute'>;
const storage = new Map(resolutionStorageTables.map(table => [table.name as string, table.columns as Record<string, string>]));
const ranks = { member: 0, admin: 1, owner: 2 };

export function parseResolutionInput(body: unknown, reprocess = false): ResolutionInput & { expectedVersion?: number } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ResolutionInputError('RESOLUTION_BODY_INVALID', 400);
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['rawText', 'humanReport', 'links', ...(reprocess ? ['expectedVersion'] : [])].includes(key))) throw new ResolutionInputError('RESOLUTION_FIELD_NOT_ALLOWED', 400);
  if (typeof input.rawText !== 'string' || (input.humanReport !== undefined && input.humanReport !== null && typeof input.humanReport !== 'string')) throw new ResolutionInputError('RESOLUTION_BODY_INVALID', 400);
  const rawLinks = input.links ?? {};
  if (!rawLinks || typeof rawLinks !== 'object' || Array.isArray(rawLinks)) throw new ResolutionInputError('RESOLUTION_LINKS_INVALID', 400);
  const links = rawLinks as Record<string, unknown>;
  if (Object.keys(links).some(key => !['directoryOrganizationId', 'directorySiteId', 'ticketId', 'assets'].includes(key))) throw new ResolutionInputError('RESOLUTION_FIELD_NOT_ALLOWED', 400);
  const validId = (id: unknown) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,36}$/.test(id);
  for (const key of ['directoryOrganizationId', 'directorySiteId', 'ticketId']) if (links[key] !== undefined && !validId(links[key])) throw new ResolutionInputError('RESOLUTION_LINKS_INVALID', 400);
  if (links.directorySiteId && !links.directoryOrganizationId) throw new ResolutionInputError('RESOLUTION_LINKS_INVALID', 400);
  if (links.assets !== undefined) {
    if (!Array.isArray(links.assets) || links.assets.length > 100) throw new ResolutionInputError('RESOLUTION_LINKS_INVALID', 400);
    const indices = new Set<number>();
    for (const asset of links.assets) {
      if (!asset || typeof asset !== 'object' || Object.keys(asset).some(key => !['index', 'assetId'].includes(key)) || !Number.isInteger(asset.index) || asset.index < 0 || asset.index >= 2000 || !validId(asset.assetId) || indices.has(asset.index)) throw new ResolutionInputError('RESOLUTION_LINKS_INVALID', 400);
      indices.add(asset.index);
    }
  }
  if (reprocess && (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1)) throw new ResolutionInputError('RESOLUTION_VERSION_REQUIRED', 400);
  return { rawText: input.rawText, humanReport: input.humanReport as string | null ?? null, links: rawLinks as ResolutionLinks, ...(reprocess ? { expectedVersion: Number(input.expectedVersion) } : {}) };
}
export function prepareResolutionImport(input: ResolutionInput) {
  const validated = validateResolutionExport(input.rawText, input.humanReport);
  const normalized = normalizeResolutionExport(validated.normalizedData);
  for (const link of input.links.assets ?? []) {
    const row = normalized.rows.find(row => row.table === 'incident_assets' && row.values.source_pointer === `/affected_assets/${link.index}`);
    if (!row) throw new ResolutionInputError('RESOLUTION_ASSET_MAPPING_INVALID', 422);
    row.values.asset_id = link.assetId;
  }
  return { ...validated, ...normalized, warnings: [...validated.warnings, ...normalized.warnings].slice(0, 100) };
}

export async function validateResolutionLinks(context: ResolutionContext, links: ResolutionLinks, executor: Executor = db) {
  const foreign = () => { throw new ResolutionInputError('RESOLUTION_REFERENCE_NOT_FOUND', 404); };
  if (links.directoryOrganizationId && !(await executor.execute(sql`SELECT id FROM directory_organizations WHERE tenant_id=${context.tenantId} AND id=${links.directoryOrganizationId} AND archived_at IS NULL AND status='active' FOR SHARE`)).rows[0]) foreign();
  if (links.directorySiteId && !(await executor.execute(sql`SELECT id FROM directory_sites WHERE tenant_id=${context.tenantId} AND organization_id=${links.directoryOrganizationId!} AND id=${links.directorySiteId} AND archived_at IS NULL AND status='active' FOR SHARE`)).rows[0]) foreign();
  if (links.ticketId && !(await executor.execute(sql`SELECT id FROM techdeck_tickets WHERE tenant_id=${context.tenantId} AND id=${links.ticketId} AND deleted_at IS NULL FOR SHARE`)).rows[0]) foreign();
  const assets = [...new Set((links.assets ?? []).map(link => link.assetId))];
  if (assets.length) {
    const result = await executor.execute(sql`SELECT id FROM techdeck_assets WHERE tenant_id=${context.tenantId} AND id IN (${sql.join(assets.map(id => sql`${id}`), sql`,`)}) AND deleted_at IS NULL FOR SHARE`);
    if (result.rows.length !== assets.length) foreign();
  }
}
function valuesSql(columns: Record<string, string>, key: string, value: unknown) {
  return columns[key].startsWith('JSONB') ? sql`${JSON.stringify(value)}::jsonb` : sql`${value}`;
}
async function insertRows(table: string, rows: Record<string, unknown>[], executor: Executor) {
  const name = `techdeck_resolution_${table}`, columns = storage.get(name);
  if (!columns || !rows.length) throw new Error('Invalid internal resolution table');
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  if (keys.some(key => !Object.hasOwn(columns, key))) throw new Error('Invalid internal resolution column');
  // Table and column identifiers come exclusively from the compiled storage manifest.
  for (let offset = 0; offset < rows.length; offset += 100) await executor.execute(sql`INSERT INTO ${sql.identifier(name)} (${sql.join(keys.map(key => sql.identifier(key)), sql`,`)}) VALUES ${sql.join(rows.slice(offset, offset + 100).map(row => sql`(${sql.join(keys.map(key => Object.hasOwn(row, key) ? valuesSql(columns, key, row[key]) : sql`DEFAULT`), sql`,`)})`), sql`,`)}`);
}
async function visibleIncident(context: ResolutionContext, id: string, executor: Executor) {
  const result = await executor.execute(sql`SELECT id,active_revision,version,minimum_role FROM techdeck_resolution_incidents WHERE tenant_id=${context.tenantId} AND id=${id} AND archived_at IS NULL FOR UPDATE`);
  const row = result.rows[0];
  if (!row || ranks[context.role] < ranks[row.minimum_role as keyof typeof ranks]) throw new ResolutionInputError('RESOLUTION_NOT_FOUND', 404);
  return row;
}
export async function importResolutionExport(context: ResolutionContext, input: ResolutionInput, idempotencyKey: string, reprocess?: { incidentId: string; expectedVersion: number }) {
  if (!/^[A-Za-z0-9_.:-]{8,160}$/.test(idempotencyKey)) throw new ResolutionInputError('RESOLUTION_IDEMPOTENCY_KEY_REQUIRED', 400);
  if (reprocess && ranks[context.role] < ranks.admin) throw new ResolutionInputError('RESOLUTION_ADMIN_REQUIRED', 403);
  const prepared = prepareResolutionImport(input); // All source checks precede persistence.
  return db.transaction(async tx => {
    // A bounded per-tenant transaction serializes duplicate/revision decisions across instances.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`techdeck-resolution:${context.tenantId}`},0))`);
    const current = reprocess ? await visibleIncident(context, reprocess.incidentId, tx) : null;
    await validateResolutionLinks(context, input.links, tx);
    const scope = `techdeck.resolution:${sha256(context.tokenId ? `service:${context.tokenId}` : `user:${context.actorUserId}`).slice(0, 32)}`;
    const operation = await beginIdempotentOperation({ tenantId: context.tenantId, moduleId: context.moduleId, scope, idempotencyKey,
      request: { rawSha256: prepared.rawSha256, humanSha256: input.humanReport === null ? null : sha256(input.humanReport), links: input.links, reprocess: reprocess ?? null } }, tx);
    if (operation.state === 'conflict') throw new ResolutionInputError('RESOLUTION_IDEMPOTENCY_CONFLICT', 409);
    if (operation.state === 'in_progress') throw new ResolutionInputError('RESOLUTION_IMPORT_IN_PROGRESS', 409);
    if (operation.state === 'replay') {
      const response = operation.responseJson as { incidentId: string };
      await visibleIncident(context, response.incidentId, tx); // Never replay a cached result across changed visibility/archive policy.
      return { ...response, replayed: true };
    }
    if (current && Number(current.version) !== reprocess!.expectedVersion) throw new ResolutionInputError('RESOLUTION_VERSION_CONFLICT', 409);
    const existing = await tx.execute(sql`SELECT raw.incident_id,raw.revision FROM techdeck_resolution_raw_exports raw WHERE raw.tenant_id=${context.tenantId} AND raw.fingerprint=${prepared.fingerprint} AND raw.normalizer_version=${RESOLUTION_NORMALIZER_VERSION}`);
    const duplicate = existing.rows[0];
    if (duplicate) {
      let incident;
      try { incident = await visibleIncident(context, String(duplicate.incident_id), tx); }
      catch { throw new ResolutionInputError('RESOLUTION_IMPORT_CONFLICT', 409); }
      if (Number(incident.active_revision) !== Number(duplicate.revision) || (reprocess && duplicate.incident_id !== reprocess.incidentId)) throw new ResolutionInputError('RESOLUTION_IMPORT_CONFLICT', 409);
      const response = { incidentId: String(incident.id), status: 'duplicate', activeRevision: Number(incident.active_revision), version: Number(incident.version), warnings: prepared.warnings, counts: prepared.counts, relationshipCount: prepared.counts.relationships ?? 0, embeddingState: 'not_enabled' };
      await completeIdempotentOperation({ tenantId: context.tenantId, id: operation.id, leaseExpiresAt: operation.leaseExpiresAt, responseStatus: 200, responseJson: response }, tx);
      return response;
    }
    const incidentId = reprocess?.incidentId ?? randomUUID(), revision = current ? Number(current.active_revision) + 1 : 1, version = current ? Number(current.version) + 1 : 1;
    if (!current) await insertRows('incidents', [{ id: incidentId, tenant_id: context.tenantId, created_by_user_id: context.actorUserId }], tx);
    await insertRows('raw_exports', [{ id: randomUUID(), tenant_id: context.tenantId, incident_id: incidentId, revision, schema_version: '1.0', source_type: context.tokenId ? 'api' : 'paste',
      raw_text: prepared.rawText, raw_sha256: prepared.rawSha256, fingerprint: prepared.fingerprint, normalizer_version: RESOLUTION_NORMALIZER_VERSION, redactor_version: RESOLUTION_REDACTOR_VERSION,
      human_report: prepared.humanReport, validation_report: { warnings: prepared.warnings, counts: prepared.counts }, security_screened: true, created_by_user_id: context.actorUserId }], tx);
    // The manifest orders dependencies. Batch by table instead of performing
    // per-observation SQL when device/identifier or component rows interleave.
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const row of prepared.rows) {
      const group = grouped.get(row.table) ?? [];
      group.push({ ...row.values, tenant_id: context.tenantId, incident_id: incidentId, revision, created_by_user_id: context.actorUserId });
      grouped.set(row.table, group);
    }
    for (const table of resolutionStorageTables) {
      const suffix = table.name.slice('techdeck_resolution_'.length), group = grouped.get(suffix);
      if (group) await insertRows(suffix, group, tx);
    }
    const fields = { ...prepared.incident, active_revision: revision, version, review_status: 'unreviewed', updated_by_user_id: context.actorUserId,
      // Reprocessing without new mappings retains the existing native links.
      ...(input.links.directoryOrganizationId ? { directory_organization_id: input.links.directoryOrganizationId, directory_site_id: input.links.directorySiteId ?? null } : {}),
      ...(input.links.ticketId ? { ticket_id: input.links.ticketId } : {}) };
    const columns = storage.get('techdeck_resolution_incidents')!;
    await tx.execute(sql`UPDATE techdeck_resolution_incidents SET ${sql.join(Object.entries(fields).map(([key, value]) => sql`${sql.identifier(key)}=${valuesSql(columns, key, value)}`), sql`,`)},updated_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${incidentId}`);
    await appendActivityEvent({ tenantId: context.tenantId, moduleId: context.moduleId, actorUserId: context.actorUserId, objectType: 'techdeck_resolution_incident', objectId: incidentId,
      eventType: reprocess ? 'techdeck.resolution.reprocessed' : 'techdeck.resolution.imported', summary: reprocess ? 'Resolution evidence reprocessed' : 'Resolution evidence imported',
      metadata: { revision, version, recordCount: prepared.rows.length, apiTokenId: context.tokenId ?? null }, correlationId: context.correlationId }, tx);
    const response = { incidentId, status: 'imported', activeRevision: revision, version, warnings: prepared.warnings, counts: prepared.counts, relationshipCount: prepared.counts.relationships ?? 0, embeddingState: 'not_enabled' };
    await completeIdempotentOperation({ tenantId: context.tenantId, id: operation.id, leaseExpiresAt: operation.leaseExpiresAt, responseStatus: 201, responseJson: response }, tx);
    return response;
  });
}
