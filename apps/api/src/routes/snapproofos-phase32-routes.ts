import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  createAttachment,
  getAttachmentContent,
  softDeleteAttachment,
} from '../lib/shared-attachments.js';
import { appendActivityEvent, listActivityEvents } from '../lib/shared-usage-activity.js';
import { buildSnapProofExport, validateSnapProofArtifact } from '../lib/snapproofos-exports.js';
import { stripJpegExif } from '../lib/snapproofos-media.js';
import {
  parseEvidenceInput,
  sanitizeContext,
  sha256Json,
  SnapProofValidationError,
} from '../lib/snapproofos.js';
import {
  requireTenantAdmin,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import { tenantHasActiveApplicationStackCompanion } from '../lib/product-entitlements.js';

const base = '/v1/modules/snapproofos';
const readGuards = [requireTenantModuleAccess('snapproofos')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const adminGuards = [...writeGuards, requireTenantAdmin];
type Context = { tenantId: string; role: string; viaPlatformRole?: boolean };
type Row = Record<string, any>;

class InputError extends Error {
  constructor(
    message: string,
    readonly code = 'SNAPPROOF_VALIDATION_FAILED',
    readonly status = 400,
  ) {
    super(message);
  }
}

const tenant = (request: FastifyRequest) => ((request as any).tenantContext as Context).tenantId;
const actor = (request: FastifyRequest) => String((request as any).user.id);
const camelKey = (key: string) =>
  key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const camel = (row: unknown) =>
  Object.fromEntries(
    Object.entries(row as Row)
      .filter(([key]) => key !== 'tenant_id')
      .map(([key, value]) => [camelKey(key), value]),
  );
const list = (rows: unknown[]) => rows.map(camel);

function body(request: FastifyRequest): Row {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body))
    throw new InputError('A JSON object is required');
  const value = request.body as Row;
  for (const key of ['tenantId', 'tenant_id', 'userId', 'user_id', 'role', 'entitlement']) {
    if (key in value)
      throw new InputError(`${key} is resolved from the trusted OperatorOS session`);
  }
  return value;
}
function text(value: unknown, name: string, max = 5000, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new InputError(`${name} is required`);
    return null;
  }
  if (typeof value !== 'string') throw new InputError(`${name} must be text`);
  const result = value.trim();
  if (
    !result ||
    result.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)
  )
    throw new InputError(`${name} is invalid`);
  return result;
}
function identifier(request: FastifyRequest, name = 'id'): string {
  const value = (request.params as Row)[name];
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value))
    throw new InputError(`${name} is invalid`);
  return value;
}
function integer(
  value: unknown,
  name: string,
  min = 0,
  max = 2_147_483_647,
  fallback?: number,
): number {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new InputError(`${name} is required`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new InputError(`${name} is invalid`);
  return parsed;
}
function decimal(
  value: unknown,
  name: string,
  min = 0,
  max = 1_000_000,
  fallback?: number,
): number {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new InputError(`${name} is required`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max)
    throw new InputError(`${name} is invalid`);
  return parsed;
}
function enumeration<T extends string>(
  value: unknown,
  name: string,
  values: readonly T[],
  fallback: T,
): T {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !values.includes(value as T))
    throw new InputError(`${name} is invalid`);
  return value as T;
}
function date(value: unknown, name: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new InputError(`${name} is invalid`);
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new InputError(`${name} is invalid`);
  return result;
}
function fail(reply: FastifyReply, error: unknown) {
  if (error instanceof InputError || error instanceof SnapProofValidationError)
    return reply.code(error instanceof InputError ? error.status : 400).send({
      error: error.message,
      code: 'code' in error ? error.code : 'SNAPPROOF_VALIDATION_FAILED',
    });
  const code = String((error as any)?.code || '');
  if (code === '23503')
    return reply
      .code(404)
      .send({ error: 'Related record not found', code: 'SNAPPROOF_RELATED_RECORD_NOT_FOUND' });
  if (code === '23505')
    return reply
      .code(409)
      .send({ error: 'Matching record already exists', code: 'SNAPPROOF_CONFLICT' });
  if (code.startsWith('ATTACHMENT_'))
    return reply
      .code(code.includes('PENDING') || code.includes('QUARANTINED') ? 409 : 422)
      .send({ error: (error as Error).message, code });
  throw error;
}

async function snapModuleId(): Promise<string> {
  const result = await db.execute(sql`SELECT id FROM modules WHERE slug='snapproofos' LIMIT 1`);
  if (!result.rows[0]?.id)
    throw new InputError('SnapProofOS module is unavailable', 'SNAPPROOF_MODULE_UNAVAILABLE', 503);
  return String(result.rows[0].id);
}
async function activity(
  request: FastifyRequest,
  objectType: string,
  objectId: string,
  eventType: string,
  summary: string,
  metadata?: Row,
) {
  return appendActivityEvent({
    tenantId: tenant(request),
    moduleId: await snapModuleId(),
    actorUserId: actor(request),
    objectType,
    objectId,
    eventType,
    summary,
    metadata,
    correlationId: request.id,
  });
}
async function job(tenantId: string, jobId: string) {
  const result = await db.execute(
    sql`SELECT c.*,cu.name AS customer_name,cu.email AS customer_email,cu.phone AS customer_phone,u.name AS assignee_name,u.email AS assignee_email FROM snapproof_cases c LEFT JOIN snapproof_customers cu ON cu.tenant_id=c.tenant_id AND cu.id=c.customer_id LEFT JOIN users u ON u.id=c.assigned_to_user_id WHERE c.tenant_id=${tenantId} AND c.id=${jobId} AND c.deleted_at IS NULL LIMIT 1`,
  );
  return result.rows[0] as Row | undefined;
}
function jobView(row: Row) {
  return { ...camel(row), status: row.job_status || 'draft', proofStatus: row.status };
}
async function assertTenantUser(tenantId: string, userId: string | null) {
  if (!userId) return;
  const found = await db.execute(
    sql`SELECT 1 FROM tenant_users WHERE tenant_id=${tenantId} AND user_id=${userId} LIMIT 1`,
  );
  if (!found.rows[0])
    throw new InputError(
      'Assignee is not a member of this organization',
      'SNAPPROOF_ASSIGNEE_INVALID',
      404,
    );
}

async function assertDirectorySelection(tenantId: string, organizationId: string | null, siteId: string | null, contactId: string | null) {
  if (siteId && !organizationId)
    throw new InputError('directoryOrganizationId is required when selecting a site', 'SNAPPROOF_DIRECTORY_SELECTION_INVALID');
  if (organizationId) {
    const organization = await db.execute(sql`SELECT 1 FROM directory_organizations WHERE tenant_id=${tenantId} AND id=${organizationId} AND archived_at IS NULL LIMIT 1`);
    if (!organization.rows[0]) throw new InputError('Directory organization was not found', 'SNAPPROOF_DIRECTORY_SELECTION_INVALID', 404);
  }
  if (siteId) {
    const site = await db.execute(sql`SELECT 1 FROM directory_sites WHERE tenant_id=${tenantId} AND organization_id=${organizationId} AND id=${siteId} AND archived_at IS NULL LIMIT 1`);
    if (!site.rows[0]) throw new InputError('Directory site was not found for this organization', 'SNAPPROOF_DIRECTORY_SELECTION_INVALID', 404);
  }
  if (contactId) {
    const contact = await db.execute(sql`SELECT 1 FROM directory_contacts WHERE tenant_id=${tenantId} AND id=${contactId} AND archived_at IS NULL LIMIT 1`);
    if (!contact.rows[0]) throw new InputError('Directory contact was not found', 'SNAPPROOF_DIRECTORY_SELECTION_INVALID', 404);
  }
}

async function consumePublicRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const minute = new Date().toISOString().slice(0, 16);
  const bucket = createHash('sha256')
    .update(`snapproof-share:${request.ip}:${minute}`)
    .digest('hex');
  const rate = await db.execute(sql`
    INSERT INTO snapproof_public_rate_limits(bucket_key,request_count)
    VALUES (${bucket},1)
    ON CONFLICT(bucket_key) DO UPDATE
      SET request_count=snapproof_public_rate_limits.request_count+1,updated_at=NOW()
    RETURNING request_count
  `);
  if (Number(rate.rows[0]?.request_count) <= 30) return true;
  reply
    .code(429)
    .header('Retry-After', '60')
    .send({ error: 'Too many requests', code: 'SNAPPROOF_RATE_LIMITED' });
  return false;
}

async function buildReportSnapshot(tenantId: string, jobId: string) {
  const jobRow = await job(tenantId, jobId);
  if (!jobRow) throw new InputError('Job not found', 'SNAPPROOF_JOB_NOT_FOUND', 404);
  const [findings, notes, parts, labor, evidence, branding] = await Promise.all([
    db.execute(
      sql`SELECT id,evidence_id,title,issue,cause,resolution,description,recommendation,category,severity,status,sort_order,created_at FROM snapproof_findings WHERE tenant_id=${tenantId} AND case_id=${jobId} AND deleted_at IS NULL ORDER BY sort_order,created_at,id`,
    ),
    db.execute(
      sql`SELECT id,body,note_type,customer_visible,audio_attachment_id,created_at FROM snapproof_comments WHERE tenant_id=${tenantId} AND case_id=${jobId} ORDER BY created_at,id`,
    ),
    db.execute(
      sql`SELECT id,name,part_number,quantity,unit_cost_cents,unit_price_cents,(quantity*unit_cost_cents)::bigint AS total_cost_cents,(quantity*unit_price_cents)::bigint AS total_price_cents,notes FROM snapproof_parts WHERE tenant_id=${tenantId} AND case_id=${jobId} AND deleted_at IS NULL ORDER BY created_at,id`,
    ),
    db.execute(
      sql`SELECT id,description,hours,rate_cents,(hours*rate_cents)::bigint AS total_cents,technician_user_id,work_date FROM snapproof_labor WHERE tenant_id=${tenantId} AND case_id=${jobId} AND deleted_at IS NULL ORDER BY work_date NULLS LAST,created_at,id`,
    ),
    db.execute(
      sql`SELECT id,title,evidence_type,description,caption,sort_order,captured_at,status,attachment_sha256 FROM snapproof_evidence_items WHERE tenant_id=${tenantId} AND case_id=${jobId} AND deleted_at IS NULL ORDER BY sort_order,created_at,id`,
    ),
    db.execute(
      sql`SELECT accent_color,company_name,footer_text,contact_email,contact_phone,website,logo_attachment_id FROM snapproof_branding WHERE tenant_id=${tenantId}`,
    ),
  ]);
  const customer = jobRow.customer_id
    ? {
        id: jobRow.customer_id,
        name: jobRow.customer_name,
        email: jobRow.customer_email,
        phone: jobRow.customer_phone,
      }
    : null;
  const partRows = list(parts.rows);
  const laborRows = list(labor.rows);
  const partsPriceCents = partRows.reduce((sum, row) => sum + Number(row.totalPriceCents || 0), 0);
  const laborCents = laborRows.reduce((sum, row) => sum + Number(row.totalCents || 0), 0);
  return {
    schema: 'operatoros.snapproof.report.v2',
    generatedAt: new Date().toISOString(),
    job: {
      ...jobView(jobRow),
      customerName: undefined,
      customerEmail: undefined,
      customerPhone: undefined,
    },
    customer,
    findings: list(findings.rows),
    notes: list(notes.rows).filter(
      (row) => row.customerVisible || row.noteType === 'customer_facing',
    ),
    parts: partRows,
    labor: laborRows,
    evidence: list(evidence.rows),
    totals: { partsPriceCents, laborCents, totalCents: partsPriceCents + laborCents },
    branding: branding.rows[0] ? camel(branding.rows[0]) : {},
  };
}

function publicReportContent(value: unknown) {
  const content = (value && typeof value === 'object' ? value : {}) as Row;
  const sourceJob = (content.job || {}) as Row;
  const sourceCustomer = (content.customer || {}) as Row;
  const sourceTotals = (content.totals || {}) as Row;
  const sourceBranding = (content.branding || {}) as Row;
  return {
    schema: content.schema,
    generatedAt: content.generatedAt,
    job: {
      reference: sourceJob.reference,
      title: sourceJob.title,
      description: sourceJob.description,
      jobType: sourceJob.jobType,
      status: sourceJob.status,
      proofStatus: sourceJob.proofStatus,
      siteAddress: sourceJob.siteAddress,
      scheduledFor: sourceJob.scheduledFor,
      dueAt: sourceJob.dueAt,
      completedAt: sourceJob.completedAt,
      assigneeName: sourceJob.assigneeName,
    },
    customer: content.customer
      ? {
          name: sourceCustomer.name,
          email: sourceCustomer.email,
          phone: sourceCustomer.phone,
        }
      : null,
    findings: (Array.isArray(content.findings) ? content.findings : []).map((item: Row) => ({
      issue: item.issue,
      cause: item.cause,
      resolution: item.resolution,
      recommendation: item.recommendation,
      category: item.category,
      severity: item.severity,
      status: item.status,
    })),
    notes: (Array.isArray(content.notes) ? content.notes : []).map((item: Row) => ({
      body: item.body,
      noteType: item.noteType,
      customerVisible: item.customerVisible,
      createdAt: item.createdAt,
    })),
    parts: (Array.isArray(content.parts) ? content.parts : []).map((item: Row) => ({
      name: item.name,
      partNumber: item.partNumber,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalPriceCents: item.totalPriceCents,
      notes: item.notes,
    })),
    labor: (Array.isArray(content.labor) ? content.labor : []).map((item: Row) => ({
      description: item.description,
      hours: item.hours,
      rateCents: item.rateCents,
      totalCents: item.totalCents,
      workDate: item.workDate,
    })),
    evidence: (Array.isArray(content.evidence) ? content.evidence : []).map((item: Row) => ({
      title: item.title,
      evidenceType: item.evidenceType,
      description: item.description,
      caption: item.caption,
      sortOrder: item.sortOrder,
      capturedAt: item.capturedAt,
      status: item.status,
      sha256: item.attachmentSha256,
    })),
    totals: {
      partsPriceCents: sourceTotals.partsPriceCents,
      laborCents: sourceTotals.laborCents,
      totalCents: sourceTotals.totalCents,
    },
    branding: {
      accentColor: sourceBranding.accentColor,
      companyName: sourceBranding.companyName,
      footerText: sourceBranding.footerText,
      contactEmail: sourceBranding.contactEmail,
      contactPhone: sourceBranding.contactPhone,
      website: sourceBranding.website,
    },
  };
}

export async function registerSnapProofOsPhase32Routes(app: FastifyInstance): Promise<void> {
  app.get(`${base}/organization`, { preHandler: readGuards }, async (request) => {
    const result = await db.execute(
      sql`SELECT id,name,slug,status,created_at,updated_at FROM tenants WHERE id=${tenant(request)} LIMIT 1`,
    );
    return { organization: camel(result.rows[0] || {}), authority: 'OperatorOS' };
  });
  app.get(`${base}/billing`, { preHandler: readGuards }, async (request) => {
    if (await tenantHasActiveApplicationStackCompanion(tenant(request), 'snapproofos')) {
      return {
        billing: {
          accessModel: 'application_stack',
          status: 'enabled',
          planCode: 'application_stack',
          planName: 'Application Stack',
          entitlementSource: 'application_stack',
          completeAccess: true,
        },
        authority: 'OperatorOS',
        manageUrl: '/app?page=billing',
      };
    }
    const result = await db.execute(
      sql`SELECT tm.status,tm.source AS entitlement_source FROM tenant_modules tm JOIN modules m ON m.id=tm.module_id WHERE tm.tenant_id=${tenant(request)} AND m.slug='snapproofos' LIMIT 1`,
    );
    return {
      billing: {
        ...camel(result.rows[0] || {}),
        accessModel: 'grandfathered_or_manual',
        completeAccess: true,
      },
      authority: 'OperatorOS',
      manageUrl: '/app?page=billing',
    };
  });
  app.get(`${base}/team`, { preHandler: readGuards }, async (request) => {
    const module = await snapModuleId();
    const result = await db.execute(
      sql`SELECT u.id,u.name,u.email,tu.role,COALESCE(tuma.access_level,'viewer') AS module_access,tu.joined_at FROM tenant_users tu JOIN users u ON u.id=tu.user_id LEFT JOIN tenant_user_module_access tuma ON tuma.tenant_id=tu.tenant_id AND tuma.user_id=tu.user_id AND tuma.module_id=${module} WHERE tu.tenant_id=${tenant(request)} ORDER BY u.name,u.email`,
    );
    return {
      members: list(result.rows),
      authority: 'OperatorOS',
      manageUrl: `/app/platform/tenants/${tenant(request)}/members`,
    };
  });
  app.get(`${base}/activity`, { preHandler: readGuards }, async (request) =>
    listActivityEvents({
      tenantId: tenant(request),
      moduleId: await snapModuleId(),
      limit: Math.min(100, Number((request.query as Row)?.limit || 25)),
    }),
  );

  app.get(`${base}/customers`, { preHandler: readGuards }, async (request) => {
    const query = request.query as Row;
    const search = text(query?.search, 'search', 120);
    const includeArchived = query?.includeArchived === 'true';
    const result = await db.execute(
      sql`SELECT c.*,(SELECT COUNT(*)::int FROM snapproof_cases j WHERE j.tenant_id=c.tenant_id AND j.customer_id=c.id AND j.deleted_at IS NULL) AS job_count FROM snapproof_customers c WHERE c.tenant_id=${tenant(request)} AND (${includeArchived} OR c.archived_at IS NULL) AND (${search}::text IS NULL OR c.name ILIKE ${search ? `%${search}%` : null} OR c.company ILIKE ${search ? `%${search}%` : null} OR c.email ILIKE ${search ? `%${search}%` : null}) ORDER BY c.updated_at DESC LIMIT 100`,
    );
    return { customers: list(result.rows) };
  });
  app.post(`${base}/customers`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const directoryOrganizationId = text(input.directoryOrganizationId, 'directoryOrganizationId', 36);
      const directorySiteId = text(input.directorySiteId, 'directorySiteId', 36);
      const directoryContactId = text(input.directoryContactId, 'directoryContactId', 36);
      await assertDirectorySelection(tenant(request), directoryOrganizationId, directorySiteId, directoryContactId);
      const result = await db.execute(
        sql`INSERT INTO snapproof_customers(tenant_id,created_by_user_id,name,email,phone,company,address,notes,directory_organization_id,directory_site_id,directory_contact_id) VALUES (${tenant(request)},${actor(request)},${text(input.name, 'name', 200, true)},${text(input.email, 'email', 320)},${text(input.phone, 'phone', 40)},${text(input.company, 'company', 200)},${text(input.address, 'address', 2000)},${text(input.notes, 'notes', 5000)},${directoryOrganizationId},${directorySiteId},${directoryContactId}) RETURNING *`,
      );
      const row = result.rows[0] as Row;
      await activity(
        request,
        'customer',
        String(row.id),
        'created',
        `Customer ${row.name} created`,
      );
      return reply.code(201).send({ customer: camel(row) });
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.get(`${base}/customers/:id`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const customerId = identifier(request);
      const [customer, jobs] = await Promise.all([
        db.execute(
          sql`SELECT * FROM snapproof_customers WHERE tenant_id=${tenant(request)} AND id=${customerId} LIMIT 1`,
        ),
        db.execute(
          sql`SELECT * FROM snapproof_cases WHERE tenant_id=${tenant(request)} AND customer_id=${customerId} AND deleted_at IS NULL ORDER BY updated_at DESC`,
        ),
      ]);
      if (!customer.rows[0])
        return reply
          .code(404)
          .send({ error: 'Customer not found', code: 'SNAPPROOF_CUSTOMER_NOT_FOUND' });
      return { customer: camel(customer.rows[0]), jobs: (jobs.rows as Row[]).map(jobView) };
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.patch(`${base}/customers/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const customerId = identifier(request);
      const existing = await db.execute(sql`SELECT directory_organization_id,directory_site_id,directory_contact_id FROM snapproof_customers WHERE tenant_id=${tenant(request)} AND id=${customerId} AND archived_at IS NULL LIMIT 1`);
      if (!existing.rows[0]) return reply.code(404).send({ error: 'Customer not found', code: 'SNAPPROOF_CUSTOMER_NOT_FOUND' });
      const current = existing.rows[0] as Row;
      const directoryOrganizationId = 'directoryOrganizationId' in input ? text(input.directoryOrganizationId, 'directoryOrganizationId', 36) : current.directory_organization_id;
      const directorySiteId = 'directorySiteId' in input ? text(input.directorySiteId, 'directorySiteId', 36) : current.directory_site_id;
      const directoryContactId = 'directoryContactId' in input ? text(input.directoryContactId, 'directoryContactId', 36) : current.directory_contact_id;
      await assertDirectorySelection(tenant(request), directoryOrganizationId, directorySiteId, directoryContactId);
      const result = await db.execute(
        sql`UPDATE snapproof_customers SET name=COALESCE(${text(input.name, 'name', 200)},name),email=CASE WHEN ${'email' in input} THEN ${text(input.email, 'email', 320)} ELSE email END,phone=CASE WHEN ${'phone' in input} THEN ${text(input.phone, 'phone', 40)} ELSE phone END,company=CASE WHEN ${'company' in input} THEN ${text(input.company, 'company', 200)} ELSE company END,address=CASE WHEN ${'address' in input} THEN ${text(input.address, 'address', 2000)} ELSE address END,notes=CASE WHEN ${'notes' in input} THEN ${text(input.notes, 'notes', 5000)} ELSE notes END,directory_organization_id=${directoryOrganizationId},directory_site_id=${directorySiteId},directory_contact_id=${directoryContactId},version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${customerId} AND archived_at IS NULL RETURNING *`,
      );
      if (!result.rows[0])
        return reply
          .code(404)
          .send({ error: 'Customer not found', code: 'SNAPPROOF_CUSTOMER_NOT_FOUND' });
      await activity(request, 'customer', customerId, 'updated', 'Customer details updated');
      return { customer: camel(result.rows[0]) };
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.delete(`${base}/customers/:id`, { preHandler: adminGuards }, async (request, reply) => {
    try {
      const customerId = identifier(request);
      const result = await db.execute(
        sql`UPDATE snapproof_customers SET archived_at=NOW(),version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${customerId} AND archived_at IS NULL RETURNING id,archived_at`,
      );
      if (!result.rows[0])
        return reply
          .code(404)
          .send({ error: 'Customer not found', code: 'SNAPPROOF_CUSTOMER_NOT_FOUND' });
      await activity(request, 'customer', customerId, 'archived', 'Customer archived');
      return { customer: camel(result.rows[0]) };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get(`${base}/jobs`, { preHandler: readGuards }, async (request) => {
    const query = request.query as Row;
    const search = text(query?.search, 'search', 120);
    const status = text(query?.status, 'status', 24);
    const result = await db.execute(
      sql`SELECT c.*,cu.name AS customer_name,u.name AS assignee_name,u.email AS assignee_email FROM snapproof_cases c LEFT JOIN snapproof_customers cu ON cu.tenant_id=c.tenant_id AND cu.id=c.customer_id LEFT JOIN users u ON u.id=c.assigned_to_user_id WHERE c.tenant_id=${tenant(request)} AND c.deleted_at IS NULL AND (${search}::text IS NULL OR c.reference ILIKE ${search ? `%${search}%` : null} OR c.title ILIKE ${search ? `%${search}%` : null} OR cu.name ILIKE ${search ? `%${search}%` : null}) AND (${status}::text IS NULL OR c.job_status=${status}) ORDER BY c.updated_at DESC LIMIT 100`,
    );
    return { jobs: (result.rows as Row[]).map(jobView) };
  });
  app.post(`${base}/jobs`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const assigned = text(input.assignedToId ?? input.assignedToUserId, 'assignedToId', 36);
      await assertTenantUser(tenant(request), assigned);
      const customerId = text(input.customerId, 'customerId', 36);
      const mutation = text(input.clientMutationId, 'clientMutationId', 100);
      const reference =
        text(input.reference, 'reference', 80) ??
        `SP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const result = await db.execute(
        sql`INSERT INTO snapproof_cases(tenant_id,created_by_user_id,assigned_to_user_id,customer_id,reference,title,description,case_type,job_type,site_address,scheduled_for,due_at,source_context,status,client_mutation_id) VALUES (${tenant(request)},${actor(request)},${assigned},${customerId},${reference},${text(input.title, 'title', 200, true)},${text(input.description, 'description', 10000)},'proof_of_work',${text(input.jobType, 'jobType', 80) ?? 'field_service'},${text(input.siteAddress ?? input.location, 'siteAddress', 2000)},${date(input.scheduledFor ?? input.startDate, 'scheduledFor')},${date(input.dueAt ?? input.endDate, 'dueAt')},${JSON.stringify(sanitizeContext(input.sourceContext, 'sourceContext'))}::jsonb,'draft',${mutation}) ON CONFLICT (tenant_id,client_mutation_id) WHERE client_mutation_id IS NOT NULL DO UPDATE SET updated_at=snapproof_cases.updated_at RETURNING *`,
      );
      const row = result.rows[0] as Row;
      await activity(request, 'job', String(row.id), 'created', `Job ${row.reference} created`, {
        clientMutationId: mutation,
      });
      return reply.code(201).send({
        job: jobView(row),
        replayed: Boolean(mutation && row.created_by_user_id !== actor(request)),
      });
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.get(`${base}/jobs/:id`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const jobId = identifier(request);
      const jobRow = await job(tenant(request), jobId);
      if (!jobRow)
        return reply.code(404).send({ error: 'Job not found', code: 'SNAPPROOF_JOB_NOT_FOUND' });
      const [findings, notes, parts, labor, files, reports] = await Promise.all([
        db.execute(
          sql`SELECT * FROM snapproof_findings WHERE tenant_id=${tenant(request)} AND case_id=${jobId} AND deleted_at IS NULL ORDER BY sort_order,created_at`,
        ),
        db.execute(
          sql`SELECT * FROM snapproof_comments WHERE tenant_id=${tenant(request)} AND case_id=${jobId} ORDER BY created_at`,
        ),
        db.execute(
          sql`SELECT *,(quantity*unit_price_cents)::bigint AS total_price_cents FROM snapproof_parts WHERE tenant_id=${tenant(request)} AND case_id=${jobId} AND deleted_at IS NULL ORDER BY created_at`,
        ),
        db.execute(
          sql`SELECT *,(hours*rate_cents)::bigint AS total_cents FROM snapproof_labor WHERE tenant_id=${tenant(request)} AND case_id=${jobId} AND deleted_at IS NULL ORDER BY created_at`,
        ),
        db.execute(
          sql`SELECT e.*,a.original_name,a.detected_mime_type,a.size_bytes,a.scan_status FROM snapproof_evidence_items e LEFT JOIN shared_attachments a ON a.tenant_id=e.tenant_id AND a.id=e.attachment_id WHERE e.tenant_id=${tenant(request)} AND e.case_id=${jobId} AND e.deleted_at IS NULL ORDER BY e.sort_order,e.created_at`,
        ),
        db.execute(
          sql`SELECT id,title,status,report_type,tone,content_hash,version,created_at,updated_at FROM snapproof_reports WHERE tenant_id=${tenant(request)} AND case_id=${jobId} ORDER BY created_at DESC`,
        ),
      ]);
      return {
        job: jobView(jobRow),
        findings: list(findings.rows),
        notes: list(notes.rows),
        parts: list(parts.rows),
        labor: list(labor.rows),
        files: list(files.rows),
        reports: list(reports.rows),
      };
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.patch(`${base}/jobs/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const jobId = identifier(request);
      const assigned = text(input.assignedToId ?? input.assignedToUserId, 'assignedToId', 36);
      if ('assignedToId' in input || 'assignedToUserId' in input)
        await assertTenantUser(tenant(request), assigned);
      const requestedStatus = input.status
        ? enumeration(
            input.status,
            'status',
            ['draft', 'in_progress', 'completed', 'archived'] as const,
            'draft',
          )
        : null;
      const result = await db.execute(
        sql`UPDATE snapproof_cases SET title=COALESCE(${text(input.title, 'title', 200)},title),description=CASE WHEN ${'description' in input} THEN ${text(input.description, 'description', 10000)} ELSE description END,customer_id=CASE WHEN ${'customerId' in input} THEN ${text(input.customerId, 'customerId', 36)} ELSE customer_id END,assigned_to_user_id=CASE WHEN ${'assignedToId' in input || 'assignedToUserId' in input} THEN ${assigned} ELSE assigned_to_user_id END,job_type=COALESCE(${text(input.jobType, 'jobType', 80)},job_type),site_address=CASE WHEN ${'siteAddress' in input || 'location' in input} THEN ${text(input.siteAddress ?? input.location, 'siteAddress', 2000)} ELSE site_address END,scheduled_for=CASE WHEN ${'scheduledFor' in input || 'startDate' in input} THEN ${date(input.scheduledFor ?? input.startDate, 'scheduledFor')} ELSE scheduled_for END,due_at=CASE WHEN ${'dueAt' in input || 'endDate' in input} THEN ${date(input.dueAt ?? input.endDate, 'dueAt')} ELSE due_at END,job_status=COALESCE(${requestedStatus},job_status),completed_at=CASE WHEN ${requestedStatus}='completed' THEN COALESCE(completed_at,NOW()) ELSE completed_at END,archived_at=CASE WHEN ${requestedStatus}='archived' THEN COALESCE(archived_at,NOW()) ELSE archived_at END,version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${jobId} AND deleted_at IS NULL AND job_status<>'archived' RETURNING *`,
      );
      if (!result.rows[0])
        return reply
          .code(404)
          .send({ error: 'Job not found or immutable', code: 'SNAPPROOF_JOB_NOT_FOUND' });
      await activity(request, 'job', jobId, 'updated', 'Job details updated');
      return { job: jobView(result.rows[0] as Row) };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post(`${base}/jobs/:id/findings`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const jobId = identifier(request);
      if (!(await job(tenant(request), jobId)))
        return reply.code(404).send({ error: 'Job not found', code: 'SNAPPROOF_JOB_NOT_FOUND' });
      const issue = text(input.issue ?? input.title, 'issue', 200, true)!;
      const cause = text(input.cause ?? input.description, 'cause', 10000, true)!;
      const result = await db.execute(
        sql`INSERT INTO snapproof_findings(tenant_id,case_id,evidence_id,created_by_user_id,title,description,issue,cause,resolution,recommendation,category,severity,sort_order) VALUES (${tenant(request)},${jobId},${text(input.evidenceId, 'evidenceId', 36)},${actor(request)},${issue},${cause},${issue},${cause},${text(input.resolution, 'resolution', 10000)},${text(input.recommendation, 'recommendation', 10000)},${text(input.category, 'category', 60)},${enumeration(input.severity, 'severity', ['info', 'low', 'medium', 'high', 'critical'] as const, 'medium')},${integer(input.sortOrder, 'sortOrder', 0, 100000, 0)}) RETURNING *`,
      );
      await activity(
        request,
        'finding',
        String(result.rows[0]!.id),
        'created',
        `Finding ${issue} added`,
        { jobId },
      );
      return reply.code(201).send({ finding: camel(result.rows[0]) });
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.patch(`${base}/findings/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const findingId = identifier(request);
      const result = await db.execute(
        sql`UPDATE snapproof_findings SET issue=COALESCE(${text(input.issue, 'issue', 200)},issue),title=COALESCE(${text(input.issue, 'issue', 200)},title),cause=COALESCE(${text(input.cause, 'cause', 10000)},cause),description=COALESCE(${text(input.cause, 'cause', 10000)},description),resolution=CASE WHEN ${'resolution' in input} THEN ${text(input.resolution, 'resolution', 10000)} ELSE resolution END,recommendation=CASE WHEN ${'recommendation' in input} THEN ${text(input.recommendation, 'recommendation', 10000)} ELSE recommendation END,severity=COALESCE(${input.severity === undefined ? null : enumeration(input.severity, 'severity', ['info', 'low', 'medium', 'high', 'critical'] as const, 'medium')},severity),sort_order=COALESCE(${input.sortOrder === undefined ? null : integer(input.sortOrder, 'sortOrder', 0, 100000)},sort_order),updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${findingId} AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM snapproof_cases WHERE tenant_id=${tenant(request)} AND id=snapproof_findings.case_id AND status NOT IN ('approved','archived')) RETURNING *`,
      );
      if (!result.rows[0])
        return reply.code(409).send({
          error: 'Finding not found or job is immutable',
          code: 'SNAPPROOF_ITEM_IMMUTABLE',
        });
      await activity(request, 'finding', findingId, 'updated', 'Finding updated');
      return { finding: camel(result.rows[0]) };
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.delete(`${base}/findings/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const findingId = identifier(request);
      const result = await db.execute(
        sql`UPDATE snapproof_findings SET deleted_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${findingId} AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM snapproof_cases WHERE tenant_id=${tenant(request)} AND id=snapproof_findings.case_id AND status NOT IN ('approved','archived')) RETURNING id`,
      );
      if (!result.rows[0])
        return reply.code(409).send({
          error: 'Finding not found or job is immutable',
          code: 'SNAPPROOF_ITEM_IMMUTABLE',
        });
      await activity(request, 'finding', findingId, 'deleted', 'Finding removed from active job');
      return reply.code(204).send();
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.post(
    `${base}/jobs/:id/notes`,
    { preHandler: writeGuards, bodyLimit: 35_000_000 },
    async (request, reply) => {
      try {
        const input = body(request);
        const jobId = identifier(request);
        if (!(await job(tenant(request), jobId)))
          return reply.code(404).send({ error: 'Job not found', code: 'SNAPPROOF_JOB_NOT_FOUND' });
        const noteType = enumeration(
          input.noteType,
          'noteType',
          ['internal', 'customer_facing', 'voice_transcript'] as const,
          'internal',
        );
        const moduleId = await snapModuleId();
        let parsedAudio: ReturnType<typeof parseEvidenceInput> | null = null;
        if (input.contentBase64) {
          parsedAudio = parseEvidenceInput({
            title: text(input.audioName, 'audioName', 200) ?? 'Voice note',
            evidenceType: 'audio',
            description: text(input.body, 'body', 5000, true),
            sourceType: 'voice_note',
            originalName: text(input.audioName, 'audioName', 240) ?? 'voice-note.mp3',
            declaredMimeType: text(input.declaredMimeType, 'declaredMimeType', 120, true),
            contentBase64: input.contentBase64,
          });
        }
        const saved = await db.transaction(async (tx) => {
          let audioAttachmentId: null | string = null;
          if (parsedAudio) {
            const attachment = await createAttachment(
              {
                tenantId: tenant(request),
                moduleId,
                objectType: 'snapproof_voice_note',
                objectId: jobId,
                originalName: parsedAudio.originalName!,
                declaredMimeType: parsedAudio.declaredMimeType,
                content: parsedAudio.content!,
                createdByUserId: actor(request),
                correlationId: request.id,
              },
              tx,
            );
            audioAttachmentId = String(attachment.id);
          }
          const result = await tx.execute(
            sql`INSERT INTO snapproof_comments(tenant_id,case_id,created_by_user_id,comment_type,body,note_type,customer_visible,audio_attachment_id) VALUES (${tenant(request)},${jobId},${actor(request)},${noteType === 'internal' ? 'internal' : 'review'},${text(input.body, 'body', 5000, true)},${noteType},${noteType === 'customer_facing'},${audioAttachmentId}) RETURNING *`,
          );
          return { row: result.rows[0]!, audioAttachmentId };
        });
        await activity(
          request,
          'note',
          String(saved.row.id),
          'created',
          noteType === 'customer_facing' ? 'Customer-facing note added' : 'Internal note added',
          { jobId, voice: Boolean(saved.audioAttachmentId) },
        );
        return reply.code(201).send({ note: camel(saved.row) });
      } catch (error) {
        return fail(reply, error);
      }
    },
  );
  app.get(`${base}/notes/:id/audio`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const noteId = identifier(request);
      const found = await db.execute(
        sql`SELECT c.case_id,c.audio_attachment_id,a.original_name,a.detected_mime_type FROM snapproof_comments c JOIN shared_attachments a ON a.tenant_id=c.tenant_id AND a.id=c.audio_attachment_id WHERE c.tenant_id=${tenant(request)} AND c.id=${noteId} LIMIT 1`,
      );
      const row = found.rows[0] as Row | undefined;
      if (!row?.audio_attachment_id)
        return reply
          .code(404)
          .send({ error: 'Voice note not found', code: 'SNAPPROOF_VOICE_NOTE_NOT_FOUND' });
      const attachment = await getAttachmentContent({
        tenantId: tenant(request),
        moduleId: await snapModuleId(),
        attachmentId: String(row.audio_attachment_id),
        objectType: 'snapproof_voice_note',
        objectId: String(row.case_id),
      });
      if (!attachment)
        return reply
          .code(404)
          .send({ error: 'Voice note not found', code: 'SNAPPROOF_VOICE_NOTE_NOT_FOUND' });
      reply
        .type(String(row.detected_mime_type))
        .header(
          'Content-Disposition',
          `inline; filename="${String(row.original_name).replaceAll('"', '')}"`,
        )
        .header('Cache-Control', 'private, no-store');
      return reply.send(attachment.content);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post(`${base}/jobs/:id/parts`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const jobId = identifier(request);
      const result = await db.execute(
        sql`INSERT INTO snapproof_parts(tenant_id,case_id,created_by_user_id,name,part_number,quantity,unit_cost_cents,unit_price_cents,notes) SELECT ${tenant(request)},${jobId},${actor(request)},${text(input.name, 'name', 200, true)},${text(input.partNumber, 'partNumber', 120)},${decimal(input.quantity, 'quantity', 0.001, 100000, 1)},${integer(input.unitCostCents ?? input.costCents, 'unitCostCents', 0, 100000000, 0)},${integer(input.unitPriceCents ?? input.priceCents, 'unitPriceCents', 0, 100000000, 0)},${text(input.notes, 'notes', 5000)} WHERE EXISTS(SELECT 1 FROM snapproof_cases WHERE tenant_id=${tenant(request)} AND id=${jobId} AND deleted_at IS NULL) RETURNING *,(quantity*unit_price_cents)::bigint AS total_price_cents`,
      );
      if (!result.rows[0])
        return reply.code(404).send({ error: 'Job not found', code: 'SNAPPROOF_JOB_NOT_FOUND' });
      await activity(request, 'part', String(result.rows[0]!.id), 'created', 'Part added to job', {
        jobId,
      });
      return reply.code(201).send({ part: camel(result.rows[0]) });
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.patch(`${base}/parts/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const partId = identifier(request);
      const result = await db.execute(
        sql`UPDATE snapproof_parts SET name=COALESCE(${text(input.name, 'name', 200)},name),part_number=CASE WHEN ${'partNumber' in input} THEN ${text(input.partNumber, 'partNumber', 120)} ELSE part_number END,quantity=COALESCE(${input.quantity === undefined ? null : decimal(input.quantity, 'quantity', 0.001, 100000)},quantity),unit_cost_cents=COALESCE(${input.unitCostCents === undefined ? null : integer(input.unitCostCents, 'unitCostCents', 0, 100000000)},unit_cost_cents),unit_price_cents=COALESCE(${input.unitPriceCents === undefined ? null : integer(input.unitPriceCents, 'unitPriceCents', 0, 100000000)},unit_price_cents),notes=CASE WHEN ${'notes' in input} THEN ${text(input.notes, 'notes', 5000)} ELSE notes END,version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${partId} AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM snapproof_cases WHERE tenant_id=${tenant(request)} AND id=snapproof_parts.case_id AND status NOT IN ('approved','archived')) RETURNING *,(quantity*unit_price_cents)::bigint AS total_price_cents`,
      );
      if (!result.rows[0])
        return reply
          .code(409)
          .send({ error: 'Part not found or job is immutable', code: 'SNAPPROOF_ITEM_IMMUTABLE' });
      return { part: camel(result.rows[0]) };
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.delete(`${base}/parts/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const partId = identifier(request);
      const result = await db.execute(
        sql`UPDATE snapproof_parts SET deleted_at=NOW(),version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${partId} AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM snapproof_cases WHERE tenant_id=${tenant(request)} AND id=snapproof_parts.case_id AND status NOT IN ('approved','archived')) RETURNING id`,
      );
      if (!result.rows[0])
        return reply
          .code(409)
          .send({ error: 'Part not found or job is immutable', code: 'SNAPPROOF_ITEM_IMMUTABLE' });
      return reply.code(204).send();
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.post(`${base}/jobs/:id/labor`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const jobId = identifier(request);
      const technician = text(input.technicianId ?? input.technicianUserId, 'technicianId', 36);
      await assertTenantUser(tenant(request), technician);
      const result = await db.execute(
        sql`INSERT INTO snapproof_labor(tenant_id,case_id,technician_user_id,created_by_user_id,description,hours,rate_cents,work_date) SELECT ${tenant(request)},${jobId},${technician},${actor(request)},${text(input.description, 'description', 500, true)},${decimal(input.hours, 'hours', 0.01, 10000)},${integer(input.rateCents, 'rateCents', 0, 100000000, 0)},${date(input.workDate, 'workDate')}::date WHERE EXISTS(SELECT 1 FROM snapproof_cases WHERE tenant_id=${tenant(request)} AND id=${jobId} AND deleted_at IS NULL) RETURNING *,(hours*rate_cents)::bigint AS total_cents`,
      );
      if (!result.rows[0])
        return reply.code(404).send({ error: 'Job not found', code: 'SNAPPROOF_JOB_NOT_FOUND' });
      await activity(
        request,
        'labor',
        String(result.rows[0]!.id),
        'created',
        'Labor added to job',
        { jobId },
      );
      return reply.code(201).send({ labor: camel(result.rows[0]) });
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.patch(`${base}/labor/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const laborId = identifier(request);
      const technician = text(input.technicianId ?? input.technicianUserId, 'technicianId', 36);
      if ('technicianId' in input || 'technicianUserId' in input)
        await assertTenantUser(tenant(request), technician);
      const result = await db.execute(
        sql`UPDATE snapproof_labor SET description=COALESCE(${text(input.description, 'description', 500)},description),hours=COALESCE(${input.hours === undefined ? null : decimal(input.hours, 'hours', 0.01, 10000)},hours),rate_cents=COALESCE(${input.rateCents === undefined ? null : integer(input.rateCents, 'rateCents', 0, 100000000)},rate_cents),technician_user_id=CASE WHEN ${'technicianId' in input || 'technicianUserId' in input} THEN ${technician} ELSE technician_user_id END,work_date=CASE WHEN ${'workDate' in input} THEN ${date(input.workDate, 'workDate')}::date ELSE work_date END,version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${laborId} AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM snapproof_cases WHERE tenant_id=${tenant(request)} AND id=snapproof_labor.case_id AND status NOT IN ('approved','archived')) RETURNING *,(hours*rate_cents)::bigint AS total_cents`,
      );
      if (!result.rows[0])
        return reply
          .code(409)
          .send({ error: 'Labor not found or job is immutable', code: 'SNAPPROOF_ITEM_IMMUTABLE' });
      return { labor: camel(result.rows[0]) };
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.delete(`${base}/labor/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const laborId = identifier(request);
      const result = await db.execute(
        sql`UPDATE snapproof_labor SET deleted_at=NOW(),version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${laborId} AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM snapproof_cases WHERE tenant_id=${tenant(request)} AND id=snapproof_labor.case_id AND status NOT IN ('approved','archived')) RETURNING id`,
      );
      if (!result.rows[0])
        return reply
          .code(409)
          .send({ error: 'Labor not found or job is immutable', code: 'SNAPPROOF_ITEM_IMMUTABLE' });
      return reply.code(204).send();
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post(
    `${base}/jobs/:id/files`,
    { preHandler: writeGuards, bodyLimit: 35_000_000 },
    async (request, reply) => {
      try {
        const input = body(request);
        const jobId = identifier(request);
        const mutation = text(input.clientMutationId, 'clientMutationId', 100);
        const parsed = parseEvidenceInput({
          ...input,
          evidenceType:
            input.fileType === 'image'
              ? 'photo'
              : input.fileType === 'audio'
                ? 'audio'
                : (input.evidenceType ?? 'document'),
          sourceType: input.sourceType ?? 'mobile_capture',
        });
        if (!(await job(tenant(request), jobId)))
          return reply.code(404).send({ error: 'Job not found', code: 'SNAPPROOF_JOB_NOT_FOUND' });
        const scrubbed =
          parsed.evidenceType === 'photo' && parsed.declaredMimeType?.toLowerCase().includes('jpeg')
            ? stripJpegExif(parsed.content!)
            : {
                content: parsed.content!,
                stripped: false,
                sourceSha256: createHash('sha256').update(parsed.content!).digest('hex'),
              };
        const privacy = {
          ...sanitizeContext(input.privacyMetadata, 'privacyMetadata'),
          exifPolicy:
            parsed.evidenceType === 'photo' ? 'strip-app1-before-storage' : 'not-applicable',
          exifStripped: scrubbed.stripped,
          sourceSha256: scrubbed.sourceSha256,
        };
        const moduleId = await snapModuleId();
        const saved = await db.transaction(async (tx) => {
          if (mutation) {
            await tx.execute(
              sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenant(request)}:${mutation}`},0))`,
            );
            const replay = await tx.execute(
              sql`SELECT * FROM snapproof_evidence_items WHERE tenant_id=${tenant(request)} AND client_mutation_id=${mutation} LIMIT 1`,
            );
            if (replay.rows[0]) return { row: replay.rows[0], attachment: null, replayed: true };
          }
          const attachment = await createAttachment(
            {
              tenantId: tenant(request),
              moduleId,
              objectType: 'snapproof_evidence',
              objectId: jobId,
              originalName: parsed.originalName!,
              declaredMimeType: parsed.declaredMimeType,
              content: scrubbed.content,
              createdByUserId: actor(request),
              correlationId: request.id,
            },
            tx,
          );
          const result = await tx.execute(
            sql`INSERT INTO snapproof_evidence_items(tenant_id,case_id,created_by_user_id,attachment_id,title,evidence_type,description,captured_at,source_type,source_reference,capture_context,attachment_sha256,caption,sort_order,privacy_metadata,client_mutation_id) VALUES (${tenant(request)},${jobId},${actor(request)},${attachment.id},${parsed.title},${parsed.evidenceType},${parsed.description},${parsed.capturedAt},${parsed.sourceType},${parsed.sourceReference},${JSON.stringify(parsed.captureContext)}::jsonb,${attachment.sha256},${text(input.caption, 'caption', 500)},${integer(input.sortOrder, 'sortOrder', 0, 100000, 0)},${JSON.stringify(privacy)}::jsonb,${mutation}) RETURNING *`,
          );
          return { row: result.rows[0]!, attachment, replayed: false };
        });
        if (saved.replayed) return reply.code(200).send({ file: camel(saved.row), replayed: true });
        await activity(request, 'file', String(saved.row.id), 'captured', 'Field file captured', {
          jobId,
          scanStatus: saved.attachment!.scan_status,
          clientMutationId: mutation,
          exifStripped: scrubbed.stripped,
        });
        return reply
          .code(201)
          .send({ file: camel(saved.row), scanStatus: saved.attachment!.scan_status });
      } catch (error) {
        return fail(reply, error);
      }
    },
  );
  app.patch(`${base}/files/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const fileId = identifier(request);
      const result = await db.execute(
        sql`UPDATE snapproof_evidence_items SET title=COALESCE(${text(input.title, 'title', 200)},title),description=CASE WHEN ${'description' in input} THEN ${text(input.description, 'description', 10000)} ELSE description END,caption=CASE WHEN ${'caption' in input} THEN ${text(input.caption, 'caption', 500)} ELSE caption END,sort_order=COALESCE(${input.sortOrder === undefined ? null : integer(input.sortOrder, 'sortOrder', 0, 100000)},sort_order),version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${fileId} AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM snapproof_cases WHERE tenant_id=${tenant(request)} AND id=snapproof_evidence_items.case_id AND status NOT IN ('approved','archived')) RETURNING *`,
      );
      if (!result.rows[0])
        return reply
          .code(409)
          .send({ error: 'File not found or job is immutable', code: 'SNAPPROOF_ITEM_IMMUTABLE' });
      await activity(
        request,
        'file',
        fileId,
        'metadata_updated',
        'File caption and ordering updated',
      );
      return { file: camel(result.rows[0]) };
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.delete(`${base}/files/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const fileId = identifier(request);
      const moduleId = await snapModuleId();
      const deleted = await db.transaction(async (tx) => {
        const found = await tx.execute(
          sql`SELECT e.attachment_id,e.case_id,a.version FROM snapproof_evidence_items e JOIN shared_attachments a ON a.tenant_id=e.tenant_id AND a.id=e.attachment_id WHERE e.tenant_id=${tenant(request)} AND e.id=${fileId} AND e.deleted_at IS NULL AND EXISTS(SELECT 1 FROM snapproof_cases WHERE tenant_id=${tenant(request)} AND id=e.case_id AND status NOT IN ('approved','archived')) FOR UPDATE`,
        );
        const row = found.rows[0] as Row | undefined;
        if (!row) return null;
        const attachment = await softDeleteAttachment(
          {
            tenantId: tenant(request),
            moduleId,
            attachmentId: String(row.attachment_id),
            deletedByUserId: actor(request),
            version: Number(row.version),
            objectType: 'snapproof_evidence',
            objectId: String(row.case_id),
          },
          tx,
        );
        if (!attachment) return null;
        await tx.execute(
          sql`UPDATE snapproof_evidence_items SET deleted_at=NOW(),version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${fileId}`,
        );
        return row;
      });
      if (!deleted)
        return reply
          .code(409)
          .send({ error: 'File not found or job is immutable', code: 'SNAPPROOF_ITEM_IMMUTABLE' });
      await activity(
        request,
        'file',
        fileId,
        'deleted',
        'File removed and retained under storage policy',
      );
      return reply.code(204).send();
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.get(`${base}/files/:id/download`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const fileId = identifier(request);
      const found = await db.execute(
        sql`SELECT e.attachment_id,e.case_id,a.original_name,a.detected_mime_type FROM snapproof_evidence_items e JOIN shared_attachments a ON a.tenant_id=e.tenant_id AND a.id=e.attachment_id WHERE e.tenant_id=${tenant(request)} AND e.id=${fileId} AND e.deleted_at IS NULL LIMIT 1`,
      );
      const row = found.rows[0] as Row | undefined;
      if (!row)
        return reply.code(404).send({ error: 'File not found', code: 'SNAPPROOF_FILE_NOT_FOUND' });
      const attachment = await getAttachmentContent({
        tenantId: tenant(request),
        moduleId: await snapModuleId(),
        attachmentId: String(row.attachment_id),
        objectType: 'snapproof_evidence',
        objectId: String(row.case_id),
      });
      if (!attachment)
        return reply.code(404).send({ error: 'File not found', code: 'SNAPPROOF_FILE_NOT_FOUND' });
      reply
        .type(String(row.detected_mime_type))
        .header(
          'Content-Disposition',
          `attachment; filename="${String(row.original_name).replaceAll('"', '')}"`,
        )
        .header('Cache-Control', 'private, no-store');
      return reply.send(attachment.content);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get(`${base}/templates`, { preHandler: readGuards }, async (request) => {
    const result = await db.execute(
      sql`SELECT * FROM snapproof_templates WHERE (tenant_id=${tenant(request)} OR is_system=TRUE) AND archived_at IS NULL ORDER BY is_system DESC,name`,
    );
    return { templates: list(result.rows) };
  });
  app.post(`${base}/templates`, { preHandler: adminGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const sections = Array.isArray(input.sections) ? input.sections : null;
      if (!sections || sections.length > 40)
        throw new InputError('sections must be an array with at most 40 entries');
      const result = await db.execute(
        sql`INSERT INTO snapproof_templates(tenant_id,created_by_user_id,name,description,industry,icon,default_job_type,sections,is_system) VALUES (${tenant(request)},${actor(request)},${text(input.name, 'name', 160, true)},${text(input.description, 'description', 5000)},${text(input.industry, 'industry', 80)},${text(input.icon, 'icon', 80)},${text(input.defaultJobType, 'defaultJobType', 80) ?? 'field_service'},${JSON.stringify(sections)}::jsonb,FALSE) RETURNING *`,
      );
      return reply.code(201).send({ template: camel(result.rows[0]) });
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.post(
    `${base}/jobs/:id/apply-template`,
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const input = body(request);
        const jobId = identifier(request);
        const templateId = text(input.templateId, 'templateId', 36, true)!;
        const template = await db.execute(
          sql`SELECT * FROM snapproof_templates WHERE id=${templateId} AND (tenant_id=${tenant(request)} OR is_system=TRUE) AND archived_at IS NULL LIMIT 1`,
        );
        if (!template.rows[0])
          return reply
            .code(404)
            .send({ error: 'Template not found', code: 'SNAPPROOF_TEMPLATE_NOT_FOUND' });
        const sections = (template.rows[0] as Row).sections;
        const result = await db.execute(
          sql`UPDATE snapproof_cases SET template_id=${templateId},job_type=${(template.rows[0] as Row).default_job_type},source_context=jsonb_set(source_context,'{templateSections}',${JSON.stringify(sections)}::jsonb,TRUE),version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${jobId} AND status IN ('draft','collecting') RETURNING *`,
        );
        if (!result.rows[0])
          return reply.code(409).send({
            error: 'Template cannot be applied to this job',
            code: 'SNAPPROOF_TEMPLATE_APPLY_BLOCKED',
          });
        await activity(
          request,
          'job',
          jobId,
          'template_applied',
          `Template ${(template.rows[0] as Row).name} applied`,
          { templateId },
        );
        return { job: jobView(result.rows[0] as Row), template: camel(template.rows[0]) };
      } catch (error) {
        return fail(reply, error);
      }
    },
  );

  app.get(`${base}/branding`, { preHandler: readGuards }, async (request) => {
    const result = await db.execute(
      sql`SELECT * FROM snapproof_branding WHERE tenant_id=${tenant(request)}`,
    );
    return {
      branding: camel(result.rows[0] || { accent_color: '#dc2626' }),
      authority: 'SnapProofOS organization settings',
    };
  });
  app.patch(`${base}/branding`, { preHandler: adminGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const accent = text(input.accentColor, 'accentColor', 7);
      if (accent && !/^#[0-9A-Fa-f]{6}$/.test(accent))
        throw new InputError('accentColor must be a six-digit hex color');
      const result = await db.execute(
        sql`INSERT INTO snapproof_branding(tenant_id,updated_by_user_id,accent_color,company_name,footer_text,contact_email,contact_phone,website) VALUES (${tenant(request)},${actor(request)},${accent ?? '#dc2626'},${text(input.companyName, 'companyName', 200)},${text(input.footerText, 'footerText', 500)},${text(input.contactEmail, 'contactEmail', 320)},${text(input.contactPhone, 'contactPhone', 40)},${text(input.website, 'website', 500)}) ON CONFLICT(tenant_id) DO UPDATE SET updated_by_user_id=EXCLUDED.updated_by_user_id,accent_color=COALESCE(${accent},snapproof_branding.accent_color),company_name=CASE WHEN ${'companyName' in input} THEN EXCLUDED.company_name ELSE snapproof_branding.company_name END,footer_text=CASE WHEN ${'footerText' in input} THEN EXCLUDED.footer_text ELSE snapproof_branding.footer_text END,contact_email=CASE WHEN ${'contactEmail' in input} THEN EXCLUDED.contact_email ELSE snapproof_branding.contact_email END,contact_phone=CASE WHEN ${'contactPhone' in input} THEN EXCLUDED.contact_phone ELSE snapproof_branding.contact_phone END,website=CASE WHEN ${'website' in input} THEN EXCLUDED.website ELSE snapproof_branding.website END,version=snapproof_branding.version+1,updated_at=NOW() RETURNING *`,
      );
      await activity(
        request,
        'branding',
        tenant(request),
        'updated',
        'Organization report branding updated',
      );
      return { branding: camel(result.rows[0]) };
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.post(
    `${base}/branding/logo`,
    { preHandler: adminGuards, bodyLimit: 12_000_000 },
    async (request, reply) => {
      try {
        const input = body(request);
        const parsed = parseEvidenceInput({
          title: 'Organization logo',
          evidenceType: 'photo',
          sourceType: 'branding',
          originalName: text(input.originalName, 'originalName', 240, true),
          declaredMimeType: text(input.declaredMimeType, 'declaredMimeType', 120, true),
          contentBase64: input.contentBase64,
        });
        if (!['image/png', 'image/jpeg'].includes(String(parsed.declaredMimeType).toLowerCase()))
          throw new InputError(
            'Logo must be a PNG or JPEG image',
            'SNAPPROOF_LOGO_TYPE_INVALID',
            422,
          );
        const scrubbed =
          String(parsed.declaredMimeType).toLowerCase() === 'image/jpeg'
            ? stripJpegExif(parsed.content!)
            : { content: parsed.content!, stripped: false };
        const moduleId = await snapModuleId();
        const saved = await db.transaction(async (tx) => {
          const attachment = await createAttachment(
            {
              tenantId: tenant(request),
              moduleId,
              objectType: 'snapproof_branding_logo',
              objectId: tenant(request),
              originalName: parsed.originalName!,
              declaredMimeType: parsed.declaredMimeType,
              content: scrubbed.content,
              createdByUserId: actor(request),
              correlationId: request.id,
            },
            tx,
          );
          const result = await tx.execute(
            sql`INSERT INTO snapproof_branding(tenant_id,updated_by_user_id,logo_attachment_id) VALUES (${tenant(request)},${actor(request)},${String(attachment.id)}) ON CONFLICT(tenant_id) DO UPDATE SET updated_by_user_id=EXCLUDED.updated_by_user_id,logo_attachment_id=EXCLUDED.logo_attachment_id,version=snapproof_branding.version+1,updated_at=NOW() RETURNING *`,
          );
          return { attachment, row: result.rows[0]! };
        });
        await activity(
          request,
          'branding_logo',
          String(saved.attachment.id),
          'uploaded',
          'Organization report logo uploaded',
          { scanStatus: saved.attachment.scan_status, exifStripped: scrubbed.stripped },
        );
        return reply
          .code(201)
          .send({ branding: camel(saved.row), scanStatus: saved.attachment.scan_status });
      } catch (error) {
        return fail(reply, error);
      }
    },
  );
  app.get(`${base}/branding/logo`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const found = await db.execute(
        sql`SELECT b.logo_attachment_id,a.original_name,a.detected_mime_type FROM snapproof_branding b JOIN shared_attachments a ON a.tenant_id=b.tenant_id AND a.id=b.logo_attachment_id WHERE b.tenant_id=${tenant(request)} LIMIT 1`,
      );
      const row = found.rows[0] as Row | undefined;
      if (!row?.logo_attachment_id)
        return reply
          .code(404)
          .send({ error: 'Organization logo not found', code: 'SNAPPROOF_LOGO_NOT_FOUND' });
      const attachment = await getAttachmentContent({
        tenantId: tenant(request),
        moduleId: await snapModuleId(),
        attachmentId: String(row.logo_attachment_id),
        objectType: 'snapproof_branding_logo',
        objectId: tenant(request),
      });
      if (!attachment)
        return reply
          .code(404)
          .send({ error: 'Organization logo not found', code: 'SNAPPROOF_LOGO_NOT_FOUND' });
      reply
        .type(String(row.detected_mime_type))
        .header(
          'Content-Disposition',
          `inline; filename="${String(row.original_name).replaceAll('"', '')}"`,
        )
        .header('Cache-Control', 'private, no-store');
      return reply.send(attachment.content);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.post(`${base}/reports/generate`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const jobId = text(input.jobId, 'jobId', 36, true)!;
      const snapshot = await buildReportSnapshot(tenant(request), jobId);
      const reportType = enumeration(
        input.reportType,
        'reportType',
        [
          'client_summary',
          'technical_summary',
          'estimate',
          'change_order',
          'executive_summary',
          'full_report',
        ] as const,
        'full_report',
      );
      const tone = enumeration(
        input.tone,
        'tone',
        ['client_friendly', 'technical', 'executive', 'concise', 'detailed'] as const,
        'client_friendly',
      );
      const title =
        text(input.title, 'title', 200) ?? `${(snapshot.job as Row).reference} Field Report`;
      const hash = sha256Json(snapshot);
      const result = await db.execute(
        sql`INSERT INTO snapproof_reports(tenant_id,case_id,created_by_user_id,title,status,content,content_hash,report_type,tone,branding_snapshot) VALUES (${tenant(request)},${jobId},${actor(request)},${title},'draft',${JSON.stringify(snapshot)}::jsonb,${hash},${reportType},${tone},${JSON.stringify(snapshot.branding)}::jsonb) RETURNING *`,
      );
      await activity(
        request,
        'report',
        String(result.rows[0]!.id),
        'generated',
        `Draft report ${title} generated`,
        { jobId, contentHash: hash },
      );
      return reply.code(201).send({ report: camel(result.rows[0]) });
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.patch(`${base}/reports/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const reportId = identifier(request);
      const current = await db.execute(
        sql`SELECT * FROM snapproof_reports WHERE tenant_id=${tenant(request)} AND id=${reportId} AND status IN ('draft','rejected') LIMIT 1`,
      );
      if (!current.rows[0])
        return reply.code(409).send({
          error: 'Approved or submitted reports are immutable',
          code: 'SNAPPROOF_REPORT_IMMUTABLE',
        });
      let content = (current.rows[0] as Row).content;
      if (input.regenerate === true)
        content = await buildReportSnapshot(
          tenant(request),
          String((current.rows[0] as Row).case_id),
        );
      const hash = sha256Json(content);
      const result = await db.execute(
        sql`UPDATE snapproof_reports SET title=COALESCE(${text(input.title, 'title', 200)},title),report_type=COALESCE(${text(input.reportType, 'reportType', 40)},report_type),tone=COALESCE(${text(input.tone, 'tone', 32)},tone),content=${JSON.stringify(content)}::jsonb,content_hash=${hash},status='draft',version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${reportId} AND status IN ('draft','rejected') RETURNING *`,
      );
      return { report: camel(result.rows[0]) };
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.post(`${base}/reports/:id/exports`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = body(request);
      const reportId = identifier(request);
      const format = enumeration(input.format, 'format', ['pdf', 'docx'] as const, 'pdf');
      const found = await db.execute(
        sql`SELECT * FROM snapproof_reports WHERE tenant_id=${tenant(request)} AND id=${reportId} AND status='approved' LIMIT 1`,
      );
      const report = found.rows[0] as Row | undefined;
      if (!report)
        return reply.code(404).send({
          error: 'Approved report not found',
          code: 'SNAPPROOF_APPROVED_REPORT_NOT_FOUND',
        });
      const artifact = buildSnapProofExport(report, format);
      if (!validateSnapProofArtifact(format, artifact.content))
        throw new InputError(
          'Generated export failed validation',
          'SNAPPROOF_EXPORT_VALIDATION_FAILED',
          500,
        );
      const provenance = {
        schema: 'operatoros.snapproof.export-provenance.v2',
        reportId,
        reportContentHash: report.content_hash,
        generatedAt: new Date().toISOString(),
        generatedByUserId: actor(request),
        format,
        byteLength: artifact.content.length,
      };
      const result = await db.execute(
        sql`INSERT INTO snapproof_exports(tenant_id,case_id,report_id,created_by_user_id,format,export_hash,provenance,content,content_type,filename,byte_length) VALUES (${tenant(request)},${report.case_id},${reportId},${actor(request)},${format},${artifact.sha256},${JSON.stringify(provenance)}::jsonb,${artifact.content},${artifact.contentType},${artifact.filename},${artifact.content.length}) RETURNING id,report_id,format,export_hash,content_type,filename,byte_length,created_at`,
      );
      await activity(
        request,
        'export',
        String(result.rows[0]!.id),
        'generated',
        `${format.toUpperCase()} report export generated`,
        { reportId, sha256: artifact.sha256 },
      );
      return reply.code(201).send({ export: camel(result.rows[0]) });
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.get(`${base}/exports`, { preHandler: readGuards }, async (request) => {
    const result = await db.execute(
      sql`SELECT id,case_id,report_id,format,export_hash,content_type,filename,byte_length,created_at FROM snapproof_exports WHERE tenant_id=${tenant(request)} ORDER BY created_at DESC LIMIT 100`,
    );
    return { exports: list(result.rows) };
  });
  app.get(`${base}/exports/:id/download`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const exportId = identifier(request);
      const result = await db.execute(
        sql`SELECT content,content_type,filename,export_hash FROM snapproof_exports WHERE tenant_id=${tenant(request)} AND id=${exportId} LIMIT 1`,
      );
      const row = result.rows[0] as Row | undefined;
      if (!row?.content)
        return reply
          .code(404)
          .send({ error: 'Export not found', code: 'SNAPPROOF_EXPORT_NOT_FOUND' });
      const content = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content);
      if (createHash('sha256').update(content).digest('hex') !== row.export_hash)
        return reply.code(409).send({
          error: 'Export integrity validation failed',
          code: 'SNAPPROOF_EXPORT_INTEGRITY_FAILED',
        });
      reply
        .type(String(row.content_type))
        .header(
          'Content-Disposition',
          `attachment; filename="${String(row.filename).replaceAll('"', '')}"`,
        )
        .header('Cache-Control', 'private, no-store')
        .header('X-SnapProof-Export-SHA256', String(row.export_hash));
      return reply.send(content);
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get(`${base}/reports/:id/share-links`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const reportId = identifier(request);
      const result = await db.execute(
        sql`SELECT id,report_id,expires_at,revoked_at,allow_download,access_count,last_accessed_at,created_at FROM snapproof_share_links WHERE tenant_id=${tenant(request)} AND report_id=${reportId} ORDER BY created_at DESC`,
      );
      return { shareLinks: list(result.rows) };
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.post(
    `${base}/reports/:id/share-links`,
    { preHandler: writeGuards },
    async (request, reply) => {
      try {
        const input = body(request);
        const reportId = identifier(request);
        const days = integer(input.expiresInDays, 'expiresInDays', 1, 90, 7);
        const raw = randomBytes(32).toString('base64url');
        const hash = createHash('sha256').update(raw).digest('hex');
        const result = await db.execute(
          sql`INSERT INTO snapproof_share_links(tenant_id,report_id,created_by_user_id,token_hash,expires_at,allow_download) SELECT ${tenant(request)},${reportId},${actor(request)},${hash},NOW()+(${days}::text||' days')::interval,${input.allowDownload === true} WHERE EXISTS(SELECT 1 FROM snapproof_reports WHERE tenant_id=${tenant(request)} AND id=${reportId} AND status='approved') RETURNING id,report_id,expires_at,allow_download,created_at`,
        );
        if (!result.rows[0])
          return reply.code(404).send({
            error: 'Approved report not found',
            code: 'SNAPPROOF_APPROVED_REPORT_NOT_FOUND',
          });
        await activity(
          request,
          'share_link',
          String(result.rows[0]!.id),
          'created',
          'Secure report share link created',
          { reportId, expiresInDays: days },
        );
        return reply.code(201).send({
          shareLink: {
            ...camel(result.rows[0]),
            url: `/public/snapproofos/reports/${raw}`,
            token: raw,
          },
        });
      } catch (error) {
        return fail(reply, error);
      }
    },
  );
  app.delete(`${base}/share-links/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const linkId = identifier(request);
      const result = await db.execute(
        sql`UPDATE snapproof_share_links SET revoked_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${linkId} AND revoked_at IS NULL RETURNING id,revoked_at`,
      );
      if (!result.rows[0])
        return reply
          .code(404)
          .send({ error: 'Share link not found', code: 'SNAPPROOF_SHARE_NOT_FOUND' });
      await activity(request, 'share_link', linkId, 'revoked', 'Secure report share link revoked');
      return { shareLink: camel(result.rows[0]) };
    } catch (error) {
      return fail(reply, error);
    }
  });

  app.get('/v1/public/snapproofos/reports/:token', async (request, reply) => {
    try {
      const raw = String((request.params as Row).token || '');
      if (!/^[A-Za-z0-9_-]{43}$/.test(raw))
        return reply
          .code(404)
          .send({ error: 'Shared report not found', code: 'SNAPPROOF_SHARE_NOT_FOUND' });
      if (!(await consumePublicRateLimit(request, reply))) return;
      const hash = createHash('sha256').update(raw).digest('hex');
      const found = await db.execute(
        sql`UPDATE snapproof_share_links SET access_count=access_count+1,last_accessed_at=NOW() WHERE token_hash=${hash} AND revoked_at IS NULL AND expires_at>NOW() RETURNING tenant_id,report_id,allow_download,expires_at`,
      );
      const link = found.rows[0] as Row | undefined;
      if (!link)
        return reply
          .code(404)
          .send({ error: 'Shared report not found', code: 'SNAPPROOF_SHARE_NOT_FOUND' });
      const result = await db.execute(
        sql`SELECT id,title,report_type,tone,status,content,content_hash,approved_at FROM snapproof_reports WHERE tenant_id=${link.tenant_id} AND id=${link.report_id} AND status='approved' LIMIT 1`,
      );
      if (!result.rows[0])
        return reply
          .code(404)
          .send({ error: 'Shared report not found', code: 'SNAPPROOF_SHARE_NOT_FOUND' });
      reply
        .header('Cache-Control', 'private, no-store')
        .header('X-Robots-Tag', 'noindex, nofollow');
      return {
        report: camel({ ...result.rows[0], content: undefined }),
        content: publicReportContent((result.rows[0] as Row).content),
        allowDownload: Boolean(link.allow_download),
        expiresAt: link.expires_at,
      };
    } catch (error) {
      return fail(reply, error);
    }
  });
  app.get('/v1/public/snapproofos/reports/:token/download', async (request, reply) => {
    try {
      const raw = String((request.params as Row).token || '');
      if (!/^[A-Za-z0-9_-]{43}$/.test(raw))
        return reply
          .code(404)
          .send({ error: 'Shared report not found', code: 'SNAPPROOF_SHARE_NOT_FOUND' });
      if (!(await consumePublicRateLimit(request, reply))) return;
      const hash = createHash('sha256').update(raw).digest('hex');
      const found = await db.execute(
        sql`WITH consumed AS (UPDATE snapproof_share_links SET access_count=access_count+1,last_accessed_at=NOW() WHERE token_hash=${hash} AND allow_download=TRUE AND revoked_at IS NULL AND expires_at>NOW() RETURNING tenant_id,report_id) SELECT r.* FROM consumed l JOIN snapproof_reports r ON r.tenant_id=l.tenant_id AND r.id=l.report_id WHERE r.status='approved' LIMIT 1`,
      );
      const report = found.rows[0] as Row | undefined;
      if (!report)
        return reply
          .code(404)
          .send({ error: 'Shared report not found', code: 'SNAPPROOF_SHARE_NOT_FOUND' });
      const format = enumeration(
        (request.query as Row)?.format,
        'format',
        ['pdf', 'docx'] as const,
        'pdf',
      );
      const artifact = buildSnapProofExport(report, format);
      reply
        .type(artifact.contentType)
        .header('Content-Disposition', `attachment; filename="${artifact.filename}"`)
        .header('Cache-Control', 'private, no-store')
        .header('X-SnapProof-Export-SHA256', artifact.sha256)
        .header('X-Robots-Tag', 'noindex, nofollow');
      return reply.send(artifact.content);
    } catch (error) {
      return fail(reply, error);
    }
  });
}
