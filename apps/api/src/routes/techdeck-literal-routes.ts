import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { modules } from '../schema.js';
import {
  requireTenantAdmin,
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import {
  authenticateSharedApiToken,
  createServiceIdentityAndToken,
  revokeApiToken,
} from '../lib/shared-platform-control-plane.js';
import {
  createOutboundWebhookEndpoint,
  enqueueOutboundWebhook,
  listOutboundWebhookEndpoints,
} from '../lib/shared-outbound-webhooks.js';
import {
  createAttachment,
  getAttachmentContent,
} from '../lib/shared-attachments.js';
import { getSharedAiProviderAdapter } from '../lib/shared-provider-adapters.js';
import { registerSharedJobHandler, type SharedJobContext } from '../lib/shared-background-jobs.js';
import { createSharedSchedule, requestSharedExport } from '../lib/shared-schedules-exports.js';
import { appendActivityEvent } from '../lib/shared-usage-activity.js';
import { storeEncryptedSecretReference } from '../lib/shared-secret-vault.js';
import { TECHDECK_COMPLIANCE_EXPORT_TYPE } from '../lib/techdeck-compliance-export.js';

export const TECHDECK_RECURRING_TICKET_HANDLER = 'techdeck.recurring-ticket.create.v1';

const readGuards = [requireTenantMember, requireTenantModuleAccess('techdeck')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const adminGuards = [...writeGuards, requireTenantAdmin];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;

type Dict = Record<string, unknown>;

class InputError extends Error {
  constructor(public code: string, public field?: string, public statusCode = 400) { super(code); }
}

function body(raw: unknown): Dict {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InputError('BODY_INVALID');
  return raw as Dict;
}

function textValue(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new InputError('FIELD_REQUIRED', field);
    return null;
  }
  if (typeof value !== 'string') throw new InputError('FIELD_INVALID', field);
  const result = value.trim();
  if (required && !result) throw new InputError('FIELD_REQUIRED', field);
  if (result.length > max) throw new InputError('FIELD_TOO_LONG', field);
  return result || null;
}

function integer(value: unknown, field: string, min: number, max: number, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new InputError('FIELD_INVALID', field);
  return Number(value);
}

function booleanValue(value: unknown, field: string, fallback?: boolean): boolean {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'boolean') throw new InputError('FIELD_INVALID', field);
  return value;
}

function dateValue(value: unknown, field: string, required = false): Date | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new InputError('FIELD_REQUIRED', field);
    return null;
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new InputError('FIELD_INVALID', field);
  return new Date(value);
}

function listValue(value: unknown, field: string, maxItems = 50): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems || value.some(item => typeof item !== 'string')) throw new InputError('FIELD_INVALID', field);
  return [...new Set(value.map(item => item.trim()).filter(Boolean))];
}

function objectValue(value: unknown, field: string): Dict {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('FIELD_INVALID', field);
  return value as Dict;
}

function sendInputError(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof InputError)) return false;
  reply.code(error.statusCode).send({ error: 'Invalid TechDeck request', code: error.code, field: error.field });
  return true;
}

function sendBoundedServiceError(reply: FastifyReply, error: unknown, prefix: string): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const code = String((error as { code?: unknown }).code ?? '');
  if (!code.startsWith(prefix)) return false;
  const message = error instanceof Error ? error.message : 'The requested service operation was rejected.';
  reply.code(400).send({ error: message, code });
  return true;
}

function tenant(request: FastifyRequest): string {
  return String((request as any).tenantContext.tenantId);
}

function actor(request: FastifyRequest): string {
  return String((request as any).user.id);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function publicRows(result: { rows: unknown[] }) {
  return result.rows;
}

let techDeckModuleIdPromise: Promise<string> | null = null;
async function techDeckModuleId(): Promise<string> {
  techDeckModuleIdPromise ??= db.select({ id: modules.id }).from(modules).where(eq(modules.slug, 'techdeck')).limit(1)
    .then(rows => {
      if (!rows[0]) throw Object.assign(new Error('TechDeck module is unavailable'), { code: 'TECHDECK_MODULE_UNAVAILABLE' });
      return rows[0].id;
    });
  return techDeckModuleIdPromise;
}

async function recordActivity(input: {
  tenantId: string;
  actorUserId: string | null;
  objectType: string;
  objectId: string;
  eventType: string;
  summary: string;
  metadata?: Dict;
  correlationId?: string | null;
}) {
  await appendActivityEvent({
    tenantId: input.tenantId,
    moduleId: await techDeckModuleId(),
    actorUserId: input.actorUserId,
    objectType: input.objectType,
    objectId: input.objectId,
    eventType: input.eventType,
    summary: input.summary,
    metadata: input.metadata,
    correlationId: input.correlationId,
  });
}

async function dispatchTechDeckEvent(input: {
  tenantId: string;
  eventType: string;
  payload: Dict;
  idempotencyKey: string;
  correlationId?: string | null;
}) {
  const moduleId = await techDeckModuleId();
  const endpoints = await listOutboundWebhookEndpoints({ tenantId: input.tenantId, moduleId });
  for (const endpoint of endpoints as Dict[]) {
    if (!endpoint.enabled || !Array.isArray(endpoint.event_types_json) || !(endpoint.event_types_json as unknown[]).includes(input.eventType)) continue;
    await enqueueOutboundWebhook({
      tenantId: input.tenantId,
      moduleId,
      endpointId: String(endpoint.id),
      eventType: input.eventType,
      payload: input.payload,
      idempotencyKey: `${input.idempotencyKey}:${endpoint.id}`,
      correlationId: input.correlationId,
    });
  }
}

async function consumeDurableLimit(table: 'techdeck_license_rate_limits' | 'techdeck_intake_rate_limits', key: string, limit: number, windowMs: number) {
  const bucket = hash(key);
  const expiresAt = new Date(Date.now() + windowMs);
  // Keep the finite table choice in code and all values parameterized. This is
  // intentionally duplicated so a future caller cannot turn a rate-limit key
  // into an interpolated SQL identifier or literal.
  const result = table === 'techdeck_license_rate_limits'
    ? await db.execute(sql`
        INSERT INTO techdeck_license_rate_limits (bucket_hash, request_count, expires_at)
        VALUES (${bucket}, 1, ${expiresAt.toISOString()})
        ON CONFLICT (bucket_hash) DO UPDATE SET
          request_count = CASE WHEN techdeck_license_rate_limits.expires_at <= NOW() THEN 1 ELSE techdeck_license_rate_limits.request_count + 1 END,
          expires_at = CASE WHEN techdeck_license_rate_limits.expires_at <= NOW() THEN EXCLUDED.expires_at ELSE techdeck_license_rate_limits.expires_at END,
          updated_at = NOW()
        RETURNING request_count
      `)
    : await db.execute(sql`
        INSERT INTO techdeck_intake_rate_limits (bucket_hash, request_count, expires_at)
        VALUES (${bucket}, 1, ${expiresAt.toISOString()})
        ON CONFLICT (bucket_hash) DO UPDATE SET
          request_count = CASE WHEN techdeck_intake_rate_limits.expires_at <= NOW() THEN 1 ELSE techdeck_intake_rate_limits.request_count + 1 END,
          expires_at = CASE WHEN techdeck_intake_rate_limits.expires_at <= NOW() THEN EXCLUDED.expires_at ELSE techdeck_intake_rate_limits.expires_at END,
          updated_at = NOW()
        RETURNING request_count
      `);
  return Number((result.rows[0] as Dict | undefined)?.request_count ?? limit + 1) <= limit;
}

async function validateDirectoryReferences(tenantId: string, organizationId: string | null, siteId: string | null) {
  if (!organizationId && siteId) throw new InputError('ORGANIZATION_REQUIRED', 'directoryOrganizationId');
  if (!organizationId) return;
  const result = await db.execute(sql`
    SELECT org.id, site.id AS site_id
    FROM directory_organizations org
    LEFT JOIN directory_sites site ON site.tenant_id=org.tenant_id AND site.organization_id=org.id AND site.id=${siteId}
    WHERE org.tenant_id=${tenantId} AND org.id=${organizationId} AND org.archived_at IS NULL LIMIT 1
  `);
  if (!result.rows[0]) throw new InputError('ORGANIZATION_NOT_FOUND', 'directoryOrganizationId', 404);
  if (siteId && !(result.rows[0] as Dict).site_id) throw new InputError('SITE_NOT_FOUND', 'directorySiteId', 404);
}

async function createRecurringTicket(context: SharedJobContext): Promise<void> {
  const title = textValue(context.payload.title, 'title', 200, true)!;
  const description = textValue(context.payload.description, 'description', 4_000);
  const priority = textValue(context.payload.priority, 'priority', 20) ?? 'medium';
  if (!['critical', 'high', 'medium', 'low'].includes(priority)) throw new InputError('PRIORITY_INVALID', 'priority');
  const organizationId = textValue(context.payload.directoryOrganizationId, 'directoryOrganizationId', 36);
  const siteId = textValue(context.payload.directorySiteId, 'directorySiteId', 36);
  const assigneeId = textValue(context.payload.assignedToUserId, 'assignedToUserId', 36);
  const scheduleId = textValue(context.payload.sharedScheduleId, 'sharedScheduleId', 36, true)!;
  const scheduledFor = dateValue(context.payload.scheduledFor, 'scheduledFor', true)!;
  await validateDirectoryReferences(context.tenantId, organizationId, siteId);
  const sourceKey = `schedule:${scheduleId}:${scheduledFor.toISOString()}`;
  await db.transaction(async tx => {
    const duplicate = await tx.execute(sql`SELECT id FROM techdeck_tickets WHERE tenant_id=${context.tenantId} AND description LIKE ${`%[${sourceKey}]%`} LIMIT 1`);
    if (duplicate.rows[0]) return;
    const allocation = await tx.execute(sql`
      INSERT INTO techdeck_ticket_sequences(tenant_id,last_number) VALUES (${context.tenantId},1)
      ON CONFLICT (tenant_id) DO UPDATE SET last_number=techdeck_ticket_sequences.last_number+1,updated_at=NOW()
      RETURNING last_number
    `);
    await tx.execute(sql`
      INSERT INTO techdeck_tickets(tenant_id,number,created_by_user_id,assigned_to_user_id,directory_organization_id,
        directory_site_id,title,description,priority,status)
      VALUES (${context.tenantId},${Number((allocation.rows[0] as Dict).last_number)},${context.requestedByUserId},${assigneeId},
        ${organizationId},${siteId},${title},${`${description ?? ''}\n\n[${sourceKey}]`.trim()},${priority},'open')
    `);
  });
}

registerSharedJobHandler(TECHDECK_RECURRING_TICKET_HANDLER, createRecurringTicket);

async function assignedPortalOrganizations(tenantId: string, userId: string) {
  return db.execute(sql`
    SELECT assignment.*, organization.name AS organization_name, site.name AS site_name
    FROM techdeck_portal_assignments assignment
    JOIN directory_organizations organization ON organization.tenant_id=assignment.tenant_id AND organization.id=assignment.directory_organization_id
    LEFT JOIN directory_sites site ON site.tenant_id=assignment.tenant_id AND site.id=assignment.directory_site_id
    WHERE assignment.tenant_id=${tenantId} AND assignment.user_id=${userId} AND assignment.revoked_at IS NULL
    ORDER BY organization.name, site.name NULLS FIRST
  `);
}

async function requirePortalAssignment(request: FastifyRequest, reply: FastifyReply, organizationId: string) {
  const assignments = await assignedPortalOrganizations(tenant(request), actor(request));
  const assignment = (assignments.rows as Dict[]).find(row => String(row.directory_organization_id) === organizationId);
  if (!assignment) {
    reply.code(404).send({ error: 'Client record not found', code: 'PORTAL_CLIENT_NOT_FOUND' });
    return null;
  }
  return assignment;
}

async function resolveIntakeRequest(rawToken: string) {
  if (!rawToken.startsWith('tdi_') || rawToken.length > 120) return null;
  const result = await db.execute(sql`
    SELECT request.*, space.allowed_file_types, space.max_file_size_bytes AS space_max_file_size_bytes,
      space.retention_days, space.external_uploads_enabled, space.status AS space_status
    FROM techdeck_intake_requests request
    JOIN techdeck_intake_spaces space ON space.tenant_id=request.tenant_id AND space.id=request.space_id
    WHERE request.token_hash=${hash(rawToken)} AND request.revoked_at IS NULL AND request.expires_at>NOW()
      AND request.completed_at IS NULL AND space.archived_at IS NULL LIMIT 1
  `);
  return (result.rows[0] as Dict | undefined) ?? null;
}

function bearer(request: FastifyRequest): string | null {
  const value = request.headers.authorization;
  return value?.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

async function headlessContext(request: FastifyRequest, reply: FastifyReply, scope: 'techdeck:read' | 'techdeck:write') {
  const rawToken = bearer(request);
  const context = rawToken ? await authenticateSharedApiToken({ rawToken, requiredScope: scope }) : null;
  const moduleId = await techDeckModuleId();
  if (!context || context.moduleId !== moduleId) {
    reply.code(401).header('WWW-Authenticate', 'Bearer').send({ error: 'Valid scoped API token required', code: 'API_TOKEN_INVALID' });
    return null;
  }
  return context as typeof context & { actorUserId?: string };
}

export async function registerTechDeckLiteralRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/modules/techdeck/literal-workspace', { preHandler: [...readGuards] }, async request => {
    const tenantId = tenant(request);
    const moduleId = await techDeckModuleId();
    const [appointments, schedules, portal, licenses, statusPages, intakeSpaces, intake, tokens, webhooks, exports] = await Promise.all([
      db.execute(sql`SELECT * FROM techdeck_appointments WHERE tenant_id=${tenantId} AND cancelled_at IS NULL ORDER BY starts_at LIMIT 200`),
      db.execute(sql`SELECT id,name,payload_json,interval_seconds,next_run_at,enabled,last_enqueued_at,last_error_code,version,created_at,updated_at
        FROM shared_schedules WHERE tenant_id=${tenantId} AND module_id=${moduleId} AND handler_key=${TECHDECK_RECURRING_TICKET_HANDLER} ORDER BY created_at DESC LIMIT 200`),
      db.execute(sql`SELECT assignment.id,assignment.user_id,assignment.directory_organization_id,assignment.directory_site_id,
        assignment.can_create_tickets,assignment.can_comment,assignment.can_view_evidence,assignment.version,organization.name AS organization_name,site.name AS site_name
        FROM techdeck_portal_assignments assignment JOIN directory_organizations organization ON organization.tenant_id=assignment.tenant_id AND organization.id=assignment.directory_organization_id
        LEFT JOIN directory_sites site ON site.tenant_id=assignment.tenant_id AND site.id=assignment.directory_site_id
        WHERE assignment.tenant_id=${tenantId} AND assignment.revoked_at IS NULL ORDER BY organization.name`),
      db.execute(sql`SELECT product.*,COALESCE((SELECT count(*)::int FROM techdeck_license_keys key WHERE key.tenant_id=product.tenant_id AND key.product_id=product.id),0) AS key_count
        FROM techdeck_license_products product WHERE product.tenant_id=${tenantId} AND product.archived_at IS NULL ORDER BY product.name`),
      db.execute(sql`SELECT page.*,COALESCE((SELECT count(*)::int FROM techdeck_status_components component WHERE component.tenant_id=page.tenant_id AND component.status_page_id=page.id AND component.archived_at IS NULL),0) AS component_count,
        COALESCE((SELECT count(*)::int FROM techdeck_status_incidents incident WHERE incident.tenant_id=page.tenant_id AND incident.status_page_id=page.id AND incident.archived_at IS NULL),0) AS incident_count
        FROM techdeck_status_pages page WHERE page.tenant_id=${tenantId} AND page.archived_at IS NULL ORDER BY page.title`),
      db.execute(sql`SELECT id,name,slug,description,allowed_file_types,max_file_size_bytes,retention_days,external_uploads_enabled,status,version
        FROM techdeck_intake_spaces WHERE tenant_id=${tenantId} AND archived_at IS NULL ORDER BY name`),
      db.execute(sql`SELECT request.id,request.space_id,request.title,request.token_prefix,request.max_uploads,request.upload_count,request.expires_at,
        request.completed_at,request.revoked_at,space.name AS space_name FROM techdeck_intake_requests request
        JOIN techdeck_intake_spaces space ON space.tenant_id=request.tenant_id AND space.id=request.space_id
        WHERE request.tenant_id=${tenantId} ORDER BY request.created_at DESC LIMIT 200`),
      db.execute(sql`SELECT token.id,token.name,token.token_prefix,token.scopes_json,token.expires_at,token.last_used_at,token.revoked_at,identity.name AS identity_name
        FROM shared_api_tokens token JOIN shared_service_identities identity ON identity.tenant_id=token.tenant_id AND identity.id=token.service_identity_id
        WHERE token.tenant_id=${tenantId} AND identity.module_id=${moduleId} ORDER BY token.created_at DESC LIMIT 200`),
      listOutboundWebhookEndpoints({ tenantId, moduleId }),
      db.execute(sql`SELECT job_export.id,job_export.export_type,job_export.format,job_export.status,job_export.result_attachment_id,
        job_export.last_error_code,job_export.created_at,job_export.completed_at,job_export.expires_at,attachment.scan_status AS attachment_scan_status
        FROM shared_exports job_export LEFT JOIN shared_attachments attachment
          ON attachment.tenant_id=job_export.tenant_id AND attachment.module_id=job_export.module_id AND attachment.id=job_export.result_attachment_id AND attachment.deleted_at IS NULL
        WHERE job_export.tenant_id=${tenantId} AND job_export.module_id=${moduleId} AND job_export.export_type=${TECHDECK_COMPLIANCE_EXPORT_TYPE}
        ORDER BY job_export.created_at DESC LIMIT 200`),
    ]);
    return {
      appointments: publicRows(appointments), schedules: publicRows(schedules), portalAssignments: publicRows(portal),
      licenseProducts: publicRows(licenses), statusPages: publicRows(statusPages), intakeSpaces: publicRows(intakeSpaces), intakeRequests: publicRows(intake),
      apiTokens: publicRows(tokens), webhooks, exports: publicRows(exports),
    };
  });

  app.get('/v1/modules/techdeck/appointments', { preHandler: [...readGuards] }, async request => ({ appointments: publicRows(await db.execute(sql`
    SELECT * FROM techdeck_appointments WHERE tenant_id=${tenant(request)} AND cancelled_at IS NULL ORDER BY starts_at LIMIT 200
  `)) }));

  app.post('/v1/modules/techdeck/appointments', { preHandler: [...writeGuards] }, async (request, reply) => {
    try {
      const input = body(request.body);
      const tenantId = tenant(request);
      const organizationId = textValue(input.directoryOrganizationId, 'directoryOrganizationId', 36);
      const siteId = textValue(input.directorySiteId, 'directorySiteId', 36);
      const startsAt = dateValue(input.startsAt, 'startsAt', true)!;
      const endsAt = dateValue(input.endsAt, 'endsAt', true)!;
      if (endsAt <= startsAt) throw new InputError('APPOINTMENT_RANGE_INVALID', 'endsAt');
      await validateDirectoryReferences(tenantId, organizationId, siteId);
      const result = await db.execute(sql`
        INSERT INTO techdeck_appointments(tenant_id,directory_organization_id,directory_site_id,ticket_id,assigned_to_user_id,title,description,starts_at,ends_at,created_by_user_id)
        VALUES (${tenantId},${organizationId},${siteId},${textValue(input.ticketId,'ticketId',36)},${textValue(input.assignedToUserId,'assignedToUserId',36)},
          ${textValue(input.title,'title',200,true)},${textValue(input.description,'description',4000)},${startsAt},${endsAt},${actor(request)}) RETURNING *
      `);
      const row = result.rows[0] as Dict;
      await recordActivity({ tenantId, actorUserId: actor(request), objectType: 'techdeck_appointment', objectId: String(row.id), eventType: 'appointment_created', summary: `Created appointment ${String(row.title)}`, correlationId: request.id });
      return reply.code(201).send(row);
    } catch (error) { if (sendInputError(reply, error)) return; throw error; }
  });

  app.patch('/v1/modules/techdeck/appointments/:id', { preHandler: [...writeGuards] }, async (request, reply) => {
    try {
      const input = body(request.body);
      const { id } = request.params as { id: string };
      const status = textValue(input.status, 'status', 30);
      if (status && !['scheduled','confirmed','completed','cancelled'].includes(status)) throw new InputError('APPOINTMENT_STATUS_INVALID','status');
      const result = await db.execute(sql`
        UPDATE techdeck_appointments SET title=COALESCE(${textValue(input.title,'title',200)},title),
          description=COALESCE(${textValue(input.description,'description',4000)},description), status=COALESCE(${status},status),
          cancelled_at=CASE WHEN ${status}='cancelled' THEN NOW() ELSE cancelled_at END,version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${integer(input.expectedVersion,'expectedVersion',1,1000000)} AND cancelled_at IS NULL RETURNING *
      `);
      if (!result.rows[0]) return reply.code(409).send({ error: 'Appointment changed or not found', code: 'APPOINTMENT_VERSION_CONFLICT' });
      return result.rows[0];
    } catch (error) { if (sendInputError(reply, error)) return; throw error; }
  });

  app.get('/v1/modules/techdeck/recurring-tickets', { preHandler: [...readGuards] }, async request => {
    const moduleId = await techDeckModuleId();
    return { schedules: publicRows(await db.execute(sql`SELECT id,name,payload_json,interval_seconds,next_run_at,enabled,last_enqueued_at,last_error_code,version,created_at,updated_at
      FROM shared_schedules WHERE tenant_id=${tenant(request)} AND module_id=${moduleId} AND handler_key=${TECHDECK_RECURRING_TICKET_HANDLER} ORDER BY created_at DESC LIMIT 200`)) };
  });

  app.post('/v1/modules/techdeck/recurring-tickets', { preHandler: [...adminGuards] }, async (request, reply) => {
    try {
      const input = body(request.body);
      const tenantId = tenant(request);
      const moduleId = await techDeckModuleId();
      const organizationId = textValue(input.directoryOrganizationId,'directoryOrganizationId',36);
      const siteId = textValue(input.directorySiteId,'directorySiteId',36);
      await validateDirectoryReferences(tenantId, organizationId, siteId);
      const priority = textValue(input.priority,'priority',20) ?? 'medium';
      if (!['critical','high','medium','low'].includes(priority)) throw new InputError('PRIORITY_INVALID','priority');
      const intervalDays = integer(input.intervalDays,'intervalDays',1,30);
      const schedule = await createSharedSchedule({
        tenantId,moduleId,actorUserId:actor(request),name:textValue(input.name,'name',120,true)!,handlerKey:TECHDECK_RECURRING_TICKET_HANDLER,
        payload:{ title:textValue(input.title,'title',200,true),description:textValue(input.description,'description',4000),priority,
          directoryOrganizationId:organizationId,directorySiteId:siteId,assignedToUserId:textValue(input.assignedToUserId,'assignedToUserId',36) },
        intervalSeconds:intervalDays*86400,nextRunAt:dateValue(input.nextRunAt,'nextRunAt',true)!,
      });
      return reply.code(201).send({ schedule });
    } catch (error) { if (sendInputError(reply, error)) return; throw error; }
  });

  app.patch('/v1/modules/techdeck/recurring-tickets/:id', { preHandler: [...adminGuards] }, async (request, reply) => {
    try {
      const input=body(request.body); const {id}=request.params as {id:string}; const moduleId=await techDeckModuleId();
      const result=await db.execute(sql`UPDATE shared_schedules SET enabled=${booleanValue(input.enabled,'enabled')},version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenant(request)} AND module_id=${moduleId} AND id=${id} AND handler_key=${TECHDECK_RECURRING_TICKET_HANDLER}
          AND version=${integer(input.expectedVersion,'expectedVersion',1,1000000)} RETURNING *`);
      if(!result.rows[0]) return reply.code(409).send({error:'Schedule changed or not found',code:'SCHEDULE_VERSION_CONFLICT'});
      return {schedule:result.rows[0]};
    } catch(error){if(sendInputError(reply,error))return;throw error;}
  });

  app.get('/v1/modules/techdeck/portal-assignments', { preHandler: [...adminGuards] }, async request => ({ assignments: publicRows(await db.execute(sql`
    SELECT assignment.*,organization.name AS organization_name,site.name AS site_name FROM techdeck_portal_assignments assignment
    JOIN directory_organizations organization ON organization.tenant_id=assignment.tenant_id AND organization.id=assignment.directory_organization_id
    LEFT JOIN directory_sites site ON site.tenant_id=assignment.tenant_id AND site.id=assignment.directory_site_id
    WHERE assignment.tenant_id=${tenant(request)} AND assignment.revoked_at IS NULL ORDER BY organization.name
  `)) }));

  app.post('/v1/modules/techdeck/portal-assignments', { preHandler: [...adminGuards] }, async (request, reply) => {
    try {
      const input=body(request.body); const tenantId=tenant(request); const organizationId=textValue(input.directoryOrganizationId,'directoryOrganizationId',36,true)!;
      const siteId=textValue(input.directorySiteId,'directorySiteId',36); await validateDirectoryReferences(tenantId,organizationId,siteId);
      const userId=textValue(input.userId,'userId',36,true)!;
      const member=await db.execute(sql`SELECT 1 FROM tenant_users WHERE tenant_id=${tenantId} AND user_id=${userId} LIMIT 1`);
      if(!member.rows[0]) throw new InputError('USER_NOT_TENANT_MEMBER','userId',404);
      const result=await db.execute(sql`INSERT INTO techdeck_portal_assignments(tenant_id,user_id,directory_organization_id,directory_site_id,
        can_create_tickets,can_comment,can_view_evidence,created_by_user_id) VALUES (${tenantId},${userId},${organizationId},${siteId},
        ${booleanValue(input.canCreateTickets,'canCreateTickets',true)},${booleanValue(input.canComment,'canComment',true)},${booleanValue(input.canViewEvidence,'canViewEvidence',true)},${actor(request)}) RETURNING *`);
      return reply.code(201).send(result.rows[0]);
    }catch(error){if(sendInputError(reply,error))return;throw error;}
  });

  app.delete('/v1/modules/techdeck/portal-assignments/:id', { preHandler: [...adminGuards] }, async (request, reply) => {
    const {id}=request.params as {id:string}; const result=await db.execute(sql`UPDATE techdeck_portal_assignments SET revoked_at=NOW(),version=version+1,updated_at=NOW()
      WHERE tenant_id=${tenant(request)} AND id=${id} AND revoked_at IS NULL RETURNING id`);
    if(!result.rows[0])return reply.code(404).send({error:'Portal assignment not found',code:'PORTAL_ASSIGNMENT_NOT_FOUND'}); return {ok:true};
  });

  app.get('/v1/modules/techdeck/portal/me', { preHandler: [...readGuards] }, async request => {
    const tenantId=tenant(request);const userId=actor(request);const assignments=await assignedPortalOrganizations(tenantId,userId);
    const ids=(assignments.rows as Dict[]).map(row=>String(row.directory_organization_id));
    if(ids.length===0)return {assignments:[],tickets:[],evidence:[]};
    const organizationList=sql.join(ids.map(id=>sql`${id}`),sql`,`);
    const tickets=await db.execute(sql`SELECT * FROM techdeck_tickets WHERE tenant_id=${tenantId} AND directory_organization_id IN (${organizationList}) AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200`);
    const evidence=await db.execute(sql`SELECT id,title,evidence_type,summary,observed_at,tags,created_at FROM techdeck_evidence WHERE tenant_id=${tenantId} AND directory_organization_id IN (${organizationList}) AND archived_at IS NULL ORDER BY created_at DESC LIMIT 200`);
    return {assignments:assignments.rows,tickets:tickets.rows,evidence:evidence.rows};
  });

  app.get('/v1/modules/techdeck/portal/tickets/:id/comments', { preHandler: [...readGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ticket = await db.execute(sql`SELECT id,directory_organization_id FROM techdeck_tickets WHERE tenant_id=${tenant(request)} AND id=${id} AND deleted_at IS NULL LIMIT 1`);
    const organizationId = String((ticket.rows[0] as Dict | undefined)?.directory_organization_id ?? '');
    if (!organizationId || !await requirePortalAssignment(request, reply, organizationId)) return;
    return { comments: publicRows(await db.execute(sql`SELECT id,body,author_user_id,version,created_at,updated_at FROM techdeck_ticket_comments WHERE tenant_id=${tenant(request)} AND ticket_id=${id} AND deleted_at IS NULL ORDER BY created_at`)) };
  });

  app.post('/v1/modules/techdeck/portal/tickets/:id/comments', { preHandler: [...writeGuards] }, async (request, reply) => {
    try {
      const input = body(request.body); const { id } = request.params as { id: string };
      const ticket = await db.execute(sql`SELECT id,directory_organization_id FROM techdeck_tickets WHERE tenant_id=${tenant(request)} AND id=${id} AND deleted_at IS NULL LIMIT 1`);
      const organizationId = String((ticket.rows[0] as Dict | undefined)?.directory_organization_id ?? '');
      const assignment = organizationId ? await requirePortalAssignment(request, reply, organizationId) : null;
      if (!assignment) return;
      if (!assignment.can_comment) return reply.code(403).send({ error: 'Portal comments are disabled', code: 'PORTAL_COMMENT_DENIED' });
      const result = await db.execute(sql`INSERT INTO techdeck_ticket_comments(tenant_id,ticket_id,author_user_id,body) VALUES (${tenant(request)},${id},${actor(request)},${textValue(input.body,'body',8000,true)}) RETURNING *`);
      return reply.code(201).send(result.rows[0]);
    } catch (error) { if (sendInputError(reply, error)) return; throw error; }
  });

  app.post('/v1/modules/techdeck/portal/tickets', { preHandler: [...writeGuards] }, async (request,reply)=>{
    try{const input=body(request.body);const tenantId=tenant(request);const organizationId=textValue(input.directoryOrganizationId,'directoryOrganizationId',36,true)!;
      const assignment=await requirePortalAssignment(request,reply,organizationId);if(!assignment)return;if(!assignment.can_create_tickets)return reply.code(403).send({error:'Portal ticket creation is disabled',code:'PORTAL_TICKET_CREATE_DENIED'});
      const allocation=await db.execute(sql`INSERT INTO techdeck_ticket_sequences(tenant_id,last_number) VALUES (${tenantId},1) ON CONFLICT(tenant_id) DO UPDATE SET last_number=techdeck_ticket_sequences.last_number+1,updated_at=NOW() RETURNING last_number`);
      const result=await db.execute(sql`INSERT INTO techdeck_tickets(tenant_id,number,created_by_user_id,directory_organization_id,directory_site_id,title,description,priority,status)
        VALUES (${tenantId},${Number((allocation.rows[0] as Dict).last_number)},${actor(request)},${organizationId},${textValue(input.directorySiteId,'directorySiteId',36)},${textValue(input.title,'title',200,true)},${textValue(input.description,'description',4000)},${textValue(input.priority,'priority',20)??'medium'},'open') RETURNING *`);
      return reply.code(201).send(result.rows[0]);
    }catch(error){if(sendInputError(reply,error))return;throw error;}
  });

  app.get('/v1/modules/techdeck/license/products', {preHandler:[...readGuards]},async request=>({products:publicRows(await db.execute(sql`SELECT * FROM techdeck_license_products WHERE tenant_id=${tenant(request)} AND archived_at IS NULL ORDER BY name`))}));
  app.post('/v1/modules/techdeck/license/products',{preHandler:[...adminGuards]},async(request,reply)=>{try{const input=body(request.body);const slug=textValue(input.slug,'slug',120,true)!;if(!SLUG.test(slug))throw new InputError('SLUG_INVALID','slug');
    const result=await db.execute(sql`INSERT INTO techdeck_license_products(tenant_id,name,slug,description,created_by_user_id) VALUES (${tenant(request)},${textValue(input.name,'name',160,true)},${slug},${textValue(input.description,'description',4000)},${actor(request)}) RETURNING *`);return reply.code(201).send(result.rows[0]);
  }catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.patch('/v1/modules/techdeck/license/products/:id',{preHandler:[...adminGuards]},async(request,reply)=>{try{const input=body(request.body);const{id}=request.params as{id:string};const result=await db.execute(sql`UPDATE techdeck_license_products SET name=COALESCE(${textValue(input.name,'name',160)},name),description=COALESCE(${textValue(input.description,'description',4000)},description),active=COALESCE(${input.active===undefined?null:booleanValue(input.active,'active')},active),version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${integer(input.expectedVersion,'expectedVersion',1,1000000)} AND archived_at IS NULL RETURNING *`);if(!result.rows[0])return reply.code(409).send({error:'Product changed or not found',code:'LICENSE_PRODUCT_VERSION_CONFLICT'});return result.rows[0];}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.get('/v1/modules/techdeck/license/products/:productId/keys',{preHandler:[...adminGuards]},async request=>{const{productId}=request.params as{productId:string};return{keys:publicRows(await db.execute(sql`SELECT key.id,key.product_id,key.label,key.key_prefix,key.max_activations,key.expires_at,key.created_at,key.revoked_at,COALESCE((SELECT count(*)::int FROM techdeck_license_activations activation WHERE activation.tenant_id=key.tenant_id AND activation.license_key_id=key.id AND activation.revoked_at IS NULL),0) AS activation_count FROM techdeck_license_keys key WHERE key.tenant_id=${tenant(request)} AND key.product_id=${productId} ORDER BY key.created_at DESC`))};});
  app.post('/v1/modules/techdeck/license/products/:productId/keys',{preHandler:[...adminGuards]},async(request,reply)=>{try{const input=body(request.body);const{productId}=request.params as{productId:string};const rawKey=`tdk_${randomBytes(24).toString('base64url')}`;const result=await db.execute(sql`INSERT INTO techdeck_license_keys(tenant_id,product_id,label,key_prefix,key_hash,max_activations,expires_at,created_by_user_id) SELECT ${tenant(request)},id,${textValue(input.label,'label',160)},${rawKey.slice(0,12)},${hash(rawKey)},${integer(input.maxActivations,'maxActivations',1,10000,1)},${dateValue(input.expiresAt,'expiresAt')},${actor(request)} FROM techdeck_license_products WHERE tenant_id=${tenant(request)} AND id=${productId} AND active=TRUE AND archived_at IS NULL RETURNING id,product_id,label,key_prefix,max_activations,expires_at,created_at`);if(!result.rows[0])return reply.code(404).send({error:'License product not found',code:'LICENSE_PRODUCT_NOT_FOUND'});return reply.code(201).send({key:result.rows[0],rawKey});}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.post('/v1/modules/techdeck/license/keys/:id/revoke',{preHandler:[...adminGuards]},async(request,reply)=>{const{id}=request.params as{id:string};const result=await db.execute(sql`UPDATE techdeck_license_keys SET revoked_at=COALESCE(revoked_at,NOW()) WHERE tenant_id=${tenant(request)} AND id=${id} RETURNING id,revoked_at`);if(!result.rows[0])return reply.code(404).send({error:'License key not found',code:'LICENSE_KEY_NOT_FOUND'});return result.rows[0];});

  app.post('/v1/public/techdeck/license/validate',async(request,reply)=>{try{const input=body(request.body);const rawKey=textValue(input.key,'key',120,true)!;const device=textValue(input.deviceFingerprint,'deviceFingerprint',500,true)!;if(!await consumeDurableLimit('techdeck_license_rate_limits',`license:${request.ip}`,30,60_000))return reply.code(429).send({valid:false,code:'RATE_LIMITED'});
    const keyHash=hash(rawKey);const deviceHash=hash(device);const result=await db.execute(sql`SELECT key.id,key.tenant_id,key.product_id,key.max_activations,key.expires_at,key.revoked_at,product.name,product.slug,product.active FROM techdeck_license_keys key JOIN techdeck_license_products product ON product.tenant_id=key.tenant_id AND product.id=key.product_id WHERE key.key_hash=${keyHash} LIMIT 1`);const row=result.rows[0] as Dict|undefined;
    if(!row||row.revoked_at||!row.active||(row.expires_at&&new Date(String(row.expires_at))<=new Date()))return reply.code(200).send({valid:false,code:'LICENSE_INVALID'});
    const active=await db.execute(sql`SELECT id FROM techdeck_license_activations WHERE tenant_id=${String(row.tenant_id)} AND license_key_id=${String(row.id)} AND revoked_at IS NULL`);const existing=await db.execute(sql`SELECT id FROM techdeck_license_activations WHERE tenant_id=${String(row.tenant_id)} AND license_key_id=${String(row.id)} AND device_fingerprint_hash=${deviceHash} LIMIT 1`);
    if(!existing.rows[0]&&active.rows.length>=Number(row.max_activations))return reply.code(200).send({valid:false,code:'ACTIVATION_LIMIT_REACHED'});
    await db.execute(sql`INSERT INTO techdeck_license_activations(tenant_id,license_key_id,device_fingerprint_hash,client_ip_hash,user_agent) VALUES (${String(row.tenant_id)},${String(row.id)},${deviceHash},${hash(request.ip)},${String(request.headers['user-agent']??'').slice(0,300)}) ON CONFLICT(tenant_id,license_key_id,device_fingerprint_hash) DO UPDATE SET last_validated_at=NOW() RETURNING id`);
    return {valid:true,product:{id:row.product_id,name:row.name,slug:row.slug},expiresAt:row.expires_at??null};
  }catch(error){if(sendInputError(reply,error))return;throw error;}});

  app.get('/v1/modules/techdeck/status/pages',{preHandler:[...readGuards]},async request=>({pages:publicRows(await db.execute(sql`SELECT * FROM techdeck_status_pages WHERE tenant_id=${tenant(request)} AND archived_at IS NULL ORDER BY title`))}));
  app.post('/v1/modules/techdeck/status/pages',{preHandler:[...adminGuards]},async(request,reply)=>{try{const input=body(request.body);const slug=textValue(input.publicSlug,'publicSlug',120,true)!;if(!SLUG.test(slug))throw new InputError('SLUG_INVALID','publicSlug');const result=await db.execute(sql`INSERT INTO techdeck_status_pages(tenant_id,title,public_slug,description,public,created_by_user_id) VALUES (${tenant(request)},${textValue(input.title,'title',160,true)},${slug},${textValue(input.description,'description',4000)},${booleanValue(input.public,'public',false)},${actor(request)}) RETURNING *`);return reply.code(201).send(result.rows[0]);}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.post('/v1/modules/techdeck/status/pages/:pageId/components',{preHandler:[...adminGuards]},async(request,reply)=>{try{const input=body(request.body);const{pageId}=request.params as{pageId:string};const status=textValue(input.status,'status',30)??'operational';if(!['operational','degraded','partial_outage','major_outage','maintenance'].includes(status))throw new InputError('STATUS_INVALID','status');const result=await db.execute(sql`INSERT INTO techdeck_status_components(tenant_id,status_page_id,name,description,status,display_order) SELECT ${tenant(request)},id,${textValue(input.name,'name',160,true)},${textValue(input.description,'description',4000)},${status},${integer(input.displayOrder,'displayOrder',0,10000,0)} FROM techdeck_status_pages WHERE tenant_id=${tenant(request)} AND id=${pageId} AND archived_at IS NULL RETURNING *`);if(!result.rows[0])return reply.code(404).send({error:'Status page not found',code:'STATUS_PAGE_NOT_FOUND'});return reply.code(201).send(result.rows[0]);}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.patch('/v1/modules/techdeck/status/components/:id',{preHandler:[...adminGuards]},async(request,reply)=>{try{const input=body(request.body);const{id}=request.params as{id:string};const status=textValue(input.status,'status',30);if(status&&!['operational','degraded','partial_outage','major_outage','maintenance'].includes(status))throw new InputError('STATUS_INVALID','status');const result=await db.execute(sql`UPDATE techdeck_status_components SET name=COALESCE(${textValue(input.name,'name',160)},name),description=COALESCE(${textValue(input.description,'description',4000)},description),status=COALESCE(${status},status),version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${integer(input.expectedVersion,'expectedVersion',1,1000000)} AND archived_at IS NULL RETURNING *`);if(!result.rows[0])return reply.code(409).send({error:'Component changed or not found',code:'STATUS_COMPONENT_VERSION_CONFLICT'});return result.rows[0];}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.post('/v1/modules/techdeck/status/pages/:pageId/incidents',{preHandler:[...adminGuards]},async(request,reply)=>{try{const input=body(request.body);const{pageId}=request.params as{pageId:string};const severity=textValue(input.severity,'severity',30)??'minor';if(!['maintenance','minor','major','critical'].includes(severity))throw new InputError('SEVERITY_INVALID','severity');const result=await db.execute(sql`INSERT INTO techdeck_status_incidents(tenant_id,status_page_id,title,description,severity,created_by_user_id) SELECT ${tenant(request)},id,${textValue(input.title,'title',200,true)},${textValue(input.description,'description',8000,true)},${severity},${actor(request)} FROM techdeck_status_pages WHERE tenant_id=${tenant(request)} AND id=${pageId} AND archived_at IS NULL RETURNING *`);if(!result.rows[0])return reply.code(404).send({error:'Status page not found',code:'STATUS_PAGE_NOT_FOUND'});return reply.code(201).send(result.rows[0]);}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.patch('/v1/modules/techdeck/status/incidents/:id',{preHandler:[...adminGuards]},async(request,reply)=>{try{const input=body(request.body);const{id}=request.params as{id:string};const status=textValue(input.status,'status',30,true)!;if(!['investigating','identified','monitoring','resolved'].includes(status))throw new InputError('STATUS_INVALID','status');const message=textValue(input.message,'message',8000,true)!;const result=await db.transaction(async tx=>{const updated=await tx.execute(sql`UPDATE techdeck_status_incidents SET status=${status},description=COALESCE(${textValue(input.description,'description',8000)},description),resolved_at=CASE WHEN ${status}='resolved' THEN NOW() ELSE resolved_at END,version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${id} AND version=${integer(input.expectedVersion,'expectedVersion',1,1000000)} AND archived_at IS NULL RETURNING *`);if(!updated.rows[0])return null;await tx.execute(sql`INSERT INTO techdeck_status_incident_updates(tenant_id,incident_id,status,message,created_by_user_id) VALUES (${tenant(request)},${id},${status},${message},${actor(request)})`);return updated.rows[0];});if(!result)return reply.code(409).send({error:'Incident changed or not found',code:'STATUS_INCIDENT_VERSION_CONFLICT'});await dispatchTechDeckEvent({tenantId:tenant(request),eventType:'techdeck.status.incident_updated',payload:{incidentId:id,status,message},idempotencyKey:`status:${id}:${(result as Dict).version}`,correlationId:request.id});return result;}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.get('/v1/public/techdeck/status/:slug',async(request,reply)=>{const{slug}=request.params as{slug:string};if(!SLUG.test(slug))return reply.code(404).send({error:'Status page not found',code:'STATUS_PAGE_NOT_FOUND'});const page=await db.execute(sql`SELECT id,title,public_slug,description,updated_at FROM techdeck_status_pages WHERE public_slug=${slug} AND public=TRUE AND archived_at IS NULL LIMIT 1`);if(!page.rows[0])return reply.code(404).send({error:'Status page not found',code:'STATUS_PAGE_NOT_FOUND'});const row=page.rows[0] as Dict;
    // tenant_id is intentionally re-resolved server-side without returning it.
    const detail=await db.execute(sql`SELECT component.id,component.name,component.description,component.status,component.display_order,component.updated_at FROM techdeck_status_components component JOIN techdeck_status_pages page ON page.tenant_id=component.tenant_id AND page.id=component.status_page_id WHERE page.id=${String(row.id)} AND page.public_slug=${slug} AND component.archived_at IS NULL ORDER BY component.display_order,component.id`);
    const incidents=await db.execute(sql`SELECT incident.id,incident.title,incident.description,incident.severity,incident.status,incident.started_at,incident.resolved_at,incident.updated_at,COALESCE((SELECT jsonb_agg(jsonb_build_object('status',update.status,'message',update.message,'createdAt',update.created_at) ORDER BY update.created_at) FROM techdeck_status_incident_updates update WHERE update.tenant_id=incident.tenant_id AND update.incident_id=incident.id),'[]'::jsonb) AS updates FROM techdeck_status_incidents incident JOIN techdeck_status_pages page ON page.tenant_id=incident.tenant_id AND page.id=incident.status_page_id WHERE page.id=${String(row.id)} AND page.public_slug=${slug} AND incident.archived_at IS NULL ORDER BY incident.started_at DESC LIMIT 100`);
    return{page:row,components:detail.rows,incidents:incidents.rows};});

  app.get('/v1/modules/techdeck/api-tokens',{preHandler:[...adminGuards]},async request=>{const moduleId=await techDeckModuleId();return{tokens:publicRows(await db.execute(sql`SELECT token.id,token.name,token.token_prefix,token.scopes_json,token.expires_at,token.last_used_at,token.revoked_at,identity.name AS identity_name FROM shared_api_tokens token JOIN shared_service_identities identity ON identity.tenant_id=token.tenant_id AND identity.id=token.service_identity_id WHERE token.tenant_id=${tenant(request)} AND identity.module_id=${moduleId} ORDER BY token.created_at DESC`))};});
  app.post('/v1/modules/techdeck/api-tokens',{preHandler:[...adminGuards]},async(request,reply)=>{try{const input=body(request.body);const created=await createServiceIdentityAndToken({tenantId:tenant(request),moduleId:await techDeckModuleId(),actorUserId:actor(request),identityName:textValue(input.identityName,'identityName',120,true)!,tokenName:textValue(input.tokenName,'tokenName',120,true)!,description:textValue(input.description,'description',500),scopes:listValue(input.scopes,'scopes',20),expiresAt:dateValue(input.expiresAt,'expiresAt')});return reply.code(201).send(created);}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.delete('/v1/modules/techdeck/api-tokens/:id',{preHandler:[...adminGuards]},async(request,reply)=>{const{id}=request.params as{id:string};const result=await revokeApiToken({tenantId:tenant(request),tokenId:id});if(!result)return reply.code(404).send({error:'API token not found',code:'API_TOKEN_NOT_FOUND'});return result;});

  app.get('/v1/modules/techdeck/webhooks',{preHandler:[...adminGuards]},async request=>({webhooks:await listOutboundWebhookEndpoints({tenantId:tenant(request),moduleId:await techDeckModuleId()})}));
  app.post('/v1/modules/techdeck/webhooks',{preHandler:[...adminGuards]},async(request,reply)=>{try{const input=body(request.body);const result=await createOutboundWebhookEndpoint({tenantId:tenant(request),moduleId:await techDeckModuleId(),actorUserId:actor(request),name:textValue(input.name,'name',120,true)!,endpointUrl:textValue(input.url,'url',2000,true)!,eventTypes:listValue(input.eventTypes,'eventTypes',50),signingSecret:textValue(input.secret,'secret',2000,true)!});return reply.code(201).send(result);}catch(error){if(sendInputError(reply,error))return reply;if(sendBoundedServiceError(reply,error,'WEBHOOK_'))return reply;throw error;}});
  app.patch('/v1/modules/techdeck/webhooks/:id',{preHandler:[...adminGuards]},async(request,reply)=>{try{const input=body(request.body);const{id}=request.params as{id:string};const result=await db.execute(sql`UPDATE shared_webhook_endpoints SET name=COALESCE(${textValue(input.name,'name',120)},name),enabled=COALESCE(${input.enabled===undefined?null:booleanValue(input.enabled,'enabled')},enabled),event_types_json=COALESCE(${input.eventTypes===undefined?null:JSON.stringify(listValue(input.eventTypes,'eventTypes',50))}::jsonb,event_types_json),version=version+1,updated_by_user_id=${actor(request)},updated_at=NOW() WHERE tenant_id=${tenant(request)} AND module_id=${await techDeckModuleId()} AND id=${id} AND version=${integer(input.expectedVersion,'expectedVersion',1,1000000)} AND archived_at IS NULL RETURNING id,name,endpoint_url,event_types_json,enabled,version,updated_at`);if(!result.rows[0])return reply.code(409).send({error:'Webhook changed or not found',code:'WEBHOOK_VERSION_CONFLICT'});return result.rows[0];}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.delete('/v1/modules/techdeck/webhooks/:id',{preHandler:[...adminGuards]},async(request,reply)=>{const{id}=request.params as{id:string};const result=await db.execute(sql`UPDATE shared_webhook_endpoints SET archived_at=NOW(),enabled=FALSE,version=version+1,updated_by_user_id=${actor(request)},updated_at=NOW() WHERE tenant_id=${tenant(request)} AND module_id=${await techDeckModuleId()} AND id=${id} AND archived_at IS NULL RETURNING id`);if(!result.rows[0])return reply.code(404).send({error:'Webhook not found',code:'WEBHOOK_NOT_FOUND'});return{ok:true};});
  app.get('/v1/modules/techdeck/webhooks/:id/deliveries',{preHandler:[...adminGuards]},async request=>{const{id}=request.params as{id:string};return{deliveries:publicRows(await db.execute(sql`SELECT id,event_type,payload_sha256,status,attempt_count,max_attempts,last_response_status,last_error_code,delivered_at,created_at,updated_at FROM shared_webhook_deliveries WHERE tenant_id=${tenant(request)} AND module_id=${await techDeckModuleId()} AND endpoint_id=${id} ORDER BY created_at DESC LIMIT 200`))};});

  app.get('/v1/modules/techdeck/evidence-locker',{preHandler:[...readGuards]},async request=>{const query=request.query as{q?:string;tag?:string};const pattern=`%${String(query.q??'').slice(0,120)}%`;return{evidence:publicRows(await db.execute(sql`SELECT evidence.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',file.id,'name',file.original_name,'sha256',file.sha256,'attachmentId',file.shared_attachment_id) ORDER BY file.created_at) FROM techdeck_evidence_file_links file WHERE file.tenant_id=evidence.tenant_id AND file.evidence_id=evidence.id AND file.deleted_at IS NULL),'[]'::jsonb) AS files FROM techdeck_evidence evidence WHERE evidence.tenant_id=${tenant(request)} AND evidence.archived_at IS NULL AND (${String(query.q??'')}='' OR evidence.title ILIKE ${pattern} OR evidence.summary ILIKE ${pattern}) AND (${String(query.tag??'')}='' OR evidence.tags ? ${String(query.tag??'')}) ORDER BY evidence.created_at DESC LIMIT 200`))};});
  app.post('/v1/modules/techdeck/evidence/:evidenceId/files',{preHandler:[...writeGuards]},async(request,reply)=>{try{const input=body(request.body);const{evidenceId}=request.params as{evidenceId:string};const encoded=textValue(input.contentBase64,'contentBase64',14_000_000,true)!;const content=Buffer.from(encoded,'base64');if(content.length===0)throw new InputError('FILE_EMPTY','contentBase64');const tenantId=tenant(request);const moduleId=await techDeckModuleId();const evidence=await db.execute(sql`SELECT id FROM techdeck_evidence WHERE tenant_id=${tenantId} AND id=${evidenceId} AND archived_at IS NULL LIMIT 1`);if(!evidence.rows[0])return reply.code(404).send({error:'Evidence not found',code:'EVIDENCE_NOT_FOUND'});
    const existing=await db.execute(sql`SELECT attachment.id FROM shared_attachments attachment WHERE attachment.tenant_id=${tenantId} AND attachment.module_id=${moduleId} AND attachment.sha256=${createHash('sha256').update(content).digest('hex')} AND attachment.deleted_at IS NULL ORDER BY attachment.created_at LIMIT 1`);let attachment=existing.rows[0] as Dict|undefined;let duplicate=Boolean(attachment);if(!attachment)attachment=await createAttachment({tenantId,moduleId,objectType:'techdeck_evidence_blob',objectId:evidenceId,originalName:textValue(input.fileName,'fileName',240,true)!,declaredMimeType:textValue(input.mimeType,'mimeType',160),content,createdByUserId:actor(request),retentionUntil:dateValue(input.retentionUntil,'retentionUntil'),correlationId:request.id}) as Dict;
    const link=await db.execute(sql`INSERT INTO techdeck_evidence_file_links(tenant_id,evidence_id,shared_attachment_id,sha256,original_name,created_by_user_id) VALUES (${tenantId},${evidenceId},${String(attachment.id)},${String(attachment.sha256??createHash('sha256').update(content).digest('hex'))},${textValue(input.fileName,'fileName',240,true)},${actor(request)}) ON CONFLICT DO NOTHING RETURNING *`);return reply.code(201).send({file:link.rows[0]??null,attachmentId:attachment.id,sha256:attachment.sha256??createHash('sha256').update(content).digest('hex'),duplicate});}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.get('/v1/modules/techdeck/evidence/:evidenceId/files/:attachmentId/content',{preHandler:[...readGuards]},async(request,reply)=>{const{evidenceId,attachmentId}=request.params as{evidenceId:string;attachmentId:string};const link=await db.execute(sql`SELECT 1 FROM techdeck_evidence_file_links WHERE tenant_id=${tenant(request)} AND evidence_id=${evidenceId} AND shared_attachment_id=${attachmentId} AND deleted_at IS NULL LIMIT 1`);if(!link.rows[0])return reply.code(404).send({error:'Evidence file not found',code:'EVIDENCE_FILE_NOT_FOUND'});const result=await getAttachmentContent({tenantId:tenant(request),moduleId:await techDeckModuleId(),attachmentId});if(!result)return reply.code(404).send({error:'Evidence file not found',code:'EVIDENCE_FILE_NOT_FOUND'});return reply.type(String(result.metadata.detected_mime_type)).header('Content-Disposition',`inline; filename="${String(result.metadata.original_name).replace(/["\r\n]/g,'')}"`).send(result.content);});

  app.post('/v1/modules/techdeck/compliance-packets',{preHandler:[...writeGuards]},async(request,reply)=>{try{const input=body(request.body);const idempotencyKey=textValue(request.headers['idempotency-key'],'Idempotency-Key',200,true)!;const result=await requestSharedExport({tenantId:tenant(request),moduleId:await techDeckModuleId(),requestedByUserId:actor(request),exportType:TECHDECK_COMPLIANCE_EXPORT_TYPE,format:'zip',filters:objectValue(input.filters,'filters'),idempotencyKey,correlationId:request.id});return reply.code(result.duplicate?200:202).send(result);}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.get('/v1/modules/techdeck/compliance-packets',{preHandler:[...readGuards]},async request=>({exports:publicRows(await db.execute(sql`
    SELECT job_export.id,job_export.status,job_export.result_attachment_id,job_export.last_error_code,job_export.created_at,
      job_export.completed_at,job_export.expires_at,attachment.scan_status AS attachment_scan_status
    FROM shared_exports job_export LEFT JOIN shared_attachments attachment
      ON attachment.tenant_id=job_export.tenant_id AND attachment.module_id=job_export.module_id AND attachment.id=job_export.result_attachment_id AND attachment.deleted_at IS NULL
    WHERE job_export.tenant_id=${tenant(request)} AND job_export.module_id=${await techDeckModuleId()} AND job_export.export_type=${TECHDECK_COMPLIANCE_EXPORT_TYPE}
    ORDER BY job_export.created_at DESC LIMIT 200
  `))}));
  app.get('/v1/modules/techdeck/compliance-packets/:id/download', { preHandler: [...readGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = tenant(request);
    const moduleId = await techDeckModuleId();
    const exportResult = await db.execute(sql`
      SELECT id, status, result_attachment_id, expires_at
      FROM shared_exports
      WHERE tenant_id=${tenantId} AND module_id=${moduleId} AND id=${id}
        AND export_type=${TECHDECK_COMPLIANCE_EXPORT_TYPE}
      LIMIT 1
    `);
    const exportRow = exportResult.rows[0] as Dict | undefined;
    if (!exportRow) return reply.code(404).send({ error: 'Compliance package not found', code: 'TECHDECK_COMPLIANCE_PACKET_NOT_FOUND' });
    if (String(exportRow.status) !== 'completed' || !exportRow.result_attachment_id) {
      return reply.code(409).send({ error: 'This compliance package is still being prepared', code: 'TECHDECK_COMPLIANCE_PACKET_NOT_READY' });
    }
    if (exportRow.expires_at && new Date(String(exportRow.expires_at)).getTime() <= Date.now()) {
      return reply.code(410).send({ error: 'This compliance package has expired. Build a new package to download current records.', code: 'TECHDECK_COMPLIANCE_PACKET_EXPIRED' });
    }
    try {
      const attachment = await getAttachmentContent({
        tenantId,
        moduleId,
        attachmentId: String(exportRow.result_attachment_id),
        objectType: 'shared_export',
        objectId: id,
      });
      if (!attachment) {
        return reply.code(409).send({ error: 'The compliance package file is not available. Build a new package.', code: 'TECHDECK_COMPLIANCE_PACKET_FILE_UNAVAILABLE' });
      }
      await recordActivity({
        tenantId,
        actorUserId: actor(request),
        objectType: 'techdeck_compliance_packet',
        objectId: id,
        eventType: 'compliance_packet_downloaded',
        summary: 'Downloaded a TechDeck compliance package',
        metadata: { attachmentId: String(exportRow.result_attachment_id) },
        correlationId: request.id,
      });
      return reply
        .type(String(attachment.metadata.detected_mime_type))
        .header('Content-Disposition', `attachment; filename="${String(attachment.metadata.original_name).replace(/["\r\n]/g, '')}"`)
        .header('Cache-Control', 'private, no-store')
        .send(attachment.content);
    } catch (error) {
      const code = String((error as { code?: unknown })?.code ?? '');
      if (code === 'ATTACHMENT_QUARANTINED') return reply.code(403).send({ error: 'The package did not pass file safety checks', code });
      if (code.startsWith('ATTACHMENT_')) return reply.code(409).send({ error: 'The package is not ready to download', code });
      throw error;
    }
  });

  app.get('/v1/modules/techdeck/intake/policies',{preHandler:[...adminGuards]},async request=>({policy:(await db.execute(sql`SELECT * FROM techdeck_intake_policies WHERE tenant_id=${tenant(request)} LIMIT 1`)).rows[0]??null}));
  app.put('/v1/modules/techdeck/intake/policies',{preHandler:[...adminGuards]},async(request,reply)=>{try{const input=body(request.body);const types=listValue(input.allowedFileTypes,'allowedFileTypes',20);const result=await db.execute(sql`INSERT INTO techdeck_intake_policies(tenant_id,allowed_file_types,max_file_size_bytes,default_expiration_hours,default_retention_days,require_password,compliance_notice,updated_by_user_id) VALUES (${tenant(request)},${JSON.stringify(types)}::jsonb,${integer(input.maxFileSizeBytes,'maxFileSizeBytes',1024,10485760,10485760)},${integer(input.defaultExpirationHours,'defaultExpirationHours',1,720,72)},${integer(input.defaultRetentionDays,'defaultRetentionDays',1,3650,30)},${booleanValue(input.requirePassword,'requirePassword',true)},${textValue(input.complianceNotice,'complianceNotice',8000)},${actor(request)}) ON CONFLICT(tenant_id) DO UPDATE SET allowed_file_types=EXCLUDED.allowed_file_types,max_file_size_bytes=EXCLUDED.max_file_size_bytes,default_expiration_hours=EXCLUDED.default_expiration_hours,default_retention_days=EXCLUDED.default_retention_days,require_password=EXCLUDED.require_password,compliance_notice=EXCLUDED.compliance_notice,updated_by_user_id=EXCLUDED.updated_by_user_id,version=techdeck_intake_policies.version+1,updated_at=NOW() RETURNING *`);return result.rows[0];}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.get('/v1/modules/techdeck/intake/spaces',{preHandler:[...readGuards]},async request=>({spaces:publicRows(await db.execute(sql`SELECT * FROM techdeck_intake_spaces WHERE tenant_id=${tenant(request)} AND archived_at IS NULL ORDER BY name`))}));
  app.post('/v1/modules/techdeck/intake/spaces',{preHandler:[...adminGuards]},async(request,reply)=>{try{const input=body(request.body);const slug=textValue(input.slug,'slug',120,true)!;if(!SLUG.test(slug))throw new InputError('SLUG_INVALID','slug');const requestedTypes=listValue(input.allowedFileTypes,'allowedFileTypes',20);const allowedTypes=requestedTypes.length?requestedTypes:['application/pdf','image/png','image/jpeg','text/plain'];const result=await db.execute(sql`INSERT INTO techdeck_intake_spaces(tenant_id,name,slug,description,allowed_file_types,max_file_size_bytes,retention_days,external_uploads_enabled,metadata_schema,created_by_user_id) VALUES (${tenant(request)},${textValue(input.name,'name',160,true)},${slug},${textValue(input.description,'description',4000)},${JSON.stringify(allowedTypes)}::jsonb,${integer(input.maxFileSizeBytes,'maxFileSizeBytes',1024,10485760,10485760)},${integer(input.retentionDays,'retentionDays',1,3650,30)},${booleanValue(input.externalUploadsEnabled,'externalUploadsEnabled',true)},${JSON.stringify(objectValue(input.metadataSchema,'metadataSchema'))}::jsonb,${actor(request)}) RETURNING *`);return reply.code(201).send(result.rows[0]);}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.post('/v1/modules/techdeck/intake/requests',{preHandler:[...writeGuards]},async(request,reply)=>{try{const input=body(request.body);const rawToken=`tdi_${randomBytes(24).toString('base64url')}`;const password=textValue(input.password,'password',200);const passwordHash=password?await bcrypt.hash(password,12):null;const expiresAt=dateValue(input.expiresAt,'expiresAt')??new Date(Date.now()+72*3600000);const result=await db.execute(sql`INSERT INTO techdeck_intake_requests(tenant_id,space_id,directory_organization_id,title,instructions,token_prefix,token_hash,password_hash,uploader_name,uploader_email_hash,max_uploads,max_total_size_bytes,one_time_use,expires_at,created_by_user_id) SELECT ${tenant(request)},space.id,${textValue(input.directoryOrganizationId,'directoryOrganizationId',36)},${textValue(input.title,'title',200,true)},${textValue(input.instructions,'instructions',8000)},${rawToken.slice(0,12)},${hash(rawToken)},${passwordHash},${textValue(input.uploaderName,'uploaderName',160)},${input.uploaderEmail?hash(textValue(input.uploaderEmail,'uploaderEmail',320,true)!):null},${integer(input.maxUploads,'maxUploads',1,100,5)},${integer(input.maxTotalSizeBytes,'maxTotalSizeBytes',1024,104857600,26214400)},${booleanValue(input.oneTimeUse,'oneTimeUse',false)},${expiresAt},${actor(request)} FROM techdeck_intake_spaces space WHERE space.tenant_id=${tenant(request)} AND space.id=${textValue(input.spaceId,'spaceId',36,true)} AND space.status='active' AND space.external_uploads_enabled=TRUE AND space.archived_at IS NULL RETURNING id,space_id,title,instructions,token_prefix,max_uploads,max_total_size_bytes,one_time_use,expires_at,created_at`);if(!result.rows[0])return reply.code(404).send({error:'Active intake space not found',code:'INTAKE_SPACE_NOT_FOUND'});return reply.code(201).send({request:result.rows[0],rawToken,publicPath:`/t/upload/${rawToken}`});}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.get('/v1/modules/techdeck/intake/requests',{preHandler:[...readGuards]},async request=>({requests:publicRows(await db.execute(sql`SELECT request.id,request.space_id,request.title,request.token_prefix,request.max_uploads,request.upload_count,request.uploaded_bytes,request.expires_at,request.completed_at,request.revoked_at,space.name AS space_name FROM techdeck_intake_requests request JOIN techdeck_intake_spaces space ON space.tenant_id=request.tenant_id AND space.id=request.space_id WHERE request.tenant_id=${tenant(request)} ORDER BY request.created_at DESC LIMIT 200`))}));
  app.post('/v1/modules/techdeck/intake/requests/:id/revoke',{preHandler:[...writeGuards]},async(request,reply)=>{const{id}=request.params as{id:string};const result=await db.execute(sql`UPDATE techdeck_intake_requests SET revoked_at=COALESCE(revoked_at,NOW()),version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${id} AND revoked_at IS NULL RETURNING id,revoked_at`);if(!result.rows[0])return reply.code(404).send({error:'Intake request not found',code:'INTAKE_REQUEST_NOT_FOUND'});return result.rows[0];});
  app.get('/v1/public/techdeck/intake/:token',async(request,reply)=>{const{token}=request.params as{token:string};if(!await consumeDurableLimit('techdeck_intake_rate_limits',`intake-view:${request.ip}`,60,60000))return reply.code(429).send({error:'Too many requests',code:'RATE_LIMITED'});const row=await resolveIntakeRequest(token);if(!row)return reply.code(404).send({error:'Upload request not found',code:'INTAKE_REQUEST_NOT_FOUND'});return{request:{title:row.title,instructions:row.instructions,expiresAt:row.expires_at,maxUploads:row.max_uploads,remainingUploads:Number(row.max_uploads)-Number(row.upload_count),passwordRequired:Boolean(row.password_hash),allowedFileTypes:row.allowed_file_types,maxFileSizeBytes:row.space_max_file_size_bytes}};});
  app.post('/v1/public/techdeck/intake/:token/verify-password',async(request,reply)=>{try{const{token}=request.params as{token:string};if(!await consumeDurableLimit('techdeck_intake_rate_limits',`intake-password:${request.ip}`,10,15*60000))return reply.code(429).send({valid:false,code:'RATE_LIMITED'});const row=await resolveIntakeRequest(token);if(!row)return reply.code(404).send({valid:false,code:'INTAKE_REQUEST_NOT_FOUND'});if(!row.password_hash)return{valid:true,passwordRequired:false};const input=body(request.body);const valid=await bcrypt.compare(textValue(input.password,'password',200,true)!,String(row.password_hash));return reply.code(valid?200:403).send({valid,passwordRequired:true,code:valid?null:'INTAKE_PASSWORD_INVALID'});}catch(error){if(sendInputError(reply,error))return;throw error;}});
  app.post('/v1/public/techdeck/intake/:token/upload',async(request,reply)=>{try{const{token}=request.params as{token:string};if(!await consumeDurableLimit('techdeck_intake_rate_limits',`intake-upload:${request.ip}`,10,15*60000))return reply.code(429).send({error:'Too many uploads',code:'RATE_LIMITED'});const row=await resolveIntakeRequest(token);if(!row)return reply.code(404).send({error:'Upload request not found',code:'INTAKE_REQUEST_NOT_FOUND'});const input=body(request.body);if(row.password_hash&&!await bcrypt.compare(textValue(input.password,'password',200,true)!,String(row.password_hash)))return reply.code(403).send({error:'Upload password is invalid',code:'INTAKE_PASSWORD_INVALID'});const content=Buffer.from(textValue(input.contentBase64,'contentBase64',14_000_000,true)!,'base64');const mime=textValue(input.mimeType,'mimeType',160,true)!;if(!Array.isArray(row.allowed_file_types)||!(row.allowed_file_types as unknown[]).includes(mime))throw new InputError('FILE_TYPE_NOT_ALLOWED','mimeType');if(content.length===0||content.length>Number(row.space_max_file_size_bytes)||Number(row.uploaded_bytes)+content.length>Number(row.max_total_size_bytes))throw new InputError('FILE_SIZE_INVALID','contentBase64');const digest=createHash('sha256').update(content).digest('hex');const duplicate=await db.execute(sql`SELECT id FROM techdeck_intake_files WHERE tenant_id=${String(row.tenant_id)} AND request_id=${String(row.id)} AND sha256=${digest} AND deleted_at IS NULL LIMIT 1`);if(duplicate.rows[0])return reply.code(200).send({duplicate:true,sha256:digest});const attachment=await createAttachment({tenantId:String(row.tenant_id),moduleId:await techDeckModuleId(),objectType:'techdeck_intake',objectId:String(row.id),originalName:textValue(input.fileName,'fileName',240,true)!,declaredMimeType:mime,content,createdByUserId:String(row.created_by_user_id),retentionUntil:new Date(Date.now()+Number(row.retention_days)*86400000),correlationId:request.id});const saved=await db.transaction(async tx=>{const file=await tx.execute(sql`INSERT INTO techdeck_intake_files(tenant_id,request_id,shared_attachment_id,original_name,mime_type,size_bytes,sha256,metadata,uploader_ip_hash) VALUES (${String(row.tenant_id)},${String(row.id)},${String((attachment as Dict).id)},${textValue(input.fileName,'fileName',240,true)},${mime},${content.length},${digest},${JSON.stringify(objectValue(input.metadata,'metadata'))}::jsonb,${hash(request.ip)}) RETURNING id,original_name,mime_type,size_bytes,sha256,status,created_at`);await tx.execute(sql`UPDATE techdeck_intake_requests SET upload_count=upload_count+1,uploaded_bytes=uploaded_bytes+${content.length},completed_at=CASE WHEN one_time_use OR upload_count+1>=max_uploads THEN NOW() ELSE completed_at END,version=version+1,updated_at=NOW() WHERE tenant_id=${String(row.tenant_id)} AND id=${String(row.id)}`);await tx.execute(sql`INSERT INTO techdeck_intake_audit_events(tenant_id,request_id,actor_type,action,object_type,object_id,ip_hash,metadata) VALUES (${String(row.tenant_id)},${String(row.id)},'external','file_uploaded','intake_file',${String((file.rows[0] as Dict).id)},${hash(request.ip)},${JSON.stringify({sha256:digest,sizeBytes:content.length})}::jsonb)`);return file.rows[0];});return reply.code(201).send({file:saved,duplicate:false});}catch(error){if(sendInputError(reply,error))return;throw error;}});

  app.post('/v1/modules/techdeck/itops/query',{preHandler:[...writeGuards]},async(request,reply)=>{try{const input=body(request.body);const query=textValue(input.query,'query',4000,true)!;const adapter=getSharedAiProviderAdapter();if(adapter.status.state==='disabled')return reply.code(503).send({error:'AI provider is not configured',code:'AI_PROVIDER_DISABLED',provider:adapter.status});const completion=await adapter.complete({systemPrompt:'You are TechDeck, an MSP operations assistant. Return documentation-only diagnostic guidance. Never claim that commands were executed, never reveal secrets, and require explicit operator review before any action.',userPrompt:query,maxTokens:1200,temperature:0.2,responseFormat:'text',timeoutMs:15000});await recordActivity({tenantId:tenant(request),actorUserId:actor(request),objectType:'techdeck_itops_query',objectId:hash(`${actor(request)}:${request.id}`).slice(0,36),eventType:'itops_guidance_generated',summary:'Generated documentation-only IT operations guidance',metadata:{provider:completion.provider,model:completion.model,tokenCount:completion.tokenCount},correlationId:request.id});return{mode:'documentation_only',executionAvailable:false,provider:adapter.status,response:completion.text,tokenCount:completion.tokenCount};}catch(error){if(sendInputError(reply,error))return;throw error;}});

  app.get('/v1/headless/techdeck/tickets',async(request,reply)=>{const context=await headlessContext(request,reply,'techdeck:read');if(!context)return;return{tickets:publicRows(await db.execute(sql`SELECT id,number,title,description,priority,status,response_deadline,resolution_deadline,created_at,updated_at FROM techdeck_tickets WHERE tenant_id=${context.tenantId} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200`))};});
  app.get('/v1/headless/techdeck/evidence',async(request,reply)=>{const context=await headlessContext(request,reply,'techdeck:read');if(!context)return;return{evidence:publicRows(await db.execute(sql`SELECT id,title,evidence_type,summary,observed_at,tags,created_at FROM techdeck_evidence WHERE tenant_id=${context.tenantId} AND archived_at IS NULL ORDER BY created_at DESC LIMIT 200`))};});
}
