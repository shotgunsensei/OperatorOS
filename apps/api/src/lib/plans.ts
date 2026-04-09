import { db } from '../db.js';
import {
  subscriptions, subscriptionPlans, saasWorkspaces, saasProjects,
  saasTasks, notes, workspaceMemberships, usageTracking,
} from '../schema.js';
import { eq, and, count, gte, lte } from 'drizzle-orm';

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

export const PLAN_CONFIGS: PlanConfig[] = [
  {
    slug: 'starter',
    name: 'Starter',
    price: 0,
    interval: 'month',
    description: 'For individuals getting started',
    limits: {
      maxWorkspaces: 1,
      maxProjects: 3,
      maxTasks: 50,
      maxTeamMembers: 0,
      maxAiActionsPerMonth: 10,
    },
    features: {
      exports: false,
      automation: false,
      templates: false,
      advancedAnalytics: false,
      whiteLabel: false,
      prioritySupport: false,
      customIntegrations: false,
      apiAccess: false,
    },
  },
  {
    slug: 'pro',
    name: 'Pro',
    price: 2900,
    interval: 'month',
    description: 'For growing teams and power users',
    highlight: true,
    limits: {
      maxWorkspaces: 5,
      maxProjects: 25,
      maxTasks: 500,
      maxTeamMembers: 10,
      maxAiActionsPerMonth: 200,
    },
    features: {
      exports: true,
      automation: true,
      templates: true,
      advancedAnalytics: false,
      whiteLabel: false,
      prioritySupport: true,
      customIntegrations: false,
      apiAccess: true,
    },
  },
  {
    slug: 'elite',
    name: 'Elite',
    price: 9900,
    interval: 'month',
    description: 'For enterprises and large teams',
    limits: {
      maxWorkspaces: 999,
      maxProjects: 9999,
      maxTasks: 99999,
      maxTeamMembers: 999,
      maxAiActionsPerMonth: 9999,
    },
    features: {
      exports: true,
      automation: true,
      templates: true,
      advancedAnalytics: true,
      whiteLabel: true,
      prioritySupport: true,
      customIntegrations: true,
      apiAccess: true,
    },
  },
];

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

export async function getUserUsageSummary(userId: string): Promise<UsageSummary> {
  const { config } = await getUserPlanConfig(userId);

  const [{ value: wsCount }] = await db.select({ value: count() }).from(saasWorkspaces).where(eq(saasWorkspaces.ownerId, userId));
  const [{ value: projCount }] = await db.select({ value: count() }).from(saasProjects).where(eq(saasProjects.userId, userId));
  const [{ value: taskCount }] = await db.select({ value: count() }).from(saasTasks).where(eq(saasTasks.userId, userId));

  const memberships = await db.select().from(workspaceMemberships)
    .where(eq(workspaceMemberships.userId, userId));
  const ownedWsIds: string[] = [];
  const wsOwned = await db.select().from(saasWorkspaces).where(eq(saasWorkspaces.ownerId, userId));
  wsOwned.forEach(w => ownedWsIds.push(w.id));
  let teamMemberCount = 0;
  for (const wsId of ownedWsIds) {
    const [{ value: mc }] = await db.select({ value: count() }).from(workspaceMemberships)
      .where(and(eq(workspaceMemberships.workspaceId, wsId)));
    teamMemberCount += mc - 1;
  }

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const usageRows = await db.select().from(usageTracking).where(
    and(
      eq(usageTracking.userId, userId),
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

export async function checkResourceLimit(userId: string, resource: keyof PlanLimits): Promise<PlanCheckResult> {
  const { config } = await getUserPlanConfig(userId);
  const usage = await getUserUsageSummary(userId);

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

export async function getDowngradeViolations(userId: string, targetSlug: string): Promise<PlanCheckResult[]> {
  const target = getPlanConfig(targetSlug);
  if (!target) return [];

  const usage = await getUserUsageSummary(userId);
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

export async function recordAiUsage(userId: string, actionCount: number = 1): Promise<void> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const existing = await db.select().from(usageTracking).where(
    and(
      eq(usageTracking.userId, userId),
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
      actionType: 'ai_action',
      count: actionCount,
      periodStart,
      periodEnd,
    });
  }
}
