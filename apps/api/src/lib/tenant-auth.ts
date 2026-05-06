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
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { tenants, tenantUsers, tenantModules, tenantUserModuleAccess, modules, addonSubscriptions } from '../schema.js';
import { authenticate } from './auth.js';
import { isAddonPurchasable } from './billing-service.js';

export type TenantRoleRank = 0 | 1 | 2; // member | admin | owner
export const TENANT_ROLE_RANK: Record<'member' | 'admin' | 'owner', TenantRoleRank> = {
  member: 0,
  admin: 1,
  owner: 2,
};

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantType: 'personal' | 'company';
  role: 'owner' | 'admin' | 'member';
  /** Set when access was granted via super_admin override (membership not required). */
  viaPlatformRole: boolean;
}

/**
 * Resolve the tenant a request is acting in. Returns null when no tenant id
 * could be found (no path param, no header, no `current_tenant_id`).
 *
 * Verifies the authenticated user is a member of the resolved tenant.
 * Super admins bypass the membership check (they need to inspect any tenant).
 */
export async function resolveTenantContext(request: FastifyRequest): Promise<TenantContext | null> {
  const user = (request as any).user;
  if (!user) return null;

  const params = (request.params ?? {}) as Record<string, string | undefined>;
  const headerVal = request.headers['x-tenant-id'];
  const headerTenantId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  const tenantId = params.tenantId || headerTenantId || user.currentTenantId || null;
  if (!tenantId) return null;

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return null;

  const [membership] = await db.select().from(tenantUsers)
    .where(and(eq(tenantUsers.tenantId, tenant.id), eq(tenantUsers.userId, user.id)))
    .limit(1);

  if (membership) {
    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantType: tenant.type as 'personal' | 'company',
      role: membership.role as 'owner' | 'admin' | 'member',
      viaPlatformRole: false,
    };
  }

  if (user.platformRole === 'super_admin') {
    // Super admins get a synthetic 'owner' role for inspection purposes,
    // but `viaPlatformRole` flags the bypass for audit logging.
    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantType: tenant.type as 'personal' | 'company',
      role: 'owner',
      viaPlatformRole: true,
    };
  }

  return null;
}

/**
 * Pre-handler: require the caller to be a platform super_admin.
 * Returns 403 PLATFORM_ROLE_REQUIRED (this is an authority assertion,
 * not a "resource not found" — the route exists for super admins).
 */
export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return;
  const user = (request as any).user;
  if (user.platformRole !== 'super_admin') {
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

    if (user.platformRole === 'super_admin') {
      (request as any).tenantContext = ctx;
      return;
    }

    const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
    if (!mod) {
      reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND', moduleSlug });
      return;
    }

    const [tm] = await db.select().from(tenantModules)
      .where(and(eq(tenantModules.tenantId, ctx.tenantId), eq(tenantModules.moduleId, mod.id)))
      .limit(1);
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
    const [acc] = await db.select().from(tenantUserModuleAccess)
      .where(and(
        eq(tenantUserModuleAccess.tenantId, ctx.tenantId),
        eq(tenantUserModuleAccess.userId, user.id),
        eq(tenantUserModuleAccess.moduleId, mod.id),
      ))
      .limit(1);

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
 * Billing precondition: returns 409 when the tenant already has an active
 * add-on for this module (prevents double-charging). Caller is responsible
 * for the actual purchase flow; this helper is a pre-flight assertion.
 */
export async function canPurchaseAddon(tenantId: string, moduleSlug: string): Promise<{ allowed: true } | { allowed: false; code: string; reason: string }> {
  const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
  if (!mod) return { allowed: false, code: 'MODULE_NOT_FOUND', reason: 'Unknown module' };
  if (!isAddonPurchasable(moduleSlug)) {
    return { allowed: false, code: 'ADDON_NOT_PURCHASABLE', reason: 'No Stripe price configured for this add-on in this environment' };
  }
  const existing = await db.select().from(addonSubscriptions)
    .where(and(eq(addonSubscriptions.tenantId, tenantId), eq(addonSubscriptions.moduleId, mod.id)));
  const live = existing.find(r => ['active', 'trialing'].includes(r.status));
  if (live) {
    return { allowed: false, code: 'ADDON_ALREADY_ACTIVE', reason: 'Tenant already has an active add-on for this module' };
  }
  return { allowed: true };
}
