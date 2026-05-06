/**
 * Gate 2 — Super Admin Platform Command surface.
 *
 *   /v1/platform/tenants                       — CRUD + lifecycle (suspend/reactivate/archive)
 *   /v1/platform/tenants/:id/detail            — full tenant snapshot
 *   /v1/platform/tenants/:id/modules/:slug/*   — per-tenant enable/disable
 *   /v1/platform/tenants/:id/users/:uid/module-access — per-user access overrides
 *   /v1/platform/modules                       — module catalog CRUD + archive
 *   /v1/platform/health                        — db/Stripe/cron heartbeat
 *   /v1/platform/pricing                       — addon-price drift inspector
 *   /v1/platform/audit                         — filterable audit log
 *   /v1/platform/billing/events                — billing event DLQ (super_admin scope)
 *
 * Every route is gated by `requireSuperAdmin`, which uses the
 * 403 PLATFORM_ROLE_REQUIRED contract. Every mutation calls `writeAudit`.
 *
 * HTTP code policy (this file):
 *   - validation             -> 400
 *   - missing tenant/module  -> 404
 *   - slug-change collision  -> 409 SLUG_TAKEN
 *   - slug-change w/ entitlements/subs -> 409 MODULE_HAS_DEPENDENTS
 *   - archive w/ active subs (no ?confirm=1) -> 409 MODULE_HAS_ACTIVE_SUBS
 *   - addon already active   -> 409 ADDON_ALREADY_ACTIVE  (canPurchaseAddon path)
 */

import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, lte, ilike, isNull, isNotNull, inArray, ne, or } from 'drizzle-orm';
import { db } from '../db.js';
import {
  tenants, tenantUsers, users, modules, tenantModules, tenantUserModuleAccess,
  addonSubscriptions, entitlementOverrides, billingEvents, adminAuditLogs,
  subscriptions, subscriptionPlans, planModules,
} from '../schema.js';
import { requireSuperAdmin } from '../lib/tenant-auth.js';
import {
  writeAudit, pickSafe, TENANT_SAFE_FIELDS, MODULE_SAFE_FIELDS,
  TENANT_MODULE_SAFE_FIELDS, TENANT_USER_ACCESS_SAFE_FIELDS,
} from '../lib/audit.js';
import { lookupAddonStripePrice, getAddonStripePriceEnvKey, getAddonStripePriceId, retryBillingEvent } from '../lib/billing-service.js';
import { getSsoCleanupHealth } from '../lib/sso-cleanup.js';

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

// Gate 2 status taxonomy: 'live' (legacy) and 'active' both signify a
// shipping module; 'hidden' suppresses from public catalog while keeping
// data; 'deprecated' marks for retirement (still launchable for legacy
// tenants); 'disabled' fully blocks launch. The DB CHECK constraint in
// saas-db-init.ts mirrors this list.
const VALID_MODULE_STATUSES = ['live', 'active', 'beta', 'coming_soon', 'hidden', 'deprecated', 'disabled'] as const;
const VALID_PLAN_MIN = ['starter', 'pro', 'elite'] as const;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

function badRequest(reply: any, message: string, extra: Record<string, unknown> = {}) {
  return reply.code(400).send({ error: message, code: 'BAD_REQUEST', ...extra });
}

function isValidHttpUrl(v: unknown): boolean {
  if (typeof v !== 'string' || v.length === 0) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────

export async function registerPlatformRoutes(app: FastifyInstance) {
  // =====================================================================
  // TENANTS — list / detail / create / patch / lifecycle
  // =====================================================================

  // List tenants. Filters: status (default = all), type, q (slug/name ilike), includeArchived.
  app.get('/v1/platform/tenants', { preHandler: [requireSuperAdmin] }, async (request) => {
    const q = (request.query ?? {}) as any;
    const filters: any[] = [];
    if (q.status && ['active', 'suspended', 'archived'].includes(q.status)) {
      filters.push(eq(tenants.status, q.status));
    } else if (q.includeArchived !== '1' && q.includeArchived !== 'true') {
      // Default: hide archived unless explicitly requested.
      filters.push(ne(tenants.status, 'archived'));
    }
    if (q.type === 'personal' || q.type === 'company') {
      filters.push(eq(tenants.type, q.type));
    }
    if (typeof q.q === 'string' && q.q.length > 0) {
      const needle = `%${q.q}%`;
      filters.push(or(ilike(tenants.name, needle), ilike(tenants.slug, needle))!);
    }
    const where = filters.length === 0 ? undefined
      : filters.length === 1 ? filters[0]
      : and(...filters);
    const rows = where
      ? await db.select().from(tenants).where(where).orderBy(desc(tenants.createdAt))
      : await db.select().from(tenants).orderBy(desc(tenants.createdAt));

    // Cheap counts: members + module enables. Two grouped queries are
    // cleaner than N+1 selects.
    const ids = rows.map(r => r.id);
    let memberCounts = new Map<string, number>();
    let moduleCounts = new Map<string, number>();
    if (ids.length > 0) {
      const memberRows = await db.select().from(tenantUsers).where(inArray(tenantUsers.tenantId, ids));
      for (const m of memberRows) memberCounts.set(m.tenantId, (memberCounts.get(m.tenantId) ?? 0) + 1);
      const tmRows = await db.select().from(tenantModules).where(inArray(tenantModules.tenantId, ids));
      for (const tm of tmRows) {
        if (tm.status !== 'disabled' && tm.status !== 'archived') {
          moduleCounts.set(tm.tenantId, (moduleCounts.get(tm.tenantId) ?? 0) + 1);
        }
      }
    }
    return {
      tenants: rows.map(t => ({
        ...t,
        memberCount: memberCounts.get(t.id) ?? 0,
        enabledModuleCount: moduleCounts.get(t.id) ?? 0,
      })),
      total: rows.length,
    };
  });

  // Full tenant snapshot.
  app.get<{ Params: { id: string } }>(
    '/v1/platform/tenants/:id/detail',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
      if (!tenant) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });

      const memberRows = await db.select().from(tenantUsers).where(eq(tenantUsers.tenantId, id));
      const userIds = memberRows.map(m => m.userId);
      const memberUsers = userIds.length === 0 ? [] :
        await db.select({ id: users.id, email: users.email, name: users.name, status: users.status })
          .from(users).where(inArray(users.id, userIds));
      const userById = Object.fromEntries(memberUsers.map(u => [u.id, u]));

      const tmRows = await db.select().from(tenantModules).where(eq(tenantModules.tenantId, id));
      const modIds = tmRows.map(r => r.moduleId);
      const modRows = modIds.length === 0 ? [] :
        await db.select().from(modules).where(inArray(modules.id, modIds));
      const modById = Object.fromEntries(modRows.map(m => [m.id, m]));

      // Per-user module-access grants for this tenant. Without this the
      // PlatformPage Members tab would render every grant as the table
      // default after each reload, which is misleading.
      const accessRows = await db.select().from(tenantUserModuleAccess)
        .where(eq(tenantUserModuleAccess.tenantId, id));
      const accessByUser: Record<string, any[]> = {};
      for (const a of accessRows) {
        (accessByUser[a.userId] ||= []).push(a);
      }

      const subs = await db.select().from(addonSubscriptions).where(eq(addonSubscriptions.tenantId, id));
      const liveAddonCount = subs.filter(s => ['active', 'trialing'].includes(s.status)).length;

      return {
        tenant,
        members: memberRows.map(m => ({
          ...m,
          user: userById[m.userId] ?? null,
          moduleAccess: accessByUser[m.userId] ?? [],
        })),
        modules: tmRows.map(tm => ({ ...tm, module: modById[tm.moduleId] ?? null })),
        billing: {
          addonCount: subs.length,
          activeAddonCount: liveAddonCount,
          subscriptions: subs,
        },
      };
    },
  );

  // Lightweight platform-wide stats for the dashboard. One round-trip,
  // counts only — keeps the operator console snappy.
  app.get('/v1/platform/stats', { preHandler: [requireSuperAdmin] }, async () => {
    const [
      tenantsAll, modulesAll, addonsAll, eventsAll, usersAll,
    ] = await Promise.all([
      db.select().from(tenants),
      db.select().from(modules),
      db.select().from(addonSubscriptions),
      db.select().from(billingEvents),
      db.select({ id: users.id, status: users.status, platformRole: users.platformRole }).from(users),
    ]);
    const byStatus = (rows: any[], k = 'status') => rows.reduce((acc: Record<string, number>, r) => {
      const v = r[k] ?? 'unknown';
      acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {});
    return {
      tenants: { total: tenantsAll.length, byStatus: byStatus(tenantsAll) },
      modules: {
        total: modulesAll.length,
        byStatus: byStatus(modulesAll),
        archivedCount: modulesAll.filter(m => m.archivedAt).length,
      },
      addonSubscriptions: {
        total: addonsAll.length,
        byStatus: byStatus(addonsAll),
        activeOrTrialing: addonsAll.filter(s => ['active', 'trialing'].includes(s.status)).length,
      },
      billingEvents: {
        total: eventsAll.length,
        failed: eventsAll.filter(e => e.status === 'failed').length,
        processed: eventsAll.filter(e => e.status === 'processed').length,
      },
      users: {
        total: usersAll.length,
        superAdmins: usersAll.filter(u => u.platformRole === 'super_admin').length,
        active: usersAll.filter(u => u.status === 'active').length,
      },
    };
  });

  // Create company tenant + owner mapping.
  app.post('/v1/platform/tenants', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const body = (request.body ?? {}) as any;
    const { name, slug, ownerUserId } = body;
    if (!name || typeof name !== 'string') return badRequest(reply, 'name is required');
    if (!slug || typeof slug !== 'string' || !SLUG_RE.test(slug)) {
      return badRequest(reply, 'slug must be a-z, 0-9, dashes (3-64 chars)', { field: 'slug' });
    }
    if (!ownerUserId || typeof ownerUserId !== 'string') return badRequest(reply, 'ownerUserId is required');

    const [owner] = await db.select().from(users).where(eq(users.id, ownerUserId)).limit(1);
    if (!owner) return reply.code(404).send({ error: 'Owner user not found', code: 'USER_NOT_FOUND' });

    const [collision] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (collision) return reply.code(409).send({ error: 'Slug already in use', code: 'SLUG_TAKEN' });

    const type = body.type === 'personal' ? 'personal' : 'company';
    const [created] = await db.insert(tenants).values({
      name, slug, type, ownerUserId, status: 'active',
      metadata: body.metadata ?? null,
    }).returning();

    // Owner mapping (idempotent — defensive in case caller passed an
    // owner who is already linked from a prior failed run).
    const [existingMembership] = await db.select().from(tenantUsers)
      .where(and(eq(tenantUsers.tenantId, created.id), eq(tenantUsers.userId, ownerUserId))).limit(1);
    if (!existingMembership) {
      await db.insert(tenantUsers).values({ tenantId: created.id, userId: ownerUserId, role: 'owner' });
    }

    await writeAudit({
      actorUserId: admin.id,
      tenantId: created.id,
      targetType: 'tenant',
      targetId: created.id,
      action: 'tenant_created',
      after: pickSafe(created, [...TENANT_SAFE_FIELDS]),
      ipAddress: request.ip,
    });
    return reply.code(201).send({ tenant: created });
  });

  // PATCH — rename / slug change / metadata. Slug change collision -> 409.
  app.patch<{ Params: { id: string } }>(
    '/v1/platform/tenants/:id',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id } = request.params;
      const body = (request.body ?? {}) as any;
      const [before] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
      if (!before) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });

      const updates: any = { updatedAt: new Date() };
      if (typeof body.name === 'string' && body.name.length > 0) updates.name = body.name;
      if (typeof body.slug === 'string' && body.slug !== before.slug) {
        if (!SLUG_RE.test(body.slug)) return badRequest(reply, 'invalid slug format', { field: 'slug' });
        const [taken] = await db.select().from(tenants).where(eq(tenants.slug, body.slug)).limit(1);
        if (taken) return reply.code(409).send({ error: 'Slug already in use', code: 'SLUG_TAKEN' });
        updates.slug = body.slug;
      }
      if (body.metadata !== undefined) updates.metadata = body.metadata;

      const [after] = await db.update(tenants).set(updates).where(eq(tenants.id, id)).returning();
      await writeAudit({
        actorUserId: admin.id,
        tenantId: id,
        targetType: 'tenant',
        targetId: id,
        action: 'tenant_updated',
        before: pickSafe(before, [...TENANT_SAFE_FIELDS]),
        after: pickSafe(after, [...TENANT_SAFE_FIELDS]),
        ipAddress: request.ip,
      });
      return { tenant: after };
    },
  );

  // Lifecycle transitions. All idempotent.
  const lifecycleHandler = (next: 'active' | 'suspended' | 'archived', action: string) =>
    async (request: any, reply: any) => {
      const admin = request.user;
      const { id } = request.params;
      const [before] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
      if (!before) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      const updates: any = { status: next, updatedAt: new Date() };
      if (next === 'suspended') updates.suspendedAt = new Date();
      if (next === 'archived') updates.archivedAt = new Date();
      if (next === 'active') { updates.suspendedAt = null; updates.archivedAt = null; }
      const [after] = await db.update(tenants).set(updates).where(eq(tenants.id, id)).returning();
      await writeAudit({
        actorUserId: admin.id,
        tenantId: id,
        targetType: 'tenant',
        targetId: id,
        action,
        before: pickSafe(before, [...TENANT_SAFE_FIELDS]),
        after: pickSafe(after, [...TENANT_SAFE_FIELDS]),
        ipAddress: request.ip,
      });
      return { tenant: after };
    };
  app.post('/v1/platform/tenants/:id/suspend',    { preHandler: [requireSuperAdmin] }, lifecycleHandler('suspended', 'tenant_suspended'));
  app.post('/v1/platform/tenants/:id/reactivate', { preHandler: [requireSuperAdmin] }, lifecycleHandler('active',    'tenant_reactivated'));
  app.post('/v1/platform/tenants/:id/archive',    { preHandler: [requireSuperAdmin] }, lifecycleHandler('archived',  'tenant_archived'));

  // =====================================================================
  // Per-tenant module assignment
  // =====================================================================

  // Enable a module for a tenant. Idempotent — flips an existing row to
  // 'enabled' or inserts a new row with source='admin_grant'.
  app.post<{ Params: { id: string; slug: string }; Body: any }>(
    '/v1/platform/tenants/:id/modules/:slug/enable',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id, slug } = request.params;
      const body = (request.body ?? {}) as any;
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
      if (!tenant) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      const [mod] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
      if (!mod) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
      if (mod.archivedAt) return reply.code(409).send({ error: 'Module is archived', code: 'MODULE_ARCHIVED' });

      const [existing] = await db.select().from(tenantModules)
        .where(and(eq(tenantModules.tenantId, id), eq(tenantModules.moduleId, mod.id))).limit(1);

      const allowAllMembers = body.allowAllMembers === true;
      let after: any;
      if (existing) {
        [after] = await db.update(tenantModules).set({
          status: 'enabled',
          allowAllMembers,
          source: existing.source ?? 'admin',
          updatedAt: new Date(),
        }).where(eq(tenantModules.id, existing.id)).returning();
      } else {
        [after] = await db.insert(tenantModules).values({
          tenantId: id, moduleId: mod.id,
          status: 'enabled', source: 'admin',
          allowAllMembers,
        }).returning();
      }
      await writeAudit({
        actorUserId: admin.id,
        tenantId: id,
        targetType: 'tenant_module',
        targetId: after.id,
        action: 'module_enabled_for_tenant',
        before: pickSafe(existing, [...TENANT_MODULE_SAFE_FIELDS]),
        after: pickSafe(after, [...TENANT_MODULE_SAFE_FIELDS]),
        extra: { moduleSlug: slug },
        ipAddress: request.ip,
      });
      return { tenantModule: after };
    },
  );

  app.post<{ Params: { id: string; slug: string } }>(
    '/v1/platform/tenants/:id/modules/:slug/disable',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id, slug } = request.params;
      const [mod] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
      if (!mod) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
      const [before] = await db.select().from(tenantModules)
        .where(and(eq(tenantModules.tenantId, id), eq(tenantModules.moduleId, mod.id))).limit(1);
      if (!before) return reply.code(404).send({ error: 'Module not enabled for tenant', code: 'TENANT_MODULE_NOT_FOUND' });
      const [after] = await db.update(tenantModules).set({
        status: 'disabled', updatedAt: new Date(),
      }).where(eq(tenantModules.id, before.id)).returning();
      await writeAudit({
        actorUserId: admin.id,
        tenantId: id,
        targetType: 'tenant_module',
        targetId: before.id,
        action: 'module_disabled_for_tenant',
        before: pickSafe(before, [...TENANT_MODULE_SAFE_FIELDS]),
        after: pickSafe(after, [...TENANT_MODULE_SAFE_FIELDS]),
        extra: { moduleSlug: slug },
        ipAddress: request.ip,
      });
      return { tenantModule: after };
    },
  );

  // Per-user, per-module access override within a tenant. Body:
  //   { moduleSlug, accessLevel: 'none' | 'user' | 'manager' }
  app.post<{ Params: { id: string; userId: string }; Body: any }>(
    '/v1/platform/tenants/:id/users/:userId/module-access',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id, userId } = request.params;
      const body = (request.body ?? {}) as any;
      const { moduleSlug, accessLevel } = body;
      if (!moduleSlug || !['none', 'user', 'manager'].includes(accessLevel)) {
        return badRequest(reply, 'moduleSlug and accessLevel (none|user|manager) are required');
      }
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
      if (!tenant) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      const [member] = await db.select().from(tenantUsers)
        .where(and(eq(tenantUsers.tenantId, id), eq(tenantUsers.userId, userId))).limit(1);
      if (!member) return reply.code(404).send({ error: 'User is not a member of this tenant', code: 'TENANT_USER_NOT_FOUND' });
      const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
      if (!mod) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });

      const [before] = await db.select().from(tenantUserModuleAccess)
        .where(and(
          eq(tenantUserModuleAccess.tenantId, id),
          eq(tenantUserModuleAccess.userId, userId),
          eq(tenantUserModuleAccess.moduleId, mod.id),
        )).limit(1);

      let after: any;
      if (before) {
        [after] = await db.update(tenantUserModuleAccess).set({
          accessLevel, grantedByUserId: admin.id, updatedAt: new Date(),
        }).where(eq(tenantUserModuleAccess.id, before.id)).returning();
      } else {
        [after] = await db.insert(tenantUserModuleAccess).values({
          tenantId: id, userId, moduleId: mod.id, accessLevel,
          grantedByUserId: admin.id,
        }).returning();
      }
      await writeAudit({
        actorUserId: admin.id,
        tenantId: id,
        targetType: 'tenant_user_module_access',
        targetId: after.id,
        action: 'tenant_user_module_access_set',
        before: pickSafe(before, [...TENANT_USER_ACCESS_SAFE_FIELDS]),
        after: pickSafe(after, [...TENANT_USER_ACCESS_SAFE_FIELDS]),
        extra: { moduleSlug, targetUserId: userId },
        ipAddress: request.ip,
      });
      return { access: after };
    },
  );

  // =====================================================================
  // MODULES — catalog CRUD + archive
  // =====================================================================

  app.get('/v1/platform/modules', { preHandler: [requireSuperAdmin] }, async (request) => {
    const q = (request.query ?? {}) as any;
    const includeArchived = q.includeArchived === '1' || q.includeArchived === 'true';
    const rows = includeArchived
      ? await db.select().from(modules).orderBy(modules.ord)
      : await db.select().from(modules).where(isNull(modules.archivedAt)).orderBy(modules.ord);
    return { modules: rows, total: rows.length };
  });

  app.post('/v1/platform/modules', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const admin = (request as any).user;
    const body = (request.body ?? {}) as any;
    const { slug, name } = body;
    if (!slug || !SLUG_RE.test(slug)) return badRequest(reply, 'slug must be a-z, 0-9, dashes (3-64 chars)');
    if (!name) return badRequest(reply, 'name is required');
    if (body.status && !VALID_MODULE_STATUSES.includes(body.status)) {
      return badRequest(reply, `status must be one of ${VALID_MODULE_STATUSES.join(', ')}`);
    }
    if (body.planMin && !VALID_PLAN_MIN.includes(body.planMin)) {
      return badRequest(reply, `planMin must be one of ${VALID_PLAN_MIN.join(', ')}`);
    }
    for (const k of ['baseUrl', 'iconUrl'] as const) {
      if (body[k] && !isValidHttpUrl(body[k])) {
        return badRequest(reply, `${k} must be an http(s) URL`);
      }
    }

    const [collision] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
    if (collision) return reply.code(409).send({ error: 'Slug already in use', code: 'SLUG_TAKEN' });

    const [created] = await db.insert(modules).values({
      slug, name,
      description: body.description ?? '',
      iconUrl: body.iconUrl ?? null,
      category: body.category ?? 'app',
      baseUrl: body.baseUrl ?? '',
      status: body.status ?? 'coming_soon',
      planMin: body.planMin ?? 'elite',
      requiresOrg: body.requiresOrg ?? false,
      ord: body.ord ?? 99,
      metadata: body.metadata ?? null,
    }).returning();

    await writeAudit({
      actorUserId: admin.id,
      targetType: 'module',
      targetId: created.id,
      action: 'module_created',
      after: pickSafe(created, [...MODULE_SAFE_FIELDS]),
      ipAddress: request.ip,
    });
    return reply.code(201).send({ module: created });
  });

  app.patch<{ Params: { slug: string } }>(
    '/v1/platform/modules/:slug',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { slug } = request.params;
      const body = (request.body ?? {}) as any;
      const [before] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
      if (!before) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
      if (before.archivedAt && body.status !== 'live' && body.archivedAt !== null) {
        return reply.code(409).send({ error: 'Module is archived', code: 'MODULE_ARCHIVED' });
      }

      // Slug change: require no entitlement_overrides + no addon_subscriptions.
      // Slug is part of public entitlement contract — flipping it would
      // silently re-target every grant and Stripe price binding.
      if (typeof body.slug === 'string' && body.slug !== slug) {
        if (!SLUG_RE.test(body.slug)) return badRequest(reply, 'invalid slug format');
        const [collision] = await db.select().from(modules).where(eq(modules.slug, body.slug)).limit(1);
        if (collision) return reply.code(409).send({ error: 'Slug already in use', code: 'SLUG_TAKEN' });
        const overrides = await db.select().from(entitlementOverrides).where(eq(entitlementOverrides.moduleId, before.id));
        const subs     = await db.select().from(addonSubscriptions).where(eq(addonSubscriptions.moduleId, before.id));
        if (overrides.length > 0 || subs.length > 0) {
          return reply.code(409).send({
            error: 'Cannot change slug while module has entitlement overrides or addon subscriptions',
            code: 'MODULE_HAS_DEPENDENTS',
            entitlementOverrideCount: overrides.length,
            addonSubscriptionCount: subs.length,
          });
        }
      }

      if (body.status && !VALID_MODULE_STATUSES.includes(body.status)) {
        return badRequest(reply, `status must be one of ${VALID_MODULE_STATUSES.join(', ')}`);
      }
      if (body.planMin && !VALID_PLAN_MIN.includes(body.planMin)) {
        return badRequest(reply, `planMin must be one of ${VALID_PLAN_MIN.join(', ')}`);
      }
      for (const k of ['baseUrl', 'iconUrl'] as const) {
        if (body[k] && !isValidHttpUrl(body[k])) {
          return badRequest(reply, `${k} must be an http(s) URL`);
        }
      }

      const updates: any = { updatedAt: new Date() };
      for (const k of ['slug','name','description','iconUrl','category','baseUrl','status','planMin','requiresOrg','ord','metadata'] as const) {
        if (body[k] !== undefined) updates[k] = body[k];
      }
      const [after] = await db.update(modules).set(updates).where(eq(modules.slug, slug)).returning();

      await writeAudit({
        actorUserId: admin.id,
        targetType: 'module',
        targetId: before.id,
        action: 'module_updated',
        before: pickSafe(before, [...MODULE_SAFE_FIELDS]),
        after: pickSafe(after, [...MODULE_SAFE_FIELDS]),
        ipAddress: request.ip,
      });
      return { module: after };
    },
  );

  // Archive (soft-delete). Refuses with 409 if active addon subs exist
  // unless ?confirm=1 — irreversible billing impact must be acknowledged.
  app.post<{ Params: { slug: string }; Querystring: { confirm?: string } }>(
    '/v1/platform/modules/:slug/archive',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { slug } = request.params;
      const confirm = request.query.confirm === '1' || request.query.confirm === 'true';
      const [before] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
      if (!before) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
      if (before.archivedAt) return { module: before, action: 'already_archived' };

      const subs = await db.select().from(addonSubscriptions).where(eq(addonSubscriptions.moduleId, before.id));
      const live = subs.filter(s => ['active', 'trialing'].includes(s.status));
      if (live.length > 0 && !confirm) {
        return reply.code(409).send({
          error: 'Module has active addon subscriptions. Pass ?confirm=1 to archive anyway.',
          code: 'MODULE_HAS_ACTIVE_SUBS',
          activeSubscriptionCount: live.length,
          tenantIds: [...new Set(live.map(s => s.tenantId).filter(Boolean))],
        });
      }
      const [after] = await db.update(modules).set({
        archivedAt: new Date(), status: 'disabled', updatedAt: new Date(),
      }).where(eq(modules.slug, slug)).returning();
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'module',
        targetId: before.id,
        action: 'module_archived',
        before: pickSafe(before, [...MODULE_SAFE_FIELDS]),
        after: pickSafe(after, [...MODULE_SAFE_FIELDS]),
        extra: { activeSubscriptionCount: live.length, confirmedImpact: confirm },
        ipAddress: request.ip,
      });
      return { module: after };
    },
  );

  // =====================================================================
  // HEALTH / PRICING / AUDIT / BILLING-EVENTS
  // =====================================================================

  app.get('/v1/platform/health', { preHandler: [requireSuperAdmin] }, async () => {
    let dbOk = false;
    try { await db.execute(`SELECT 1`); dbOk = true; } catch {}
    const stripeMode = process.env.STRIPE_MODE || 'off';
    const stripeKey = !!process.env.STRIPE_SECRET_KEY;
    const stripeWebhook = !!process.env.STRIPE_WEBHOOK_SECRET;
    const sessionSecret = !!process.env.SESSION_SECRET;
    const openaiKey = !!process.env.OPENAI_API_KEY;
    // Last webhook event = most recent billing_events row.
    const [lastWebhook] = await db.select().from(billingEvents).orderBy(desc(billingEvents.createdAt)).limit(1);
    const [lastAudit]   = await db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(1);
    // Last successfully verified Stripe webhook = most recent billing_events
    // row whose stripeEventId is non-null AND processedAt is set. Signature
    // verification happens before stripeEventId is assigned, so this is a
    // strong proxy for "Stripe is reachable + webhook secret matches".
    const [lastStripeOk] = await db.select().from(billingEvents)
      .where(and(isNotNull(billingEvents.stripeEventId), isNotNull(billingEvents.processedAt)))
      .orderBy(desc(billingEvents.createdAt)).limit(1);
    return {
      ok: dbOk,
      db: { ok: dbOk },
      stripe: {
        mode: stripeMode,
        secretConfigured: stripeKey,
        webhookConfigured: stripeWebhook,
        live: stripeMode === 'live' && stripeKey,
        lastSuccessfulWebhookAt: lastStripeOk?.createdAt ?? null,
      },
      auth: {
        sessionSecretConfigured: sessionSecret,
      },
      ai: {
        openaiKeyConfigured: openaiKey,
      },
      ssoCleanup: getSsoCleanupHealth(),
      lastWebhookAt: lastWebhook?.createdAt ?? null,
      lastAuditAt:   lastAudit?.createdAt ?? null,
      now: new Date().toISOString(),
    };
  });

  app.get('/v1/platform/pricing', { preHandler: [requireSuperAdmin] }, async () => {
    const all = await db.select().from(modules).where(isNull(modules.archivedAt)).orderBy(modules.ord);
    const out = [] as any[];
    for (const m of all) {
      const md = (m.metadata ?? {}) as Record<string, any>;
      const declared = typeof md.addonPriceCents === 'number' ? md.addonPriceCents : null;
      const lookup = await lookupAddonStripePrice(m.slug);
      const mismatch = declared != null && lookup.unitAmountCents != null && declared !== lookup.unitAmountCents;
      out.push({
        slug: m.slug,
        name: m.name,
        status: m.status,
        declaredAddonPriceCents: declared,
        envKey: lookup.envKey,
        envKeyConfigured: !!lookup.priceId,
        stripeUnitAmountCents: lookup.unitAmountCents,
        stripeCurrency: lookup.currency,
        stripeFetched: lookup.fetched,
        mismatch,
        error: lookup.error,
      });
    }
    return { pricing: out, total: out.length, stripeMode: process.env.STRIPE_MODE || 'off' };
  });

  // Filterable audit log.
  app.get('/v1/platform/audit', { preHandler: [requireSuperAdmin] }, async (request) => {
    const q = (request.query ?? {}) as any;
    const limit = Math.min(parseInt(q.limit) || 100, 500);
    const offset = parseInt(q.offset) || 0;

    const filters: any[] = [];
    if (q.actorUserId) filters.push(eq(adminAuditLogs.adminId, q.actorUserId));
    if (q.tenantId)    filters.push(eq(adminAuditLogs.tenantId, q.tenantId));
    if (q.action)      filters.push(eq(adminAuditLogs.action, q.action));
    if (q.fromDate) {
      const d = new Date(q.fromDate);
      if (!isNaN(d.getTime())) filters.push(gte(adminAuditLogs.createdAt, d));
    }
    if (q.toDate) {
      const d = new Date(q.toDate);
      if (!isNaN(d.getTime())) filters.push(lte(adminAuditLogs.createdAt, d));
    }
    const where = filters.length === 0 ? undefined
      : filters.length === 1 ? filters[0]
      : and(...filters);

    const rows = where
      ? await db.select().from(adminAuditLogs).where(where).orderBy(desc(adminAuditLogs.createdAt)).limit(limit).offset(offset)
      : await db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(limit).offset(offset);

    // Hydrate actor names.
    const actorIds = [...new Set(rows.map(r => r.adminId))];
    const actorRows = actorIds.length === 0 ? [] :
      await db.select({ id: users.id, email: users.email, name: users.name })
        .from(users).where(inArray(users.id, actorIds));
    const actorById = Object.fromEntries(actorRows.map(u => [u.id, u]));
    return {
      logs: rows.map(r => ({ ...r, actor: actorById[r.adminId] ?? null })),
      total: rows.length,
      limit,
      offset,
    };
  });

  // Billing-event DLQ scoped to super_admin (mirrors /v1/admin/billing-events).
  app.get('/v1/platform/billing/events', { preHandler: [requireSuperAdmin] }, async (request) => {
    const q = (request.query ?? {}) as any;
    const limit = Math.min(parseInt(q.limit) || 100, 500);
    const onlyFailed = q.onlyFailed === '1' || q.onlyFailed === 'true';
    let rows = await db.select().from(billingEvents).orderBy(desc(billingEvents.createdAt)).limit(limit * 4);
    if (q.tenantId) {
      // tenantId is carried in metadata.tenantId on the event row (set
      // by classifyWebhookEvent for addon checkouts). Filter post-fetch
      // because billing_events.metadata is JSONB and Drizzle's path-eq
      // helper isn't wired in this module.
      rows = rows.filter(e => (e.metadata as any)?.tenantId === q.tenantId);
    }
    if (onlyFailed) rows = rows.filter(e => !!e.errorMessage && !e.processedAt);
    rows = rows.slice(0, limit);
    return { events: rows, total: rows.length };
  });

  // Retry a single failed billing webhook (alias of /v1/admin/billing/events/:id/retry,
  // gated by super_admin instead of admin). Audit row is written so the
  // retry attempt is traceable independent of the original webhook trail.
  app.post<{ Params: { id: string } }>(
    '/v1/platform/billing/events/:id/retry',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id } = request.params;
      const [before] = await db.select().from(billingEvents).where(eq(billingEvents.id, id)).limit(1);
      if (!before) return reply.code(404).send({ error: 'Billing event not found', code: 'BILLING_EVENT_NOT_FOUND' });
      const result = await retryBillingEvent(id);
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'billing_event',
        targetId: id,
        action: 'billing_event_retried',
        before: { id: before.id, eventType: before.eventType, processedAt: before.processedAt, errorMessage: before.errorMessage },
        extra: { result },
        ipAddress: request.ip,
      });
      return result;
    },
  );
}
