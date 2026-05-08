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
  saasWorkspaces, saasProjects, saasTasks, notes, workspaceMemberships,
  activityFeed,
} from '../schema.js';
import { count } from 'drizzle-orm';
import { requireSuperAdmin } from '../lib/tenant-auth.js';
import { sanitizeUser } from '../lib/auth.js';
import {
  writeAudit, pickSafe, registerAuditEnforcement,
  TENANT_SAFE_FIELDS, MODULE_SAFE_FIELDS,
  TENANT_MODULE_SAFE_FIELDS, TENANT_USER_ACCESS_SAFE_FIELDS,
} from '../lib/audit.js';
import { lookupAddonStripePrice, getAddonStripePriceEnvKey, getAddonStripePriceId, retryBillingEvent, createAddonStripePrice, resyncUserBilling } from '../lib/billing-service.js';
import { getModuleAccessTrace } from '../lib/entitlement-service.js';
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
  // Centralized audit enforcement for /v1/platform/* (privileged super-admin
  // surface). Billing endpoints already self-audit but are not enforced here
  // to avoid noisy `audit_missing` rows from low-risk routes.
  registerAuditEnforcement(app, { prefixes: ['/v1/platform/'] });

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
        failed: eventsAll.filter(e => e.errorMessage !== null).length,
        processed: eventsAll.filter(e => e.processedAt !== null).length,
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
    }, request);
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
      }, request);
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
      }, request);
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
      }, request);
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
      }, request);
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
      }, request);
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
    // Enrich with `includedInPlans` (plan slugs that bundle each module).
    // The plan-mapping editor in the UI needs the current state, and other
    // callers can simply ignore the new field.
    const allPlans = await db.select().from(subscriptionPlans);
    const planSlugById = Object.fromEntries(allPlans.map(p => [p.id, p.slug]));
    const mappings = await db.select().from(planModules);
    const byModule: Record<string, string[]> = {};
    for (const m of mappings) {
      const slug = planSlugById[m.planId];
      if (!slug) continue;
      (byModule[m.moduleId] ||= []).push(slug);
    }
    const enriched = rows.map(r => ({ ...r, includedInPlans: byModule[r.id] ?? [] }));
    return { modules: enriched, total: enriched.length };
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
    }, request);
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

      // Pricing config (addonAnnualPriceCents, stripePriceEnvKey) is managed
      // out-of-band (env + dedicated price-update endpoint), not via this PATCH.
      // Strip them from metadata if present so the UI badge stays the source
      // of truth and accidental drift is impossible.
      if (body.metadata && typeof body.metadata === 'object') {
        const meta = { ...body.metadata };
        delete meta.addonAnnualPriceCents;
        delete meta.stripePriceEnvKey;
        const beforeMeta = (before.metadata ?? {}) as any;
        if (beforeMeta.addonAnnualPriceCents !== undefined) meta.addonAnnualPriceCents = beforeMeta.addonAnnualPriceCents;
        if (beforeMeta.stripePriceEnvKey !== undefined) meta.stripePriceEnvKey = beforeMeta.stripePriceEnvKey;
        body.metadata = meta;
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
      }, request);
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
      }, request);
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

  // Pricing-drift fix #1: copy live Stripe unit_amount into
  // modules.metadata.addonPriceCents so the in-app displayed price matches
  // what Stripe will actually charge. Read-only against Stripe (no price
  // mutation); only modifies the local module row.
  app.post<{ Params: { slug: string } }>(
    '/v1/platform/pricing/:slug/sync-from-stripe',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { slug } = request.params;
      const [before] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
      if (!before) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });

      const lookup = await lookupAddonStripePrice(slug);
      if (!lookup.priceId) {
        return reply.code(409).send({
          error: `No Stripe price configured (${lookup.envKey} is empty)`,
          code: 'STRIPE_PRICE_NOT_CONFIGURED',
        });
      }
      if (!lookup.fetched || typeof lookup.unitAmountCents !== 'number') {
        return reply.code(502).send({
          error: lookup.error || 'Could not fetch Stripe price',
          code: 'STRIPE_LOOKUP_FAILED',
        });
      }

      const beforeMd = (before.metadata ?? {}) as Record<string, any>;
      const previousCents = typeof beforeMd.addonPriceCents === 'number' ? beforeMd.addonPriceCents : null;
      const nextCents = lookup.unitAmountCents;
      const nextMd = { ...beforeMd, addonPriceCents: nextCents };
      const [after] = await db.update(modules)
        .set({ metadata: nextMd, updatedAt: new Date() })
        .where(eq(modules.slug, slug))
        .returning();

      await writeAudit({
        actorUserId: admin.id,
        targetType: 'module',
        targetId: before.id,
        action: 'module_addon_price_synced_from_stripe',
        before: pickSafe(before, [...MODULE_SAFE_FIELDS]),
        after: pickSafe(after, [...MODULE_SAFE_FIELDS]),
        extra: {
          slug, envKey: lookup.envKey, priceId: lookup.priceId,
          previousCents, nextCents, currency: lookup.currency,
        },
        ipAddress: request.ip,
      }, request);

      const fresh = await lookupAddonStripePrice(slug);
      return {
        ok: true,
        action: 'synced_from_stripe',
        previousCents,
        nextCents,
        module: after,
        lookup: fresh,
      };
    },
  );

  // Pricing-drift fix #2: provision a new Stripe Price (recurring monthly)
  // for the module's add-on, point the in-process env binding at it, and
  // align modules.metadata.addonPriceCents to the new amount. Requires
  // STRIPE_MODE=live so we never invent priceIds against a non-live env.
  //
  // IMPORTANT: process.env mutation only persists for the running process.
  // The response carries `requiresSecretRotation: true` and the new priceId
  // so the operator can persist STRIPE_PRICE_ADDON_<SLUG> in their secrets.
  app.post<{ Params: { slug: string }; Body: { unitAmountCents?: unknown; currency?: unknown } }>(
    '/v1/platform/pricing/:slug/create-stripe-price',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { slug } = request.params;
      const body = (request.body ?? {}) as any;
      const raw = body.unitAmountCents;
      if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) {
        return badRequest(reply, 'unitAmountCents must be a positive integer (cents)');
      }
      if (raw > 100_000_00) {
        return badRequest(reply, 'unitAmountCents is unreasonably large (>$100,000)');
      }
      const currency = typeof body.currency === 'string' && body.currency.length > 0
        ? body.currency.toLowerCase() : 'usd';

      const [before] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
      if (!before) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });

      const envKey = getAddonStripePriceEnvKey(slug);
      const previousPriceId = process.env[envKey] || null;

      let created;
      try {
        created = await createAddonStripePrice({
          moduleSlug: slug, moduleName: before.name, unitAmountCents: raw, currency,
        });
      } catch (err: any) {
        const msg = err?.message || 'Stripe price creation failed';
        const isLive = (process.env.STRIPE_MODE || '') === 'live';
        return reply.code(isLive ? 502 : 409).send({
          error: msg,
          code: isLive ? 'STRIPE_PRICE_CREATE_FAILED' : 'STRIPE_NOT_LIVE',
        });
      }

      // Rotate in-process env binding so subsequent /v1/admin/.../stripe-price
      // and addon checkout flows immediately use the new price.
      process.env[envKey] = created.priceId;

      const beforeMd = (before.metadata ?? {}) as Record<string, any>;
      const previousCents = typeof beforeMd.addonPriceCents === 'number' ? beforeMd.addonPriceCents : null;
      const nextMd = { ...beforeMd, addonPriceCents: created.unitAmountCents };
      const [after] = await db.update(modules)
        .set({ metadata: nextMd, updatedAt: new Date() })
        .where(eq(modules.slug, slug))
        .returning();

      await writeAudit({
        actorUserId: admin.id,
        targetType: 'module',
        targetId: before.id,
        action: 'module_stripe_price_created',
        before: pickSafe(before, [...MODULE_SAFE_FIELDS]),
        after: pickSafe(after, [...MODULE_SAFE_FIELDS]),
        extra: {
          slug, envKey,
          previousPriceId, newPriceId: created.priceId,
          previousCents, nextCents: created.unitAmountCents,
          currency: created.currency, productId: created.productId,
        },
        ipAddress: request.ip,
      }, request);

      const fresh = await lookupAddonStripePrice(slug);
      return {
        ok: true,
        action: 'stripe_price_created',
        envKey,
        previousPriceId,
        newPriceId: created.priceId,
        productId: created.productId,
        previousCents,
        nextCents: created.unitAmountCents,
        currency: created.currency,
        module: after,
        lookup: fresh,
        requiresSecretRotation: true,
        secretRotationHint: `Save ${envKey}=${created.priceId} into your environment secrets so this binding survives a restart.`,
      };
    },
  );

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
    if (q.eventType) rows = rows.filter(e => e.eventType === q.eventType);
    if (q.userId) rows = rows.filter(e => e.userId === q.userId);
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
      }, request);
      return result;
    },
  );

  // =====================================================================
  // USERS — list / detail / status / role / plan / sub-status / trial /
  // unlock / soft-delete / hard-delete / billing-resync /
  // entitlement overrides
  //
  // These were ported from the retired `/v1/admin/*` surface. The legacy
  // `users.role` enum (`user`/`admin`) is preserved as a transitional
  // signal — Gate 2 authority is the per-user `platformRole` plus the
  // tenant-scoped roles in `tenant_users`. Mutations all call writeAudit
  // so the existing audit-enforcement hook stays green.
  // =====================================================================

  const USER_SAFE_FIELDS = [
    'id', 'email', 'name', 'role', 'status', 'planId', 'platformRole',
    'failedLoginCount', 'lockedUntil', 'deletedAt',
  ] as const;
  const SUB_SAFE_FIELDS = [
    'id', 'userId', 'planId', 'status', 'currentPeriodStart',
    'currentPeriodEnd', 'cancelAtPeriodEnd',
  ] as const;

  app.get('/v1/platform/users', { preHandler: [requireSuperAdmin] }, async (request) => {
    const q = (request.query ?? {}) as any;
    const page = parseInt(q.page) || 1;
    const limit = Math.min(parseInt(q.limit) || 25, 100);
    const offset = (page - 1) * limit;

    let allUsers = await db.select({
      id: users.id, email: users.email, name: users.name, role: users.role,
      status: users.status, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt,
      avatarUrl: users.avatarUrl, planId: users.planId, deletedAt: users.deletedAt,
      failedLoginCount: users.failedLoginCount, lockedUntil: users.lockedUntil,
      platformRole: users.platformRole,
    }).from(users).orderBy(desc(users.createdAt));

    if (q.search) {
      const s = String(q.search).toLowerCase();
      allUsers = allUsers.filter(u =>
        (u.email ?? '').toLowerCase().includes(s) ||
        (u.name ?? '').toLowerCase().includes(s),
      );
    }
    if (q.status) allUsers = allUsers.filter(u => u.status === q.status);
    if (q.role)   allUsers = allUsers.filter(u => u.role === q.role);

    // Hydrate subscription + plan in one pass each (avoid the old N+1 loop).
    const allSubs = await db.select().from(subscriptions);
    const subByUser: Record<string, any> = {};
    for (const s of allSubs) if (!subByUser[s.userId]) subByUser[s.userId] = s;
    const allPlans = await db.select().from(subscriptionPlans);
    const planById = Object.fromEntries(allPlans.map(p => [p.id, p]));

    let withSubs = allUsers.map(u => {
      const sub = subByUser[u.id] ?? null;
      const p = sub ? planById[sub.planId] : null;
      return { ...u, subscription: sub, planName: p?.name ?? 'None', planSlug: p?.slug ?? 'none' };
    });
    if (q.plan) withSubs = withSubs.filter(u => u.planSlug === q.plan);

    if (q.sort) {
      const dir = q.order === 'asc' ? 1 : -1;
      withSubs.sort((a: any, b: any) => {
        const va = a[q.sort] ?? '';
        const vb = b[q.sort] ?? '';
        if (va < vb) return -dir;
        if (va > vb) return dir;
        return 0;
      });
    }
    const total = withSubs.length;
    return {
      users: withSubs.slice(offset, offset + limit),
      total, page, limit, pages: Math.ceil(total / limit),
    };
  });

  app.get<{ Params: { id: string } }>(
    '/v1/platform/users/:id',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const { id } = request.params;
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!user) return reply.code(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' });

      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, id)).limit(1);
      let plan = null;
      if (sub) [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);

      const [{ value: wsCount }]   = await db.select({ value: count() }).from(saasWorkspaces).where(eq(saasWorkspaces.ownerId, id));
      const [{ value: projCount }] = await db.select({ value: count() }).from(saasProjects).where(eq(saasProjects.userId, id));
      const [{ value: taskCount }] = await db.select({ value: count() }).from(saasTasks).where(eq(saasTasks.userId, id));
      const [{ value: noteCount }] = await db.select({ value: count() }).from(notes).where(eq(notes.userId, id));

      const recentActivity = await db.select().from(activityFeed).where(eq(activityFeed.userId, id)).orderBy(desc(activityFeed.createdAt)).limit(10);
      const auditHistory = await db.select().from(adminAuditLogs).where(eq(adminAuditLogs.targetUserId, id)).orderBy(desc(adminAuditLogs.createdAt)).limit(20);
      const userBillingEvents = await db.select().from(billingEvents).where(eq(billingEvents.userId, id)).orderBy(desc(billingEvents.createdAt)).limit(20);

      return {
        user: sanitizeUser(user),
        subscription: sub ?? null,
        plan,
        stats: { workspaces: wsCount, projects: projCount, tasks: taskCount, notes: noteCount },
        recentActivity,
        auditHistory,
        billingEvents: userBillingEvents,
      };
    },
  );

  app.put<{ Params: { id: string }; Body: any }>(
    '/v1/platform/users/:id/status',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id } = request.params;
      const { status, reason } = (request.body ?? {}) as any;
      if (!['active', 'suspended', 'deleted'].includes(status)) {
        return badRequest(reply, 'Invalid status. Allowed: active, suspended, deleted');
      }
      if (id === admin.id) return badRequest(reply, 'Cannot change your own status');
      const [before] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!before) return reply.code(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' });

      const updates: any = { status, updatedAt: new Date() };
      if (status === 'deleted') updates.deletedAt = new Date();
      if (status === 'active' && before.status === 'suspended') {
        updates.failedLoginCount = 0;
        updates.lockedUntil = null;
      }
      const [after] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
      const action = status === 'suspended' ? 'user_suspended'
        : status === 'active' ? 'user_reactivated'
        : 'user_deleted';
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'user',
        targetId: id,
        action,
        before: pickSafe(before, [...USER_SAFE_FIELDS]),
        after: pickSafe(after, [...USER_SAFE_FIELDS]),
        extra: { reason: reason ?? null },
        ipAddress: request.ip,
      }, request);
      return { user: sanitizeUser(after), previousStatus: before.status };
    },
  );

  app.put<{ Params: { id: string }; Body: any }>(
    '/v1/platform/users/:id/role',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id } = request.params;
      const { role } = (request.body ?? {}) as any;
      if (!['user', 'admin'].includes(role)) {
        return badRequest(reply, 'Invalid role. Allowed: user, admin');
      }
      if (id === admin.id) return badRequest(reply, 'Cannot change your own role');
      const [before] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!before) return reply.code(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' });
      const [after] = await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id)).returning();
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'user',
        targetId: id,
        action: 'user_role_changed',
        before: pickSafe(before, [...USER_SAFE_FIELDS]),
        after: pickSafe(after, [...USER_SAFE_FIELDS]),
        ipAddress: request.ip,
      }, request);
      return { user: sanitizeUser(after), previousRole: before.role };
    },
  );

  app.put<{ Params: { id: string }; Body: any }>(
    '/v1/platform/users/:id/plan',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id } = request.params;
      const { planSlug } = (request.body ?? {}) as any;
      if (!planSlug || typeof planSlug !== 'string') return badRequest(reply, 'Plan slug is required');
      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, planSlug)).limit(1);
      if (!plan) return reply.code(404).send({ error: 'Plan not found', code: 'PLAN_NOT_FOUND' });
      const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, id)).limit(1);
      const before = existingSub ?? null;
      let after: any;
      if (existingSub) {
        [after] = await db.update(subscriptions).set({
          planId: plan.id, status: 'active', updatedAt: new Date(),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }).where(eq(subscriptions.id, existingSub.id)).returning();
      } else {
        [after] = await db.insert(subscriptions).values({
          userId: id, planId: plan.id, status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }).returning();
      }
      await db.insert(billingEvents).values({
        userId: id, eventType: 'plan_changed_by_admin',
        metadata: { adminId: admin.id, planSlug, previousPlanId: before?.planId ?? null },
      });
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'user',
        targetId: id,
        action: 'user_plan_changed',
        before: pickSafe(before, [...SUB_SAFE_FIELDS]),
        after: pickSafe(after, [...SUB_SAFE_FIELDS]),
        extra: { planSlug },
        ipAddress: request.ip,
      }, request);
      return { ok: true, plan: plan.name };
    },
  );

  app.put<{ Params: { id: string }; Body: any }>(
    '/v1/platform/users/:id/subscription-status',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id } = request.params;
      const { status, reason } = (request.body ?? {}) as any;
      if (!['active', 'past_due', 'canceled', 'trialing', 'expired'].includes(status)) {
        return badRequest(reply, 'Invalid subscription status');
      }
      const [before] = await db.select().from(subscriptions).where(eq(subscriptions.userId, id)).limit(1);
      if (!before) return reply.code(404).send({ error: 'No subscription found for this user', code: 'SUBSCRIPTION_NOT_FOUND' });
      const [after] = await db.update(subscriptions).set({ status, updatedAt: new Date() }).where(eq(subscriptions.id, before.id)).returning();
      await db.insert(billingEvents).values({
        userId: id, eventType: 'subscription_status_override',
        metadata: { adminId: admin.id, previousStatus: before.status, newStatus: status, reason: reason ?? null },
      });
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'subscription',
        targetId: before.id,
        action: 'subscription_status_changed',
        before: pickSafe(before, [...SUB_SAFE_FIELDS]),
        after: pickSafe(after, [...SUB_SAFE_FIELDS]),
        extra: { reason: reason ?? null, targetUserId: id },
        ipAddress: request.ip,
      }, request);
      return { ok: true, previousStatus: before.status, newStatus: status };
    },
  );

  app.put<{ Params: { id: string }; Body: any }>(
    '/v1/platform/users/:id/trial',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id } = request.params;
      const { trialEndDate } = (request.body ?? {}) as any;
      if (!trialEndDate) return badRequest(reply, 'Trial end date is required');
      const endDate = new Date(trialEndDate);
      if (isNaN(endDate.getTime())) return badRequest(reply, 'Invalid date format');
      const [before] = await db.select().from(subscriptions).where(eq(subscriptions.userId, id)).limit(1);
      if (!before) return reply.code(404).send({ error: 'No subscription found for this user', code: 'SUBSCRIPTION_NOT_FOUND' });
      const [after] = await db.update(subscriptions).set({
        status: 'trialing', currentPeriodEnd: endDate, updatedAt: new Date(),
      }).where(eq(subscriptions.id, before.id)).returning();
      await db.insert(billingEvents).values({
        userId: id, eventType: 'trial_set_by_admin',
        metadata: { adminId: admin.id, trialEndDate: endDate.toISOString() },
      });
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'subscription',
        targetId: before.id,
        action: 'trial_set',
        before: pickSafe(before, [...SUB_SAFE_FIELDS]),
        after: pickSafe(after, [...SUB_SAFE_FIELDS]),
        extra: { trialEndDate: endDate.toISOString(), targetUserId: id },
        ipAddress: request.ip,
      }, request);
      return { ok: true, trialEndDate: endDate.toISOString() };
    },
  );

  app.put<{ Params: { id: string } }>(
    '/v1/platform/users/:id/unlock',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id } = request.params;
      const [before] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!before) return reply.code(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' });
      const [after] = await db.update(users).set({
        failedLoginCount: 0, lockedUntil: null, updatedAt: new Date(),
      }).where(eq(users.id, id)).returning();
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'user',
        targetId: id,
        action: 'user_unlocked',
        before: pickSafe(before, [...USER_SAFE_FIELDS]),
        after: pickSafe(after, [...USER_SAFE_FIELDS]),
        extra: { wasLocked: !!before.lockedUntil },
        ipAddress: request.ip,
      }, request);
      return { ok: true, message: 'User account unlocked' };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/v1/platform/users/:id',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id } = request.params;
      if (id === admin.id) return badRequest(reply, 'Cannot delete yourself');
      const [before] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!before) return reply.code(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' });
      const [after] = await db.update(users).set({
        status: 'deleted', deletedAt: new Date(), updatedAt: new Date(),
      }).where(eq(users.id, id)).returning();
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'user',
        targetId: id,
        action: 'user_deleted',
        before: pickSafe(before, [...USER_SAFE_FIELDS]),
        after: pickSafe(after, [...USER_SAFE_FIELDS]),
        extra: { email: before.email },
        ipAddress: request.ip,
      }, request);
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/v1/platform/users/:id/hard',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id } = request.params;
      if (id === admin.id) return badRequest(reply, 'Cannot delete yourself');
      const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!target) return reply.code(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' });
      if (target.status !== 'deleted') {
        return reply.code(400).send({ error: 'User must be soft-deleted first before hard delete', code: 'USER_NOT_SOFT_DELETED' });
      }
      const [{ value: wsCount }]   = await db.select({ value: count() }).from(saasWorkspaces).where(eq(saasWorkspaces.ownerId, id));
      const [{ value: projCount }] = await db.select({ value: count() }).from(saasProjects).where(eq(saasProjects.userId, id));
      if (wsCount > 0 || projCount > 0) {
        return reply.code(400).send({
          error: 'Cannot hard delete user with existing workspaces or projects. Clean up their data first.',
          code: 'USER_HAS_RESIDUAL_DATA',
          remaining: { workspaces: wsCount, projects: projCount },
        });
      }
      await db.delete(activityFeed).where(eq(activityFeed.userId, id));
      await db.delete(saasTasks).where(eq(saasTasks.userId, id));
      await db.delete(notes).where(eq(notes.userId, id));
      await db.delete(workspaceMemberships).where(eq(workspaceMemberships.userId, id));
      await db.delete(billingEvents).where(eq(billingEvents.userId, id));
      await db.delete(subscriptions).where(eq(subscriptions.userId, id));
      await db.delete(users).where(eq(users.id, id));
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'user',
        targetId: id,
        action: 'user_hard_deleted',
        before: pickSafe(target, [...USER_SAFE_FIELDS]),
        extra: { email: target.email },
        ipAddress: request.ip,
      }, request);
      return { ok: true, message: 'User permanently deleted' };
    },
  );

  app.post<{ Params: { userId: string } }>(
    '/v1/platform/billing/resync/:userId',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { userId } = request.params;
      const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!target) return reply.code(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' });
      const result = await resyncUserBilling(userId);
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'user',
        targetId: userId,
        action: 'billing_resync_triggered',
        extra: { mode: result.mode, scanned: result.scanned, reconciled: result.reconciled },
        ipAddress: request.ip,
      }, request);
      return result;
    },
  );

  // -------------------------------------------------------------------------
  // Module add-on price + Stripe drift (port of legacy admin endpoints)
  // -------------------------------------------------------------------------
  app.put<{ Params: { slug: string }; Body: { addonPriceCents?: unknown } }>(
    '/v1/platform/modules/:slug/addon-price',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { slug } = request.params;
      const raw = request.body?.addonPriceCents;
      if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) {
        return badRequest(reply, 'addonPriceCents must be a non-negative integer (cents)');
      }
      if (raw > 100_000_00) return badRequest(reply, 'addonPriceCents is unreasonably large (>$100,000)');
      const [before] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
      if (!before) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
      const existingMd = (before.metadata ?? {}) as Record<string, unknown>;
      const previous = typeof existingMd.addonPriceCents === 'number' ? existingMd.addonPriceCents : null;
      const nextMd = { ...existingMd, addonPriceCents: raw };
      const [after] = await db.update(modules)
        .set({ metadata: nextMd, updatedAt: new Date() })
        .where(eq(modules.slug, slug)).returning();
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'module',
        targetId: before.id,
        action: 'module_addon_price_updated',
        before: pickSafe(before, [...MODULE_SAFE_FIELDS]),
        after: pickSafe(after, [...MODULE_SAFE_FIELDS]),
        extra: { previousCents: previous, nextCents: raw, slug },
        ipAddress: request.ip,
      }, request);
      return { module: after };
    },
  );

  // Per-module add-on price change history. Reads `admin_audit_logs` rows
  // where action='module_addon_price_updated' and details.slug matches the
  // requested module slug. Powers the "Price history" panel so platform
  // admins can audit prior values and roll back to any of them.
  app.get<{ Params: { slug: string } }>(
    '/v1/platform/modules/:slug/addon-price-history',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const { slug } = request.params;
      const [mod] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
      if (!mod) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
      const rows = await db.select()
        .from(adminAuditLogs)
        .where(eq(adminAuditLogs.action, 'module_addon_price_updated'))
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(200);
      const matches = rows.filter(r => {
        const d = (r.details ?? {}) as Record<string, unknown>;
        return d.slug === slug;
      });
      const adminIds = [...new Set(matches.map(r => r.adminId))];
      const adminMap: Record<string, { email: string; name: string | null }> = {};
      for (const uid of adminIds) {
        const [u] = await db.select({ email: users.email, name: users.name })
          .from(users).where(eq(users.id, uid)).limit(1);
        if (u) adminMap[uid] = { email: u.email, name: u.name };
      }
      const history = matches.map(r => {
        const d = (r.details ?? {}) as Record<string, unknown>;
        return {
          id: r.id,
          createdAt: r.createdAt,
          adminId: r.adminId,
          adminEmail: adminMap[r.adminId]?.email ?? null,
          adminName: adminMap[r.adminId]?.name ?? null,
          previousCents: typeof d.previousCents === 'number' ? d.previousCents : null,
          nextCents: typeof d.nextCents === 'number' ? d.nextCents : null,
        };
      });
      return { slug, history };
    },
  );

  app.get<{ Params: { slug: string } }>(
    '/v1/platform/modules/:slug/stripe-price',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const { slug } = request.params;
      const [mod] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
      if (!mod) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
      const lookup = await lookupAddonStripePrice(slug);
      return { slug, lookup };
    },
  );

  app.get<{ Params: { slug: string } }>(
    '/v1/platform/modules/:slug/members',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const { slug } = request.params;
      const [mod] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
      if (!mod) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });

      const allPlans = await db.select().from(subscriptionPlans);
      const planIdToSlug = Object.fromEntries(allPlans.map(p => [p.id, p.slug]));
      const includedMappings = await db.select().from(planModules).where(eq(planModules.moduleId, mod.id));
      const includedPlanIds = new Set(includedMappings.map(m => m.planId));

      const planSubs = includedPlanIds.size > 0 ? await db.select().from(subscriptions) : [];
      const planUsers = planSubs
        .filter(s => includedPlanIds.has(s.planId) && ['active', 'trialing'].includes(s.status))
        .map(s => ({ userId: s.userId, source: 'plan' as const, planSlug: planIdToSlug[s.planId] }));

      const addons = await db.select().from(addonSubscriptions).where(eq(addonSubscriptions.moduleId, mod.id));
      const addonUsers = addons
        .filter(a => ['active', 'trialing'].includes(a.status))
        .map(a => ({ userId: a.userId, source: 'addon' as const, planSlug: null as string | null, addonId: a.id }));

      const overrides = await db.select().from(entitlementOverrides).where(eq(entitlementOverrides.moduleId, mod.id));
      const now = new Date();
      const overrideUsers = overrides
        .filter(o => !o.expiresAt || o.expiresAt > now)
        .map(o => ({
          userId: o.userId, source: 'override' as const, planSlug: null as string | null,
          grant: o.grant, reason: o.reason, expiresAt: o.expiresAt,
        }));

      // Legacy `users.role === 'admin'` is still honored as an access source
      // (admin_role > override > addon > plan), mirroring the entitlement
      // service evaluation order.
      const adminRows = await db.select().from(users).where(eq(users.role, 'admin'));
      const adminUsers = adminRows
        .filter(u => u.status === 'active')
        .map(u => ({ userId: u.id, source: 'admin_role' as const, planSlug: null as string | null }));

      type Row = {
        userId: string;
        source: 'plan' | 'addon' | 'override' | 'admin_role';
        planSlug: string | null;
        grant?: boolean;
        reason?: string | null;
        expiresAt?: Date | null;
        addonId?: string;
      };
      const byUser: Record<string, Row> = {};
      for (const r of planUsers as Row[]) byUser[r.userId] = r;
      for (const r of addonUsers as Row[]) byUser[r.userId] = r;
      for (const r of overrideUsers as Row[]) byUser[r.userId] = r;
      for (const r of adminUsers as Row[]) byUser[r.userId] = r;

      const userIds = Object.keys(byUser);
      const userRows = userIds.length > 0
        ? await db.select().from(users).where(inArray(users.id, userIds))
        : [];
      const userById = Object.fromEntries(userRows.map(u => [u.id, u]));

      const allRows = userIds.map(uid => {
        const u = userById[uid]; const r = byUser[uid];
        if (!u) return null;
        return {
          userId: u.id, email: u.email, name: u.name, role: u.role, status: u.status,
          accessSource: r.source, planSlug: r.planSlug,
          grant: r.grant ?? true, reason: r.reason ?? null,
          expiresAt: r.expiresAt ?? null, addonId: r.addonId ?? null,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => a.email.localeCompare(b.email));

      const members = allRows.filter(m => !(m.accessSource === 'override' && !m.grant));
      const revoked = allRows.filter(m => m.accessSource === 'override' && !m.grant);

      return {
        module: { id: mod.id, slug: mod.slug, name: mod.name, status: mod.status, planMin: mod.planMin },
        members, revoked,
        counts: {
          total: members.length,
          plan: members.filter(m => m.accessSource === 'plan').length,
          addon: members.filter(m => m.accessSource === 'addon').length,
          override_grant: members.filter(m => m.accessSource === 'override' && m.grant).length,
          override_revoke: revoked.length,
          admin_role: members.filter(m => m.accessSource === 'admin_role').length,
        },
      };
    },
  );

  app.post<{ Params: { slug: string }; Body: { planSlugs?: string[] } }>(
    '/v1/platform/modules/:slug/plan-mapping',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { slug } = request.params;
      const { planSlugs } = (request.body ?? {}) as any;
      if (!Array.isArray(planSlugs)) return badRequest(reply, 'planSlugs must be an array');
      const [mod] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
      if (!mod) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });

      const allPlans = await db.select().from(subscriptionPlans);
      const planBySlug = Object.fromEntries(allPlans.map(p => [p.slug, p]));
      const planIdToSlug = Object.fromEntries(allPlans.map(p => [p.id, p.slug]));

      const beforeRows = await db.select().from(planModules).where(eq(planModules.moduleId, mod.id));
      const beforeSlugs = beforeRows.map(r => planIdToSlug[r.planId]).filter(Boolean);

      await db.delete(planModules).where(eq(planModules.moduleId, mod.id));
      for (const ps of planSlugs) {
        const plan = planBySlug[ps];
        if (!plan) continue;
        await db.insert(planModules).values({ planId: plan.id, moduleId: mod.id });
      }
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'module',
        targetId: mod.id,
        action: 'module_plan_mapping_changed',
        before: { planSlugs: beforeSlugs },
        after: { planSlugs },
        extra: { slug },
        ipAddress: request.ip,
      }, request);
      return { ok: true, slug, planSlugs };
    },
  );

  // -------------------------------------------------------------------------
  // Per-user entitlement overrides
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    '/v1/platform/users/:id/module-overrides',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const { id } = request.params;
      const overrides = await db.select().from(entitlementOverrides).where(eq(entitlementOverrides.userId, id));
      const allModules = await db.select().from(modules);
      const modById = Object.fromEntries(allModules.map(m => [m.id, m]));
      const enriched = overrides.map(o => ({
        ...o, moduleSlug: modById[o.moduleId]?.slug, moduleName: modById[o.moduleId]?.name,
      }));
      const addons = await db.select().from(addonSubscriptions).where(eq(addonSubscriptions.userId, id));
      const enrichedAddons = addons.map(a => ({
        ...a, moduleSlug: modById[a.moduleId]?.slug, moduleName: modById[a.moduleId]?.name,
      }));
      const breakdowns: any[] = [];
      for (const m of allModules) {
        const b = await getModuleAccessTrace(id, m.slug);
        if (b) breakdowns.push(b);
      }
      return { overrides: enriched, addons: enrichedAddons, breakdowns };
    },
  );

  app.post<{ Params: { id: string }; Body: any }>(
    '/v1/platform/users/:id/module-overrides',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id } = request.params;
      const { moduleSlug, grant, reason, expiresAt } = (request.body ?? {}) as any;
      if (!moduleSlug) return badRequest(reply, 'moduleSlug is required');
      if (typeof grant !== 'boolean') return badRequest(reply, 'grant must be a boolean');
      const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
      if (!mod) return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND' });
      const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!target) return reply.code(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' });

      // Replace any existing override for this user/module pair.
      const [before] = await db.select().from(entitlementOverrides)
        .where(and(eq(entitlementOverrides.userId, id), eq(entitlementOverrides.moduleId, mod.id))).limit(1);
      if (before) {
        await db.delete(entitlementOverrides).where(eq(entitlementOverrides.id, before.id));
      }
      const [created] = await db.insert(entitlementOverrides).values({
        userId: id, moduleId: mod.id, grant, reason: reason ?? null,
        createdByAdminId: admin.id,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      }).returning();
      await db.insert(activityFeed).values({
        userId: id, action: grant ? 'module_granted' : 'module_revoked',
        entityType: 'module', entityId: mod.id,
        metadata: { moduleSlug, by: admin.email, reason },
      });
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'entitlement_override',
        targetId: created.id,
        action: grant ? 'module_override_granted' : 'module_override_revoked',
        before: before ? { id: before.id, grant: before.grant, reason: before.reason, expiresAt: before.expiresAt } : null,
        after: { id: created.id, grant: created.grant, reason: created.reason, expiresAt: created.expiresAt },
        extra: { moduleSlug, targetUserId: id },
        ipAddress: request.ip,
      }, request);
      return { override: created };
    },
  );

  app.delete<{ Params: { id: string; overrideId: string } }>(
    '/v1/platform/users/:id/module-overrides/:overrideId',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const admin = (request as any).user;
      const { id, overrideId } = request.params;
      const [ov] = await db.select().from(entitlementOverrides).where(eq(entitlementOverrides.id, overrideId)).limit(1);
      if (!ov || ov.userId !== id) {
        return reply.code(404).send({ error: 'Override not found', code: 'OVERRIDE_NOT_FOUND' });
      }
      await db.delete(entitlementOverrides).where(eq(entitlementOverrides.id, overrideId));
      await writeAudit({
        actorUserId: admin.id,
        targetType: 'entitlement_override',
        targetId: overrideId,
        action: 'module_override_removed',
        before: { id: ov.id, grant: ov.grant, reason: ov.reason, expiresAt: ov.expiresAt, moduleId: ov.moduleId },
        extra: { targetUserId: id },
        ipAddress: request.ip,
      }, request);
      return { ok: true };
    },
  );
}
