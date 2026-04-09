import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import { users, subscriptions, subscriptionPlans, adminAuditLogs, activityFeed, usageTracking } from '../schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';

const JWT_SECRET = process.env.SESSION_SECRET || 'operatoros-dev-secret-change-me';
const JWT_EXPIRY = '7d';
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  const cookieToken = (request as any).cookies?.token;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken;

  if (!token) {
    reply.code(401).send({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    reply.code(401).send({ error: 'Invalid or expired token', code: 'TOKEN_INVALID' });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user) {
    reply.code(401).send({ error: 'User not found', code: 'USER_NOT_FOUND' });
    return;
  }

  switch (user.status) {
    case 'suspended':
      reply.code(403).send({ error: 'Account suspended. Contact support for assistance.', code: 'ACCOUNT_SUSPENDED', suspended: true });
      return;
    case 'deleted':
      reply.code(401).send({ error: 'Account has been deleted', code: 'ACCOUNT_DELETED' });
      return;
    case 'pending':
      reply.code(403).send({ error: 'Account is pending activation', code: 'ACCOUNT_PENDING' });
      return;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    reply.code(403).send({ error: 'Account temporarily locked due to too many failed login attempts', code: 'ACCOUNT_LOCKED' });
    return;
  }

  (request as any).user = user;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return;
  const user = (request as any).user;
  if (user.role !== 'admin') {
    reply.code(403).send({ error: 'Admin access required', code: 'ADMIN_REQUIRED' });
  }
}

export async function requireActiveSubscription(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return;
  const user = (request as any).user;

  const [sub] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, user.id)))
    .limit(1);

  if (!sub) {
    (request as any).subscription = null;
    (request as any).subscriptionStatus = 'none';
    return;
  }

  (request as any).subscription = sub;
  (request as any).subscriptionStatus = sub.status;

  if (sub.status === 'past_due') {
    reply.code(402).send({ error: 'Subscription payment is past due. Please update your payment method.', code: 'SUBSCRIPTION_PAST_DUE' });
    return;
  }
  if (sub.status === 'canceled' || sub.status === 'expired') {
    reply.code(403).send({ error: 'Subscription is no longer active. Please resubscribe.', code: 'SUBSCRIPTION_INACTIVE' });
    return;
  }
}

export function requirePlanFeature(featureKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    const user = (request as any).user;

    if (user.role === 'admin') return;

    const limits = await getUserPlanLimits(user.id);
    const featureMap: Record<string, boolean> = {
      exports: limits.hasExports,
      automation: limits.hasAutomation,
      templates: limits.hasTemplates,
      advancedAnalytics: limits.hasAdvancedAnalytics,
    };

    if (featureMap[featureKey] === false) {
      reply.code(403).send({
        error: `This feature requires a higher plan. Upgrade to access ${featureKey}.`,
        code: 'PLAN_FEATURE_REQUIRED',
        feature: featureKey,
        currentPlan: limits.planSlug,
        upgrade: true,
      });
    }
  };
}

export function requireUsageWithinLimit(resourceType: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    const user = (request as any).user;

    if (user.role === 'admin') return;

    const limits = await getUserPlanLimits(user.id);
    const limitMap: Record<string, number> = {
      workspaces: limits.maxWorkspaces,
      projects: limits.maxProjects,
      tasks: limits.maxTasks,
      teamMembers: limits.maxTeamMembers,
      aiActions: limits.maxAiActionsPerMonth,
    };

    const limit = limitMap[resourceType];
    if (limit === undefined) return;

    if (resourceType === 'aiActions') {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const usageRows = await db.select().from(usageTracking).where(
        and(
          eq(usageTracking.userId, user.id),
          eq(usageTracking.actionType, 'ai_action'),
          gte(usageTracking.periodStart, periodStart),
          lte(usageTracking.periodEnd, periodEnd),
        )
      );
      const totalUsage = usageRows.reduce((sum, r) => sum + r.count, 0);
      if (totalUsage >= limit) {
        reply.code(429).send({
          error: `Monthly ${resourceType} limit reached (${limit}). Upgrade for more.`,
          code: 'USAGE_LIMIT_REACHED',
          resource: resourceType,
          limit,
          used: totalUsage,
          upgrade: true,
        });
      }
    }
  };
}

export interface PlanLimits {
  maxWorkspaces: number;
  maxProjects: number;
  maxTasks: number;
  maxTeamMembers: number;
  maxAiActionsPerMonth: number;
  hasExports: boolean;
  hasAutomation: boolean;
  hasTemplates: boolean;
  hasAdvancedAnalytics: boolean;
}

const DEFAULT_LIMITS: PlanLimits = {
  maxWorkspaces: 1,
  maxProjects: 3,
  maxTasks: 50,
  maxTeamMembers: 0,
  maxAiActionsPerMonth: 10,
  hasExports: false,
  hasAutomation: false,
  hasTemplates: false,
  hasAdvancedAnalytics: false,
};

export async function getUserPlanLimits(userId: string): Promise<PlanLimits & { planSlug: string; planName: string }> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
    .limit(1);

  if (!sub) {
    return { ...DEFAULT_LIMITS, planSlug: 'starter', planName: 'Starter' };
  }

  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
  if (!plan) {
    return { ...DEFAULT_LIMITS, planSlug: 'starter', planName: 'Starter' };
  }

  return {
    maxWorkspaces: plan.maxWorkspaces,
    maxProjects: plan.maxProjects,
    maxTasks: plan.maxTasks,
    maxTeamMembers: plan.maxTeamMembers,
    maxAiActionsPerMonth: plan.maxAiActionsPerMonth,
    hasExports: plan.hasExports,
    hasAutomation: plan.hasAutomation,
    hasTemplates: plan.hasTemplates,
    hasAdvancedAnalytics: plan.hasAdvancedAnalytics,
    planSlug: plan.slug,
    planName: plan.name,
  };
}

export function sanitizeUser(user: any) {
  const { passwordHash, failedLoginCount, lockedUntil, ...safe } = user;
  return safe;
}

export async function logAudit(userId: string, action: string, targetUserId?: string, details?: Record<string, unknown>, ipAddress?: string) {
  await db.insert(adminAuditLogs).values({ adminId: userId, action, targetUserId, details, ipAddress });
}

export async function logUserActivity(userId: string, action: string, entityType: string, entityId?: string, metadata?: Record<string, unknown>) {
  await db.insert(activityFeed).values({ userId, action, entityType, entityId, metadata });
}

export async function recordFailedLogin(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return;

  const newCount = (user.failedLoginCount || 0) + 1;
  const updates: any = { failedLoginCount: newCount, updatedAt: new Date() };

  if (newCount >= MAX_FAILED_LOGINS) {
    updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
  }

  await db.update(users).set(updates).where(eq(users.id, userId));
}

export async function resetFailedLogins(userId: string) {
  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, userId));
}

export { MAX_FAILED_LOGINS, LOCKOUT_DURATION_MS };
