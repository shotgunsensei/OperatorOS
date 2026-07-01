import { NextResponse, type NextRequest } from 'next/server';
import {
  resolveModuleContext,
  type ResolvedOperatorOSModuleContext,
} from '../../../packages/modules/registry.js';

/**
 * Marketing-redesign Phase 1 plus OperatorOS consolidation Phase 5:
 * server-side auth gate for /app/* and host-based module routing.
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
 * /invites/:token to their /app/* equivalents. Phase 5 additionally
 * rewrites `<module>.operatoros.net/*` and local `/modules/:slug` to
 * the shared module shell while leaving API entitlement checks as the
 * authoritative authorization layer.
 */
const AUTH_COOKIE = 'token';
const AUTH_HOST = 'auth.operatoros.net';

function isExempt(pathname: string): boolean {
  // Invite-accept flow handles its own pre-auth logic + localStorage
  // handoff; gating it would break invitation emails.
  if (pathname.startsWith('/app/invites/')) return true;
  return false;
}

function isProtectedAppPath(pathname: string): boolean {
  return pathname === '/app' || pathname.startsWith('/app/');
}

function isModuleSurface(context: ResolvedOperatorOSModuleContext): boolean {
  return context.surface === 'module' || context.surface === 'local-module';
}

function redirectToLogin(req: NextRequest, context: ResolvedOperatorOSModuleContext) {
  const url = req.nextUrl.clone();
  const target = req.nextUrl.pathname + (req.nextUrl.search || '');

  if ((context.surface === 'module' || context.surface === 'app') && context.isOperatorOSHost) {
    url.hostname = AUTH_HOST;
  }

  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(target)}`;
  return NextResponse.redirect(url, 307);
}

function rewriteTo(pathname: string, req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.rewrite(url);
}

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (isExempt(pathname)) return NextResponse.next();

  const context = resolveModuleContext({
    url: req.url,
    pathname,
    headers: req.headers,
    cookies: req.cookies,
  });

  if (context.surface === 'auth' && pathname === '/') {
    return rewriteTo('/login', req);
  }

  if (context.surface === 'app' && pathname === '/') {
    if (!req.cookies.has(AUTH_COOKIE)) return redirectToLogin(req, context);
    return rewriteTo('/app', req);
  }

  if (context.status === 'unknown_host' && context.isOperatorOSHost && !isModuleSurface(context)) {
    const url = req.nextUrl.clone();
    url.pathname = '/modules/unknown-host';
    url.searchParams.set('host', context.host);
    return NextResponse.rewrite(url);
  }

  if ((isProtectedAppPath(pathname) || isModuleSurface(context)) && !req.cookies.has(AUTH_COOKIE)) {
    return redirectToLogin(req, context);
  }

  if (isModuleSurface(context)) {
    if (context.module) {
      return rewriteTo(`/modules/${context.module.slug}`, req);
    }
    return rewriteTo('/modules/unknown-host', req);
  }

  if (req.cookies.has(AUTH_COOKIE)) return NextResponse.next();

  // Anonymous → bounce to the dedicated /login surface. `?next=`
  // preserves the intended destination so LoginGate can deep-link the
  // user back to where they tried to go (e.g. /app/platform/tenants)
  // immediately after sign-in.
  if (isProtectedAppPath(pathname)) return redirectToLogin(req, context);

  return NextResponse.next();
}

export const config = {
  // Match console routes, local module fallbacks, and hostname-routed
  // page requests. API routes and static assets stay out of middleware.
  matcher: [
    '/app/:path*',
    '/modules/:path*',
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json|.*\\..*).*)',
  ],
};
