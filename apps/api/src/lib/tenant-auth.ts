/**
 * Gate 1 — Tenant RBAC & request-context resolution.
 *
 * Two distinct authority axes:
 *   1. PLATFORM   — `users.platform_role` ('super_admin' | 'user').
 *                   Only super_admin may reach platform-only routes.
 *   2. TENANT     — `tenant_users.role` ('owner' | 'admin' | 'member' | 'viewer').
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
 * Tenant context helpers read tenant rows and membership rows through a
 * per-request cache attached to the
 * Fastify request object via a Symbol key. Chained pre-handlers (e.g.
 * `[authenticate, requireTenantMember, requireTenantModuleAccess('foo')]`)
 * and route handlers calling the helpers explicitly share the same cache,
 * so each row is loaded at most once per request. Module entitlement
 * decisions are centralized in `tenant-entitlements.ts`.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { tenants, tenantUsers, modules, addonSubscriptions } from '../schema.js';
import { authenticate } from './auth.js';
import { isAddonPurchasable } from './billing-service.js';
import { hasPlatformAdminAuthority } from './rbac.js';
import { tenantRoleToEffective } from './role-aliases.js';
import {
  TenantEntitlementError,
  requireTenantModuleAccess as requireTenantModuleAccessDecision,
} from './tenant-entitlements.js';

export type TenantRoleRank = -1 | 0 | 1 | 2; // viewer | member | admin | owner
export type TenantRole = 'owner' | 'admin' | 'member' | 'viewer';
export const TENANT_ROLE_RANK: Record<TenantRole, TenantRoleRank> = {
  viewer: -1,
  member: 0,
  admin: 1,
  owner: 2,
};

export type TenantStatus = 'active' | 'suspended' | 'archived';

export interface EffectiveTenantAuthority {
  role: TenantRole;
  membershipRole: TenantRole | null;
  viaPlatformRole: boolean;
}

/** Keep persisted membership visible while applying platform authority consistently. */
export function resolveEffectiveTenantAuthority(
  membershipRole: TenantRole | null,
  isPlatformAdmin: boolean,
): EffectiveTenantAuthority | null {
  if (!membershipRole && !isPlatformAdmin) return null;
  return {
    role: isPlatformAdmin ? 'owner' : membershipRole!,
    membershipRole,
    viaPlatformRole: isPlatformAdmin,
  };
}

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantType: 'personal' | 'company';
  /** Effective role used for authorization. Platform admins are always owner-equivalent. */
  role: TenantRole;
  /** The persisted tenant membership role, when one exists, retained for audit context. */
  membershipRole: TenantRole | null;
  /** True when platform authority affected the authorization decision. */
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
}

function cacheFor(request: FastifyRequest): RequestCache {
  const r = request as any;
  if (!r[CACHE_KEY]) {
    r[CACHE_KEY] = {
      tenantById: new Map(),
      membership: new Map(),
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
  const requestedTenantId = params.tenantId || headerTenantId || null;
  const sessionTenantId = (request as any).authSession?.sessionType === 'module'
    ? (request as any).authSession.tenantId as string
    : null;
  if (sessionTenantId && requestedTenantId && requestedTenantId !== sessionTenantId) {
    (request as any).sessionTenantMismatch = true;
    c.context = null;
    return null;
  }
  const tenantId = sessionTenantId || requestedTenantId || user.currentTenantId || null;
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
  const isSuper = hasPlatformAdminAuthority(user);

  if (tenantStatus === 'archived' && !isSuper) {
    c.context = null;
    return null;
  }

  const membership = await loadMembership(request, tenant.id, user.id);
  if (membership) {
    const membershipRole = tenantRoleToEffective(membership.role);
    const authority = resolveEffectiveTenantAuthority(membershipRole, isSuper)!;
    const ctx: TenantContext = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantType: tenant.type as 'personal' | 'company',
      // Keep the real membership for audit, but never let a low tenant role
      // accidentally strip authority from a platform super-admin.
      ...authority,
      status: tenantStatus,
      suspended: tenantStatus === 'suspended' && !isSuper,
    };
    c.context = ctx;
    return ctx;
  }

  if (isSuper) {
    const authority = resolveEffectiveTenantAuthority(null, true)!;
    // Super admins get a synthetic 'owner' role for inspection purposes,
    // but `viaPlatformRole` flags the bypass for audit logging.
    const ctx: TenantContext = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantType: tenant.type as 'personal' | 'company',
      ...authority,
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
  if (!hasPlatformAdminAuthority(user)) {
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

function denySessionTenantMismatch(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!(request as any).sessionTenantMismatch) return false;
  reply.code(403).send({
    error: 'This module session is bound to a different tenant',
    code: 'SESSION_TENANT_MISMATCH',
  });
  return true;
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
      if (denySessionTenantMismatch(request, reply)) return;
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
    const viewerReadAllowed = ctx.role === 'viewer'
      && min === 'member'
      && (request.method === 'GET' || request.method === 'HEAD');
    if (ctx.role === 'viewer' && min === 'member' && !viewerReadAllowed) {
      reply.code(403).send({
        error: 'Read-only tenant access cannot modify tenant data',
        code: 'TENANT_WRITE_ACCESS_REQUIRED',
        currentRole: ctx.role,
      });
      return;
    }
    if (!viewerReadAllowed && TENANT_ROLE_RANK[ctx.role] < TENANT_ROLE_RANK[min]) {
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
 * Super admins bypass tenant grants, but never the platform-wide module
 * disabled/archive kill switch enforced by the central resolver.
 */
export function requireTenantModuleAccess(moduleSlug: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    const user = (request as any).user;
    const sessionModuleId = (request as any).authSession?.sessionType === 'module'
      ? (request as any).authSession.moduleId as string
      : null;
    if (sessionModuleId && sessionModuleId !== moduleSlug) {
      reply.code(403).send({
        error: 'This module session is bound to a different module',
        code: 'SESSION_MODULE_MISMATCH',
      });
      return;
    }
    const ctx = await resolveTenantContext(request);
    if (!ctx) {
      if (denySessionTenantMismatch(request, reply)) return;
      return denyTenantNotFound(reply);
    }

    // Gate 2: launching ANY module inside a suspended tenant is blocked
    // for non-super-admins (matches read/write block in requireTenantRole).
    if (ctx.suspended && !hasPlatformAdminAuthority(user)) {
      reply.code(403).send({
        error: 'Tenant is suspended. Contact platform administrator.',
        code: 'TENANT_SUSPENDED',
      });
      return;
    }

    try {
      const decision = await requireTenantModuleAccessDecision(request, ctx.tenantId, moduleSlug);
      (request as any).tenantContext = ctx;
      (request as any).tenantModuleAccessLevel = decision.accessLevel;
      return;
    } catch (err) {
      if (err instanceof TenantEntitlementError) {
        reply.code(err.statusCode).send({
          error: err.message,
          code: err.code,
          moduleSlug,
          ...err.payload,
        });
        return;
      }
      throw err;
    }

  };
}

/**
 * Mutation guard for module routes. It must run after
 * `requireTenantModuleAccess(...)`, which records the effective access level
 * on the request. A `viewer` grant is intentionally launch/read capable but
 * never write capable.
 */
export async function requireTenantModuleWriteAccess(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const ctx = (request as any).tenantContext as TenantContext | undefined;
  if (ctx?.membershipRole === 'viewer' && !ctx.viaPlatformRole) {
    reply.code(403).send({
      error: 'Read-only tenant access cannot modify module data',
      code: 'TENANT_WRITE_ACCESS_REQUIRED',
      currentRole: 'viewer',
    });
    return;
  }
  const accessLevel = (request as any).tenantModuleAccessLevel as string | undefined;
  if (accessLevel === 'viewer') {
    reply.code(403).send({
      error: 'Read-only module access cannot modify module data',
      code: 'TENANT_MODULE_WRITE_ACCESS_REQUIRED',
      currentAccessLevel: accessLevel,
    });
    return;
  }
  if (!accessLevel || accessLevel === 'none') {
    reply.code(403).send({
      error: 'Write-capable module access is required',
      code: 'TENANT_MODULE_WRITE_ACCESS_REQUIRED',
      currentAccessLevel: accessLevel ?? 'none',
    });
  }
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
  const tenantRole = tenantRoleToEffective(membership.role);
  if (tenantRole !== 'owner' && tenantRole !== 'admin') {
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
  return { allowed: true, tenantRole };
}
