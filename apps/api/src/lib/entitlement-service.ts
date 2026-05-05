import { db } from '../db.js';
import {
  users, subscriptions, subscriptionPlans,
  modules, planModules, addonSubscriptions, entitlementOverrides,
} from '../schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from './auth.js';

/**
 * Access source attribution. The first source that grants/denies access wins,
 * but the order matters for fail-closed law:
 *   1. admin override (deny) — hard block
 *   2. admin override (grant) — explicit allow
 *   3. addon subscription — paid add-on
 *   4. plan inclusion — comes with the user's current plan
 *   5. fail-closed — no access
 */
export type AccessSource = 'override_grant' | 'override_revoke' | 'addon' | 'plan' | 'denied';

export interface ModuleAccess {
  moduleSlug: string;
  hasAccess: boolean;
  source: AccessSource;
  reason?: string;
  expiresAt?: Date | null;
}

export interface UserModuleSummary {
  module: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    iconUrl: string | null;
    category: string | null;
    status: string;
    planMin: string;
    baseUrl: string;
    ord: number;
  };
  hasAccess: boolean;
  source: AccessSource;
  reason?: string;
}

export interface AccessBreakdown {
  moduleSlug: string;
  hasAccess: boolean;
  finalSource: AccessSource;
  planSlug: string | null;
  planGrants: boolean;
  addonGrants: boolean;
  overrideGrants: boolean | null; // null = no override; true=grant; false=revoke
  moduleStatus: string;
  reason?: string;
}

async function getUserPlanSlug(userId: string): Promise<string | null> {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!sub) return null;
  if (!['active', 'trialing'].includes(sub.status)) return null;
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
  return plan?.slug ?? null;
}

async function planGrantsModule(planId: string, moduleId: string): Promise<boolean> {
  const rows = await db.select().from(planModules)
    .where(and(eq(planModules.planId, planId), eq(planModules.moduleId, moduleId)))
    .limit(1);
  return rows.length > 0;
}

async function activeAddonForUser(userId: string, moduleId: string) {
  const rows = await db.select().from(addonSubscriptions)
    .where(and(
      eq(addonSubscriptions.userId, userId),
      eq(addonSubscriptions.moduleId, moduleId),
    ));
  return rows.find(r => ['active', 'trialing'].includes(r.status)) ?? null;
}

async function activeOverrideForUser(userId: string, moduleId: string) {
  const rows = await db.select().from(entitlementOverrides)
    .where(and(
      eq(entitlementOverrides.userId, userId),
      eq(entitlementOverrides.moduleId, moduleId),
    ));
  const now = new Date();
  // Pick the most recent non-expired one
  const valid = rows
    .filter(r => !r.expiresAt || r.expiresAt > now)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return valid[0] ?? null;
}

/**
 * The single source of truth for module access. Fail-closed: any unexpected
 * state results in denial.
 */
export async function hasModuleAccess(userId: string, moduleSlug: string): Promise<ModuleAccess> {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.status !== 'active') {
      return { moduleSlug, hasAccess: false, source: 'denied', reason: 'user_inactive' };
    }

    const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
    if (!mod) return { moduleSlug, hasAccess: false, source: 'denied', reason: 'module_not_found' };
    if (mod.status === 'disabled') return { moduleSlug, hasAccess: false, source: 'denied', reason: 'module_disabled' };

    // 1. Admin override takes precedence
    const override = await activeOverrideForUser(userId, mod.id);
    if (override) {
      if (!override.grant) {
        return { moduleSlug, hasAccess: false, source: 'override_revoke', reason: override.reason ?? 'admin_revoked', expiresAt: override.expiresAt };
      }
      // Even with grant override, coming_soon modules cannot be launched (UX)
      // — but admins still get a launch-able "preview". Spec says preview-only
      // for coming_soon. We allow the grant; the route can refuse handoff.
      return { moduleSlug, hasAccess: true, source: 'override_grant', reason: override.reason ?? 'admin_granted', expiresAt: override.expiresAt };
    }

    // 2. Active addon
    const addon = await activeAddonForUser(userId, mod.id);
    if (addon) {
      return { moduleSlug, hasAccess: true, source: 'addon' };
    }

    // 3. Plan inclusion
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
    if (sub && ['active', 'trialing'].includes(sub.status)) {
      const granted = await planGrantsModule(sub.planId, mod.id);
      if (granted) {
        return { moduleSlug, hasAccess: true, source: 'plan' };
      }
    }

    // 4. Fail-closed
    return { moduleSlug, hasAccess: false, source: 'denied', reason: 'no_entitlement' };
  } catch (err) {
    console.error('[entitlement] hasModuleAccess error:', err);
    return { moduleSlug, hasAccess: false, source: 'denied', reason: 'evaluation_error' };
  }
}

/**
 * Returns every module in the catalog with the user's access state attached.
 * UI consumes this directly — never compute access on the client.
 */
export async function getUserModules(userId: string): Promise<UserModuleSummary[]> {
  const allModules = await db.select().from(modules);
  const sorted = allModules.sort((a, b) => a.ord - b.ord);
  const out: UserModuleSummary[] = [];
  for (const m of sorted) {
    const access = await hasModuleAccess(userId, m.slug);
    out.push({
      module: {
        id: m.id,
        slug: m.slug,
        name: m.name,
        description: m.description,
        iconUrl: m.iconUrl,
        category: m.category,
        status: m.status,
        planMin: m.planMin,
        baseUrl: m.baseUrl,
        ord: m.ord,
      },
      hasAccess: access.hasAccess,
      source: access.source,
      reason: access.reason,
    });
  }
  return out;
}

/**
 * Verbose breakdown for /modules/debug — shows every layer of evaluation.
 */
export async function getAccessBreakdown(userId: string, moduleSlug: string): Promise<AccessBreakdown | null> {
  const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
  if (!mod) return null;

  const planSlug = await getUserPlanSlug(userId);
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  const planGrants = sub ? await planGrantsModule(sub.planId, mod.id) : false;

  const addon = await activeAddonForUser(userId, mod.id);
  const addonGrants = !!addon;

  const override = await activeOverrideForUser(userId, mod.id);
  const overrideGrants = override ? override.grant : null;

  const access = await hasModuleAccess(userId, moduleSlug);

  return {
    moduleSlug,
    hasAccess: access.hasAccess,
    finalSource: access.source,
    planSlug,
    planGrants,
    addonGrants,
    overrideGrants,
    moduleStatus: mod.status,
    reason: access.reason,
  };
}

/**
 * Fastify pre-handler factory. Use as `{ preHandler: [requireModuleAccess('snapproofos')] }`.
 * 403 with structured payload on denial.
 */
export function requireModuleAccess(moduleSlug: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    const user = (request as any).user;
    if (user.role === 'admin') return; // admins bypass entitlement gates

    const access = await hasModuleAccess(user.id, moduleSlug);
    if (!access.hasAccess) {
      reply.code(403).send({
        error: `Access to "${moduleSlug}" requires an upgraded plan or add-on.`,
        code: 'MODULE_ACCESS_DENIED',
        moduleSlug,
        source: access.source,
        reason: access.reason,
      });
      return;
    }
    (request as any).moduleAccess = access;
  };
}
