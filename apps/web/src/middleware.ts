import { NextResponse, type NextRequest } from 'next/server';
import {
  getModuleById,
  resolveModuleContext,
  type ResolvedOperatorOSModuleContext,
} from '../../../packages/modules/registry.js';
import {
  buildPublicUrl,
  getPublicOrigin,
  isLocalHost,
  sanitizeReturnTo,
} from '../../../packages/modules/public-url.js';
import {
  DEFAULT_OPERATOROS_APPS_URL,
  resolveOperatorOSAppsUrl,
} from '../../../packages/modules/navigation.js';
import {
  SSO_NONCE_COOKIE_NAME,
  SSO_PKCE_METHOD,
  SSO_STATE_COOKIE_NAME,
  SSO_TRANSACTION_MAX_AGE_SECONDS,
  SSO_VERIFIER_COOKIE_NAME,
} from '../../../packages/sso/browser-contract.js';

/**
 * Marketing-redesign Phase 1 plus OperatorOS consolidation Phase 5:
 * server-side auth gate for /app/* and host-based module routing.
 *
 * The Fastify API issues a session JWT in the host-only `operatoros_session` cookie on
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
 *   - `/app/invites/:token` — the invite page reads the token, keeps
 *     it in tab-scoped sessionStorage, and bounces the user to `/app` to sign in;
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
const AUTH_COOKIE = 'operatoros_session';
const AUTH_HOST = 'auth.operatoros.net';
const API_HOST = 'api.operatoros.net';
const DEFAULT_REPLIT_HOST = 'operator-os.replit.app';
const WWW_HOST = 'www.operatoros.net';

// Login loop-breaker. If we bounce an anonymous visitor to login this
// many times without a session cookie ever taking hold, we stop redirecting
// and land them on a clean login surface with an error flag. The counter is
// short-lived and host-only.
const LOOP_COOKIE = 'os_sso_redirects';
const MAX_LOGIN_REDIRECTS = 3;

// Task #140 open-redirect hardening. The fallback for a rejected `next` MUST
// be a canonical, allowlisted OperatorOS URL that is NOT derived from the
// inbound Host / X-Forwarded-Host header. Deriving it from the request host
// (e.g. `${origin}/app`) let a spoofed Host header leak straight back into the
// redirect target. The navigation contract resolves from the registered app
// host, so this constant is always `https://app.operatoros.net/`.
const CANONICAL_APP_URL = DEFAULT_OPERATOROS_APPS_URL;
const AUTH_ENTRY_MODES = new Set(['register', 'forgot-password', 'reset-password']);

function withAuthSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}

function isOperationalExempt(pathname: string): boolean {
  // Public operational readiness and local host-session termination must
  // reach their concrete handlers without being rewritten into a module
  // shell or redirected through login.
  if (pathname === '/healthz' || pathname === '/readyz' || pathname === '/logout') return true;
  return false;
}

function isPublicTradeFlowKitDocumentPath(pathname: string): boolean {
  return /^\/public\/tradeflowkit\/(quotes|invoices|customers)\/[A-Za-z0-9_-]{32,64}$/.test(pathname);
}

function techDeckPublicDestination(pathname: string): string | null {
  const status = /^\/status\/([a-z0-9-]{1,120})\/?$/.exec(pathname);
  if (status) return `/public/techdeck/status/${status[1]}`;
  const intake = /^\/t\/upload\/(tdi_[A-Za-z0-9_-]{24,200})\/?$/.exec(pathname);
  if (intake) return `/public/techdeck/intake/${intake[1]}`;
  return null;
}

function pulseDeskPublicDestination(pathname: string): string | null {
  const intake = /^\/submit\/([a-z0-9-]{8,64})\/?$/.exec(pathname);
  return intake ? `/public/pulsedesk/intake/${intake[1]}` : null;
}

function ninjaLaunchKitPublicDestination(pathname: string): string | null {
  const normalized = pathname === '/' ? 'home' : pathname.replace(/^\//, '').replace(/\/$/, '');
  return ['home', 'pricing', 'contact', 'terms', 'privacy'].includes(normalized)
    ? `/public/ninja-launch-kit/${normalized}`
    : null;
}

function isSsoCallbackPath(pathname: string): boolean {
  return pathname === '/sso' || pathname.startsWith('/sso/');
}

function isRegisteredSsoCallback(
  pathname: string,
  context: ResolvedOperatorOSModuleContext,
): boolean {
  if (pathname !== '/sso') return false;

  // Preserve explicit loopback/preview development without weakening the
  // production exact-callback contract.
  if (process.env.NODE_ENV !== 'production' && isLocalHost(context.host)) return true;

  const module = context.module;
  if (!module || module.status !== 'active') return false;
  return module.exactRedirectUris.some((uri) => {
    try {
      const callback = new URL(uri);
      return callback.hostname.toLowerCase() === context.host && callback.pathname === pathname;
    } catch {
      return false;
    }
  });
}

function isInvitePath(pathname: string): boolean {
  return pathname.startsWith('/app/invites/');
}

function canonicalizeNoncanonicalHost(
  req: NextRequest,
  context: ResolvedOperatorOSModuleContext,
): NextResponse | null {
  if (context.host !== WWW_HOST && context.host !== DEFAULT_REPLIT_HOST) return null;

  // An authorization code is bound to its exact registered callback. Never
  // carry a code from an unregistered alias onto the root callback; restart
  // from the canonical protected surface instead.
  const isCallback = isSsoCallbackPath(req.nextUrl.pathname);
  const destination = new URL(buildPublicUrl(isCallback ? '/app' : req.nextUrl.pathname, 'root'));
  if (!isCallback) destination.search = req.nextUrl.search;
  return withAuthSecurityHeaders(NextResponse.redirect(destination, 308));
}

function canonicalizeProductionModulePath(
  req: NextRequest,
  context: ResolvedOperatorOSModuleContext,
): NextResponse | null {
  if (context.surface !== 'root' && context.surface !== 'app') return null;
  const match = /^\/modules\/([^/?#]+)(.*)$/.exec(req.nextUrl.pathname);
  if (!match?.[1]) return null;

  let slug = match[1];
  try { slug = decodeURIComponent(slug); } catch { /* reject below */ }
  const module = getModuleById(slug);
  if (!module || module.id === 'operatoros' || module.status !== 'active') {
    return withAuthSecurityHeaders(NextResponse.redirect(
      new URL(buildPublicUrl('/app?launch_error=unknown_or_unavailable_module', 'root')),
      308,
    ));
  }

  const destination = new URL(module.productionBaseUrl);
  destination.pathname = match[2] || module.launchPath || '/';
  destination.search = req.nextUrl.search;
  return withAuthSecurityHeaders(NextResponse.redirect(destination, 308));
}

function canonicalizeLegacyAppPath(
  req: NextRequest,
  context: ResolvedOperatorOSModuleContext,
): NextResponse | null {
  if (req.nextUrl.pathname !== '/app') return null;
  if (!context.isOperatorOSHost || (context.surface !== 'root' && context.surface !== 'app')) return null;

  // Local development still mounts the console at /app. Production aliases
  // never inspect or forward next/return/redirect parameters: the only target
  // is the validated configuration value, which prevents open redirects.
  const destination = resolveOperatorOSAppsUrl(
    process.env.OPERATOROS_APPS_URL,
    isLocalHost(context.host) ? (process.env.NODE_ENV ?? 'development') : 'production',
  );
  return withAuthSecurityHeaders(NextResponse.redirect(new URL(destination), 308));
}

function clearLoopCounter(res: NextResponse): NextResponse {
  res.cookies.set(LOOP_COOKIE, '', {
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

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomTransactionValue(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function setTransactionCookie(res: NextResponse, name: string, value: string, secure: boolean) {
  res.cookies.set(name, value, {
    path: '/',
    maxAge: SSO_TRANSACTION_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    secure,
  });
}

async function redirectToLogin(req: NextRequest, context: ResolvedOperatorOSModuleContext) {
  const onOperatorOSHost =
    ['root', 'app', 'module'].includes(context.surface) && context.isOperatorOSHost;
  const redirectCount = Number(req.cookies.get(LOOP_COOKIE)?.value ?? '0') || 0;

  // Loop breaker: we have already bounced this visitor to login
  // MAX_LOGIN_REDIRECTS times and a session cookie still is not present.
  // Redirecting again would spin the browser forever, so instead send them
  // to a clean login surface with an explicit error flag and reset the
  // counter. Only engages on OperatorOS production hosts; local dev never
  // sets the production loop counter.
  if (onOperatorOSHost && redirectCount >= MAX_LOGIN_REDIRECTS) {
    const stop = req.nextUrl.clone();
    stop.protocol = 'https:';
    stop.port = '';
    stop.hostname = AUTH_HOST;
    stop.pathname = '/login';
    stop.search = '?launch_error=too_many_redirects';
    return withAuthSecurityHeaders(clearLoopCounter(NextResponse.redirect(stop, 307)));
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
  // Strict redirect allowlist: the `next` we hand to the login surface must
  // point back at a canonical OperatorOS host only. `sanitizeReturnTo` rejects
  // arbitrary/external origins (and protocol-relative `//evil.com`), collapsing
  // anything off-allowlist to the safe app fallback so a spoofed Host header
  // can never turn this into an open redirect.
  const isCanonicalLoginEntry =
    onOperatorOSHost &&
    (context.surface === 'root' || context.surface === 'app') &&
    req.nextUrl.pathname === '/login';
  const loginEntryFallback = context.surface === 'app'
    ? CANONICAL_APP_URL
    : buildPublicUrl('/app', 'root');
  const rawTarget = isCanonicalLoginEntry
    ? req.nextUrl.searchParams.get('next') ?? loginEntryFallback
    : `${origin}${req.nextUrl.pathname}${req.nextUrl.search || ''}`;
  let target = sanitizeReturnTo(
    rawTarget,
    isCanonicalLoginEntry ? loginEntryFallback : CANONICAL_APP_URL,
  );

  if (isCanonicalLoginEntry) {
    // A marketing/login entry must return to the same host that owns this
    // transaction. Otherwise the API correctly rejects the authorization
    // request because returnTo and redirect_uri have different origins.
    // Explicitly exclude /login and /sso to prevent a completed transaction
    // from restarting itself or returning to the callback endpoint.
    const targetUrl = new URL(target, origin);
    if (
      targetUrl.origin !== origin ||
      targetUrl.pathname === '/login' ||
      isSsoCallbackPath(targetUrl.pathname)
    ) {
      target = loginEntryFallback;
    }
  }
  const module = context.module ?? getModuleById('operatoros');
  const redirectUri = `${origin}/sso`;
  const state = randomTransactionValue();
  const nonce = randomTransactionValue();
  const verifier = randomTransactionValue(48);
  const challenge = await pkceChallenge(verifier);

  // Cross-host redirect to the auth subdomain. Behind Replit's proxy the
  // inbound URL still carries the internal port + `http`, so we MUST clear the
  // port and force HTTPS or the browser gets `http://auth.operatoros.net:5000`.
  if (onOperatorOSHost) {
    url.protocol = 'https:';
    url.port = '';
    url.hostname = AUTH_HOST;
  }

  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', target);
  url.searchParams.set('client_id', module?.clientId ?? 'operatoros:web');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', SSO_PKCE_METHOD);
  const requestedMode = isCanonicalLoginEntry ? req.nextUrl.searchParams.get('mode') : null;
  if (requestedMode && AUTH_ENTRY_MODES.has(requestedMode)) {
    url.searchParams.set('mode', requestedMode);
  }
  const res = NextResponse.redirect(url, 307);
  const secureCookie = onOperatorOSHost || req.nextUrl.protocol === 'https:';
  setTransactionCookie(res, SSO_STATE_COOKIE_NAME, state, secureCookie);
  setTransactionCookie(res, SSO_NONCE_COOKIE_NAME, nonce, secureCookie);
  setTransactionCookie(res, SSO_VERIFIER_COOKIE_NAME, verifier, secureCookie);
  // Increment the cross-subdomain bounce counter (prod hosts only). Short
  // TTL so a later, legitimately-anonymous visit doesn't inherit a stale
  // count. Cleared on the first authenticated request (see middleware()).
  if (onOperatorOSHost) {
    res.cookies.set(LOOP_COOKIE, String(redirectCount + 1), {
      path: '/',
      maxAge: 60,
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    });
  }
  return withAuthSecurityHeaders(res);
}

function rewriteTo(pathname: string, req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.rewrite(url);
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const context = resolveModuleContext({
    url: req.url,
    pathname,
    headers: req.headers,
    cookies: req.cookies,
  });

  const canonicalRedirect = canonicalizeNoncanonicalHost(req, context);
  if (canonicalRedirect) return canonicalRedirect;

  const legacyAppRedirect = canonicalizeLegacyAppPath(req, context);
  if (legacyAppRedirect) return legacyAppRedirect;

  // `/modules/<slug>` is a loopback/preview development convenience only.
  // Production root/app requests move to the module's canonical subdomain.
  const modulePathRedirect = canonicalizeProductionModulePath(req, context);
  if (modulePathRedirect) return modulePathRedirect;

  // The API hostname is a transparent path-preserving proxy to Fastify. Do
  // not let page-oriented auth or local-module path rules intercept API paths
  // before next.config's beforeFiles host rewrite runs.
  if (context.host === API_HOST) return NextResponse.next();

  if (isSsoCallbackPath(pathname)) {
    if (isRegisteredSsoCallback(pathname, context)) {
      return withAuthSecurityHeaders(NextResponse.next());
    }

    // Never render or exchange a callback on auth, unknown, planned, or any
    // other unregistered host. Do not forward the supplied code/state.
    return withAuthSecurityHeaders(
      NextResponse.redirect(
        new URL(buildPublicUrl('/app?launch_error=callback_host_not_registered', 'root')),
        307,
      ),
    );
  }

  if (isOperationalExempt(pathname)) return withAuthSecurityHeaders(NextResponse.next());
  if (isPublicTradeFlowKitDocumentPath(pathname) && context.module?.slug === 'tradeflowkit') {
    return withAuthSecurityHeaders(NextResponse.next());
  }
  if (context.module?.slug === 'techdeck') {
    const destination = techDeckPublicDestination(pathname);
    if (destination) return withAuthSecurityHeaders(rewriteTo(destination, req));
  }
  if (context.module?.slug === 'pulsedesk') {
    const destination = pulseDeskPublicDestination(pathname);
    if (destination) return withAuthSecurityHeaders(rewriteTo(destination, req));
  }
  if (context.module?.slug === 'ninja-launch-kit') {
    const destination = ninjaLaunchKitPublicDestination(pathname);
    if (destination) return withAuthSecurityHeaders(rewriteTo(destination, req));
    if (pathname === '/login' || pathname === '/signup') {
      const mode = pathname === '/signup' ? '&mode=register' : '';
      const next = encodeURIComponent('https://ninjalaunchkit.operatoros.net/dashboard');
      return withAuthSecurityHeaders(NextResponse.redirect(new URL(buildPublicUrl(`/login?next=${next}${mode}`, 'root')), 307));
    }
  }

  if (context.surface === 'auth' && pathname === '/') {
    return withAuthSecurityHeaders(rewriteTo('/login', req));
  }

  if (context.surface === 'auth') {
    // Invitation links belong to the console/root surface. Preserve the
    // opaque invitation path while keeping it off the auth hostname.
    if (isInvitePath(pathname)) {
      return withAuthSecurityHeaders(
        NextResponse.redirect(new URL(buildPublicUrl(`${pathname}${req.nextUrl.search}`, 'root')), 307),
      );
    }
    if (pathname !== '/login') {
      return withAuthSecurityHeaders(NextResponse.redirect(CANONICAL_APP_URL, 307));
    }
    return withAuthSecurityHeaders(NextResponse.next());
  }

  // Production marketing CTAs intentionally use the simple `/login` path.
  // Start the complete OperatorOS authorization-code transaction here so the
  // user authenticates on auth.operatoros.net first, then receives a separate
  // host-only session on the root/app callback host. Without this canonical
  // entry, root login succeeds but the central auth host stays anonymous and
  // the first module launch prompts for credentials again.
  if (
    pathname === '/login' &&
    context.isOperatorOSHost &&
    (context.surface === 'root' || context.surface === 'app')
  ) {
    return await redirectToLogin(req, context);
  }

  // Invite-accept handles its own pre-auth token handoff. Permit it only on
  // the root/app surfaces (plus localhost/Replit preview development), never
  // on auth or module production hosts.
  if (
    isInvitePath(pathname) &&
    (context.surface === 'root' || context.surface === 'app' || !context.isOperatorOSHost)
  ) {
    return withAuthSecurityHeaders(NextResponse.next());
  }

  if (context.surface === 'app' && pathname === '/') {
    if (!req.cookies.has(AUTH_COOKIE)) return await redirectToLogin(req, context);
    return clearLoopCounter(rewriteTo('/app', req));
  }

  if (context.status === 'unknown_host' && context.isOperatorOSHost && !isModuleSurface(context)) {
    const url = req.nextUrl.clone();
    url.pathname = '/modules/unknown-host';
    url.searchParams.set('host', context.host);
    return NextResponse.rewrite(url);
  }

  if ((isProtectedAppPath(pathname) || isModuleSurface(context)) && !req.cookies.has(AUTH_COOKIE)) {
    return await redirectToLogin(req, context);
  }

  if (isModuleSurface(context)) {
    // Reached only after the auth-cookie gate above, so the visitor is
    // authenticated — clear any stale bounce counter from an earlier loop.
    if (context.module) {
      // Preserve the module-host deep path in the internal route. The current
      // shell may render a common surface, but migrated module routers can now
      // observe `/tickets/42`, `/settings`, etc. instead of every request
      // collapsing permanently to the module root.
      const modulePath = context.surface === 'module' && pathname !== '/'
        ? pathname
        : '';
      return clearLoopCounter(rewriteTo(`/modules/${context.module.slug}${modulePath}`, req));
    }
    return clearLoopCounter(rewriteTo('/modules/unknown-host', req));
  }

  if (req.cookies.has(AUTH_COOKIE)) return clearLoopCounter(NextResponse.next());

  // Anonymous → bounce to the dedicated /login surface. `?next=`
  // preserves the intended destination so LoginGate can deep-link the
  // user back to where they tried to go (e.g. /app/platform/tenants)
  // immediately after sign-in.
  if (isProtectedAppPath(pathname)) return await redirectToLogin(req, context);

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
