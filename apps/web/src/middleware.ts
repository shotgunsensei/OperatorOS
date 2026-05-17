import { NextResponse, type NextRequest } from 'next/server';

/**
 * Marketing-redesign Phase 1 — server-side auth gate for /app/*.
 *
 * The Fastify API issues a session JWT in the `token` cookie on
 * /v1/auth/login + /v1/auth/register (see apps/api/src/routes/auth-
 * routes.ts). The console (/app and every nested console surface)
 * requires that cookie; if it's missing, we 307-redirect to `/` so the
 * marketing surface is the unambiguous entry point and unauthenticated
 * traffic never hits a partial console shell or leaky API call.
 *
 * Why presence-only:
 *   The Edge runtime doesn't share the API's JWT secret. We do a fast
 *   presence check here and leave full JWT verification to the API
 *   (which already enforces 401 on every request). A stale/tampered
 *   cookie still hits AuthProvider → /me → 401 → LoginPage, exactly
 *   as before. The middleware just keeps anonymous traffic out of the
 *   console tree entirely so the contract is "/app/* requires auth".
 *
 * `next.config.js` already 308-redirects legacy /platform, /apps/:slug,
 * /invites/:token to their /app/* equivalents, so the matcher below
 * captures every authenticated console surface.
 */
const AUTH_COOKIE = 'token';

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has(AUTH_COOKIE);
  if (hasSession) return NextResponse.next();

  // Anonymous → bounce to marketing home. `?next=` preserves the
  // intended destination so AuthProvider/ConsolePage can resume after
  // sign-in if it ever wants to honor it (not wired in Phase 1).
  const url = req.nextUrl.clone();
  const target = url.pathname + (url.search || '');
  url.pathname = '/';
  url.search = `?next=${encodeURIComponent(target)}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Match the canonical /app tree only. Legacy /platform, /apps/:slug,
  // /invites/:token are 308-redirected into /app/* by next.config.js
  // before this middleware runs, so they get gated transitively.
  matcher: ['/app/:path*'],
};
