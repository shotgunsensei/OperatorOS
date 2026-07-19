import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  activityFeed,
  directoryOrganizations,
  directorySites,
  pulsedeskDepartments,
  pulsedeskRequestEvents,
  pulsedeskRequests,
  pulsedeskRequestSequences,
  tenantUsers,
  users,
  type PulseDeskRequestRow,
} from '../schema.js';
import {
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import { getTenantMembership, resolveTenantModuleAccess } from '../lib/tenant-entitlements.js';
import {
  assertPulseDeskStatusTransition,
  assertPulseDeskVersionMatch,
  calculatePulseDeskDueAt,
  parsePulseDeskDepartmentCreate,
  parsePulseDeskDepartmentListQuery,
  parsePulseDeskDepartmentPatch,
  parsePulseDeskRequestCreate,
  parsePulseDeskRequestListQuery,
  parsePulseDeskRequestPatch,
  parsePulseDeskRequestTransition,
  PulseDeskRequestValidationError,
  PulseDeskStatusTransitionError,
  PulseDeskVersionConflictError,
  type PulseDeskRequestEventType,
  type PulseDeskRequestPriority,
  type PulseDeskRequestStatus,
} from '../lib/pulsedesk-requests.js';

const pulsedeskGuards = [requireTenantMember, requireTenantModuleAccess('pulsedesk')];
const pulsedeskWriteGuards = [...pulsedeskGuards, requireTenantModuleWriteAccess];

type PulseDeskContext = {
  tenantId: string;
  role: 'owner' | 'admin' | 'member';
  viaPlatformRole: boolean;
};

type PulseDeskActor = { id: string };

function workflowCapabilities(request: FastifyRequest) {
  const ctx = (request as any).tenantContext as PulseDeskContext;
  const moduleAccessLevel = (request as any).tenantModuleAccessLevel as string | undefined;
  return {
    canManageWorkflow: ctx.viaPlatformRole
      || ctx.role === 'owner'
      || ctx.role === 'admin'
      || moduleAccessLevel === 'manager',
  };
}

async function requirePulseDeskWorkflowManager(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!workflowCapabilities(request).canManageWorkflow) {
    reply.code(403).send({
      error: 'PulseDesk workflow manager access is required',
      code: 'PULSEDESK_MANAGER_REQUIRED',
    });
  }
}

function handlePulseDeskDomainError(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof PulseDeskRequestValidationError) {
    reply.code(error.statusCode).send({
      error: error.message,
      code: error.code,
      field: error.field,
    });
    return true;
  }
  if (error instanceof PulseDeskStatusTransitionError) {
    reply.code(error.statusCode).send({
      error: error.message,
      code: error.code,
      fromStatus: error.fromStatus,
      toStatus: error.toStatus,
      allowedStatuses: error.allowedStatuses,
    });
    return true;
  }
  if (error instanceof PulseDeskVersionConflictError) {
    reply.code(error.statusCode).send({
      error: error.message,
      code: error.code,
      expectedVersion: error.expectedVersion,
      actualVersion: error.actualVersion,
    });
    return true;
  }
  return false;
}

function hasPostgresCode(error: unknown, code: string): boolean {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== 'object') return false;
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function requestNotFound(reply: FastifyReply) {
  return reply.code(404).send({
    error: 'PulseDesk request not found',
    code: 'PULSEDESK_REQUEST_NOT_FOUND',
  });
}

function departmentNotFound(reply: FastifyReply) {
  return reply.code(404).send({
    error: 'PulseDesk department not found',
    code: 'PULSEDESK_DEPARTMENT_NOT_FOUND',
  });
}

function assigneeNotFound(reply: FastifyReply) {
  return reply.code(404).send({
    error: 'Eligible PulseDesk assignee not found',
    code: 'PULSEDESK_ASSIGNEE_NOT_FOUND',
  });
}

function formatRequestNumber(number: number): string {
  return `PD-${String(number).padStart(6, '0')}`;
}

function departmentView(department: typeof pulsedeskDepartments.$inferSelect) {
  return {
    id: department.id,
    name: department.name,
    active: department.active,
    description: department.description,
    directoryOrganizationId: department.directoryOrganizationId,
    directorySiteId: department.directorySiteId,
    version: department.version,
    createdAt: department.createdAt,
    updatedAt: department.updatedAt,
  };
}

async function validateDepartmentDirectoryReferences(
  tenantId: string,
  organizationId: string | null | undefined,
  siteId: string | null | undefined,
): Promise<boolean> {
  if (siteId && !organizationId) return false;
  if (organizationId) {
    const [organization] = await db.select({ id: directoryOrganizations.id }).from(directoryOrganizations).where(and(
      eq(directoryOrganizations.tenantId, tenantId), eq(directoryOrganizations.id, organizationId), isNull(directoryOrganizations.archivedAt),
    )).limit(1);
    if (!organization) return false;
  }
  if (siteId) {
    const [site] = await db.select({ id: directorySites.id, organizationId: directorySites.organizationId }).from(directorySites).where(and(
      eq(directorySites.tenantId, tenantId), eq(directorySites.id, siteId), isNull(directorySites.archivedAt),
    )).limit(1);
    if (!site || site.organizationId !== organizationId) return false;
  }
  return true;
}

async function enrichRequests(rows: PulseDeskRequestRow[], tenantId: string) {
  const departmentIds = [...new Set(rows.flatMap((row) => row.departmentId ? [row.departmentId] : []))];
  const assigneeIds = [...new Set(rows.flatMap((row) => row.assignedToUserId ? [row.assignedToUserId] : []))];

  const [departmentRows, assigneeRows] = await Promise.all([
    departmentIds.length > 0
      ? db.select({ id: pulsedeskDepartments.id, name: pulsedeskDepartments.name })
        .from(pulsedeskDepartments)
        .where(and(
          eq(pulsedeskDepartments.tenantId, tenantId),
          inArray(pulsedeskDepartments.id, departmentIds),
        ))
      : Promise.resolve([]),
    assigneeIds.length > 0
      ? db.select({ id: users.id, name: users.name })
        .from(tenantUsers)
        .innerJoin(users, eq(users.id, tenantUsers.userId))
        .where(and(
          eq(tenantUsers.tenantId, tenantId),
          inArray(users.id, assigneeIds),
        ))
      : Promise.resolve([]),
  ]);

  const departmentNames = new Map(departmentRows.map((row) => [row.id, row.name]));
  const assigneeNames = new Map(assigneeRows.map((row) => [row.id, row.name]));

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    requestNumber: formatRequestNumber(row.number),
    createdByUserId: row.createdByUserId,
    assignedToUserId: row.assignedToUserId,
    assignedToName: row.assignedToUserId ? assigneeNames.get(row.assignedToUserId) ?? null : null,
    departmentId: row.departmentId,
    departmentName: row.departmentId ? departmentNames.get(row.departmentId) ?? null : null,
    summary: row.summary,
    locationLabel: row.locationLabel,
    category: row.category,
    priority: row.priority,
    status: row.status,
    isPatientImpacting: row.isPatientImpacting,
    dueAt: row.dueAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

async function findActiveDepartment(tenantId: string, departmentId: string) {
  const [department] = await db.select({ id: pulsedeskDepartments.id })
    .from(pulsedeskDepartments)
    .where(and(
      eq(pulsedeskDepartments.id, departmentId),
      eq(pulsedeskDepartments.tenantId, tenantId),
      eq(pulsedeskDepartments.active, true),
    ))
    .limit(1);
  return department ?? null;
}

async function isEligibleAssignee(tenantId: string, userId: string): Promise<boolean> {
  const membership = await getTenantMembership(userId, tenantId);
  if (!membership) return false;
  const access = await resolveTenantModuleAccess(userId, tenantId, 'pulsedesk');
  return access.hasAccess;
}

function eventRecord(
  tenantId: string,
  requestId: string,
  actorUserId: string,
  eventType: PulseDeskRequestEventType,
  metadata: Record<string, unknown>,
  fromStatus: PulseDeskRequestStatus | null = null,
  toStatus: PulseDeskRequestStatus | null = null,
) {
  return {
    tenantId,
    requestId,
    actorUserId,
    eventType,
    metadata,
    fromStatus,
    toStatus,
  };
}

export async function registerPulseDeskRoutes(app: FastifyInstance) {
  app.get(
    '/v1/modules/pulsedesk/departments',
    { preHandler: [...pulsedeskGuards] },
    async (request, reply) => {
      let query;
      try {
        query = parsePulseDeskDepartmentListQuery(request.query);
      } catch (error) {
        if (handlePulseDeskDomainError(reply, error)) return;
        throw error;
      }

      const ctx = (request as any).tenantContext as PulseDeskContext;
      const capabilities = workflowCapabilities(request);
      const conditions = [eq(pulsedeskDepartments.tenantId, ctx.tenantId)];
      if (!query.includeInactive || !capabilities.canManageWorkflow) {
        conditions.push(eq(pulsedeskDepartments.active, true));
      }
      const departments = await db.select()
        .from(pulsedeskDepartments)
        .where(and(...conditions))
        .orderBy(asc(pulsedeskDepartments.name));
      return { departments: departments.map(departmentView), capabilities };
    },
  );

  app.post(
    '/v1/modules/pulsedesk/departments',
    { preHandler: [...pulsedeskWriteGuards, requirePulseDeskWorkflowManager] },
    async (request, reply) => {
      let input;
      try {
        input = parsePulseDeskDepartmentCreate(request.body);
      } catch (error) {
        if (handlePulseDeskDomainError(reply, error)) return;
        throw error;
      }
      const ctx = (request as any).tenantContext as PulseDeskContext;
      const actor = (request as any).user as PulseDeskActor;
      if (!await validateDepartmentDirectoryReferences(ctx.tenantId, input.directoryOrganizationId, input.directorySiteId)) {
        return reply.code(404).send({ error: 'Service client or facility not found', code: 'PULSEDESK_DIRECTORY_REFERENCE_NOT_FOUND' });
      }
      try {
        const department = await db.transaction(async (tx) => {
          const [created] = await tx.insert(pulsedeskDepartments).values({
            tenantId: ctx.tenantId,
            createdByUserId: actor.id,
            name: input.name,
            description: input.description,
            directoryOrganizationId: input.directoryOrganizationId,
            directorySiteId: input.directorySiteId,
            updatedByUserId: actor.id,
            active: true,
          }).returning();
          await tx.insert(activityFeed).values({
            userId: actor.id,
            tenantId: ctx.tenantId,
            action: 'created',
            entityType: 'pulsedesk_department',
            entityId: created.id,
            metadata: { active: true },
          });
          return created;
        });
        return reply.code(201).send(departmentView(department));
      } catch (error) {
        if (hasPostgresCode(error, '23505')) {
          return reply.code(409).send({
            error: 'A department with this name already exists',
            code: 'PULSEDESK_DEPARTMENT_NAME_CONFLICT',
          });
        }
        throw error;
      }
    },
  );

  app.patch(
    '/v1/modules/pulsedesk/departments/:id',
    { preHandler: [...pulsedeskWriteGuards, requirePulseDeskWorkflowManager] },
    async (request, reply) => {
      let patch;
      try {
        patch = parsePulseDeskDepartmentPatch(request.body);
      } catch (error) {
        if (handlePulseDeskDomainError(reply, error)) return;
        throw error;
      }

      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext as PulseDeskContext;
      const actor = (request as any).user as PulseDeskActor;
      const [before] = await db.select().from(pulsedeskDepartments).where(and(
        eq(pulsedeskDepartments.id, id),
        eq(pulsedeskDepartments.tenantId, ctx.tenantId),
      )).limit(1);
      if (!before) return departmentNotFound(reply);

      const { expectedVersion, ...changes } = patch;
      const effectiveOrganizationId = changes.directoryOrganizationId === undefined ? before.directoryOrganizationId : changes.directoryOrganizationId;
      const effectiveSiteId = changes.directorySiteId === undefined ? before.directorySiteId : changes.directorySiteId;
      if (!await validateDepartmentDirectoryReferences(ctx.tenantId, effectiveOrganizationId, effectiveSiteId)) {
        return reply.code(404).send({ error: 'Service client or facility not found', code: 'PULSEDESK_DIRECTORY_REFERENCE_NOT_FOUND' });
      }
      const changedFields = Object.keys(changes).filter((field) => {
        const key = field as keyof typeof changes;
        return changes[key] !== (before as unknown as Record<string, unknown>)[field];
      });
      if (changedFields.length === 0) return departmentView(before);

      try {
        const department = await db.transaction(async (tx) => {
          const [updated] = await tx.update(pulsedeskDepartments)
            .set({ ...changes, updatedByUserId: actor.id, updatedAt: new Date(), version: sql`${pulsedeskDepartments.version} + 1` })
            .where(and(
              eq(pulsedeskDepartments.id, id),
              eq(pulsedeskDepartments.tenantId, ctx.tenantId),
              eq(pulsedeskDepartments.version, expectedVersion),
            ))
            .returning();
          if (!updated) return null;
          await tx.insert(activityFeed).values({
            userId: actor.id,
            tenantId: ctx.tenantId,
            action: 'updated',
            entityType: 'pulsedesk_department',
            entityId: updated.id,
            // Field names and active-state changes are operational metadata;
            // the department's free-text name is deliberately excluded.
            metadata: {
              changedFields,
              ...(changedFields.includes('active')
                ? { fromActive: before.active, toActive: updated.active }
                : {}),
            },
          });
          return updated;
        });
        if (!department) return reply.code(409).send({ error: 'Department changed; refresh before updating', code: 'PULSEDESK_VERSION_CONFLICT' });
        return departmentView(department);
      } catch (error) {
        if (hasPostgresCode(error, '23505')) {
          return reply.code(409).send({
            error: 'A department with this name already exists',
            code: 'PULSEDESK_DEPARTMENT_NAME_CONFLICT',
          });
        }
        throw error;
      }
    },
  );

  app.get(
    '/v1/modules/pulsedesk/assignees',
    { preHandler: [...pulsedeskGuards, requirePulseDeskWorkflowManager] },
    async (request) => {
      const ctx = (request as any).tenantContext as PulseDeskContext;
      const members = await db.select({ id: users.id, name: users.name })
        .from(tenantUsers)
        .innerJoin(users, eq(users.id, tenantUsers.userId))
        .where(and(
          eq(tenantUsers.tenantId, ctx.tenantId),
          eq(users.status, 'active'),
        ))
        .orderBy(asc(users.name));
      const decisions = await Promise.all(members.map(async (member) => ({
        member,
        access: await resolveTenantModuleAccess(member.id, ctx.tenantId, 'pulsedesk'),
      })));
      return {
        assignees: decisions.filter(({ access }) => access.hasAccess).map(({ member }) => member),
        capabilities: workflowCapabilities(request),
      };
    },
  );

  app.get(
    '/v1/modules/pulsedesk/requests',
    { preHandler: [...pulsedeskGuards] },
    async (request, reply) => {
      let query;
      try {
        query = parsePulseDeskRequestListQuery(request.query);
      } catch (error) {
        if (handlePulseDeskDomainError(reply, error)) return;
        throw error;
      }

      const ctx = (request as any).tenantContext as PulseDeskContext;
      const conditions = [eq(pulsedeskRequests.tenantId, ctx.tenantId)];
      if (query.status) conditions.push(eq(pulsedeskRequests.status, query.status));
      if (query.priority) conditions.push(eq(pulsedeskRequests.priority, query.priority));
      if (query.category) conditions.push(eq(pulsedeskRequests.category, query.category));
      if (query.departmentId) conditions.push(eq(pulsedeskRequests.departmentId, query.departmentId));
      if (query.assignedToUserId) conditions.push(eq(pulsedeskRequests.assignedToUserId, query.assignedToUserId));
      if (query.isPatientImpacting !== undefined) {
        conditions.push(eq(pulsedeskRequests.isPatientImpacting, query.isPatientImpacting));
      }
      if (query.search) {
        const escaped = query.search.replace(/[\\%_]/g, '\\$&');
        const pattern = `%${escaped}%`;
        conditions.push(or(
          ilike(pulsedeskRequests.summary, pattern),
          ilike(pulsedeskRequests.locationLabel, pattern),
        )!);
      }

      const rows = await db.select().from(pulsedeskRequests)
        .where(and(...conditions))
        .orderBy(desc(pulsedeskRequests.createdAt))
        .limit(query.limit);
      return {
        requests: await enrichRequests(rows, ctx.tenantId),
        capabilities: workflowCapabilities(request),
      };
    },
  );

  app.get(
    '/v1/modules/pulsedesk/requests/:id',
    { preHandler: [...pulsedeskGuards] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext as PulseDeskContext;
      const [row] = await db.select().from(pulsedeskRequests).where(and(
        eq(pulsedeskRequests.id, id),
        eq(pulsedeskRequests.tenantId, ctx.tenantId),
      )).limit(1);
      if (!row) return requestNotFound(reply);

      const events = await db.select().from(pulsedeskRequestEvents).where(and(
        eq(pulsedeskRequestEvents.requestId, id),
        eq(pulsedeskRequestEvents.tenantId, ctx.tenantId),
      )).orderBy(asc(pulsedeskRequestEvents.createdAt));
      const [requestView] = await enrichRequests([row], ctx.tenantId);
      return {
        request: requestView,
        events: events.map((event) => ({
          id: event.id,
          type: event.eventType,
          actorUserId: event.actorUserId,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          metadata: event.metadata,
          createdAt: event.createdAt,
        })),
        capabilities: workflowCapabilities(request),
      };
    },
  );

  app.post(
    '/v1/modules/pulsedesk/requests',
    { preHandler: [...pulsedeskWriteGuards] },
    async (request, reply) => {
      let input;
      try {
        input = parsePulseDeskRequestCreate(request.body);
      } catch (error) {
        if (handlePulseDeskDomainError(reply, error)) return;
        throw error;
      }

      const ctx = (request as any).tenantContext as PulseDeskContext;
      const actor = (request as any).user as PulseDeskActor;
      if (input.departmentId && !await findActiveDepartment(ctx.tenantId, input.departmentId)) {
        return departmentNotFound(reply);
      }

      const now = new Date();
      const dueAt = calculatePulseDeskDueAt(input.priority, input.isPatientImpacting, now);
      const created = await db.transaction(async (tx) => {
        const [allocation] = await tx.insert(pulsedeskRequestSequences).values({
          tenantId: ctx.tenantId,
          lastNumber: 1,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: pulsedeskRequestSequences.tenantId,
          set: {
            lastNumber: sql`${pulsedeskRequestSequences.lastNumber} + 1`,
            updatedAt: now,
          },
        }).returning({ number: pulsedeskRequestSequences.lastNumber });

        const [row] = await tx.insert(pulsedeskRequests).values({
          ...input,
          tenantId: ctx.tenantId,
          createdByUserId: actor.id,
          number: allocation.number,
          status: 'new',
          version: 1,
          dueAt,
          createdAt: now,
          updatedAt: now,
        }).returning();
        await tx.insert(pulsedeskRequestEvents).values(eventRecord(
          ctx.tenantId,
          row.id,
          actor.id,
          'created',
          {
            requestNumber: formatRequestNumber(row.number),
            priority: row.priority,
            category: row.category,
            isPatientImpacting: row.isPatientImpacting,
            departmentAssigned: row.departmentId !== null,
          },
        ));
        await tx.insert(activityFeed).values({
          userId: actor.id,
          tenantId: ctx.tenantId,
          action: 'created',
          entityType: 'pulsedesk_request',
          entityId: row.id,
          // Never include summary or location values in the shared feed.
          metadata: {
            number: row.number,
            status: row.status,
            priority: row.priority,
            category: row.category,
            isPatientImpacting: row.isPatientImpacting,
            departmentAssigned: row.departmentId !== null,
          },
        });
        return row;
      });
      const [response] = await enrichRequests([created], ctx.tenantId);
      return reply.code(201).send(response);
    },
  );

  app.patch(
    '/v1/modules/pulsedesk/requests/:id',
    { preHandler: [...pulsedeskWriteGuards, requirePulseDeskWorkflowManager] },
    async (request, reply) => {
      let input;
      try {
        input = parsePulseDeskRequestPatch(request.body);
      } catch (error) {
        if (handlePulseDeskDomainError(reply, error)) return;
        throw error;
      }

      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext as PulseDeskContext;
      const actor = (request as any).user as PulseDeskActor;
      const [before] = await db.select().from(pulsedeskRequests).where(and(
        eq(pulsedeskRequests.id, id),
        eq(pulsedeskRequests.tenantId, ctx.tenantId),
      )).limit(1);
      if (!before) return requestNotFound(reply);
      try {
        assertPulseDeskVersionMatch(input.expectedVersion, before.version);
      } catch (error) {
        if (handlePulseDeskDomainError(reply, error)) return;
        throw error;
      }

      if (input.changes.departmentId
        && !await findActiveDepartment(ctx.tenantId, input.changes.departmentId)) {
        return departmentNotFound(reply);
      }
      if (input.changes.assignedToUserId
        && !await isEligibleAssignee(ctx.tenantId, input.changes.assignedToUserId)) {
        return assigneeNotFound(reply);
      }

      const changedFields = Object.keys(input.changes).filter((field) => {
        const key = field as keyof typeof input.changes;
        return input.changes[key] !== before[key];
      });
      if (changedFields.length === 0) {
        const [response] = await enrichRequests([before], ctx.tenantId);
        return response;
      }

      const now = new Date();
      const slaChanged = changedFields.includes('priority') || changedFields.includes('isPatientImpacting');
      const effectivePriority = (input.changes.priority ?? before.priority) as PulseDeskRequestPriority;
      const effectivePatientImpact = input.changes.isPatientImpacting ?? before.isPatientImpacting;
      const dueAt = slaChanged
        ? calculatePulseDeskDueAt(effectivePriority, effectivePatientImpact, before.createdAt)
        : before.dueAt;

      const updated = await db.transaction(async (tx) => {
        const [row] = await tx.update(pulsedeskRequests).set({
          ...input.changes,
          dueAt,
          version: sql`${pulsedeskRequests.version} + 1`,
          updatedAt: now,
        }).where(and(
          eq(pulsedeskRequests.id, id),
          eq(pulsedeskRequests.tenantId, ctx.tenantId),
          eq(pulsedeskRequests.version, input.expectedVersion),
        )).returning();
        if (!row) return null;

        const events = [];
        if (changedFields.includes('departmentId')) {
          events.push(eventRecord(ctx.tenantId, id, actor.id, 'department_changed', {
            fromDepartmentId: before.departmentId,
            toDepartmentId: row.departmentId,
          }));
        }
        if (changedFields.includes('assignedToUserId')) {
          events.push(eventRecord(ctx.tenantId, id, actor.id, 'assignee_changed', {
            fromAssigneeUserId: before.assignedToUserId,
            toAssigneeUserId: row.assignedToUserId,
          }));
        }
        if (changedFields.includes('priority')) {
          events.push(eventRecord(ctx.tenantId, id, actor.id, 'priority_changed', {
            fromPriority: before.priority,
            toPriority: row.priority,
            slaRecalculated: true,
          }));
        }
        const generalFields = changedFields.filter((field) => ![
          'departmentId',
          'assignedToUserId',
          'priority',
        ].includes(field));
        if (generalFields.length > 0) {
          events.push(eventRecord(ctx.tenantId, id, actor.id, 'updated', {
            changedFields: generalFields,
            slaRecalculated: slaChanged,
          }));
        }
        if (events.length > 0) await tx.insert(pulsedeskRequestEvents).values(events);
        await tx.insert(activityFeed).values({
          userId: actor.id,
          tenantId: ctx.tenantId,
          action: 'updated',
          entityType: 'pulsedesk_request',
          entityId: row.id,
          // Field names are safe; summary/location values are never copied.
          metadata: { number: row.number, changedFields, version: row.version },
        });
        return row;
      });
      if (!updated) {
        return reply.code(409).send({
          error: 'PulseDesk request changed; refresh before trying again',
          code: 'REQUEST_VERSION_CONFLICT',
        });
      }
      const [response] = await enrichRequests([updated], ctx.tenantId);
      return response;
    },
  );

  app.post(
    '/v1/modules/pulsedesk/requests/:id/transitions',
    { preHandler: [...pulsedeskWriteGuards, requirePulseDeskWorkflowManager] },
    async (request, reply) => {
      let input;
      try {
        input = parsePulseDeskRequestTransition(request.body);
      } catch (error) {
        if (handlePulseDeskDomainError(reply, error)) return;
        throw error;
      }

      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext as PulseDeskContext;
      const actor = (request as any).user as PulseDeskActor;
      const [before] = await db.select().from(pulsedeskRequests).where(and(
        eq(pulsedeskRequests.id, id),
        eq(pulsedeskRequests.tenantId, ctx.tenantId),
      )).limit(1);
      if (!before) return requestNotFound(reply);
      try {
        assertPulseDeskVersionMatch(input.expectedVersion, before.version);
        assertPulseDeskStatusTransition(
          before.status as PulseDeskRequestStatus,
          input.toStatus,
        );
      } catch (error) {
        if (handlePulseDeskDomainError(reply, error)) return;
        throw error;
      }

      const now = new Date();
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx.update(pulsedeskRequests).set({
          status: input.toStatus,
          version: sql`${pulsedeskRequests.version} + 1`,
          updatedAt: now,
        }).where(and(
          eq(pulsedeskRequests.id, id),
          eq(pulsedeskRequests.tenantId, ctx.tenantId),
          eq(pulsedeskRequests.version, input.expectedVersion),
        )).returning();
        if (!row) return null;

        const eventType: PulseDeskRequestEventType = input.toStatus === 'escalated'
          ? 'escalated'
          : 'status_changed';
        await tx.insert(pulsedeskRequestEvents).values(eventRecord(
          ctx.tenantId,
          id,
          actor.id,
          eventType,
          input.reasonCode ? { reasonCode: input.reasonCode } : {},
          before.status as PulseDeskRequestStatus,
          input.toStatus,
        ));
        await tx.insert(activityFeed).values({
          userId: actor.id,
          tenantId: ctx.tenantId,
          action: eventType,
          entityType: 'pulsedesk_request',
          entityId: row.id,
          metadata: {
            number: row.number,
            fromStatus: before.status,
            toStatus: row.status,
            ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
            version: row.version,
          },
        });
        return row;
      });
      if (!updated) {
        return reply.code(409).send({
          error: 'PulseDesk request changed; refresh before trying again',
          code: 'REQUEST_VERSION_CONFLICT',
        });
      }
      const [response] = await enrichRequests([updated], ctx.tenantId);
      return response;
    },
  );
}
