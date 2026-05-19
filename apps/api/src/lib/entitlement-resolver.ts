/**
 * Task #108 — Unified entitlement resolver (SPEC-ALIGNED shape).
 *
 * `resolveEntitlements(userId, tenantId)` is the SINGLE function every
 * surface (internal /me, S2S introspect, SSO JWT claim builder, downstream
 * webhook payload) consults. It composes existing primitives:
 *   - getActiveSubscription / subscription_plans   (subscription)
 *   - getUserModules / hasModuleAccess             (per-module access)
 *   - plan_modules.feature_flags_json              (feature defaults)
 *   - tenant_modules.metadata.features             (per-tenant overrides)
 *   - tenant_users / tenant_user_module_access     (roles)
 *   - PLAN_CONFIGS                                  (limits, capabilities)
 *
 * Returns the spec-shaped payload:
 *   { version, computedAt, tenant, user, subscription, modules[], limits,
 *     capabilities }
 * with each module entry carrying `enabled`, `accessLevel`, `moduleRole`,
 * and merged `features`.
 */

import { db } from '../db.js';
import { eq, and, inArray } from 'drizzle-orm';
import {
  users, subscriptions, subscriptionPlans,
  tenants, tenantUsers, tenantModules, tenantUserModuleAccess,
  modules, planModules,
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

export type ModuleFeatureMap = Record<string, boolean | number | string>;

export interface EntitlementModuleEntry {
  slug: string;
  name: string;
  baseUrl: string;
  status: string;
  /** TRUE iff the user can launch this module right now (final answer). */
  enabled: boolean;
  /** Internal column value (none|user|manager) — kept for back-compat. */
  accessLevel: InternalModuleAccessLevel;
  /** Public alias (module_admin|module_user|viewer|none). */
  moduleRole: PublicModuleRole;
  /** Merged feature flags: plan_modules.feature_flags_json overlaid with
   *  tenant_modules.metadata.features. Empty object if neither configured. */
  features: ModuleFeatureMap;
  /** How the user got access: 'plan' | 'addon' | 'override' | 'admin_role' | null */
  source: 'plan' | 'addon' | 'override' | 'admin_role' | null;
}

export interface EntitlementSnapshot {
  version: typeof ENTITLEMENT_SNAPSHOT_VERSION;
  computedAt: string;
  tenant: {
    id: string;
    slug: string;
    name: string;
    type: 'personal' | 'company';
    /** Internal role value owner|admin|member, or null if super_admin viewing without membership. */
    role: InternalTenantRole | null;
    /** Public alias (owner|tenant_admin|billing_admin|user|viewer). */
    roleAlias: PublicTenantRole;
    /** True when access comes from platform super_admin (no membership row required). */
    viaPlatformRole: boolean;
  };
  user: {
    id: string;
    email: string;
    platformRole: string;
  };
  subscription: {
    status: string | null;
    planSlug: string;
    planName: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  modules: EntitlementModuleEntry[];
  limits: Record<string, number | boolean>;
  capabilities: Record<string, boolean>;
}

/**
 * Resolve a single snapshot for one (user, tenant) pair.
 * Throws if the user doesn't exist; returns null if the tenant doesn't
 * exist OR the user isn't a member AND isn't a platform super_admin.
 */
export async function resolveEntitlements(
  userId: string,
  tenantId: string,
): Promise<EntitlementSnapshot | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error(`User ${userId} not found`);

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return null;

  const [member] = await db.select().from(tenantUsers)
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, userId)))
    .limit(1);
  const isSuper = user.platformRole === 'super_admin';
  if (!member && !isSuper) return null;

  const internalRole: InternalTenantRole | null = (member?.role as InternalTenantRole) ?? null;
  const roleAlias: PublicTenantRole = internalRole
    ? tenantRoleToPublic(internalRole)
    : 'viewer';

  // Subscription block — source of truth for the user's plan today.
  const sub = await getActiveSubscription(userId);
  let subBlock: EntitlementSnapshot['subscription'] = null;
  let activePlanId: string | null = null;
  if (sub) {
    const [planRow] = await db.select().from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, sub.planId)).limit(1);
    if (planRow) {
      activePlanId = planRow.id;
      subBlock = {
        status: sub.status,
        planSlug: planRow.slug,
        planName: planRow.name,
        currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
        cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
      };
    }
  }

  // Module access (canonical decision).
  const summaries = await getUserModules(userId, tenantId);

  // Per-user explicit grants.
  const grants = await db.select().from(tenantUserModuleAccess)
    .where(and(
      eq(tenantUserModuleAccess.tenantId, tenantId),
      eq(tenantUserModuleAccess.userId, userId),
    ));
  const allModules = await db.select().from(modules);
  const modBySlug = new Map(allModules.map(m => [m.slug, m]));
  const modById = new Map(allModules.map(m => [m.id, m]));
  const grantBySlug = new Map<string, InternalModuleAccessLevel>();
  for (const g of grants) {
    const mod = modById.get(g.moduleId);
    if (mod) grantBySlug.set(mod.slug, g.accessLevel as InternalModuleAccessLevel);
  }

  // Tenant-level module rows (allowAllMembers, metadata overrides).
  const tms = await db.select().from(tenantModules)
    .where(eq(tenantModules.tenantId, tenantId));
  const tmByModuleId = new Map(tms.map(tm => [tm.moduleId, tm]));

  // Plan feature defaults: the tenant's modules are unlocked by the
  // TENANT OWNER's plan, so every member sees the same plan-side feature
  // defaults regardless of their personal subscription. Fall back to the
  // calling user's plan only when there is no distinct owner sub.
  const planFeatureByModuleId = new Map<string, ModuleFeatureMap>();
  let featurePlanId: string | null = activePlanId;
  if (tenant.ownerUserId && tenant.ownerUserId !== userId) {
    const ownerSub = await getActiveSubscription(tenant.ownerUserId);
    if (ownerSub?.planId) featurePlanId = ownerSub.planId;
  }
  if (featurePlanId) {
    const pmRows = await db.select().from(planModules)
      .where(eq(planModules.planId, featurePlanId));
    for (const pm of pmRows) {
      if (pm.featureFlagsJson) planFeatureByModuleId.set(pm.moduleId, pm.featureFlagsJson);
    }
  }

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

    // Merge features: plan defaults first, then per-tenant overrides.
    const planFeatures = mod ? (planFeatureByModuleId.get(mod.id) ?? {}) : {};
    const tm = mod ? tmByModuleId.get(mod.id) : undefined;
    const tenantOverride = (tm?.metadata?.features ?? {}) as ModuleFeatureMap;
    const features: ModuleFeatureMap = { ...planFeatures, ...tenantOverride };

    return {
      slug: s.module.slug,
      name: s.module.name,
      baseUrl: s.module.baseUrl,
      status: s.module.status,
      enabled: s.unlocked,
      accessLevel: level,
      moduleRole,
      features,
      source: s.access_source,
    };
  });

  const { config } = await getUserPlanConfig(userId);
  const limits: Record<string, number | boolean> = { ...config.limits };
  const capabilities: Record<string, boolean> = { ...config.features };

  return {
    version: ENTITLEMENT_SNAPSHOT_VERSION,
    computedAt: new Date().toISOString(),
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      type: tenant.type as 'personal' | 'company',
      role: internalRole,
      roleAlias,
      viaPlatformRole: !member && isSuper,
    },
    user: {
      id: user.id,
      email: user.email,
      platformRole: user.platformRole ?? 'user',
    },
    subscription: subBlock,
    modules: moduleEntries,
    limits,
    capabilities,
  };
}

/** Convenience helper for callers that need a list of currently-enabled module slugs. */
export function enabledModuleSlugs(snap: EntitlementSnapshot): string[] {
  return snap.modules.filter(m => m.enabled).map(m => m.slug);
}
