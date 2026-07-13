import { NextResponse, type NextRequest } from 'next/server';
import {
  resolveModuleContext,
  type ResolvedOperatorOSModuleContext,
} from '../../../packages/modules/registry.js';
import { getPublicOrigin } from '../../../packages/modules/public-url.js';

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

// Task #140 loop-breaker. If we bounce an anonymous visitor to login this
// many times without a session cookie ever taking hold, we stop redirecting
// (which would loop forever in the browser) and land them on a clean login
// surface with an error flag. The counter is a short-lived cookie scoped to
// `.operatoros.net` so it survives the cross-subdomain hop to the auth host,
// and it is cleared the moment a valid session cookie is seen.
const LOOP_COOKIE = 'os_sso_redirects';
const MAX_LOGIN_REDIRECTS = 3;
const COOKIE_DOMAIN = '.operatoros.net';

function isExempt(pathname: string): boolean {
  // Invite-accept flow handles its own pre-auth logic + localStorage
  // handoff; gating it would break invitation emails.
  if (pathname.startsWith('/app/invites/')) return true;
  // SSO handoff landing (`/sso`) must never be auth-gated: it is precisely
  // the endpoint that ESTABLISHES the session. Gating it would send an
  // arriving module launch back to login before it can consume its
  // token/code — the exact cross-subdomain loop Task #140 fixes.
  if (pathname === '/sso' || pathname.startsWith('/sso/')) return true;
  return false;
}

function clearLoopCounter(res: NextResponse): NextResponse {
  res.cookies.set(LOOP_COOKIE, '', {
    domain: COOKIE_DOMAIN,
    path: '/',
    maxAge: 0,
  });
  return res;
}

function isProtectedAppPath(pathname: string): boolean {
  return pathname === '/app' || pathname.startsWith('/app/');
}

function isModuleSurface(context: ResolvedOperatorOSModuleContext): boolean {
  return context.surface === 'module' || context.surface === 'local-module';
}

function redirectToLogin(req: NextRequest, context: ResolvedOperatorOSModuleContext) {
  const onOperatorOSHost =
    (context.surface === 'module' || context.surface === 'app') && context.isOperatorOSHost;
  const redirectCount = Number(req.cookies.get(LOOP_COOKIE)?.value ?? '0') || 0;

  // Loop breaker: we have already bounced this visitor to login
  // MAX_LOGIN_REDIRECTS times and a session cookie still is not present.
  // Redirecting again would spin the browser forever, so instead send them
  // to a clean login surface with an explicit error flag and reset the
  // counter. Only engages on OperatorOS hosts (the cross-subdomain case);
  // local dev never sets the domain-scoped counter cookie.
  if (onOperatorOSHost && redirectCount >= MAX_LOGIN_REDIRECTS) {
    const stop = req.nextUrl.clone();
    stop.protocol = 'https:';
    stop.port = '';
    stop.hostname = AUTH_HOST;
    stop.pathname = '/login';
    stop.search = '?launch_error=too_many_redirects';
    return clearLoopCounter(NextResponse.redirect(stop, 307));
  }

  const url = req.nextUrl.clone();

  // Preserve where the user was trying to go as an ABSOLUTE, clean public URL
  // (never carrying the internal `:5000` port). `getPublicOrigin` collapses
  // recognized production hosts to `https://<host>` and keeps dev origins as-is,
  // so after sign-in on the auth host we can hand the user back to the correct
  // subdomain (e.g. techdeck.operatoros.net) instead of stranding them on auth.
  const origin = getPublicOrigin({
    host: req.headers.get('host'),
    forwardedHost: req.headers.get('x-forwarded-host'),
    forwardedProto: req.headers.get('x-forwarded-proto'),
  });
  const target = `${origin}${req.nextUrl.pathname}${req.nextUrl.search || ''}`;

  // Cross-host redirect to the auth subdomain. Behind Replit's proxy the
  // inbound URL still carries the internal port + `http`, so we MUST clear the
  // port and force HTTPS or the browser gets `http://auth.operatoros.net:5000`.
  if (onOperatorOSHost) {
    url.protocol = 'https:';
    url.port = '';
    url.hostname = AUTH_HOST;
  }

  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(target)}`;
  const res = NextResponse.redirect(url, 307);
  // Increment the cross-subdomain bounce counter (prod hosts only). Short
  // TTL so a later, legitimately-anonymous visit doesn't inherit a stale
  // count. Cleared on the first authenticated request (see middleware()).
  if (onOperatorOSHost) {
    res.cookies.set(LOOP_COOKIE, String(redirectCount + 1), {
      domain: COOKIE_DOMAIN,
      path: '/',
      maxAge: 60,
      sameSite: 'lax',
      secure: true,
    });
  }
  return res;
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
    return clearLoopCounter(rewriteTo('/app', req));
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
    // Reached only after the auth-cookie gate above, so the visitor is
    // authenticated — clear any stale bounce counter from an earlier loop.
    if (context.module) {
      return clearLoopCounter(rewriteTo(`/modules/${context.module.slug}`, req));
    }
    return clearLoopCounter(rewriteTo('/modules/unknown-host', req));
  }

  if (req.cookies.has(AUTH_COOKIE)) return clearLoopCounter(NextResponse.next());

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
