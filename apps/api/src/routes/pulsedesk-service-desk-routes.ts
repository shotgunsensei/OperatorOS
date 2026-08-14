import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  activityFeed,
  directoryContacts,
  directoryOrganizationContacts,
  directoryOrganizations,
  directorySiteContacts,
  directorySites,
  modules,
  pulsedeskAssets,
  pulsedeskDepartments,
  pulsedeskFacilityRequests,
  pulsedeskKnowledgeArticles,
  pulsedeskNotificationPreferences,
  pulsedeskQueues,
  pulsedeskRequestEvents,
  pulsedeskRequests,
  pulsedeskRequestSequences,
  pulsedeskSavedViews,
  pulsedeskSlaEvents,
  pulsedeskSlaPolicies,
  pulsedeskSupplyRequests,
  pulsedeskTags,
  pulsedeskTeamMembers,
  pulsedeskTeams,
  pulsedeskTicketAssignments,
  pulsedeskTicketMessages,
  pulsedeskTicketOptions,
  pulsedeskTicketTags,
  pulsedeskTimeEntries,
  pulsedeskVendorEngagements,
} from '../schema.js';
import {
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import { getTenantMembership, resolveTenantModuleAccess } from '../lib/tenant-entitlements.js';
import {
  createAttachment,
  getAttachmentContent,
  listAttachments,
  softDeleteAttachment,
} from '../lib/shared-attachments.js';
import { enqueueOutboxMessage } from '../lib/shared-notification-outbox.js';
import {
  createContact,
  createOrganization,
  createSite,
  DirectoryFailure,
  associateOrganizationContact,
  associateSiteContact,
  listContacts,
  listOrganizations,
  listSites,
  upsertModuleProfile,
  type DirectoryActor,
  type DirectoryPage,
} from '../lib/business-directory.js';
import {
  assertPulseDeskTicketTransition,
  assertNoProhibitedPhi,
  calculatePulseDeskSlaTargets,
  PULSEDESK_SAFE_BULK_ACTIONS,
  PULSEDESK_TICKET_CATEGORIES,
  PULSEDESK_TICKET_PRIORITIES,
  PULSEDESK_TICKET_STATUSES,
  PULSEDESK_TICKET_TYPES,
  pulseDeskBoolean,
  pulseDeskEnum,
  pulseDeskHumanId,
  pulseDeskId,
  pulseDeskIdempotencyKey,
  pulseDeskInteger,
  pulseDeskObject,
  pulseDeskSafeSlug,
  pulseDeskSlaProjection,
  pulseDeskText,
  requireNoPhiAcknowledgement,
  PulseDeskServiceDeskError,
  type PulseDeskTicketStatus,
} from '../lib/pulsedesk-service-desk.js';

const readGuards = [requireTenantMember, requireTenantModuleAccess('pulsedesk')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];

type PulseDeskContext = { tenantId: string; role: 'owner' | 'admin' | 'member'; viaPlatformRole: boolean };
type PulseDeskUser = { id: string; email?: string; name?: string | null };
type Executor = Pick<typeof db, 'insert'>;

function tenant(request: FastifyRequest): string {
  return ((request as any).tenantContext as PulseDeskContext).tenantId;
}

function user(request: FastifyRequest): string {
  return ((request as any).user as PulseDeskUser).id;
}

function capabilities(request: FastifyRequest) {
  const ctx = (request as any).tenantContext as PulseDeskContext;
  const access = (request as any).tenantModuleAccessLevel as string | undefined;
  return {
    access,
    canViewInternal: ctx.viaPlatformRole || ctx.role === 'owner' || ctx.role === 'admin' || access === 'manager' || access === 'user',
    canManage: ctx.viaPlatformRole || ctx.role === 'owner' || ctx.role === 'admin' || access === 'manager',
  };
}

async function requirePulseDeskInternalAccess(request: FastifyRequest, reply: FastifyReply) {
  if (capabilities(request).canViewInternal) return;
  return reply.code(403).send({ error: 'PulseDesk service-agent access is required', code: 'PULSEDESK_INTERNAL_ACCESS_REQUIRED' });
}

async function requirePulseDeskManager(request: FastifyRequest, reply: FastifyReply) {
  if (capabilities(request).canManage) return;
  return reply.code(403).send({ error: 'PulseDesk manager access is required', code: 'PULSEDESK_MANAGER_REQUIRED' });
}

const internalGuards = [...writeGuards, requirePulseDeskInternalAccess];
const managerGuards = [...writeGuards, requirePulseDeskManager];

function handleError(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof DirectoryFailure) {
    reply.code(error.statusCode).send({ error: error.message, code: error.code, ...error.safeFields });
    return true;
  }
  if (!(error instanceof PulseDeskServiceDeskError)) return false;
  reply.code(error.statusCode).send({ error: error.message, code: error.code, ...(error.field ? { field: error.field } : {}) });
  return true;
}

function notFound(reply: FastifyReply, entity: string) {
  return reply.code(404).send({ error: `${entity} not found`, code: `PULSEDESK_${entity.toUpperCase().replaceAll(' ', '_')}_NOT_FOUND` });
}

async function audit(executor: Executor, input: {
  tenantId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  await executor.insert(activityFeed).values({
    tenantId: input.tenantId,
    userId: input.userId,
    action: input.action,
    entityType: `pulsedesk_${input.entityType}`,
    entityId: input.entityId,
    metadata: input.metadata ?? {},
  });
}

async function pulseDeskModuleId(): Promise<string> {
  const [row] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, 'pulsedesk')).limit(1);
  if (!row) throw new Error('PulseDesk module registry row is missing');
  return row.id;
}

function directoryActor(request: FastifyRequest): DirectoryActor {
  return { tenantId: tenant(request), userId: user(request), moduleSlug: 'pulsedesk' };
}

function directoryPage(query: Record<string, unknown>): DirectoryPage {
  const limit = Number(query.limit ?? 25);
  const offset = Number(query.offset ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new PulseDeskServiceDeskError('limit is invalid', 'PULSEDESK_LIMIT_INVALID', 'limit');
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) throw new PulseDeskServiceDeskError('offset is invalid', 'PULSEDESK_OFFSET_INVALID', 'offset');
  return { limit, offset };
}

async function ticketRow(tenantId: string, id: string, includeArchived = false) {
  const conditions = [eq(pulsedeskRequests.tenantId, tenantId), eq(pulsedeskRequests.id, id)];
  if (!includeArchived) conditions.push(isNull(pulsedeskRequests.archivedAt));
  const [row] = await db.select().from(pulsedeskRequests).where(and(...conditions)).limit(1);
  return row ?? null;
}

function ticketView(row: typeof pulsedeskRequests.$inferSelect, atRiskPercent = 80) {
  return {
    ...row,
    humanId: pulseDeskHumanId(row.number),
    sla: pulseDeskSlaProjection({
      status: row.status,
      createdAt: row.createdAt,
      responseDueAt: row.responseDueAt,
      resolutionDueAt: row.resolutionDueAt,
      firstRespondedAt: row.firstRespondedAt,
      resolvedAt: row.resolvedAt,
      atRiskPercent,
    }),
  };
}

async function assertDirectoryReferences(input: {
  tenantId: string;
  organizationId?: string | null;
  siteId?: string | null;
  contactId?: string | null;
}) {
  if (input.siteId && !input.organizationId) {
    throw new PulseDeskServiceDeskError('A facility/site requires its service client', 'PULSEDESK_ORGANIZATION_REQUIRED', 'directoryOrganizationId');
  }
  if (input.contactId && !input.organizationId) {
    throw new PulseDeskServiceDeskError('A requester contact requires its service client', 'PULSEDESK_ORGANIZATION_REQUIRED', 'directoryOrganizationId');
  }
  if (input.organizationId) {
    const [organization] = await db.select({ id: directoryOrganizations.id, type: directoryOrganizations.type })
      .from(directoryOrganizations).where(and(
        eq(directoryOrganizations.tenantId, input.tenantId),
        eq(directoryOrganizations.id, input.organizationId),
        isNull(directoryOrganizations.archivedAt),
      )).limit(1);
    if (!organization) throw new PulseDeskServiceDeskError('Service client not found', 'PULSEDESK_DIRECTORY_REFERENCE_NOT_FOUND', 'directoryOrganizationId', 404);
  }
  if (input.siteId) {
    const [site] = await db.select({ id: directorySites.id, organizationId: directorySites.organizationId })
      .from(directorySites).where(and(
        eq(directorySites.tenantId, input.tenantId),
        eq(directorySites.id, input.siteId),
        isNull(directorySites.archivedAt),
      )).limit(1);
    if (!site || site.organizationId !== input.organizationId) {
      throw new PulseDeskServiceDeskError('Facility/site not found', 'PULSEDESK_DIRECTORY_REFERENCE_NOT_FOUND', 'directorySiteId', 404);
    }
  }
  if (input.contactId) {
    const [contact] = await db.select({ id: directoryContacts.id }).from(directoryContacts).where(and(
      eq(directoryContacts.tenantId, input.tenantId), eq(directoryContacts.id, input.contactId), isNull(directoryContacts.archivedAt),
    )).limit(1);
    if (!contact) throw new PulseDeskServiceDeskError('Requester contact not found', 'PULSEDESK_DIRECTORY_REFERENCE_NOT_FOUND', 'requesterContactId', 404);
    const [organizationLink] = await db.select({ id: directoryOrganizationContacts.id }).from(directoryOrganizationContacts).where(and(
      eq(directoryOrganizationContacts.tenantId, input.tenantId),
      eq(directoryOrganizationContacts.organizationId, input.organizationId!),
      eq(directoryOrganizationContacts.contactId, input.contactId),
    )).limit(1);
    const [siteLink] = input.siteId
      ? await db.select({ id: directorySiteContacts.id }).from(directorySiteContacts).where(and(
        eq(directorySiteContacts.tenantId, input.tenantId),
        eq(directorySiteContacts.siteId, input.siteId),
        eq(directorySiteContacts.contactId, input.contactId),
      )).limit(1)
      : [];
    if (!organizationLink && !siteLink) {
      throw new PulseDeskServiceDeskError('Requester contact is not associated with the selected service client/site', 'PULSEDESK_CONTACT_ASSOCIATION_INVALID', 'requesterContactId');
    }
  }
}

async function assertOperationalReferences(input: {
  tenantId: string;
  organizationId?: string | null;
  siteId?: string | null;
  contactId?: string | null;
  departmentId?: string | null;
  assetId?: string | null;
  queueId?: string | null;
  teamId?: string | null;
  slaPolicyId?: string | null;
}) {
  await assertDirectoryReferences(input);
  if (input.departmentId) {
    const checkOrganization = Object.prototype.hasOwnProperty.call(input, 'organizationId');
    const checkSite = Object.prototype.hasOwnProperty.call(input, 'siteId');
    const [department] = await db.select().from(pulsedeskDepartments).where(and(
      eq(pulsedeskDepartments.tenantId, input.tenantId), eq(pulsedeskDepartments.id, input.departmentId),
      eq(pulsedeskDepartments.active, true), isNull(pulsedeskDepartments.archivedAt),
    )).limit(1);
    if (!department
      || (checkOrganization && department.directoryOrganizationId && department.directoryOrganizationId !== input.organizationId)
      || (checkSite && department.directorySiteId && department.directorySiteId !== input.siteId)) {
      throw new PulseDeskServiceDeskError('Department not found', 'PULSEDESK_REFERENCE_NOT_FOUND', 'departmentId', 404);
    }
  }
  if (input.assetId) {
    const checkOrganization = Object.prototype.hasOwnProperty.call(input, 'organizationId');
    const checkSite = Object.prototype.hasOwnProperty.call(input, 'siteId');
    const [asset] = await db.select().from(pulsedeskAssets).where(and(
      eq(pulsedeskAssets.tenantId, input.tenantId), eq(pulsedeskAssets.id, input.assetId), isNull(pulsedeskAssets.archivedAt),
    )).limit(1);
    if (!asset
      || (checkOrganization && asset.directoryOrganizationId && asset.directoryOrganizationId !== input.organizationId)
      || (checkSite && asset.directorySiteId && asset.directorySiteId !== input.siteId)) {
      throw new PulseDeskServiceDeskError('Operational equipment not found', 'PULSEDESK_REFERENCE_NOT_FOUND', 'assetId', 404);
    }
  }
  if (input.queueId) {
    const [queue] = await db.select({ id: pulsedeskQueues.id }).from(pulsedeskQueues).where(and(
      eq(pulsedeskQueues.tenantId, input.tenantId), eq(pulsedeskQueues.id, input.queueId), eq(pulsedeskQueues.active, true), isNull(pulsedeskQueues.archivedAt),
    )).limit(1);
    if (!queue) throw new PulseDeskServiceDeskError('Queue not found', 'PULSEDESK_REFERENCE_NOT_FOUND', 'queueId', 404);
  }
  if (input.teamId) {
    const [team] = await db.select({ id: pulsedeskTeams.id, queueId: pulsedeskTeams.queueId }).from(pulsedeskTeams).where(and(
      eq(pulsedeskTeams.tenantId, input.tenantId), eq(pulsedeskTeams.id, input.teamId), eq(pulsedeskTeams.active, true), isNull(pulsedeskTeams.archivedAt),
    )).limit(1);
    if (!team || (input.queueId && team.queueId && team.queueId !== input.queueId)) {
      throw new PulseDeskServiceDeskError('Team not found', 'PULSEDESK_REFERENCE_NOT_FOUND', 'teamId', 404);
    }
  }
  if (input.slaPolicyId) {
    const [policy] = await db.select({ id: pulsedeskSlaPolicies.id }).from(pulsedeskSlaPolicies).where(and(
      eq(pulsedeskSlaPolicies.tenantId, input.tenantId), eq(pulsedeskSlaPolicies.id, input.slaPolicyId), eq(pulsedeskSlaPolicies.active, true), isNull(pulsedeskSlaPolicies.archivedAt),
    )).limit(1);
    if (!policy) throw new PulseDeskServiceDeskError('SLA policy not found', 'PULSEDESK_REFERENCE_NOT_FOUND', 'slaPolicyId', 404);
  }
}

async function assertAssignee(tenantId: string, userId: string | null): Promise<void> {
  if (!userId) return;
  const membership = await getTenantMembership(userId, tenantId);
  const access = await resolveTenantModuleAccess(userId, tenantId, 'pulsedesk');
  if (!membership || !access.hasAccess || access.accessLevel === 'viewer' || access.accessLevel === 'none') {
    throw new PulseDeskServiceDeskError('Eligible assignee not found', 'PULSEDESK_ASSIGNEE_NOT_FOUND', 'assignedToUserId', 404);
  }
}

function dateValue(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new PulseDeskServiceDeskError(`${field} must be an ISO date`, 'PULSEDESK_DATE_INVALID', field);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new PulseDeskServiceDeskError(`${field} must be an ISO date`, 'PULSEDESK_DATE_INVALID', field);
  }
  return date;
}

function versionValue(value: unknown): number {
  return pulseDeskInteger(value, 'expectedVersion', 1, 2_147_483_647);
}

async function selectedSlaPolicy(tenantId: string, policyId: string | null) {
  const conditions = [eq(pulsedeskSlaPolicies.tenantId, tenantId), eq(pulsedeskSlaPolicies.active, true), isNull(pulsedeskSlaPolicies.archivedAt)];
  conditions.push(policyId ? eq(pulsedeskSlaPolicies.id, policyId) : eq(pulsedeskSlaPolicies.defaultPolicy, true));
  const [row] = await db.select().from(pulsedeskSlaPolicies).where(and(...conditions)).limit(1);
  return row ?? null;
}

function ticketCreateInput(body: Record<string, unknown>) {
  requireNoPhiAcknowledgement(body);
  const summary = pulseDeskText(body.summary ?? body.title, 'summary', 160, { required: true, singleLine: true, min: 5 })!;
  return {
    summary,
    description: pulseDeskText(body.description, 'description', 10_000, { nullable: true }) ?? '',
    locationLabel: pulseDeskText(body.locationLabel ?? body.location, 'locationLabel', 120, { nullable: true, singleLine: true }),
    category: pulseDeskEnum(body.category, 'category', PULSEDESK_TICKET_CATEGORIES, 'other'),
    priority: pulseDeskEnum(body.priority, 'priority', PULSEDESK_TICKET_PRIORITIES, 'normal'),
    ticketTypeKey: pulseDeskEnum(body.ticketTypeKey ?? body.type, 'ticketTypeKey', PULSEDESK_TICKET_TYPES, 'service_request'),
    isPatientImpacting: pulseDeskBoolean(body.isPatientImpacting, 'isPatientImpacting', false),
    directoryOrganizationId: pulseDeskId(body.directoryOrganizationId ?? body.clientId, 'directoryOrganizationId'),
    directorySiteId: pulseDeskId(body.directorySiteId ?? body.siteId, 'directorySiteId'),
    requesterContactId: pulseDeskId(body.requesterContactId ?? body.contactId, 'requesterContactId'),
    departmentId: pulseDeskId(body.departmentId, 'departmentId'),
    assetId: pulseDeskId(body.assetId, 'assetId'),
    queueId: pulseDeskId(body.queueId, 'queueId'),
    teamId: pulseDeskId(body.teamId, 'teamId'),
    slaPolicyId: pulseDeskId(body.slaPolicyId, 'slaPolicyId'),
  };
}

async function createTicket(request: FastifyRequest, reply: FastifyReply) {
  try {
    const input = ticketCreateInput(pulseDeskObject(request.body));
    const tenantId = tenant(request);
    const actorId = user(request);
    await assertOperationalReferences({ tenantId, organizationId: input.directoryOrganizationId, siteId: input.directorySiteId, contactId: input.requesterContactId, departmentId: input.departmentId, assetId: input.assetId, queueId: input.queueId, teamId: input.teamId, slaPolicyId: input.slaPolicyId });
    const policy = await selectedSlaPolicy(tenantId, input.slaPolicyId);
    const now = new Date();
    const targets = policy ? calculatePulseDeskSlaTargets(now, policy.responseMinutes, policy.resolutionMinutes) : { responseDueAt: null, resolutionDueAt: null };
    const ticket = await db.transaction(async (tx) => {
      const [allocation] = await tx.insert(pulsedeskRequestSequences).values({ tenantId, lastNumber: 1 })
        .onConflictDoUpdate({ target: pulsedeskRequestSequences.tenantId, set: { lastNumber: sql`${pulsedeskRequestSequences.lastNumber} + 1`, updatedAt: now } })
        .returning({ number: pulsedeskRequestSequences.lastNumber });
      const [row] = await tx.insert(pulsedeskRequests).values({
        tenantId, number: allocation.number, createdByUserId: actorId, updatedByUserId: actorId,
        ...input, slaPolicyId: policy?.id ?? null, responseDueAt: targets.responseDueAt, resolutionDueAt: targets.resolutionDueAt,
      }).returning();
      await tx.insert(pulsedeskRequestEvents).values({ tenantId, requestId: row.id, actorUserId: actorId, eventType: 'created', visibility: 'requester', metadata: { humanId: pulseDeskHumanId(row.number), category: row.category, priority: row.priority, ticketTypeKey: row.ticketTypeKey } });
      if (policy) await tx.insert(pulsedeskSlaEvents).values({ tenantId, ticketId: row.id, slaPolicyId: policy.id, eventType: 'applied', targetAt: targets.resolutionDueAt, metadata: { responseMinutes: policy.responseMinutes, resolutionMinutes: policy.resolutionMinutes } });
      await audit(tx, { tenantId, userId: actorId, action: 'created', entityType: 'ticket', entityId: row.id, metadata: { humanId: pulseDeskHumanId(row.number), category: row.category, priority: row.priority } });
      return row;
    });
    return reply.code(201).send(ticketView(ticket, policy?.atRiskPercent));
  } catch (error) {
    if (handleError(reply, error)) return;
    throw error;
  }
}

async function updateTicket(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    requireNoPhiAcknowledgement(body);
    const { id } = request.params as { id: string };
    const tenantId = tenant(request);
    const actorId = user(request);
    const before = await ticketRow(tenantId, id);
    if (!before) return notFound(reply, 'ticket');
    const expectedVersion = versionValue(body.expectedVersion);
    if ((body.queueId !== undefined || body.teamId !== undefined) && !capabilities(request).canManage) {
      return reply.code(403).send({ error: 'PulseDesk manager access is required to reroute a ticket', code: 'PULSEDESK_MANAGER_REQUIRED' });
    }

    const directoryOrganizationId = body.directoryOrganizationId === undefined ? before.directoryOrganizationId : pulseDeskId(body.directoryOrganizationId, 'directoryOrganizationId');
    const directorySiteId = body.directorySiteId === undefined ? before.directorySiteId : pulseDeskId(body.directorySiteId, 'directorySiteId');
    const requesterContactId = body.requesterContactId === undefined ? before.requesterContactId : pulseDeskId(body.requesterContactId, 'requesterContactId');
    const departmentId = body.departmentId === undefined ? before.departmentId : pulseDeskId(body.departmentId, 'departmentId');
    const assetId = body.assetId === undefined ? before.assetId : pulseDeskId(body.assetId, 'assetId');
    const queueId = body.queueId === undefined ? before.queueId : pulseDeskId(body.queueId, 'queueId');
    const teamId = body.teamId === undefined ? before.teamId : pulseDeskId(body.teamId, 'teamId');
    const slaPolicyId = body.slaPolicyId === undefined ? before.slaPolicyId : pulseDeskId(body.slaPolicyId, 'slaPolicyId');
    await assertOperationalReferences({ tenantId, organizationId: directoryOrganizationId, siteId: directorySiteId, contactId: requesterContactId, departmentId, assetId, queueId, teamId, slaPolicyId });

    const editable = [
      'summary', 'description', 'locationLabel', 'category', 'priority', 'ticketTypeKey',
      'isPatientImpacting', 'directoryOrganizationId', 'directorySiteId', 'requesterContactId',
      'departmentId', 'assetId', 'queueId', 'teamId', 'slaPolicyId',
    ] as const;
    const changedFields = editable.filter(field => body[field] !== undefined);
    if (changedFields.length === 0) throw new PulseDeskServiceDeskError('At least one editable ticket field is required', 'PULSEDESK_PATCH_EMPTY', 'body');
    const policy = body.slaPolicyId === undefined ? null : await selectedSlaPolicy(tenantId, slaPolicyId);
    const now = new Date();
    const targets = policy ? calculatePulseDeskSlaTargets(now, policy.responseMinutes, policy.resolutionMinutes) : null;
    const patch = {
      ...(body.summary !== undefined ? { summary: pulseDeskText(body.summary, 'summary', 160, { required: true, singleLine: true, min: 5 })! } : {}),
      ...(body.description !== undefined ? { description: pulseDeskText(body.description, 'description', 10_000, { nullable: true }) ?? '' } : {}),
      ...(body.locationLabel !== undefined ? { locationLabel: pulseDeskText(body.locationLabel, 'locationLabel', 120, { nullable: true, singleLine: true }) } : {}),
      ...(body.category !== undefined ? { category: pulseDeskEnum(body.category, 'category', PULSEDESK_TICKET_CATEGORIES) } : {}),
      ...(body.priority !== undefined ? { priority: pulseDeskEnum(body.priority, 'priority', PULSEDESK_TICKET_PRIORITIES) } : {}),
      ...(body.ticketTypeKey !== undefined ? { ticketTypeKey: pulseDeskEnum(body.ticketTypeKey, 'ticketTypeKey', PULSEDESK_TICKET_TYPES) } : {}),
      ...(body.isPatientImpacting !== undefined ? { isPatientImpacting: pulseDeskBoolean(body.isPatientImpacting, 'isPatientImpacting') } : {}),
      ...(body.directoryOrganizationId !== undefined ? { directoryOrganizationId } : {}),
      ...(body.directorySiteId !== undefined ? { directorySiteId } : {}),
      ...(body.requesterContactId !== undefined ? { requesterContactId } : {}),
      ...(body.departmentId !== undefined ? { departmentId } : {}),
      ...(body.assetId !== undefined ? { assetId } : {}),
      ...(body.queueId !== undefined ? { queueId } : {}),
      ...(body.teamId !== undefined ? { teamId } : {}),
      ...(body.slaPolicyId !== undefined ? { slaPolicyId: policy?.id ?? null, responseDueAt: targets?.responseDueAt ?? null, resolutionDueAt: targets?.resolutionDueAt ?? null } : {}),
      updatedByUserId: actorId,
      updatedAt: now,
      version: sql`${pulsedeskRequests.version} + 1`,
    };
    const row = await db.transaction(async tx => {
      const [updated] = await tx.update(pulsedeskRequests).set(patch).where(and(
        eq(pulsedeskRequests.tenantId, tenantId), eq(pulsedeskRequests.id, id),
        eq(pulsedeskRequests.version, expectedVersion), isNull(pulsedeskRequests.archivedAt),
      )).returning();
      if (!updated) throw new PulseDeskServiceDeskError('Ticket changed; refresh before updating', 'PULSEDESK_VERSION_CONFLICT', 'expectedVersion', 409);
      await tx.insert(pulsedeskRequestEvents).values({ tenantId, requestId: id, actorUserId: actorId, eventType: 'updated', visibility: 'requester', metadata: { changedFields } });
      if (body.slaPolicyId !== undefined) await tx.insert(pulsedeskSlaEvents).values({ tenantId, ticketId: id, slaPolicyId: policy?.id ?? null, eventType: 'applied', targetAt: targets?.resolutionDueAt ?? null, metadata: { changed: true } });
      await audit(tx, { tenantId, userId: actorId, action: 'updated', entityType: 'ticket', entityId: id, metadata: { changedFields, version: updated.version } });
      return updated;
    });
    return ticketView(row, policy?.atRiskPercent);
  } catch (error) {
    if (handleError(reply, error)) return;
    throw error;
  }
}

async function listTickets(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = (request.query ?? {}) as Record<string, unknown>;
    const limit = pulseDeskInteger(Number(query.limit ?? 50), 'limit', 1, 100);
    const offset = pulseDeskInteger(Number(query.offset ?? 0), 'offset', 0, 1_000_000);
    const conditions = [eq(pulsedeskRequests.tenantId, tenant(request))];
    if (query.includeArchived !== 'true') conditions.push(isNull(pulsedeskRequests.archivedAt));
    if (query.status) conditions.push(eq(pulsedeskRequests.status, pulseDeskEnum(query.status, 'status', PULSEDESK_TICKET_STATUSES)));
    if (query.priority) conditions.push(eq(pulsedeskRequests.priority, pulseDeskEnum(query.priority, 'priority', PULSEDESK_TICKET_PRIORITIES)));
    if (query.category) conditions.push(eq(pulsedeskRequests.category, pulseDeskEnum(query.category, 'category', PULSEDESK_TICKET_CATEGORIES)));
    if (query.queueId) conditions.push(eq(pulsedeskRequests.queueId, pulseDeskId(query.queueId, 'queueId', false)!));
    if (query.teamId) conditions.push(eq(pulsedeskRequests.teamId, pulseDeskId(query.teamId, 'teamId', false)!));
    if (query.assignedToUserId) conditions.push(eq(pulsedeskRequests.assignedToUserId, pulseDeskId(query.assignedToUserId, 'assignedToUserId', false)!));
    if (query.directoryOrganizationId) conditions.push(eq(pulsedeskRequests.directoryOrganizationId, pulseDeskId(query.directoryOrganizationId, 'directoryOrganizationId', false)!));
    if (query.directorySiteId) conditions.push(eq(pulsedeskRequests.directorySiteId, pulseDeskId(query.directorySiteId, 'directorySiteId', false)!));
    if (query.departmentId) conditions.push(eq(pulsedeskRequests.departmentId, pulseDeskId(query.departmentId, 'departmentId', false)!));
    if (query.search) {
      const search = pulseDeskText(query.search, 'search', 100, { required: true, singleLine: true })!;
      conditions.push(or(ilike(pulsedeskRequests.summary, `%${search}%`), ilike(pulsedeskRequests.locationLabel, `%${search}%`))!);
    }
    const sortField = pulseDeskEnum(query.sort ?? 'updatedAt', 'sort', ['createdAt', 'updatedAt', 'priority', 'status', 'number'] as const);
    const direction = pulseDeskEnum(query.direction ?? 'desc', 'direction', ['asc', 'desc'] as const);
    const sortColumn = ({ createdAt: pulsedeskRequests.createdAt, updatedAt: pulsedeskRequests.updatedAt, priority: pulsedeskRequests.priority, status: pulsedeskRequests.status, number: pulsedeskRequests.number })[sortField];
    const where = and(...conditions);
    const [rows, totals] = await Promise.all([
      db.select().from(pulsedeskRequests).where(where).orderBy(direction === 'asc' ? asc(sortColumn) : desc(sortColumn), desc(pulsedeskRequests.id)).limit(limit).offset(offset),
      db.select({ value: count() }).from(pulsedeskRequests).where(where),
    ]);
    return { tickets: rows.map(row => ticketView(row)), pagination: { limit, offset, total: Number(totals[0]?.value ?? 0) } };
  } catch (error) {
    if (handleError(reply, error)) return;
    throw error;
  }
}

async function ticketDetail(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const row = await ticketRow(tenant(request), id, true);
  if (!row) return notFound(reply, 'ticket');
  const internal = capabilities(request).canViewInternal;
  const messageConditions = [eq(pulsedeskTicketMessages.tenantId, tenant(request)), eq(pulsedeskTicketMessages.ticketId, id), isNull(pulsedeskTicketMessages.deletedAt)];
  const eventConditions = [eq(pulsedeskRequestEvents.tenantId, tenant(request)), eq(pulsedeskRequestEvents.requestId, id)];
  if (!internal) {
    messageConditions.push(eq(pulsedeskTicketMessages.visibility, 'requester'));
    eventConditions.push(eq(pulsedeskRequestEvents.visibility, 'requester'));
  }
  const [messages, events, timeEntries, assignments, slaEvents, vendorEngagements, tagRows] = await Promise.all([
    db.select().from(pulsedeskTicketMessages).where(and(...messageConditions)).orderBy(asc(pulsedeskTicketMessages.createdAt)),
    db.select().from(pulsedeskRequestEvents).where(and(...eventConditions)).orderBy(asc(pulsedeskRequestEvents.createdAt)),
    internal ? db.select().from(pulsedeskTimeEntries).where(and(eq(pulsedeskTimeEntries.tenantId, tenant(request)), eq(pulsedeskTimeEntries.ticketId, id))).orderBy(asc(pulsedeskTimeEntries.createdAt)) : Promise.resolve([]),
    internal ? db.select().from(pulsedeskTicketAssignments).where(and(eq(pulsedeskTicketAssignments.tenantId, tenant(request)), eq(pulsedeskTicketAssignments.ticketId, id))).orderBy(asc(pulsedeskTicketAssignments.assignedAt)) : Promise.resolve([]),
    db.select().from(pulsedeskSlaEvents).where(and(eq(pulsedeskSlaEvents.tenantId, tenant(request)), eq(pulsedeskSlaEvents.ticketId, id))).orderBy(asc(pulsedeskSlaEvents.occurredAt)),
    internal ? db.select().from(pulsedeskVendorEngagements).where(and(eq(pulsedeskVendorEngagements.tenantId, tenant(request)), eq(pulsedeskVendorEngagements.ticketId, id))).orderBy(asc(pulsedeskVendorEngagements.createdAt)) : Promise.resolve([]),
    db.select({ id: pulsedeskTags.id, name: pulsedeskTags.name, color: pulsedeskTags.color }).from(pulsedeskTicketTags).innerJoin(pulsedeskTags, and(eq(pulsedeskTicketTags.tenantId, pulsedeskTags.tenantId), eq(pulsedeskTicketTags.tagId, pulsedeskTags.id))).where(and(eq(pulsedeskTicketTags.tenantId, tenant(request)), eq(pulsedeskTicketTags.ticketId, id))),
  ]);
  return { ticket: ticketView(row), messages, events, timeEntries, assignments, slaEvents, vendorEngagements, tags: tagRows, capabilities: { canViewInternal: internal, canManage: capabilities(request).canManage } };
}

async function addMessage(request: FastifyRequest, reply: FastifyReply, forcedVisibility?: 'requester' | 'internal') {
  try {
    const body = pulseDeskObject(request.body);
    requireNoPhiAcknowledgement(body);
    const visibility = forcedVisibility ?? pulseDeskEnum(body.visibility ?? (body.internal === true ? 'internal' : 'requester'), 'visibility', ['requester', 'internal'] as const);
    if (visibility === 'internal' && !capabilities(request).canViewInternal) {
      return reply.code(403).send({ error: 'Internal-note access is required', code: 'PULSEDESK_INTERNAL_ACCESS_REQUIRED' });
    }
    const text = pulseDeskText(body.body, 'body', 10_000, { required: true, min: 2 })!;
    const key = pulseDeskIdempotencyKey(request.headers['idempotency-key']);
    const { id } = request.params as { id: string };
    const tenantId = tenant(request);
    const actorId = user(request);
    const ticket = await ticketRow(tenantId, id);
    if (!ticket) return notFound(reply, 'ticket');
    const [existing] = await db.select().from(pulsedeskTicketMessages).where(and(
      eq(pulsedeskTicketMessages.tenantId, tenantId), eq(pulsedeskTicketMessages.ticketId, id), eq(pulsedeskTicketMessages.idempotencyKey, key),
    )).limit(1);
    if (existing) return reply.send({ message: existing, duplicate: true });
    const messageId = randomUUID();
    const moduleId = visibility === 'requester' ? await pulseDeskModuleId() : null;
    const result = await db.transaction(async (tx) => {
      const [message] = await tx.insert(pulsedeskTicketMessages).values({ id: messageId, tenantId, ticketId: id, authorUserId: actorId, visibility, body: text, idempotencyKey: key }).returning();
      const now = new Date();
      let firstResponse = false;
      if (visibility === 'requester' && !ticket.firstRespondedAt) {
        const [updated] = await tx.update(pulsedeskRequests).set({ firstRespondedAt: now, updatedAt: now, updatedByUserId: actorId, version: sql`${pulsedeskRequests.version} + 1` }).where(and(
          eq(pulsedeskRequests.tenantId, tenantId), eq(pulsedeskRequests.id, id), isNull(pulsedeskRequests.firstRespondedAt),
        )).returning({ id: pulsedeskRequests.id });
        firstResponse = Boolean(updated);
        if (firstResponse) await tx.insert(pulsedeskSlaEvents).values({ tenantId, ticketId: id, slaPolicyId: ticket.slaPolicyId, eventType: 'first_response', targetAt: ticket.responseDueAt, metadata: { met: !ticket.responseDueAt || now <= ticket.responseDueAt } });
      }
      await tx.insert(pulsedeskRequestEvents).values({ tenantId, requestId: id, actorUserId: actorId, eventType: visibility === 'internal' ? 'internal_note_added' : 'requester_reply_added', visibility, metadata: { messageId } });
      let notification: unknown = null;
      if (visibility === 'requester' && moduleId) {
        const [preference] = await tx.select().from(pulsedeskNotificationPreferences).where(and(eq(pulsedeskNotificationPreferences.tenantId, tenantId), eq(pulsedeskNotificationPreferences.userId, ticket.createdByUserId))).limit(1);
        if (preference?.inAppEnabled !== false) {
          notification = await enqueueOutboxMessage({
            tenantId, moduleId, requestedByUserId: actorId, recipientUserId: ticket.createdByUserId, channel: 'in_app',
            subject: `PulseDesk ${pulseDeskHumanId(ticket.number)} update`,
            body: `PulseDesk ${pulseDeskHumanId(ticket.number)} has a requester-visible update. Open the ticket to view it.`,
            context: { entityType: 'pulsedesk_ticket', entityId: id, event: 'requester_reply_added' },
            idempotencyKey: `pulsedesk:reply:${messageId}`,
          }, tx);
        }
      }
      await audit(tx, { tenantId, userId: actorId, action: visibility === 'internal' ? 'internal_note_added' : 'requester_reply_added', entityType: 'ticket', entityId: id, metadata: { messageId, firstResponse } });
      return { message, duplicate: false, notification };
    });
    return reply.code(201).send(result);
  } catch (error) {
    if (handleError(reply, error)) return;
    throw error;
  }
}

async function addTimeEntry(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    requireNoPhiAcknowledgement(body);
    const key = pulseDeskIdempotencyKey(request.headers['idempotency-key']);
    const minutes = pulseDeskInteger(body.minutes, 'minutes', 1, 1440);
    const workType = pulseDeskEnum(body.workType, 'workType', ['remote', 'onsite', 'vendor', 'administrative'] as const, 'onsite');
    const description = pulseDeskText(body.description, 'description', 2000, { nullable: true });
    const { id } = request.params as { id: string };
    const tenantId = tenant(request);
    const actorId = user(request);
    if (!await ticketRow(tenantId, id)) return notFound(reply, 'ticket');
    const [existing] = await db.select().from(pulsedeskTimeEntries).where(and(eq(pulsedeskTimeEntries.tenantId, tenantId), eq(pulsedeskTimeEntries.ticketId, id), eq(pulsedeskTimeEntries.idempotencyKey, key))).limit(1);
    if (existing) return { timeEntry: existing, duplicate: true };
    const result = await db.transaction(async (tx) => {
      const [entry] = await tx.insert(pulsedeskTimeEntries).values({ tenantId, ticketId: id, userId: actorId, minutes, workType, description, idempotencyKey: key }).returning();
      await tx.insert(pulsedeskRequestEvents).values({ tenantId, requestId: id, actorUserId: actorId, eventType: 'time_logged', visibility: 'internal', metadata: { timeEntryId: entry.id, minutes, workType } });
      await audit(tx, { tenantId, userId: actorId, action: 'time_logged', entityType: 'ticket', entityId: id, metadata: { timeEntryId: entry.id, minutes, workType } });
      return { timeEntry: entry, duplicate: false };
    });
    return reply.code(201).send(result);
  } catch (error) {
    if (handleError(reply, error)) return;
    throw error;
  }
}

async function assignTicket(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    const expectedVersion = versionValue(body.expectedVersion);
    const assignedToUserId = pulseDeskId(body.assignedToUserId, 'assignedToUserId');
    const queueId = pulseDeskId(body.queueId, 'queueId');
    const teamId = pulseDeskId(body.teamId, 'teamId');
    const { id } = request.params as { id: string };
    const tenantId = tenant(request);
    const actorId = user(request);
    const ticket = await ticketRow(tenantId, id);
    if (!ticket) return notFound(reply, 'ticket');
    await Promise.all([assertAssignee(tenantId, assignedToUserId), assertOperationalReferences({ tenantId, queueId, teamId })]);
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(pulsedeskRequests).set({
        assignedToUserId, queueId, teamId, status: ticket.status === 'new' ? 'assigned' : ticket.status,
        updatedByUserId: actorId, updatedAt: now, version: sql`${pulsedeskRequests.version} + 1`,
      }).where(and(eq(pulsedeskRequests.tenantId, tenantId), eq(pulsedeskRequests.id, id), eq(pulsedeskRequests.version, expectedVersion), isNull(pulsedeskRequests.archivedAt))).returning();
      if (!updated) throw new PulseDeskServiceDeskError('Ticket changed; refresh before assigning', 'PULSEDESK_VERSION_CONFLICT', 'expectedVersion', 409);
      await tx.update(pulsedeskTicketAssignments).set({ endedAt: now }).where(and(eq(pulsedeskTicketAssignments.tenantId, tenantId), eq(pulsedeskTicketAssignments.ticketId, id), isNull(pulsedeskTicketAssignments.endedAt)));
      const [assignment] = await tx.insert(pulsedeskTicketAssignments).values({ tenantId, ticketId: id, assignedToUserId, queueId, teamId, assignedByUserId: actorId }).returning();
      await tx.insert(pulsedeskRequestEvents).values({ tenantId, requestId: id, actorUserId: actorId, eventType: 'assignment_changed', visibility: 'requester', fromStatus: ticket.status, toStatus: updated.status, metadata: { assignmentId: assignment.id, assignedToUserId, queueId, teamId } });
      await audit(tx, { tenantId, userId: actorId, action: 'assigned', entityType: 'ticket', entityId: id, metadata: { assignmentId: assignment.id, assignedToUserId, queueId, teamId } });
      return { ticket: ticketView(updated), assignment };
    });
    return result;
  } catch (error) {
    if (handleError(reply, error)) return;
    throw error;
  }
}

async function transitionTicket(request: FastifyRequest, reply: FastifyReply, forcedAction?: string) {
  try {
    const body = pulseDeskObject(request.body);
    const expectedVersion = versionValue(body.expectedVersion);
    const { id } = request.params as { id: string };
    const action = forcedAction ?? (request.params as { action?: string }).action ?? String(body.toStatus ?? '');
    const tenantId = tenant(request);
    const actorId = user(request);
    const ticket = await ticketRow(tenantId, id);
    if (!ticket) return notFound(reply, 'ticket');
    let toStatus: PulseDeskTicketStatus = ticket.status as PulseDeskTicketStatus;
    let archive = false;
    if (action === 'resolve') toStatus = 'resolved';
    else if (action === 'close') toStatus = 'closed';
    else if (action === 'reopen') toStatus = 'triage';
    else if (action === 'archive') archive = true;
    else toStatus = pulseDeskEnum(body.toStatus ?? action, 'toStatus', PULSEDESK_TICKET_STATUSES);
    if (!archive) assertPulseDeskTicketTransition(ticket.status, toStatus);
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(pulsedeskRequests).set({
        status: toStatus,
        ...(toStatus === 'resolved' ? { resolvedAt: now } : {}),
        ...(toStatus === 'closed' ? { closedAt: now } : {}),
        ...(action === 'reopen' ? { reopenedAt: now, resolvedAt: null, closedAt: null } : {}),
        ...(archive ? { archivedAt: now } : {}),
        updatedByUserId: actorId, updatedAt: now, version: sql`${pulsedeskRequests.version} + 1`,
      }).where(and(eq(pulsedeskRequests.tenantId, tenantId), eq(pulsedeskRequests.id, id), eq(pulsedeskRequests.version, expectedVersion), isNull(pulsedeskRequests.archivedAt))).returning();
      if (!updated) throw new PulseDeskServiceDeskError('Ticket changed; refresh before transitioning', 'PULSEDESK_VERSION_CONFLICT', 'expectedVersion', 409);
      const eventType = archive ? 'archived' : action === 'reopen' ? 'reopened' : 'status_changed';
      await tx.insert(pulsedeskRequestEvents).values({ tenantId, requestId: id, actorUserId: actorId, eventType, visibility: 'requester', fromStatus: ticket.status, toStatus: updated.status, metadata: { action } });
      if (toStatus === 'resolved') await tx.insert(pulsedeskSlaEvents).values({ tenantId, ticketId: id, slaPolicyId: ticket.slaPolicyId, eventType: 'resolved', targetAt: ticket.resolutionDueAt, metadata: { met: !ticket.resolutionDueAt || now <= ticket.resolutionDueAt } });
      if (action === 'reopen') await tx.insert(pulsedeskSlaEvents).values({ tenantId, ticketId: id, slaPolicyId: ticket.slaPolicyId, eventType: 'reopened', targetAt: ticket.resolutionDueAt, metadata: {} });
      await audit(tx, { tenantId, userId: actorId, action, entityType: 'ticket', entityId: id, metadata: { fromStatus: ticket.status, toStatus: updated.status } });
      return ticketView(updated);
    });
    return result;
  } catch (error) {
    if (handleError(reply, error)) return;
    throw error;
  }
}

async function evaluateSla(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const ticket = await ticketRow(tenant(request), id);
  if (!ticket) return notFound(reply, 'ticket');
  const projection = pulseDeskSlaProjection({ status: ticket.status, createdAt: ticket.createdAt, responseDueAt: ticket.responseDueAt, resolutionDueAt: ticket.resolutionDueAt, firstRespondedAt: ticket.firstRespondedAt, resolvedAt: ticket.resolvedAt });
  if (projection.state !== 'at_risk' && projection.state !== 'overdue') return { ticket: ticketView(ticket), event: null };
  const eventType = projection.state;
  const [existing] = await db.select().from(pulsedeskSlaEvents).where(and(eq(pulsedeskSlaEvents.tenantId, tenant(request)), eq(pulsedeskSlaEvents.ticketId, id), eq(pulsedeskSlaEvents.eventType, eventType))).limit(1);
  if (existing) return { ticket: ticketView(ticket), event: existing };
  const result = await db.transaction(async (tx) => {
    const [event] = await tx.insert(pulsedeskSlaEvents).values({ tenantId: tenant(request), ticketId: id, slaPolicyId: ticket.slaPolicyId, eventType, targetAt: ticket.resolutionDueAt, metadata: { responseOverdue: projection.responseOverdue, resolutionOverdue: projection.resolutionOverdue } }).returning();
    await tx.insert(pulsedeskRequestEvents).values({ tenantId: tenant(request), requestId: id, actorUserId: user(request), eventType: 'sla_changed', visibility: 'requester', metadata: { slaEventId: event.id, state: projection.state } });
    await audit(tx, { tenantId: tenant(request), userId: user(request), action: `sla_${projection.state}`, entityType: 'ticket', entityId: id, metadata: { slaEventId: event.id } });
    return event;
  });
  return { ticket: ticketView(ticket), event: result };
}

async function ticketAttachments(request: FastifyRequest, reply: FastifyReply, operation: 'list' | 'create' | 'content' | 'delete') {
  try {
    const { id, attachmentId } = request.params as { id: string; attachmentId?: string };
    if (!await ticketRow(tenant(request), id, true)) return notFound(reply, 'ticket');
    const source = operation === 'list' || operation === 'content' ? (request.query ?? {}) : pulseDeskObject(request.body);
    const visibility = pulseDeskEnum((source as Record<string, unknown>).visibility, 'visibility', ['requester', 'internal'] as const, 'requester');
    if (visibility === 'internal' && !capabilities(request).canViewInternal) {
      return reply.code(403).send({ error: 'Internal attachment access is required', code: 'PULSEDESK_INTERNAL_ACCESS_REQUIRED' });
    }
    const objectType = visibility === 'internal' ? 'pulsedesk_ticket_internal' : 'pulsedesk_ticket_requester';
    const moduleId = await pulseDeskModuleId();
    if (operation === 'list') return listAttachments({ tenantId: tenant(request), moduleId, objectType, objectId: id });
    if (operation === 'content') {
      const result = await getAttachmentContent({ tenantId: tenant(request), moduleId, attachmentId: attachmentId!, objectType, objectId: id });
      if (!result) return notFound(reply, 'attachment');
      return reply.header('content-type', String(result.metadata.detected_mime_type)).header('content-disposition', `attachment; filename="${String(result.metadata.original_name).replace(/["\r\n]/g, '')}"`).send(result.content);
    }
    if (operation === 'delete') {
      const body = pulseDeskObject(request.body);
      const deleted = await softDeleteAttachment({ tenantId: tenant(request), moduleId, attachmentId: attachmentId!, deletedByUserId: user(request), version: versionValue(body.expectedVersion), objectType, objectId: id });
      if (!deleted) throw new PulseDeskServiceDeskError('Attachment changed or was not found', 'PULSEDESK_ATTACHMENT_VERSION_CONFLICT', 'expectedVersion', 409);
      await audit(db, { tenantId: tenant(request), userId: user(request), action: 'attachment_deleted', entityType: 'ticket', entityId: id, metadata: { attachmentId, visibility } });
      return deleted;
    }
    const body = pulseDeskObject(request.body);
    requireNoPhiAcknowledgement(body);
    const originalName = pulseDeskText(body.originalName, 'originalName', 240, { required: true, singleLine: true })!;
    const declaredMimeType = pulseDeskText(body.declaredMimeType, 'declaredMimeType', 120, { nullable: true, singleLine: true });
    if (typeof body.contentBase64 !== 'string' || body.contentBase64.length < 4 || body.contentBase64.length > 40_000_000) throw new PulseDeskServiceDeskError('Attachment encoding is invalid', 'PULSEDESK_ATTACHMENT_INVALID', 'contentBase64');
    const base64 = body.contentBase64;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) throw new PulseDeskServiceDeskError('Attachment encoding is invalid', 'PULSEDESK_ATTACHMENT_INVALID', 'contentBase64');
    const content = Buffer.from(base64, 'base64');
    if (declaredMimeType?.startsWith('text/')) assertNoProhibitedPhi(content.toString('utf8'), 'attachmentContent');
    const attachment = await createAttachment({ tenantId: tenant(request), moduleId, objectType, objectId: id, originalName, declaredMimeType, content, createdByUserId: user(request) });
    await db.transaction(async (tx) => {
      await tx.insert(pulsedeskRequestEvents).values({ tenantId: tenant(request), requestId: id, actorUserId: user(request), eventType: 'attachment_added', visibility, metadata: { attachmentId: attachment.id, sizeBytes: content.length } });
      await audit(tx, { tenantId: tenant(request), userId: user(request), action: 'attachment_added', entityType: 'ticket', entityId: id, metadata: { attachmentId: attachment.id, visibility, sizeBytes: content.length } });
    });
    return reply.code(201).send(attachment);
  } catch (error) {
    if (handleError(reply, error)) return;
    const code = (error as { code?: string }).code;
    if (code) return reply.code(code === 'ATTACHMENT_QUARANTINED' ? 403 : 400).send({ error: (error as Error).message, code });
    throw error;
  }
}

async function dashboard(request: FastifyRequest) {
  const tenantId = tenant(request);
  const openStatuses = ['new', 'triage', 'assigned', 'waiting_department', 'waiting_vendor', 'in_progress', 'escalated'];
  const [ticketRows, assetRows, supplyRows, facilityRows, timeRows] = await Promise.all([
    db.select().from(pulsedeskRequests).where(and(eq(pulsedeskRequests.tenantId, tenantId), isNull(pulsedeskRequests.archivedAt))),
    db.select({ value: count() }).from(pulsedeskAssets).where(and(eq(pulsedeskAssets.tenantId, tenantId), isNull(pulsedeskAssets.archivedAt))),
    db.select().from(pulsedeskSupplyRequests).where(and(eq(pulsedeskSupplyRequests.tenantId, tenantId), isNull(pulsedeskSupplyRequests.archivedAt))),
    db.select().from(pulsedeskFacilityRequests).where(and(eq(pulsedeskFacilityRequests.tenantId, tenantId), isNull(pulsedeskFacilityRequests.archivedAt))),
    db.select({ minutes: sql<number>`COALESCE(SUM(${pulsedeskTimeEntries.minutes}), 0)` }).from(pulsedeskTimeEntries).where(eq(pulsedeskTimeEntries.tenantId, tenantId)),
  ]);
  const projections = ticketRows.map(row => pulseDeskSlaProjection({ status: row.status, createdAt: row.createdAt, responseDueAt: row.responseDueAt, resolutionDueAt: row.resolutionDueAt, firstRespondedAt: row.firstRespondedAt, resolvedAt: row.resolvedAt }));
  const byStatus = Object.fromEntries(PULSEDESK_TICKET_STATUSES.map(status => [status, ticketRows.filter(row => row.status === status).length]));
  return {
    metrics: {
      tickets: ticketRows.length,
      openTickets: ticketRows.filter(row => openStatuses.includes(row.status)).length,
      atRisk: projections.filter(row => row.state === 'at_risk').length,
      overdue: projections.filter(row => row.state === 'overdue').length,
      operationalAssets: Number(assetRows[0]?.value ?? 0),
      pendingSupplyRequests: supplyRows.filter(row => !['received', 'cancelled'].includes(row.status)).length,
      openFacilityRequests: facilityRows.filter(row => !['resolved', 'closed', 'cancelled'].includes(row.status)).length,
      timeMinutes: Number(timeRows[0]?.minutes ?? 0),
    },
    byStatus,
    generatedAt: new Date().toISOString(),
  };
}

function rejectTechDeckFields(body: Record<string, unknown>): void {
  const prohibited = [
    'ipAddress', 'macAddress', 'cidr', 'vlan', 'vlanId', 'gateway', 'dnsServers',
    'dhcp', 'hostname', 'operatingSystem', 'configuration', 'credential',
    'remoteCommand', 'script', 'discoveryState',
  ];
  const field = prohibited.find(key => key in body);
  if (field) throw new PulseDeskServiceDeskError(
    'Technical configuration belongs in TechDeck; PulseDesk stores operational equipment references only',
    'PULSEDESK_TECHDECK_FIELD_PROHIBITED',
    field,
  );
}

async function listAssets(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = (request.query ?? {}) as Record<string, unknown>;
    const limit = pulseDeskInteger(Number(query.limit ?? 50), 'limit', 1, 100);
    const offset = pulseDeskInteger(Number(query.offset ?? 0), 'offset', 0, 1_000_000);
    const conditions = [eq(pulsedeskAssets.tenantId, tenant(request))];
    if (query.includeArchived !== 'true') conditions.push(isNull(pulsedeskAssets.archivedAt));
    if (query.status) conditions.push(eq(pulsedeskAssets.status, pulseDeskEnum(query.status, 'status', ['active', 'maintenance', 'out_of_service', 'retired'] as const)));
    if (query.directorySiteId) conditions.push(eq(pulsedeskAssets.directorySiteId, pulseDeskId(query.directorySiteId, 'directorySiteId', false)!));
    if (query.departmentId) conditions.push(eq(pulsedeskAssets.departmentId, pulseDeskId(query.departmentId, 'departmentId', false)!));
    if (query.search) {
      const search = pulseDeskText(query.search, 'search', 100, { required: true, singleLine: true })!;
      conditions.push(or(ilike(pulsedeskAssets.name, `%${search}%`), ilike(pulsedeskAssets.assetTag, `%${search}%`), ilike(pulsedeskAssets.serialNumber, `%${search}%`))!);
    }
    const where = and(...conditions);
    const [rows, totals] = await Promise.all([
      db.select().from(pulsedeskAssets).where(where).orderBy(asc(pulsedeskAssets.name)).limit(limit).offset(offset),
      db.select({ value: count() }).from(pulsedeskAssets).where(where),
    ]);
    return { assets: rows, pagination: { limit, offset, total: Number(totals[0]?.value ?? 0) } };
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function createAsset(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    requireNoPhiAcknowledgement(body);
    rejectTechDeckFields(body);
    const input = {
      assetTag: pulseDeskText(body.assetTag ?? body.tag, 'assetTag', 100, { required: true, singleLine: true })!,
      name: pulseDeskText(body.name, 'name', 200, { required: true, singleLine: true, min: 2 })!,
      equipmentType: pulseDeskText(body.equipmentType ?? body.type ?? 'operational_equipment', 'equipmentType', 100, { required: true, singleLine: true })!,
      manufacturer: pulseDeskText(body.manufacturer, 'manufacturer', 120, { nullable: true, singleLine: true }),
      model: pulseDeskText(body.model, 'model', 120, { nullable: true, singleLine: true }),
      serialNumber: pulseDeskText(body.serialNumber, 'serialNumber', 160, { nullable: true, singleLine: true }),
      locationLabel: pulseDeskText(body.locationLabel, 'locationLabel', 120, { nullable: true, singleLine: true }),
      status: pulseDeskEnum(body.status, 'status', ['active', 'maintenance', 'out_of_service', 'retired'] as const, 'active'),
      maintenanceDueAt: dateValue(body.maintenanceDueAt, 'maintenanceDueAt'),
      directoryOrganizationId: pulseDeskId(body.directoryOrganizationId ?? body.clientId, 'directoryOrganizationId'),
      directorySiteId: pulseDeskId(body.directorySiteId ?? body.siteId, 'directorySiteId'),
      departmentId: pulseDeskId(body.departmentId, 'departmentId'),
    };
    if (!/^[a-z][a-z0-9_]{1,99}$/.test(input.equipmentType)) throw new PulseDeskServiceDeskError('equipmentType is invalid', 'PULSEDESK_FIELD_INVALID', 'equipmentType');
    await assertOperationalReferences({ tenantId: tenant(request), organizationId: input.directoryOrganizationId, siteId: input.directorySiteId, departmentId: input.departmentId });
    const [row] = await db.insert(pulsedeskAssets).values({ tenantId: tenant(request), createdByUserId: user(request), updatedByUserId: user(request), ...input }).returning();
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'created', entityType: 'asset', entityId: row.id, metadata: { assetTag: row.assetTag, equipmentType: row.equipmentType } });
    return reply.code(201).send(row);
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function updateAsset(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    requireNoPhiAcknowledgement(body);
    rejectTechDeckFields(body);
    const { id } = request.params as { id: string };
    const [before] = await db.select().from(pulsedeskAssets).where(and(eq(pulsedeskAssets.tenantId, tenant(request)), eq(pulsedeskAssets.id, id), isNull(pulsedeskAssets.archivedAt))).limit(1);
    if (!before) return notFound(reply, 'asset');
    const expectedVersion = versionValue(body.expectedVersion);
    const organizationId = body.directoryOrganizationId === undefined ? before.directoryOrganizationId : pulseDeskId(body.directoryOrganizationId, 'directoryOrganizationId');
    const siteId = body.directorySiteId === undefined ? before.directorySiteId : pulseDeskId(body.directorySiteId, 'directorySiteId');
    const departmentId = body.departmentId === undefined ? before.departmentId : pulseDeskId(body.departmentId, 'departmentId');
    await assertOperationalReferences({ tenantId: tenant(request), organizationId, siteId, departmentId });
    const patch = {
      ...(body.assetTag !== undefined ? { assetTag: pulseDeskText(body.assetTag, 'assetTag', 100, { required: true, singleLine: true })! } : {}),
      ...(body.name !== undefined ? { name: pulseDeskText(body.name, 'name', 200, { required: true, singleLine: true, min: 2 })! } : {}),
      ...(body.equipmentType !== undefined ? { equipmentType: pulseDeskText(body.equipmentType, 'equipmentType', 100, { required: true, singleLine: true })! } : {}),
      ...(body.manufacturer !== undefined ? { manufacturer: pulseDeskText(body.manufacturer, 'manufacturer', 120, { nullable: true, singleLine: true }) } : {}),
      ...(body.model !== undefined ? { model: pulseDeskText(body.model, 'model', 120, { nullable: true, singleLine: true }) } : {}),
      ...(body.serialNumber !== undefined ? { serialNumber: pulseDeskText(body.serialNumber, 'serialNumber', 160, { nullable: true, singleLine: true }) } : {}),
      ...(body.locationLabel !== undefined ? { locationLabel: pulseDeskText(body.locationLabel, 'locationLabel', 120, { nullable: true, singleLine: true }) } : {}),
      ...(body.status !== undefined ? { status: pulseDeskEnum(body.status, 'status', ['active', 'maintenance', 'out_of_service', 'retired'] as const) } : {}),
      ...(body.maintenanceDueAt !== undefined ? { maintenanceDueAt: dateValue(body.maintenanceDueAt, 'maintenanceDueAt') } : {}),
      directoryOrganizationId: organizationId, directorySiteId: siteId, departmentId,
      updatedByUserId: user(request), updatedAt: new Date(), version: sql`${pulsedeskAssets.version} + 1`,
    };
    const [row] = await db.update(pulsedeskAssets).set(patch).where(and(eq(pulsedeskAssets.tenantId, tenant(request)), eq(pulsedeskAssets.id, id), eq(pulsedeskAssets.version, expectedVersion))).returning();
    if (!row) throw new PulseDeskServiceDeskError('Asset changed; refresh before updating', 'PULSEDESK_VERSION_CONFLICT', 'expectedVersion', 409);
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'updated', entityType: 'asset', entityId: id, metadata: { version: row.version } });
    return row;
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function listConfiguration(request: FastifyRequest) {
  const tenantId = tenant(request);
  const [queues, teams, options, slaPolicies, departments] = await Promise.all([
    db.select().from(pulsedeskQueues).where(and(eq(pulsedeskQueues.tenantId, tenantId), isNull(pulsedeskQueues.archivedAt))).orderBy(asc(pulsedeskQueues.name)),
    db.select().from(pulsedeskTeams).where(and(eq(pulsedeskTeams.tenantId, tenantId), isNull(pulsedeskTeams.archivedAt))).orderBy(asc(pulsedeskTeams.name)),
    db.select().from(pulsedeskTicketOptions).where(and(eq(pulsedeskTicketOptions.tenantId, tenantId), isNull(pulsedeskTicketOptions.archivedAt))).orderBy(asc(pulsedeskTicketOptions.kind), asc(pulsedeskTicketOptions.sortOrder)),
    db.select().from(pulsedeskSlaPolicies).where(and(eq(pulsedeskSlaPolicies.tenantId, tenantId), isNull(pulsedeskSlaPolicies.archivedAt))).orderBy(asc(pulsedeskSlaPolicies.name)),
    db.select().from(pulsedeskDepartments).where(and(eq(pulsedeskDepartments.tenantId, tenantId), isNull(pulsedeskDepartments.archivedAt))).orderBy(asc(pulsedeskDepartments.name)),
  ]);
  return { queues, teams, options, slaPolicies, departments, defaults: { statuses: PULSEDESK_TICKET_STATUSES, priorities: PULSEDESK_TICKET_PRIORITIES, categories: PULSEDESK_TICKET_CATEGORIES, types: PULSEDESK_TICKET_TYPES } };
}

async function createQueue(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    const name = pulseDeskText(body.name, 'name', 100, { required: true, singleLine: true, min: 2 })!;
    const description = pulseDeskText(body.description, 'description', 500, { nullable: true });
    const [row] = await db.insert(pulsedeskQueues).values({ tenantId: tenant(request), name, description, createdByUserId: user(request), updatedByUserId: user(request) }).returning();
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'created', entityType: 'queue', entityId: row.id });
    return reply.code(201).send(row);
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function updateQueue(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body); const { id } = request.params as { id: string };
    const patch = {
      ...(body.name !== undefined ? { name: pulseDeskText(body.name, 'name', 100, { required: true, singleLine: true, min: 2 })! } : {}),
      ...(body.description !== undefined ? { description: pulseDeskText(body.description, 'description', 500, { nullable: true }) } : {}),
      ...(body.active !== undefined ? { active: pulseDeskBoolean(body.active, 'active') } : {}),
      updatedByUserId: user(request), updatedAt: new Date(), version: sql`${pulsedeskQueues.version} + 1`,
    };
    const [row] = await db.update(pulsedeskQueues).set(patch).where(and(eq(pulsedeskQueues.tenantId, tenant(request)), eq(pulsedeskQueues.id, id), eq(pulsedeskQueues.version, versionValue(body.expectedVersion)), isNull(pulsedeskQueues.archivedAt))).returning();
    if (!row) throw new PulseDeskServiceDeskError('Queue changed or was not found', 'PULSEDESK_VERSION_CONFLICT', 'expectedVersion', 409);
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'updated', entityType: 'queue', entityId: id, metadata: { version: row.version } });
    return row;
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function createTeam(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    const queueId = pulseDeskId(body.queueId, 'queueId');
    await assertOperationalReferences({ tenantId: tenant(request), queueId });
    const [row] = await db.insert(pulsedeskTeams).values({ tenantId: tenant(request), queueId, name: pulseDeskText(body.name, 'name', 100, { required: true, singleLine: true, min: 2 })!, description: pulseDeskText(body.description, 'description', 500, { nullable: true }), createdByUserId: user(request), updatedByUserId: user(request) }).returning();
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'created', entityType: 'team', entityId: row.id, metadata: { queueId } });
    return reply.code(201).send(row);
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function updateTeam(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body); const { id } = request.params as { id: string };
    const queueId = body.queueId === undefined ? undefined : pulseDeskId(body.queueId, 'queueId');
    if (queueId !== undefined) await assertOperationalReferences({ tenantId: tenant(request), queueId });
    const [row] = await db.update(pulsedeskTeams).set({
      ...(body.name !== undefined ? { name: pulseDeskText(body.name, 'name', 100, { required: true, singleLine: true, min: 2 })! } : {}),
      ...(body.description !== undefined ? { description: pulseDeskText(body.description, 'description', 500, { nullable: true }) } : {}),
      ...(body.active !== undefined ? { active: pulseDeskBoolean(body.active, 'active') } : {}),
      ...(queueId !== undefined ? { queueId } : {}),
      updatedByUserId: user(request), updatedAt: new Date(), version: sql`${pulsedeskTeams.version} + 1`,
    }).where(and(eq(pulsedeskTeams.tenantId, tenant(request)), eq(pulsedeskTeams.id, id), eq(pulsedeskTeams.version, versionValue(body.expectedVersion)), isNull(pulsedeskTeams.archivedAt))).returning();
    if (!row) throw new PulseDeskServiceDeskError('Team changed or was not found', 'PULSEDESK_VERSION_CONFLICT', 'expectedVersion', 409);
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'updated', entityType: 'team', entityId: id, metadata: { version: row.version } });
    return row;
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function addTeamMember(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body); const { id } = request.params as { id: string };
    const memberUserId = pulseDeskId(body.userId, 'userId', false)!;
    await assertAssignee(tenant(request), memberUserId);
    const [team] = await db.select({ id: pulsedeskTeams.id }).from(pulsedeskTeams).where(and(eq(pulsedeskTeams.tenantId, tenant(request)), eq(pulsedeskTeams.id, id), isNull(pulsedeskTeams.archivedAt))).limit(1);
    if (!team) return notFound(reply, 'team');
    const [row] = await db.insert(pulsedeskTeamMembers).values({ tenantId: tenant(request), teamId: id, userId: memberUserId, lead: pulseDeskBoolean(body.lead, 'lead', false), createdByUserId: user(request) }).onConflictDoUpdate({ target: [pulsedeskTeamMembers.tenantId, pulsedeskTeamMembers.teamId, pulsedeskTeamMembers.userId], set: { lead: pulseDeskBoolean(body.lead, 'lead', false) } }).returning();
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'member_added', entityType: 'team', entityId: id, metadata: { userId: memberUserId, lead: row.lead } });
    return reply.code(201).send(row);
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function createSlaPolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    const responseMinutes = pulseDeskInteger(body.responseMinutes, 'responseMinutes', 1, 525600);
    const resolutionMinutes = pulseDeskInteger(body.resolutionMinutes, 'resolutionMinutes', responseMinutes, 525600);
    const defaultPolicy = pulseDeskBoolean(body.defaultPolicy, 'defaultPolicy', false);
    const tenantId = tenant(request); const actorId = user(request);
    const row = await db.transaction(async (tx) => {
      if (defaultPolicy) await tx.update(pulsedeskSlaPolicies).set({ defaultPolicy: false, updatedByUserId: actorId, updatedAt: new Date(), version: sql`${pulsedeskSlaPolicies.version} + 1` }).where(and(eq(pulsedeskSlaPolicies.tenantId, tenantId), eq(pulsedeskSlaPolicies.defaultPolicy, true), isNull(pulsedeskSlaPolicies.archivedAt)));
      const [created] = await tx.insert(pulsedeskSlaPolicies).values({ tenantId, name: pulseDeskText(body.name, 'name', 120, { required: true, singleLine: true, min: 2 })!, description: pulseDeskText(body.description, 'description', 500, { nullable: true }), responseMinutes, resolutionMinutes, atRiskPercent: body.atRiskPercent === undefined ? 80 : pulseDeskInteger(body.atRiskPercent, 'atRiskPercent', 1, 99), defaultPolicy, createdByUserId: actorId, updatedByUserId: actorId }).returning();
      await audit(tx, { tenantId, userId: actorId, action: 'created', entityType: 'sla_policy', entityId: created.id, metadata: { responseMinutes, resolutionMinutes, defaultPolicy } });
      return created;
    });
    return reply.code(201).send(row);
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function updateSlaPolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body); const { id } = request.params as { id: string };
    const [before] = await db.select().from(pulsedeskSlaPolicies).where(and(eq(pulsedeskSlaPolicies.tenantId, tenant(request)), eq(pulsedeskSlaPolicies.id, id), isNull(pulsedeskSlaPolicies.archivedAt))).limit(1);
    if (!before) return notFound(reply, 'SLA policy');
    const responseMinutes = body.responseMinutes === undefined ? before.responseMinutes : pulseDeskInteger(body.responseMinutes, 'responseMinutes', 1, 525600);
    const resolutionMinutes = body.resolutionMinutes === undefined ? before.resolutionMinutes : pulseDeskInteger(body.resolutionMinutes, 'resolutionMinutes', responseMinutes, 525600);
    const defaultPolicy = body.defaultPolicy === undefined ? before.defaultPolicy : pulseDeskBoolean(body.defaultPolicy, 'defaultPolicy');
    const row = await db.transaction(async (tx) => {
      if (defaultPolicy && !before.defaultPolicy) await tx.update(pulsedeskSlaPolicies).set({ defaultPolicy: false, updatedByUserId: user(request), updatedAt: new Date(), version: sql`${pulsedeskSlaPolicies.version} + 1` }).where(and(eq(pulsedeskSlaPolicies.tenantId, tenant(request)), eq(pulsedeskSlaPolicies.defaultPolicy, true), isNull(pulsedeskSlaPolicies.archivedAt)));
      const [updated] = await tx.update(pulsedeskSlaPolicies).set({
        ...(body.name !== undefined ? { name: pulseDeskText(body.name, 'name', 120, { required: true, singleLine: true, min: 2 })! } : {}),
        ...(body.description !== undefined ? { description: pulseDeskText(body.description, 'description', 500, { nullable: true }) } : {}),
        responseMinutes, resolutionMinutes, defaultPolicy,
        ...(body.atRiskPercent !== undefined ? { atRiskPercent: pulseDeskInteger(body.atRiskPercent, 'atRiskPercent', 1, 99) } : {}),
        ...(body.active !== undefined ? { active: pulseDeskBoolean(body.active, 'active') } : {}),
        updatedByUserId: user(request), updatedAt: new Date(), version: sql`${pulsedeskSlaPolicies.version} + 1`,
      }).where(and(eq(pulsedeskSlaPolicies.tenantId, tenant(request)), eq(pulsedeskSlaPolicies.id, id), eq(pulsedeskSlaPolicies.version, versionValue(body.expectedVersion)))).returning();
      if (!updated) throw new PulseDeskServiceDeskError('SLA policy changed', 'PULSEDESK_VERSION_CONFLICT', 'expectedVersion', 409);
      await audit(tx, { tenantId: tenant(request), userId: user(request), action: 'updated', entityType: 'sla_policy', entityId: id, metadata: { version: updated.version } });
      return updated;
    });
    return row;
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function createTicketOption(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    const kind = pulseDeskEnum(body.kind, 'kind', ['status', 'priority', 'type', 'category'] as const);
    const key = pulseDeskText(body.key, 'key', 80, { required: true, singleLine: true, min: 2 })!;
    if (!/^[a-z][a-z0-9_]{1,79}$/.test(key)) throw new PulseDeskServiceDeskError('key is invalid', 'PULSEDESK_FIELD_INVALID', 'key');
    if (kind === 'status' && !PULSEDESK_TICKET_STATUSES.includes(key as any)) throw new PulseDeskServiceDeskError('Custom lifecycle states require a reviewed transition contract', 'PULSEDESK_STATUS_OPTION_UNSUPPORTED', 'key');
    if (kind === 'priority' && !PULSEDESK_TICKET_PRIORITIES.includes(key as any)) throw new PulseDeskServiceDeskError('Custom priority keys are not active', 'PULSEDESK_PRIORITY_OPTION_UNSUPPORTED', 'key');
    if (kind === 'category' && !PULSEDESK_TICKET_CATEGORIES.includes(key as any)) throw new PulseDeskServiceDeskError('Custom category keys are not active', 'PULSEDESK_CATEGORY_OPTION_UNSUPPORTED', 'key');
    if (kind === 'type' && !PULSEDESK_TICKET_TYPES.includes(key as any)) throw new PulseDeskServiceDeskError('Custom ticket type keys are not active', 'PULSEDESK_TYPE_OPTION_UNSUPPORTED', 'key');
    const [row] = await db.insert(pulsedeskTicketOptions).values({ tenantId: tenant(request), kind, key, name: pulseDeskText(body.name, 'name', 100, { required: true, singleLine: true })!, color: pulseDeskText(body.color, 'color', 7, { nullable: true, singleLine: true }), sortOrder: body.sortOrder === undefined ? 0 : pulseDeskInteger(body.sortOrder, 'sortOrder', 0, 10000), responseMinutes: body.responseMinutes == null ? null : pulseDeskInteger(body.responseMinutes, 'responseMinutes', 1, 525600), resolutionMinutes: body.resolutionMinutes == null ? null : pulseDeskInteger(body.resolutionMinutes, 'resolutionMinutes', 1, 525600), closedState: pulseDeskBoolean(body.closedState, 'closedState', false), createdByUserId: user(request), updatedByUserId: user(request) }).returning();
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'created', entityType: 'ticket_option', entityId: row.id, metadata: { kind, key } });
    return reply.code(201).send(row);
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function updateTicketOption(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body); const { id } = request.params as { id: string };
    const [row] = await db.update(pulsedeskTicketOptions).set({
      ...(body.name !== undefined ? { name: pulseDeskText(body.name, 'name', 100, { required: true, singleLine: true })! } : {}),
      ...(body.color !== undefined ? { color: pulseDeskText(body.color, 'color', 7, { nullable: true, singleLine: true }) } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: pulseDeskInteger(body.sortOrder, 'sortOrder', 0, 10000) } : {}),
      ...(body.responseMinutes !== undefined ? { responseMinutes: body.responseMinutes == null ? null : pulseDeskInteger(body.responseMinutes, 'responseMinutes', 1, 525600) } : {}),
      ...(body.resolutionMinutes !== undefined ? { resolutionMinutes: body.resolutionMinutes == null ? null : pulseDeskInteger(body.resolutionMinutes, 'resolutionMinutes', 1, 525600) } : {}),
      ...(body.active !== undefined ? { active: pulseDeskBoolean(body.active, 'active') } : {}),
      updatedByUserId: user(request), updatedAt: new Date(), version: sql`${pulsedeskTicketOptions.version} + 1`,
    }).where(and(eq(pulsedeskTicketOptions.tenantId, tenant(request)), eq(pulsedeskTicketOptions.id, id), eq(pulsedeskTicketOptions.version, versionValue(body.expectedVersion)), isNull(pulsedeskTicketOptions.archivedAt))).returning();
    if (!row) throw new PulseDeskServiceDeskError('Ticket option changed or was not found', 'PULSEDESK_VERSION_CONFLICT', 'expectedVersion', 409);
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'updated', entityType: 'ticket_option', entityId: id, metadata: { version: row.version } });
    return row;
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function addVendorEngagement(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body); const { id } = request.params as { id: string };
    const tenantId = tenant(request); const actorId = user(request);
    if (!await ticketRow(tenantId, id)) return notFound(reply, 'ticket');
    const vendorOrganizationId = pulseDeskId(body.vendorOrganizationId, 'vendorOrganizationId', false)!;
    const [vendor] = await db.select({ id: directoryOrganizations.id, type: directoryOrganizations.type }).from(directoryOrganizations).where(and(eq(directoryOrganizations.tenantId, tenantId), eq(directoryOrganizations.id, vendorOrganizationId), isNull(directoryOrganizations.archivedAt))).limit(1);
    if (!vendor || vendor.type !== 'vendor') throw new PulseDeskServiceDeskError('Vendor organization not found', 'PULSEDESK_VENDOR_NOT_FOUND', 'vendorOrganizationId', 404);
    const status = pulseDeskEnum(body.status, 'status', ['requested', 'acknowledged', 'scheduled', 'waiting', 'completed', 'cancelled'] as const, 'requested');
    const result = await db.transaction(async (tx) => {
      const [row] = await tx.insert(pulsedeskVendorEngagements).values({ tenantId, ticketId: id, vendorOrganizationId, status, referenceCode: pulseDeskText(body.referenceCode, 'referenceCode', 120, { nullable: true, singleLine: true }), expectedAt: dateValue(body.expectedAt, 'expectedAt'), createdByUserId: actorId, updatedByUserId: actorId }).returning();
      await tx.insert(pulsedeskRequestEvents).values({ tenantId, requestId: id, actorUserId: actorId, eventType: 'vendor_updated', visibility: 'requester', metadata: { vendorEngagementId: row.id, vendorOrganizationId, status } });
      await audit(tx, { tenantId, userId: actorId, action: 'vendor_added', entityType: 'ticket', entityId: id, metadata: { vendorEngagementId: row.id, vendorOrganizationId, status } });
      return row;
    });
    return reply.code(201).send(result);
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function updateVendorEngagement(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body); const { id, engagementId } = request.params as { id: string; engagementId: string };
    if (!await ticketRow(tenant(request), id)) return notFound(reply, 'ticket');
    const [row] = await db.update(pulsedeskVendorEngagements).set({
      ...(body.status !== undefined ? { status: pulseDeskEnum(body.status, 'status', ['requested', 'acknowledged', 'scheduled', 'waiting', 'completed', 'cancelled'] as const) } : {}),
      ...(body.referenceCode !== undefined ? { referenceCode: pulseDeskText(body.referenceCode, 'referenceCode', 120, { nullable: true, singleLine: true }) } : {}),
      ...(body.expectedAt !== undefined ? { expectedAt: dateValue(body.expectedAt, 'expectedAt') } : {}),
      updatedByUserId: user(request), updatedAt: new Date(), version: sql`${pulsedeskVendorEngagements.version} + 1`,
    }).where(and(eq(pulsedeskVendorEngagements.tenantId, tenant(request)), eq(pulsedeskVendorEngagements.ticketId, id), eq(pulsedeskVendorEngagements.id, engagementId), eq(pulsedeskVendorEngagements.version, versionValue(body.expectedVersion)))).returning();
    if (!row) throw new PulseDeskServiceDeskError('Vendor engagement changed or was not found', 'PULSEDESK_VERSION_CONFLICT', 'expectedVersion', 409);
    await db.transaction(async (tx) => {
      await tx.insert(pulsedeskRequestEvents).values({ tenantId: tenant(request), requestId: id, actorUserId: user(request), eventType: 'vendor_updated', visibility: 'requester', metadata: { vendorEngagementId: engagementId, status: row.status } });
      await audit(tx, { tenantId: tenant(request), userId: user(request), action: 'vendor_updated', entityType: 'ticket', entityId: id, metadata: { vendorEngagementId: engagementId, status: row.status } });
    });
    return row;
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function listSupplyRequests(request: FastifyRequest) {
  const query = (request.query ?? {}) as Record<string, unknown>;
  const conditions = [eq(pulsedeskSupplyRequests.tenantId, tenant(request)), isNull(pulsedeskSupplyRequests.archivedAt)];
  if (query.status) conditions.push(eq(pulsedeskSupplyRequests.status, pulseDeskEnum(query.status, 'status', ['requested', 'approved', 'ordered', 'received', 'cancelled'] as const)));
  return { supplyRequests: await db.select().from(pulsedeskSupplyRequests).where(and(...conditions)).orderBy(desc(pulsedeskSupplyRequests.createdAt)).limit(100) };
}

async function createSupplyRequest(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body); requireNoPhiAcknowledgement(body);
    const departmentId = pulseDeskId(body.departmentId, 'departmentId'); const ticketId = pulseDeskId(body.ticketId, 'ticketId');
    await assertOperationalReferences({ tenantId: tenant(request), departmentId });
    if (ticketId && !await ticketRow(tenant(request), ticketId)) return notFound(reply, 'ticket');
    const [row] = await db.insert(pulsedeskSupplyRequests).values({ tenantId: tenant(request), ticketId, departmentId, itemName: pulseDeskText(body.itemName, 'itemName', 200, { required: true, singleLine: true, min: 2 })!, quantity: pulseDeskInteger(body.quantity ?? 1, 'quantity', 1, 100000), urgency: pulseDeskEnum(body.urgency, 'urgency', PULSEDESK_TICKET_PRIORITIES, 'normal'), requestedByUserId: user(request), updatedByUserId: user(request) }).returning();
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'created', entityType: 'supply_request', entityId: row.id, metadata: { quantity: row.quantity, urgency: row.urgency, ticketId } });
    return reply.code(201).send(row);
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function updateSupplyRequest(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body); const { id } = request.params as { id: string };
    const [row] = await db.update(pulsedeskSupplyRequests).set({
      ...(body.status !== undefined ? { status: pulseDeskEnum(body.status, 'status', ['requested', 'approved', 'ordered', 'received', 'cancelled'] as const) } : {}),
      ...(body.quantity !== undefined ? { quantity: pulseDeskInteger(body.quantity, 'quantity', 1, 100000) } : {}),
      ...(body.urgency !== undefined ? { urgency: pulseDeskEnum(body.urgency, 'urgency', PULSEDESK_TICKET_PRIORITIES) } : {}),
      updatedByUserId: user(request), updatedAt: new Date(), version: sql`${pulsedeskSupplyRequests.version} + 1`,
    }).where(and(eq(pulsedeskSupplyRequests.tenantId, tenant(request)), eq(pulsedeskSupplyRequests.id, id), eq(pulsedeskSupplyRequests.version, versionValue(body.expectedVersion)), isNull(pulsedeskSupplyRequests.archivedAt))).returning();
    if (!row) throw new PulseDeskServiceDeskError('Supply request changed or was not found', 'PULSEDESK_VERSION_CONFLICT', 'expectedVersion', 409);
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'updated', entityType: 'supply_request', entityId: id, metadata: { status: row.status, version: row.version } });
    return row;
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function listFacilityRequests(request: FastifyRequest) {
  const query = (request.query ?? {}) as Record<string, unknown>;
  const conditions = [eq(pulsedeskFacilityRequests.tenantId, tenant(request)), isNull(pulsedeskFacilityRequests.archivedAt)];
  if (query.status) conditions.push(eq(pulsedeskFacilityRequests.status, pulseDeskEnum(query.status, 'status', ['new', 'assigned', 'in_progress', 'resolved', 'closed', 'cancelled'] as const)));
  return { facilityRequests: await db.select().from(pulsedeskFacilityRequests).where(and(...conditions)).orderBy(desc(pulsedeskFacilityRequests.createdAt)).limit(100) };
}

async function createFacilityRequest(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body); requireNoPhiAcknowledgement(body);
    const directorySiteId = pulseDeskId(body.directorySiteId ?? body.siteId, 'directorySiteId'); const departmentId = pulseDeskId(body.departmentId, 'departmentId'); const ticketId = pulseDeskId(body.ticketId, 'ticketId');
    if (directorySiteId) {
      const [site] = await db.select({ id: directorySites.id }).from(directorySites).where(and(eq(directorySites.tenantId, tenant(request)), eq(directorySites.id, directorySiteId), isNull(directorySites.archivedAt))).limit(1);
      if (!site) throw new PulseDeskServiceDeskError('Facility/site not found', 'PULSEDESK_DIRECTORY_REFERENCE_NOT_FOUND', 'directorySiteId', 404);
    }
    await assertOperationalReferences({ tenantId: tenant(request), departmentId });
    if (ticketId && !await ticketRow(tenant(request), ticketId)) return notFound(reply, 'ticket');
    const requestType = pulseDeskText(body.requestType ?? 'maintenance', 'requestType', 80, { required: true, singleLine: true })!;
    if (!/^[a-z][a-z0-9_]{1,79}$/.test(requestType)) throw new PulseDeskServiceDeskError('requestType is invalid', 'PULSEDESK_FIELD_INVALID', 'requestType');
    const [row] = await db.insert(pulsedeskFacilityRequests).values({ tenantId: tenant(request), ticketId, directorySiteId, departmentId, requestType, title: pulseDeskText(body.title, 'title', 200, { required: true, singleLine: true, min: 2 })!, locationLabel: pulseDeskText(body.locationLabel, 'locationLabel', 120, { nullable: true, singleLine: true }), priority: pulseDeskEnum(body.priority, 'priority', PULSEDESK_TICKET_PRIORITIES, 'normal'), requestedByUserId: user(request), updatedByUserId: user(request) }).returning();
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'created', entityType: 'facility_request', entityId: row.id, metadata: { requestType, priority: row.priority, ticketId } });
    return reply.code(201).send(row);
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function updateFacilityRequest(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body); const { id } = request.params as { id: string };
    const assignedToUserId = body.assignedToUserId === undefined ? undefined : pulseDeskId(body.assignedToUserId, 'assignedToUserId');
    if (assignedToUserId !== undefined) await assertAssignee(tenant(request), assignedToUserId);
    const [row] = await db.update(pulsedeskFacilityRequests).set({
      ...(body.status !== undefined ? { status: pulseDeskEnum(body.status, 'status', ['new', 'assigned', 'in_progress', 'resolved', 'closed', 'cancelled'] as const) } : {}),
      ...(body.priority !== undefined ? { priority: pulseDeskEnum(body.priority, 'priority', PULSEDESK_TICKET_PRIORITIES) } : {}),
      ...(assignedToUserId !== undefined ? { assignedToUserId } : {}),
      updatedByUserId: user(request), updatedAt: new Date(), version: sql`${pulsedeskFacilityRequests.version} + 1`,
    }).where(and(eq(pulsedeskFacilityRequests.tenantId, tenant(request)), eq(pulsedeskFacilityRequests.id, id), eq(pulsedeskFacilityRequests.version, versionValue(body.expectedVersion)), isNull(pulsedeskFacilityRequests.archivedAt))).returning();
    if (!row) throw new PulseDeskServiceDeskError('Facility request changed or was not found', 'PULSEDESK_VERSION_CONFLICT', 'expectedVersion', 409);
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'updated', entityType: 'facility_request', entityId: id, metadata: { status: row.status, version: row.version } });
    return row;
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function listKnowledge(request: FastifyRequest) {
  const internal = capabilities(request).canViewInternal;
  const conditions = [eq(pulsedeskKnowledgeArticles.tenantId, tenant(request)), isNull(pulsedeskKnowledgeArticles.archivedAt)];
  if (!internal) { conditions.push(eq(pulsedeskKnowledgeArticles.status, 'published')); conditions.push(eq(pulsedeskKnowledgeArticles.visibility, 'requester')); }
  const query = (request.query ?? {}) as Record<string, unknown>;
  if (query.search) {
    const search = pulseDeskText(query.search, 'search', 100, { required: true, singleLine: true })!;
    conditions.push(or(ilike(pulsedeskKnowledgeArticles.title, `%${search}%`), ilike(pulsedeskKnowledgeArticles.summary, `%${search}%`))!);
  }
  return { articles: await db.select().from(pulsedeskKnowledgeArticles).where(and(...conditions)).orderBy(asc(pulsedeskKnowledgeArticles.title)).limit(100) };
}

async function createKnowledge(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body); requireNoPhiAcknowledgement(body);
    const status = pulseDeskEnum(body.status, 'status', ['draft', 'published'] as const, 'draft');
    const [row] = await db.insert(pulsedeskKnowledgeArticles).values({ tenantId: tenant(request), slug: pulseDeskSafeSlug(body.slug ?? body.title), title: pulseDeskText(body.title, 'title', 200, { required: true, singleLine: true, min: 2 })!, summary: pulseDeskText(body.summary, 'summary', 500, { nullable: true }), body: pulseDeskText(body.body, 'body', 20_000, { required: true })!, status, visibility: pulseDeskEnum(body.visibility, 'visibility', ['requester', 'internal'] as const, 'internal'), createdByUserId: user(request), updatedByUserId: user(request), publishedAt: status === 'published' ? new Date() : null }).returning();
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'created', entityType: 'knowledge_article', entityId: row.id, metadata: { status: row.status, visibility: row.visibility } });
    return reply.code(201).send(row);
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function updateKnowledge(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body); requireNoPhiAcknowledgement(body); const { id } = request.params as { id: string };
    const nextStatus = body.status === undefined ? undefined : pulseDeskEnum(body.status, 'status', ['draft', 'published', 'archived'] as const);
    const [row] = await db.update(pulsedeskKnowledgeArticles).set({
      ...(body.title !== undefined ? { title: pulseDeskText(body.title, 'title', 200, { required: true, singleLine: true, min: 2 })! } : {}),
      ...(body.summary !== undefined ? { summary: pulseDeskText(body.summary, 'summary', 500, { nullable: true }) } : {}),
      ...(body.body !== undefined ? { body: pulseDeskText(body.body, 'body', 20_000, { required: true })! } : {}),
      ...(body.visibility !== undefined ? { visibility: pulseDeskEnum(body.visibility, 'visibility', ['requester', 'internal'] as const) } : {}),
      ...(nextStatus ? { status: nextStatus, ...(nextStatus === 'published' ? { publishedAt: new Date() } : {}), ...(nextStatus === 'archived' ? { archivedAt: new Date() } : {}) } : {}),
      updatedByUserId: user(request), updatedAt: new Date(), version: sql`${pulsedeskKnowledgeArticles.version} + 1`,
    }).where(and(eq(pulsedeskKnowledgeArticles.tenantId, tenant(request)), eq(pulsedeskKnowledgeArticles.id, id), eq(pulsedeskKnowledgeArticles.version, versionValue(body.expectedVersion)), isNull(pulsedeskKnowledgeArticles.archivedAt))).returning();
    if (!row) throw new PulseDeskServiceDeskError('Knowledge article changed or was not found', 'PULSEDESK_VERSION_CONFLICT', 'expectedVersion', 409);
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'updated', entityType: 'knowledge_article', entityId: id, metadata: { status: row.status, visibility: row.visibility, version: row.version } });
    return row;
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

const SAVED_VIEW_FILTERS = new Set(['status', 'priority', 'category', 'queueId', 'teamId', 'assignedToUserId', 'directoryOrganizationId', 'directorySiteId', 'departmentId', 'search', 'includeArchived']);
const SAVED_VIEW_SORTS = new Set(['createdAt', 'updatedAt', 'priority', 'status', 'number']);

function savedViewInput(body: Record<string, unknown>) {
  const filters = body.filters ?? {};
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) throw new PulseDeskServiceDeskError('filters must be an object', 'PULSEDESK_FIELD_INVALID', 'filters');
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (!SAVED_VIEW_FILTERS.has(key) || !['string', 'number', 'boolean'].includes(typeof value)) throw new PulseDeskServiceDeskError('Saved-view filter is not supported', 'PULSEDESK_SAVED_VIEW_FILTER_INVALID', `filters.${key}`);
  }
  const sort = body.sort ?? { field: 'updatedAt', direction: 'desc' };
  if (!sort || typeof sort !== 'object' || Array.isArray(sort)) throw new PulseDeskServiceDeskError('sort must be an object', 'PULSEDESK_FIELD_INVALID', 'sort');
  const sortRecord = sort as Record<string, unknown>;
  if (!SAVED_VIEW_SORTS.has(String(sortRecord.field)) || !['asc', 'desc'].includes(String(sortRecord.direction))) throw new PulseDeskServiceDeskError('Saved-view sort is not supported', 'PULSEDESK_SAVED_VIEW_SORT_INVALID', 'sort');
  return {
    name: pulseDeskText(body.name, 'name', 100, { required: true, singleLine: true })!,
    filters: filters as Record<string, string | boolean | number | null>,
    sort: { field: String(sortRecord.field), direction: String(sortRecord.direction) as 'asc' | 'desc' },
    shared: pulseDeskBoolean(body.shared, 'shared', false),
  };
}

async function listSavedViews(request: FastifyRequest) {
  return { savedViews: await db.select().from(pulsedeskSavedViews).where(and(eq(pulsedeskSavedViews.tenantId, tenant(request)), or(eq(pulsedeskSavedViews.userId, user(request)), eq(pulsedeskSavedViews.shared, true)))).orderBy(asc(pulsedeskSavedViews.name)) };
}

async function createSavedView(request: FastifyRequest, reply: FastifyReply) {
  try {
    const input = savedViewInput(pulseDeskObject(request.body));
    if (input.shared && !capabilities(request).canManage) return reply.code(403).send({ error: 'Only PulseDesk managers can share saved views', code: 'PULSEDESK_MANAGER_REQUIRED' });
    const [row] = await db.insert(pulsedeskSavedViews).values({ tenantId: tenant(request), userId: user(request), ...input }).returning();
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'created', entityType: 'saved_view', entityId: row.id, metadata: { shared: row.shared } });
    return reply.code(201).send(row);
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function listTags(request: FastifyRequest) {
  return { tags: await db.select().from(pulsedeskTags).where(eq(pulsedeskTags.tenantId, tenant(request))).orderBy(asc(pulsedeskTags.name)) };
}

async function createTag(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    const color = pulseDeskText(body.color, 'color', 7, { nullable: true, singleLine: true });
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) throw new PulseDeskServiceDeskError('color is invalid', 'PULSEDESK_FIELD_INVALID', 'color');
    const [row] = await db.insert(pulsedeskTags).values({ tenantId: tenant(request), name: pulseDeskText(body.name, 'name', 80, { required: true, singleLine: true })!, color, createdByUserId: user(request) }).returning();
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'created', entityType: 'tag', entityId: row.id });
    return reply.code(201).send(row);
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function assignTicketTags(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body); const { id } = request.params as { id: string };
    if (!await ticketRow(tenant(request), id)) return notFound(reply, 'ticket');
    if (!Array.isArray(body.tagIds) || body.tagIds.length > 20) throw new PulseDeskServiceDeskError('tagIds is invalid', 'PULSEDESK_FIELD_INVALID', 'tagIds');
    const tagIds = [...new Set(body.tagIds.map((value, index) => pulseDeskId(value, `tagIds.${index}`, false)!))];
    const valid = tagIds.length ? await db.select({ id: pulsedeskTags.id }).from(pulsedeskTags).where(and(eq(pulsedeskTags.tenantId, tenant(request)), inArray(pulsedeskTags.id, tagIds))) : [];
    if (valid.length !== tagIds.length) throw new PulseDeskServiceDeskError('Tag not found', 'PULSEDESK_TAG_NOT_FOUND', 'tagIds', 404);
    await db.transaction(async (tx) => {
      await tx.delete(pulsedeskTicketTags).where(and(eq(pulsedeskTicketTags.tenantId, tenant(request)), eq(pulsedeskTicketTags.ticketId, id)));
      if (tagIds.length) await tx.insert(pulsedeskTicketTags).values(tagIds.map(tagId => ({ tenantId: tenant(request), ticketId: id, tagId, createdByUserId: user(request) })));
      await audit(tx, { tenantId: tenant(request), userId: user(request), action: 'tags_updated', entityType: 'ticket', entityId: id, metadata: { tagIds } });
    });
    return { ok: true, tagIds };
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function notificationPreferences(request: FastifyRequest) {
  const [row] = await db.select().from(pulsedeskNotificationPreferences).where(and(eq(pulsedeskNotificationPreferences.tenantId, tenant(request)), eq(pulsedeskNotificationPreferences.userId, user(request)))).limit(1);
  return row ?? { tenantId: tenant(request), userId: user(request), inAppEnabled: true, emailEnabled: false, eventPreferences: {}, version: 0 };
}

async function saveNotificationPreferences(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    const eventPreferences = body.eventPreferences ?? {};
    if (!eventPreferences || typeof eventPreferences !== 'object' || Array.isArray(eventPreferences) || Object.keys(eventPreferences as Record<string, unknown>).length > 20 || Object.values(eventPreferences as Record<string, unknown>).some(value => typeof value !== 'boolean')) throw new PulseDeskServiceDeskError('eventPreferences is invalid', 'PULSEDESK_FIELD_INVALID', 'eventPreferences');
    const expectedVersion = pulseDeskInteger(body.expectedVersion ?? 0, 'expectedVersion', 0, 2_147_483_647);
    const [existing] = await db.select().from(pulsedeskNotificationPreferences).where(and(eq(pulsedeskNotificationPreferences.tenantId, tenant(request)), eq(pulsedeskNotificationPreferences.userId, user(request)))).limit(1);
    if (existing && existing.version !== expectedVersion) throw new PulseDeskServiceDeskError('Notification preferences changed', 'PULSEDESK_VERSION_CONFLICT', 'expectedVersion', 409);
    const [row] = await db.insert(pulsedeskNotificationPreferences).values({ tenantId: tenant(request), userId: user(request), inAppEnabled: pulseDeskBoolean(body.inAppEnabled, 'inAppEnabled', true), emailEnabled: pulseDeskBoolean(body.emailEnabled, 'emailEnabled', false), eventPreferences: eventPreferences as Record<string, boolean> }).onConflictDoUpdate({ target: [pulsedeskNotificationPreferences.tenantId, pulsedeskNotificationPreferences.userId], set: { inAppEnabled: pulseDeskBoolean(body.inAppEnabled, 'inAppEnabled', true), emailEnabled: pulseDeskBoolean(body.emailEnabled, 'emailEnabled', false), eventPreferences: eventPreferences as Record<string, boolean>, updatedAt: new Date(), version: sql`${pulsedeskNotificationPreferences.version} + 1` } }).returning();
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'updated', entityType: 'notification_preferences', entityId: row.id, metadata: { inAppEnabled: row.inAppEnabled, emailEnabled: row.emailEnabled } });
    return row;
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function bulkTickets(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    const action = pulseDeskEnum(body.action, 'action', PULSEDESK_SAFE_BULK_ACTIONS);
    if (!Array.isArray(body.tickets) || body.tickets.length < 1 || body.tickets.length > 50) throw new PulseDeskServiceDeskError('tickets must contain 1 to 50 rows', 'PULSEDESK_BULK_INVALID', 'tickets');
    const tickets = body.tickets.map((entry, index) => {
      const row = pulseDeskObject(entry);
      return { id: pulseDeskId(row.id, `tickets.${index}.id`, false)!, expectedVersion: pulseDeskInteger(row.expectedVersion, `tickets.${index}.expectedVersion`, 1, 2_147_483_647) };
    });
    if (new Set(tickets.map(row => row.id)).size !== tickets.length) throw new PulseDeskServiceDeskError('Duplicate ticket IDs are not allowed', 'PULSEDESK_BULK_INVALID', 'tickets');
    const assignedToUserId = action === 'assign' ? pulseDeskId(body.assignedToUserId, 'assignedToUserId') : null;
    const queueId = action === 'assign' ? pulseDeskId(body.queueId, 'queueId') : null;
    const teamId = action === 'assign' ? pulseDeskId(body.teamId, 'teamId') : null;
    if (action === 'assign') await Promise.all([assertAssignee(tenant(request), assignedToUserId), assertOperationalReferences({ tenantId: tenant(request), queueId, teamId })]);
    const toStatus = action === 'status' ? pulseDeskEnum(body.toStatus, 'toStatus', PULSEDESK_TICKET_STATUSES) : null;
    const now = new Date();
    const results = await db.transaction(async (tx) => {
      const output = [];
      for (const item of tickets) {
        const [before] = await tx.select().from(pulsedeskRequests).where(and(eq(pulsedeskRequests.tenantId, tenant(request)), eq(pulsedeskRequests.id, item.id), isNull(pulsedeskRequests.archivedAt))).limit(1);
        if (!before) throw new PulseDeskServiceDeskError('Ticket not found', 'PULSEDESK_TICKET_NOT_FOUND', 'tickets', 404);
        if (toStatus) assertPulseDeskTicketTransition(before.status, toStatus);
        const [updated] = await tx.update(pulsedeskRequests).set({
          ...(action === 'assign' ? { assignedToUserId, queueId, teamId, status: before.status === 'new' ? 'assigned' as const : before.status } : {}),
          ...(toStatus ? { status: toStatus, ...(toStatus === 'resolved' ? { resolvedAt: now } : {}), ...(toStatus === 'closed' ? { closedAt: now } : {}) } : {}),
          ...(action === 'archive' ? { archivedAt: now } : {}),
          updatedByUserId: user(request), updatedAt: now, version: sql`${pulsedeskRequests.version} + 1`,
        }).where(and(eq(pulsedeskRequests.tenantId, tenant(request)), eq(pulsedeskRequests.id, item.id), eq(pulsedeskRequests.version, item.expectedVersion), isNull(pulsedeskRequests.archivedAt))).returning();
        if (!updated) throw new PulseDeskServiceDeskError('A ticket changed; no bulk changes were applied', 'PULSEDESK_VERSION_CONFLICT', 'tickets', 409);
        await tx.insert(pulsedeskRequestEvents).values({ tenantId: tenant(request), requestId: item.id, actorUserId: user(request), eventType: action === 'archive' ? 'archived' : action === 'assign' ? 'assignment_changed' : 'status_changed', visibility: 'requester', fromStatus: before.status, toStatus: updated.status, metadata: { bulk: true, action } });
        await audit(tx, { tenantId: tenant(request), userId: user(request), action: `bulk_${action}`, entityType: 'ticket', entityId: item.id, metadata: { fromStatus: before.status, toStatus: updated.status } });
        output.push(ticketView(updated));
      }
      return output;
    });
    return { tickets: results, count: results.length };
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function listClients(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = (request.query ?? {}) as Record<string, unknown>;
    const type = query.type ? pulseDeskEnum(query.type, 'type', ['customer', 'client', 'vendor', 'partner', 'facility', 'other'] as const) : undefined;
    return listOrganizations(directoryActor(request), { page: directoryPage(query), search: query.search ? pulseDeskText(query.search, 'search', 200, { required: true, singleLine: true })! : undefined, type });
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function listFacilities(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = (request.query ?? {}) as Record<string, unknown>;
    return listSites(directoryActor(request), {
      page: directoryPage(query),
      search: query.search ? pulseDeskText(query.search, 'search', 200, { required: true, singleLine: true })! : undefined,
      organizationId: query.organizationId ? pulseDeskId(query.organizationId, 'organizationId', false)! : undefined,
    });
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function createFacility(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    const row = await createSite(directoryActor(request), {
      organizationId: pulseDeskId(body.organizationId ?? body.clientId, 'organizationId', false)!,
      name: pulseDeskText(body.name, 'name', 200, { required: true, singleLine: true, min: 2 })!,
      type: pulseDeskEnum(body.type, 'type', ['headquarters', 'office', 'facility', 'service', 'remote', 'other'] as const, 'facility'),
      status: 'active',
      timezone: pulseDeskText(body.timezone, 'timezone', 80, { nullable: true, singleLine: true }),
      notes: null,
    });
    return reply.code(201).send(row);
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function createClient(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    if (body.phiRestricted === false) throw new PulseDeskServiceDeskError('PulseDesk service-client profiles must remain PHI restricted', 'PULSEDESK_PHI_RESTRICTION_REQUIRED', 'phiRestricted');
    const organization = await createOrganization(directoryActor(request), { name: pulseDeskText(body.name, 'name', 200, { required: true, singleLine: true, min: 2 })!, type: pulseDeskEnum(body.type, 'type', ['client', 'facility'] as const, 'client'), status: 'active', website: null, notes: null });
    const profile = await upsertModuleProfile(directoryActor(request), organization.id, { facilityCategory: pulseDeskText(body.facilityCategory, 'facilityCategory', 100, { nullable: true, singleLine: true }), phiRestricted: true, notes: null });
    return reply.code(201).send({ ...organization, profile });
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function listClientContacts(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = (request.query ?? {}) as Record<string, unknown>;
    return listContacts(directoryActor(request), { page: directoryPage(query), search: query.search ? pulseDeskText(query.search, 'search', 200, { required: true, singleLine: true })! : undefined });
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

async function createClientContact(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = pulseDeskObject(request.body);
    const organizationId = pulseDeskId(body.organizationId ?? body.clientId, 'organizationId');
    const siteId = pulseDeskId(body.siteId, 'siteId');
    if (siteId && !organizationId) throw new PulseDeskServiceDeskError('A facility contact requires its service client', 'PULSEDESK_ORGANIZATION_REQUIRED', 'organizationId');
    await assertDirectoryReferences({ tenantId: tenant(request), organizationId, siteId });
    const firstName = pulseDeskText(body.firstName ?? body.name, 'firstName', 100, { required: true, singleLine: true })!;
    const contact = await createContact(directoryActor(request), { firstName, lastName: pulseDeskText(body.lastName, 'lastName', 100, { nullable: true, singleLine: true }) ?? '', email: pulseDeskText(body.email, 'email', 320, { nullable: true, singleLine: true }), phone: pulseDeskText(body.phone, 'phone', 40, { nullable: true, singleLine: true }), title: pulseDeskText(body.title, 'title', 160, { nullable: true, singleLine: true }), status: 'active' });
    const organizationAssociation = organizationId ? await associateOrganizationContact(directoryActor(request), organizationId, { contactId: contact.id, role: pulseDeskText(body.role, 'role', 100, { nullable: true, singleLine: true }), isPrimary: pulseDeskBoolean(body.isPrimary, 'isPrimary', false) }) : null;
    const siteAssociation = siteId ? await associateSiteContact(directoryActor(request), siteId, { contactId: contact.id, role: pulseDeskText(body.role, 'role', 100, { nullable: true, singleLine: true }), isPrimary: pulseDeskBoolean(body.isPrimary, 'isPrimary', false) }) : null;
    return reply.code(201).send({ ...contact, organizationAssociation, siteAssociation });
  } catch (error) { if (handleError(reply, error)) return; throw error; }
}

export async function registerPulseDeskServiceDeskRoutes(app: FastifyInstance) {
  app.get('/v1/modules/pulsedesk/dashboard', { preHandler: readGuards }, dashboard);
  app.get('/v1/modules/pulsedesk/tickets', { preHandler: readGuards }, listTickets);
  app.post('/v1/modules/pulsedesk/tickets', { preHandler: writeGuards }, createTicket);
  app.patch('/v1/modules/pulsedesk/tickets/:id', { preHandler: internalGuards }, updateTicket);
  app.post('/v1/modules/pulsedesk/tickets/bulk', { preHandler: managerGuards }, bulkTickets);
  app.get('/v1/modules/pulsedesk/tickets/:id', { preHandler: readGuards }, ticketDetail);
  app.post('/v1/modules/pulsedesk/tickets/:id/replies', { preHandler: writeGuards }, (request, reply) => addMessage(request, reply, 'requester'));
  app.post('/v1/modules/pulsedesk/tickets/:id/internal-notes', { preHandler: internalGuards }, (request, reply) => addMessage(request, reply, 'internal'));
  app.post('/v1/modules/pulsedesk/tickets/:id/notes', { preHandler: writeGuards }, addMessage);
  app.post('/v1/modules/pulsedesk/tickets/:id/time-entries', { preHandler: internalGuards }, addTimeEntry);
  app.post('/v1/modules/pulsedesk/tickets/:id/assignments', { preHandler: managerGuards }, assignTicket);
  app.post('/v1/modules/pulsedesk/tickets/:id/transitions', { preHandler: internalGuards }, transitionTicket);
  app.post('/v1/modules/pulsedesk/tickets/:id/actions/:action', { preHandler: internalGuards }, transitionTicket);
  app.post('/v1/modules/pulsedesk/tickets/:id/sla/evaluate', { preHandler: internalGuards }, evaluateSla);
  app.post('/v1/modules/pulsedesk/tickets/:id/vendor-engagements', { preHandler: internalGuards }, addVendorEngagement);
  app.patch('/v1/modules/pulsedesk/tickets/:id/vendor-engagements/:engagementId', { preHandler: internalGuards }, updateVendorEngagement);
  app.get('/v1/modules/pulsedesk/tickets/:id/attachments', { preHandler: readGuards }, (request, reply) => ticketAttachments(request, reply, 'list'));
  app.post('/v1/modules/pulsedesk/tickets/:id/attachments', { preHandler: writeGuards }, (request, reply) => ticketAttachments(request, reply, 'create'));
  app.get('/v1/modules/pulsedesk/tickets/:id/attachments/:attachmentId/content', { preHandler: readGuards }, (request, reply) => ticketAttachments(request, reply, 'content'));
  app.delete('/v1/modules/pulsedesk/tickets/:id/attachments/:attachmentId', { preHandler: writeGuards }, (request, reply) => ticketAttachments(request, reply, 'delete'));
  app.post('/v1/modules/pulsedesk/tickets/:id/tags', { preHandler: internalGuards }, assignTicketTags);

  app.get('/v1/modules/pulsedesk/assets', { preHandler: readGuards }, listAssets);
  app.post('/v1/modules/pulsedesk/assets', { preHandler: internalGuards }, createAsset);
  app.patch('/v1/modules/pulsedesk/assets/:id', { preHandler: internalGuards }, updateAsset);
  app.get('/v1/modules/pulsedesk/configuration', { preHandler: readGuards }, listConfiguration);
  app.post('/v1/modules/pulsedesk/queues', { preHandler: managerGuards }, createQueue);
  app.patch('/v1/modules/pulsedesk/queues/:id', { preHandler: managerGuards }, updateQueue);
  app.post('/v1/modules/pulsedesk/teams', { preHandler: managerGuards }, createTeam);
  app.patch('/v1/modules/pulsedesk/teams/:id', { preHandler: managerGuards }, updateTeam);
  app.post('/v1/modules/pulsedesk/teams/:id/members', { preHandler: managerGuards }, addTeamMember);
  app.post('/v1/modules/pulsedesk/sla-policies', { preHandler: managerGuards }, createSlaPolicy);
  app.patch('/v1/modules/pulsedesk/sla-policies/:id', { preHandler: managerGuards }, updateSlaPolicy);
  app.post('/v1/modules/pulsedesk/ticket-options', { preHandler: managerGuards }, createTicketOption);
  app.patch('/v1/modules/pulsedesk/ticket-options/:id', { preHandler: managerGuards }, updateTicketOption);

  app.get('/v1/modules/pulsedesk/supply-requests', { preHandler: readGuards }, listSupplyRequests);
  app.post('/v1/modules/pulsedesk/supply-requests', { preHandler: writeGuards }, createSupplyRequest);
  app.patch('/v1/modules/pulsedesk/supply-requests/:id', { preHandler: internalGuards }, updateSupplyRequest);
  app.get('/v1/modules/pulsedesk/facility-requests', { preHandler: readGuards }, listFacilityRequests);
  app.post('/v1/modules/pulsedesk/facility-requests', { preHandler: writeGuards }, createFacilityRequest);
  app.patch('/v1/modules/pulsedesk/facility-requests/:id', { preHandler: internalGuards }, updateFacilityRequest);

  app.get('/v1/modules/pulsedesk/knowledge', { preHandler: readGuards }, listKnowledge);
  app.post('/v1/modules/pulsedesk/knowledge', { preHandler: managerGuards }, createKnowledge);
  app.patch('/v1/modules/pulsedesk/knowledge/:id', { preHandler: managerGuards }, updateKnowledge);
  app.get('/v1/modules/pulsedesk/tags', { preHandler: readGuards }, listTags);
  app.post('/v1/modules/pulsedesk/tags', { preHandler: internalGuards }, createTag);
  app.get('/v1/modules/pulsedesk/saved-views', { preHandler: readGuards }, listSavedViews);
  app.post('/v1/modules/pulsedesk/saved-views', { preHandler: readGuards }, createSavedView);
  app.get('/v1/modules/pulsedesk/notification-preferences', { preHandler: readGuards }, notificationPreferences);
  app.put('/v1/modules/pulsedesk/notification-preferences', { preHandler: readGuards }, saveNotificationPreferences);

  // Compatibility routes expose the shared Directory authority; they do not
  // create module-local client/contact records.
  app.get('/v1/modules/pulsedesk/clients', { preHandler: readGuards }, listClients);
  app.post('/v1/modules/pulsedesk/clients', { preHandler: writeGuards }, createClient);
  app.get('/v1/modules/pulsedesk/facilities', { preHandler: readGuards }, listFacilities);
  app.post('/v1/modules/pulsedesk/facilities', { preHandler: writeGuards }, createFacility);
  app.get('/v1/modules/pulsedesk/contacts', { preHandler: readGuards }, listClientContacts);
  app.post('/v1/modules/pulsedesk/contacts', { preHandler: writeGuards }, createClientContact);
}
