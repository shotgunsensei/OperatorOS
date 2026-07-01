import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { OperatorOSModuleRegistryEntry } from '../modules/registry.js';

export const SSO_TOKEN_TTL_SECONDS = 90;
export const SSO_JWT_ALGORITHM = 'HS256' as const;
export const MIN_SSO_SECRET_LENGTH = 16;
export const DEFAULT_SSO_ISSUER = 'http://localhost:5000';

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

export function resolveSsoIssuer(): string {
  const explicit = typeof process !== 'undefined' ? process.env.OPERATOROS_BASE_URL : undefined;
  return normalizeSsoIssuer(explicit);
}

export function resolveSsoSecret(raw?: string | null): string | null {
  const value = raw ?? (typeof process !== 'undefined' ? process.env.MODULE_SSO_SECRET : undefined);
  if (!value || value.length < MIN_SSO_SECRET_LENGTH) return null;
  return value;
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
  const decoded = jwt.verify(token, input.secret, {
    algorithms: [SSO_JWT_ALGORITHM],
    audience: input.moduleId,
    issuer: normalizeSsoIssuer(input.issuer ?? resolveSsoIssuer()),
  });
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Invalid SSO token payload');
  }
  return decoded as OperatorOSSsoClaims;
}

export function buildSsoLaunchUrl(baseUrl: string, token: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/sso?token=${encodeURIComponent(token)}`;
}
