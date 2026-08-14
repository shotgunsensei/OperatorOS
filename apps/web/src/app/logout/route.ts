import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionClearCookieOptions,
  SESSION_COOKIE_NAME,
} from '../../../../../packages/auth/index.js';
import {
  buildPublicUrl,
  getPublicOrigin,
  sanitizeReturnTo,
} from '../../../../../packages/modules/public-url.js';

/**
 * Clear only the current host's OperatorOS session.
 *
 * Module sessions are intentionally host-only. A request to
 * https://techdeck.operatoros.net/logout therefore signs out TechDeck
 * without granting that host authority over sessions on sibling domains.
 * Global revocation remains an auth.operatoros.net control-plane action.
 */
export function GET(request: NextRequest) {
  const publicOrigin = getPublicOrigin({
    host: request.headers.get('host'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
  });
  const secure = new URL(publicOrigin).protocol === 'https:';

  const isReauth = request.nextUrl.searchParams.get('reauth') === '1';
  const requestedReturnTo = request.nextUrl.searchParams.get('return_to') || '/';
  const sanitizedReturnTo = sanitizeReturnTo(requestedReturnTo, '/');
  const safeReturnTo =
    sanitizedReturnTo.startsWith('/') &&
    !sanitizedReturnTo.startsWith('/logout') &&
    !sanitizedReturnTo.startsWith('/sso')
      ? sanitizedReturnTo
      : '/';

  // Explicit local logout never returns to the protected module/app root:
  // a surviving auth-host session would silently sign the user back in. The
  // reauth branch is distinct and is used only after /me rejects a stale or
  // revoked host cookie; clearing it and returning to the same local path lets
  // middleware start one clean central-auth transaction.
  const destination = isReauth
    ? new URL(safeReturnTo, publicOrigin)
    : new URL(buildPublicUrl('/signed-out?signed_out=local', 'root'));

  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    ...getSessionClearCookieOptions({ nodeEnv: secure ? 'production' : 'development' }),
    maxAge: 0,
    expires: new Date(0),
  });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
