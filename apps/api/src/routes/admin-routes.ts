/**
 * Phase 8 — OperatorOS Admin Console API.
 *
 * Frontend contract: /api/admin/*
 * Backend contract:  /v1/admin/*
 *
 * Next rewrites /api/:path* to /v1/:path*, but the direct /api/admin/*
 * aliases are registered here too so local API-only smoke checks hit the
 * same guarded handlers. Every route uses requireSuperAdmin; tenant-admin
 * self-service continues to live on tenant-scoped routes.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '../db.js';
import {
  adminAuditLogs,
  modules,
  tenantEntitlements,
  tenantModules,
  tenants,
  tenantUsers,
  users,
} from '../schema.js';
import { requireSuperAdmin } from '../lib/tenant-auth.js';
import {
  TenantEntitlementError,
  getTenantEntitlements,
  grantModuleEntitlement,
  revokeModuleEntitlement,
  type TenantModuleGrantSource,
} from '../lib/tenant-entitlements.js';
import {
  registerAuditEnforcement,
  registerPlatformFailureLogging,
} from '../lib/audit.js';

const ADMIN_PREFIXES = ['/v1/admin', '/api/admin'] as const;
const LAUNCHABLE_TENANT_MODULE_STATUSES = new Set(['enabled', 'trial', 'purchased', 'beta']);
const ADMIN_GRANT_SOURCES = new Set<TenantModuleGrantSource>([
  'admin',
  'manual',
  'trial',
  'included',
  'included_with_core',
  'selected_free_companion',
]);
const TENANT_STATUSES = ['active', 'suspended', 'archived'] as const;
const TENANT_TYPES = ['personal', 'company'] as const;

type TenantStatusFilter = typeof TENANT_STATUSES[number];
type TenantTypeFilter = typeof TENANT_TYPES[number];

const SAFE_USER_SELECT = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  platformRole: users.platformRole,
  status: users.status,
  currentTenantId: users.currentTenantId,
  createdAt: users.createdAt,
  lastLoginAt: users.lastLoginAt,
};

function badRequest(reply: FastifyReply, message: string, extra: Record<string, unknown> = {}) {
  return reply.code(400).send({ error: message, code: 'BAD_REQUEST', ...extra });
}

function parseLimit(raw: unknown, fallback = 100, max = 500): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseOffset(raw: unknown): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function firstString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseGrantSource(raw: unknown): TenantModuleGrantSource {
  const source = firstString(raw) as TenantModuleGrantSource | null;
  if (!source) return 'admin';
  return ADMIN_GRANT_SOURCES.has(source) ? source : 'admin';
}

function isTenantStatusFilter(value: string): value is TenantStatusFilter {
  return (TENANT_STATUSES as readonly string[]).includes(value);
}

function isTenantTypeFilter(value: string): value is TenantTypeFilter {
  return (TENANT_TYPES as readonly string[]).includes(value);
}

function entitlementError(reply: FastifyReply, err: TenantEntitlementError) {
  return reply.code(err.statusCode).send({
    error: err.message,
    code: err.code,
    ...err.payload,
  });
}

function moduleIdFromBody(body: Record<string, unknown>): string | null {
  return firstString(body.moduleId) ?? firstString(body.moduleSlug) ?? firstString(body.slug);
}

async function tenantModuleStatus(tenantId: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return null;

  const [{ entitlements, modules: tenantModuleRows }, moduleRows] = await Promise.all([
    getTenantEntitlements(tenantId),
    db.select().from(modules).orderBy(modules.ord),
  ]);

  const tenantModuleByModuleId = new Map(tenantModuleRows.map(row => [row.moduleId, row]));
  const entitlementByKey = new Map(
    entitlements
      .filter(row => row.active)
      .map(row => [row.entitlementKey, row]),
  );

  return {
    tenant,
    entitlements,
    modules: moduleRows.map(module => {
      const tenantModule = tenantModuleByModuleId.get(module.id) ?? null;
      const entitlement = entitlementByKey.get(module.slug) ?? null;
      const enabled = !!tenantModule && LAUNCHABLE_TENANT_MODULE_STATUSES.has(tenantModule.status);
      return {
        moduleId: module.id,
        moduleSlug: module.slug,
        moduleName: module.name,
        entitlementKey: module.slug,
        category: module.category,
        status: module.status,
        archivedAt: module.archivedAt,
        enabled,
        entitled: enabled || !!entitlement,
        tenantModule,
        entitlement,
        allowAllMembers: tenantModule?.allowAllMembers ?? false,
        source: tenantModule?.source ?? entitlement?.source ?? null,
      };
    }),
  };
}

function registerAdminSurface(app: FastifyInstance, prefix: string) {
  app.get(`${prefix}/tenants`, { preHandler: [requireSuperAdmin] }, async (request) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const filters: any[] = [];
    const status = firstString(q.status);
    const type = firstString(q.type);
    const search = firstString(q.q);

    if (status && isTenantStatusFilter(status)) filters.push(eq(tenants.status, status));
    if (type && isTenantTypeFilter(type)) filters.push(eq(tenants.type, type));
    if (search) {
      const needle = `%${search}%`;
      filters.push(or(ilike(tenants.name, needle), ilike(tenants.slug, needle))!);
    }

    const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);
    const tenantRows = where
      ? await db.select().from(tenants).where(where).orderBy(desc(tenants.createdAt))
      : await db.select().from(tenants).orderBy(desc(tenants.createdAt));

    const tenantIds = tenantRows.map(row => row.id);
    const ownerIds = [...new Set(tenantRows.map(row => row.ownerUserId).filter(Boolean))];
    const [memberRows, tenantModuleRows, entitlementRows, ownerRows] = await Promise.all([
      tenantIds.length ? db.select().from(tenantUsers).where(inArray(tenantUsers.tenantId, tenantIds)) : [],
      tenantIds.length ? db.select().from(tenantModules).where(inArray(tenantModules.tenantId, tenantIds)) : [],
      tenantIds.length ? db.select().from(tenantEntitlements).where(and(
        inArray(tenantEntitlements.tenantId, tenantIds),
        eq(tenantEntitlements.active, true),
      )) : [],
      ownerIds.length ? db.select(SAFE_USER_SELECT).from(users).where(inArray(users.id, ownerIds)) : [],
    ]);

    const ownerById = new Map(ownerRows.map(row => [row.id, row]));
    const memberCounts = new Map<string, number>();
    const enabledModuleCounts = new Map<string, number>();
    const entitlementCounts = new Map<string, number>();

    for (const row of memberRows) memberCounts.set(row.tenantId, (memberCounts.get(row.tenantId) ?? 0) + 1);
    for (const row of tenantModuleRows) {
      if (LAUNCHABLE_TENANT_MODULE_STATUSES.has(row.status)) {
        enabledModuleCounts.set(row.tenantId, (enabledModuleCounts.get(row.tenantId) ?? 0) + 1);
      }
    }
    for (const row of entitlementRows) entitlementCounts.set(row.tenantId, (entitlementCounts.get(row.tenantId) ?? 0) + 1);

    return {
      tenants: tenantRows.map(tenant => ({
        ...tenant,
        owner: ownerById.get(tenant.ownerUserId) ?? null,
        memberCount: memberCounts.get(tenant.id) ?? 0,
        enabledModuleCount: enabledModuleCounts.get(tenant.id) ?? 0,
        entitlementCount: entitlementCounts.get(tenant.id) ?? 0,
      })),
      total: tenantRows.length,
    };
  });

  app.get<{ Params: { tenantId: string } }>(
    `${prefix}/tenants/:tenantId`,
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const { tenantId } = request.params;
      const status = await tenantModuleStatus(tenantId);
      if (!status) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });

      const memberRows = await db.select().from(tenantUsers).where(eq(tenantUsers.tenantId, tenantId));
      const userIds = [...new Set(memberRows.map(row => row.userId))];
      const memberUsers = userIds.length
        ? await db.select(SAFE_USER_SELECT).from(users).where(inArray(users.id, userIds))
        : [];
      const userById = new Map(memberUsers.map(row => [row.id, row]));

      const ownerRows = status.tenant.ownerUserId
        ? await db.select(SAFE_USER_SELECT).from(users).where(eq(users.id, status.tenant.ownerUserId)).limit(1)
        : [];

      return {
        tenant: status.tenant,
        owner: ownerRows[0] ?? null,
        members: memberRows.map(member => ({
          ...member,
          user: userById.get(member.userId) ?? null,
        })),
        modules: status.modules,
        entitlements: status.entitlements,
      };
    },
  );

  app.get<{ Params: { tenantId: string } }>(
    `${prefix}/tenants/:tenantId/entitlements`,
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const status = await tenantModuleStatus(request.params.tenantId);
      if (!status) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      return status;
    },
  );

  app.post<{ Params: { tenantId: string }; Body: Record<string, unknown> }>(
    `${prefix}/tenants/:tenantId/entitlements`,
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const body = (request.body ?? {}) as Record<string, unknown>;
      const moduleId = moduleIdFromBody(body);
      if (!moduleId) return badRequest(reply, 'moduleId or moduleSlug is required');

      try {
        const result = await grantModuleEntitlement(
          request.params.tenantId,
          moduleId,
          parseGrantSource(body.source),
          {
            actorUserId: admin.id,
            allowAllMembers: body.allowAllMembers !== false,
            metadata: {
              grantedBy: 'operatoros_admin_console',
              reason: firstString(body.reason) ?? undefined,
            },
            request,
          },
        );
        return reply.code(201).send({
          ok: true,
          module: result.module,
          tenantModule: result.tenantModule,
          entitlement: result.entitlement,
        });
      } catch (err) {
        if (err instanceof TenantEntitlementError) return entitlementError(reply, err);
        throw err;
      }
    },
  );

  app.delete<{ Params: { tenantId: string; moduleId: string } }>(
    `${prefix}/tenants/:tenantId/entitlements/:moduleId`,
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      try {
        const result = await revokeModuleEntitlement(
          request.params.tenantId,
          request.params.moduleId,
          'admin',
          { actorUserId: admin.id, request },
        );
        return {
          ok: true,
          module: result.module,
          tenantModule: result.tenantModule,
          deactivatedEntitlements: result.deactivatedEntitlements,
        };
      } catch (err) {
        if (err instanceof TenantEntitlementError) return entitlementError(reply, err);
        throw err;
      }
    },
  );

  app.get(`${prefix}/users`, { preHandler: [requireSuperAdmin] }, async (request) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const limit = parseLimit(q.limit, 50, 100);
    const offset = parseOffset(q.offset);
    const search = firstString(q.q)?.toLowerCase();
    const status = firstString(q.status);
    const platformRole = firstString(q.platformRole);

    let userRows = await db.select(SAFE_USER_SELECT).from(users).orderBy(desc(users.createdAt));
    if (search) {
      userRows = userRows.filter(user =>
        (user.email ?? '').toLowerCase().includes(search) ||
        (user.name ?? '').toLowerCase().includes(search)
      );
    }
    if (status) userRows = userRows.filter(user => user.status === status);
    if (platformRole) userRows = userRows.filter(user => user.platformRole === platformRole);

    return {
      users: userRows.slice(offset, offset + limit),
      total: userRows.length,
      limit,
      offset,
    };
  });

  app.get(`${prefix}/modules`, { preHandler: [requireSuperAdmin] }, async () => {
    const moduleRows = await db.select().from(modules).orderBy(modules.ord);
    return {
      modules: moduleRows.map(module => ({
        id: module.id,
        slug: module.slug,
        name: module.name,
        description: module.description,
        category: module.category,
        status: module.archivedAt ? 'archived' : module.status,
        planMin: module.planMin,
        requiresOrg: module.requiresOrg,
        baseUrl: module.baseUrl,
        archivedAt: module.archivedAt,
        ord: module.ord,
      })),
      total: moduleRows.length,
    };
  });

  app.get(`${prefix}/audit-logs`, { preHandler: [requireSuperAdmin] }, async (request) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const limit = parseLimit(q.limit, 100, 500);
    const offset = parseOffset(q.offset);
    const filters: any[] = [];
    const tenantId = firstString(q.tenantId);
    const actorUserId = firstString(q.actorUserId);
    const action = firstString(q.action);

    if (tenantId) filters.push(eq(adminAuditLogs.tenantId, tenantId));
    if (actorUserId) filters.push(eq(adminAuditLogs.adminId, actorUserId));
    if (action) filters.push(ilike(adminAuditLogs.action, `%${action}%`));

    const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);
    const logs = where
      ? await db.select().from(adminAuditLogs).where(where).orderBy(desc(adminAuditLogs.createdAt)).limit(limit).offset(offset)
      : await db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(limit).offset(offset);

    const actorIds = [...new Set(logs.map(row => row.adminId).filter(Boolean))];
    const actorRows = actorIds.length
      ? await db.select(SAFE_USER_SELECT).from(users).where(inArray(users.id, actorIds))
      : [];
    const actorById = new Map(actorRows.map(row => [row.id, row]));

    return {
      logs: logs.map(log => ({ ...log, actor: actorById.get(log.adminId) ?? null })),
      total: logs.length,
      limit,
      offset,
    };
  });
}

export async function registerAdminRoutes(app: FastifyInstance) {
  registerAuditEnforcement(app, { prefixes: ADMIN_PREFIXES.map(prefix => `${prefix}/`) });
  registerPlatformFailureLogging(app, { prefixes: ADMIN_PREFIXES.map(prefix => `${prefix}/`) });

  for (const prefix of ADMIN_PREFIXES) {
    registerAdminSurface(app, prefix);
  }
}
