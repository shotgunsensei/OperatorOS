/**
 * Gate 1 — Tenant RBAC & request-context resolution.
 *
 * Two distinct authority axes:
 *   1. PLATFORM   — `users.platform_role` ('super_admin' | 'user').
 *                   Only super_admin may reach platform-only routes.
 *   2. TENANT     — `tenant_users.role` ('owner' | 'admin' | 'member').
 *                   Scoped to one tenant.
 *
 * Tenant context resolution precedence (per request):
 *   1. `:tenantId` URL path parameter
 *   2. `X-Tenant-Id` request header
 *   3. `users.current_tenant_id`
 *
 * Membership is verified for every resolved context. Cross-tenant access
 * returns 404 (never 403) so we don't leak tenant existence to outsiders.
 *
 * REQUEST-SCOPED CACHE
 * --------------------
 * All helpers in this module read tenant rows, membership rows, module
 * rows, and module access rows through a per-request cache attached to the
 * Fastify request object via a Symbol key. Chained pre-handlers (e.g.
 * `[authenticate, requireTenantMember, requireTenantModuleAccess('foo')]`)
 * and route handlers calling the helpers explicitly all share the same
 * cache, so each row is loaded at most once per request.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { tenants, tenantUsers, tenantModules, tenantUserModuleAccess, modules, addonSubscriptions } from '../schema.js';
import { authenticate } from './auth.js';
import { isAddonPurchasable } from './billing-service.js';
import { isSuperAdmin } from './rbac.js';

export type TenantRoleRank = 0 | 1 | 2; // member | admin | owner
export const TENANT_ROLE_RANK: Record<'member' | 'admin' | 'owner', TenantRoleRank> = {
  member: 0,
  admin: 1,
  owner: 2,
};

export type TenantStatus = 'active' | 'suspended' | 'archived';

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantType: 'personal' | 'company';
  role: 'owner' | 'admin' | 'member';
  /** True when access was granted via super_admin override (membership not required). */
  viaPlatformRole: boolean;
  status: TenantStatus;
  /** True when tenant is suspended and caller is not super_admin. */
  suspended: boolean;
}

// ---------------------------------------------------------------------------
// Request-scoped cache
// ---------------------------------------------------------------------------

const CACHE_KEY = Symbol.for('operatoros.tenantAuthCache');

interface RequestCache {
  /** Cached resolveTenantContext() result; `null` means "already resolved to nothing". */
  context?: TenantContext | null;
  tenantById: Map<string, any | null>;
  membership: Map<string, any | null>;          // key = `${tenantId}:${userId}`
  moduleBySlug: Map<string, any | null>;
  tenantModule: Map<string, any | null>;        // key = `${tenantId}:${moduleId}`
  userModuleAccess: Map<string, any | null>;    // key = `${tenantId}:${userId}:${moduleId}`
}

function cacheFor(request: FastifyRequest): RequestCache {
  const r = request as any;
  if (!r[CACHE_KEY]) {
    r[CACHE_KEY] = {
      tenantById: new Map(),
      membership: new Map(),
      moduleBySlug: new Map(),
      tenantModule: new Map(),
      userModuleAccess: new Map(),
    } as RequestCache;
  }
  return r[CACHE_KEY] as RequestCache;
}

async function loadTenant(request: FastifyRequest, tenantId: string) {
  const c = cacheFor(request);
  if (c.tenantById.has(tenantId)) return c.tenantById.get(tenantId);
  const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  c.tenantById.set(tenantId, row ?? null);
  return row ?? null;
}

async function loadMembership(request: FastifyRequest, tenantId: string, userId: string) {
  const c = cacheFor(request);
  const key = `${tenantId}:${userId}`;
  if (c.membership.has(key)) return c.membership.get(key);
  const [row] = await db.select().from(tenantUsers)
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, userId)))
    .limit(1);
  c.membership.set(key, row ?? null);
  return row ?? null;
}

async function loadModuleBySlug(request: FastifyRequest, slug: string) {
  const c = cacheFor(request);
  if (c.moduleBySlug.has(slug)) return c.moduleBySlug.get(slug);
  const [row] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
  c.moduleBySlug.set(slug, row ?? null);
  return row ?? null;
}

async function loadTenantModule(request: FastifyRequest, tenantId: string, moduleId: string) {
  const c = cacheFor(request);
  const key = `${tenantId}:${moduleId}`;
  if (c.tenantModule.has(key)) return c.tenantModule.get(key);
  const [row] = await db.select().from(tenantModules)
    .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleId, moduleId)))
    .limit(1);
  c.tenantModule.set(key, row ?? null);
  return row ?? null;
}

async function loadUserModuleAccess(request: FastifyRequest, tenantId: string, userId: string, moduleId: string) {
  const c = cacheFor(request);
  const key = `${tenantId}:${userId}:${moduleId}`;
  if (c.userModuleAccess.has(key)) return c.userModuleAccess.get(key);
  const [row] = await db.select().from(tenantUserModuleAccess)
    .where(and(
      eq(tenantUserModuleAccess.tenantId, tenantId),
      eq(tenantUserModuleAccess.userId, userId),
      eq(tenantUserModuleAccess.moduleId, moduleId),
    ))
    .limit(1);
  c.userModuleAccess.set(key, row ?? null);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Tenant context resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the tenant a request is acting in. Returns null when no tenant id
 * could be found (no path param, no header, no `current_tenant_id`).
 *
 * Verifies the authenticated user is a member of the resolved tenant.
 * Super admins bypass the membership check (they need to inspect any tenant).
 *
 * Result is memoized on the request — calling this twice in one request
 * (for example by chained pre-handlers) only hits the database once.
 */
export async function resolveTenantContext(request: FastifyRequest): Promise<TenantContext | null> {
  const c = cacheFor(request);
  if (c.context !== undefined) return c.context;

  const user = (request as any).user;
  if (!user) {
    c.context = null;
    return null;
  }

  const params = (request.params ?? {}) as Record<string, string | undefined>;
  const headerVal = request.headers['x-tenant-id'];
  const headerTenantId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  const tenantId = params.tenantId || headerTenantId || user.currentTenantId || null;
  if (!tenantId) {
    c.context = null;
    return null;
  }

  const tenant = await loadTenant(request, tenantId);
  if (!tenant) {
    c.context = null;
    return null;
  }

  // Gate 2: archived tenants are invisible to everyone except super_admin
  // (who needs visibility for forensic / restore operations). For everyone
  // else they collapse to the same TENANT_NOT_FOUND code as a missing row.
  const tenantStatus = (tenant.status ?? 'active') as TenantStatus;
  const isSuper = isSuperAdmin(user.platformRole);

  if (tenantStatus === 'archived' && !isSuper) {
    c.context = null;
    return null;
  }

  const membership = await loadMembership(request, tenant.id, user.id);
  if (membership) {
    const ctx: TenantContext = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantType: tenant.type as 'personal' | 'company',
      role: membership.role as 'owner' | 'admin' | 'member',
      viaPlatformRole: false,
      status: tenantStatus,
      suspended: tenantStatus === 'suspended' && !isSuper,
    };
    c.context = ctx;
    return ctx;
  }

  if (isSuper) {
    // Super admins get a synthetic 'owner' role for inspection purposes,
    // but `viaPlatformRole` flags the bypass for audit logging.
    const ctx: TenantContext = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantType: tenant.type as 'personal' | 'company',
      role: 'owner',
      viaPlatformRole: true,
      status: tenantStatus,
      suspended: false,
    };
    c.context = ctx;
    return ctx;
  }

  c.context = null;
  return null;
}

// ---------------------------------------------------------------------------
// Pre-handlers
// ---------------------------------------------------------------------------

/**
 * Pre-handler: require the caller to be a platform super_admin.
 * Returns 403 PLATFORM_ROLE_REQUIRED (this is an authority assertion,
 * not a "resource not found" — the route exists for super admins).
 */
export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return;
  const user = (request as any).user;
  if (!isSuperAdmin(user.platformRole)) {
    reply.code(403).send({
      error: 'Platform super-admin role required',
      code: 'PLATFORM_ROLE_REQUIRED',
    });
  }
}

function denyTenantNotFound(reply: FastifyReply) {
  // Cross-tenant + missing tenant collapse to 404 to avoid leaking
  // existence of tenants the caller cannot see.
  reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
}

/**
 * Pre-handler factory: require the caller to be a tenant member with at
 * least the given role. Returns 404 (not 403) when the user is not a
 * member of the tenant, so existence is never leaked.
 */
export function requireTenantRole(min: 'owner' | 'admin' | 'member') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    const ctx = await resolveTenantContext(request);
    if (!ctx) {
      return denyTenantNotFound(reply);
    }
    // Gate 2: a suspended tenant blocks all member operations (super_admin
    // bypasses via viaPlatformRole and never gets `suspended:true` set).
    if (ctx.suspended) {
      reply.code(403).send({
        error: 'Tenant is suspended. Contact platform administrator.',
        code: 'TENANT_SUSPENDED',
      });
      return;
    }
    if (TENANT_ROLE_RANK[ctx.role] < TENANT_ROLE_RANK[min]) {
      // The user IS a member, just not high enough. 403 is correct here:
      // existence is already known from the membership.
      reply.code(403).send({
        error: `Tenant role '${min}' or higher required`,
        code: 'TENANT_ROLE_INSUFFICIENT',
        currentRole: ctx.role,
        requiredRole: min,
      });
      return;
    }
    (request as any).tenantContext = ctx;
  };
}

export const requireTenantOwner = requireTenantRole('owner');
export const requireTenantAdmin = requireTenantRole('admin');
export const requireTenantMember = requireTenantRole('member');

/**
 * Pre-handler factory: require the caller to have an active access grant
 * on the named module within the active tenant. The module must also be
 * `enabled` / `trial` / `purchased` / `beta` for the tenant.
 * Super admins bypass.
 */
export function requireTenantModuleAccess(moduleSlug: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    const user = (request as any).user;
    const ctx = await resolveTenantContext(request);
    if (!ctx) return denyTenantNotFound(reply);

    // Gate 2: launching ANY module inside a suspended tenant is blocked
    // for non-super-admins (matches read/write block in requireTenantRole).
    if (ctx.suspended && user.platformRole !== 'super_admin') {
      reply.code(403).send({
        error: 'Tenant is suspended. Contact platform administrator.',
        code: 'TENANT_SUSPENDED',
      });
      return;
    }

    if (user.platformRole === 'super_admin') {
      (request as any).tenantContext = ctx;
      (request as any).tenantModuleAccessLevel = 'manager';
      return;
    }

    const mod = await loadModuleBySlug(request, moduleSlug);
    if (!mod) {
      reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND', moduleSlug });
      return;
    }

    const tm = await loadTenantModule(request, ctx.tenantId, mod.id);
    const launchableStatuses = ['enabled', 'trial', 'purchased', 'beta'];
    if (!tm || !launchableStatuses.includes(tm.status)) {
      reply.code(403).send({
        error: 'Module is not enabled for this tenant',
        code: 'TENANT_MODULE_DISABLED',
        moduleSlug,
      });
      return;
    }

    // Resolution order matters here. An explicit grant row with
    // `access_level='none'` MUST override `allowAllMembers` — that's the
    // documented "tenant admin can revoke a single user from a public
    // module" behavior. So we look for an explicit row FIRST.
    const acc = await loadUserModuleAccess(request, ctx.tenantId, user.id, mod.id);

    if (acc) {
      if (acc.accessLevel === 'none') {
        reply.code(403).send({
          error: 'Access to this module has been explicitly revoked for you in this tenant',
          code: 'TENANT_MODULE_ACCESS_DENIED',
          moduleSlug,
        });
        return;
      }
      // 'user' or 'manager' → grant.
      (request as any).tenantContext = ctx;
      (request as any).tenantModuleAccessLevel = acc.accessLevel;
      return;
    }

    // No explicit row — fall back to the tenant-wide opt-in flag.
    if (tm.allowAllMembers) {
      (request as any).tenantContext = ctx;
      (request as any).tenantModuleAccessLevel = 'user';
      return;
    }

    reply.code(403).send({
      error: 'No access grant for this module within the active tenant',
      code: 'TENANT_MODULE_ACCESS_DENIED',
      moduleSlug,
    });
  };
}

/**
 * Billing precondition for a user purchasing an add-on within a tenant.
 *
 * Spec'd contract: `canPurchaseAddon(userId, tenantId, moduleSlug)`.
 * Returns:
 *   - `{ allowed: false, code: 'TENANT_ROLE_INSUFFICIENT' }` when the user
 *     is a tenant member but lacks purchasing authority (must be admin or owner).
 *   - `{ allowed: false, code: 'TENANT_NOT_FOUND' }` when the user is not a
 *     tenant member (404-style — never leak existence).
 *   - `{ allowed: false, code: 'MODULE_NOT_FOUND' }` when the slug is unknown.
 *   - `{ allowed: false, code: 'ADDON_NOT_PURCHASABLE' }` when no Stripe price
 *     is configured in this environment.
 *   - `{ allowed: false, code: 'ADDON_ALREADY_ACTIVE' }` when the tenant
 *     already holds an active/trialing add-on for this module (prevents
 *     double-charging).
 *   - `{ allowed: true, tenantRole }` otherwise.
 *
 * Caller is responsible for the actual purchase flow; this helper is a
 * pre-flight assertion only.
 */
export async function canPurchaseAddon(
  userId: string,
  tenantId: string,
  moduleSlug: string,
): Promise<
  | { allowed: true; tenantRole: 'owner' | 'admin' }
  | { allowed: false; code: string; reason: string }
> {
  const [membership] = await db.select().from(tenantUsers)
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, userId)))
    .limit(1);
  if (!membership) {
    return { allowed: false, code: 'TENANT_NOT_FOUND', reason: 'Tenant not found' };
  }
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return {
      allowed: false,
      code: 'TENANT_ROLE_INSUFFICIENT',
      reason: 'Add-on purchases require tenant admin or owner',
    };
  }

  const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
  if (!mod) return { allowed: false, code: 'MODULE_NOT_FOUND', reason: 'Unknown module' };
  if (!isAddonPurchasable(mod)) {
    return { allowed: false, code: 'ADDON_NOT_PURCHASABLE', reason: 'No Stripe price configured for this add-on in this environment' };
  }
  const existing = await db.select().from(addonSubscriptions)
    .where(and(eq(addonSubscriptions.tenantId, tenantId), eq(addonSubscriptions.moduleId, mod.id)));
  const live = existing.find(r => ['active', 'trialing'].includes(r.status));
  if (live) {
    return { allowed: false, code: 'ADDON_ALREADY_ACTIVE', reason: 'Tenant already has an active add-on for this module' };
  }
  return { allowed: true, tenantRole: membership.role as 'owner' | 'admin' };
}
