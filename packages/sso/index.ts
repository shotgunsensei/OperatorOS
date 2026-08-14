import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { OperatorOSModuleRegistryEntry } from '../modules/registry.js';

export const SSO_TOKEN_TTL_SECONDS = 60;
export const SSO_JWT_ALGORITHM = 'HS256' as const;
export const MIN_SSO_SECRET_LENGTH = 16;
export const MIN_SSO_CODE_SECRET_LENGTH = 32;
export const DEFAULT_SSO_ISSUER = 'http://localhost:5000';
/**
 * Maximum clock drift tolerated between the hub (issuer) and a module
 * receiver when verifying a handoff. Kept small (≤30s) so a stolen token's
 * usable window stays close to the 90s TTL rather than being stretched
 * open by a generous skew allowance.
 */
export const SSO_CLOCK_TOLERANCE_SECONDS = 30;

export type OperatorOSSsoEnv = 'prod' | 'staging' | 'dev';

export interface OperatorOSSsoClaims {
  iss: string;
  aud: string;
  env: OperatorOSSsoEnv;
  sub: string;
  userId: string;
  user_id: string;
  email: string;
  role: string;
  platformRole: string;
  isPlatformAdmin: boolean;
  tenantId: string;
  tenant_id: string;
  operatoros_tenant_id: string;
  tenantRole: string | null;
  tenant_role: string | null;
  moduleId: string;
  module_id: string;
  moduleSlug: string;
  module_slug: string;
  entitlementKey: string;
  entitlement_key: string;
  jti: string;
  nonce: string;
  iat: number;
  exp: number;
}

export interface CreateSsoClaimsInput {
  issuer?: string | null;
  env?: string | null;
  now?: number;
  ttlSeconds?: number;
  user: {
    id: string;
    email: string;
    role?: string | null;
    platformRole?: string | null;
  };
  tenant: {
    id: string;
    role?: string | null;
  };
  module: Pick<OperatorOSModuleRegistryEntry, 'id' | 'slug' | 'entitlementKey'>;
  isPlatformAdmin: boolean;
  jti?: string;
  nonce?: string;
}

export interface VerifySsoTokenInput {
  secret: string;
  issuer?: string | null;
  moduleId: string;
}

export function normalizeSsoEnv(raw: string | null | undefined): OperatorOSSsoEnv {
  const value = String(raw ?? '').toLowerCase().trim();
  if (value === 'prod' || value === 'production') return 'prod';
  if (value === 'staging' || value === 'stage') return 'staging';
  return 'dev';
}

export function normalizeSsoIssuer(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim() || DEFAULT_SSO_ISSUER;
  return value.replace(/\/+$/, '');
}

/** Clean HTTPS issuer used in production when no explicit override is set. */
export const PRODUCTION_SSO_ISSUER = 'https://operatoros.net';

function isProductionRuntime(): boolean {
  if (typeof process === 'undefined') return false;
  const v = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  return v === 'production' || v === 'prod';
}

export function resolveSsoIssuer(): string {
  const explicit = typeof process !== 'undefined' ? process.env.OPERATOROS_BASE_URL : undefined;
  if (explicit && explicit.trim()) return normalizeSsoIssuer(explicit);
  // Never emit the localhost dev default in production — it would leak an
  // unreachable `http://localhost:5000` issuer into signed SSO handoff tokens.
  return normalizeSsoIssuer(isProductionRuntime() ? PRODUCTION_SSO_ISSUER : DEFAULT_SSO_ISSUER);
}

export function resolveSsoSecret(raw?: string | null): string | null {
  const value = raw ?? (typeof process !== 'undefined' ? process.env.MODULE_SSO_SECRET : undefined);
  if (!value || value.length < MIN_SSO_SECRET_LENGTH) return null;
  return value;
}

/**
 * Hub-only browser authorization-code key.
 *
 * Production never falls back to the legacy module-shared secret. A dev-only
 * fallback remains available for the bounded rollback/test lane.
 */
export function resolveSsoCodeSecret(raw?: string | null): string | null {
  const explicit = raw ?? (typeof process !== 'undefined'
    ? process.env.SSO_CODE_ENCRYPTION_SECRET
    : undefined);
  if (explicit) {
    return explicit.length >= MIN_SSO_CODE_SECRET_LENGTH ? explicit : null;
  }
  if (isProductionRuntime()) return null;
  const legacy = typeof process !== 'undefined' ? process.env.MODULE_SSO_SECRET : undefined;
  return legacy && legacy.length >= MIN_SSO_CODE_SECRET_LENGTH ? legacy : null;
}

export function createSsoJti(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function createSsoNonce(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function createSsoHandoffClaims(input: CreateSsoClaimsInput): OperatorOSSsoClaims {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds ?? SSO_TOKEN_TTL_SECONDS;
  const jti = input.jti ?? createSsoJti();
  const nonce = input.nonce ?? createSsoNonce();
  const platformRole = input.isPlatformAdmin ? 'super_admin' : (input.user.platformRole ?? 'user');
  const role = input.isPlatformAdmin ? 'super_admin' : (input.tenant.role ?? input.user.role ?? 'user');

  return {
    iss: normalizeSsoIssuer(input.issuer ?? resolveSsoIssuer()),
    aud: input.module.id,
    env: normalizeSsoEnv(input.env ?? (typeof process !== 'undefined' ? process.env.APP_ENV ?? process.env.NODE_ENV : undefined)),
    sub: input.user.id,
    userId: input.user.id,
    user_id: input.user.id,
    email: input.user.email,
    role,
    platformRole,
    isPlatformAdmin: input.isPlatformAdmin,
    tenantId: input.tenant.id,
    tenant_id: input.tenant.id,
    operatoros_tenant_id: input.tenant.id,
    tenantRole: input.tenant.role ?? null,
    tenant_role: input.tenant.role ?? null,
    moduleId: input.module.id,
    module_id: input.module.id,
    moduleSlug: input.module.slug,
    module_slug: input.module.slug,
    entitlementKey: input.module.entitlementKey,
    entitlement_key: input.module.entitlementKey,
    jti,
    nonce,
    iat: now,
    exp: now + ttl,
  };
}

export function signSsoHandoffToken(claims: OperatorOSSsoClaims, secret: string): string {
  return jwt.sign(claims, secret, {
    algorithm: SSO_JWT_ALGORITHM,
  });
}

export function decodeSsoHandoffToken(token: string): Partial<OperatorOSSsoClaims> | null {
  const decoded = jwt.decode(token);
  return decoded && typeof decoded === 'object'
    ? decoded as Partial<OperatorOSSsoClaims>
    : null;
}

export function verifySsoHandoffToken(token: string, input: VerifySsoTokenInput): OperatorOSSsoClaims {
  // A bounded clock tolerance keeps issuer/receiver drift from either
  // rejecting a fresh token (skew making it look future-dated) or honoring
  // an over-aged one. `maxAge` additionally caps how old a token may be
  // regardless of its own `exp`, so the usable window can never exceed the
  // TTL plus a small tolerance.
  const decoded = jwt.verify(token, input.secret, {
    algorithms: [SSO_JWT_ALGORITHM],
    audience: input.moduleId,
    issuer: normalizeSsoIssuer(input.issuer ?? resolveSsoIssuer()),
    clockTolerance: SSO_CLOCK_TOLERANCE_SECONDS,
    maxAge: SSO_TOKEN_TTL_SECONDS + SSO_CLOCK_TOLERANCE_SECONDS,
  });
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Invalid SSO token payload');
  }
  return decoded as OperatorOSSsoClaims;
}

// ---------------------------------------------------------------------------
// Opaque exchange codes (browser-facing handoff without a JWT in the URL)
//
// Instead of putting the signed JWT (which carries identity/entitlement
// claims) in the browser's address bar, the hub hands the browser an opaque
// *code* and lets the receiver redeem it server-to-server for the real
// claims. The code is the AES-256-GCM authenticated encryption of the
// handoff row's binding `{ jti, aud }` under a key derived from the shared
// module SSO secret:
//   code = base64url( iv(12) || ciphertext || tag(16) )
//
// Why encrypt rather than expose the raw `jti`: the legacy `/consume`
// endpoint remains unauthenticated during migration and accepts a raw
// `{ jti }`. If the jti sat in the URL in plaintext, anyone who observed
// the launch URL could redeem it directly at `/consume`, making the
// bearer-gated `/exchange` endpoint's protection illusory. Encrypting the
// binding means the URL carries NOTHING redeemable: only a holder of the
// secret (i.e. the `/exchange` endpoint) can recover the jti, so a leaked
// code cannot be spent against the public consume path. Sealing `aud`
// alongside the jti also binds the code to one target module, so it cannot
// be retargeted at a different receiver.
//
// GCM's auth tag also provides integrity, so a tampered/forged code fails
// closed with zero database work.
// Single-use is still enforced downstream by the atomic `consumed_at` claim
// on the handoff row (keyed by jti), exactly like the token path, and no
// schema migration is required.
// ---------------------------------------------------------------------------

const EXCHANGE_CODE_IV_BYTES = 12;
const EXCHANGE_CODE_TAG_BYTES = 16;

/**
 * The binding a code carries. The code is only redeemable for exactly this
 * handoff row (`jti`) targeting exactly this module (`aud`). `aud` is the
 * module slug, which maps 1:1 to the module's launch host / redirect URI, so
 * binding `aud` binds both the target module and its redirect target. The
 * tenant is bound transitively: `jti` references a persisted handoff row that
 * already carries the tenant, and the downstream consume re-verifies tenant
 * entitlement.
 */
export interface SsoExchangeCodeBinding {
  jti: string;
  aud: string;
  clientId?: string;
  redirectUri?: string;
  returnTo?: string;
  state?: string;
  nonce?: string;
  codeChallenge?: string;
}

/** Derive a stable 32-byte AES key from the shared secret (domain-separated). */
function exchangeCodeKey(secret: string): Buffer {
  return crypto
    .createHash('sha256')
    .update(`operatoros.sso.exchange-code.v1:${secret}`)
    .digest();
}

/**
 * Build the opaque, encrypted exchange code for a persisted handoff. The
 * binding (`jti` + `aud`) is serialized and authenticated-encrypted, so the
 * URL carries nothing readable or redeemable, and a code minted for one
 * module cannot be replayed against another.
 */
export function createSsoExchangeCode(binding: SsoExchangeCodeBinding, secret: string): string {
  const iv = crypto.randomBytes(EXCHANGE_CODE_IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', exchangeCodeKey(secret), iv);
  const plaintext = JSON.stringify({
    j: binding.jti,
    a: binding.aud,
    c: binding.clientId,
    r: binding.redirectUri,
    t: binding.returnTo,
    s: binding.state,
    n: binding.nonce,
    p: binding.codeChallenge,
  });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString('base64url');
}

/**
 * Decrypt an exchange code and return its `{ jti, aud }` binding, or `null`
 * if the code is malformed, truncated, or fails its authentication tag
 * (tampered, wrong secret, or forged). Fails closed on any error.
 */
export function parseSsoExchangeCode(
  code: unknown,
  secret: string,
): SsoExchangeCodeBinding | null {
  if (typeof code !== 'string' || code.length === 0) return null;
  let raw: Buffer;
  try {
    raw = Buffer.from(code, 'base64url');
  } catch {
    return null;
  }
  if (raw.length <= EXCHANGE_CODE_IV_BYTES + EXCHANGE_CODE_TAG_BYTES) return null;
  const iv = raw.subarray(0, EXCHANGE_CODE_IV_BYTES);
  const tag = raw.subarray(raw.length - EXCHANGE_CODE_TAG_BYTES);
  const ciphertext = raw.subarray(EXCHANGE_CODE_IV_BYTES, raw.length - EXCHANGE_CODE_TAG_BYTES);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', exchangeCodeKey(secret), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8',
    );
    const parsed = JSON.parse(plaintext) as {
      j?: unknown;
      a?: unknown;
      c?: unknown;
      r?: unknown;
      t?: unknown;
      s?: unknown;
      n?: unknown;
      p?: unknown;
    };
    if (typeof parsed.j !== 'string' || parsed.j.length === 0) return null;
    if (typeof parsed.a !== 'string' || parsed.a.length === 0) return null;
    for (const value of [parsed.c, parsed.r, parsed.t, parsed.s, parsed.n, parsed.p]) {
      if (value !== undefined && typeof value !== 'string') return null;
    }
    return {
      jti: parsed.j,
      aud: parsed.a,
      ...(typeof parsed.c === 'string' && parsed.c ? { clientId: parsed.c } : {}),
      ...(typeof parsed.r === 'string' && parsed.r ? { redirectUri: parsed.r } : {}),
      ...(typeof parsed.t === 'string' && parsed.t ? { returnTo: parsed.t } : {}),
      ...(typeof parsed.s === 'string' && parsed.s ? { state: parsed.s } : {}),
      ...(typeof parsed.n === 'string' && parsed.n ? { nonce: parsed.n } : {}),
      ...(typeof parsed.p === 'string' && parsed.p ? { codeChallenge: parsed.p } : {}),
    };
  } catch {
    return null;
  }
}

/** Build the module launch URL that carries an opaque exchange code. */
export function buildSsoLaunchUrlWithCode(baseUrl: string, code: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/sso?code=${encodeURIComponent(code)}`;
}
