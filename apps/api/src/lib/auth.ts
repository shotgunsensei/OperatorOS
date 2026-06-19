import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import { users, subscriptions, adminAuditLogs, activityFeed } from '../schema.js';
import { eq, and } from 'drizzle-orm';
import { getUserPlanConfig, checkResourceLimit, checkFeatureAccess, type PlanFeatures, type PlanLimits } from './plans.js';
import { requireSessionSecret } from './session-secret.js';

const JWT_SECRET = requireSessionSecret();
const JWT_EXPIRY = '7d';
const JWT_ALGORITHM = 'HS256' as const;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  tokenVersion?: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY, algorithm: JWT_ALGORITHM });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    if (!isJwtPayload(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function isJwtPayload(decoded: unknown): decoded is JWTPayload {
  if (!decoded || typeof decoded !== 'object') return false;
  const payload = decoded as Record<string, unknown>;
  const hasIdentity =
    typeof payload.userId === 'string' &&
    payload.userId.length > 0 &&
    typeof payload.email === 'string' &&
    payload.email.length > 0 &&
    typeof payload.role === 'string' &&
    payload.role.length > 0;
  if (!hasIdentity) return false;
  if (payload.tokenVersion !== undefined && typeof payload.tokenVersion !== 'number') return false;
  return true;
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

  const tokenVer = payload.tokenVersion ?? 0;
  if (tokenVer !== user.tokenVersion) {
    reply.code(401).send({ error: 'Session has been invalidated. Please log in again.', code: 'TOKEN_REVOKED' });
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

    const result = await checkFeatureAccess(user.id, featureKey as keyof PlanFeatures);
    if (!result.allowed) {
      const { config } = await getUserPlanConfig(user.id);
      reply.code(403).send({
        error: result.message,
        code: 'PLAN_FEATURE_REQUIRED',
        feature: featureKey,
        currentPlan: config.slug,
        upgradeSlug: result.upgradeSlug,
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

    const resourceMap: Record<string, keyof PlanLimits> = {
      workspaces: 'maxWorkspaces',
      projects: 'maxProjects',
      tasks: 'maxTasks',
      teamMembers: 'maxTeamMembers',
      aiActions: 'maxAiActionsPerMonth',
    };

    const limitKey = resourceMap[resourceType];
    if (!limitKey) return;

    // Resource caps are now metered per (user, tenant). Pre-handlers must
    // resolve the active tenant before consulting limits — otherwise we
    // would either count globally (over-counting cross-tenant work) or
    // never count anything.
    const { resolveTenantContext } = await import('./tenant-auth.js');
    const ctx = await resolveTenantContext(request);
    if (!ctx) {
      reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
      return;
    }

    const result = await checkResourceLimit(user.id, ctx.tenantId, limitKey);
    if (!result.allowed) {
      const statusCode = resourceType === 'aiActions' ? 429 : 403;
      reply.code(statusCode).send({
        error: result.message,
        code: resourceType === 'aiActions' ? 'USAGE_LIMIT_REACHED' : 'RESOURCE_LIMIT_REACHED',
        resource: resourceType,
        limit: result.limit,
        used: result.used,
        upgradeSlug: result.upgradeSlug,
        upgrade: true,
      });
    }
  };
}

export async function getUserPlanLimits(userId: string): Promise<{
  maxWorkspaces: number; maxProjects: number; maxTasks: number;
  maxTeamMembers: number; maxAiActionsPerMonth: number;
  hasExports: boolean; hasAutomation: boolean; hasTemplates: boolean;
  hasAdvancedAnalytics: boolean; planSlug: string; planName: string;
}> {
  const { config } = await getUserPlanConfig(userId);
  return {
    maxWorkspaces: config.limits.maxWorkspaces,
    maxProjects: config.limits.maxProjects,
    maxTasks: config.limits.maxTasks,
    maxTeamMembers: config.limits.maxTeamMembers,
    maxAiActionsPerMonth: config.limits.maxAiActionsPerMonth,
    hasExports: config.features.exports,
    hasAutomation: config.features.automation,
    hasTemplates: config.features.templates,
    hasAdvancedAnalytics: config.features.advancedAnalytics,
    planSlug: config.slug,
    planName: config.name,
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
