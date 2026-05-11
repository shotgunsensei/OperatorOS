import { db } from '../db.js';
import {
  subscriptions, subscriptionPlans, saasWorkspaces, saasProjects,
  saasTasks, notes, workspaceMemberships, usageTracking,
} from '../schema.js';
import { eq, and, count, gte, lte, sql } from 'drizzle-orm';

export interface PlanConfig {
  slug: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  limits: PlanLimits;
  features: PlanFeatures;
  description: string;
  highlight?: boolean;
}

export interface PlanLimits {
  maxWorkspaces: number;
  maxProjects: number;
  maxTasks: number;
  maxTeamMembers: number;
  maxAiActionsPerMonth: number;
}

export interface PlanFeatures {
  exports: boolean;
  automation: boolean;
  templates: boolean;
  advancedAnalytics: boolean;
  whiteLabel: boolean;
  prioritySupport: boolean;
  customIntegrations: boolean;
  apiAccess: boolean;
}

export interface UsageSummary {
  workspaces: { used: number; limit: number; percentage: number };
  projects: { used: number; limit: number; percentage: number };
  tasks: { used: number; limit: number; percentage: number };
  teamMembers: { used: number; limit: number; percentage: number };
  aiActions: { used: number; limit: number; percentage: number };
}

export interface PlanCheckResult {
  allowed: boolean;
  resource: string;
  used: number;
  limit: number;
  message: string;
  upgradeSlug?: string;
}

// Task #66: per-tier limits/features remain here (API-only concerns) but
// slug/name/description/price come from the shared SDK catalog so the
// web pricing surface and the API seed share one source of truth.
import { PLAN_CATALOG, PLAN_CATALOG_BY_SLUG } from '@operatoros/sdk';

const PLAN_LIMITS_FEATURES: Record<string, { limits: PlanLimits; features: PlanFeatures }> = {
  starter: {
    limits: { maxWorkspaces: 1, maxProjects: 3, maxTasks: 50, maxTeamMembers: 0, maxAiActionsPerMonth: 10 },
    features: { exports: false, automation: false, templates: false, advancedAnalytics: false, whiteLabel: false, prioritySupport: false, customIntegrations: false, apiAccess: false },
  },
  pro: {
    limits: { maxWorkspaces: 5, maxProjects: 25, maxTasks: 500, maxTeamMembers: 10, maxAiActionsPerMonth: 200 },
    features: { exports: true, automation: true, templates: true, advancedAnalytics: false, whiteLabel: false, prioritySupport: true, customIntegrations: false, apiAccess: true },
  },
  elite: {
    limits: { maxWorkspaces: 999, maxProjects: 9999, maxTasks: 99999, maxTeamMembers: 999, maxAiActionsPerMonth: 9999 },
    features: { exports: true, automation: true, templates: true, advancedAnalytics: true, whiteLabel: true, prioritySupport: true, customIntegrations: true, apiAccess: true },
  },
};

export const PLAN_CONFIGS: PlanConfig[] = PLAN_CATALOG.map(c => ({
  slug: c.slug,
  name: c.name,
  price: c.monthlyPriceCents,
  interval: 'month' as const,
  description: c.description,
  highlight: c.highlight || undefined,
  limits: PLAN_LIMITS_FEATURES[c.slug].limits,
  features: PLAN_LIMITS_FEATURES[c.slug].features,
}));

export { PLAN_CATALOG, PLAN_CATALOG_BY_SLUG };

export function getPlanConfig(slug: string): PlanConfig | undefined {
  return PLAN_CONFIGS.find(p => p.slug === slug);
}

export function getNextUpgradePlan(currentSlug: string): PlanConfig | undefined {
  const idx = PLAN_CONFIGS.findIndex(p => p.slug === currentSlug);
  if (idx < 0 || idx >= PLAN_CONFIGS.length - 1) return undefined;
  return PLAN_CONFIGS[idx + 1];
}

export function isUpgrade(fromSlug: string, toSlug: string): boolean {
  const fromIdx = PLAN_CONFIGS.findIndex(p => p.slug === fromSlug);
  const toIdx = PLAN_CONFIGS.findIndex(p => p.slug === toSlug);
  return toIdx > fromIdx;
}

export function isDowngrade(fromSlug: string, toSlug: string): boolean {
  const fromIdx = PLAN_CONFIGS.findIndex(p => p.slug === fromSlug);
  const toIdx = PLAN_CONFIGS.findIndex(p => p.slug === toSlug);
  return toIdx < fromIdx;
}

export function formatLimit(value: number): string {
  if (value >= 9999) return 'Unlimited';
  if (value === 0) return 'None';
  return String(value);
}

export const FEATURE_LABELS: Record<keyof PlanFeatures, string> = {
  exports: 'Data Exports',
  automation: 'Workflow Automation',
  templates: 'Project Templates',
  advancedAnalytics: 'Advanced Analytics',
  whiteLabel: 'White Label',
  prioritySupport: 'Priority Support',
  customIntegrations: 'Custom Integrations',
  apiAccess: 'API Access',
};

export const LIMIT_LABELS: Record<keyof PlanLimits, string> = {
  maxWorkspaces: 'Workspaces',
  maxProjects: 'Projects',
  maxTasks: 'Tasks',
  maxTeamMembers: 'Team Members',
  maxAiActionsPerMonth: 'AI Actions / Month',
};

export async function getUserPlanConfig(userId: string): Promise<{ config: PlanConfig; subscription: any | null }> {
  const allSubs = await db.select().from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(5);
  const sub = allSubs.find(s => s.status === 'active' || s.status === 'trialing') || allSubs[0] || null;

  if (!sub) {
    return { config: PLAN_CONFIGS[0], subscription: null };
  }

  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
  if (!plan) {
    return { config: PLAN_CONFIGS[0], subscription: sub };
  }

  const config = PLAN_CONFIGS.find(p => p.slug === plan.slug) || PLAN_CONFIGS[0];
  return { config, subscription: sub };
}

// Gate 2: usage is now metered per (user, tenant). Every counter filters
// by tenantId; team-member count includes only workspaces owned within the
// active tenant. Plan limits remain user-level for now (one plan per user)
// — caps apply per-tenant against the user's plan.
export async function getUserUsageSummary(userId: string, tenantId: string): Promise<UsageSummary> {
  const { config } = await getUserPlanConfig(userId);

  const [{ value: wsCount }] = await db.select({ value: count() }).from(saasWorkspaces)
    .where(and(eq(saasWorkspaces.ownerId, userId), eq(saasWorkspaces.tenantId, tenantId)));
  const [{ value: projCount }] = await db.select({ value: count() }).from(saasProjects)
    .where(and(eq(saasProjects.userId, userId), eq(saasProjects.tenantId, tenantId)));
  const [{ value: taskCount }] = await db.select({ value: count() }).from(saasTasks)
    .where(and(eq(saasTasks.userId, userId), eq(saasTasks.tenantId, tenantId)));

  const wsOwned = await db.select().from(saasWorkspaces)
    .where(and(eq(saasWorkspaces.ownerId, userId), eq(saasWorkspaces.tenantId, tenantId)));
  let teamMemberCount = 0;
  for (const w of wsOwned) {
    const [{ value: mc }] = await db.select({ value: count() }).from(workspaceMemberships)
      .where(eq(workspaceMemberships.workspaceId, w.id));
    teamMemberCount += mc - 1;
  }

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const usageRows = await db.select().from(usageTracking).where(
    and(
      eq(usageTracking.userId, userId),
      eq(usageTracking.tenantId, tenantId),
      eq(usageTracking.actionType, 'ai_action'),
      gte(usageTracking.periodStart, periodStart),
      lte(usageTracking.periodEnd, periodEnd),
    )
  );
  const aiUsed = usageRows.reduce((sum, r) => sum + r.count, 0);

  const pct = (used: number, limit: number) => limit >= 9999 ? 0 : limit === 0 ? 0 : Math.min(Math.round((used / limit) * 100), 100);

  return {
    workspaces: { used: wsCount, limit: config.limits.maxWorkspaces, percentage: pct(wsCount, config.limits.maxWorkspaces) },
    projects: { used: projCount, limit: config.limits.maxProjects, percentage: pct(projCount, config.limits.maxProjects) },
    tasks: { used: taskCount, limit: config.limits.maxTasks, percentage: pct(taskCount, config.limits.maxTasks) },
    teamMembers: { used: teamMemberCount, limit: config.limits.maxTeamMembers, percentage: pct(teamMemberCount, config.limits.maxTeamMembers) },
    aiActions: { used: aiUsed, limit: config.limits.maxAiActionsPerMonth, percentage: pct(aiUsed, config.limits.maxAiActionsPerMonth) },
  };
}

export async function checkResourceLimit(userId: string, tenantId: string, resource: keyof PlanLimits): Promise<PlanCheckResult> {
  const { config } = await getUserPlanConfig(userId);
  const usage = await getUserUsageSummary(userId, tenantId);

  const resourceToUsageKey: Record<keyof PlanLimits, keyof UsageSummary> = {
    maxWorkspaces: 'workspaces',
    maxProjects: 'projects',
    maxTasks: 'tasks',
    maxTeamMembers: 'teamMembers',
    maxAiActionsPerMonth: 'aiActions',
  };

  const usageKey = resourceToUsageKey[resource];
  const { used, limit } = usage[usageKey];
  const nextPlan = getNextUpgradePlan(config.slug);

  if (used >= limit && limit < 9999) {
    return {
      allowed: false,
      resource: usageKey,
      used,
      limit,
      message: `You've reached your ${LIMIT_LABELS[resource]} limit (${formatLimit(limit)}). ${nextPlan ? `Upgrade to ${nextPlan.name} for up to ${formatLimit(nextPlan.limits[resource])}.` : 'Contact support for custom limits.'}`,
      upgradeSlug: nextPlan?.slug,
    };
  }

  return { allowed: true, resource: usageKey, used, limit, message: '' };
}

export async function checkFeatureAccess(userId: string, feature: keyof PlanFeatures): Promise<PlanCheckResult> {
  const { config } = await getUserPlanConfig(userId);

  if (!config.features[feature]) {
    const nextPlan = getNextUpgradePlan(config.slug);
    const requiredPlan = PLAN_CONFIGS.find(p => p.features[feature]);
    return {
      allowed: false,
      resource: feature,
      used: 0,
      limit: 0,
      message: `${FEATURE_LABELS[feature]} requires the ${requiredPlan?.name || 'Pro'} plan or higher.`,
      upgradeSlug: nextPlan?.slug || requiredPlan?.slug,
    };
  }

  return { allowed: true, resource: feature, used: 0, limit: 0, message: '' };
}

export async function getDowngradeViolations(userId: string, tenantId: string, targetSlug: string): Promise<PlanCheckResult[]> {
  const target = getPlanConfig(targetSlug);
  if (!target) return [];

  const usage = await getUserUsageSummary(userId, tenantId);
  const violations: PlanCheckResult[] = [];

  const checks: Array<{ key: keyof UsageSummary; limitKey: keyof PlanLimits }> = [
    { key: 'workspaces', limitKey: 'maxWorkspaces' },
    { key: 'projects', limitKey: 'maxProjects' },
    { key: 'tasks', limitKey: 'maxTasks' },
    { key: 'teamMembers', limitKey: 'maxTeamMembers' },
  ];

  for (const { key, limitKey } of checks) {
    const { used } = usage[key];
    const newLimit = target.limits[limitKey];
    if (used > newLimit && newLimit < 9999) {
      violations.push({
        allowed: false,
        resource: key,
        used,
        limit: newLimit,
        message: `You currently have ${used} ${LIMIT_LABELS[limitKey].toLowerCase()} but the ${target.name} plan allows only ${formatLimit(newLimit)}. Existing data will be preserved but you won't be able to create new ones until under the limit.`,
      });
    }
  }

  return violations;
}

/**
 * Task #31: per-module usage telemetry.
 *
 * One row per (userId, tenantId, moduleId, actionType, UTC day) — the
 * partial unique index `uniq_usage_tracking_module_day` enforces this and
 * lets us use an atomic `INSERT ... ON CONFLICT DO UPDATE` so concurrent
 * launches can't lose increments or split into duplicate rows.
 *
 * `actionType` differentiates the two signals:
 *   - 'module_usage'           — SSO handoff issued (intent/launch).
 *   - 'module_launch_confirmed' — receiver called /v1/modules/sso/consume.
 * The Tenant Command Center per-module chart aggregates only 'module_usage'
 * to avoid double-counting; 'module_launch_confirmed' is captured for
 * future "confirmed-launch" analytics.
 */
export async function recordModuleUsage(opts: {
  userId: string;
  tenantId: string;
  moduleId: string;
  actionType?: 'module_usage' | 'module_launch_confirmed';
  count?: number;
}): Promise<void> {
  const count = opts.count ?? 1;
  const actionType = opts.actionType ?? 'module_usage';
  const now = new Date();
  // UTC day bucket so rows align with the activity endpoint's
  // `periodStart.toISOString().slice(0,10)` keying.
  const periodStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0,
  ));
  const periodEnd = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999,
  ));

  // Atomic upsert keyed on the partial unique index. If two requests race
  // on the same day-bucket, the loser performs `count = count + EXCLUDED.count`
  // instead of inserting a duplicate row.
  await db.execute(sql`
    INSERT INTO usage_tracking
      (user_id, tenant_id, module_id, action_type, count, period_start, period_end)
    VALUES
      (${opts.userId}, ${opts.tenantId}, ${opts.moduleId}, ${actionType}, ${count}, ${periodStart}, ${periodEnd})
    ON CONFLICT (user_id, tenant_id, module_id, action_type, period_start)
      WHERE module_id IS NOT NULL AND tenant_id IS NOT NULL
    DO UPDATE SET count = usage_tracking.count + EXCLUDED.count
  `);
}

export async function recordAiUsage(userId: string, tenantId: string, actionCount: number = 1): Promise<void> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const existing = await db.select().from(usageTracking).where(
    and(
      eq(usageTracking.userId, userId),
      eq(usageTracking.tenantId, tenantId),
      eq(usageTracking.actionType, 'ai_action'),
      gte(usageTracking.periodStart, periodStart),
      lte(usageTracking.periodEnd, periodEnd),
    )
  ).limit(1);

  if (existing.length > 0) {
    await db.update(usageTracking).set({
      count: existing[0].count + actionCount,
    }).where(eq(usageTracking.id, existing[0].id));
  } else {
    await db.insert(usageTracking).values({
      userId,
      tenantId,
      actionType: 'ai_action',
      count: actionCount,
      periodStart,
      periodEnd,
    });
  }
}
