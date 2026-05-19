import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db } from '../db.js';
import {
  users, subscriptions, subscriptionPlans,
  modules, ssoHandoffTokens, activityFeed, adminAuditLogs,
  tenantUsers, tenantModules, tenantUserModuleAccess,
} from '../schema.js';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { authenticate, logAudit } from '../lib/auth.js';
import { resolveTenantContext, requireTenantMember, requireSuperAdmin } from '../lib/tenant-auth.js';
import { recordModuleUsage } from '../lib/plans.js';
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

// Resolve the original client IP. Forwarding headers (x-forwarded-for,
// x-real-ip) are TRUSTED ONLY when TRUST_PROXY=1 (explicit deployment
// opt-in behind a known reverse proxy). Otherwise we use request.ip,
// because an unauthenticated endpoint that trusts client-supplied
// headers lets an attacker bypass per-IP rate limits and audit
// attribution by spoofing forwarding metadata.
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
export function getClientIp(request: FastifyRequest): string {
  if (TRUST_PROXY) {
    const xff = request.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
    if (Array.isArray(xff) && xff.length > 0) {
      const first = String(xff[0]).split(',')[0]?.trim();
      if (first) return first;
    }
    const real = request.headers['x-real-ip'];
    if (typeof real === 'string' && real.length > 0) return real;
  }
  return request.ip || '0.0.0.0';
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
  // ---- Task #108: append-only entitlement claims (do NOT rename above) ----
  /** Active tenant the launch is scoped to (legacy short name). */
  tenant_id?: string;
  /** Spec name — duplicate of tenant_id so receivers can match on the
   *  canonical key without breaking older receivers that read tenant_id. */
  operatoros_tenant_id?: string;
  /** Internal tenant role (owner|admin|member). */
  tenant_role?: string;
  /** Public tenant role alias (owner|tenant_admin|billing_admin|user|viewer). */
  tenant_role_alias?: string;
  /** Current subscription.status at issue time (active|trialing|past_due|canceled|null). */
  subscription_status?: string | null;
  /** TRUE iff target module is enabled for this user right now. */
  target_module_enabled?: boolean;
  /** Internal access level for the target module (none|user|manager). */
  target_module_access_level?: string;
  /** Public role for the target module (module_admin|module_user|viewer|none). */
  target_module_role?: string;
  /** Merged feature flags for the target module. */
  target_module_features?: Record<string, boolean | number | string>;
  /** Summary list of slugs for every module currently enabled for the user. */
  all_enabled_modules?: string[];
  /** Internal per-module access level (legacy name, kept for back-compat). */
  module_role?: string;
  /** Public module role alias (legacy name, kept for back-compat). */
  module_role_alias?: string;
  /** Plan capability map (feature flags) at issue time. */
  plan_capabilities?: Record<string, boolean>;
  /** Plan limit map (numeric/boolean caps) at issue time. */
  limits?: Record<string, number | boolean>;
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
  // GET /v1/me/modules — flat list of modules accessible to caller across
  // every tenant they belong to, collapsed to one row per slug. Used by the
  // My Apps launchpad. Surface is intentionally minimal (no pricing / CTA
  // logic — that lives in /v1/modules for the marketplace).
  // -------------------------------------------------------------------------
  app.get('/v1/me/modules', { preHandler: [authenticate] }, async (request) => {
    const user = (request as any).user;

    // Gate 3: tenant-scoped resolution. We enumerate every tenant the user
    // is a member of and union module access from those tenants' rows in
    // `tenant_modules` + `tenant_user_module_access`. We never fall back
    // to the legacy per-user entitlement path here — module visibility on
    // the launchpad must reflect tenant boundaries.
    const memberships = await db.select().from(tenantUsers)
      .where(eq(tenantUsers.userId, user.id));

    if (memberships.length === 0) {
      return { modules: [] };
    }

    const tenantIds = memberships.map(m => m.tenantId);

    // Tenant-modules currently active (launchable) for any of those tenants.
    const launchable: Array<'enabled' | 'trial' | 'purchased' | 'beta'> = ['enabled', 'trial', 'purchased', 'beta'];
    const tms = await db.select().from(tenantModules)
      .where(and(
        inArray(tenantModules.tenantId, tenantIds),
        inArray(tenantModules.status, launchable),
      ));
    if (tms.length === 0) return { modules: [] };

    const moduleIds = Array.from(new Set(tms.map(t => t.moduleId)));
    const accessRows = await db.select().from(tenantUserModuleAccess)
      .where(and(
        inArray(tenantUserModuleAccess.tenantId, tenantIds),
        eq(tenantUserModuleAccess.userId, user.id),
        inArray(tenantUserModuleAccess.moduleId, moduleIds),
      ));
    // key: `${tenantId}:${moduleId}` -> accessLevel ('none' | 'user' | 'manager')
    const accMap = new Map<string, string>();
    for (const a of accessRows) accMap.set(`${a.tenantId}:${a.moduleId}`, a.accessLevel);

    // Decide visibility per (tenant, module). Explicit 'none' denies even when
    // allowAllMembers is true; explicit 'user'/'manager' grants regardless.
    const allowedModuleIds = new Set<string>();
    for (const tm of tms) {
      const key = `${tm.tenantId}:${tm.moduleId}`;
      const acc = accMap.get(key);
      if (acc === 'none') continue;
      if (acc === 'user' || acc === 'manager') {
        allowedModuleIds.add(tm.moduleId);
        continue;
      }
      if (tm.allowAllMembers) allowedModuleIds.add(tm.moduleId);
    }

    if (allowedModuleIds.size === 0) return { modules: [] };

    const allowed = await db.select().from(modules)
      .where(inArray(modules.id, Array.from(allowedModuleIds)));
    // Launchpad only surfaces actually-launchable modules: live OR beta
    // status AND a baseUrl configured.
    const unlocked = allowed
      .filter(m => (m.status === 'live' || m.status === 'beta') && !!m.baseUrl)
      .sort((a, b) => a.ord - b.ord)
      .map(m => ({
        slug: m.slug,
        name: m.name,
        description: m.description,
        category: m.category,
        iconUrl: m.iconUrl,
        baseUrl: m.baseUrl,
      }));
    return { modules: unlocked };
  });

  // -------------------------------------------------------------------------
  // GET /v1/modules — list all modules with server-resolved access state
  // -------------------------------------------------------------------------
  app.get('/v1/modules', { preHandler: [requireTenantMember] }, async (request) => {
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const summary = await getUserModules(user.id, ctx.tenantId);
    // SSO fallback is an operator concern (missing MODULE_SSO_SECRET),
    // not an end-user concern. Surface the human-readable warning to
    // admins only; non-admins get the boolean so the UI can still adapt
    // its launch flow without exposing internal misconfiguration.
    const isAdmin = user.platformRole === 'super_admin';
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
    if (queryUserId && queryUserId !== user.id && user.platformRole !== 'super_admin') {
      return reply.code(403).send({
        error: 'Only super-admins may inspect another user\'s entitlement state.',
        code: 'PLATFORM_ROLE_REQUIRED',
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
  app.get('/v1/modules/:slug', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const { slug } = request.params as { slug: string };
    const summary = await getModuleForUser(user.id, ctx.tenantId, slug);
    if (!summary) return reply.code(404).send({ error: 'Module not found' });
    return summary;
  });

  // GET /v1/modules/debug/:slug — single-module verbose breakdown.
  app.get('/v1/modules/debug/:slug', { preHandler: [authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const { slug } = request.params as { slug: string };
    const { user_id: queryUserId } = request.query as { user_id?: string };
    if (queryUserId && queryUserId !== user.id && user.platformRole !== 'super_admin') {
      return reply.code(403).send({
        error: 'Only super-admins may inspect another user\'s entitlement state.',
        code: 'PLATFORM_ROLE_REQUIRED',
      });
    }
    const targetUserId = queryUserId || user.id;
    const ctx = await resolveTenantContext(request);
    if (!ctx) return reply.code(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    const breakdown = await getModuleAccessTrace(targetUserId, ctx.tenantId, slug);
    if (!breakdown) return reply.code(404).send({ error: 'Module not found' });
    return { breakdown, evaluated_for: targetUserId, env: APP_ENV };
  });

  // POST /v1/modules/:slug/handoff — issue short-lived signed JWT + launch URL.
  // Order: rate-limit -> module exists -> entitlement (403) -> status (400) -> issue.
  app.post('/v1/modules/:slug/handoff', { preHandler: [requireTenantMember] }, async (request, reply) => {
    const user = (request as any).user;
    const ctx = (request as any).tenantContext;
    const { slug } = request.params as { slug: string };
    const userAgent = (request.headers['user-agent'] as string) || null;

    if (!checkHandoffRate(user.id)) {
      await auditSsoReject({
        userId: user.id, action: 'module_handoff_rate_limited',
        details: { moduleSlug: slug }, ip: getClientIp(request),
      });
      return reply.code(429).send({ error: 'Too many launch attempts.', code: 'RATE_LIMITED' });
    }

    const [mod] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
    if (!mod) {
      await auditSsoReject({
        userId: user.id, action: 'module_handoff_module_not_found',
        details: { moduleSlug: slug }, ip: getClientIp(request),
      });
      return reply.code(404).send({ error: 'Module not found' });
    }

    // 1. Entitlement gate (403). hasModuleAccess is entitlement-only — it
    // does NOT consider module status, so coming_soon/disabled modules
    // surface their status through the next gate (400) for entitled users.
    const access = await hasModuleAccess(user.id, ctx.tenantId, slug);
    if (!access.hasAccess) {
      await auditSsoReject({
        userId: user.id, action: 'module_handoff_access_denied',
        details: { moduleSlug: slug, source: access.source, reason: access.reason },
        ip: getClientIp(request),
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
        details: { moduleSlug: slug }, ip: getClientIp(request),
      });
      return reply.code(400).send({ error: 'Module is coming soon.', code: 'MODULE_COMING_SOON' });
    }
    if (mod.status === 'disabled') {
      await auditSsoReject({
        userId: user.id, action: 'module_handoff_module_disabled',
        details: { moduleSlug: slug }, ip: getClientIp(request),
      });
      return reply.code(400).send({ error: 'Module is disabled.', code: 'MODULE_DISABLED' });
    }
    if (!mod.baseUrl) {
      await auditSsoReject({
        userId: user.id, action: 'module_handoff_no_base_url',
        details: { moduleSlug: slug }, ip: getClientIp(request),
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
        // Task #108: enrich JWT claims with the centralized entitlement
        // snapshot so receivers can read tenant role, module role, plan
        // capabilities, and limits without a follow-up API call.
        // Append-only: every original claim above stays as-is.
        let extraClaims: Partial<SsoClaims> = {};
        try {
          const { resolveEntitlements } = await import('../lib/entitlement-resolver.js');
          const snapshot = await resolveEntitlements(user.id, ctx.tenantId);
          if (snapshot) {
            const modEntry = snapshot.modules.find(m => m.slug === slug);
            extraClaims = {
              // Legacy + spec names side-by-side (append-only).
              tenant_id: snapshot.tenant.id,
              operatoros_tenant_id: snapshot.tenant.id,
              tenant_role: snapshot.tenant.role ?? undefined,
              tenant_role_alias: snapshot.tenant.roleAlias,
              subscription_status: snapshot.subscription?.status ?? null,
              target_module_enabled: !!modEntry?.enabled,
              target_module_access_level: modEntry?.accessLevel,
              target_module_role: modEntry?.moduleRole,
              target_module_features: modEntry?.features ?? {},
              all_enabled_modules: snapshot.modules.filter(m => m.enabled).map(m => m.slug),
              // Legacy names retained for back-compat:
              module_role: modEntry?.accessLevel,
              module_role_alias: modEntry?.moduleRole,
              plan_capabilities: snapshot.capabilities,
              limits: snapshot.limits,
            };
          }
        } catch (enrichErr) {
          // Enrichment is best-effort; never block the launch on a
          // resolver hiccup. Receivers can fall back to introspect.
          console.warn('[module-sso] entitlement enrichment failed:', enrichErr);
        }

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
          ...extraClaims,
        };
        token = jwt.sign(claims, MODULE_SSO_SECRET, { algorithm: 'HS256' });
      }

      await db.insert(ssoHandoffTokens).values({
        jti,
        userId: user.id,
        tenantId: ctx.tenantId,
        moduleSlug: slug,
        aud: slug,
        env: APP_ENV,
        issuedIp: getClientIp(request),
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

      // Task #31: per-module telemetry. Recorded on issue (intent + the
      // moment we know the launch happened from the platform side — many
      // module receivers won't necessarily call /sso/consume in dev). Best
      // effort: a failure here must not break the launch.
      try {
        await recordModuleUsage({
          userId: user.id,
          tenantId: ctx.tenantId,
          moduleId: mod.id,
        });
      } catch (usageErr) {
        console.warn('[module-sso] recordModuleUsage failed:', usageErr);
      }
    } catch (err: any) {
      await auditSsoReject({
        userId: user.id, action: 'module_handoff_internal_error',
        details: {
          moduleSlug: slug, jti,
          stage: token ? 'persist' : 'sign',
          error: err?.message || String(err),
        },
        ip: getClientIp(request),
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
      ip: getClientIp(request), level: 'info',
    });

    // Spec contract uses `redirect_url`; older clients (Apps UI in this
    // repo) consume `launchUrl`. Emit both so the spec name is
    // canonical and the existing UI keeps working.
    const launchUrl = buildLaunchUrl(mod.baseUrl, token);
    const isAdmin = user.platformRole === 'super_admin';
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
  //   409 replayed | 410 expired_or_revoked | 429 rate_limited
  app.post('/v1/modules/sso/consume', async (request, reply) => {
    const ip = getClientIp(request);
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

    // Re-check entitlement BEFORE the atomic consume mark. If access was
    // revoked between issue and consume, we must NOT burn the token —
    // otherwise a transient revocation permanently invalidates an
    // unconsumed handoff. Returning 410 (TOKEN_EXPIRED) keeps the consume
    // contract within the documented status set (200/400/404/409/410/429)
    // and lets the user simply re-launch (the next handoff will fail at
    // issue time with 403, the canonical entitlement-deny surface).
    // Re-verify entitlement against the SAME tenant the token was issued
    // for. Without this, a token minted under tenant A could be honored
    // even if the user lost access in A — or worse, replayed in another
    // tenant context.
    if (!row.tenantId) {
      await auditSsoReject({
        userId: row.userId, action: 'module_consume_no_tenant',
        details: { jti, ip }, ip,
      });
      return reply.code(410).send({ error: 'Token no longer valid', code: 'TOKEN_EXPIRED' });
    }
    const access = await hasModuleAccess(row.userId, row.tenantId, row.moduleSlug);
    if (!access.hasAccess) {
      await auditSsoReject({
        userId: row.userId, action: 'module_consume_access_revoked',
        details: { jti, moduleSlug: row.moduleSlug, source: access.source, reason: access.reason }, ip,
      });
      return reply.code(410).send({
        error: 'Token no longer valid',
        code: 'TOKEN_EXPIRED',
      });
    }

    // Atomic single-use claim. Loses the race => 409 replay.
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

    // Advisory audit only — do not deny on IP mismatch (NAT, mobile roaming).
    if (row.issuedIp && row.issuedIp !== ip) {
      await auditSsoReject({
        userId: row.userId, action: 'module_handoff_ip_mismatch',
        details: { jti, issuedIp: row.issuedIp, consumedIp: ip }, ip,
      });
    }

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

    // Task #31: per-module telemetry on confirmed launch (receiver-side
    // exchange). Distinct actionType so the Tenant Command Center chart
    // (which sums only 'module_usage') doesn't double-count this against
    // the issued handoff. Best effort — never block the consume reply.
    try {
      const [consumedMod] = await db.select({ id: modules.id }).from(modules)
        .where(eq(modules.slug, row.moduleSlug)).limit(1);
      if (consumedMod && row.tenantId) {
        await recordModuleUsage({
          userId: row.userId,
          tenantId: row.tenantId,
          moduleId: consumedMod.id,
          actionType: 'module_launch_confirmed',
        });
      }
    } catch (usageErr) {
      console.warn('[module-sso] recordModuleUsage (consume) failed:', usageErr);
    }

    // Task #108: echo the canonical snapshot byte-for-byte. Receivers
    // get the SAME shape they would get from /v1/sso/entitlements/introspect
    // — no renamed/transformed fields, so the same client-side code path
    // can consume both responses.
    let snapshot: any = null;
    try {
      const { resolveEntitlements } = await import('../lib/entitlement-resolver.js');
      snapshot = await resolveEntitlements(row.userId, row.tenantId);
    } catch (err) {
      request.log.warn({ err }, '[module-sso] consume entitlement enrichment failed');
    }

    return {
      ok: true,
      user: user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null,
      moduleSlug: row.moduleSlug,
      operatoros_tenant_id: row.tenantId,
      planSlug,
      organizationId: null,
      env: row.env,
      jti,
      issuer: OPERATOROS_BASE_URL,
      accessSource: access.source,
      snapshot,
    };
  });

  // -------------------------------------------------------------------------
  // POST /v1/modules/sso/diagnose — operator-side smoke test for child apps.
  //
  // Onboarding a child module into the SSO handoff requires SIX env values
  // to line up exactly across the hub and the child:
  //
  //   1. The module slug must exist in the hub's `modules` table.
  //   2. The module row must carry a `base_url` (else handoff 400s).
  //   3. The hub must have `MODULE_SSO_SECRET` set (else it falls into
  //      unsigned-fallback mode and the child receives no token).
  //   4. The child's `OPERATOROS_BASE_URL` must match the hub's
  //      `OPERATOROS_BASE_URL` byte-for-byte (compared against `iss`).
  //   5. The child's `APP_ENV` must normalize to the same tri-state
  //      (`prod`/`staging`/`dev`) as the hub's.
  //   6. The child's `MODULE_SSO_SECRET` must equal the hub's — we can't
  //      verify equality without transmitting it (and we won't), but we
  //      can rule out a one-side-not-set / length-drift bug if the child
  //      reports the LENGTH of its secret.
  //
  // Hitting this endpoint with a one-line curl from the operator's
  // console shortens onboarding from "stare at silent failures for an
  // hour" to "see exactly which value is off".
  //
  // Super-admin only — the response leaks the hub's `OPERATOROS_BASE_URL`,
  // its normalized `APP_ENV`, and whether `MODULE_SSO_SECRET` is set.
  // That's harmless to operators and toxic to anonymous callers.
  // -------------------------------------------------------------------------
  app.post('/v1/modules/sso/diagnose', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const body = (request.body ?? {}) as {
      moduleSlug?: string;
      claimedIssuer?: string;
      claimedEnv?: string;
      claimedSecretLength?: number;
    };
    if (!body.moduleSlug || typeof body.moduleSlug !== 'string') {
      return reply.code(400).send({ error: 'moduleSlug is required', code: 'BAD_REQUEST' });
    }

    const checks: Record<string, {
      ok: boolean;
      expected: unknown;
      claimed: unknown;
      hint?: string;
    }> = {};

    // 1 + 2. Module slug + base_url.
    const [mod] = await db.select().from(modules).where(eq(modules.slug, body.moduleSlug)).limit(1);
    checks.moduleExists = {
      ok: !!mod,
      expected: 'row in modules table',
      claimed: body.moduleSlug,
      hint: mod ? undefined : 'No `modules` row with this slug. Check spelling, or seed the module.',
    };
    checks.moduleHasBaseUrl = {
      ok: !!mod?.baseUrl,
      expected: 'non-empty modules.base_url',
      claimed: mod?.baseUrl ?? null,
      hint: mod?.baseUrl
        ? undefined
        : 'Handoff would fail with NO_BASE_URL. Set modules.base_url (or the matching <SLUG>_URL env var).',
    };

    // 2b. Module status gate mirrors the handoff path: an entitled caller
    // launching a `coming_soon` or `disabled` module gets a 400 with the
    // matching code. Diagnose must surface this — otherwise the operator
    // sees ok:true here but the actual launch still rejects.
    const launchableStatuses = ['live', 'beta'];
    const launchable = !!mod && launchableStatuses.includes(mod.status as string);
    checks.moduleLaunchable = {
      ok: launchable,
      expected: `module.status in [${launchableStatuses.join(', ')}]`,
      claimed: mod?.status ?? null,
      hint: launchable
        ? undefined
        : !mod
          ? 'Module row missing — see moduleExists above.'
          : mod.status === 'coming_soon'
            ? 'Handoff would reject with MODULE_COMING_SOON.'
            : mod.status === 'disabled'
              ? 'Handoff would reject with MODULE_DISABLED.'
              : `Module status "${mod.status}" is not in the launchable set.`,
    };

    // 3. Hub secret configured (not in fallback mode).
    checks.hubSecretConfigured = {
      ok: !SSO_FALLBACK,
      expected: 'MODULE_SSO_SECRET set on the hub (>=16 chars)',
      claimed: SSO_FALLBACK ? 'missing or too short' : 'set',
      hint: SSO_FALLBACK
        ? 'Hub is in unsigned-fallback mode — launches send a bare base_url with no ?token=. Set MODULE_SSO_SECRET on the hub and restart.'
        : undefined,
    };

    // 4. Issuer string equality (compared verbatim against JWT `iss`).
    const issuerOk = typeof body.claimedIssuer === 'string'
      && body.claimedIssuer === OPERATOROS_BASE_URL;
    checks.issuerMatch = {
      ok: issuerOk,
      expected: OPERATOROS_BASE_URL,
      claimed: body.claimedIssuer ?? null,
      hint: issuerOk
        ? undefined
        : 'Child app would reject with launchError=bad_issuer. Match this string exactly — no trailing slash, same protocol/port.',
    };

    // 5. Env tri-state equality after normalization on both sides.
    const claimedEnvNormalized = normalizeEnv(body.claimedEnv);
    const envOk = body.claimedEnv != null && claimedEnvNormalized === APP_ENV;
    checks.envMatch = {
      ok: envOk,
      expected: APP_ENV,
      claimed: body.claimedEnv == null
        ? null
        : { raw: body.claimedEnv, normalized: claimedEnvNormalized },
      hint: envOk
        ? undefined
        : 'Child app would reject with launchError=env_mismatch. Set the child APP_ENV so it normalizes to the hub value above.',
    };

    // 6. Shared secret LENGTH parity (never the secret itself).
    // Read from the startup-resolved constant — NOT process.env directly —
    // so diagnose reports the same value the handoff signer is actually
    // using. Env edits without a restart would otherwise cause drift.
    const hubSecretLen = MODULE_SSO_SECRET?.length ?? 0;
    const lenOk = typeof body.claimedSecretLength === 'number'
      && body.claimedSecretLength === hubSecretLen
      && hubSecretLen >= 16;
    checks.secretLengthMatch = {
      ok: lenOk,
      expected: hubSecretLen,
      claimed: body.claimedSecretLength ?? null,
      hint: lenOk
        ? undefined
        : 'Length parity check only — does NOT prove the strings are equal, but a mismatch here guarantees signature verification will fail with launchError=bad_signature. Use the same secret on hub and child.',
    };

    const overallOk = Object.values(checks).every(c => c.ok);

    // Log every diagnose call for audit — operators running this against
    // prod from arbitrary IPs is exactly the kind of thing we want
    // observable in admin_audit_logs after the fact.
    await auditSso({
      userId: (request as any).user?.id ?? null,
      action: 'module_sso_diagnose',
      details: {
        moduleSlug: body.moduleSlug,
        overallOk,
        failed: Object.entries(checks).filter(([, v]) => !v.ok).map(([k]) => k),
      },
      ip: getClientIp(request),
      level: 'info',
    });

    return {
      ok: overallOk,
      hub: {
        issuer: OPERATOROS_BASE_URL,
        env: APP_ENV,
        secretConfigured: !SSO_FALLBACK,
        secretLength: hubSecretLen,
      },
      module: mod
        ? { slug: mod.slug, baseUrl: mod.baseUrl, status: mod.status }
        : null,
      checks,
    };
  });

  // Spec-aliased admin surfaces under /v1/modules/admin/*.
  // Returns the catalog plus per-module entitlement counts grouped by source
  // (plan / addon / override) and a deduplicated total. Used by the admin
  // Modules tab to surface adoption per module.
  app.get('/v1/modules/admin/all', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const user = (request as any).user;
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
  app.post('/v1/modules/admin/grant', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const user = (request as any).user;
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
    await logAudit(user.id, 'module_override_grant', user_id, { moduleSlug: module_slug, reason, expires_at }, getClientIp(request));
    return { override: row };
  });

  // POST /v1/modules/admin/revoke — admin revokes a per-user module override.
  // Body: { user_id, module_slug, reason? }
  app.post('/v1/modules/admin/revoke', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const user = (request as any).user;
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
    await logAudit(user.id, 'module_override_revoke', user_id, { moduleSlug: module_slug, reason }, getClientIp(request));
    return { override: row };
  });

  app.patch('/v1/modules/admin/:slug', { preHandler: [requireSuperAdmin] }, async (request, reply) => {
    const user = (request as any).user;
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
    await logAudit(user.id, 'module_updated', undefined, { slug, updates }, getClientIp(request));
    return { module: updated };
  });
}
