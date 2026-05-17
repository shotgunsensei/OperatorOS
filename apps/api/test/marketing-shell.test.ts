/**
 * Marketing redesign Phase 1 — route-split smoke test.
 *
 * The marketing surface is served by Next.js (a separate workspace
 * from the Fastify API), so we cannot reach it through `app.inject`
 * the way the API integration tests do. Instead, we assert the route
 * split structurally:
 *
 *   1. The four public routes exist at the expected file paths and
 *      render through MarketingLayout (public shell, no auth gate in
 *      the page itself).
 *   2. The console moved to `apps/web/src/app/app/page.tsx` and still
 *      composes the same providers + LoginPage / SaasLayout so
 *      signed-out visitors land in the existing login flow and
 *      signed-in users land in the workspace.
 *   3. The brand chrome (OperatorMark / OperatorLogo / OperatorLoader)
 *      is in place, /robots.txt now disallows /app, and the manifest +
 *      root layout were rebranded.
 *
 * This is a fast file-shape check — it doesn't spin up Next, but it
 * fails loudly if a follow-up edit unintentionally collapses the
 * route split, forgets to gate /app behind LoginPage, or strips the
 * marketing layout from a public page.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB_ROOT = resolve(import.meta.dirname, '..', '..', 'web');

function read(rel: string): string {
  const p = resolve(WEB_ROOT, rel);
  assert.ok(existsSync(p), `Expected file to exist: ${rel}`);
  return readFileSync(p, 'utf-8');
}

test('marketing shell · public routes mount MarketingLayout', () => {
  for (const rel of [
    'src/app/page.tsx',
    'src/app/modules/page.tsx',
    'src/app/pricing/page.tsx',
    'src/app/how-it-works/page.tsx',
  ]) {
    const src = read(rel);
    assert.match(
      src,
      /MarketingLayout/,
      `${rel} should render through MarketingLayout`,
    );
    assert.doesNotMatch(
      src,
      /SaasLayout/,
      `${rel} is a public route and must not embed the console SaasLayout`,
    );
    assert.doesNotMatch(
      src,
      /TenantProvider/,
      `${rel} is a public route and must not mount TenantProvider`,
    );
  }
});

test('marketing shell · /app is the auth-gated console', () => {
  const src = read('src/app/app/page.tsx');
  for (const marker of [
    'AuthProvider',
    'TenantProvider',
    'ToastProvider',
    'SaasLayout',
    'LoginPage',
    'OperatorLoader',
  ]) {
    assert.match(src, new RegExp(marker), `/app/page.tsx should import ${marker}`);
  }
  // Signed-out branch must fall back to LoginPage — never to the old
  // public LandingPage (which was removed in Phase 1).
  assert.doesNotMatch(
    src,
    /LandingPage/,
    '/app should not re-render the legacy LandingPage; marketing lives at /',
  );
});

test('marketing shell · brand components present and exported', () => {
  for (const rel of [
    'src/components/brand/OperatorMark.tsx',
    'src/components/brand/OperatorLogo.tsx',
    'src/components/brand/OperatorLoader.tsx',
    'src/components/brand/OperatorBadge.tsx',
    'src/components/brand/index.ts',
    'src/components/marketing/MarketingLayout.tsx',
    'src/components/marketing/MarketingNavbar.tsx',
    'src/components/marketing/MarketingFooter.tsx',
    'src/components/marketing/MarketingPlaceholder.tsx',
  ]) {
    assert.ok(existsSync(resolve(WEB_ROOT, rel)), `Expected brand file: ${rel}`);
  }
  // The navbar must toggle CTA based on the AuthProvider session.
  const nav = read('src/components/marketing/MarketingNavbar.tsx');
  assert.match(nav, /useAuth/);
  assert.match(nav, /Go to console/);
  assert.match(nav, /Launch console/);
});

test('marketing shell · robots disallows /app, manifest rebranded', () => {
  const robots = read('src/app/robots.ts');
  assert.match(robots, /'\/app'/, 'robots.ts should disallow the /app console');

  const manifest = JSON.parse(read('public/manifest.json'));
  assert.equal(manifest.theme_color, '#080B12', 'manifest theme_color should be brand near-black');
  assert.equal(manifest.background_color, '#080B12', 'manifest background_color should be brand near-black');
  assert.match(
    manifest.description,
    /command layer/i,
    'manifest description should reflect the new brand line',
  );
});

test('marketing shell · next.config redirects legacy console URLs to /app/*', () => {
  // After the route split the canonical console surface is /app/*.
  // Legacy URLs (/platform, /apps/:slug, /invites/:token) live in
  // bookmarks, audit-log entries, and outgoing invitation emails — so
  // the Next config must 308-redirect them rather than 404-ing.
  const cfg = read('next.config.js');
  assert.match(cfg, /async redirects\(\)/, 'next.config.js should declare redirects()');
  for (const pair of [
    "{ source: '/platform',",
    "{ source: '/platform/:path*',",
    "{ source: '/apps/:slug',",
    "{ source: '/invites/:token',",
  ]) {
    assert.ok(
      cfg.includes(pair),
      `next.config.js redirects() should include ${pair}`,
    );
  }
  assert.match(cfg, /destination: '\/app\/platform'/);
  assert.match(cfg, /destination: '\/app\/platform\/:path\*'/);
  assert.match(cfg, /destination: '\/app\/apps\/:slug'/);
  assert.match(cfg, /destination: '\/app\/invites\/:token'/);
  assert.match(cfg, /permanent: true/);
});

test('marketing shell · /app/* canonical routes exist as re-exports', () => {
  // Re-exporting from the legacy file paths keeps a single source of
  // truth for the gate logic, slug parsing, and stateful behavior in
  // each surface — the canonical /app/* path simply renders the same
  // component tree.
  for (const rel of [
    'src/app/app/platform/[[...slug]]/page.tsx',
    'src/app/app/apps/[slug]/page.tsx',
    'src/app/app/invites/[token]/page.tsx',
  ]) {
    const src = read(rel);
    assert.match(src, /export \{ default \} from/, `${rel} should re-export the legacy implementation`);
  }
});

test('marketing shell · branded loading state covers marketing tree', () => {
  // Next.js renders src/app/loading.tsx automatically for any
  // suspending segment under /, so this is what visitors see during
  // initial nav / route transitions on /, /modules, /pricing,
  // /how-it-works. It must use the branded OperatorLoader on the
  // brand canvas instead of the default white blank.
  const src = read('src/app/loading.tsx');
  assert.match(src, /OperatorLoader/);
  assert.match(src, /brand\.bgPrimary/);
  assert.match(src, /data-testid="marketing-loading"/);
});

test('marketing shell · signed-in visitors auto-redirect from / to /app', () => {
  // The marketing home should keep public access for signed-out
  // visitors (SEO / first-touch) but bounce authenticated users into
  // their workspace so / behaves as a "land me in the console" entry
  // point. The check has to happen client-side because AuthProvider's
  // /me call hydrates only after mount.
  const src = read('src/app/page.tsx');
  assert.match(src, /'use client'/);
  assert.match(src, /useAuth/);
  assert.match(src, /router\.replace\(['"]\/app['"]\)/);
});

test('marketing shell · console-internal links point at /app, not /', () => {
  // Regression guard: when the console moved to /app, several
  // sibling routes were still linking back to `/` for "home" / "back
  // to workspace". Post-split, `/` is the marketing landing, so
  // those links must explicitly target `/app` to avoid bouncing
  // signed-in users out of the product.
  const checks: Array<{ rel: string; pattern: RegExp; label: string }> = [
    {
      rel: 'src/app/invites/[token]/page.tsx',
      pattern: /router\.replace\(['"]\/app['"]\)/,
      label: 'invite page should redirect to /app for sign-in/post-accept',
    },
    {
      rel: 'src/app/apps/[slug]/page.tsx',
      pattern: /href=["']\/app["']/,
      label: 'apps/[slug] Back link should point at /app',
    },
    {
      rel: 'src/app/platform/[[...slug]]/page.tsx',
      pattern: /href=["']\/app["']/,
      label: 'platform 403 fallback should send users to /app',
    },
  ];
  for (const { rel, pattern, label } of checks) {
    const src = read(rel);
    assert.match(src, pattern, label);
  }
});

test('marketing shell · root layout loads Space Grotesk + brand tokens', () => {
  const layout = read('src/app/layout.tsx');
  assert.match(layout, /Space\+Grotesk/, 'layout.tsx should request Space Grotesk');
  assert.match(layout, /brandCssVariables/, 'layout.tsx should inject brand CSS variables');
  assert.match(layout, /brand\.bgPrimary/, 'layout.tsx should use the brand background token');
});

// ─────────────────────────────────────────────────────────────────────
// HTTP reachability — runs against the dev workflow on :5000 when
// available. The test is skipped (not failed) if the Next dev server
// isn't up, so CI environments without a running web workflow don't
// false-fail; but when a developer runs the suite locally against
// `pnpm dev`, this is the layer that catches a real broken route or
// a missing redirect.
// ─────────────────────────────────────────────────────────────────────

const WEB_BASE = process.env.WEB_BASE_URL ?? 'http://localhost:5000';

async function probe(path: string, init?: RequestInit) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    return await fetch(`${WEB_BASE}${path}`, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function webIsUp(): Promise<boolean> {
  try {
    const r = await probe('/', { method: 'HEAD' });
    return r.status < 500 || r.status === 405; // 405 = HEAD not allowed; still up
  } catch {
    return false;
  }
}

test('marketing shell · HTTP — public marketing routes return 200', { concurrency: false }, async (t) => {
  if (!(await webIsUp())) {
    t.skip('Next dev server not reachable at ' + WEB_BASE);
    return;
  }
  for (const path of ['/', '/modules', '/pricing', '/how-it-works']) {
    const r = await probe(path);
    assert.equal(r.status, 200, `GET ${path} should be 200 for anonymous visitors`);
    const body = await r.text();
    assert.match(body, /OperatorOS/i, `GET ${path} should render branded HTML`);
  }
});

test('marketing shell · HTTP — /app reaches the inline LoginPage for anonymous users', { concurrency: false }, async (t) => {
  if (!(await webIsUp())) {
    t.skip('Next dev server not reachable at ' + WEB_BASE);
    return;
  }
  // /app is exempt from middleware because it IS the login surface —
  // ConsolePage renders LoginPage when there is no user. Gating it
  // would create a redirect loop with the "Launch console" CTA.
  const r = await probe('/app', { redirect: 'manual' });
  assert.equal(r.status, 200, 'GET /app should return 200 so the LoginPage can render');
  const body = await r.text();
  // ConsolePage is a client component, so the LoginPage form itself is
  // injected after hydration — the SSR'd HTML carries the branded
  // shell. The contract here is "/app is reachable without a cookie";
  // confirming a 200 + the OperatorOS shell is sufficient.
  assert.match(body, /OperatorOS/i, 'GET /app should serve the branded shell to anonymous visitors');
});

test('marketing shell · HTTP — nested /app/* console routes 307 anonymous traffic to /', { concurrency: false }, async (t) => {
  if (!(await webIsUp())) {
    t.skip('Next dev server not reachable at ' + WEB_BASE);
    return;
  }
  // Nested console surfaces (Platform Command, per-module pages) are
  // gated server-side: anonymous traffic gets bounced to / so we don't
  // render half-hydrated console shells or fire authenticated /me calls.
  for (const path of ['/app/platform', '/app/platform/tenants', '/app/apps/example']) {
    const r = await probe(path, { redirect: 'manual' });
    assert.ok(
      r.status === 307 || r.status === 302,
      `GET ${path} without auth cookie should redirect (got ${r.status})`,
    );
    const loc = r.headers.get('location') ?? '';
    assert.ok(loc.startsWith('/?') || loc === '/', `Location should point at marketing, got ${loc}`);
  }
});

test('marketing shell · HTTP — /app/invites/:token bypasses middleware for the pre-auth handoff', { concurrency: false }, async (t) => {
  if (!(await webIsUp())) {
    t.skip('Next dev server not reachable at ' + WEB_BASE);
    return;
  }
  // The invite page handles its own auth state: it reads the token,
  // stashes it in localStorage, and redirects to /app to sign in.
  // Middleware must NOT pre-empt that flow or invitation emails break.
  const r = await probe('/app/invites/example-token', { redirect: 'manual' });
  assert.equal(r.status, 200, 'GET /app/invites/:token should reach the page logic without a cookie');
});

test('marketing shell · /app/* server-side auth gate (middleware)', () => {
  // The Edge middleware enforces "nested /app/* requires auth" by
  // checking for the `token` cookie issued by Fastify's auth-routes
  // and 307-redirecting cookie-less requests to `/`. Critical
  // exemptions: `/app` itself (login surface — gating it would loop
  // the "Launch console" CTA) and `/app/invites/:token` (the invite
  // page runs its own pre-auth localStorage handoff).
  const src = read('src/middleware.ts');
  assert.match(src, /matcher.*\/app/);
  assert.match(src, /token/, 'middleware should check the auth cookie issued by /v1/auth/login');
  assert.match(src, /NextResponse\.redirect/);
  assert.match(src, /pathname === '\/app'/, 'middleware must exempt /app so LoginPage is reachable');
  assert.match(src, /\/app\/invites\//, 'middleware must exempt /app/invites/:token for the pre-auth handoff');
});

test('marketing shell · footer attribution reads "Powered by Shotgun Ninjas Productions"', () => {
  // Brand contract: full attribution string with "Productions". A
  // truncated "Shotgun Ninjas" fails the spec even if visually close.
  const src = read('src/components/marketing/MarketingFooter.tsx');
  assert.match(
    src,
    /Shotgun Ninjas Productions/,
    'footer attribution must include "Productions" per brand spec',
  );
});

test('marketing shell · HTTP — legacy /platform /apps /invites 308-redirect under /app', { concurrency: false }, async (t) => {
  if (!(await webIsUp())) {
    t.skip('Next dev server not reachable at ' + WEB_BASE);
    return;
  }
  const cases: Array<{ from: string; to: string }> = [
    { from: '/platform',               to: '/app/platform' },
    { from: '/platform/tenants',       to: '/app/platform/tenants' },
    { from: '/apps/some-module',       to: '/app/apps/some-module' },
    { from: '/invites/abc-123',        to: '/app/invites/abc-123' },
  ];
  for (const { from, to } of cases) {
    const r = await probe(from, { redirect: 'manual' });
    assert.ok(
      r.status === 308 || r.status === 307 || r.status === 301 || r.status === 302,
      `GET ${from} should be a redirect, got ${r.status}`,
    );
    const loc = r.headers.get('location') ?? '';
    assert.ok(
      loc.endsWith(to),
      `GET ${from} should redirect to ${to}, got Location: ${loc}`,
    );
  }
});

test('marketing shell · HTTP — /robots.txt disallows /app', { concurrency: false }, async (t) => {
  if (!(await webIsUp())) {
    t.skip('Next dev server not reachable at ' + WEB_BASE);
    return;
  }
  const r = await probe('/robots.txt');
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.match(body, /Disallow:\s*\/app/, '/robots.txt should disallow /app');
});
