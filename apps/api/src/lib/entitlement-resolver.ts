/**
 * Task #108 — Unified entitlement resolver.
 *
 * `resolveEntitlements(userId, tenantId)` is the SINGLE function every
 * surface (internal /me, S2S introspect, SSO JWT claim builder, downstream
 * webhook payload) consults. It composes the existing primitives:
 *   - getActiveSubscription / subscription_plans   (plan)
 *   - hasModuleAccess / getUserModules             (per-module access)
 *   - tenant_users / tenant_user_module_access     (roles)
 *   - PLAN_CONFIGS                                  (limits, capabilities)
 *
 * Output is a versioned, JSON-serializable snapshot suitable for transport.
 * The shape is intentionally flat and translation-friendly: every role
 * value carries both the internal token AND the public alias, so older
 * receivers keep working while new receivers consume the alias.
 */

import { db } from '../db.js';
import { eq, and } from 'drizzle-orm';
import {
  users, subscriptions, subscriptionPlans,
  tenants, tenantUsers, tenantModules, tenantUserModuleAccess, modules,
} from '../schema.js';
import {
  getActiveSubscription, getUserModules,
} from './entitlement-service.js';
import { getUserPlanConfig } from './plans.js';
import {
  tenantRoleToPublic, moduleAccessLevelToPublic,
  type InternalTenantRole, type PublicTenantRole,
  type InternalModuleAccessLevel, type PublicModuleRole,
} from './role-aliases.js';

export const ENTITLEMENT_SNAPSHOT_VERSION = 1 as const;

export interface EntitlementModuleEntry {
  slug: string;
  name: string;
  base_url: string;
  status: string;
  /** Final has-access decision from the canonical hasModuleAccess(). */
  has_access: boolean;
  /** How the user got access: 'plan' | 'addon' | 'override' | 'admin_role' | null */
  source: 'plan' | 'addon' | 'override' | 'admin_role' | null;
  /** Internal column value (none|user|manager) — kept for back-compat. */
  access_level: InternalModuleAccessLevel;
  /** Public alias (module_admin|module_user|viewer|none). */
  module_role: PublicModuleRole;
  /** Convenience: receivers can match on either value. */
  module_role_alias: PublicModuleRole;
}

export interface EntitlementSnapshot {
  version: typeof ENTITLEMENT_SNAPSHOT_VERSION;
  computed_at: string;
  user: {
    id: string;
    email: string;
    platform_role: string;
  };
  tenant: {
    id: string;
    slug: string;
    name: string;
    type: 'personal' | 'company';
    /** Internal role value owner|admin|member, or null if super_admin viewing without membership. */
    role: InternalTenantRole | null;
    /** Public alias (owner|tenant_admin|billing_admin|user|viewer). */
    role_alias: PublicTenantRole;
    /** True when access comes from platform super_admin (no membership row required). */
    via_platform_role: boolean;
  };
  plan: {
    slug: string;
    name: string;
    status: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
  modules: EntitlementModuleEntry[];
  limits: Record<string, number | boolean>;
  capabilities: Record<string, boolean>;
}

/**
 * Resolve a single snapshot for one (user, tenant) pair.
 * Throws if the user doesn't exist; returns null if the tenant doesn't exist.
 */
export async function resolveEntitlements(
  userId: string,
  tenantId: string,
): Promise<EntitlementSnapshot | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error(`User ${userId} not found`);

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return null;

  // Role: prefer membership row; super_admin without membership is allowed
  // (matches resolveTenantContext semantics) but tenant.role is reported
  // as null so downstream tools can distinguish observer vs member.
  const [member] = await db.select().from(tenantUsers)
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, userId)))
    .limit(1);
  const isSuper = user.platformRole === 'super_admin';
  if (!member && !isSuper) {
    // User is not a member of this tenant and not super_admin — treated as
    // "no entitlements in this tenant".
    return null;
  }
  const internalRole: InternalTenantRole | null = (member?.role as InternalTenantRole) ?? null;
  const roleAlias: PublicTenantRole = internalRole
    ? tenantRoleToPublic(internalRole)
    : 'viewer';

  // Plan: source-of-truth is the user's active subscription (today, plan
  // is per-user; tenant-scoped billing is a separate follow-up). We
  // duplicate the slug into the snapshot so receivers don't have to call
  // the legacy /v1/billing/subscription endpoint.
  const sub = await getActiveSubscription(userId);
  let planBlock: EntitlementSnapshot['plan'] = null;
  if (sub) {
    const [planRow] = await db.select().from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, sub.planId)).limit(1);
    if (planRow) {
      planBlock = {
        slug: planRow.slug,
        name: planRow.name,
        status: sub.status,
        current_period_end: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
        cancel_at_period_end: !!sub.cancelAtPeriodEnd,
      };
    }
  }

  // Modules: lean on the existing getUserModules() so the access decision
  // matches every other call site (launchpad, marketplace, requireModuleAccess).
  // Per-user access_level is read from tenant_user_module_access; if absent
  // we derive a default from the tenant_modules row (allow_all → 'user').
  const summaries = await getUserModules(userId, tenantId);
  const grants = await db.select().from(tenantUserModuleAccess)
    .where(and(
      eq(tenantUserModuleAccess.tenantId, tenantId),
      eq(tenantUserModuleAccess.userId, userId),
    ));
  const grantBySlug = new Map<string, InternalModuleAccessLevel>();
  const allModules = await db.select().from(modules);
  const modBySlug = new Map(allModules.map(m => [m.slug, m]));
  for (const g of grants) {
    const mod = allModules.find(m => m.id === g.moduleId);
    if (mod) grantBySlug.set(mod.slug, g.accessLevel as InternalModuleAccessLevel);
  }
  const tms = await db.select().from(tenantModules).where(eq(tenantModules.tenantId, tenantId));
  const tmByModuleId = new Map(tms.map(tm => [tm.moduleId, tm]));

  const moduleEntries: EntitlementModuleEntry[] = summaries.map(s => {
    const mod = modBySlug.get(s.module.slug);
    let level: InternalModuleAccessLevel = grantBySlug.get(s.module.slug) ?? 'none';
    if (!grantBySlug.has(s.module.slug) && mod) {
      const tm = tmByModuleId.get(mod.id);
      if (tm?.allowAllMembers && s.unlocked) level = 'user';
      if (isSuper && s.unlocked) level = 'manager';
    }
    if (!s.unlocked) level = 'none';
    const moduleRole = moduleAccessLevelToPublic(level);
    return {
      slug: s.module.slug,
      name: s.module.name,
      base_url: s.module.baseUrl,
      status: s.module.status,
      has_access: s.unlocked,
      source: s.access_source,
      access_level: level,
      module_role: moduleRole,
      module_role_alias: moduleRole,
    };
  });

  // Limits + capabilities come from the plan config table so we present
  // them next to the plan slug instead of forcing downstream code to
  // re-derive them.
  const { config } = await getUserPlanConfig(userId);
  const limits: Record<string, number | boolean> = { ...config.limits };
  const capabilities: Record<string, boolean> = { ...config.features };

  return {
    version: ENTITLEMENT_SNAPSHOT_VERSION,
    computed_at: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      platform_role: user.platformRole ?? 'user',
    },
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      type: tenant.type as 'personal' | 'company',
      role: internalRole,
      role_alias: roleAlias,
      via_platform_role: !member && isSuper,
    },
    plan: planBlock,
    modules: moduleEntries,
    limits,
    capabilities,
  };
}
