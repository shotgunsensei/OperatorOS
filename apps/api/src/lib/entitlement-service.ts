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

/**
 * Spec-aligned CTA taxonomy. Frontends MUST match on these literals
 * exactly — they drive button copy and click handlers.
 *   open         — user is entitled and module is launchable
 *   upgrade      — locked; cheapest plan that grants access exists
 *   buy_addon    — locked; per-module addon is available for purchase
 *   coming_soon  — module is not yet launchable for anyone
 *   disabled     — module is administratively off
 */
export type ModuleCta = 'open' | 'upgrade' | 'buy_addon' | 'coming_soon' | 'disabled';

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

/**
 * Per-module trace — used by the per-slug debug surface
 * (`/v1/modules/debug/:slug`) and by admin tooling that wants to know
 * exactly why a single module resolved the way it did for a given user.
 */
export interface ModuleAccessTrace {
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

/**
 * Spec-mandated aggregate snapshot returned by `getAccessBreakdown(userId)`
 * and surfaced verbatim by `GET /v1/modules/debug`.
 *
 * Each list contains module slugs, NOT booleans, so the receiver can
 * trivially compute set-difference views ("which addon modules are NOT
 * already covered by my plan?"). `effective` is the union of every grant
 * source, minus revokes. `accessSources` is a per-module map showing the
 * single source that ultimately won, mirroring `hasModuleAccess.source`.
 */
export interface AccessBreakdown {
  userId: string;
  planSlug: string | null;
  isAdmin: boolean;
  /** Modules granted by the user's active plan inclusion. */
  plan_modules: string[];
  /** Modules granted by an active per-module addon subscription. */
  addon_modules: string[];
  /** Modules with an active grant override (admin-issued). */
  overrides: string[];
  /** Modules with an active revoke override (admin-revoked). */
  override_revokes: string[];
  /** Final per-user effective module set after applying all sources + revokes. */
  effective: string[];
  /** Per-module winning AccessSource ('plan' | 'addon' | 'override' | 'admin_role' | null). */
  access_sources: Record<string, AccessSource>;
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
 * Pure entitlement check — does the user have ANY path to access this
 * module (admin role, override grant, active addon, plan inclusion)?
 * IGNORES module status (live/coming_soon/disabled). Used by the launch
 * route to separate "the user is unauthorized" (403) from "the user is
 * authorized but the module isn't launchable yet" (400).
 *
 * Returns the AccessSource that won, or null when the user has no
 * entitlement (or has been explicitly revoked).
 */
export async function evaluateUserEntitlement(userId: string, moduleId: string): Promise<AccessSource> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status !== 'active') return null;
  if (user.role === 'admin') return 'admin_role';

  const override = await activeOverrideForUser(userId, moduleId);
  if (override) return override.grant ? 'override' : null;

  const addon = await activeAddonForUser(userId, moduleId);
  if (addon) return 'addon';

  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (sub && ['active', 'trialing'].includes(sub.status)) {
    if (await planGrantsModule(sub.planId, moduleId)) return 'plan';
  }
  return null;
}

// Entitlement-only access check. Order: admin_role > override > addon > plan.
// Module runtime status (live/coming_soon/disabled) and baseUrl are NOT
// considered here — callers gate launchability separately.
export async function hasModuleAccess(userId: string, moduleSlug: string): Promise<ModuleAccess> {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.status !== 'active') {
      return { moduleSlug, hasAccess: false, source: null, reason: 'user_inactive' };
    }

    const [mod] = await db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
    if (!mod) return { moduleSlug, hasAccess: false, source: null, reason: 'module_not_found' };

    if (user.role === 'admin') {
      return { moduleSlug, hasAccess: true, source: 'admin_role' };
    }

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

    const addon = await activeAddonForUser(userId, mod.id);
    if (addon) return { moduleSlug, hasAccess: true, source: 'addon' };

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
    if (sub && ['active', 'trialing'].includes(sub.status)) {
      if (await planGrantsModule(sub.planId, mod.id)) {
        return { moduleSlug, hasAccess: true, source: 'plan' };
      }
    }

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
  if (hasAccess && hasBaseUrl) return 'open';
  // Locked but live. Prefer `buy_addon` only if a price is configured;
  // otherwise nudge an upgrade.
  if (addonPriceCents && addonPriceCents > 0) return 'buy_addon';
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
      unlocked: access.hasAccess && m.status === 'live' && !!m.baseUrl,
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
    unlocked: access.hasAccess && m.status === 'live' && !!m.baseUrl,
    access_source: access.source,
    cta,
    upgrade_target_plan: upgradeTarget,
    addon_price_cents: addonPriceCents,
    reason: access.reason,
  };
}

/**
 * Per-module trace for `/v1/modules/debug/:slug` and admin per-module
 * inspection. Returns null when the module slug does not exist.
 */
export async function getModuleAccessTrace(userId: string, moduleSlug: string): Promise<ModuleAccessTrace | null> {
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
 * Spec-mandated aggregate access breakdown for a single user. Used by
 * `GET /v1/modules/debug`. Computes plan/addon/override sets in bulk
 * (one query per source, not one per module) so it scales with catalog
 * size. The aggregate IS the contract — `/v1/modules/debug` returns this
 * shape verbatim.
 */
export async function getAccessBreakdown(userId: string): Promise<AccessBreakdown> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const isAdmin = user?.role === 'admin';
  const planSlug = await getUserPlanSlug(userId);

  const allModules = await db.select().from(modules);
  const modById = Object.fromEntries(allModules.map(m => [m.id, m]));
  const launchable = (m: { status: string }) => m.status !== 'disabled' && m.status !== 'coming_soon';

  // Plan inclusions (bulk)
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  let planModuleSlugs: string[] = [];
  if (sub && ['active', 'trialing'].includes(sub.status)) {
    const mappings = await db.select().from(planModules).where(eq(planModules.planId, sub.planId));
    planModuleSlugs = mappings.map(m => modById[m.moduleId]?.slug).filter((s): s is string => !!s);
  }

  // Active addons (bulk)
  const allAddons = await db.select().from(addonSubscriptions).where(eq(addonSubscriptions.userId, userId));
  const addonModuleSlugs = allAddons
    .filter(a => ['active', 'trialing'].includes(a.status))
    .map(a => modById[a.moduleId]?.slug)
    .filter((s): s is string => !!s);

  // Overrides (bulk; latest wins per module)
  const allOverrides = await db.select().from(entitlementOverrides).where(eq(entitlementOverrides.userId, userId));
  const now = new Date();
  const latestOverrideByMod = new Map<string, typeof allOverrides[number]>();
  for (const o of allOverrides) {
    if (o.expiresAt && o.expiresAt <= now) continue;
    const prev = latestOverrideByMod.get(o.moduleId);
    if (!prev || o.createdAt.getTime() > prev.createdAt.getTime()) {
      latestOverrideByMod.set(o.moduleId, o);
    }
  }
  const overrides: string[] = [];
  const override_revokes: string[] = [];
  for (const [modId, o] of latestOverrideByMod) {
    const slug = modById[modId]?.slug;
    if (!slug) continue;
    if (o.grant) overrides.push(slug); else override_revokes.push(slug);
  }

  // Compose `effective` + `access_sources` honoring the same source-precedence
  // as `hasModuleAccess`: admin_role > override (revoke wins) > addon > plan.
  // A module that is `disabled` or `coming_soon` is never effective.
  const access_sources: Record<string, AccessSource> = {};
  const effective: string[] = [];
  for (const m of allModules) {
    if (!launchable(m)) { access_sources[m.slug] = null; continue; }
    if (isAdmin) { access_sources[m.slug] = 'admin_role'; effective.push(m.slug); continue; }
    const o = latestOverrideByMod.get(m.id);
    if (o) {
      if (!o.grant) { access_sources[m.slug] = null; continue; }
      access_sources[m.slug] = 'override'; effective.push(m.slug); continue;
    }
    if (addonModuleSlugs.includes(m.slug)) { access_sources[m.slug] = 'addon'; effective.push(m.slug); continue; }
    if (planModuleSlugs.includes(m.slug)) { access_sources[m.slug] = 'plan'; effective.push(m.slug); continue; }
    access_sources[m.slug] = null;
  }

  return {
    userId,
    planSlug,
    isAdmin,
    plan_modules: planModuleSlugs,
    addon_modules: addonModuleSlugs,
    overrides,
    override_revokes,
    effective,
    access_sources,
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
