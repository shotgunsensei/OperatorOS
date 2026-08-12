import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  createAttachment,
  getAttachmentContent,
  listAttachments,
} from '../lib/shared-attachments.js';
import {
  CASE_STATUSES,
  createCustodyHash,
  csvCell,
  parseCaseInput,
  parseCasePatch,
  parseCommentInput,
  parseDecisionInput,
  parseEvidenceInput,
  parseFindingInput,
  parseListQuery,
  parseRetentionInput,
  sha256Json,
  SnapProofValidationError,
} from '../lib/snapproofos.js';
import { buildSnapProofMigrationPlan } from '../lib/snapproofos-import.js';
import {
  requireTenantAdmin,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import { appendActivityEvent } from '../lib/shared-usage-activity.js';

const readGuards = [requireTenantModuleAccess('snapproofos')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const adminGuards = [...writeGuards, requireTenantAdmin];
const base = '/v1/modules/snapproofos';
type Executor = Pick<typeof db, 'execute'>;
type Context = { tenantId: string };
type User = { id: string };

function validation(reply: FastifyReply, error: unknown) {
  if (!(error instanceof SnapProofValidationError)) return false;
  reply.code(400).send({ error: error.message, code: error.code });
  return true;
}

function notFound(reply: FastifyReply, entity: string) {
  return reply.code(404).send({
    error: `${entity} not found`,
    code: `SNAPPROOF_${entity.toUpperCase().replaceAll(' ', '_')}_NOT_FOUND`,
  });
}

function conflict(reply: FastifyReply, error: string, code = 'SNAPPROOF_VERSION_CONFLICT') {
  return reply.code(409).send({ error, code });
}

function camelKey(key: string) {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function safeRow(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row)
    .filter(([key]) => !['tenant_id', 'deleted_at'].includes(key))
    .map(([key, value]) => [camelKey(key), value]));
}

async function moduleId(executor: Executor = db): Promise<string> {
  const result = await executor.execute(sql`SELECT id FROM modules WHERE slug='snapproofos' LIMIT 1`);
  const id = result.rows[0]?.id;
  if (!id) throw Object.assign(new Error('SnapProofOS module registry is unavailable'), { code: 'SNAPPROOF_MODULE_UNAVAILABLE' });
  return String(id);
}

async function scopedCase(tenantId: string, caseId: string, executor: Executor = db, lock = false) {
  const result = await executor.execute(sql`
    SELECT * FROM snapproof_cases
    WHERE tenant_id=${tenantId} AND id=${caseId} AND deleted_at IS NULL
    LIMIT 1
    ${lock ? sql`FOR UPDATE` : sql``}
  `);
  return result.rows[0] as Record<string, any> | undefined;
}

async function scopedEvidence(tenantId: string, evidenceId: string, executor: Executor = db) {
  const result = await executor.execute(sql`
    SELECT * FROM snapproof_evidence_items
    WHERE tenant_id=${tenantId} AND id=${evidenceId} AND deleted_at IS NULL
    LIMIT 1
  `);
  return result.rows[0] as Record<string, any> | undefined;
}

async function appendCustody(input: {
  tenantId: string;
  caseId: string;
  evidenceId?: string | null;
  actorUserId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
}, executor: Executor) {
  const evidenceId = input.evidenceId ?? null;
  const currentCase = await scopedCase(input.tenantId, input.caseId, executor, true);
  if (!currentCase) throw Object.assign(new Error('Case not found'), { code: 'SNAPPROOF_CASE_NOT_FOUND' });
  const latest = await executor.execute(sql`
    SELECT sequence_number,event_hash
    FROM snapproof_custody_events
    WHERE tenant_id=${input.tenantId} AND case_id=${input.caseId}
    ORDER BY sequence_number DESC LIMIT 1
  `);
  const previous = latest.rows[0] as Record<string, unknown> | undefined;
  const sequenceNumber = Number(previous?.sequence_number ?? 0) + 1;
  const previousHash = previous ? String(previous.event_hash) : null;
  const createdAt = new Date();
  const eventHash = createCustodyHash({
    tenantId: input.tenantId,
    caseId: input.caseId,
    evidenceId,
    actorUserId: input.actorUserId,
    sequenceNumber,
    eventType: input.eventType,
    previousHash,
    payload: input.payload,
    createdAt: createdAt.toISOString(),
  });
  const result = await executor.execute(sql`
    INSERT INTO snapproof_custody_events (
      tenant_id,case_id,evidence_id,actor_user_id,sequence_number,event_type,
      previous_hash,event_hash,payload,created_at
    ) VALUES (
      ${input.tenantId},${input.caseId},${evidenceId},${input.actorUserId},
      ${sequenceNumber},${input.eventType},${previousHash},${eventHash},
      ${JSON.stringify(input.payload)}::jsonb,${createdAt}
    )
    RETURNING *
  `);
  return result.rows[0] as Record<string, unknown>;
}

async function assertEvidenceBelongsToCase(tenantId: string, caseId: string, evidenceId: string | null) {
  if (!evidenceId) return true;
  const result = await db.execute(sql`
    SELECT 1 FROM snapproof_evidence_items
    WHERE tenant_id=${tenantId} AND case_id=${caseId} AND id=${evidenceId} AND deleted_at IS NULL
    LIMIT 1
  `);
  return result.rows.length === 1;
}

function attachmentError(reply: FastifyReply, error: any) {
  const code = String(error?.code ?? '');
  if (!code.startsWith('ATTACHMENT_')) return false;
  const status = ['ATTACHMENT_SCAN_PENDING', 'ATTACHMENT_QUARANTINED', 'ATTACHMENT_INTEGRITY_FAILED']
    .includes(code) ? 409 : 422;
  reply.code(status).send({ error: error.message, code });
  return true;
}

export async function registerSnapProofOsRoutes(app: FastifyInstance): Promise<void> {
  app.get(`${base}/dashboard`, { preHandler: readGuards }, async request => {
    const { tenantId } = (request as any).tenantContext as Context;
    const result = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM snapproof_cases WHERE tenant_id=${tenantId} AND deleted_at IS NULL) AS cases,
        (SELECT COUNT(*)::int FROM snapproof_evidence_items WHERE tenant_id=${tenantId} AND deleted_at IS NULL) AS evidence,
        (SELECT COUNT(*)::int FROM snapproof_evidence_items WHERE tenant_id=${tenantId} AND status='in_review' AND deleted_at IS NULL) AS evidence_in_review,
        (SELECT COUNT(*)::int FROM snapproof_findings WHERE tenant_id=${tenantId} AND status='open' AND deleted_at IS NULL) AS open_findings,
        (SELECT COUNT(*)::int FROM snapproof_reports WHERE tenant_id=${tenantId} AND status='approved') AS approved_reports,
        (SELECT COUNT(*)::int FROM snapproof_customers WHERE tenant_id=${tenantId} AND archived_at IS NULL) AS customers,
        (SELECT COUNT(*)::int FROM snapproof_cases WHERE tenant_id=${tenantId} AND job_status='in_progress' AND deleted_at IS NULL) AS active_jobs,
        (SELECT COUNT(*)::int FROM snapproof_cases WHERE tenant_id=${tenantId} AND job_status<>'archived' AND due_at<NOW() AND deleted_at IS NULL) AS overdue_jobs,
        (SELECT COALESCE(SUM(quantity*unit_price_cents),0)::bigint FROM snapproof_parts WHERE tenant_id=${tenantId} AND deleted_at IS NULL) AS parts_revenue_cents,
        (SELECT COALESCE(SUM(hours*rate_cents),0)::bigint FROM snapproof_labor WHERE tenant_id=${tenantId} AND deleted_at IS NULL) AS labor_revenue_cents,
        (SELECT COUNT(*)::int FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=(SELECT id FROM modules WHERE slug='snapproofos' LIMIT 1) AND created_at>=NOW()-INTERVAL '7 days') AS recent_activity
    `);
    return { counts: safeRow(result.rows[0] as Record<string, unknown>) };
  });

  app.get(`${base}/cases`, { preHandler: readGuards }, async (request, reply) => {
    let query;
    try { query = parseListQuery(request.query); } catch (error) { if (validation(reply, error)) return; throw error; }
    if (query.status && !CASE_STATUSES.includes(query.status as any)) {
      return reply.code(400).send({ error: 'Invalid case status', code: 'SNAPPROOF_VALIDATION_FAILED' });
    }
    const { tenantId } = (request as any).tenantContext as Context;
    const search = query.search ? `%${query.search}%` : null;
    const result = await db.execute(sql`
      SELECT c.*,
        (SELECT COUNT(*)::int FROM snapproof_evidence_items e
          WHERE e.tenant_id=c.tenant_id AND e.case_id=c.id AND e.deleted_at IS NULL) AS evidence_count,
        COUNT(*) OVER()::int AS total_count
      FROM snapproof_cases c
      WHERE c.tenant_id=${tenantId} AND c.deleted_at IS NULL
        AND (${query.status}::text IS NULL OR c.status=${query.status})
        AND (${search}::text IS NULL OR c.title ILIKE ${search} OR c.reference ILIKE ${search})
      ORDER BY c.updated_at DESC,c.id DESC
      LIMIT ${query.limit} OFFSET ${query.offset}
    `);
    const total = Number(result.rows[0]?.total_count ?? 0);
    return { items: result.rows.map(row => safeRow(row as Record<string, unknown>)), total, limit: query.limit, offset: query.offset };
  });

  app.post(`${base}/cases`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parseCaseInput(request.body); } catch (error) { if (validation(reply, error)) return; throw error; }
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    try {
      const row = await db.transaction(async tx => {
        const settings = await tx.execute(sql`
          INSERT INTO snapproof_settings(tenant_id,updated_by_user_id)
          VALUES (${tenantId},${user.id}) ON CONFLICT (tenant_id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id
          RETURNING default_retention_days
        `);
        const retentionDays = Number(settings.rows[0]?.default_retention_days ?? 2555);
        const retentionUntil = new Date(Date.now() + retentionDays * 86_400_000);
        const created = await tx.execute(sql`
          INSERT INTO snapproof_cases (
            tenant_id,created_by_user_id,assigned_to_user_id,reference,title,description,
            case_type,source_context,retention_until
          ) VALUES (
            ${tenantId},${user.id},${input.assignedToUserId},${input.reference},${input.title},
            ${input.description},${input.caseType},${JSON.stringify(input.sourceContext)}::jsonb,${retentionUntil}
          ) RETURNING *
        `);
        const value = created.rows[0] as Record<string, any>;
        await appendCustody({
          tenantId, caseId: String(value.id), actorUserId: user.id,
          eventType: 'case_created', payload: { reference: input.reference, title: input.title, caseType: input.caseType },
        }, tx);
        await appendActivityEvent({
          tenantId, moduleId: await moduleId(tx), actorUserId: user.id,
          objectType: 'snapproof_case', objectId: String(value.id), eventType: 'created',
          summary: `Created evidence case ${input.reference}`, metadata: { status: 'draft' },
        }, tx);
        return value;
      });
      return reply.code(201).send(safeRow(row));
    } catch (error: any) {
      if (error?.code === '23505') return conflict(reply, 'Case reference already exists', 'SNAPPROOF_CASE_REFERENCE_CONFLICT');
      throw error;
    }
  });

  app.get(`${base}/cases/:id`, { preHandler: readGuards }, async (request, reply) => {
    const { tenantId } = (request as any).tenantContext as Context;
    const id = (request.params as any).id;
    const row = await scopedCase(tenantId, id);
    if (!row) return notFound(reply, 'case');
    const [evidence, findings, comments, reports, attachments] = await Promise.all([
      db.execute(sql`SELECT * FROM snapproof_evidence_items WHERE tenant_id=${tenantId} AND case_id=${id} AND deleted_at IS NULL ORDER BY created_at DESC`),
      db.execute(sql`SELECT * FROM snapproof_findings WHERE tenant_id=${tenantId} AND case_id=${id} AND deleted_at IS NULL ORDER BY created_at DESC`),
      db.execute(sql`SELECT * FROM snapproof_comments WHERE tenant_id=${tenantId} AND case_id=${id} ORDER BY created_at,id`),
      db.execute(sql`SELECT * FROM snapproof_reports WHERE tenant_id=${tenantId} AND case_id=${id} ORDER BY created_at DESC`),
      listAttachments({ tenantId, moduleId: await moduleId(), objectType: 'snapproof_evidence', objectId: id, limit: 100 }),
    ]);
    return {
      case: safeRow(row),
      evidence: evidence.rows.map(value => safeRow(value as Record<string, unknown>)),
      findings: findings.rows.map(value => safeRow(value as Record<string, unknown>)),
      comments: comments.rows.map(value => safeRow(value as Record<string, unknown>)),
      reports: reports.rows.map(value => safeRow(value as Record<string, unknown>)),
      attachments,
    };
  });

  app.patch(`${base}/cases/:id`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parseCasePatch(request.body); } catch (error) { if (validation(reply, error)) return; throw error; }
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const caseId = (request.params as any).id;
    const current = await scopedCase(tenantId, caseId);
    if (!current) return notFound(reply, 'case');
    if (!['draft', 'collecting', 'rejected'].includes(current.status)) return conflict(reply, 'Case cannot be edited in its current state', 'SNAPPROOF_CASE_STATE_CONFLICT');
    const changes = input.changes;
    const result = await db.transaction(async tx => {
      const updated = await tx.execute(sql`
        UPDATE snapproof_cases SET
          title=COALESCE(${changes.title as string | null | undefined},title),
          description=CASE WHEN ${'description' in changes} THEN ${changes.description as string | null} ELSE description END,
          case_type=COALESCE(${changes.caseType as string | null | undefined},case_type),
          source_context=CASE WHEN ${'sourceContext' in changes} THEN ${JSON.stringify(changes.sourceContext ?? {})}::jsonb ELSE source_context END,
          assigned_to_user_id=CASE WHEN ${'assignedToUserId' in changes} THEN ${changes.assignedToUserId as string | null} ELSE assigned_to_user_id END,
          version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${caseId} AND version=${input.expectedVersion} AND deleted_at IS NULL
        RETURNING *
      `);
      const row = updated.rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      await appendCustody({ tenantId, caseId, actorUserId: user.id, eventType: 'case_updated', payload: { fields: Object.keys(changes) } }, tx);
      return row;
    });
    return result ? safeRow(result) : conflict(reply, 'Case changed; reload before saving');
  });

  app.post(`${base}/cases/:id/submit`, { preHandler: writeGuards }, async (request, reply) => {
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const caseId = (request.params as any).id;
    const row = await db.transaction(async tx => {
      const countResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS count FROM snapproof_evidence_items
        WHERE tenant_id=${tenantId} AND case_id=${caseId} AND deleted_at IS NULL
      `);
      if (Number(countResult.rows[0]?.count ?? 0) === 0) return 'empty';
      const updated = await tx.execute(sql`
        UPDATE snapproof_cases SET status='in_review',version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${caseId} AND status IN ('draft','collecting','rejected') AND deleted_at IS NULL
        RETURNING *
      `);
      if (!updated.rows[0]) return null;
      await appendCustody({ tenantId, caseId, actorUserId: user.id, eventType: 'case_submitted', payload: {} }, tx);
      return updated.rows[0] as Record<string, unknown>;
    });
    if (row === 'empty') return conflict(reply, 'At least one evidence item is required', 'SNAPPROOF_CASE_EVIDENCE_REQUIRED');
    return row ? safeRow(row) : conflict(reply, 'Case is not eligible for review', 'SNAPPROOF_CASE_STATE_CONFLICT');
  });

  app.post(`${base}/cases/:id/decision`, { preHandler: adminGuards }, async (request, reply) => {
    let input;
    try { input = parseDecisionInput(request.body); } catch (error) { if (validation(reply, error)) return; throw error; }
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const caseId = (request.params as any).id;
    if (input.decision === 'approve') {
      const pending = await db.execute(sql`
        SELECT COUNT(*)::int AS count FROM snapproof_evidence_items
        WHERE tenant_id=${tenantId} AND case_id=${caseId} AND deleted_at IS NULL AND status<>'verified'
      `);
      if (Number(pending.rows[0]?.count ?? 0) > 0) {
        return conflict(reply, 'Every evidence item must be verified before case approval', 'SNAPPROOF_UNVERIFIED_EVIDENCE');
      }
    }
    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    const eventType = input.decision === 'approve' ? 'case_approved' : 'case_rejected';
    const row = await db.transaction(async tx => {
      const updated = await tx.execute(sql`
        UPDATE snapproof_cases SET status=${status},version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${caseId} AND status='in_review'
          AND version=${input.expectedVersion} AND deleted_at IS NULL
        RETURNING *
      `);
      if (!updated.rows[0]) return null;
      await appendCustody({ tenantId, caseId, actorUserId: user.id, eventType, payload: { reason: input.reason } }, tx);
      return updated.rows[0] as Record<string, unknown>;
    });
    return row ? safeRow(row) : conflict(reply, 'Case review state or version changed');
  });

  app.post(`${base}/cases/:id/evidence`, {
    preHandler: writeGuards,
    bodyLimit: 35_000_000,
  }, async (request, reply) => {
    let input;
    try { input = parseEvidenceInput(request.body); } catch (error) { if (validation(reply, error)) return; throw error; }
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const caseId = (request.params as any).id;
    const currentCase = await scopedCase(tenantId, caseId);
    if (!currentCase) return notFound(reply, 'case');
    if (!['draft', 'collecting', 'rejected'].includes(currentCase.status)) {
      return conflict(reply, 'Evidence cannot be added in the current case state', 'SNAPPROOF_CASE_STATE_CONFLICT');
    }
    try {
      const row = await db.transaction(async tx => {
        const evidenceId = randomUUID();
        const module = await moduleId(tx);
        const attachment = input.content ? await createAttachment({
          tenantId,
          moduleId: module,
          objectType: 'snapproof_evidence',
          objectId: caseId,
          originalName: input.originalName!,
          declaredMimeType: input.declaredMimeType,
          content: input.content,
          createdByUserId: user.id,
          retentionUntil: currentCase.retention_until ? new Date(currentCase.retention_until) : null,
          correlationId: request.id,
        }, tx) : null;
        const inserted = await tx.execute(sql`
          INSERT INTO snapproof_evidence_items (
            id,tenant_id,case_id,created_by_user_id,attachment_id,title,evidence_type,
            description,captured_at,source_type,source_reference,capture_context,attachment_sha256
          ) VALUES (
            ${evidenceId},${tenantId},${caseId},${user.id},${attachment?.id ?? null},
            ${input.title},${input.evidenceType},${input.description},${input.capturedAt},
            ${input.sourceType},${input.sourceReference},${JSON.stringify(input.captureContext)}::jsonb,
            ${attachment?.sha256 ?? null}
          ) RETURNING *
        `);
        await tx.execute(sql`
          UPDATE snapproof_cases SET status='collecting',version=version+1,updated_at=NOW()
          WHERE tenant_id=${tenantId} AND id=${caseId} AND status IN ('draft','rejected')
        `);
        await appendCustody({
          tenantId, caseId, evidenceId, actorUserId: user.id, eventType: 'evidence_captured',
          payload: {
            title: input.title, evidenceType: input.evidenceType, capturedAt: input.capturedAt.toISOString(),
            sourceType: input.sourceType, attachmentSha256: attachment?.sha256 ?? null,
          },
        }, tx);
        await appendActivityEvent({
          tenantId, moduleId: module, actorUserId: user.id, objectType: 'snapproof_evidence',
          objectId: evidenceId, eventType: 'captured', summary: `Captured ${input.evidenceType} evidence`,
          metadata: { caseId, hasAttachment: !!attachment },
        }, tx);
        return inserted.rows[0] as Record<string, unknown>;
      });
      return reply.code(201).send(safeRow(row));
    } catch (error) {
      if (attachmentError(reply, error)) return;
      throw error;
    }
  });

  app.get(`${base}/evidence`, { preHandler: readGuards }, async (request, reply) => {
    let query;
    try { query = parseListQuery(request.query); } catch (error) { if (validation(reply, error)) return; throw error; }
    const { tenantId } = (request as any).tenantContext as Context;
    const search = query.search ? `%${query.search}%` : null;
    const result = await db.execute(sql`
      SELECT e.*,c.reference AS case_reference,c.title AS case_title,COUNT(*) OVER()::int AS total_count
      FROM snapproof_evidence_items e JOIN snapproof_cases c
        ON c.tenant_id=e.tenant_id AND c.id=e.case_id
      WHERE e.tenant_id=${tenantId} AND e.deleted_at IS NULL AND c.deleted_at IS NULL
        AND (${query.status}::text IS NULL OR e.status=${query.status})
        AND (${search}::text IS NULL OR e.title ILIKE ${search} OR c.reference ILIKE ${search})
      ORDER BY e.updated_at DESC,e.id DESC LIMIT ${query.limit} OFFSET ${query.offset}
    `);
    return {
      items: result.rows.map(row => safeRow(row as Record<string, unknown>)),
      total: Number(result.rows[0]?.total_count ?? 0), limit: query.limit, offset: query.offset,
    };
  });

  app.get(`${base}/evidence/:id`, { preHandler: readGuards }, async (request, reply) => {
    const { tenantId } = (request as any).tenantContext as Context;
    const row = await scopedEvidence(tenantId, (request.params as any).id);
    return row ? { evidence: safeRow(row) } : notFound(reply, 'evidence');
  });

  app.post(`${base}/evidence/:id/submit`, { preHandler: writeGuards }, async (request, reply) => {
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const evidenceId = (request.params as any).id;
    const row = await db.transaction(async tx => {
      const updated = await tx.execute(sql`
        UPDATE snapproof_evidence_items SET status='in_review',version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${evidenceId} AND status IN ('captured','rejected') AND deleted_at IS NULL
        RETURNING *
      `);
      const value = updated.rows[0] as Record<string, any> | undefined;
      if (!value) return null;
      await appendCustody({ tenantId, caseId: String(value.case_id), evidenceId, actorUserId: user.id, eventType: 'evidence_submitted', payload: {} }, tx);
      return value;
    });
    return row ? safeRow(row) : conflict(reply, 'Evidence is not eligible for review', 'SNAPPROOF_EVIDENCE_STATE_CONFLICT');
  });

  app.post(`${base}/evidence/:id/decision`, { preHandler: adminGuards }, async (request, reply) => {
    let input;
    try { input = parseDecisionInput(request.body); } catch (error) { if (validation(reply, error)) return; throw error; }
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const evidenceId = (request.params as any).id;
    const current = await scopedEvidence(tenantId, evidenceId);
    if (!current) return notFound(reply, 'evidence');
    if (input.decision === 'approve' && current.attachment_id) {
      try {
        const content = await getAttachmentContent({
          tenantId, moduleId: await moduleId(), attachmentId: String(current.attachment_id),
          objectType: 'snapproof_evidence', objectId: String(current.case_id),
        });
        if (!content) return notFound(reply, 'evidence attachment');
      } catch (error) {
        if (attachmentError(reply, error)) return;
        throw error;
      }
    }
    const status = input.decision === 'approve' ? 'verified' : 'rejected';
    const eventType = input.decision === 'approve' ? 'evidence_verified' : 'evidence_rejected';
    const row = await db.transaction(async tx => {
      const updated = await tx.execute(sql`
        UPDATE snapproof_evidence_items SET
          status=${status},
          verified_by_user_id=CASE WHEN ${status}='verified' THEN ${user.id} ELSE NULL END,
          verified_at=CASE WHEN ${status}='verified' THEN NOW() ELSE NULL END,
          rejection_reason=CASE WHEN ${status}='rejected' THEN ${input.reason} ELSE NULL END,
          version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${evidenceId} AND status='in_review'
          AND version=${input.expectedVersion} AND deleted_at IS NULL
        RETURNING *
      `);
      const value = updated.rows[0] as Record<string, any> | undefined;
      if (!value) return null;
      await appendCustody({
        tenantId, caseId: String(value.case_id), evidenceId, actorUserId: user.id,
        eventType, payload: { reason: input.reason, attachmentSha256: value.attachment_sha256 },
      }, tx);
      return value;
    });
    return row ? safeRow(row) : conflict(reply, 'Evidence review state or version changed');
  });

  app.get(`${base}/evidence/:id/download`, { preHandler: readGuards }, async (request, reply) => {
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const evidenceId = (request.params as any).id;
    const evidence = await scopedEvidence(tenantId, evidenceId);
    if (!evidence?.attachment_id) return notFound(reply, 'evidence attachment');
    try {
      const result = await getAttachmentContent({
        tenantId, moduleId: await moduleId(), attachmentId: String(evidence.attachment_id),
        objectType: 'snapproof_evidence', objectId: String(evidence.case_id),
      });
      if (!result) return notFound(reply, 'evidence attachment');
      await db.transaction(tx => appendCustody({
        tenantId, caseId: String(evidence.case_id), evidenceId, actorUserId: user.id,
        eventType: 'evidence_downloaded', payload: { attachmentSha256: evidence.attachment_sha256 },
      }, tx));
      reply.type(String(result.metadata.detected_mime_type))
        .header('Content-Disposition', `attachment; filename="${String(result.metadata.original_name).replaceAll('"', '')}"`)
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff');
      return reply.send(result.content);
    } catch (error) {
      if (attachmentError(reply, error)) return;
      throw error;
    }
  });

  app.post(`${base}/evidence/:id/integrity`, { preHandler: writeGuards }, async (request, reply) => {
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const evidenceId = (request.params as any).id;
    const evidence = await scopedEvidence(tenantId, evidenceId);
    if (!evidence) return notFound(reply, 'evidence');
    if (!evidence.attachment_id) return { ok: true, evidenceId, kind: 'note', sha256: null };
    try {
      const result = await getAttachmentContent({
        tenantId, moduleId: await moduleId(), attachmentId: String(evidence.attachment_id),
        objectType: 'snapproof_evidence', objectId: String(evidence.case_id),
      });
      if (!result) return notFound(reply, 'evidence attachment');
      await db.transaction(tx => appendCustody({
        tenantId, caseId: String(evidence.case_id), evidenceId, actorUserId: user.id,
        eventType: 'integrity_checked',
        payload: { result: 'matched', sha256: result.metadata.sha256 },
      }, tx));
      return { ok: true, evidenceId, sha256: result.metadata.sha256 };
    } catch (error) {
      if (attachmentError(reply, error)) return;
      throw error;
    }
  });

  app.get(`${base}/cases/:id/findings`, { preHandler: readGuards }, async (request, reply) => {
    const { tenantId } = (request as any).tenantContext as Context;
    const caseId = (request.params as any).id;
    if (!await scopedCase(tenantId, caseId)) return notFound(reply, 'case');
    const result = await db.execute(sql`
      SELECT * FROM snapproof_findings WHERE tenant_id=${tenantId} AND case_id=${caseId}
        AND deleted_at IS NULL ORDER BY created_at DESC
    `);
    return { findings: result.rows.map(row => safeRow(row as Record<string, unknown>)) };
  });

  app.post(`${base}/cases/:id/findings`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parseFindingInput(request.body); } catch (error) { if (validation(reply, error)) return; throw error; }
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const caseId = (request.params as any).id;
    const currentCase = await scopedCase(tenantId, caseId);
    if (!currentCase) return notFound(reply, 'case');
    if (!['draft', 'collecting', 'rejected'].includes(currentCase.status)) {
      return conflict(reply, 'Findings cannot be added in the current case state', 'SNAPPROOF_CASE_STATE_CONFLICT');
    }
    if (!await assertEvidenceBelongsToCase(tenantId, caseId, input.evidenceId)) return notFound(reply, 'evidence');
    const row = await db.transaction(async tx => {
      const inserted = await tx.execute(sql`
        INSERT INTO snapproof_findings (
          tenant_id,case_id,evidence_id,created_by_user_id,title,description,recommendation,category,severity
        ) VALUES (
          ${tenantId},${caseId},${input.evidenceId},${user.id},${input.title},${input.description},
          ${input.recommendation},${input.category},${input.severity}
        ) RETURNING *
      `);
      const value = inserted.rows[0] as Record<string, any>;
      await appendCustody({
        tenantId, caseId, evidenceId: input.evidenceId, actorUserId: user.id,
        eventType: 'finding_added', payload: { findingId: value.id, title: input.title, severity: input.severity },
      }, tx);
      return value;
    });
    return reply.code(201).send(safeRow(row));
  });

  app.get(`${base}/cases/:id/comments`, { preHandler: readGuards }, async (request, reply) => {
    const { tenantId } = (request as any).tenantContext as Context;
    const caseId = (request.params as any).id;
    if (!await scopedCase(tenantId, caseId)) return notFound(reply, 'case');
    const result = await db.execute(sql`
      SELECT * FROM snapproof_comments WHERE tenant_id=${tenantId} AND case_id=${caseId} ORDER BY created_at,id
    `);
    return { comments: result.rows.map(row => safeRow(row as Record<string, unknown>)) };
  });

  app.post(`${base}/cases/:id/comments`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parseCommentInput(request.body); } catch (error) { if (validation(reply, error)) return; throw error; }
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const caseId = (request.params as any).id;
    if (!await scopedCase(tenantId, caseId)) return notFound(reply, 'case');
    if (!await assertEvidenceBelongsToCase(tenantId, caseId, input.evidenceId)) return notFound(reply, 'evidence');
    const row = await db.transaction(async tx => {
      const inserted = await tx.execute(sql`
        INSERT INTO snapproof_comments(tenant_id,case_id,evidence_id,created_by_user_id,comment_type,body)
        VALUES (${tenantId},${caseId},${input.evidenceId},${user.id},${input.commentType},${input.body})
        RETURNING *
      `);
      const value = inserted.rows[0] as Record<string, any>;
      await appendCustody({
        tenantId, caseId, evidenceId: input.evidenceId, actorUserId: user.id,
        eventType: 'comment_added', payload: { commentId: value.id, commentType: input.commentType },
      }, tx);
      return value;
    });
    return reply.code(201).send(safeRow(row));
  });

  app.get(`${base}/cases/:id/custody`, { preHandler: readGuards }, async (request, reply) => {
    const { tenantId } = (request as any).tenantContext as Context;
    const caseId = (request.params as any).id;
    if (!await scopedCase(tenantId, caseId)) return notFound(reply, 'case');
    const result = await db.execute(sql`
      SELECT id,case_id,evidence_id,actor_user_id,sequence_number,event_type,previous_hash,event_hash,payload,created_at
      FROM snapproof_custody_events WHERE tenant_id=${tenantId} AND case_id=${caseId}
      ORDER BY sequence_number
    `);
    return { events: result.rows.map(row => safeRow(row as Record<string, unknown>)) };
  });

  app.patch(`${base}/cases/:id/retention`, { preHandler: adminGuards }, async (request, reply) => {
    let input;
    try { input = parseRetentionInput(request.body); } catch (error) { if (validation(reply, error)) return; throw error; }
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const caseId = (request.params as any).id;
    const row = await db.transaction(async tx => {
      const current = await scopedCase(tenantId, caseId, tx, true);
      if (!current || Number(current.version) !== input.expectedVersion) return null;
      const legalHold = input.legalHold ?? Boolean(current.legal_hold);
      const retentionUntil = input.retentionUntil === undefined ? current.retention_until : input.retentionUntil;
      const updated = await tx.execute(sql`
        UPDATE snapproof_cases SET legal_hold=${legalHold},retention_until=${retentionUntil},
          version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${caseId} AND version=${input.expectedVersion}
        RETURNING *
      `);
      await tx.execute(sql`
        UPDATE shared_attachments SET retention_until=${retentionUntil},updated_at=NOW(),version=version+1
        WHERE tenant_id=${tenantId} AND module_id=${await moduleId(tx)}
          AND object_type='snapproof_evidence' AND object_id=${caseId} AND deleted_at IS NULL
      `);
      await appendCustody({
        tenantId, caseId, actorUserId: user.id,
        eventType: input.legalHold === undefined ? 'retention_changed' : 'legal_hold_changed',
        payload: { legalHold, retentionUntil: retentionUntil ? new Date(retentionUntil).toISOString() : null },
      }, tx);
      return updated.rows[0] as Record<string, unknown>;
    });
    return row ? safeRow(row) : conflict(reply, 'Case retention state or version changed');
  });

  app.post(`${base}/cases/:id/archive`, { preHandler: adminGuards }, async (request, reply) => {
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const caseId = (request.params as any).id;
    const row = await db.transaction(async tx => {
      const updated = await tx.execute(sql`
        UPDATE snapproof_cases SET status='archived',version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${caseId} AND legal_hold=FALSE
          AND status IN ('approved','rejected') AND deleted_at IS NULL
        RETURNING *
      `);
      if (!updated.rows[0]) return null;
      await tx.execute(sql`
        UPDATE snapproof_evidence_items SET status='archived',version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND case_id=${caseId} AND deleted_at IS NULL
      `);
      await appendCustody({ tenantId, caseId, actorUserId: user.id, eventType: 'case_archived', payload: {} }, tx);
      return updated.rows[0] as Record<string, unknown>;
    });
    return row ? safeRow(row) : conflict(reply, 'Case cannot be archived while on legal hold or in its current state', 'SNAPPROOF_ARCHIVE_BLOCKED');
  });

  app.get(`${base}/reports`, { preHandler: readGuards }, async (request, reply) => {
    let query;
    try { query = parseListQuery(request.query); } catch (error) { if (validation(reply, error)) return; throw error; }
    const { tenantId } = (request as any).tenantContext as Context;
    const result = await db.execute(sql`
      SELECT r.*,c.reference AS case_reference,c.title AS case_title,COUNT(*) OVER()::int AS total_count
      FROM snapproof_reports r JOIN snapproof_cases c ON c.tenant_id=r.tenant_id AND c.id=r.case_id
      WHERE r.tenant_id=${tenantId} AND (${query.status}::text IS NULL OR r.status=${query.status})
      ORDER BY r.updated_at DESC LIMIT ${query.limit} OFFSET ${query.offset}
    `);
    return {
      items: result.rows.map(row => safeRow(row as Record<string, unknown>)),
      total: Number(result.rows[0]?.total_count ?? 0), limit: query.limit, offset: query.offset,
    };
  });

  app.post(`${base}/cases/:id/reports`, { preHandler: writeGuards }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 200) return reply.code(400).send({ error: 'title is required and must not exceed 200 characters', code: 'SNAPPROOF_VALIDATION_FAILED' });
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const caseId = (request.params as any).id;
    const caseRow = await scopedCase(tenantId, caseId);
    if (!caseRow) return notFound(reply, 'case');
    if (caseRow.status !== 'approved') {
      return conflict(reply, 'Reports require an approved case', 'SNAPPROOF_CASE_NOT_APPROVED');
    }
    const [evidence, findings] = await Promise.all([
      db.execute(sql`
        SELECT id,title,evidence_type,description,captured_at,source_type,source_reference,status,attachment_sha256
        FROM snapproof_evidence_items WHERE tenant_id=${tenantId} AND case_id=${caseId} AND deleted_at IS NULL ORDER BY created_at,id
      `),
      db.execute(sql`
        SELECT id,evidence_id,title,description,recommendation,category,severity,status
        FROM snapproof_findings WHERE tenant_id=${tenantId} AND case_id=${caseId} AND deleted_at IS NULL ORDER BY created_at,id
      `),
    ]);
    const content = {
      schema: 'operatoros.snapproof.report.v1',
      generatedAt: new Date().toISOString(),
      case: {
        id: caseRow.id, reference: caseRow.reference, title: caseRow.title,
        description: caseRow.description, caseType: caseRow.case_type, status: caseRow.status,
      },
      evidence: evidence.rows.map(row => safeRow(row as Record<string, unknown>)),
      findings: findings.rows.map(row => safeRow(row as Record<string, unknown>)),
    };
    const contentHash = sha256Json(content);
    const row = await db.transaction(async tx => {
      const inserted = await tx.execute(sql`
        INSERT INTO snapproof_reports(tenant_id,case_id,created_by_user_id,title,content,content_hash)
        VALUES (${tenantId},${caseId},${user.id},${title},${JSON.stringify(content)}::jsonb,${contentHash})
        RETURNING *
      `);
      const value = inserted.rows[0] as Record<string, any>;
      await appendCustody({
        tenantId, caseId, actorUserId: user.id, eventType: 'report_created',
        payload: { reportId: value.id, contentHash },
      }, tx);
      return value;
    });
    return reply.code(201).send(safeRow(row));
  });

  app.get(`${base}/reports/:id`, { preHandler: readGuards }, async (request, reply) => {
    const { tenantId } = (request as any).tenantContext as Context;
    const result = await db.execute(sql`
      SELECT * FROM snapproof_reports WHERE tenant_id=${tenantId} AND id=${(request.params as any).id} LIMIT 1
    `);
    return result.rows[0] ? { report: safeRow(result.rows[0] as Record<string, unknown>) } : notFound(reply, 'report');
  });

  app.post(`${base}/reports/:id/submit`, { preHandler: writeGuards }, async (request, reply) => {
    const { tenantId } = (request as any).tenantContext as Context;
    const result = await db.execute(sql`
      UPDATE snapproof_reports SET status='in_review',version=version+1,updated_at=NOW()
      WHERE tenant_id=${tenantId} AND id=${(request.params as any).id} AND status IN ('draft','rejected')
      RETURNING *
    `);
    return result.rows[0] ? safeRow(result.rows[0] as Record<string, unknown>) : conflict(reply, 'Report is not eligible for review', 'SNAPPROOF_REPORT_STATE_CONFLICT');
  });

  app.post(`${base}/reports/:id/decision`, { preHandler: adminGuards }, async (request, reply) => {
    let input;
    try { input = parseDecisionInput(request.body); } catch (error) { if (validation(reply, error)) return; throw error; }
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const reportId = (request.params as any).id;
    const status = input.decision === 'approve' ? 'approved' : 'rejected';
    const eventType = input.decision === 'approve' ? 'report_approved' : 'report_rejected';
    const row = await db.transaction(async tx => {
      if (input.decision === 'approve') {
        const caseState = await tx.execute(sql`
          SELECT c.status
          FROM snapproof_reports r
          JOIN snapproof_cases c ON c.tenant_id=r.tenant_id AND c.id=r.case_id
          WHERE r.tenant_id=${tenantId} AND r.id=${reportId}
          FOR UPDATE OF c
        `);
        if ((caseState.rows[0] as Record<string, unknown> | undefined)?.status !== 'approved') {
          return null;
        }
      }
      const updated = await tx.execute(sql`
        UPDATE snapproof_reports SET status=${status},
          approved_by_user_id=CASE WHEN ${status}='approved' THEN ${user.id} ELSE NULL END,
          approved_at=CASE WHEN ${status}='approved' THEN NOW() ELSE NULL END,
          version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${reportId} AND status='in_review' AND version=${input.expectedVersion}
        RETURNING *
      `);
      const value = updated.rows[0] as Record<string, any> | undefined;
      if (!value) return null;
      await appendCustody({
        tenantId, caseId: String(value.case_id), actorUserId: user.id, eventType,
        payload: { reportId, contentHash: value.content_hash, reason: input.reason },
      }, tx);
      return value;
    });
    return row ? safeRow(row) : conflict(reply, 'Report review state or version changed');
  });

  app.get(`${base}/reports/:id/export`, { preHandler: readGuards }, async (request, reply) => {
    const format = (request.query as any)?.format;
    if (!['json', 'csv'].includes(format)) return reply.code(400).send({ error: 'format must be json or csv', code: 'SNAPPROOF_EXPORT_FORMAT_INVALID' });
    const { tenantId } = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const reportId = (request.params as any).id;
    const result = await db.execute(sql`
      SELECT * FROM snapproof_reports WHERE tenant_id=${tenantId} AND id=${reportId} AND status='approved' LIMIT 1
    `);
    const report = result.rows[0] as Record<string, any> | undefined;
    if (!report) return notFound(reply, 'approved report');
    const custody = await db.execute(sql`
      SELECT sequence_number,event_type,event_hash,previous_hash,created_at
      FROM snapproof_custody_events WHERE tenant_id=${tenantId} AND case_id=${report.case_id}
      ORDER BY sequence_number
    `);
    const provenance = {
      schema: 'operatoros.snapproof.export-provenance.v1',
      tenantId,
      caseId: report.case_id,
      reportId,
      reportContentHash: report.content_hash,
      custodyHeadHash: custody.rows.at(-1)?.event_hash ?? null,
      custodyEventCount: custody.rows.length,
      generatedAt: new Date().toISOString(),
      generatedByUserId: user.id,
    };
    let content: string;
    let contentType: string;
    let filename: string;
    if (format === 'json') {
      content = JSON.stringify({ report: safeRow(report), provenance, custody: custody.rows.map(row => safeRow(row as Record<string, unknown>)) }, null, 2);
      contentType = 'application/json; charset=utf-8';
      filename = `snapproof-${reportId}.json`;
    } else {
      const lines = [
        ['field', 'value'].map(csvCell).join(','),
        ['report_id', reportId].map(csvCell).join(','),
        ['case_id', report.case_id].map(csvCell).join(','),
        ['title', report.title].map(csvCell).join(','),
        ['content_hash', report.content_hash].map(csvCell).join(','),
        ['custody_head_hash', provenance.custodyHeadHash].map(csvCell).join(','),
        ['custody_event_count', provenance.custodyEventCount].map(csvCell).join(','),
        ['generated_at', provenance.generatedAt].map(csvCell).join(','),
      ];
      content = `${lines.join('\r\n')}\r\n`;
      contentType = 'text/csv; charset=utf-8';
      filename = `snapproof-${reportId}.csv`;
    }
    const exportHash = sha256Json({ format, content });
    await db.transaction(async tx => {
      await tx.execute(sql`
        INSERT INTO snapproof_exports(tenant_id,case_id,report_id,created_by_user_id,format,export_hash,provenance)
        VALUES (${tenantId},${report.case_id},${reportId},${user.id},${format},${exportHash},${JSON.stringify(provenance)}::jsonb)
      `);
      await appendCustody({
        tenantId, caseId: String(report.case_id), actorUserId: user.id, eventType: 'export_generated',
        payload: { reportId, format, exportHash, reportContentHash: report.content_hash },
      }, tx);
    });
    reply.type(contentType).header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('Cache-Control', 'private, no-store')
      .header('X-SnapProof-Export-SHA256', exportHash);
    return reply.send(content);
  });

  app.post(`${base}/migration/dry-run`, { preHandler: adminGuards, bodyLimit: 10_000_000 }, async (request, reply) => {
    try {
      return buildSnapProofMigrationPlan(request.body);
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });
}
