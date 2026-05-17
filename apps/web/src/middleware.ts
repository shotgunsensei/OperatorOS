import { NextResponse, type NextRequest } from 'next/server';

/**
 * Marketing-redesign Phase 1 — server-side auth gate for /app/*.
 *
 * The Fastify API issues a session JWT in the `token` cookie on
 * /v1/auth/login + /v1/auth/register (see apps/api/src/routes/auth-
 * routes.ts). Most console surfaces require that cookie; if it's
 * missing we 307-redirect to `/` so the marketing surface stays the
 * unambiguous entry point and anonymous traffic never renders a
 * half-hydrated console shell or fires authenticated API calls.
 *
 * Exemptions (these must remain reachable without a cookie):
 *   - `/app` exact — this is the login/register surface itself. The
 *     ConsolePage gate renders LoginPage when `!user`, so blocking
 *     here would create a redirect loop ("Sign in" CTA → /app → / →
 *     "Sign in" CTA → ...) with no way to authenticate.
 *   - `/app/invites/:token` — the invite page reads the token, stashes
 *     it in localStorage, and bounces the user to `/app` to sign in;
 *     ConsolePage then re-reads the token and lands them back at the
 *     canonical invite URL. The page must run its own pre-auth logic
 *     for that handoff to work (and for `peek` to display invitee
 *     context before sign-in).
 *
 * Why presence-only:
 *   The Edge runtime doesn't share the API's JWT secret. We do a fast
 *   presence check here and leave full JWT verification to the API
 *   (which already enforces 401 on every request). A stale/tampered
 *   cookie still hits AuthProvider → /me → 401 → LoginPage, exactly
 *   as before. The middleware just keeps anonymous traffic out of the
 *   protected console tree so the contract is "nested /app/* needs auth".
 *
 * `next.config.js` already 308-redirects legacy /platform, /apps/:slug,
 * /invites/:token to their /app/* equivalents, so the matcher below
 * captures every authenticated console surface transitively.
 */
const AUTH_COOKIE = 'token';

function isExempt(pathname: string): boolean {
  // /app exact (login surface) — note matcher gives us /app/:path*,
  // and `pathname === '/app'` is the canonical signed-out landing.
  if (pathname === '/app') return true;
  // Invite-accept flow handles its own pre-auth logic + localStorage
  // handoff; gating it would break invitation emails.
  if (pathname.startsWith('/app/invites/')) return true;
  return false;
}

export function middleware(req: NextRequest) {
  if (isExempt(req.nextUrl.pathname)) return NextResponse.next();
  if (req.cookies.has(AUTH_COOKIE)) return NextResponse.next();

  // Anonymous → bounce to marketing home. `?next=` preserves the
  // intended destination so a future iteration of ConsolePage can
  // honor it after sign-in to deep-link signed-in users back to the
  // surface they originally tried to reach.
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
