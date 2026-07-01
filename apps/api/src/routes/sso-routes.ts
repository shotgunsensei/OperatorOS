import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { ssoHandoffTokens, tenantUsers, tenants, users } from '../schema.js';
import { authenticate, sanitizeUser, signToken } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';
import { hasPlatformAdminAuthority } from '../lib/rbac.js';
import { resolveTenantModuleAccess } from '../lib/tenant-entitlements.js';
import {
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '../../../../packages/auth/index.js';
import {
  getModuleById,
  type OperatorOSModuleRegistryEntry,
} from '../../../../packages/modules/registry.js';
import {
  buildSsoLaunchUrl,
  createSsoHandoffClaims,
  decodeSsoHandoffToken,
  normalizeSsoEnv,
  resolveSsoIssuer,
  resolveSsoSecret,
  signSsoHandoffToken,
  SSO_TOKEN_TTL_SECONDS,
  verifySsoHandoffToken,
  type OperatorOSSsoClaims,
} from '../../../../packages/sso/index.js';

type IssueBody = {
  moduleId?: unknown;
  moduleSlug?: unknown;
  tenantId?: unknown;
};

type ConsumeBody = {
  token?: unknown;
  moduleId?: unknown;
  moduleSlug?: unknown;
};

type AuthenticatedUser = {
  id: string;
  email: string;
  role: string;
  platformRole: string;
  status: string;
  currentTenantId?: string | null;
  tokenVersion?: number;
};

const ISSUE_RATE_LIMIT = 10;
const CONSUME_RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const issueRate = new Map<string, { count: number; resetAt: number }>();
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

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readHeaderString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return readString(value[0]);
  return readString(value);
}

function getClientIp(request: FastifyRequest): string {
  const trustProxy = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
  if (trustProxy) {
    const xff = request.headers['x-forwarded-for'];
    const forwarded = readHeaderString(xff);
    if (forwarded) return forwarded.split(',')[0]?.trim() || forwarded;
    const real = readHeaderString(request.headers['x-real-ip']);
    if (real) return real;
  }
  return request.ip || '0.0.0.0';
}

function sanitizeAuditDetails(details: Record<string, unknown>): Record<string, unknown> {
  const { token: _token, authorization: _authorization, ...safe } = details;
  return safe;
}

async function auditSso(
  request: FastifyRequest,
  opts: {
    actorUserId: string | null;
    tenantId?: string | null;
    action: string;
    targetId?: string | null;
    details: Record<string, unknown>;
    level?: 'info' | 'warn';
  },
) {
  const details = sanitizeAuditDetails(opts.details);
  const line = '[AUDIT sso] ' + JSON.stringify({
    ...details,
    ts: new Date().toISOString(),
    action: opts.action,
    userId: opts.actorUserId,
    tenantId: opts.tenantId ?? null,
    ip: getClientIp(request),
  });
  if ((opts.level ?? 'warn') === 'info') console.log(line); else console.warn(line);

  if (!opts.actorUserId) return;
  try {
    await writeAudit({
      actorUserId: opts.actorUserId,
      tenantId: opts.tenantId ?? null,
      targetType: 'sso_handoff',
      targetId: opts.targetId ?? null,
      action: opts.action,
      extra: details,
      ipAddress: getClientIp(request),
    }, request);
  } catch (err) {
    request.log.warn({ err }, 'sso_audit_write_failed');
  }
}

function readSelectedTenantId(request: FastifyRequest, user: AuthenticatedUser, bodyTenantId: unknown): string | null {
  return (
    readString(bodyTenantId) ||
    readHeaderString(request.headers['x-tenant-id']) ||
    user.currentTenantId ||
    null
  );
}

async function resolveTenantForSso(
  user: AuthenticatedUser,
  tenantId: string,
): Promise<
  | { ok: true; tenant: typeof tenants.$inferSelect; role: string | null; viaPlatformRole: boolean }
  | { ok: false; statusCode: number; code: string; error: string }
> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) {
    return { ok: false, statusCode: 404, code: 'TENANT_NOT_FOUND', error: 'Tenant not found' };
  }

  const isPlatformAdmin = hasPlatformAdminAuthority(user);
  const [membership] = await db.select().from(tenantUsers)
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, user.id)))
    .limit(1);

  if (!membership && !isPlatformAdmin) {
    return { ok: false, statusCode: 404, code: 'TENANT_NOT_FOUND', error: 'Tenant not found' };
  }
  if ((tenant as any).status === 'archived' && !isPlatformAdmin) {
    return { ok: false, statusCode: 404, code: 'TENANT_NOT_FOUND', error: 'Tenant not found' };
  }
  if ((tenant as any).status === 'suspended' && !isPlatformAdmin) {
    return {
      ok: false,
      statusCode: 403,
      code: 'TENANT_SUSPENDED',
      error: 'Tenant is suspended. Contact platform administrator.',
    };
  }

  return {
    ok: true,
    tenant,
    role: (membership?.role as string | undefined) ?? (isPlatformAdmin ? 'owner' : null),
    viaPlatformRole: !membership && isPlatformAdmin,
  };
}

function moduleUnavailable(module: OperatorOSModuleRegistryEntry): { statusCode: number; code: string; error: string } | null {
  if (module.status === 'disabled') {
    return { statusCode: 403, code: 'MODULE_DISABLED', error: 'Module is disabled' };
  }
  if (module.status !== 'active') {
    return { statusCode: 403, code: 'MODULE_UNAVAILABLE', error: 'Module is not launchable yet' };
  }
  return null;
}

async function verifyTenantEntitlement(
  user: AuthenticatedUser,
  tenantId: string,
  module: OperatorOSModuleRegistryEntry,
): Promise<{ ok: boolean; reason?: string; source?: string | null; accessLevel?: string }> {
  if (!module.requiresSubscription) return { ok: true };
  const decision = await resolveTenantModuleAccess(user.id, tenantId, module.id);
  return {
    ok: decision.hasAccess,
    reason: decision.reason,
    source: decision.source,
    accessLevel: decision.accessLevel,
  };
}

function tokenError(err: unknown): { statusCode: number; code: string; error: string } {
  const name = (err as { name?: string } | null)?.name;
  const message = (err as { message?: string } | null)?.message ?? '';
  if (name === 'TokenExpiredError') {
    return { statusCode: 401, code: 'TOKEN_EXPIRED', error: 'Token expired' };
  }
  if (message.includes('jwt audience invalid')) {
    return { statusCode: 400, code: 'AUDIENCE_MISMATCH', error: 'Token audience does not match module' };
  }
  if (message.includes('jwt issuer invalid')) {
    return { statusCode: 401, code: 'ISSUER_MISMATCH', error: 'Token issuer is invalid' };
  }
  return { statusCode: 401, code: 'TOKEN_INVALID', error: 'Invalid SSO token' };
}

async function issueSsoHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = (request as any).user as AuthenticatedUser;
  const body = (request.body ?? {}) as IssueBody;
  const moduleId = readString(body.moduleId) || readString(body.moduleSlug);
  const ip = getClientIp(request);

  if (!checkRate(issueRate, user.id, ISSUE_RATE_LIMIT)) {
    await auditSso(request, {
      actorUserId: user.id,
      action: 'sso_issue_rate_limited',
      details: { moduleId },
    });
    return reply.code(429).send({ error: 'Too many SSO launch attempts', code: 'RATE_LIMITED' });
  }

  if (!moduleId) {
    await auditSso(request, {
      actorUserId: user.id,
      action: 'sso_issue_bad_request',
      details: { reason: 'missing_module_id' },
    });
    return reply.code(400).send({ error: 'moduleId is required', code: 'MODULE_ID_REQUIRED' });
  }

  const module = getModuleById(moduleId);
  if (!module) {
    await auditSso(request, {
      actorUserId: user.id,
      action: 'sso_issue_unknown_module',
      details: { moduleId },
    });
    return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND', moduleId });
  }

  const unavailable = moduleUnavailable(module);
  if (unavailable) {
    await auditSso(request, {
      actorUserId: user.id,
      action: 'sso_issue_module_unavailable',
      details: { moduleId: module.id, moduleStatus: module.status },
    });
    return reply.code(unavailable.statusCode).send({ error: unavailable.error, code: unavailable.code, moduleId: module.id });
  }

  const tenantId = readSelectedTenantId(request, user, body.tenantId);
  if (!tenantId) {
    await auditSso(request, {
      actorUserId: user.id,
      action: 'sso_issue_no_tenant',
      details: { moduleId: module.id },
    });
    return reply.code(400).send({ error: 'tenantId is required', code: 'TENANT_REQUIRED' });
  }

  const tenantContext = await resolveTenantForSso(user, tenantId);
  if (!tenantContext.ok) {
    await auditSso(request, {
      actorUserId: user.id,
      tenantId,
      action: 'sso_issue_tenant_denied',
      details: { moduleId: module.id, code: tenantContext.code },
    });
    return reply.code(tenantContext.statusCode).send({ error: tenantContext.error, code: tenantContext.code });
  }

  const entitlement = await verifyTenantEntitlement(user, tenantId, module);
  if (!entitlement.ok) {
    await auditSso(request, {
      actorUserId: user.id,
      tenantId,
      action: 'sso_issue_entitlement_denied',
      details: {
        moduleId: module.id,
        entitlementKey: module.entitlementKey,
        reason: entitlement.reason,
        source: entitlement.source,
      },
    });
    return reply.code(403).send({
      error: 'Tenant does not have access to this module',
      code: 'MODULE_ACCESS_DENIED',
      moduleId: module.id,
      entitlementKey: module.entitlementKey,
      reason: entitlement.reason,
    });
  }

  const secret = resolveSsoSecret();
  if (!secret) {
    await auditSso(request, {
      actorUserId: user.id,
      tenantId,
      action: 'sso_issue_secret_missing',
      details: { moduleId: module.id },
    });
    return reply.code(503).send({
      error: 'SSO signing secret is not configured',
      code: 'SSO_SECRET_NOT_CONFIGURED',
    });
  }

  const claims = createSsoHandoffClaims({
    user,
    tenant: { id: tenantId, role: tenantContext.role },
    module,
    isPlatformAdmin: hasPlatformAdminAuthority(user),
  });
  const token = signSsoHandoffToken(claims, secret);

  await db.insert(ssoHandoffTokens).values({
    jti: claims.jti,
    userId: user.id,
    tenantId,
    moduleSlug: module.id,
    aud: claims.aud,
    env: claims.env,
    issuedIp: ip,
    issuedUserAgent: readHeaderString(request.headers['user-agent']),
    issuedAt: new Date(claims.iat * 1000),
    expiresAt: new Date(claims.exp * 1000),
  });

  await auditSso(request, {
    actorUserId: user.id,
    tenantId,
    action: 'sso_handoff_issued',
    targetId: claims.jti,
    details: {
      jti: claims.jti,
      moduleId: module.id,
      entitlementKey: module.entitlementKey,
      aud: claims.aud,
      exp: claims.exp,
      viaPlatformRole: tenantContext.viaPlatformRole,
    },
    level: 'info',
  });

  const launchUrl = buildSsoLaunchUrl(module.launchUrl, token);
  return reply.send({
    token,
    launchUrl,
    redirectUrl: launchUrl,
    redirect_url: launchUrl,
    expiresIn: SSO_TOKEN_TTL_SECONDS,
    jti: claims.jti,
    issuer: claims.iss,
    audience: claims.aud,
    tenantId,
    module: {
      id: module.id,
      slug: module.slug,
      name: module.name,
      hostname: module.hostname,
      entitlementKey: module.entitlementKey,
    },
  });
}

async function consumeSsoHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = (request.body ?? {}) as ConsumeBody;
  const token = readString(body.token);
  const moduleId = readString(body.moduleId) || readString(body.moduleSlug);
  const ip = getClientIp(request);

  if (!checkRate(consumeRate, ip, CONSUME_RATE_LIMIT)) {
    await auditSso(request, {
      actorUserId: null,
      action: 'sso_consume_rate_limited',
      details: { moduleId },
    });
    return reply.code(429).send({ error: 'Too many SSO consume attempts', code: 'RATE_LIMITED' });
  }

  if (!token || !moduleId) {
    await auditSso(request, {
      actorUserId: null,
      action: 'sso_consume_bad_request',
      details: { hasToken: !!token, hasModuleId: !!moduleId },
    });
    return reply.code(400).send({ error: 'token and moduleId are required', code: 'BAD_REQUEST' });
  }

  const module = getModuleById(moduleId);
  if (!module) {
    await auditSso(request, {
      actorUserId: null,
      action: 'sso_consume_unknown_module',
      details: { moduleId },
    });
    return reply.code(404).send({ error: 'Module not found', code: 'MODULE_NOT_FOUND', moduleId });
  }

  const secret = resolveSsoSecret();
  if (!secret) {
    await auditSso(request, {
      actorUserId: null,
      action: 'sso_consume_secret_missing',
      details: { moduleId: module.id },
    });
    return reply.code(503).send({
      error: 'SSO signing secret is not configured',
      code: 'SSO_SECRET_NOT_CONFIGURED',
    });
  }

  const decoded = decodeSsoHandoffToken(token);
  let claims: OperatorOSSsoClaims;
  try {
    claims = verifySsoHandoffToken(token, {
      secret,
      moduleId: module.id,
      issuer: resolveSsoIssuer(),
    });
  } catch (err) {
    const mapped = tokenError(err);
    await auditSso(request, {
      actorUserId: typeof decoded?.userId === 'string' ? decoded.userId : null,
      tenantId: typeof decoded?.tenantId === 'string' ? decoded.tenantId : null,
      action: 'sso_consume_token_rejected',
      targetId: typeof decoded?.jti === 'string' ? decoded.jti : null,
      details: { moduleId: module.id, code: mapped.code },
    });
    return reply.code(mapped.statusCode).send({ error: mapped.error, code: mapped.code });
  }

  if (claims.moduleId !== module.id || claims.entitlementKey !== module.entitlementKey) {
    await auditSso(request, {
      actorUserId: claims.userId,
      tenantId: claims.tenantId,
      action: 'sso_consume_claim_mismatch',
      targetId: claims.jti,
      details: {
        expectedModuleId: module.id,
        claimedModuleId: claims.moduleId,
        expectedEntitlementKey: module.entitlementKey,
        claimedEntitlementKey: claims.entitlementKey,
      },
    });
    return reply.code(400).send({ error: 'Token module claims do not match requested module', code: 'MODULE_CLAIM_MISMATCH' });
  }

  const [row] = await db.select().from(ssoHandoffTokens)
    .where(eq(ssoHandoffTokens.jti, claims.jti))
    .limit(1);
  if (!row) {
    await auditSso(request, {
      actorUserId: claims.userId,
      tenantId: claims.tenantId,
      action: 'sso_consume_unknown_jti',
      targetId: claims.jti,
      details: { moduleId: module.id },
    });
    return reply.code(404).send({ error: 'Token not recognized', code: 'TOKEN_UNKNOWN' });
  }
  if (row.aud !== module.id || row.moduleSlug !== module.id) {
    await auditSso(request, {
      actorUserId: row.userId,
      tenantId: row.tenantId,
      action: 'sso_consume_audience_mismatch',
      targetId: row.jti,
      details: { expected: row.aud, requested: module.id },
    });
    return reply.code(400).send({ error: 'Token audience does not match module', code: 'AUDIENCE_MISMATCH' });
  }
  if (row.tenantId !== claims.tenantId) {
    await auditSso(request, {
      actorUserId: row.userId,
      tenantId: row.tenantId,
      action: 'sso_consume_tenant_mismatch',
      targetId: row.jti,
      details: { rowTenantId: row.tenantId, claimTenantId: claims.tenantId },
    });
    return reply.code(400).send({ error: 'Token tenant does not match stored handoff', code: 'TENANT_MISMATCH' });
  }
  if (normalizeSsoEnv(row.env) !== claims.env) {
    await auditSso(request, {
      actorUserId: row.userId,
      tenantId: row.tenantId,
      action: 'sso_consume_env_mismatch',
      targetId: row.jti,
      details: { rowEnv: row.env, claimEnv: claims.env },
    });
    return reply.code(400).send({ error: 'Token environment does not match stored handoff', code: 'ENV_MISMATCH' });
  }
  if (row.expiresAt.getTime() < Date.now()) {
    await auditSso(request, {
      actorUserId: row.userId,
      tenantId: row.tenantId,
      action: 'sso_consume_expired',
      targetId: row.jti,
      details: { moduleId: module.id, expiresAt: row.expiresAt.toISOString() },
    });
    return reply.code(410).send({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
  }
  if (row.consumedAt) {
    await auditSso(request, {
      actorUserId: row.userId,
      tenantId: row.tenantId,
      action: 'sso_handoff_replay_blocked',
      targetId: row.jti,
      details: { moduleId: module.id, consumedAt: row.consumedAt.toISOString() },
    });
    return reply.code(409).send({ error: 'Token already consumed', code: 'TOKEN_REPLAYED' });
  }

  const [user] = await db.select().from(users).where(eq(users.id, claims.userId)).limit(1);
  if (!user) {
    await auditSso(request, {
      actorUserId: row.userId,
      tenantId: row.tenantId,
      action: 'sso_consume_user_missing',
      targetId: row.jti,
      details: { moduleId: module.id },
    });
    return reply.code(401).send({ error: 'User not found', code: 'USER_NOT_FOUND' });
  }
  if (user.status !== 'active') {
    await auditSso(request, {
      actorUserId: user.id,
      tenantId: row.tenantId,
      action: 'sso_consume_user_inactive',
      targetId: row.jti,
      details: { moduleId: module.id, status: user.status },
    });
    return reply.code(403).send({ error: 'User is not active', code: 'USER_INACTIVE' });
  }

  const tenantContext = await resolveTenantForSso(user as AuthenticatedUser, claims.tenantId);
  if (!tenantContext.ok) {
    await auditSso(request, {
      actorUserId: user.id,
      tenantId: claims.tenantId,
      action: 'sso_consume_tenant_denied',
      targetId: row.jti,
      details: { moduleId: module.id, code: tenantContext.code },
    });
    return reply.code(tenantContext.statusCode).send({ error: tenantContext.error, code: tenantContext.code });
  }

  const entitlement = await verifyTenantEntitlement(user as AuthenticatedUser, claims.tenantId, module);
  if (!entitlement.ok) {
    await auditSso(request, {
      actorUserId: user.id,
      tenantId: claims.tenantId,
      action: 'sso_consume_entitlement_denied',
      targetId: row.jti,
      details: {
        moduleId: module.id,
        entitlementKey: module.entitlementKey,
        reason: entitlement.reason,
        source: entitlement.source,
      },
    });
    return reply.code(403).send({
      error: 'Tenant no longer has access to this module',
      code: 'MODULE_ACCESS_DENIED',
      moduleId: module.id,
      entitlementKey: module.entitlementKey,
      reason: entitlement.reason,
    });
  }

  const updated = await db.update(ssoHandoffTokens).set({
    consumedAt: new Date(),
    consumedIp: ip,
    consumedByUserAgent: readHeaderString(request.headers['user-agent']),
  }).where(and(
    eq(ssoHandoffTokens.jti, claims.jti),
    sql`consumed_at IS NULL`,
  )).returning();

  if (updated.length === 0) {
    await auditSso(request, {
      actorUserId: user.id,
      tenantId: claims.tenantId,
      action: 'sso_handoff_replay_blocked',
      targetId: row.jti,
      details: { moduleId: module.id, race: true },
    });
    return reply.code(409).send({ error: 'Token already consumed', code: 'TOKEN_REPLAYED' });
  }

  const sessionToken = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });
  reply.setCookie(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());

  await auditSso(request, {
    actorUserId: user.id,
    tenantId: claims.tenantId,
    action: 'sso_handoff_consumed',
    targetId: row.jti,
    details: {
      moduleId: module.id,
      entitlementKey: module.entitlementKey,
      viaPlatformRole: tenantContext.viaPlatformRole,
    },
    level: 'info',
  });

  return reply.send({
    ok: true,
    sessionEstablished: true,
    user: sanitizeUser(user),
    tenant: {
      id: tenantContext.tenant.id,
      slug: tenantContext.tenant.slug,
      name: tenantContext.tenant.name,
      role: tenantContext.role,
      viaPlatformRole: tenantContext.viaPlatformRole,
    },
    module: {
      id: module.id,
      slug: module.slug,
      name: module.name,
      entitlementKey: module.entitlementKey,
    },
    claims: {
      iss: claims.iss,
      aud: claims.aud,
      jti: claims.jti,
      exp: claims.exp,
      nonce: claims.nonce,
    },
  });
}

export async function registerSsoRoutes(app: FastifyInstance) {
  app.post('/v1/sso/issue', { preHandler: [authenticate] }, issueSsoHandler);
  app.post('/api/sso/issue', { preHandler: [authenticate] }, issueSsoHandler);
  app.post('/v1/sso/consume', consumeSsoHandler);
  app.post('/api/sso/consume', consumeSsoHandler);
}
