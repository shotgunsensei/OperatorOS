import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { techdeckDocuments } from '../schema.js';
import type { ResolutionContext } from './techdeck-resolution-ingestion.js';
import { ResolutionInputError, sha256 } from './techdeck-resolution-validation.js';
import { appendActivityEvent, beginIdempotentOperation, completeIdempotentOperation } from './shared-usage-activity.js';
import { documentRoles, insertTechDeckDocumentRevision, resolutionDocumentReadable, resolutionDocumentCurrent } from './techdeck-document-policy.js';

const GENERATOR = 'evidence-draft-v1';
type Executor = Pick<typeof db, 'execute'>;
type Row = Record<string, unknown>;
type Kind = 'knowledge_base' | 'runbook';
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,36}$/.test(value);
const sections = [
  ['warnings', 'Warnings and safety', ['description', 'risk_level', 'claim_kind']],
  ['validations', 'Validation, including pending checks', ['kind', 'description', 'claim_kind']],
  ['quality_notes', 'Missing, conflicting and assumed information', ['kind', 'description']],
  ['side_effects', 'Side effects and recovery — association is not proof of causation', ['triggering_action_text', 'effect', 'severity', 'causal_status', 'recovery_action_text', 'recovered']],
  ['symptoms', 'Recorded symptoms', ['kind', 'description']],
  ['root_causes', 'Attributed root-cause claims', ['kind', 'summary', 'confidence', 'claim_kind']],
  ['actions', 'Observed attempts, including failures — not approved instructions', ['kind', 'action', 'purpose', 'actual_result', 'reason_failed', 'outcome', 'risk_level', 'destructive', 'requires_elevation']],
  ['changes', 'Recorded changes and rollback evidence', ['target', 'before_value', 'after_value', 'reason', 'reversible', 'rollback']],
  ['commands', 'Command evidence — never executed by this workspace', ['command_text', 'purpose', 'actual_result', 'successful', 'risk_level', 'destructive', 'requires_elevation']],
  ['evidence_links', 'Supporting observations', ['description', 'value_text', 'units', 'confidence']],
  ['followups', 'Follow-up work', ['action', 'priority', 'due_label']],
  ['escalation_conditions', 'Escalation conditions', ['description', 'target']],
  ['lessons', 'Source lessons', ['description']],
] as const;

function parseInput(input: unknown, create: boolean) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ResolutionInputError('RESOLUTION_BODY_INVALID', 400);
  const value = input as Row;
  if (Object.keys(value).some(key => !(create ? ['kind', 'expectedVersion', 'previewSha256', 'privacyReviewed'] : ['kind', 'expectedVersion']).includes(key))) throw new ResolutionInputError('RESOLUTION_FIELD_NOT_ALLOWED', 400);
  if (!['knowledge_base', 'runbook'].includes(String(value.kind)) || !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1) throw new ResolutionInputError('RESOLUTION_BODY_INVALID', 400);
  if (create && (value.privacyReviewed !== true || typeof value.previewSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.previewSha256))) throw new ResolutionInputError('RESOLUTION_DRAFT_REVIEW_REQUIRED', 400);
  return { kind: value.kind as Kind, expectedVersion: Number(value.expectedVersion), previewSha256: value.previewSha256 as string | undefined };
}

async function source(context: ResolutionContext, id: string, tx: Executor, lock = false) {
  if (!validId(id)) throw new ResolutionInputError('RESOLUTION_NOT_FOUND', 404);
  const result = await tx.execute(sql`SELECT id,title,issue_summary,resolution_summary,one_line_resolution,validation_status,root_cause_confidence,data_quality_confidence,minimum_role,active_revision,version,directory_organization_id,directory_site_id
    FROM techdeck_resolution_incidents WHERE tenant_id=${context.tenantId} AND id=${id} AND archived_at IS NULL AND active_revision IS NOT NULL
      AND minimum_role IN (${sql.join(documentRoles(context.role).map(role => sql`${role}`), sql`,`)}) ${lock ? sql`FOR UPDATE` : sql``}`);
  if (!result.rows[0]) throw new ResolutionInputError('RESOLUTION_NOT_FOUND', 404);
  return result.rows[0];
}

// Indented plain-text excerpts: source markup never becomes document instructions,
// links or HTML. Truncation is labelled, never silently promoted to a procedure.
function excerpt(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  const text = String(value).replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('<', '‹').replaceAll('>', '›').replaceAll('\u0000', '');
  return text.slice(0, 1200) + (text.length > 1200 ? ' [excerpt shortened; consult source]' : '');
}
export async function buildResolutionDraft(context: ResolutionContext, id: string, input: unknown, tx: Executor = db) {
  const parsed = parseInput(input, false);
  const incident = await source(context, id, tx, true);
  if (Number(incident.version) !== parsed.expectedVersion) throw new ResolutionInputError('RESOLUTION_VERSION_CONFLICT', 409);
  const lines = [
    `${parsed.kind === 'runbook' ? 'Runbook' : 'Knowledge base'} evidence draft`,
    'REVIEW REQUIRED — recorded observations are not an approved repair procedure.',
    `Source incident: ${id}; source revision: ${incident.active_revision}; incident version: ${incident.version}.`,
    `Generator: ${GENERATOR}. Internal tenant use only; audience must include source access.`,
    'Names, paths and customer details may remain. This draft is not de-identified and cannot be shared through the public library or compliance export.',
    'No AI inference, command execution or external fetch was performed. Review warnings, failed attempts and pending validation before reuse.',
    '', 'Source title:', `    ${excerpt(incident.title).replaceAll('\n', '\n    ')}`,
    '', 'Issue summary [source /issue/summary]:', `    ${excerpt(incident.issue_summary).replaceAll('\n', '\n    ')}`,
    '', `Current validation [source /current_status]: ${excerpt(incident.validation_status)}`,
    `Source root-cause confidence: ${excerpt(incident.root_cause_confidence)}; data quality: ${excerpt(incident.data_quality_confidence)}.`,
  ];
  let used = lines.join('\n').length;
  let abbreviated = false;
  const citations: Array<{ section: string; sourcePointer: string }> = [];
  for (const [section, title, fields] of sections) {
    const result = await tx.execute(sql`SELECT source_pointer,${sql.join(fields.map(field => sql.identifier(field)), sql`,`)}
      FROM ${sql.identifier(`techdeck_resolution_${section}`)} WHERE tenant_id=${context.tenantId} AND incident_id=${id} AND revision=${incident.active_revision}
      ORDER BY source_pointer COLLATE "C",id LIMIT 26`);
    lines.push('', title);
    if (!result.rows.length) lines.push('    Not recorded in normalized evidence. Review source before filling this gap.');
    for (const row of result.rows.slice(0, 25)) {
      const quote = `Source revision ${incident.active_revision} ${row.source_pointer}\n` + fields.map(field => `${field.replaceAll('_', ' ')}: ${excerpt(row[field])}`).join('\n');
      if (used + quote.length > 85_000) { abbreviated = true; break; }
      lines.push(...quote.split('\n').map(line => `    ${line}`), ''); used += quote.length + 100;
      citations.push({ section, sourcePointer: String(row.source_pointer) });
    }
    if (result.rows.length > 25) { abbreviated = true; lines.push('    More records are available in the source incident.'); }
  }
  lines.push('', 'Reported resolution [source /resolution] — does not override warnings or pending checks:', `    ${excerpt(incident.resolution_summary || incident.one_line_resolution).replaceAll('\n', '\n    ')}`);
  if (abbreviated) lines.push('', 'BOUNDED PREVIEW: some records were omitted. Consult the complete source before review or publication.');
  if (parsed.kind === 'runbook') lines.push('', 'Technician procedure review', 'Prerequisites and applicability: not independently established.', 'Execution approval: not granted by this draft.', 'Safe stopping conditions, validation and rollback: review the evidence above and fill any missing detail before approval.');
  const content = lines.join('\n');
  const title = `${parsed.kind === 'runbook' ? 'Runbook' : 'KB'} draft: ${String(incident.title ?? 'Untitled incident').replace(/[\r\n<>]/g, ' ').slice(0, 220)}`;
  const previewSha256 = sha256(JSON.stringify([GENERATOR, id, incident.active_revision, incident.version, incident.minimum_role, parsed.kind, title, content]));
  return { kind: parsed.kind, title, content, minimumRole: String(incident.minimum_role), sourceIncidentId: id, sourceRevision: Number(incident.active_revision), sourceVersion: Number(incident.version), previewSha256, abbreviated, citations, generator: GENERATOR };
}

export async function previewResolutionDraft(context: ResolutionContext, id: string, input: unknown) {
  if (context.role === 'viewer') throw new ResolutionInputError('RESOLUTION_WRITE_REQUIRED', 403);
  return db.transaction(tx => buildResolutionDraft(context, id, input, tx));
}

export async function createResolutionDraft(context: ResolutionContext, id: string, input: unknown, idempotencyKey: string) {
  if (context.role === 'viewer') throw new ResolutionInputError('RESOLUTION_WRITE_REQUIRED', 403);
  const parsed = parseInput(input, true);
  if (!/^[A-Za-z0-9_.:-]{8,160}$/.test(idempotencyKey)) throw new ResolutionInputError('RESOLUTION_IDEMPOTENCY_KEY_REQUIRED', 400);
  return db.transaction(async tx => {
    const incident = await source(context, id, tx, true);
    const operation = await beginIdempotentOperation({ tenantId: context.tenantId, moduleId: context.moduleId,
      scope: `techdeck.resolution.draft:${sha256(context.actorUserId).slice(0, 32)}`, idempotencyKey, request: { id, ...parsed } }, tx);
    if (operation.state === 'conflict') throw new ResolutionInputError('RESOLUTION_IDEMPOTENCY_CONFLICT', 409);
    if (operation.state === 'in_progress') throw new ResolutionInputError('RESOLUTION_IMPORT_IN_PROGRESS', 409);
    if (operation.state === 'replay') {
      const saved = operation.responseJson as { documentId: string };
      const readable = await tx.execute(sql`SELECT id FROM techdeck_documents d WHERE d.tenant_id=${context.tenantId} AND d.id=${saved.documentId} AND d.archived_at IS NULL
        AND d.minimum_role IN (${sql.join(documentRoles(context.role).map(role => sql`${role}`), sql`,`)}) AND ${resolutionDocumentReadable(context, sql`d.id`)}`);
      if (!readable.rows[0]) throw new ResolutionInputError('RESOLUTION_NOT_FOUND', 404);
      return { ...saved, replayed: true };
    }
    const preview = await buildResolutionDraft(context, id, { kind: parsed.kind, expectedVersion: parsed.expectedVersion }, tx);
    if (preview.previewSha256 !== parsed.previewSha256) throw new ResolutionInputError('RESOLUTION_DRAFT_PREVIEW_CHANGED', 409);
    // The source row lock serializes dedupe across actors and idempotency keys.
    const existing = await tx.execute(sql`SELECT l.document_id FROM techdeck_resolution_document_links l WHERE l.tenant_id=${context.tenantId} AND l.incident_id=${id} AND l.revision=${incident.active_revision} AND l.kind=${parsed.kind} ORDER BY l.created_at,l.id LIMIT 1`);
    let documentId = existing.rows[0]?.document_id as string | undefined;
    if (documentId) {
      const visible = await tx.execute(sql`SELECT id FROM techdeck_documents d WHERE d.tenant_id=${context.tenantId} AND d.id=${documentId} AND d.archived_at IS NULL
        AND d.minimum_role IN (${sql.join(documentRoles(context.role).map(role => sql`${role}`), sql`,`)}) AND ${resolutionDocumentReadable(context, sql`d.id`)}`);
      if (!visible.rows[0]) throw new ResolutionInputError('RESOLUTION_DRAFT_UNAVAILABLE', 409);
    } else {
      documentId = randomUUID();
      const [document] = await tx.insert(techdeckDocuments).values({ id: documentId, tenantId: context.tenantId,
        directoryOrganizationId: incident.directory_organization_id as string | null, directorySiteId: incident.directory_site_id as string | null,
        pageType: parsed.kind, title: preview.title, slug: `resolution-${documentId}`, summary: 'Evidence-derived draft. Review source warnings, failed attempts and pending validation before reuse.',
        content: preview.content, minimumRole: preview.minimumRole, status: 'draft', tags: ['resolution-evidence'], createdByUserId: context.actorUserId, updatedByUserId: context.actorUserId }).returning();
      await insertTechDeckDocumentRevision(tx, document, context.actorUserId, `Evidence draft from incident ${id}, source revision ${incident.active_revision}`);
      await tx.execute(sql`INSERT INTO techdeck_resolution_document_links(tenant_id,incident_id,revision,source_pointer,document_id,document_version,kind,created_by_user_id)
        VALUES (${context.tenantId},${id},${incident.active_revision},'',${documentId},1,${parsed.kind},${context.actorUserId})`);
      await appendActivityEvent({ tenantId: context.tenantId, moduleId: context.moduleId, actorUserId: context.actorUserId, objectType: 'techdeck_document', objectId: documentId,
        eventType: 'techdeck.resolution.document_drafted', summary: 'Evidence-derived document draft created', metadata: { incidentId: id, sourceRevision: incident.active_revision, kind: parsed.kind, generator: GENERATOR, previewSha256: preview.previewSha256 }, correlationId: context.correlationId }, tx);
    }
    const response = { documentId, sourceIncidentId: id, sourceRevision: Number(incident.active_revision), existing: Boolean(existing.rows[0]) };
    await completeIdempotentOperation({ tenantId: context.tenantId, id: operation.id, leaseExpiresAt: operation.leaseExpiresAt, responseStatus: existing.rows[0] ? 200 : 201, responseJson: response }, tx);
    return response;
  });
}

export async function listResolutionDocuments(context: ResolutionContext, query: Row) {
  if (Object.keys(query).some(key => !['incidentId', 'limit', 'cursor'].includes(key)) || query.incidentId !== undefined && !validId(query.incidentId)) throw new ResolutionInputError('RESOLUTION_QUERY_INVALID', 400);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || query.cursor !== undefined && !validId(query.cursor)) throw new ResolutionInputError('RESOLUTION_QUERY_INVALID', 400);
  if (query.incidentId) await source(context, String(query.incidentId), db);
  const result = await db.execute(sql`SELECT d.id,d.title,d.page_type,d.status,d.minimum_role,d.version,d.updated_at,
    ${resolutionDocumentCurrent(context.tenantId, sql`d.id`)} AS source_current,
    (SELECT jsonb_agg(jsonb_build_object('incidentId',l.incident_id,'sourceRevision',l.revision,'documentVersion',l.document_version,'currentRevision',i.active_revision) ORDER BY l.incident_id,l.revision)
      FROM techdeck_resolution_document_links l JOIN techdeck_resolution_incidents i ON i.tenant_id=l.tenant_id AND i.id=l.incident_id WHERE l.tenant_id=d.tenant_id AND l.document_id=d.id) AS sources
    FROM techdeck_documents d WHERE d.tenant_id=${context.tenantId} AND d.archived_at IS NULL
      AND d.minimum_role IN (${sql.join(documentRoles(context.role).map(role => sql`${role}`), sql`,`)}) AND ${resolutionDocumentReadable(context, sql`d.id`)}
      AND EXISTS (SELECT 1 FROM techdeck_resolution_document_links l WHERE l.tenant_id=d.tenant_id AND l.document_id=d.id ${query.incidentId ? sql`AND l.incident_id=${query.incidentId}` : sql``})
      ${query.cursor ? sql`AND d.id>${query.cursor}` : sql``} ORDER BY d.id LIMIT ${limit + 1}`);
  return { items: result.rows.slice(0, limit), nextCursor: result.rows.length > limit ? result.rows[limit - 1].id : null };
}

/** Add another incident to an existing internal draft without claiming it proves
 * the draft's guidance. Both source and document versions are explicit. */
export async function linkResolutionDocument(context: ResolutionContext, id: string, input: unknown) {
  if (context.role === 'viewer') throw new ResolutionInputError('RESOLUTION_WRITE_REQUIRED', 403);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ResolutionInputError('RESOLUTION_BODY_INVALID', 400);
  const value = input as Row;
  if (Object.keys(value).some(key => !['documentId', 'expectedVersion', 'expectedDocumentVersion'].includes(key)) || !validId(value.documentId)
    || !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1 || !Number.isSafeInteger(value.expectedDocumentVersion) || Number(value.expectedDocumentVersion) < 1) throw new ResolutionInputError('RESOLUTION_BODY_INVALID', 400);
  return db.transaction(async tx => {
    const incident = await source(context, id, tx, true);
    const result = await tx.execute(sql`SELECT * FROM techdeck_documents d WHERE d.tenant_id=${context.tenantId} AND d.id=${value.documentId} AND d.archived_at IS NULL
      AND d.minimum_role IN (${sql.join(documentRoles(context.role).map(role => sql`${role}`), sql`,`)}) AND ${resolutionDocumentReadable(context, sql`d.id`)} FOR UPDATE`);
    const document = result.rows[0];
    if (!document) throw new ResolutionInputError('RESOLUTION_NOT_FOUND', 404);
    const prior = await tx.execute(sql`SELECT id FROM techdeck_resolution_document_links WHERE tenant_id=${context.tenantId} AND incident_id=${id} AND revision=${incident.active_revision} AND document_id=${document.id}`);
    if (prior.rows[0]) return { documentId: document.id, existing: true };
    if (Number(incident.version) !== value.expectedVersion || Number(document.version) !== value.expectedDocumentVersion || document.status !== 'draft') throw new ResolutionInputError('RESOLUTION_VERSION_CONFLICT', 409);
    if (!['knowledge_base', 'runbook'].includes(String(document.page_type)) || !documentRoles(String(document.minimum_role)).includes(String(incident.minimum_role))) throw new ResolutionInputError('RESOLUTION_DRAFT_AUDIENCE_MISMATCH', 403);
    const content = `${document.content}\n\nAdditional source reference — not verification of this guidance:\nIncident ${id}; source revision ${incident.active_revision}. Review its warnings, failures and pending validation before reuse.\n`;
    if (content.length > 100000) throw new ResolutionInputError('RESOLUTION_TOO_LARGE', 413);
    const updated = await tx.execute(sql`UPDATE techdeck_documents SET content=${content},version=version+1,updated_by_user_id=${context.actorUserId},updated_at=NOW()
      WHERE tenant_id=${context.tenantId} AND id=${document.id} RETURNING version`);
    const version = Number(updated.rows[0].version);
    await tx.execute(sql`INSERT INTO techdeck_document_revisions(tenant_id,document_id,version,title,summary,content,status,minimum_role,tags,change_note,created_by_user_id)
      VALUES (${context.tenantId},${document.id},${version},${document.title},${document.summary},${content},'draft',${document.minimum_role},${JSON.stringify(document.tags)}::jsonb,'Additional incident source linked',${context.actorUserId})`);
    await tx.execute(sql`INSERT INTO techdeck_resolution_document_links(tenant_id,incident_id,revision,source_pointer,document_id,document_version,kind,created_by_user_id)
      VALUES (${context.tenantId},${id},${incident.active_revision},'',${document.id},${version},${document.page_type},${context.actorUserId})`);
    await appendActivityEvent({ tenantId: context.tenantId, moduleId: context.moduleId, actorUserId: context.actorUserId, objectType: 'techdeck_document', objectId: String(document.id), eventType: 'techdeck.resolution.document_linked', summary: 'Additional incident linked to document draft', metadata: { incidentId: id, sourceRevision: incident.active_revision, documentVersion: version }, correlationId: context.correlationId }, tx);
    return { documentId: document.id, version, existing: false };
  });
}
