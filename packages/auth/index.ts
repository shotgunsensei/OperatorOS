export const ROOT_SUPER_ADMIN_EMAIL = 'john@shotgunninjas.com';
export const SESSION_COOKIE_NAME = 'token';
export const SESSION_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const PRODUCTION_SESSION_COOKIE_DOMAIN = '.operatoros.net';

export type PlatformRole = 'super_admin' | 'user' | string | null | undefined;
export type SameSitePolicy = 'lax' | 'strict' | 'none';

export interface OperatorOSUserLike {
  id?: string;
  email?: string | null;
  role?: string | null;
  platformRole?: PlatformRole;
  status?: string | null;
  currentTenantId?: string | null;
}

export interface RequestWithUser<TUser extends OperatorOSUserLike = OperatorOSUserLike> {
  user?: TUser | null;
}

export interface SessionCookieOptions {
  path: '/';
  httpOnly: true;
  secure: boolean;
  sameSite: SameSitePolicy;
  domain?: string;
  maxAge?: number;
}

export interface SessionCookieOptionsInput {
  nodeEnv?: string | null;
  cookieDomain?: string | null;
  maxAge?: number | null;
}

export class AuthRequirementError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AuthRequirementError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function isRootSuperAdmin(user: Pick<OperatorOSUserLike, 'email'> | null | undefined): boolean {
  return normalizeEmail(user?.email) === ROOT_SUPER_ADMIN_EMAIL;
}

export function hasPlatformAdminAuthority(user: OperatorOSUserLike | null | undefined): boolean {
  return user?.platformRole === 'super_admin' || isRootSuperAdmin(user);
}

export function getCurrentUser<TUser extends OperatorOSUserLike = OperatorOSUserLike>(
  request: RequestWithUser<TUser> | null | undefined,
): TUser | null {
  return request?.user ?? null;
}

export function requireAuth<TUser extends OperatorOSUserLike = OperatorOSUserLike>(
  request: RequestWithUser<TUser> | null | undefined,
): TUser {
  const user = getCurrentUser(request);
  if (!user) {
    throw new AuthRequirementError(401, 'AUTH_REQUIRED', 'Authentication required');
  }
  return user;
}

export function requirePlatformAdmin<TUser extends OperatorOSUserLike = OperatorOSUserLike>(
  request: RequestWithUser<TUser> | null | undefined,
): TUser {
  const user = requireAuth(request);
  if (!hasPlatformAdminAuthority(user)) {
    throw new AuthRequirementError(403, 'PLATFORM_ROLE_REQUIRED', 'Platform super-admin role required');
  }
  return user;
}

/**
 * Production detection for the shared session cookie.
 *
 * The bug this guards against: the cookie is only scoped to
 * `.operatoros.net` (and marked `Secure`) in production. If we keyed that
 * off `NODE_ENV` alone but the deployment only sets `APP_ENV=production`
 * (which the rest of the platform treats as the prod signal — see
 * `isProductionEnv`, `resolveSsoIssuer`), the cookie became host-only and
 * was never sent to sibling subdomains (app./auth./<module>.operatoros.net).
 * That produced the cross-subdomain login loop. We now honor BOTH signals.
 *
 * An explicit `input.nodeEnv` still wins (kept for deterministic tests);
 * it accepts either `production` or `prod`.
 */
function runtimeIsProduction(explicit?: string | null): boolean {
  if (explicit !== undefined && explicit !== null) {
    const v = explicit.toLowerCase();
    return v === 'production' || v === 'prod';
  }
  if (typeof process === 'undefined') return false;
  const v = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  return v === 'production' || v === 'prod';
}

export function getSessionCookieOptions(input: SessionCookieOptionsInput = {}): SessionCookieOptions {
  const isProduction = runtimeIsProduction(input.nodeEnv);
  const configuredDomain = input.cookieDomain?.trim();
  const domain = isProduction
    ? (configuredDomain && configuredDomain.length > 0 ? configuredDomain : PRODUCTION_SESSION_COOKIE_DOMAIN)
    : undefined;

  return {
    path: '/',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    ...(domain ? { domain } : {}),
    maxAge: input.maxAge ?? SESSION_COOKIE_MAX_AGE_SECONDS,
  };
}

export function getSessionClearCookieOptions(
  input: Omit<SessionCookieOptionsInput, 'maxAge'> = {},
): Omit<SessionCookieOptions, 'maxAge'> {
  const { maxAge: _maxAge, ...options } = getSessionCookieOptions({ ...input, maxAge: null });
  return options;
}
