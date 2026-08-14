import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { ssoHandoffTokens, tenantUsers, tenants, users } from '../schema.js';
import { authenticate, sanitizeUser, signToken } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';
import { hasPlatformAdminAuthority } from '../lib/rbac.js';
import { tenantRoleToEffective, type EffectiveTenantRole } from '../lib/role-aliases.js';
import { resolveTenantModuleAccess } from '../lib/tenant-entitlements.js';
import { moduleSupportsExchangeCode } from '../lib/sso-exchange-rollout.js';
import {
  buildBrowserSessionPayload,
  isOperatorOSPlatformBrowserClient,
  mapSsoModuleAccessDenial,
  ssoEnvironmentMatchesRuntime,
} from '../lib/sso-session-scope.js';
import {
  getSessionClearCookieOptions,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '../../../../packages/auth/index.js';
import {
  getModuleByHost,
  getModuleById,
  normalizeHost,
  type OperatorOSModuleRegistryEntry,
} from '../../../../packages/modules/registry.js';
import {
  createSsoExchangeCode,
  createSsoHandoffClaims,
  createSsoJti,
  decodeSsoHandoffToken,
  normalizeSsoEnv,
  parseSsoExchangeCode,
  resolveSsoCodeSecret,
  resolveSsoIssuer,
  resolveSsoSecret,
  SSO_TOKEN_TTL_SECONDS,
  verifySsoHandoffToken,
  type OperatorOSSsoClaims,
} from '../../../../packages/sso/index.js';
import {
  isPkceChallenge,
  isPkceVerifier,
  isSsoTransactionValue,
  SSO_NONCE_COOKIE_NAME,
  SSO_PKCE_METHOD,
  SSO_STATE_COOKIE_NAME,
  SSO_VERIFIER_COOKIE_NAME,
} from '../../../../packages/sso/browser-contract.js';

type IssueBody = {
  moduleId?: unknown;
  moduleSlug?: unknown;
  tenantId?: unknown;
  clientId?: unknown;
  redirectUri?: unknown;
  returnTo?: unknown;
  state?: unknown;
  nonce?: unknown;
  codeChallenge?: unknown;
  codeChallengeMethod?: unknown;
};

type BrowserExchangeBody = {
  code?: unknown;
  state?: unknown;
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

type ResolvedSsoTenant = {
  tenant: typeof tenants.$inferSelect;
  role: EffectiveTenantRole | null;
  viaPlatformRole: boolean;
};

// A single entitled user can launch every enabled ecosystem module from My Apps.
// Keep abuse bounded without rate-limiting the canonical twelve-module launch path.
const ISSUE_RATE_LIMIT = 20;
const CONSUME_RATE_LIMIT = 20;
const BROWSER_EXCHANGE_RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const issueRate = new Map<string, { count: number; resetAt: number }>();
const consumeRate = new Map<string, { count: number; resetAt: number }>();
const browserExchangeRate = new Map<string, { count: number; resetAt: number }>();

type SsoObservation = {
  correlationId: string;
  launchId: string;
  startedAt: number;
  normalizedFailureReason: string | null;
};

const ssoObservations = new WeakMap<FastifyRequest, SsoObservation>();

function getSsoObservation(request: FastifyRequest): SsoObservation | null {
  return ssoObservations.get(request) ?? null;
}

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

function runtimeIsProduction(): boolean {
  const value = (process.env.APP_ENV || process.env.NODE_ENV || '').trim().toLowerCase();
  return value === 'production' || value === 'prod';
}

function legacySsoRollbackEnabled(): boolean {
  return !runtimeIsProduction() || process.env.ALLOW_LEGACY_SSO_ROLLBACK === 'true';
}

function getRequestHost(request: FastifyRequest): string {
  const trustProxy = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
  if (trustProxy) {
    const forwarded = readHeaderString(request.headers['x-forwarded-host']);
    if (forwarded) return normalizeHost(forwarded.split(',')[0] ?? forwarded);
  }
  return normalizeHost(readHeaderString(request.headers.host));
}

function readRequestCookie(request: FastifyRequest, name: string): string | null {
  const cookies = (request as FastifyRequest & { cookies?: Record<string, string | undefined> }).cookies;
  return readString(cookies?.[name]);
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function toPkceChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier, 'utf8').digest('base64url');
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

type ValidAuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  returnTo: string;
  state: string;
  nonce: string;
  codeChallenge: string;
};

function validateAuthorizationRequest(
  module: OperatorOSModuleRegistryEntry,
  body: IssueBody,
): { ok: true; value: ValidAuthorizationRequest } | { ok: false; code: string; error: string } {
  const clientId = readString(body.clientId);
  const redirectUri = readString(body.redirectUri);
  const rawReturnTo = readString(body.returnTo);
  const state = readString(body.state);
  const nonce = readString(body.nonce);
  const codeChallenge = readString(body.codeChallenge);
  const codeChallengeMethod = readString(body.codeChallengeMethod);

  if (!clientId || !redirectUri || !rawReturnTo || !state || !nonce || !codeChallenge || !codeChallengeMethod) {
    return { ok: false, code: 'AUTHORIZATION_REQUEST_INCOMPLETE', error: 'The browser authorization request is incomplete' };
  }
  if (clientId !== module.clientId) {
    return { ok: false, code: 'CLIENT_MISMATCH', error: 'The authorization client does not match the requested module' };
  }
  if (codeChallengeMethod !== SSO_PKCE_METHOD || !isPkceChallenge(codeChallenge)) {
    return { ok: false, code: 'PKCE_INVALID', error: 'A valid S256 PKCE challenge is required' };
  }
  if (!isSsoTransactionValue(state) || !isSsoTransactionValue(nonce)) {
    return { ok: false, code: 'TRANSACTION_INVALID', error: 'The authorization state or nonce is invalid' };
  }

  let callback: URL;
  try {
    callback = new URL(redirectUri);
  } catch {
    return { ok: false, code: 'REDIRECT_URI_INVALID', error: 'The redirect URI is invalid' };
  }
  if (
    callback.username || callback.password || callback.search || callback.hash ||
    callback.pathname !== module.callbackPath ||
    !['http:', 'https:'].includes(callback.protocol)
  ) {
    return { ok: false, code: 'REDIRECT_URI_INVALID', error: 'The redirect URI is invalid' };
  }

  const isRegistered = module.exactRedirectUris.includes(callback.toString());
  const isDevLoopback = !runtimeIsProduction() && isLoopbackHost(callback.hostname);
  if (!isRegistered && !isDevLoopback) {
    return { ok: false, code: 'REDIRECT_URI_NOT_ALLOWED', error: 'The redirect URI is not registered for this module' };
  }
  const callbackModule = getModuleByHost(callback.hostname);
  if (isRegistered && callbackModule?.id !== module.id) {
    return { ok: false, code: 'REDIRECT_MODULE_MISMATCH', error: 'The redirect host does not match the requested module' };
  }

  let returnUrl: URL;
  try {
    if (rawReturnTo.startsWith('//')) throw new Error('protocol-relative return');
    returnUrl = new URL(rawReturnTo, callback.origin);
  } catch {
    return { ok: false, code: 'RETURN_TO_INVALID', error: 'The return destination is invalid' };
  }
  if (
    returnUrl.origin !== callback.origin || returnUrl.username || returnUrl.password ||
    !['http:', 'https:'].includes(returnUrl.protocol) || returnUrl.pathname === module.callbackPath
  ) {
    return { ok: false, code: 'RETURN_TO_NOT_ALLOWED', error: 'The return destination must remain on the callback host' };
  }

  return {
    ok: true,
    value: {
      clientId,
      redirectUri: callback.toString(),
      returnTo: `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`,
      state,
      nonce,
      codeChallenge,
    },
  };
}

function sanitizeAuditDetails(details: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  const sensitiveNames = new Set([
    'token', 'authorization', 'cookie', 'cookies', 'code', 'accessToken',
    'refreshToken', 'idToken', 'sessionToken', 'password', 'secret', 'jti',
  ]);
  for (const [key, value] of Object.entries(details)) {
    if (!sensitiveNames.has(key)) safe[key] = value;
  }
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
  const observation = getSsoObservation(request);
  const line = '[AUDIT sso] ' + JSON.stringify({
    ...details,
    ts: new Date().toISOString(),
    requestId: request.id,
    correlationId: observation?.correlationId ?? null,
    launchId: observation?.launchId ?? null,
    authContractVersion: 'v1',
    environment: normalizeSsoEnv(process.env.APP_ENV || process.env.NODE_ENV),
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
  | ({ ok: true } & ResolvedSsoTenant)
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
    role: isPlatformAdmin
      ? 'owner'
      : membership
        ? tenantRoleToEffective(membership.role)
        : null,
    viaPlatformRole: isPlatformAdmin,
  };
}

function requestBodyString(request: FastifyRequest, name: string): string | null {
  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return readString((body as Record<string, unknown>)[name]);
}

function safeRedirectHost(request: FastifyRequest): string | null {
  const redirectUri = requestBodyString(request, 'redirectUri');
  if (!redirectUri) return null;
  try { return normalizeHost(new URL(redirectUri).hostname); } catch { return null; }
}

function structuredSsoContext(request: FastifyRequest, reply: FastifyReply) {
  const observation = getSsoObservation(request);
  const user = (request as FastifyRequest & { user?: Partial<AuthenticatedUser> }).user;
  const moduleId = requestBodyString(request, 'moduleId') || requestBodyString(request, 'moduleSlug');
  const module = moduleId ? getModuleById(moduleId) : null;
  const tenantId = requestBodyString(request, 'tenantId') || user?.currentTenantId || null;
  const cookies = (request as FastifyRequest & { cookies?: Record<string, string | undefined> }).cookies;
  return {
    requestId: request.id,
    correlationId: observation?.correlationId ?? null,
    launchId: observation?.launchId ?? null,
    authContractVersion: 'v1',
    environment: normalizeSsoEnv(process.env.APP_ENV || process.env.NODE_ENV),
    clientId: requestBodyString(request, 'clientId'),
    moduleId: module?.id ?? moduleId,
    moduleSlug: module?.slug ?? null,
    userId: user?.id ?? null,
    tenantId,
    platformRole: user?.platformRole ?? null,
    tenantRole: null,
    entitlementKey: module?.entitlementKey ?? null,
    sessionPresent: !!cookies?.[SESSION_COOKIE_NAME],
    sessionValid: user?.id ? true : null,
    authorizationCodeId: null,
    redirectTargetHost: safeRedirectHost(request),
    decision: reply.statusCode < 400 ? 'allowed' : 'denied',
    normalizedFailureReason: observation?.normalizedFailureReason ?? null,
    durationMs: observation ? Math.max(0, Date.now() - observation.startedAt) : null,
    statusCode: reply.statusCode,
  };
}

async function registerSsoObservability(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    const correlationId = crypto.randomUUID();
    ssoObservations.set(request, {
      correlationId,
      launchId: correlationId,
      startedAt: Date.now(),
      normalizedFailureReason: null,
    });
    reply.header('X-Correlation-ID', correlationId);
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (reply.statusCode < 400 || typeof payload !== 'string') return payload;
    try {
      const body = JSON.parse(payload) as Record<string, unknown>;
      if (!body || Array.isArray(body) || typeof body !== 'object') return payload;
      const observation = getSsoObservation(request);
      if (observation && typeof body.code === 'string') {
        observation.normalizedFailureReason = body.code.slice(0, 80);
      }
      if (observation && typeof body.error === 'string') {
        body.correlationId = observation.correlationId;
        return JSON.stringify(body);
      }
    } catch {
      // Non-JSON payloads are returned untouched and never logged verbatim.
    }
    return payload;
  });

  app.addHook('onResponse', async (request, reply) => {
    request.log.info(structuredSsoContext(request, reply), 'sso_request_decision');
  });
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
  reply.header('Cache-Control', 'no-store');
  reply.header('Pragma', 'no-cache');
  reply.header('Referrer-Policy', 'no-referrer');
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

  const authorization = validateAuthorizationRequest(module, body);
  if (!authorization.ok) {
    await auditSso(request, {
      actorUserId: user.id,
      action: 'sso_issue_authorization_rejected',
      details: { moduleId: module.id, code: authorization.code },
    });
    return reply.code(400).send({ error: authorization.error, code: authorization.code });
  }

  const platformSession = isOperatorOSPlatformBrowserClient(module);
  let tenantId: string | null = null;
  let tenantContext: ResolvedSsoTenant | null = null;

  // OperatorOS is the parent control plane and intentionally has no tenant
  // requirement. Every child module remains tenant-bound and entitlement-
  // checked before an authorization code can be minted.
  if (!platformSession) {
    tenantId = readSelectedTenantId(request, user, body.tenantId);
    if (!tenantId) {
      await auditSso(request, {
        actorUserId: user.id,
        action: 'sso_issue_no_tenant',
        details: { moduleId: module.id },
      });
      return reply.code(400).send({ error: 'tenantId is required', code: 'TENANT_REQUIRED' });
    }

    const resolvedTenant = await resolveTenantForSso(user, tenantId);
    if (!resolvedTenant.ok) {
      await auditSso(request, {
        actorUserId: user.id,
        tenantId,
        action: 'sso_issue_tenant_denied',
        details: { moduleId: module.id, code: resolvedTenant.code },
      });
      return reply.code(resolvedTenant.statusCode).send({ error: resolvedTenant.error, code: resolvedTenant.code });
    }
    tenantContext = resolvedTenant;

    const entitlement = await verifyTenantEntitlement(user, tenantId, module);
    if (!entitlement.ok) {
      const denial = mapSsoModuleAccessDenial(
        entitlement.reason,
        'Tenant does not have access to this module',
      );
      await auditSso(request, {
        actorUserId: user.id,
        tenantId,
        action: 'sso_issue_entitlement_denied',
        details: {
          moduleId: module.id,
          entitlementKey: module.entitlementKey,
          reason: entitlement.reason,
          source: entitlement.source,
          responseCode: denial.code,
        },
      });
      return reply.code(403).send({
        error: denial.error,
        code: denial.code,
        moduleId: module.id,
        entitlementKey: module.entitlementKey,
        reason: entitlement.reason,
      });
    }
  }

  const secret = resolveSsoCodeSecret();
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

  const now = Math.floor(Date.now() / 1000);
  const handoff = platformSession
    ? {
        jti: createSsoJti(),
        aud: module.id,
        env: normalizeSsoEnv(process.env.APP_ENV || process.env.NODE_ENV),
        iat: now,
        exp: now + SSO_TOKEN_TTL_SECONDS,
        iss: resolveSsoIssuer(),
      }
    : createSsoHandoffClaims({
        user,
        tenant: { id: tenantId!, role: tenantContext!.role },
        module,
        isPlatformAdmin: hasPlatformAdminAuthority(user),
        nonce: authorization.value.nonce,
      });
  await db.insert(ssoHandoffTokens).values({
    jti: handoff.jti,
    userId: user.id,
    tenantId,
    moduleSlug: module.id,
    aud: handoff.aud,
    env: handoff.env,
    issuedIp: ip,
    issuedUserAgent: readHeaderString(request.headers['user-agent']),
    issuedAt: new Date(handoff.iat * 1000),
    expiresAt: new Date(handoff.exp * 1000),
  });

  await auditSso(request, {
    actorUserId: user.id,
    tenantId,
    action: 'sso_handoff_issued',
    targetId: handoff.jti,
    details: {
      jti: handoff.jti,
      moduleId: module.id,
      entitlementKey: module.entitlementKey,
      aud: handoff.aud,
      exp: handoff.exp,
      sessionType: platformSession ? 'platform' : 'module',
      viaPlatformRole: tenantContext?.viaPlatformRole ?? false,
    },
    level: 'info',
  });

  // The browser receives only an encrypted, single-use authorization code.
  // Its transaction binding is authenticated inside the code; the target
  // host must also prove state, nonce, and the PKCE verifier before a local
  // host-only application session can be created.
  const usesCode = moduleSupportsExchangeCode(module.slug);
  if (!usesCode) {
    return reply.code(503).send({
      error: 'Module auth adapter does not support OperatorOS SSO contract v1',
      code: 'AUTH_ADAPTER_VERSION_UNSUPPORTED',
    });
  }
  const code = createSsoExchangeCode({
    jti: handoff.jti,
    aud: handoff.aud,
    clientId: authorization.value.clientId,
    redirectUri: authorization.value.redirectUri,
    returnTo: authorization.value.returnTo,
    state: authorization.value.state,
    nonce: authorization.value.nonce,
    codeChallenge: authorization.value.codeChallenge,
  }, secret);
  const callback = new URL(authorization.value.redirectUri);
  callback.searchParams.set('code', code);
  callback.searchParams.set('state', authorization.value.state);
  const launchUrl = callback.toString();
  return reply.send({
    code,
    launchUrl,
    redirectUrl: launchUrl,
    redirect_url: launchUrl,
    expiresIn: SSO_TOKEN_TTL_SECONDS,
    jti: handoff.jti,
    issuer: handoff.iss,
    audience: handoff.aud,
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

async function browserExchangeSsoHandler(request: FastifyRequest, reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store');
  reply.header('Pragma', 'no-cache');
  reply.header('Referrer-Policy', 'no-referrer');

  const body = (request.body ?? {}) as BrowserExchangeBody;
  const code = readString(body.code);
  const submittedState = readString(body.state);
  const ip = getClientIp(request);
  if (!checkRate(browserExchangeRate, ip, BROWSER_EXCHANGE_RATE_LIMIT)) {
    await auditSso(request, {
      actorUserId: null,
      action: 'sso_browser_exchange_rate_limited',
      details: {},
    });
    return reply.code(429).send({ error: 'Too many authorization attempts', code: 'RATE_LIMITED' });
  }
  if (!code || code.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(code) || !submittedState) {
    return reply.code(400).send({ error: 'code and state are required', code: 'BAD_REQUEST' });
  }

  const secret = resolveSsoCodeSecret();
  if (!secret) {
    return reply.code(503).send({ error: 'SSO is not configured', code: 'SSO_SECRET_NOT_CONFIGURED' });
  }
  const binding = parseSsoExchangeCode(code, secret);
  if (
    !binding?.clientId || !binding.redirectUri || !binding.returnTo || !binding.state ||
    !binding.nonce || !binding.codeChallenge
  ) {
    await auditSso(request, {
      actorUserId: null,
      action: 'sso_browser_exchange_code_rejected',
      details: { reason: 'invalid_or_legacy_code' },
    });
    return reply.code(401).send({ error: 'Authorization code is invalid', code: 'CODE_INVALID' });
  }

  const module = getModuleById(binding.aud);
  if (!module || module.clientId !== binding.clientId) {
    return reply.code(400).send({ error: 'Authorization code client is invalid', code: 'CLIENT_MISMATCH' });
  }
  const unavailable = moduleUnavailable(module);
  if (unavailable) {
    return reply.code(unavailable.statusCode).send({ error: unavailable.error, code: unavailable.code });
  }
  const authorization = validateAuthorizationRequest(module, {
    clientId: binding.clientId,
    redirectUri: binding.redirectUri,
    returnTo: binding.returnTo,
    state: binding.state,
    nonce: binding.nonce,
    codeChallenge: binding.codeChallenge,
    codeChallengeMethod: SSO_PKCE_METHOD,
  });
  if (!authorization.ok) {
    return reply.code(400).send({ error: authorization.error, code: authorization.code });
  }

  const requestHost = getRequestHost(request);
  const callbackHost = normalizeHost(new URL(binding.redirectUri).hostname);
  const requestModule = getModuleByHost(requestHost);
  if (
    !requestHost || requestHost !== callbackHost ||
    (runtimeIsProduction() && requestModule?.id !== module.id) ||
    (!runtimeIsProduction() && !requestModule && !isLoopbackHost(requestHost))
  ) {
    await auditSso(request, {
      actorUserId: null,
      action: 'sso_browser_exchange_host_rejected',
      details: { moduleId: module.id, requestHost },
    });
    return reply.code(400).send({ error: 'Authorization code was presented on the wrong host', code: 'HOST_MISMATCH' });
  }

  const stateCookie = readRequestCookie(request, SSO_STATE_COOKIE_NAME);
  const nonceCookie = readRequestCookie(request, SSO_NONCE_COOKIE_NAME);
  const verifier = readRequestCookie(request, SSO_VERIFIER_COOKIE_NAME);
  if (
    !stateCookie || !nonceCookie || !verifier ||
    !isSsoTransactionValue(submittedState) || !isSsoTransactionValue(stateCookie) ||
    !isSsoTransactionValue(nonceCookie) || !isPkceVerifier(verifier) ||
    !safeEqual(submittedState, binding.state) ||
    !safeEqual(stateCookie, binding.state) ||
    !safeEqual(nonceCookie, binding.nonce) ||
    !safeEqual(toPkceChallenge(verifier), binding.codeChallenge)
  ) {
    await auditSso(request, {
      actorUserId: null,
      action: 'sso_browser_exchange_transaction_rejected',
      targetId: binding.jti,
      details: { moduleId: module.id },
    });
    return reply.code(401).send({ error: 'Authorization transaction could not be verified', code: 'TRANSACTION_MISMATCH' });
  }

  const [row] = await db.select().from(ssoHandoffTokens)
    .where(eq(ssoHandoffTokens.jti, binding.jti))
    .limit(1);
  if (!row) {
    return reply.code(404).send({ error: 'Authorization code is not recognized', code: 'CODE_UNKNOWN' });
  }
  if (row.aud !== module.id || row.moduleSlug !== module.id) {
    return reply.code(400).send({ error: 'Authorization code audience is invalid', code: 'AUDIENCE_MISMATCH' });
  }
  const currentEnv = normalizeSsoEnv(process.env.APP_ENV || process.env.NODE_ENV);
  if (!ssoEnvironmentMatchesRuntime(row.env, currentEnv)) {
    await auditSso(request, {
      actorUserId: row.userId,
      tenantId: row.tenantId,
      action: 'sso_browser_exchange_env_mismatch',
      targetId: row.jti,
      details: { moduleId: module.id, rowEnv: row.env, currentEnv },
    });
    return reply.code(400).send({
      error: 'Authorization code environment does not match this runtime',
      code: 'ENV_MISMATCH',
    });
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return reply.code(410).send({ error: 'Authorization code expired', code: 'CODE_EXPIRED' });
  }
  if (row.consumedAt) {
    await auditSso(request, {
      actorUserId: row.userId,
      tenantId: row.tenantId,
      action: 'sso_handoff_replay_blocked',
      targetId: row.jti,
      details: { moduleId: module.id, browserExchange: true },
    });
    return reply.code(409).send({ error: 'Authorization code was already used', code: 'CODE_REPLAYED' });
  }
  const platformSession = isOperatorOSPlatformBrowserClient(module);
  if (!platformSession && !row.tenantId) {
    return reply.code(400).send({ error: 'Authorization code has no tenant context', code: 'TENANT_REQUIRED' });
  }
  const tenantId = row.tenantId;

  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user) return reply.code(401).send({ error: 'User not found', code: 'USER_NOT_FOUND' });
  if (user.status !== 'active') {
    return reply.code(403).send({ error: 'User is not active', code: 'USER_INACTIVE' });
  }

  let tenantContext: ResolvedSsoTenant | null = null;
  if (!platformSession) {
    const resolvedTenant = await resolveTenantForSso(user as AuthenticatedUser, tenantId!);
    if (!resolvedTenant.ok) {
      return reply.code(resolvedTenant.statusCode).send({ error: resolvedTenant.error, code: resolvedTenant.code });
    }
    tenantContext = resolvedTenant;

    const entitlement = await verifyTenantEntitlement(user as AuthenticatedUser, tenantId!, module);
    if (!entitlement.ok) {
      const denial = mapSsoModuleAccessDenial(
        entitlement.reason,
        'Tenant no longer has access to this module',
      );
      await auditSso(request, {
        actorUserId: user.id,
        tenantId: row.tenantId,
        action: 'sso_browser_exchange_entitlement_denied',
        targetId: row.jti,
        details: {
          moduleId: module.id,
          reason: entitlement.reason,
          source: entitlement.source,
          responseCode: denial.code,
        },
      });
      return reply.code(403).send({
        error: denial.error,
        code: denial.code,
        moduleId: module.id,
        entitlementKey: module.entitlementKey,
        reason: entitlement.reason,
      });
    }
  }

  const updated = await db.update(ssoHandoffTokens).set({
    consumedAt: new Date(),
    consumedIp: ip,
    consumedByUserAgent: readHeaderString(request.headers['user-agent']),
  }).where(and(
    eq(ssoHandoffTokens.jti, binding.jti),
    sql`consumed_at IS NULL`,
  )).returning();
  if (updated.length === 0) {
    return reply.code(409).send({ error: 'Authorization code was already used', code: 'CODE_REPLAYED' });
  }

  const sessionToken = signToken(buildBrowserSessionPayload({
    userId: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  }, module, tenantId));
  reply.setCookie(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());
  const clearCookieOptions = getSessionClearCookieOptions();
  reply.clearCookie(SSO_STATE_COOKIE_NAME, clearCookieOptions);
  reply.clearCookie(SSO_NONCE_COOKIE_NAME, clearCookieOptions);
  reply.clearCookie(SSO_VERIFIER_COOKIE_NAME, clearCookieOptions);

  await auditSso(request, {
    actorUserId: user.id,
    tenantId: row.tenantId,
    action: 'sso_browser_session_established',
    targetId: row.jti,
    details: {
      moduleId: module.id,
      entitlementKey: module.entitlementKey,
      requestHost,
      sessionType: platformSession ? 'platform' : 'module',
      viaPlatformRole: tenantContext?.viaPlatformRole ?? false,
    },
    level: 'info',
  });

  return reply.send({
    ok: true,
    sessionEstablished: true,
    returnTo: authorization.value.returnTo,
    user: sanitizeUser(user),
    session: platformSession
      ? { type: 'platform' }
      : { type: 'module', tenantId, moduleId: module.id },
    tenant: tenantContext
      ? {
          id: tenantContext.tenant.id,
          slug: tenantContext.tenant.slug,
          name: tenantContext.tenant.name,
          role: tenantContext.role,
          viaPlatformRole: tenantContext.viaPlatformRole,
        }
      : null,
    module: {
      id: module.id,
      slug: module.slug,
      name: module.name,
      entitlementKey: module.entitlementKey,
    },
    claims: {
      aud: module.id,
      jti: row.jti,
      nonce: binding.nonce,
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
    sessionType: 'module',
    tenantId: claims.tenantId,
    moduleId: module.id,
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
  await app.register(async (ssoApp) => {
    await registerSsoObservability(ssoApp);
    ssoApp.post('/v1/sso/issue', { preHandler: [authenticate] }, issueSsoHandler);
    ssoApp.post('/api/sso/issue', { preHandler: [authenticate] }, issueSsoHandler);
    ssoApp.post('/v1/sso/browser-exchange', browserExchangeSsoHandler);
    ssoApp.post('/api/sso/browser-exchange', browserExchangeSsoHandler);
    if (legacySsoRollbackEnabled()) {
      ssoApp.post('/v1/sso/consume', consumeSsoHandler);
      ssoApp.post('/api/sso/consume', consumeSsoHandler);
    }
  });
}
