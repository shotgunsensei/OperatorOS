import type { FastifyRequest } from 'fastify';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  modules,
  planModules,
  subscriptions,
  tenantApplicationSubscriptions,
  tenantEntitlements,
  tenantModules,
  tenantUserModuleAccess,
  tenantUsers,
  tenants,
  users,
  type ModuleRow,
  type TenantEntitlementRow,
  type TenantModuleRow,
  type TenantRow,
  type TenantUserModuleAccessRow,
  type TenantUserRow,
  type UserRow,
} from '../schema.js';
import {
  MODULE_SAFE_FIELDS,
  TENANT_MODULE_SAFE_FIELDS,
  pickSafe,
  writeAudit,
} from './audit.js';
import {
  isUserWithinTenantSeatLimit,
  tenantHasActiveEntitlement,
} from './product-entitlements.js';
import { hasPlatformAdminAuthority } from './rbac.js';
import { moduleAccessLevelToEffective, tenantRoleToEffective } from './role-aliases.js';
import { resolveCoreSuiteTrialAccess } from './core-suite-trial.js';
import { FREE_WITH_ANY_ACCOUNT } from '@operatoros/sdk';

const FREE_ACCOUNT_MODULE_KEYS = new Set(FREE_WITH_ANY_ACCOUNT.map(app => app.key));
const APPLICATION_STACK_SEAT_STATUSES = ['trialing', 'active', 'past_due', 'canceling'] as const;
const APPLICATION_STACK_SEAT_ENTITLEMENT_TYPES = ['core_product', 'companion_module'] as const;
const APPLICATION_STACK_SEAT_SOURCES = ['stripe', 'selected_free_companion'] as const;

const LAUNCHABLE_TENANT_MODULE_STATUSES = ['enabled', 'trial', 'purchased', 'beta'] as const;
const LAUNCHABLE_GLOBAL_MODULE_STATUSES = new Set(['live', 'active', 'beta']);

export type GlobalModuleUnavailableReason =
  | 'module_archived'
  | 'module_disabled'
  | 'module_unavailable';

/**
 * Resolve the platform-wide module kill switch before tenant/user grants.
 * Platform administrators intentionally do not bypass this control: archived,
 * disabled, hidden, or not-yet-live modules must not mint SSO sessions or serve
 * guarded module APIs.
 */
export function globalModuleUnavailableReason(
  module: Pick<ModuleRow, 'status' | 'archivedAt'>,
): GlobalModuleUnavailableReason | null {
  if (module.archivedAt) return 'module_archived';
  if (LAUNCHABLE_GLOBAL_MODULE_STATUSES.has(module.status)) return null;
  if (['disabled', 'deprecated', 'hidden'].includes(module.status)) return 'module_disabled';
  return 'module_unavailable';
}

export type TenantModuleGrantSource =
  | 'stripe'
  | 'included_with_core'
  | 'selected_free_companion'
  | 'manual'
  | 'admin'
  | 'included'
  | 'addon'
  | 'trial';

export type TenantModuleAccessSource = 'plan' | 'addon' | 'trial' | 'override' | 'admin_role' | null;
export type TenantModuleAccessLevel = 'none' | 'viewer' | 'user' | 'manager';

export interface UserTenantMembership {
  tenant: TenantRow;
  membership: TenantUserRow;
}

export interface TenantEntitlementSummary {
  entitlements: TenantEntitlementRow[];
  modules: TenantModuleRow[];
}

export interface TenantModuleAccessDecision {
  tenantId: string;
  moduleSlug: string;
  moduleId: string | null;
  hasAccess: boolean;
  source: TenantModuleAccessSource;
  reason?: string;
  accessLevel: TenantModuleAccessLevel;
  tenantModule: TenantModuleRow | null;
  userModuleAccess: TenantUserModuleAccessRow | null;
  viaPlatformRole: boolean;
  expiresAt?: Date | null;
}

export class TenantEntitlementError extends Error {
  statusCode: number;
  code: string;
  payload: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = 'TenantEntitlementError';
    this.statusCode = statusCode;
    this.code = code;
    this.payload = payload;
  }
}

function tenantModuleSourceFromGrantSource(source: TenantModuleGrantSource): 'included' | 'addon' | 'trial' | 'admin' {
  if (source === 'stripe' || source === 'addon') return 'addon';
  if (source === 'trial') return 'trial';
  if (source === 'included' || source === 'included_with_core' || source === 'selected_free_companion') return 'included';
  return 'admin';
}

function tenantModuleStatusFromGrantSource(source: TenantModuleGrantSource): 'enabled' | 'trial' | 'purchased' {
  if (source === 'stripe' || source === 'addon') return 'purchased';
  if (source === 'trial') return 'trial';
  return 'enabled';
}

function entitlementSourceFromGrantSource(
  source: TenantModuleGrantSource,
): 'stripe' | 'included_with_core' | 'selected_free_companion' | 'manual' | 'admin' {
  if (source === 'stripe' || source === 'addon') return 'stripe';
  if (source === 'included' || source === 'included_with_core') return 'included_with_core';
  if (source === 'selected_free_companion') return 'selected_free_companion';
  if (source === 'manual' || source === 'trial') return 'manual';
  return 'admin';
}

function entitlementTypeFromGrantSource(
  source: TenantModuleGrantSource,
): 'included_app' | 'companion_module' | 'system' {
  if (source === 'stripe' || source === 'addon' || source === 'selected_free_companion') return 'companion_module';
  if (source === 'included' || source === 'included_with_core') return 'included_app';
  return 'system';
}

function sourceFromTenantModule(tm: TenantModuleRow | null | undefined): TenantModuleAccessSource {
  if (!tm) return 'plan';
  if (tm.status === 'trial' || tm.source === 'trial') return 'trial';
  return tm.status === 'purchased' || tm.source === 'addon' ? 'addon' : 'plan';
}

async function getUserRow(userId: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

async function getTenantRow(tenantId: string): Promise<TenantRow | null> {
  const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return row ?? null;
}

async function resolveModule(moduleId: string): Promise<ModuleRow | null> {
  if (!moduleId) return null;
  const [row] = await db.select().from(modules)
    .where(or(eq(modules.id, moduleId), eq(modules.slug, moduleId)))
    .limit(1);
  return row ?? null;
}

async function getTenantModuleRow(tenantId: string, moduleId: string): Promise<TenantModuleRow | null> {
  const [row] = await db.select().from(tenantModules)
    .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleId, moduleId)))
    .limit(1);
  return row ?? null;
}

async function getUserModuleAccessRow(
  tenantId: string,
  userId: string,
  moduleId: string,
): Promise<TenantUserModuleAccessRow | null> {
  const [row] = await db.select().from(tenantUserModuleAccess)
    .where(and(
      eq(tenantUserModuleAccess.tenantId, tenantId),
      eq(tenantUserModuleAccess.userId, userId),
      eq(tenantUserModuleAccess.moduleId, moduleId),
    ))
    .limit(1);
  return row ?? null;
}

async function ownerPlanGrantsModule(tenant: TenantRow, moduleId: string): Promise<boolean> {
  try {
    const [grant] = await db.select({ planId: subscriptions.planId })
      .from(subscriptions)
      .innerJoin(planModules, eq(planModules.planId, subscriptions.planId))
      .where(and(
        eq(subscriptions.userId, tenant.ownerUserId),
        eq(subscriptions.tenantId, tenant.id),
        sql`${subscriptions.status} IN ('active','trialing')`,
        sql`subscriptions.legacy_access_grandfathered_at IS NOT NULL`,
        eq(planModules.moduleId, moduleId),
      ))
      .orderBy(
        sql`CASE WHEN ${subscriptions.status} IN ('active','trialing') THEN 0 ELSE 1 END`,
        desc(subscriptions.createdAt),
      )
      .limit(1);
    return !!grant;
  } catch (error) {
    const candidate = error as { code?: unknown; cause?: { code?: unknown } } | null;
    // Before v60 introduces the grandfather marker there is no frozen legacy
    // application grant. Deny only that exact pre-release column case.
    if (candidate?.code === '42703' || candidate?.cause?.code === '42703') return false;
    throw error;
  }
}

/**
 * Identify modules whose current tenant grant comes from the forward-sale
 * Application Stack. Only the paid flagship and companion rows consume a
 * seat; the three free-account applications use `included_app` rows and are
 * deliberately excluded even when those rows share the same Stripe
 * subscription linkage.
 *
 * Requiring an exact tenant + Stripe-subscription join prevents a stale,
 * canceled, manual, or legacy entitlement row from introducing a seat gate.
 */
async function moduleConsumesApplicationStackSeat(
  tenantId: string,
  moduleSlug: string,
): Promise<boolean> {
  if (FREE_ACCOUNT_MODULE_KEYS.has(moduleSlug as any)) return false;
  try {
    const [row] = await db.select({ id: tenantEntitlements.id })
      .from(tenantEntitlements)
      .innerJoin(
        tenantApplicationSubscriptions,
        and(
          eq(tenantApplicationSubscriptions.tenantId, tenantEntitlements.tenantId),
          eq(tenantApplicationSubscriptions.stripeSubscriptionId, tenantEntitlements.stripeSubscriptionId),
        ),
      )
      .where(and(
        eq(tenantEntitlements.tenantId, tenantId),
        eq(tenantEntitlements.entitlementKey, moduleSlug),
        eq(tenantEntitlements.active, true),
        inArray(tenantEntitlements.entitlementType, APPLICATION_STACK_SEAT_ENTITLEMENT_TYPES),
        inArray(tenantEntitlements.source, APPLICATION_STACK_SEAT_SOURCES),
        inArray(tenantApplicationSubscriptions.status, APPLICATION_STACK_SEAT_STATUSES),
      ))
      .limit(1);

    return !!row;
  } catch (error) {
    const candidate = error as { code?: unknown; cause?: { code?: unknown } } | null;
    if (candidate?.code === '42P01' || candidate?.cause?.code === '42P01') return false;
    throw error;
  }
}

export async function getUserTenants(userId: string): Promise<UserTenantMembership[]> {
  const memberships = await db.select().from(tenantUsers).where(eq(tenantUsers.userId, userId));
  if (memberships.length === 0) return [];

  const out: UserTenantMembership[] = [];
  for (const membership of memberships) {
    const tenant = await getTenantRow(membership.tenantId);
    if (tenant) out.push({ tenant, membership });
  }
  return out;
}

export async function getTenantMembership(
  userId: string,
  tenantId: string,
): Promise<TenantUserRow | null> {
  const [row] = await db.select().from(tenantUsers)
    .where(and(eq(tenantUsers.userId, userId), eq(tenantUsers.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export async function getTenantEntitlements(tenantId: string): Promise<TenantEntitlementSummary> {
  const [entitlements, moduleRows] = await Promise.all([
    db.select().from(tenantEntitlements)
      .where(and(eq(tenantEntitlements.tenantId, tenantId), eq(tenantEntitlements.active, true))),
    db.select().from(tenantModules)
      .where(eq(tenantModules.tenantId, tenantId)),
  ]);

  return {
    entitlements,
    modules: moduleRows,
  };
}

export async function tenantHasModuleEntitlement(
  tenantId: string,
  moduleId: string,
): Promise<boolean> {
  const [tenant, module] = await Promise.all([
    getTenantRow(tenantId),
    resolveModule(moduleId),
  ]);
  if (!tenant || !module) return false;
  if (globalModuleUnavailableReason(module)) return false;

  const tenantModule = await getTenantModuleRow(tenantId, module.id);
  if (tenantModule) {
    return LAUNCHABLE_TENANT_MODULE_STATUSES.includes(tenantModule.status as any);
  }

  if (await tenantHasActiveEntitlement(tenantId, module.slug)) return true;
  return ownerPlanGrantsModule(tenant, module.id);
}

export async function resolveTenantModuleAccess(
  userId: string,
  tenantId: string,
  moduleId: string,
): Promise<TenantModuleAccessDecision> {
  const [user, tenant, module] = await Promise.all([
    getUserRow(userId),
    getTenantRow(tenantId),
    resolveModule(moduleId),
  ]);
  const moduleSlug = module?.slug ?? moduleId;

  if (!user || user.status !== 'active') {
    return {
      tenantId,
      moduleSlug,
      moduleId: module?.id ?? null,
      hasAccess: false,
      source: null,
      reason: 'user_inactive',
      accessLevel: 'none',
      tenantModule: null,
      userModuleAccess: null,
      viaPlatformRole: false,
    };
  }

  if (!module) {
    return {
      tenantId,
      moduleSlug,
      moduleId: null,
      hasAccess: false,
      source: null,
      reason: 'module_not_found',
      accessLevel: 'none',
      tenantModule: null,
      userModuleAccess: null,
      viaPlatformRole: false,
    };
  }

  const globalUnavailableReason = globalModuleUnavailableReason(module);
  if (globalUnavailableReason) {
    return {
      tenantId,
      moduleSlug: module.slug,
      moduleId: module.id,
      hasAccess: false,
      source: null,
      reason: globalUnavailableReason,
      accessLevel: 'none',
      tenantModule: null,
      userModuleAccess: null,
      viaPlatformRole: false,
    };
  }

  if (hasPlatformAdminAuthority(user)) {
    return {
      tenantId,
      moduleSlug: module.slug,
      moduleId: module.id,
      hasAccess: true,
      source: 'admin_role',
      accessLevel: 'manager',
      tenantModule: null,
      userModuleAccess: null,
      viaPlatformRole: true,
    };
  }

  if (!tenant || tenant.status === 'archived') {
    return {
      tenantId,
      moduleSlug: module.slug,
      moduleId: module.id,
      hasAccess: false,
      source: null,
      reason: 'tenant_not_found',
      accessLevel: 'none',
      tenantModule: null,
      userModuleAccess: null,
      viaPlatformRole: false,
    };
  }

  if (tenant.status === 'suspended') {
    return {
      tenantId,
      moduleSlug: module.slug,
      moduleId: module.id,
      hasAccess: false,
      source: null,
      reason: 'tenant_suspended',
      accessLevel: 'none',
      tenantModule: null,
      userModuleAccess: null,
      viaPlatformRole: false,
    };
  }

  const [membership, tenantModule, userModuleAccess] = await Promise.all([
    getTenantMembership(userId, tenantId),
    getTenantModuleRow(tenantId, module.id),
    getUserModuleAccessRow(tenantId, userId, module.id),
  ]);

  if (!membership) {
    return {
      tenantId,
      moduleSlug: module.slug,
      moduleId: module.id,
      hasAccess: false,
      source: null,
      reason: 'tenant_not_found',
      accessLevel: 'none',
      tenantModule,
      userModuleAccess,
      viaPlatformRole: false,
    };
  }
  const tenantViewer = tenantRoleToEffective(membership.role) === 'viewer';

  if (tenantModule && !LAUNCHABLE_TENANT_MODULE_STATUSES.includes(tenantModule.status as any)) {
    return {
      tenantId,
      moduleSlug: module.slug,
      moduleId: module.id,
      hasAccess: false,
      source: null,
      reason: 'tenant_module_disabled',
      accessLevel: 'none',
      tenantModule,
      userModuleAccess,
      viaPlatformRole: false,
    };
  }

  const explicitAccessLevel = userModuleAccess
    ? moduleAccessLevelToEffective(userModuleAccess.accessLevel)
    : null;

  if (explicitAccessLevel === 'none') {
    return {
      tenantId,
      moduleSlug: module.slug,
      moduleId: module.id,
      hasAccess: false,
      source: null,
      reason: 'explicit_deny',
      accessLevel: 'none',
      tenantModule,
      userModuleAccess,
      viaPlatformRole: false,
    };
  }

  // Application Stack seats are a tenant-level commercial boundary, not a
  // module-assignment preference. Enforce that boundary before any positive
  // explicit grant or `allowAllMembers` branch can return. Platform support
  // authority was handled above, while free-account apps and grandfathered
  // legacy-plan-only grants never enter this branch.
  if (await moduleConsumesApplicationStackSeat(tenantId, module.slug)) {
    const withinSeatLimit = await isUserWithinTenantSeatLimit(tenantId, userId);
    if (!withinSeatLimit) {
      return {
        tenantId,
        moduleSlug: module.slug,
        moduleId: module.id,
        hasAccess: false,
        source: null,
        reason: 'seat_limit_exceeded',
        accessLevel: 'none',
        tenantModule,
        userModuleAccess,
        viaPlatformRole: false,
      };
    }
  }

  if (explicitAccessLevel === 'viewer'
    || explicitAccessLevel === 'user'
    || explicitAccessLevel === 'manager') {
    return {
      tenantId,
      moduleSlug: module.slug,
      moduleId: module.id,
      hasAccess: true,
      source: sourceFromTenantModule(tenantModule),
      accessLevel: tenantViewer ? 'viewer' : explicitAccessLevel,
      tenantModule,
      userModuleAccess,
      viaPlatformRole: false,
    };
  }

  if (tenantModule) {
    if (tenantModule.allowAllMembers) {
      return {
        tenantId,
        moduleSlug: module.slug,
        moduleId: module.id,
        hasAccess: true,
        source: sourceFromTenantModule(tenantModule),
        accessLevel: tenantViewer ? 'viewer' : 'user',
        tenantModule,
        userModuleAccess,
        viaPlatformRole: false,
      };
    }
    return {
      tenantId,
      moduleSlug: module.slug,
      moduleId: module.id,
      hasAccess: false,
      source: null,
      reason: 'no_tenant_grant',
      accessLevel: 'none',
      tenantModule,
      userModuleAccess,
      viaPlatformRole: false,
    };
  }

  if (await tenantHasActiveEntitlement(tenantId, module.slug)) {
    if (FREE_ACCOUNT_MODULE_KEYS.has(module.slug as any)) {
      return {
        tenantId,
        moduleSlug: module.slug,
        moduleId: module.id,
        hasAccess: true,
        source: 'plan',
        accessLevel: tenantViewer ? 'viewer' : 'user',
        tenantModule: null,
        userModuleAccess,
        viaPlatformRole: false,
      };
    }
    const withinSeatLimit = await isUserWithinTenantSeatLimit(tenantId, userId);
    return withinSeatLimit
      ? {
          tenantId,
          moduleSlug: module.slug,
          moduleId: module.id,
          hasAccess: true,
          source: 'plan',
          accessLevel: tenantViewer ? 'viewer' : 'user',
          tenantModule: null,
          userModuleAccess,
          viaPlatformRole: false,
        }
      : {
          tenantId,
          moduleSlug: module.slug,
          moduleId: module.id,
          hasAccess: false,
          source: null,
          reason: 'seat_limit_exceeded',
          accessLevel: 'none',
          tenantModule: null,
          userModuleAccess,
          viaPlatformRole: false,
        };
  }

  if (await ownerPlanGrantsModule(tenant, module.id)) {
    return {
      tenantId,
      moduleSlug: module.slug,
      moduleId: module.id,
      hasAccess: true,
      source: 'plan',
      accessLevel: tenantViewer ? 'viewer' : 'user',
      tenantModule: null,
      userModuleAccess,
      viaPlatformRole: false,
    };
  }

  // The evaluation trial is intentionally the last grant source. Real plan,
  // add-on, tenant entitlement, and explicit access rows win first. It is
  // user-bound, personal-workspace-only, and evaluated against database time
  // on every request; no persisted tenant-wide grant can outlive its window.
  const trial = await resolveCoreSuiteTrialAccess(userId, tenantId, module.slug);
  if (trial.granted) {
    return {
      tenantId,
      moduleSlug: module.slug,
      moduleId: module.id,
      hasAccess: true,
      source: 'trial',
      accessLevel: tenantViewer ? 'viewer' : 'user',
      tenantModule: null,
      userModuleAccess,
      viaPlatformRole: false,
      expiresAt: trial.expiresAt,
    };
  }

  return {
    tenantId,
    moduleSlug: module.slug,
    moduleId: module.id,
    hasAccess: false,
    source: null,
    reason: 'no_plan_grant',
    accessLevel: 'none',
    tenantModule: null,
    userModuleAccess,
    viaPlatformRole: false,
  };
}

function accessErrorFor(decision: TenantModuleAccessDecision): TenantEntitlementError {
  if (decision.reason === 'module_not_found') {
    return new TenantEntitlementError(404, 'MODULE_NOT_FOUND', 'Module not found', {
      moduleSlug: decision.moduleSlug,
    });
  }
  if (decision.reason === 'tenant_not_found') {
    return new TenantEntitlementError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  }
  if (decision.reason === 'tenant_suspended') {
    return new TenantEntitlementError(403, 'TENANT_SUSPENDED', 'Tenant is suspended');
  }
  if (decision.reason === 'module_archived') {
    return new TenantEntitlementError(403, 'MODULE_ARCHIVED', 'Module is archived', {
      moduleSlug: decision.moduleSlug,
    });
  }
  if (decision.reason === 'module_disabled') {
    return new TenantEntitlementError(403, 'MODULE_DISABLED', 'Module is disabled', {
      moduleSlug: decision.moduleSlug,
    });
  }
  if (decision.reason === 'module_unavailable') {
    return new TenantEntitlementError(403, 'MODULE_UNAVAILABLE', 'Module is not available for launch', {
      moduleSlug: decision.moduleSlug,
    });
  }
  if (decision.reason === 'tenant_module_disabled' || decision.reason === 'no_plan_grant') {
    return new TenantEntitlementError(403, 'TENANT_MODULE_DISABLED', 'Module is not enabled for this tenant', {
      moduleSlug: decision.moduleSlug,
    });
  }
  if (decision.reason === 'seat_limit_exceeded') {
    return new TenantEntitlementError(403, 'TENANT_SEAT_LIMIT_EXCEEDED', 'Tenant seat limit exceeded', {
      moduleSlug: decision.moduleSlug,
    });
  }
  return new TenantEntitlementError(403, 'TENANT_MODULE_ACCESS_DENIED', 'No access grant for this module within the active tenant', {
    moduleSlug: decision.moduleSlug,
  });
}

export async function requireTenantModuleAccess(
  request: FastifyRequest,
  tenantId: string,
  moduleId: string,
): Promise<TenantModuleAccessDecision> {
  const user = (request as any).user as UserRow | undefined;
  if (!user) {
    throw new TenantEntitlementError(401, 'AUTH_REQUIRED', 'Authentication required');
  }

  const decision = await resolveTenantModuleAccess(user.id, tenantId, moduleId);
  if (!decision.hasAccess) throw accessErrorFor(decision);

  (request as any).tenantModuleAccessLevel = decision.accessLevel;
  (request as any).moduleAccess = {
    moduleSlug: decision.moduleSlug,
    hasAccess: true,
    source: decision.source,
  };
  return decision;
}

export async function grantModuleEntitlement(
  tenantId: string,
  moduleId: string,
  source: TenantModuleGrantSource = 'admin',
  options: {
    actorUserId?: string | null;
    allowAllMembers?: boolean;
    metadata?: Record<string, unknown>;
    request?: FastifyRequest;
  } = {},
): Promise<{
  module: ModuleRow;
  tenantModule: TenantModuleRow;
  entitlement: TenantEntitlementRow;
}> {
  const [tenant, module] = await Promise.all([
    getTenantRow(tenantId),
    resolveModule(moduleId),
  ]);
  if (!tenant) throw new TenantEntitlementError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  if (!module) throw new TenantEntitlementError(404, 'MODULE_NOT_FOUND', 'Module not found');
  if (module.archivedAt) throw new TenantEntitlementError(409, 'MODULE_ARCHIVED', 'Module is archived');

  const before = await getTenantModuleRow(tenantId, module.id);
  const now = new Date();
  const tenantModuleSource = tenantModuleSourceFromGrantSource(source);
  const status = tenantModuleStatusFromGrantSource(source);
  const allowAllMembers = options.allowAllMembers ?? true;

  let tenantModule: TenantModuleRow;
  if (before) {
    [tenantModule] = await db.update(tenantModules).set({
      status,
      source: tenantModuleSource,
      allowAllMembers,
      metadata: options.metadata as any,
      updatedAt: now,
    }).where(eq(tenantModules.id, before.id)).returning();
  } else {
    [tenantModule] = await db.insert(tenantModules).values({
      tenantId,
      moduleId: module.id,
      status,
      source: tenantModuleSource,
      allowAllMembers,
      metadata: options.metadata as any,
    }).returning();
  }

  const entitlementSource = entitlementSourceFromGrantSource(source);
  const entitlementType = entitlementTypeFromGrantSource(source);
  const [activeEntitlement] = await db.select().from(tenantEntitlements)
    .where(and(
      eq(tenantEntitlements.tenantId, tenantId),
      eq(tenantEntitlements.entitlementKey, module.slug),
      eq(tenantEntitlements.active, true),
    ))
    .limit(1);

  let entitlement: TenantEntitlementRow;
  if (activeEntitlement) {
    [entitlement] = await db.update(tenantEntitlements).set({
      entitlementType,
      source: entitlementSource,
      metadata: {
        ...(activeEntitlement.metadata ?? {}),
        ...(options.metadata ?? {}),
        moduleId: module.id,
      },
      updatedAt: now,
    }).where(eq(tenantEntitlements.id, activeEntitlement.id)).returning();
  } else {
    [entitlement] = await db.insert(tenantEntitlements).values({
      tenantId,
      entitlementKey: module.slug,
      entitlementType,
      source: entitlementSource,
      active: true,
      metadata: {
        ...(options.metadata ?? {}),
        moduleId: module.id,
      },
    }).returning();
  }

  if (options.actorUserId) {
    await writeAudit({
      actorUserId: options.actorUserId,
      tenantId,
      targetType: 'tenant_module',
      targetId: tenantModule.id,
      action: 'tenant_module_entitlement_granted',
      before: pickSafe(before, [...TENANT_MODULE_SAFE_FIELDS]),
      after: pickSafe(tenantModule, [...TENANT_MODULE_SAFE_FIELDS]),
      extra: {
        moduleSlug: module.slug,
        source,
        module: pickSafe(module, [...MODULE_SAFE_FIELDS]),
      },
      ipAddress: options.request?.ip ?? null,
    }, options.request);
  }

  return { module, tenantModule, entitlement };
}

export async function revokeModuleEntitlement(
  tenantId: string,
  moduleId: string,
  source: TenantModuleGrantSource = 'admin',
  options: {
    actorUserId?: string | null;
    request?: FastifyRequest;
  } = {},
): Promise<{
  module: ModuleRow;
  tenantModule: TenantModuleRow | null;
  deactivatedEntitlements: number;
}> {
  const [tenant, module] = await Promise.all([
    getTenantRow(tenantId),
    resolveModule(moduleId),
  ]);
  if (!tenant) throw new TenantEntitlementError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  if (!module) throw new TenantEntitlementError(404, 'MODULE_NOT_FOUND', 'Module not found');

  const before = await getTenantModuleRow(tenantId, module.id);
  let tenantModule: TenantModuleRow | null = null;
  if (before) {
    [tenantModule] = await db.update(tenantModules).set({
      status: 'disabled',
      updatedAt: new Date(),
    }).where(eq(tenantModules.id, before.id)).returning();
  }

  const deactivated = await db.update(tenantEntitlements).set({
    active: false,
    updatedAt: new Date(),
  }).where(and(
    eq(tenantEntitlements.tenantId, tenantId),
    eq(tenantEntitlements.entitlementKey, module.slug),
    eq(tenantEntitlements.active, true),
  )).returning({ id: tenantEntitlements.id });

  if (options.actorUserId) {
    await writeAudit({
      actorUserId: options.actorUserId,
      tenantId,
      targetType: 'tenant_module',
      targetId: before?.id ?? module.id,
      action: 'tenant_module_entitlement_revoked',
      before: pickSafe(before, [...TENANT_MODULE_SAFE_FIELDS]),
      after: pickSafe(tenantModule, [...TENANT_MODULE_SAFE_FIELDS]),
      extra: {
        moduleSlug: module.slug,
        source,
        deactivatedEntitlements: deactivated.length,
      },
      ipAddress: options.request?.ip ?? null,
    }, options.request);
  }

  return { module, tenantModule, deactivatedEntitlements: deactivated.length };
}
