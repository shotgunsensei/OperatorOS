import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  users, subscriptions, subscriptionPlans,
  modules, ssoHandoffTokens, activityFeed, adminAuditLogs,
} from '../schema.js';
import { eq, and, gt, sql } from 'drizzle-orm';
import { authenticate, logAudit } from '../lib/auth.js';
import {
  hasModuleAccess, getUserModules, getAccessBreakdown,
} from '../lib/entitlement-service.js';
import { subscribeToAddon, cancelAddon } from '../lib/billing-service.js';

const APP_ENV = process.env.APP_ENV || 'development';
const SSO_TOKEN_TTL_SECONDS = 90;
const OPERATOROS_BASE_URL = process.env.OPERATOROS_BASE_URL || 'http://localhost:5000';

function resolveModuleSsoSecret(): string {
  if (process.env.MODULE_SSO_SECRET) return process.env.MODULE_SSO_SECRET;
  if (APP_ENV !== 'development') {
    // In any non-dev environment, refuse to silently reuse the session
    // secret for SSO signing — this would dramatically expand the blast
    // radius of a leaked module SSO key.
    throw new Error(
      `MODULE_SSO_SECRET is required when APP_ENV="${APP_ENV}". ` +
      `Set MODULE_SSO_SECRET to a random 32+ byte value in env.`
    );
  }
  console.warn(
    '[module-sso] MODULE_SSO_SECRET not set — falling back to SESSION_SECRET (dev only).'
  );
  return process.env.SESSION_SECRET || 'operatoros-module-sso-dev-secret';
}

const MODULE_SSO_SECRET = resolveModuleSsoSecret();

// Per-user rate limiter for handoff issuance: 10 per minute.
const handoffRate = new Map<string, { count: number; resetAt: number }>();
const HANDOFF_RATE_LIMIT = 10;
const HANDOFF_RATE_WINDOW_MS = 60_000;

function checkHandoffRate(userId: string): boolean {
  const now = Date.now();
  const cur = handoffRate.get(userId);
  if (!cur || cur.resetAt < now) {
    handoffRate.set(userId, { count: 1, resetAt: now + HANDOFF_RATE_WINDOW_MS });
    return true;
  }
  if (cur.count >= HANDOFF_RATE_LIMIT) return false;
  cur.count += 1;
  return true;
}

interface SsoClaims {
  iss: string;
  aud: string;
  env: string;
  user_id: string;
  email: string;
  role: string;
  module_slug: string;
  plan_slug: string | null;
  organization_id: string | null;
  jti: string;
  iat: number;
  exp: number;
}

function buildLaunchUrl(baseUrl: string, token: string): string {
  if (!baseUrl) return '';
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}sso=${encodeURIComponent(token)}`;
}

export async function registerModuleRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------------
  // GET /v1/modules — list all modules with access state for current user
  // -------------------------------------------------------------------------
  app.get('/v1/modules', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).user;
    const summary = await getUserModules(user.id);
    return { modules: summary };
  });

  // -------------------------------------------------------------------------
  // GET /v1/modules/:slug — single-module detail with access decision
  // -------------------------------------------------------------------------
  app.get('/v1/modules/:slug', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { slug } = request.params as { slug: string };
    const [mod] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
    if (!mod) return reply.code(404).send({ error: 'Module not found' });
    const access = await hasModuleAccess(user.id, slug);
    return { module: mod, access };
  });

  // -------------------------------------------------------------------------
  // GET /v1/modules/debug/:slug — verbose breakdown (admin or self)
  // -------------------------------------------------------------------------
  app.get('/v1/modules/debug/:slug', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { slug } = request.params as { slug: string };
    const { userId: queryUserId } = request.query as { userId?: string };

    const targetUserId = queryUserId && user.role === 'admin' ? queryUserId : user.id;
    const breakdown = await getAccessBreakdown(targetUserId, slug);
    if (!breakdown) return reply.code(404).send({ error: 'Module not found' });
    return { breakdown, evaluatedFor: targetUserId };
  });

  // -------------------------------------------------------------------------
  // POST /v1/modules/:slug/handoff — issue short-lived signed JWT + launch URL
  // -------------------------------------------------------------------------
  app.post('/v1/modules/:slug/handoff', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { slug } = request.params as { slug: string };

    if (!checkHandoffRate(user.id)) {
      return reply.code(429).send({
        error: 'Too many launch attempts. Please slow down.',
        code: 'RATE_LIMITED',
      });
    }

    const [mod] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
    if (!mod) return reply.code(404).send({ error: 'Module not found' });
    if (!mod.baseUrl) {
      return reply.code(409).send({
        error: 'Module has no launch URL configured.',
        code: 'NO_BASE_URL',
      });
    }
    if (mod.status === 'disabled') {
      return reply.code(403).send({ error: 'Module is disabled', code: 'MODULE_DISABLED' });
    }
    if (mod.status === 'coming_soon') {
      return reply.code(409).send({ error: 'Module is coming soon', code: 'MODULE_COMING_SOON' });
    }

    // Entitlement check (admins bypass via override but still need to be flagged)
    const access = await hasModuleAccess(user.id, slug);
    if (!access.hasAccess && user.role !== 'admin') {
      return reply.code(403).send({
        error: 'You do not have access to this module.',
        code: 'MODULE_ACCESS_DENIED',
        moduleSlug: slug,
        source: access.source,
        reason: access.reason,
      });
    }

    // Derive plan slug
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
    let planSlug: string | null = null;
    if (sub) {
      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
      planSlug = plan?.slug ?? null;
    }

    const jti = crypto.randomBytes(24).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    const claims: SsoClaims = {
      iss: 'operatoros',
      aud: slug,
      env: APP_ENV,
      user_id: user.id,
      email: user.email,
      role: user.role,
      module_slug: slug,
      plan_slug: planSlug,
      organization_id: null,
      jti,
      iat: now,
      exp: now + SSO_TOKEN_TTL_SECONDS,
    };

    const token = jwt.sign(claims, MODULE_SSO_SECRET, { algorithm: 'HS256' });

    const issuedIp = request.ip;
    await db.insert(ssoHandoffTokens).values({
      jti,
      userId: user.id,
      moduleSlug: slug,
      audience: slug,
      env: APP_ENV,
      issuedIp,
      expiresAt: new Date((now + SSO_TOKEN_TTL_SECONDS) * 1000),
    });

    await db.insert(activityFeed).values({
      userId: user.id,
      action: 'module_launched',
      entityType: 'module',
      entityId: mod.id,
      metadata: { moduleSlug: slug, source: access.source, jti },
    });

    return {
      token,
      launchUrl: buildLaunchUrl(mod.baseUrl, token),
      expiresIn: SSO_TOKEN_TTL_SECONDS,
      moduleSlug: slug,
      env: APP_ENV,
    };
  });

  // -------------------------------------------------------------------------
  // POST /v1/modules/sso/consume — verify + single-use consume of handoff token
  // Called by the receiving module to validate the JWT.
  // -------------------------------------------------------------------------
  app.post('/v1/modules/sso/consume', async (request, reply) => {
    const { token, expectedAudience } = (request.body || {}) as { token?: string; expectedAudience?: string };
    if (!token) return reply.code(400).send({ error: 'token is required', code: 'TOKEN_REQUIRED' });

    let claims: SsoClaims;
    try {
      claims = jwt.verify(token, MODULE_SSO_SECRET, { algorithms: ['HS256'] }) as SsoClaims;
    } catch (err: any) {
      return reply.code(401).send({ error: 'Invalid or expired token', code: 'TOKEN_INVALID' });
    }

    if (claims.env !== APP_ENV) {
      return reply.code(401).send({
        error: `Token issued for env "${claims.env}" but server is "${APP_ENV}"`,
        code: 'ENV_MISMATCH',
      });
    }
    if (expectedAudience && claims.aud !== expectedAudience) {
      return reply.code(401).send({
        error: `Token audience "${claims.aud}" does not match expected "${expectedAudience}"`,
        code: 'AUDIENCE_MISMATCH',
      });
    }

    // DB-side replay protection: the token row must exist, not be consumed,
    // and not be expired.
    const [row] = await db.select().from(ssoHandoffTokens).where(eq(ssoHandoffTokens.jti, claims.jti)).limit(1);
    if (!row) return reply.code(401).send({ error: 'Token not recognized', code: 'TOKEN_UNKNOWN' });
    if (row.consumedAt) return reply.code(410).send({ error: 'Token already consumed', code: 'TOKEN_REPLAYED' });
    if (row.expiresAt.getTime() < Date.now()) {
      return reply.code(401).send({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }

    // Mark consumed atomically; if another consumer wins the race, we treat it as replay.
    const consumedIp = request.ip;
    const updated = await db.update(ssoHandoffTokens).set({
      consumedAt: new Date(),
      consumedIp,
    }).where(and(
      eq(ssoHandoffTokens.jti, claims.jti),
      sql`consumed_at IS NULL`,
    )).returning();

    if (updated.length === 0) {
      return reply.code(410).send({ error: 'Token already consumed', code: 'TOKEN_REPLAYED' });
    }

    // Re-check entitlement at consume-time (fail-closed if the user lost access since issuance)
    const access = await hasModuleAccess(claims.user_id, claims.module_slug);
    if (!access.hasAccess) {
      return reply.code(403).send({
        error: 'User no longer has access to this module',
        code: 'MODULE_ACCESS_REVOKED',
      });
    }

    return {
      ok: true,
      user: {
        id: claims.user_id,
        email: claims.email,
        role: claims.role,
      },
      moduleSlug: claims.module_slug,
      planSlug: claims.plan_slug,
      organizationId: claims.organization_id,
      issuedAt: claims.iat,
      expiresAt: claims.exp,
      env: claims.env,
    };
  });
}
