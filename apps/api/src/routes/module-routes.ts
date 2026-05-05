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
  getActiveSubscription,
} from '../lib/entitlement-service.js';

// Map APP_ENV/NODE_ENV to the spec env tri-state: prod | staging | dev.
function normalizeEnv(raw: string | undefined): 'prod' | 'staging' | 'dev' {
  const v = (raw || '').toLowerCase().trim();
  if (v === 'prod' || v === 'production') return 'prod';
  if (v === 'staging' || v === 'stage') return 'staging';
  return 'dev';
}
const APP_ENV: 'prod' | 'staging' | 'dev' = normalizeEnv(process.env.APP_ENV || process.env.NODE_ENV);
const SSO_TOKEN_TTL_SECONDS = 90;
const OPERATOROS_BASE_URL = process.env.OPERATOROS_BASE_URL || 'http://localhost:5000';

// Shared HS256 signing key. When unset we fall back to issuing unsigned
// launch URLs (the response carries `ssoFallback: true` + a warning) so
// the platform stays usable while operators rotate keys.
function resolveModuleSsoSecret(): { secret: string | null; fallback: boolean } {
  if (process.env.MODULE_SSO_SECRET && process.env.MODULE_SSO_SECRET.length >= 16) {
    return { secret: process.env.MODULE_SSO_SECRET, fallback: false };
  }
  return { secret: null, fallback: true };
}
const { secret: MODULE_SSO_SECRET, fallback: SSO_FALLBACK } = resolveModuleSsoSecret();
const SSO_FALLBACK_WARNING =
  'MODULE_SSO_SECRET is not set. Module launches are sending plain URLs with no signed token.';
if (SSO_FALLBACK) console.warn('[module-sso] ' + SSO_FALLBACK_WARNING);

// 10 handoffs / user / minute, 10 consumes / source-IP / minute.
const HANDOFF_RATE_LIMIT = 10;
const CONSUME_RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const handoffRate = new Map<string, { count: number; resetAt: number }>();
const consumeRate = new Map<string, { count: number; resetAt: number }>();

function checkRate(map: Map<string, { count: number; resetAt: number }>, key: string, limit: number): boolean {
  const now = Date.now();
  const cur = map.get(key);
  if (!cur || cur.resetAt < now) {
    map.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}
const checkHandoffRate = (userId: string) => checkRate(handoffRate, userId, HANDOFF_RATE_LIMIT);
const checkConsumeRate = (ip: string) => checkRate(consumeRate, ip, CONSUME_RATE_LIMIT);

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

// Launch URL shape: `{module_base_url}/sso?token={jwt}`. baseUrl is the
// module ROOT; we always navigate to {root}/sso. Token-less fallback
// returns the bare root.
function buildLaunchUrl(baseUrl: string, token: string | null): string {
  if (!baseUrl) return '';
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (!token) return trimmed;
  return `${trimmed}/sso?token=${encodeURIComponent(token)}`;
}

// Audit helper. Always writes a structured stdout line; best-effort DB
// insert when a real userId is present (admin_audit_logs.admin_id FK).
async function auditSso(opts: {
  userId: string | null;
  action: string;
  details: Record<string, unknown>;
  ip: string;
  level?: 'info' | 'warn';
}) {
  // Envelope fields go LAST so callers can't overwrite them via `details`.
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
const auditSsoReject = (opts: { userId: string | null; action: string; details: Record<string, unknown>; ip: string }) =>
  auditSso({ ...opts, level: 'warn' });

export async function registerModuleRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------------
  // GET /v1/modules — list all modules with server-resolved access state
  // -------------------------------------------------------------------------
  app.get('/v1/modules', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).user;
    const summary = await getUserModules(user.id);
    // SSO fallback is an operator concern (missing MODULE_SSO_SECRET),
    // not an end-user concern. Surface the human-readable warning to
    // admins only; non-admins get the boolean so the UI can still adapt
    // its launch flow without exposing internal misconfiguration.
    const isAdmin = user.role === 'admin';
    return {
      modules: summary,
      ssoFallback: SSO_FALLBACK,
      warning: SSO_FALLBACK && isAdmin ? SSO_FALLBACK_WARNING : null,
    };
  });

  // GET /v1/modules/debug?user_id=… — aggregate access breakdown for self
  // or (admin only) another user. Spec-shaped response (snake_case keys).
  app.get('/v1/modules/debug', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { user_id: queryUserId } = request.query as { user_id?: string };
    if (queryUserId && queryUserId !== user.id && user.role !== 'admin') {
      return reply.code(403).send({
        error: 'Only admins may inspect another user\'s entitlement state.',
        code: 'FORBIDDEN',
      });
    }
    const targetUserId = queryUserId || user.id;
    const breakdown = await getAccessBreakdown(targetUserId);
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

  // GET /v1/modules/debug/:slug — single-module verbose breakdown.
  app.get('/v1/modules/debug/:slug', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { slug } = request.params as { slug: string };
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

  // POST /v1/modules/:slug/handoff — issue short-lived signed JWT + launch URL.
  // Order: rate-limit -> module exists -> entitlement (403) -> status (400) -> issue.
  app.post('/v1/modules/:slug/handoff', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { slug } = request.params as { slug: string };
    const userAgent = (request.headers['user-agent'] as string) || null;

    if (!checkHandoffRate(user.id)) {
      await auditSsoReject({
        userId: user.id, action: 'module_handoff_rate_limited',
        details: { moduleSlug: slug }, ip: request.ip,
      });
      return reply.code(429).send({ error: 'Too many launch attempts.', code: 'RATE_LIMITED' });
    }

    const [mod] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
    if (!mod) {
      await auditSsoReject({
        userId: user.id, action: 'module_handoff_module_not_found',
        details: { moduleSlug: slug }, ip: request.ip,
      });
      return reply.code(404).send({ error: 'Module not found' });
    }

    // 1. Entitlement gate (403). hasModuleAccess is entitlement-only — it
    // does NOT consider module status, so coming_soon/disabled modules
    // surface their status through the next gate (400) for entitled users.
    const access = await hasModuleAccess(user.id, slug);
    if (!access.hasAccess) {
      await auditSsoReject({
        userId: user.id, action: 'module_handoff_access_denied',
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

    // 2. Module-status gate (400) — entitled callers see why launch failed.
    if (mod.status === 'coming_soon') {
      await auditSsoReject({
        userId: user.id, action: 'module_handoff_module_coming_soon',
        details: { moduleSlug: slug }, ip: request.ip,
      });
      return reply.code(400).send({ error: 'Module is coming soon.', code: 'MODULE_COMING_SOON' });
    }
    if (mod.status === 'disabled') {
      await auditSsoReject({
        userId: user.id, action: 'module_handoff_module_disabled',
        details: { moduleSlug: slug }, ip: request.ip,
      });
      return reply.code(400).send({ error: 'Module is disabled.', code: 'MODULE_DISABLED' });
    }
    if (!mod.baseUrl) {
      await auditSsoReject({
        userId: user.id, action: 'module_handoff_no_base_url',
        details: { moduleSlug: slug }, ip: request.ip,
      });
      return reply.code(400).send({ error: 'Module has no launch URL configured.', code: 'NO_BASE_URL' });
    }

    const sub = await getActiveSubscription(user.id);
    let planSlug: string | null = null;
    if (sub) {
      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
      planSlug = plan?.slug ?? null;
    }

    const jti = crypto.randomBytes(24).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    let token: string | null = null;
    // Wrap the signing + persistence + activity insert in a single try
    // so any internal failure (sign error, DB outage, FK violation) is
    // explicitly audited instead of falling through Fastify's generic
    // 500 handler. Re-throws so the client still gets a 5xx; the audit
    // trail captures *which* user attempted *which* module *when* and
    // *why* it failed — required for handoff reject-path observability.
    try {
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
        aud: slug,
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
    } catch (err: any) {
      await auditSsoReject({
        userId: user.id, action: 'module_handoff_internal_error',
        details: {
          moduleSlug: slug, jti,
          stage: token ? 'persist' : 'sign',
          error: err?.message || String(err),
        },
        ip: request.ip,
      });
      return reply.code(500).send({
        error: 'Internal error issuing handoff token.',
        code: 'MODULE_HANDOFF_INTERNAL_ERROR',
      });
    }

    await auditSso({
      userId: user.id, action: 'module_handoff_issued',
      details: {
        moduleSlug: slug, jti, source: entitlementSource,
        signed: !!token, fallback: SSO_FALLBACK,
        userAgent: userAgent ? userAgent.slice(0, 200) : null,
      },
      ip: request.ip, level: 'info',
    });

    // Spec contract uses `redirect_url`; older clients (Apps UI in this
    // repo) consume `launchUrl`. Emit both so the spec name is
    // canonical and the existing UI keeps working.
    const launchUrl = buildLaunchUrl(mod.baseUrl, token);
    const isAdmin = user.role === 'admin';
    return {
      token,
      redirect_url: launchUrl,
      launchUrl,
      expiresIn: SSO_TOKEN_TTL_SECONDS,
      moduleSlug: slug,
      env: APP_ENV,
      issuer: OPERATOROS_BASE_URL,
      jti,
      ssoFallback: SSO_FALLBACK,
      warning: SSO_FALLBACK && isAdmin ? SSO_FALLBACK_WARNING : null,
    };
  });

  // POST /v1/modules/sso/consume — receiver-side single-use validation.
  // Body: { jti, aud, env }. Status semantics:
  //   200 ok | 400 bad_request|audience|env_mismatch | 404 unknown_jti
  //   409 replayed | 410 expired | 403 access_revoked | 429 rate_limited
  app.post('/v1/modules/sso/consume', async (request, reply) => {
    const ip = request.ip;
    const userAgent = (request.headers['user-agent'] as string) || null;

    if (!checkConsumeRate(ip)) {
      await auditSsoReject({
        userId: null, action: 'module_consume_rate_limited',
        details: { ip }, ip,
      });
      return reply.code(429).send({ error: 'Too many requests', code: 'RATE_LIMITED' });
    }

    const body = (request.body || {}) as { jti?: string; aud?: string; env?: string };
    const { jti, aud, env } = body;

    if (!jti || typeof jti !== 'string' || !aud || !env) {
      await auditSsoReject({
        userId: null, action: 'module_consume_bad_request',
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
        userId: null, action: 'module_consume_unknown_jti',
        details: { jti, aud, env, ip }, ip,
      });
      return reply.code(404).send({ error: 'Token not recognized', code: 'TOKEN_UNKNOWN' });
    }

    if (row.aud !== aud) {
      await auditSsoReject({
        userId: row.userId, action: 'module_consume_audience_mismatch',
        details: { jti, expected: row.aud, got: aud, ip }, ip,
      });
      return reply.code(400).send({
        error: `Token audience "${row.aud}" does not match requested "${aud}"`,
        code: 'AUDIENCE_MISMATCH',
      });
    }

    // Normalize so APP_ENV=production / staging / dev all match their
    // canonical prod / staging / dev counterparts.
    const normalizedConsumeEnv = normalizeEnv(env);
    if (row.env !== normalizedConsumeEnv) {
      await auditSsoReject({
        userId: row.userId, action: 'module_consume_env_mismatch',
        details: { jti, expected: row.env, got: normalizedConsumeEnv, raw: env, ip }, ip,
      });
      return reply.code(400).send({
        error: `Token env "${row.env}" does not match requested "${normalizedConsumeEnv}"`,
        code: 'ENV_MISMATCH',
      });
    }

    if (row.expiresAt.getTime() < Date.now()) {
      await auditSsoReject({
        userId: row.userId, action: 'module_consume_expired',
        details: { jti, expiresAt: row.expiresAt.toISOString(), ip }, ip,
      });
      return reply.code(410).send({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }

    if (row.consumedAt) {
      await auditSsoReject({
        userId: row.userId, action: 'module_handoff_replay_blocked',
        details: { jti, consumedAt: row.consumedAt.toISOString(), originalIp: row.consumedIp, ip }, ip,
      });
      return reply.code(409).send({ error: 'Token already consumed', code: 'TOKEN_REPLAYED' });
    }

    // Atomic single-use mark
    const updated = await db.update(ssoHandoffTokens).set({
      consumedAt: new Date(),
      consumedIp: ip,
      consumedByUserAgent: userAgent,
    }).where(and(
      eq(ssoHandoffTokens.jti, jti),
      sql`consumed_at IS NULL`,
    )).returning();

    if (updated.length === 0) {
      await auditSsoReject({
        userId: row.userId, action: 'module_handoff_replay_blocked',
        details: { jti, ip, race: true }, ip,
      });
      return reply.code(409).send({ error: 'Token already consumed', code: 'TOKEN_REPLAYED' });
    }

    // IP-mismatch advisory audit (do not deny — NAT/mobile roaming).
    if (row.issuedIp && row.issuedIp !== ip) {
      await auditSsoReject({
        userId: row.userId, action: 'module_handoff_ip_mismatch',
        details: { jti, issuedIp: row.issuedIp, consumedIp: ip }, ip,
      });
    }

    // Re-check entitlement at consume-time (fail-closed if access changed).
    const access = await hasModuleAccess(row.userId, row.moduleSlug);
    if (!access.hasAccess) {
      await auditSsoReject({
        userId: row.userId, action: 'module_consume_access_revoked',
        details: { jti, moduleSlug: row.moduleSlug, source: access.source, reason: access.reason }, ip,
      });
      return reply.code(403).send({
        error: 'User no longer has access to this module',
        code: 'MODULE_ACCESS_REVOKED',
      });
    }

    // Hydrate user + plan for the receiver
    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    const sub = await getActiveSubscription(row.userId);
    let planSlug: string | null = null;
    if (sub) {
      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1);
      planSlug = plan?.slug ?? null;
    }

    await auditSso({
      userId: row.userId, action: 'module_handoff_consumed',
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

  // Spec-aliased admin surfaces under /v1/modules/admin/*.
  // Returns the catalog plus per-module entitlement counts grouped by source
  // (plan / addon / override) and a deduplicated total. Used by the admin
  // Modules tab to surface adoption per module.
  app.get('/v1/modules/admin/all', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    if (user.role !== 'admin') return reply.code(403).send({ error: 'Admin only' });
    const { planModules, addonSubscriptions, entitlementOverrides, subscriptions } = await import('../schema.js');
    const rows = await db.select().from(modules).orderBy(modules.ord);
    const allPlans = await db.select().from(subscriptionPlans);
    const planMap = Object.fromEntries(allPlans.map(p => [p.id, p.slug]));
    const mappings = await db.select().from(planModules);
    const byModule: Record<string, string[]> = {};
    const planIdsByModule: Record<string, string[]> = {};
    for (const m of mappings) {
      const slug = planMap[m.planId];
      if (!slug) continue;
      (byModule[m.moduleId] ||= []).push(slug);
      (planIdsByModule[m.moduleId] ||= []).push(m.planId);
    }

    // addon counts: distinct users with active/trialing addon per module
    const addonRows = await db
      .select({ moduleId: addonSubscriptions.moduleId, userId: addonSubscriptions.userId })
      .from(addonSubscriptions)
      .where(sql`${addonSubscriptions.status} IN ('active','trialing')`);
    const addonByModule: Record<string, Set<string>> = {};
    for (const r of addonRows) (addonByModule[r.moduleId] ||= new Set()).add(r.userId);

    // override counts: granted=true, not expired
    const overrideRows = await db
      .select({ moduleId: entitlementOverrides.moduleId, userId: entitlementOverrides.userId })
      .from(entitlementOverrides)
      .where(sql`${entitlementOverrides.grant} = true AND (${entitlementOverrides.expiresAt} IS NULL OR ${entitlementOverrides.expiresAt} > NOW())`);
    const overrideByModule: Record<string, Set<string>> = {};
    for (const r of overrideRows) (overrideByModule[r.moduleId] ||= new Set()).add(r.userId);

    // plan counts: distinct users with an active/trialing subscription whose
    // plan includes the module. One scan over active subs is enough.
    const subRows = await db
      .select({ userId: subscriptions.userId, planId: subscriptions.planId })
      .from(subscriptions)
      .where(sql`${subscriptions.status} IN ('active','trialing')`);
    const planByModule: Record<string, Set<string>> = {};
    for (const s of subRows) {
      for (const [moduleId, planIds] of Object.entries(planIdsByModule)) {
        if (planIds.includes(s.planId)) (planByModule[moduleId] ||= new Set()).add(s.userId);
      }
    }

    return {
      modules: rows.map(r => {
        const planUsers = planByModule[r.id] ?? new Set<string>();
        const addonUsers = addonByModule[r.id] ?? new Set<string>();
        const overrideUsers = overrideByModule[r.id] ?? new Set<string>();
        const total = new Set<string>([...planUsers, ...addonUsers, ...overrideUsers]);
        return {
          ...r,
          includedInPlans: byModule[r.id] ?? [],
          entitlementCounts: {
            plan: planUsers.size,
            addon: addonUsers.size,
            override: overrideUsers.size,
            total: total.size,
          },
        };
      }),
    };
  });

  // POST /v1/modules/admin/grant — admin grants a per-user module override.
  // Body: { user_id, module_slug, reason?, expires_at? }
  app.post('/v1/modules/admin/grant', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    if (user.role !== 'admin') return reply.code(403).send({ error: 'Admin only' });
    const { user_id, module_slug, reason, expires_at } = (request.body ?? {}) as {
      user_id?: string; module_slug?: string; reason?: string; expires_at?: string;
    };
    if (!user_id || !module_slug) {
      return reply.code(400).send({ error: 'user_id and module_slug are required', code: 'BAD_REQUEST' });
    }
    const [targetUser] = await db.select().from(users).where(eq(users.id, user_id)).limit(1);
    if (!targetUser) return reply.code(404).send({ error: 'User not found' });
    const [mod] = await db.select().from(modules).where(eq(modules.slug, module_slug)).limit(1);
    if (!mod) return reply.code(404).send({ error: 'Module not found' });

    const { entitlementOverrides } = await import('../schema.js');
    const expires = expires_at ? new Date(expires_at) : null;
    if (expires && Number.isNaN(expires.getTime())) {
      return reply.code(400).send({ error: 'expires_at must be a valid ISO date', code: 'BAD_REQUEST' });
    }
    const [row] = await db.insert(entitlementOverrides).values({
      userId: user_id, moduleId: mod.id, grant: true,
      reason: reason ?? null, expiresAt: expires, createdByAdminId: user.id,
    }).returning();
    await logAudit(user.id, 'module_override_grant', user_id, { moduleSlug: module_slug, reason, expires_at }, request.ip);
    return { override: row };
  });

  // POST /v1/modules/admin/revoke — admin revokes a per-user module override.
  // Body: { user_id, module_slug, reason? }
  app.post('/v1/modules/admin/revoke', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    if (user.role !== 'admin') return reply.code(403).send({ error: 'Admin only' });
    const { user_id, module_slug, reason } = (request.body ?? {}) as {
      user_id?: string; module_slug?: string; reason?: string;
    };
    if (!user_id || !module_slug) {
      return reply.code(400).send({ error: 'user_id and module_slug are required', code: 'BAD_REQUEST' });
    }
    const [targetUser] = await db.select().from(users).where(eq(users.id, user_id)).limit(1);
    if (!targetUser) return reply.code(404).send({ error: 'User not found' });
    const [mod] = await db.select().from(modules).where(eq(modules.slug, module_slug)).limit(1);
    if (!mod) return reply.code(404).send({ error: 'Module not found' });

    const { entitlementOverrides } = await import('../schema.js');
    const [row] = await db.insert(entitlementOverrides).values({
      userId: user_id, moduleId: mod.id, grant: false,
      reason: reason ?? null, expiresAt: null, createdByAdminId: user.id,
    }).returning();
    await logAudit(user.id, 'module_override_revoke', user_id, { moduleSlug: module_slug, reason }, request.ip);
    return { override: row };
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
    await logAudit(user.id, 'module_updated', undefined, { slug, updates }, request.ip);
    return { module: updated };
  });
}
