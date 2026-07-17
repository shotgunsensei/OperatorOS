export const ROOT_SUPER_ADMIN_EMAIL = 'john@shotgunninjas.com';
export const SESSION_COOKIE_NAME = 'operatoros_session';
export const SESSION_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

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

/** Production detection controls Secure; cookie scope remains host-only. */
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
  return {
    path: '/',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: input.maxAge ?? SESSION_COOKIE_MAX_AGE_SECONDS,
  };
}

export function getSessionClearCookieOptions(
  input: Omit<SessionCookieOptionsInput, 'maxAge'> = {},
): Omit<SessionCookieOptions, 'maxAge'> {
  const { maxAge: _maxAge, ...options } = getSessionCookieOptions({ ...input, maxAge: null });
  return options;
}
