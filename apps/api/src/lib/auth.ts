import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import { users, subscriptions, subscriptionPlans } from '../schema.js';
import { eq, and } from 'drizzle-orm';

const JWT_SECRET = process.env.SESSION_SECRET || 'operatoros-dev-secret-change-me';
const JWT_EXPIRY = '7d';

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
    reply.code(401).send({ error: 'Authentication required' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    reply.code(401).send({ error: 'Invalid or expired token' });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user || user.status !== 'active') {
    reply.code(user?.status === 'suspended' ? 403 : 401).send({
      error: user?.status === 'suspended' ? 'Account suspended' : 'User not found',
      suspended: user?.status === 'suspended',
    });
    return;
  }

  (request as any).user = user;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return;
  const user = (request as any).user;
  if (user.role !== 'admin') {
    reply.code(403).send({ error: 'Admin access required' });
  }
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
  const { passwordHash, ...safe } = user;
  return safe;
}
