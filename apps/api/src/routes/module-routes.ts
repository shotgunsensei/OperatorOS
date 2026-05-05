import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  users, subscriptions, subscriptionPlans,
  modules, ssoHandoffTokens, activityFeed, adminAuditLogs,
} from '../schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { authenticate, logAudit } from '../lib/auth.js';
import {
  hasModuleAccess, getUserModules, getModuleForUser,
  getAccessBreakdown, getModuleAccessTrace, evaluateUserEntitlement,
} from '../lib/entitlement-service.js';

/**
 * Normalize the runtime environment to the spec-mandated tri-state.
 * Spec: env claim values MUST be one of `prod | staging | dev`. The
 * receiver-side modules cross-check this exact value against their own
 * normalized env, so cross-environment drift (a `production` token
 * being honored in a `prod` receiver, or vice versa) is impossible.
 *
 * Mapping:
 *   APP_ENV=production  -> prod
 *   APP_ENV=staging     -> staging
 *   anything else / unset -> dev
 */
function normalizeEnv(raw: string | undefined): 'prod' | 'staging' | 'dev' {
  const v = (raw || '').toLowerCase().trim();
  if (v === 'prod' || v === 'production') return 'prod';
  if (v === 'staging' || v === 'stage') return 'staging';
  return 'dev';
}
const APP_ENV: 'prod' | 'staging' | 'dev' = normalizeEnv(process.env.APP_ENV || process.env.NODE_ENV);
const SSO_TOKEN_TTL_SECONDS = 90;
const OPERATOROS_BASE_URL = process.env.OPERATOROS_BASE_URL || 'http://localhost:5000';

/**
 * Resolve the shared HS256 signing key for module SSO. Hard requirement:
 *  - Production / staging: env var must be set; otherwise we issue plain
 *    (unsigned) launch URLs and surface a loud, admin-visible warning so
 *    the platform stays usable instead of locking everyone out.
 *  - Development: same fallback applies, with a console warning.
 *
 * resolveModuleSsoSecret() returns { secret, fallback }. When fallback=true,
 * launch URLs MUST omit the JWT token and the response includes a `warning`
 * string that the UI surfaces as an admin toast.
 */
function resolveModuleSsoSecret(): { secret: string | null; fallback: boolean } {
  if (process.env.MODULE_SSO_SECRET && process.env.MODULE_SSO_SECRET.length >= 16) {
    return { secret: process.env.MODULE_SSO_SECRET, fallback: false };
  }
  return { secret: null, fallback: true };
}

const { secret: MODULE_SSO_SECRET, fallback: SSO_FALLBACK } = resolveModuleSsoSecret();

/**
 * Soft-fallback posture: when MODULE_SSO_SECRET is missing we still issue
 * launch URLs but WITHOUT a signed JWT. The receiver-side modules know to
 * detect the missing token and either short-circuit auth (dev) or refuse
 * to honor it (prod). The platform stays usable in either case; the
 * `warning` field on the response surfaces an admin toast so the gap is
 * visible. This is intentional — a hard block leaves the entire module
 * grid unusable while operators rotate keys.
 */
const SSO_FALLBACK_WARNING =
  'MODULE_SSO_SECRET is not set. Module launches are sending plain URLs ' +
  'with no signed token. Set MODULE_SSO_SECRET to enable SSO handoff.';

if (SSO_FALLBACK) {
  console.warn('[module-sso] ' + SSO_FALLBACK_WARNING);
}

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

// Per-source-IP rate limiter for /v1/modules/sso/consume: 10 per minute.
// This hardens against jti enumeration / scanning attacks.
const consumeRate = new Map<string, { count: number; resetAt: number }>();
const CONSUME_RATE_LIMIT = 10;
const CONSUME_RATE_WINDOW_MS = 60_000;

function checkConsumeRate(ip: string): boolean {
  const now = Date.now();
  const cur = consumeRate.get(ip);
  if (!cur || cur.resetAt < now) {
    consumeRate.set(ip, { count: 1, resetAt: now + CONSUME_RATE_WINDOW_MS });
    return true;
  }
  if (cur.count >= CONSUME_RATE_LIMIT) return false;
  cur.count += 1;
  return true;
}

interface SsoClaims {
  iss: string;
  aud: string;
  env: string;
  sub: string;     // user id (standard claim name)
  user_id: string; // duplicated for receiver convenience
  email: string;
  role: string;
  module_slug: string;
  plan_slug: string | null;
  organization_id: string | null;
  jti: string;
  iat: number;
  exp: number;
}

/**
 * Spec-aligned launch URL: `{module_base_url}/sso?token={jwt}`. We append
 * /sso so the receiver always sees the same path regardless of base URL
 * shape. Existing query strings on baseUrl are preserved (the /sso path
 * replaces the base path component? No — base URL is treated as the
 * module ROOT; we always navigate to {root}/sso.
 */
function buildLaunchUrl(baseUrl: string, token: string | null): string {
  if (!baseUrl) return '';
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (!token) return trimmed; // fallback: no token, just root
  return `${trimmed}/sso?token=${encodeURIComponent(token)}`;
}

/**
 * Single audit-log helper for the entire SSO lifecycle — both reject
 * paths and success paths. Spec: "every reject path is audit-logged;
 * success-path parity is required."
 *
 * Always emits a structured stdout line (production log aggregation
 * captures these durably) AND attempts to insert into admin_audit_logs
 * when we have a real userId. The DB row is best-effort: the
 * admin_audit_logs.admin_id FK requires a real users row, so unauth
 * paths (unknown jti, bad_request, rate_limited) only end up in stdout.
 *
 * The `level` argument lets us tell `info` (success) apart from `warn`
 * (reject) in log streams.
 */
async function auditSso(opts: {
  userId: string | null;
  action: string;
  details: Record<string, unknown>;
  ip: string;
  level?: 'info' | 'warn';
}) {
  // Spread `details` FIRST so the authoritative envelope fields
  // (ts/action/userId/ip) cannot be silently overwritten by a caller
  // that happens to pass one of those keys inside `details`.
  const line = '[AUDIT sso] ' + JSON.stringify({
    ...opts.details,
    ts: new Date().toISOString(),
    action: opts.action,
    userId: opts.userId,
    ip: opts.ip,
  });
  if ((opts.level ?? 'warn') === 'info') console.log(line); else console.warn(line);

  if (!opts.userId) return;
  try {
    await db.insert(adminAuditLogs).values({
      adminId: opts.userId,
      action: opts.action,
      targetUserId: null,
      details: opts.details,
      ipAddress: opts.ip,
    });
  } catch (err) {
    console.error('[module-sso] audit-log insert failed:', err);
  }
}

// Backwards-compatible alias kept for the reject paths (clarity at call site).
const auditSsoReject = (opts: { userId: string | null; action: string; details: Record<string, unknown>; ip: string }) =>
  auditSso({ ...opts, level: 'warn' });

export async function registerModuleRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------------
  // GET /v1/modules — list all modules with server-resolved access state
  // -------------------------------------------------------------------------
  app.get('/v1/modules', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).user;
    const summary = await getUserModules(user.id);
    return {
      modules: summary,
      ssoFallback: SSO_FALLBACK,
      warning: SSO_FALLBACK ? SSO_FALLBACK_WARNING : null,
    };
  });

  // -------------------------------------------------------------------------
  // GET /v1/modules/debug — spec-mandated AGGREGATE access snapshot for the
  // user (or another user, if the caller is an admin).
  //
  // Returns the AccessBreakdown shape directly: plan_modules / addon_modules
  // / overrides / override_revokes / effective / access_sources, plus
  // env + ssoFallback context. The receiver can derive every per-module
  // boolean from this aggregate without N additional round trips.
  //
  // For per-module forensic detail (which evaluation step caused which
  // verdict) call `/v1/modules/debug/:slug` instead.
  // -------------------------------------------------------------------------
  app.get('/v1/modules/debug', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    // Spec contract: query param is `user_id` (snake_case). Non-admins
    // who attempt to target ANOTHER user MUST get 403 — silently falling
    // back to self-introspection would let attackers probe whether the
    // endpoint enforces authorization. Self-introspection (omitted param
    // or matching own id) is always allowed.
    const { user_id: queryUserId } = request.query as { user_id?: string };
    if (queryUserId && queryUserId !== user.id && user.role !== 'admin') {
      return reply.code(403).send({
        error: 'Only admins may inspect another user\'s entitlement state.',
        code: 'FORBIDDEN',
      });
    }
    const targetUserId = queryUserId || user.id;
    const breakdown = await getAccessBreakdown(targetUserId);
    // Spec response shape: snake_case keys, `plan` (not planSlug),
    // `effective_access` (not effective). The receiver maps directly.
    return {
      user_id: breakdown.userId,
      plan: breakdown.planSlug,
      is_admin: breakdown.isAdmin,
      plan_modules: breakdown.plan_modules,
      addon_modules: breakdown.addon_modules,
      overrides: breakdown.overrides,
      override_revokes: breakdown.override_revokes,
      effective_access: breakdown.effective,
      access_sources: breakdown.access_sources,
      env: APP_ENV,
      sso_fallback: SSO_FALLBACK,
    };
  });

  // -------------------------------------------------------------------------
  // GET /v1/modules/:slug — single-module detail, server-resolved
  // -------------------------------------------------------------------------
  app.get('/v1/modules/:slug', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { slug } = request.params as { slug: string };
    const summary = await getModuleForUser(user.id, slug);
    if (!summary) return reply.code(404).send({ error: 'Module not found' });
    return summary;
  });

  // -------------------------------------------------------------------------
  // GET /v1/modules/debug/:slug — single-module verbose breakdown
  // -------------------------------------------------------------------------
  app.get('/v1/modules/debug/:slug', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { slug } = request.params as { slug: string };
    // Same authorization rule as the aggregate /debug endpoint: non-admin
    // attempts to target another user are 403, never silently downgraded.
    const { user_id: queryUserId } = request.query as { user_id?: string };
    if (queryUserId && queryUserId !== user.id && user.role !== 'admin') {
      return reply.code(403).send({
        error: 'Only admins may inspect another user\'s entitlement state.',
        code: 'FORBIDDEN',
      });
    }
    const targetUserId = queryUserId || user.id;
    const breakdown = await getModuleAccessTrace(targetUserId, slug);
    if (!breakdown) return reply.code(404).send({ error: 'Module not found' });
    return { breakdown, evaluated_for: targetUserId, env: APP_ENV };
  });

  // -------------------------------------------------------------------------
  // POST /v1/modules/:slug/handoff — issue short-lived signed JWT + launch URL
  // -------------------------------------------------------------------------
  app.post('/v1/modules/:slug/handoff', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { slug } = request.params as { slug: string };
    const userAgent = (request.headers['user-agent'] as string) || null;

    // Per-user rate limit FIRST so unauthenticated probing can't run the
    // entitlement evaluator.
    if (!checkHandoffRate(user.id)) {
      await auditSsoReject({
        userId: user.id, action: 'sso_handoff_rate_limited',
        details: { moduleSlug: slug }, ip: request.ip,
      });
      return reply.code(429).send({
        error: 'Too many launch attempts. Please slow down.',
        code: 'RATE_LIMITED',
      });
    }

    const [mod] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
    if (!mod) {
      await auditSsoReject({
        userId: user.id, action: 'sso_handoff_module_not_found',
        details: { moduleSlug: slug }, ip: request.ip,
      });
      return reply.code(404).send({ error: 'Module not found' });
    }

    // STRICT FAIL-CLOSED GATE — the spec is explicit:
    //   "if !hasModuleAccess -> 403 before status checks"
    //
    // hasModuleAccess() is the single authorization decision and already
    // folds in module-status checks (returns hasAccess=false for
    // disabled/coming_soon). We trust its verdict here. Any failure -> 403
    // with NO detail leaked in the response body (status reason stays
    // strictly inside the audit log). This eliminates the launch endpoint
    // as a module-status oracle, AND prevents the previous bypass where
    // an entitled user got a 400-COMING_SOON differentiation that an
    // unentitled user did not — which itself was a status oracle.
    const access = await hasModuleAccess(user.id, slug);
    if (!access.hasAccess) {
      await auditSsoReject({
        userId: user.id, action: 'sso_handoff_access_denied',
        details: { moduleSlug: slug, source: access.source, reason: access.reason },
        ip: request.ip,
      });
      return reply.code(403).send({
        error: 'You do not have access to this module.',
        code: 'MODULE_ACCESS_DENIED',
        moduleSlug: slug,
      });
    }
    const entitlementSource = access.source;

    // Post-authorization configuration check. baseUrl missing is a 400
    // (entitled user, module misconfigured by ops). hasModuleAccess does
    // NOT cover this because a missing baseUrl is purely an issuance-side
    // concern — the receiver can't even be reached. Safe to surface as
    // 400 since by this point the caller IS entitled.
    if (!mod.baseUrl) {
      await auditSsoReject({
        userId: user.id, action: 'sso_handoff_no_base_url',
        details: { moduleSlug: slug }, ip: request.ip,
      });
      return reply.code(400).send({
        error: 'Module has no launch URL configured.',
        code: 'NO_BASE_URL',
      });
    }

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
    let planSlug: string | null = null;
    if (sub) {
      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
      planSlug = plan?.slug ?? null;
    }

    const jti = crypto.randomBytes(24).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    let token: string | null = null;
    if (MODULE_SSO_SECRET) {
      const claims: SsoClaims = {
        iss: OPERATOROS_BASE_URL,
        aud: slug,
        env: APP_ENV,
        sub: user.id,
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
      token = jwt.sign(claims, MODULE_SSO_SECRET, { algorithm: 'HS256' });
    }

    await db.insert(ssoHandoffTokens).values({
      jti,
      userId: user.id,
      moduleSlug: slug,
      audience: slug,
      env: APP_ENV,
      issuedIp: request.ip,
      issuedUserAgent: userAgent,
      issuedAt: new Date(now * 1000),
      expiresAt: new Date((now + SSO_TOKEN_TTL_SECONDS) * 1000),
    });

    await db.insert(activityFeed).values({
      userId: user.id,
      action: 'module_launched',
      entityType: 'module',
      entityId: mod.id,
      metadata: { moduleSlug: slug, source: entitlementSource, jti, fallback: SSO_FALLBACK },
    });

    // Success-path audit (spec: parity with reject paths)
    await auditSso({
      userId: user.id, action: 'sso_handoff_issued',
      details: {
        moduleSlug: slug, jti, source: entitlementSource,
        signed: !!token, fallback: SSO_FALLBACK,
        userAgent: userAgent ? userAgent.slice(0, 200) : null,
      },
      ip: request.ip, level: 'info',
    });

    return {
      token,
      launchUrl: buildLaunchUrl(mod.baseUrl, token),
      expiresIn: SSO_TOKEN_TTL_SECONDS,
      moduleSlug: slug,
      env: APP_ENV,
      issuer: OPERATOROS_BASE_URL,
      jti,
      ssoFallback: SSO_FALLBACK,
      warning: SSO_FALLBACK ? SSO_FALLBACK_WARNING : null,
    };
  });

  // -------------------------------------------------------------------------
  // POST /v1/modules/sso/consume — receiver-side single-use validation.
  //
  // Spec request body: { jti, aud, env }
  //   The receiving module verifies the JWT signature itself (it shares
  //   MODULE_SSO_SECRET) and then asks OperatorOS to atomically mark the
  //   jti as consumed. OperatorOS double-checks audience + env match what
  //   was originally issued.
  //
  // Status semantics:
  //   200 — consumed successfully (returns user/plan context)
  //   400 — bad request OR audience/env mismatch with stored record
  //   404 — jti not recognized (forged or never issued)
  //   409 — already consumed (replay attack)
  //   410 — token expired
  //   429 — too many requests from this IP
  // -------------------------------------------------------------------------
  app.post('/v1/modules/sso/consume', async (request, reply) => {
    const ip = request.ip;
    const userAgent = (request.headers['user-agent'] as string) || null;

    // NOTE: when MODULE_SSO_SECRET is missing we still service consume
    // requests (soft fallback) — the receiver itself is expected to
    // verify JWT signatures with the shared secret, so consume only
    // arbitrates jti/aud/env/single-use. No prod-only hard block here.

    if (!checkConsumeRate(ip)) {
      await auditSsoReject({
        userId: null, action: 'sso_consume_rate_limited',
        details: { ip }, ip,
      });
      return reply.code(429).send({ error: 'Too many requests', code: 'RATE_LIMITED' });
    }

    const body = (request.body || {}) as { jti?: string; aud?: string; env?: string };
    const { jti, aud, env } = body;

    if (!jti || typeof jti !== 'string' || !aud || !env) {
      await auditSsoReject({
        userId: null, action: 'sso_consume_bad_request',
        details: { hasJti: !!jti, hasAud: !!aud, hasEnv: !!env, ip }, ip,
      });
      return reply.code(400).send({
        error: 'jti, aud and env are required',
        code: 'BAD_REQUEST',
      });
    }

    const [row] = await db.select().from(ssoHandoffTokens)
      .where(eq(ssoHandoffTokens.jti, jti)).limit(1);

    if (!row) {
      await auditSsoReject({
        userId: null, action: 'sso_consume_unknown_jti',
        details: { jti, aud, env, ip }, ip,
      });
      return reply.code(404).send({ error: 'Token not recognized', code: 'TOKEN_UNKNOWN' });
    }

    if (row.audience !== aud) {
      await auditSsoReject({
        userId: row.userId, action: 'sso_consume_audience_mismatch',
        details: { jti, expected: row.audience, got: aud, ip }, ip,
      });
      return reply.code(400).send({
        error: `Token audience "${row.audience}" does not match requested "${aud}"`,
        code: 'AUDIENCE_MISMATCH',
      });
    }

    // Normalize the receiver-supplied env using the same mapping used at
    // issuance, so that a receiver running APP_ENV=production can still
    // consume a token whose stored env is the canonical 'prod' (and vice
    // versa). Without this we'd reject every token across legacy/new
    // env-spelling boundaries.
    const normalizedConsumeEnv = normalizeEnv(env);
    if (row.env !== normalizedConsumeEnv) {
      await auditSsoReject({
        userId: row.userId, action: 'sso_consume_env_mismatch',
        details: { jti, expected: row.env, got: normalizedConsumeEnv, raw: env, ip }, ip,
      });
      return reply.code(400).send({
        error: `Token env "${row.env}" does not match requested "${normalizedConsumeEnv}"`,
        code: 'ENV_MISMATCH',
      });
    }

    if (row.expiresAt.getTime() < Date.now()) {
      await auditSsoReject({
        userId: row.userId, action: 'sso_consume_expired',
        details: { jti, expiresAt: row.expiresAt.toISOString(), ip }, ip,
      });
      return reply.code(410).send({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }

    if (row.consumedAt) {
      await auditSsoReject({
        userId: row.userId, action: 'sso_consume_replay',
        details: { jti, consumedAt: row.consumedAt.toISOString(), originalIp: row.consumedIp, ip }, ip,
      });
      return reply.code(409).send({ error: 'Token already consumed', code: 'TOKEN_REPLAYED' });
    }

    // Atomic single-use mark
    const updated = await db.update(ssoHandoffTokens).set({
      consumedAt: new Date(),
      consumedIp: ip,
      consumedUserAgent: userAgent,
    }).where(and(
      eq(ssoHandoffTokens.jti, jti),
      sql`consumed_at IS NULL`,
    )).returning();

    if (updated.length === 0) {
      await auditSsoReject({
        userId: row.userId, action: 'sso_consume_race_replay',
        details: { jti, ip }, ip,
      });
      return reply.code(409).send({ error: 'Token already consumed', code: 'TOKEN_REPLAYED' });
    }

    // IP-mismatch advisory audit (do not deny — many legitimate clients NAT
    // through different egress IPs between issue and consume, but we want
    // forensic visibility).
    if (row.issuedIp && row.issuedIp !== ip) {
      await auditSsoReject({
        userId: row.userId, action: 'sso_consume_ip_mismatch_warning',
        details: { jti, issuedIp: row.issuedIp, consumedIp: ip }, ip,
      });
    }

    // Re-check entitlement at consume-time (fail-closed if access changed
    // between issuance and use)
    const access = await hasModuleAccess(row.userId, row.moduleSlug);
    if (!access.hasAccess) {
      await auditSsoReject({
        userId: row.userId, action: 'sso_consume_access_revoked',
        details: { jti, moduleSlug: row.moduleSlug, source: access.source, reason: access.reason }, ip,
      });
      return reply.code(403).send({
        error: 'User no longer has access to this module',
        code: 'MODULE_ACCESS_REVOKED',
      });
    }

    // Hydrate user + plan for the receiver
    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, row.userId)).limit(1);
    let planSlug: string | null = null;
    if (sub) {
      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
      planSlug = plan?.slug ?? null;
    }

    // Success-path audit (spec: parity with reject paths)
    await auditSso({
      userId: row.userId, action: 'sso_consume_success',
      details: {
        jti, moduleSlug: row.moduleSlug, accessSource: access.source,
        userAgent: userAgent ? userAgent.slice(0, 200) : null,
      },
      ip, level: 'info',
    });

    return {
      ok: true,
      user: user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null,
      moduleSlug: row.moduleSlug,
      planSlug,
      organizationId: null,
      env: row.env,
      jti,
      issuer: OPERATOROS_BASE_URL,
      accessSource: access.source,
    };
  });

  // -------------------------------------------------------------------------
  // Spec-aliased admin surfaces under /v1/modules/admin/* (the canonical
  // admin endpoints live in /v1/admin/modules — these are URL aliases that
  // call into the same implementation for spec compliance).
  // -------------------------------------------------------------------------
  app.get('/v1/modules/admin/all', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    if (user.role !== 'admin') return reply.code(403).send({ error: 'Admin only' });
    const rows = await db.select().from(modules).orderBy(modules.ord);
    const allPlans = await db.select().from(subscriptionPlans);
    const planMap = Object.fromEntries(allPlans.map(p => [p.id, p.slug]));
    const { planModules } = await import('../schema.js');
    const mappings = await db.select().from(planModules);
    const byModule: Record<string, string[]> = {};
    for (const m of mappings) {
      const slug = planMap[m.planId];
      if (!slug) continue;
      (byModule[m.moduleId] ||= []).push(slug);
    }
    return { modules: rows.map(r => ({ ...r, includedInPlans: byModule[r.id] ?? [] })) };
  });

  app.patch('/v1/modules/admin/:slug', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    if (user.role !== 'admin') return reply.code(403).send({ error: 'Admin only' });
    const { slug } = request.params as { slug: string };
    const body = request.body as any;

    for (const k of ['baseUrl', 'iconUrl'] as const) {
      const v = body[k];
      if (v && typeof v === 'string' && v.length > 0) {
        try {
          const u = new URL(v);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return reply.code(400).send({ error: `${k} must be an http(s) URL` });
          }
        } catch {
          return reply.code(400).send({ error: `${k} must be a valid URL` });
        }
      }
    }

    const updates: any = { updatedAt: new Date() };
    ['name', 'description', 'iconUrl', 'category', 'baseUrl', 'status', 'planMin', 'requiresOrg', 'ord', 'metadata']
      .forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });
    const [updated] = await db.update(modules).set(updates).where(eq(modules.slug, slug)).returning();
    if (!updated) return reply.code(404).send({ error: 'Module not found' });
    await logAudit(user.id, 'module_updated', null as any, { slug, updates }, request.ip);
    return { module: updated };
  });
}
