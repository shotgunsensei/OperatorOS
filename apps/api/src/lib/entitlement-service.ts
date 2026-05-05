import { db } from '../db.js';
import {
  users, subscriptions, subscriptionPlans,
  modules, planModules, addonSubscriptions, entitlementOverrides,
} from '../schema.js';
import { eq, and } from 'drizzle-orm';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from './auth.js';

/**
 * Access-source taxonomy — the single source of truth for how a user got
 * (or did not get) access to a module. The order matches evaluation order:
 *   1. admin_role  — server-side superadmin allow
 *   2. override    — explicit per-user grant or revoke
 *   3. addon       — paid per-module subscription
 *   4. plan        — comes with the user's active plan
 *   5. null        — no access (locked / coming_soon / disabled / no entitlement)
 */
export type AccessSource = 'plan' | 'addon' | 'override' | 'admin_role' | null;

export type ModuleCta = 'launch' | 'upgrade' | 'subscribe_addon' | 'coming_soon' | 'disabled';

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
  // Server-authoritative rendering hints. The UI MUST NOT recompute these.
  unlocked: boolean;
  access_source: AccessSource;
  cta: ModuleCta;
  upgrade_target_plan: string | null;
  addon_price_cents: number | null;
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
  isAdmin: boolean;
  moduleStatus: string;
  reason?: string;
}

const PLAN_RANK: Record<string, number> = { starter: 0, pro: 1, elite: 2 };

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
  const valid = rows
    .filter(r => !r.expiresAt || r.expiresAt > now)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return valid[0] ?? null;
}

/**
 * The single source of truth for module access. Fail-closed: any unexpected
 * state results in denial.
 *
 * Evaluation order is strict and documented above on AccessSource.
 */
export async function hasModuleAccess(userId: string, moduleSlug: string): Promise<ModuleAccess> {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.status !== 'active') {
      return { moduleSlug, hasAccess: false, source: null, reason: 'user_inactive' };
    }

    const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
    if (!mod) return { moduleSlug, hasAccess: false, source: null, reason: 'module_not_found' };
    if (mod.status === 'disabled') return { moduleSlug, hasAccess: false, source: null, reason: 'module_disabled' };
    if (mod.status === 'coming_soon') {
      // Even admins shouldn't be considered "having access" to launch a
      // coming-soon module — but they will see the card. Source is null.
      return { moduleSlug, hasAccess: false, source: null, reason: 'coming_soon' };
    }

    // 1. Admin role allow — superadmins can launch any live module
    if (user.role === 'admin') {
      return { moduleSlug, hasAccess: true, source: 'admin_role' };
    }

    // 2. Per-user override (revoke wins, then grant)
    const override = await activeOverrideForUser(userId, mod.id);
    if (override) {
      if (!override.grant) {
        return {
          moduleSlug, hasAccess: false, source: 'override',
          reason: override.reason ?? 'admin_revoked', expiresAt: override.expiresAt,
        };
      }
      return {
        moduleSlug, hasAccess: true, source: 'override',
        reason: override.reason ?? 'admin_granted', expiresAt: override.expiresAt,
      };
    }

    // 3. Active addon
    const addon = await activeAddonForUser(userId, mod.id);
    if (addon) {
      return { moduleSlug, hasAccess: true, source: 'addon' };
    }

    // 4. Plan inclusion
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
    if (sub && ['active', 'trialing'].includes(sub.status)) {
      const granted = await planGrantsModule(sub.planId, mod.id);
      if (granted) {
        return { moduleSlug, hasAccess: true, source: 'plan' };
      }
    }

    // 5. Fail-closed
    return { moduleSlug, hasAccess: false, source: null, reason: 'no_entitlement' };
  } catch (err) {
    console.error('[entitlement] hasModuleAccess error:', err);
    return { moduleSlug, hasAccess: false, source: null, reason: 'evaluation_error' };
  }
}

/**
 * Compute the smallest plan slug that grants this module via plan inclusion,
 * for the "Upgrade to X" CTA. Returns null if no plan grants the module.
 */
async function smallestUpgradeTarget(moduleId: string): Promise<string | null> {
  const mappings = await db.select().from(planModules).where(eq(planModules.moduleId, moduleId));
  if (mappings.length === 0) return null;
  const plans = await db.select().from(subscriptionPlans);
  const planById = Object.fromEntries(plans.map(p => [p.id, p.slug]));
  const slugs = mappings
    .map(m => planById[m.planId])
    .filter((s): s is string => !!s)
    .sort((a, b) => (PLAN_RANK[a] ?? 99) - (PLAN_RANK[b] ?? 99));
  return slugs[0] ?? null;
}

function readAddonPriceCents(mod: { metadata: any }): number | null {
  const md = mod.metadata as Record<string, unknown> | null | undefined;
  const v = md?.addonPriceCents;
  return typeof v === 'number' ? v : null;
}

function pickCta(args: {
  moduleStatus: string;
  hasAccess: boolean;
  hasBaseUrl: boolean;
  upgradeTarget: string | null;
  addonPriceCents: number | null;
}): ModuleCta {
  const { moduleStatus, hasAccess, hasBaseUrl, upgradeTarget, addonPriceCents } = args;
  if (moduleStatus === 'disabled') return 'disabled';
  if (moduleStatus === 'coming_soon') return 'coming_soon';
  if (hasAccess && hasBaseUrl) return 'launch';
  // Locked but live. Prefer "subscribe_addon" only if a price is configured;
  // otherwise nudge an upgrade.
  if (addonPriceCents && addonPriceCents > 0) return 'subscribe_addon';
  if (upgradeTarget) return 'upgrade';
  return 'disabled';
}

/**
 * Returns every module in the catalog with the user's access state attached
 * AND server-resolved rendering fields (unlocked / cta / upgrade target /
 * addon price). UI consumes this directly — never compute access on the client.
 */
export async function getUserModules(userId: string): Promise<UserModuleSummary[]> {
  const allModules = await db.select().from(modules);
  const sorted = allModules.sort((a, b) => a.ord - b.ord);
  const out: UserModuleSummary[] = [];
  for (const m of sorted) {
    const access = await hasModuleAccess(userId, m.slug);
    const upgradeTarget = await smallestUpgradeTarget(m.id);
    const addonPriceCents = readAddonPriceCents(m);
    const cta = pickCta({
      moduleStatus: m.status,
      hasAccess: access.hasAccess,
      hasBaseUrl: !!m.baseUrl,
      upgradeTarget,
      addonPriceCents,
    });
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
      unlocked: access.hasAccess,
      access_source: access.source,
      cta,
      upgrade_target_plan: upgradeTarget,
      addon_price_cents: addonPriceCents,
      reason: access.reason,
    });
  }
  return out;
}

/**
 * Single-module summary with the same server-resolved shape as getUserModules.
 */
export async function getModuleForUser(userId: string, moduleSlug: string): Promise<UserModuleSummary | null> {
  const [m] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
  if (!m) return null;
  const access = await hasModuleAccess(userId, moduleSlug);
  const upgradeTarget = await smallestUpgradeTarget(m.id);
  const addonPriceCents = readAddonPriceCents(m);
  const cta = pickCta({
    moduleStatus: m.status,
    hasAccess: access.hasAccess,
    hasBaseUrl: !!m.baseUrl,
    upgradeTarget,
    addonPriceCents,
  });
  return {
    module: {
      id: m.id, slug: m.slug, name: m.name, description: m.description,
      iconUrl: m.iconUrl, category: m.category, status: m.status,
      planMin: m.planMin, baseUrl: m.baseUrl, ord: m.ord,
    },
    unlocked: access.hasAccess,
    access_source: access.source,
    cta,
    upgrade_target_plan: upgradeTarget,
    addon_price_cents: addonPriceCents,
    reason: access.reason,
  };
}

/**
 * Verbose breakdown for /modules/debug — shows every layer of evaluation.
 */
export async function getAccessBreakdown(userId: string, moduleSlug: string): Promise<AccessBreakdown | null> {
  const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
  if (!mod) return null;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
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
    isAdmin: user?.role === 'admin',
    moduleStatus: mod.status,
    reason: access.reason,
  };
}

/**
 * Fastify pre-handler factory. Use as `{ preHandler: [requireModuleAccess('snapproofos')] }`.
 * 403 with structured payload on denial. Admins are allowed by hasModuleAccess
 * itself (source='admin_role') so this stays simple.
 */
export function requireModuleAccess(moduleSlug: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    const user = (request as any).user;

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
