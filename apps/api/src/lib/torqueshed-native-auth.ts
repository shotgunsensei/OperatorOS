import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { resolveTenantModuleAccess } from './tenant-entitlements.js';
import type { JWTPayload } from './auth.js';

const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTHORIZATION_CODE_TTL_MS = 60 * 1000;
export const TORQUESHED_NATIVE_REDIRECT_URI = 'torqueshed://sso';

type NativeSessionResult = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  user: { id: string; email: string; name: string; role: string };
  tenant: { id: string; name: string };
  module: 'torqueshed';
};

export class TorqueShedNativeAuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function opaqueToken(prefix: 'tsn_a_' | 'tsn_r_' | 'tsn_c_'): string {
  return `${prefix}${crypto.randomBytes(32).toString('base64url')}`;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function pkceChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier, 'utf8').digest('base64url');
}

function row(result: Awaited<ReturnType<typeof db.execute>>): Record<string, any> | null {
  return (result.rows[0] as Record<string, any> | undefined) ?? null;
}

async function requireLiveAccess(userId: string, tenantId: string): Promise<void> {
  const decision = await resolveTenantModuleAccess(userId, tenantId, 'torqueshed');
  if (!decision.hasAccess) {
    throw new TorqueShedNativeAuthError(
      'TorqueShed is not available for this tenant session',
      'NATIVE_ENTITLEMENT_DENIED',
      403,
    );
  }
}

export async function createTorqueShedNativeAuthorization(input: {
  userId: string;
  tenantId: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  redirectUri: string;
  deviceId: string;
  deviceName: string;
}): Promise<{ redirectUri: string; expiresAt: string }> {
  await requireLiveAccess(input.userId, input.tenantId);
  if (input.redirectUri !== TORQUESHED_NATIVE_REDIRECT_URI) {
    throw new TorqueShedNativeAuthError('The native redirect URI is not allowed', 'NATIVE_REDIRECT_INVALID');
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge)) {
    throw new TorqueShedNativeAuthError('A valid S256 PKCE challenge is required', 'NATIVE_PKCE_INVALID');
  }

  const code = opaqueToken('tsn_c_');
  const expiresAt = new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS);
  const moduleResult = await db.execute(sql`SELECT id FROM modules WHERE slug = 'torqueshed' LIMIT 1`);
  const moduleId = moduleResult.rows[0]?.id;
  if (!moduleId) throw new TorqueShedNativeAuthError('TorqueShed is unavailable', 'NATIVE_MODULE_MISSING', 503);

  await db.execute(sql`
    INSERT INTO torqueshed_native_authorization_codes (
      user_id, tenant_id, module_id, code_hash, state_hash, nonce_hash,
      code_challenge, device_id_hash, redirect_uri, device_name, expires_at
    ) VALUES (
      ${input.userId}, ${input.tenantId}, ${String(moduleId)}, ${sha256(code)},
      ${sha256(input.state)}, ${sha256(input.nonce)}, ${input.codeChallenge},
      ${sha256(input.deviceId)}, ${input.redirectUri}, ${input.deviceName}, ${expiresAt}
    )
  `);

  const redirect = new URL(input.redirectUri);
  redirect.searchParams.set('code', code);
  redirect.searchParams.set('state', input.state);
  return { redirectUri: redirect.toString(), expiresAt: expiresAt.toISOString() };
}

export async function exchangeTorqueShedNativeCode(input: {
  code: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  deviceId: string;
}): Promise<NativeSessionResult> {
  const codeHash = sha256(input.code);
  const authorization = row(await db.execute(sql`
    SELECT c.*, u.email, u.name, u.role, u.status, u.token_version, t.name AS tenant_name
    FROM torqueshed_native_authorization_codes c
    JOIN users u ON u.id = c.user_id
    JOIN tenants t ON t.id = c.tenant_id
    JOIN modules m ON m.id = c.module_id AND m.slug = 'torqueshed'
    WHERE c.code_hash = ${codeHash}
    LIMIT 1
  `));
  if (!authorization || authorization.consumed_at || new Date(authorization.expires_at) <= new Date()) {
    throw new TorqueShedNativeAuthError('The authorization code is invalid or expired', 'NATIVE_CODE_INVALID', 401);
  }
  const verified =
    safeEqual(String(authorization.state_hash), sha256(input.state)) &&
    safeEqual(String(authorization.nonce_hash), sha256(input.nonce)) &&
    safeEqual(String(authorization.device_id_hash), sha256(input.deviceId)) &&
    safeEqual(String(authorization.code_challenge), pkceChallenge(input.codeVerifier));
  if (!verified || authorization.status !== 'active') {
    throw new TorqueShedNativeAuthError('The native authorization proof is invalid', 'NATIVE_PROOF_INVALID', 401);
  }
  await requireLiveAccess(String(authorization.user_id), String(authorization.tenant_id));

  const accessToken = opaqueToken('tsn_a_');
  const refreshToken = opaqueToken('tsn_r_');
  const accessExpiresAt = new Date(Date.now() + ACCESS_TTL_MS);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  await db.transaction(async (tx) => {
    const consumed = await tx.execute(sql`
      UPDATE torqueshed_native_authorization_codes
      SET consumed_at = now()
      WHERE code_hash = ${codeHash} AND consumed_at IS NULL AND expires_at > now()
      RETURNING id
    `);
    if (consumed.rowCount !== 1) {
      throw new TorqueShedNativeAuthError('The authorization code was already used', 'NATIVE_CODE_CONSUMED', 401);
    }
    await tx.execute(sql`
      INSERT INTO torqueshed_native_sessions (
        user_id, tenant_id, module_id, access_token_hash, refresh_token_hash,
        device_id_hash, device_name, token_version, access_expires_at, refresh_expires_at
      ) VALUES (
        ${authorization.user_id}, ${authorization.tenant_id}, ${authorization.module_id},
        ${sha256(accessToken)}, ${sha256(refreshToken)}, ${authorization.device_id_hash},
        ${authorization.device_name}, ${Number(authorization.token_version)},
        ${accessExpiresAt}, ${refreshExpiresAt}
      )
    `);
  });

  return {
    accessToken,
    refreshToken,
    accessExpiresAt: accessExpiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    user: {
      id: String(authorization.user_id),
      email: String(authorization.email),
      name: String(authorization.name),
      role: String(authorization.role),
    },
    tenant: { id: String(authorization.tenant_id), name: String(authorization.tenant_name) },
    module: 'torqueshed',
  };
}

export async function refreshTorqueShedNativeSession(input: {
  refreshToken: string;
  deviceId: string;
}): Promise<NativeSessionResult> {
  const session = row(await db.execute(sql`
    SELECT s.*, u.email, u.name, u.role, u.status, u.token_version AS current_token_version,
      t.name AS tenant_name, m.slug AS module_slug
    FROM torqueshed_native_sessions s
    JOIN users u ON u.id = s.user_id
    JOIN tenants t ON t.id = s.tenant_id
    JOIN modules m ON m.id = s.module_id
    WHERE s.refresh_token_hash = ${sha256(input.refreshToken)}
    LIMIT 1
  `));
  if (!session || session.revoked_at || new Date(session.refresh_expires_at) <= new Date()) {
    throw new TorqueShedNativeAuthError('The native session is expired or revoked', 'NATIVE_REFRESH_INVALID', 401);
  }
  if (
    session.module_slug !== 'torqueshed' ||
    session.status !== 'active' ||
    Number(session.token_version) !== Number(session.current_token_version) ||
    !safeEqual(String(session.device_id_hash), sha256(input.deviceId))
  ) {
    await db.execute(sql`UPDATE torqueshed_native_sessions SET revoked_at=now(), revoked_reason='binding_invalid' WHERE id=${session.id}`);
    throw new TorqueShedNativeAuthError('The native session binding is no longer valid', 'NATIVE_BINDING_INVALID', 401);
  }
  await requireLiveAccess(String(session.user_id), String(session.tenant_id));

  const accessToken = opaqueToken('tsn_a_');
  const refreshToken = opaqueToken('tsn_r_');
  const accessExpiresAt = new Date(Date.now() + ACCESS_TTL_MS);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  const rotated = await db.execute(sql`
    UPDATE torqueshed_native_sessions SET
      access_token_hash=${sha256(accessToken)}, refresh_token_hash=${sha256(refreshToken)},
      access_expires_at=${accessExpiresAt}, refresh_expires_at=${refreshExpiresAt},
      last_used_at=now(), updated_at=now()
    WHERE id=${session.id} AND refresh_token_hash=${sha256(input.refreshToken)} AND revoked_at IS NULL
    RETURNING id
  `);
  if (rotated.rowCount !== 1) {
    throw new TorqueShedNativeAuthError('The native session was already rotated', 'NATIVE_REFRESH_REPLAYED', 401);
  }
  return {
    accessToken,
    refreshToken,
    accessExpiresAt: accessExpiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    user: { id: String(session.user_id), email: String(session.email), name: String(session.name), role: String(session.role) },
    tenant: { id: String(session.tenant_id), name: String(session.tenant_name) },
    module: 'torqueshed',
  };
}

export async function resolveTorqueShedNativeAccessToken(token: string): Promise<JWTPayload | null> {
  if (!/^tsn_a_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = row(await db.execute(sql`
    SELECT s.user_id, s.tenant_id, s.token_version, s.access_expires_at,
      u.email, u.role, m.slug AS module_slug
    FROM torqueshed_native_sessions s
    JOIN users u ON u.id=s.user_id
    JOIN modules m ON m.id=s.module_id
    WHERE s.access_token_hash=${sha256(token)} AND s.revoked_at IS NULL
      AND s.access_expires_at > now() AND s.refresh_expires_at > now()
    LIMIT 1
  `));
  if (!session || session.module_slug !== 'torqueshed') return null;
  await db.execute(sql`UPDATE torqueshed_native_sessions SET last_used_at=now() WHERE access_token_hash=${sha256(token)}`);
  return {
    userId: String(session.user_id),
    email: String(session.email),
    role: String(session.role),
    tokenVersion: Number(session.token_version),
    sessionVersion: 1,
    sessionType: 'module',
    tenantId: String(session.tenant_id),
    moduleId: 'torqueshed',
    exp: Math.floor(new Date(session.access_expires_at).getTime() / 1000),
  };
}

export async function revokeTorqueShedNativeAccessToken(token: string, reason = 'logout'): Promise<void> {
  if (!token.startsWith('tsn_a_')) return;
  await db.execute(sql`
    UPDATE torqueshed_native_sessions SET revoked_at=now(), revoked_reason=${reason}, updated_at=now()
    WHERE access_token_hash=${sha256(token)} AND revoked_at IS NULL
  `);
}

export async function revokeTorqueShedNativeRefreshToken(input: {
  refreshToken: string;
  deviceId: string;
}, reason = 'logout'): Promise<void> {
  if (!input.refreshToken.startsWith('tsn_r_')) return;
  await db.execute(sql`
    UPDATE torqueshed_native_sessions SET revoked_at=now(), revoked_reason=${reason}, updated_at=now()
    WHERE refresh_token_hash=${sha256(input.refreshToken)}
      AND device_id_hash=${sha256(input.deviceId)} AND revoked_at IS NULL
  `);
}
