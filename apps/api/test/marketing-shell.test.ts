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

test('marketing shell · HTTP — /app and nested /app/* 307 anonymous traffic to /login', { concurrency: false }, async (t) => {
  if (!(await webIsUp())) {
    t.skip('Next dev server not reachable at ' + WEB_BASE);
    return;
  }
  // The console tree is fully auth-gated server-side: every /app/*
  // request without the `token` cookie 307-redirects to /login with
  // ?next= preserving the intended destination. The sign-in flow
  // lives at /login (its own route) so /app can enforce this contract
  // without creating a redirect loop with the "Sign in" CTA.
  for (const path of ['/app', '/app/platform', '/app/platform/tenants', '/app/apps/example']) {
    const r = await probe(path, { redirect: 'manual' });
    assert.ok(
      r.status === 307 || r.status === 302,
      `GET ${path} without auth cookie should redirect (got ${r.status})`,
    );
    const loc = r.headers.get('location') ?? '';
    assert.ok(
      loc.includes('/login'),
      `GET ${path} should redirect to /login (got Location: ${loc})`,
    );
    assert.ok(
      loc.includes('next='),
      `Redirect should preserve ?next= for post-login deep-linking (got ${loc})`,
    );
  }
});

test('marketing shell · HTTP — /login is reachable and renders the sign-in surface', { concurrency: false }, async (t) => {
  if (!(await webIsUp())) {
    t.skip('Next dev server not reachable at ' + WEB_BASE);
    return;
  }
  const r = await probe('/login', { redirect: 'manual' });
  assert.equal(r.status, 200, 'GET /login should return 200 so anonymous users can sign in');
  const body = await r.text();
  assert.match(body, /OperatorOS/i, 'GET /login should serve the branded shell');
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
  assert.match(src, /\/login/, 'middleware must redirect anonymous traffic to the /login surface');
  assert.match(src, /\/app\/invites\//, 'middleware must exempt /app/invites/:token for the pre-auth handoff');
  // /app itself is no longer exempt — the dedicated /login route
  // means we can enforce the "/app/* requires auth" contract on every
  // console surface, including the root /app landing.
  assert.doesNotMatch(
    src,
    /pathname === ['"]\/app['"]/,
    'middleware must not exempt /app (login lives at /login, not /app)',
  );
});

test('marketing shell · /login route exposes the full auth state machine', () => {
  // The /login surface must preserve every signed-out flow that lived
  // on the old /app login screen — login, register, forgot-password,
  // and reset-password. LoginPage calls onSwitch('forgot-password'),
  // so a callback that silently ignores its argument and hard-codes
  // 'register' would break the password-recovery email flow.
  const src = read('src/app/login/page.tsx');
  assert.match(src, /LoginPage/, '/login should render the LoginPage component');
  assert.match(src, /RegisterPage/, '/login should support the register switch');
  assert.match(src, /ForgotPasswordPage/, '/login should support the forgot-password switch');
  assert.match(src, /ResetPasswordPage/, '/login should support the reset-password switch');
  assert.match(src, /AuthProvider/, '/login must wrap auth pages in AuthProvider');
  assert.match(src, /next/, '/login should honor a ?next= query for post-login deep-linking');
  // onSwitch must honor its argument (target page) instead of dropping
  // it on the floor and forcing a single hardcoded transition.
  assert.match(
    src,
    /onSwitch=\{\(target\)\s*=>\s*setMode\(target\)\}/,
    'LoginPage.onSwitch must forward its target argument to setMode',
  );
  // MarketingNavbar CTAs must point at /login, never directly at /app.
  const nav = read('src/components/marketing/MarketingNavbar.tsx');
  assert.match(nav, /href="\/login"/, 'Sign-in CTA should link to /login');
});

test('marketing shell · PWA icon set is rebranded to the Operator mark', () => {
  // Phase 1 contract: every manifest/apple-touch/PWA icon must render
  // the new Operator mark, not the legacy "OS" tile. We assert on each
  // referenced file individually because manifest-only checks would
  // miss stale files on disk that the browser still caches.
  const iconFiles = [
    'public/icons/icon-48x48.svg',
    'public/icons/icon-72x72.svg',
    'public/icons/icon-96x96.svg',
    'public/icons/icon-144x144.svg',
    'public/icons/icon-192x192.svg',
    'public/icons/icon-512x512.svg',
    'public/favicon.svg',
  ];
  for (const f of iconFiles) {
    const src = read(f);
    // Brand mark uses the new bg + accent palette; legacy used #0d1117
    // + #58a6ff and embedded the text "OS"/"OperatorOS".
    assert.match(src, /#080B12/i, `${f} should use the new brand background`);
    assert.match(src, /#00E5FF/i, `${f} should use the new cyan accent`);
    assert.doesNotMatch(src, />OS</, `${f} must not embed the legacy "OS" wordmark`);
    assert.doesNotMatch(src, /#58a6ff/i, `${f} must not use the legacy GitHub blue accent`);
  }
});

test('marketing shell · new brand/marketing components consume centralized tokens', () => {
  // Single-source token contract: new Phase 1 components must pull
  // colors/shadows/gradients from `brand` (or its CSS variables), not
  // hand-code hex/rgba literals. This catches drift before Phase 2/3
  // adds more components on the same foundation.
  //
  // The brand.ts module itself is the source of truth and is allowed
  // to contain literals.
  const files = [
    'src/components/marketing/MarketingNavbar.tsx',
    'src/components/marketing/MarketingFooter.tsx',
    'src/components/marketing/MarketingPlaceholder.tsx',
    'src/components/marketing/MarketingLayout.tsx',
    'src/components/brand/OperatorMark.tsx',
    'src/components/brand/OperatorLogo.tsx',
    'src/components/brand/OperatorLoader.tsx',
    'src/components/brand/OperatorBadge.tsx',
  ];
  // Permit only #RGB(A)/#RRGGBB(AA) hex *outside* of var(--…, fallback)
  // contexts and outside of CSS custom-property assignments. Brand
  // components MAY include hex inside `var(--brand-*, #hex)` fallbacks
  // (defense-in-depth when CSS vars haven't loaded) or as named
  // arguments that the component passes back to tokens.
  const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
  const RGBA_RE = /\brgba?\([^)]+\)/g;
  for (const f of files) {
    const src = read(f);
    // Strip permitted contexts before scanning.
    const stripped = src
      // var(--brand-…, #hex) and var(--brand-…, rgba(...)) fallbacks
      .replace(/var\(--brand-[^)]*\)/g, 'VAR')
      // single-line component-doc comments often quote brand hex codes
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const hexMatches = stripped.match(HEX_RE) ?? [];
    const rgbaMatches = stripped.match(RGBA_RE) ?? [];
    assert.equal(
      hexMatches.length,
      0,
      `${f} should not contain bare hex literals (found: ${hexMatches.join(', ')}). Use brand tokens or var(--brand-*) fallbacks.`,
    );
    assert.equal(
      rgbaMatches.length,
      0,
      `${f} should not contain bare rgba() literals (found: ${rgbaMatches.join(', ')}). Use brand tokens or var(--brand-*) fallbacks.`,
    );
  }
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

// ---------------------------------------------------------------------------
// Phase 2 — homepage section assembly.
// ---------------------------------------------------------------------------

test('marketing phase 2 · homepage composes the six required sections in order', () => {
  const src = read('src/app/page.tsx');
  for (const marker of ['Hero', 'CommandOrbit', 'PlatformPositioning',
                        'ModuleGatewayGrid', 'HowItWorks', 'FinalCta']) {
    assert.match(src, new RegExp(`<${marker}\\b`), `home should render <${marker}>`);
  }
  // Section order must match the spec: Hero → Orbit → Positioning →
  // Gateway Grid → How It Works → Final CTA. Asserting positional
  // index keeps Phase 3 from accidentally reshuffling them.
  const order = ['Hero', 'CommandOrbit', 'PlatformPositioning',
                 'ModuleGatewayGrid', 'HowItWorks', 'FinalCta'];
  const positions = order.map(name => src.indexOf(`<${name}`));
  for (let i = 1; i < positions.length; i++) {
    assert.ok(
      positions[i] > positions[i - 1] && positions[i - 1] >= 0,
      `expected ${order[i]} after ${order[i - 1]} in src/app/page.tsx`,
    );
  }
});

test('marketing phase 2 · section components exist with required test-ids', () => {
  const expectations: Array<[string, RegExp]> = [
    ['src/components/marketing/sections/Hero.tsx',                /data-testid="marketing-hero"/],
    ['src/components/marketing/sections/Hero.tsx',                /Command Every Moving Part/],
    ['src/components/marketing/sections/Hero.tsx',                /Launch OperatorOS/],
    ['src/components/marketing/sections/Hero.tsx',                /Explore Modules/],
    ['src/components/marketing/sections/CommandOrbit.tsx',        /data-testid="marketing-orbit"/],
    ['src/components/marketing/sections/CommandOrbit.tsx',        /prefers-reduced-motion/],
    ['src/components/marketing/sections/PlatformPositioning.tsx', /data-testid="marketing-positioning"/],
    ['src/components/marketing/sections/PlatformPositioning.tsx', /Business Operations/],
    ['src/components/marketing/sections/PlatformPositioning.tsx', /IT & MSP Operations/],
    ['src/components/marketing/sections/PlatformPositioning.tsx', /Automotive & Diagnostics/],
    ['src/components/marketing/sections/PlatformPositioning.tsx', /Healthcare Workflow Coordination/],
    ['src/components/marketing/sections/PlatformPositioning.tsx', /Branding & Launch Systems/],
    ['src/components/marketing/sections/PlatformPositioning.tsx', /AI Automation/],
    ['src/components/marketing/sections/ModuleGatewayGrid.tsx',   /module-gateway-card-/],
    ['src/components/marketing/sections/ModuleGatewayGrid.tsx',   /module-gateway-status-/],
    ['src/components/marketing/sections/ModuleGatewayGrid.tsx',   /module-gateway-cta-/],
    ['src/components/marketing/sections/HowItWorks.tsx',          /how-it-works-step-\$\{i \+ 1\}/],
    ['src/components/marketing/sections/HowItWorks.tsx',          /STEPS:\s*Step\[\]\s*=\s*\[[\s\S]{200,}\]/],
    ['src/components/marketing/sections/FinalCta.tsx',            /Stop juggling tools/],
    ['src/components/marketing/sections/FinalCta.tsx',            /Enter the Command Layer/],
  ];
  for (const [rel, re] of expectations) {
    const src = read(rel);
    assert.match(src, re, `${rel} should match ${re}`);
  }
});

test('marketing phase 2 · /modules and /how-it-works reuse the shared sections', () => {
  const modules = read('src/app/modules/page.tsx');
  assert.match(modules, /ModuleGatewayGrid/, '/modules must render the shared module grid');
  assert.match(modules, /MarketingLayout/, '/modules must stay inside the marketing shell');

  const how = read('src/app/how-it-works/page.tsx');
  assert.match(how, /HowItWorks/, '/how-it-works must render the shared step flow');
  assert.match(how, /MarketingLayout/, '/how-it-works must stay inside the marketing shell');
});

test('marketing phase 2 · catalog mirror covers all 11 modules with outcome copy', async () => {
  const src = read('src/lib/marketing-catalog.ts');
  // Every slug from the SDK catalog must be present in the marketing
  // outcome map so visitors never see an empty card body.
  const slugs = [
    'tradeflowkit', 'torqueshed', 'techdeck', 'pulsedesk', 'faultlinelab',
    'brandforgeos', 'snapproofos', 'studyforge-ai', 'ninja-launch-kit',
    'callcommand-ai', 'ninjamation',
  ];
  for (const slug of slugs) {
    assert.match(src, new RegExp(`'${slug}'\\s*:`), `marketing-catalog missing outcome for ${slug}`);
  }
  // Status mapping must produce the four marketing labels used by
  // statusBadgeColor.
  for (const status of ['Available', 'Coming Soon', 'Beta', 'Locked']) {
    assert.match(src, new RegExp(`'${status}'`), `marketing-catalog missing status: ${status}`);
  }
});

test('marketing phase 2 · auth-aware CTA helper centralizes the targeting rule', () => {
  const src = read('src/lib/marketing-cta.ts');
  // Signed-in → /app, signed-out → /login, locked/coming-soon → /pricing.
  assert.match(src, /primaryCtaTarget/);
  assert.match(src, /moduleCtaTarget/);
  assert.match(src, /'\/app'/);
  assert.match(src, /'\/login'/);
  assert.match(src, /'\/pricing'/);
});

test('marketing phase 2 · no buzzwords in homepage copy', () => {
  // Brief explicitly bans "revolutionary", "game-changing", "next-gen".
  const files = [
    'src/components/marketing/sections/Hero.tsx',
    'src/components/marketing/sections/CommandOrbit.tsx',
    'src/components/marketing/sections/PlatformPositioning.tsx',
    'src/components/marketing/sections/ModuleGatewayGrid.tsx',
    'src/components/marketing/sections/HowItWorks.tsx',
    'src/components/marketing/sections/FinalCta.tsx',
    'src/components/marketing/sections/PricingTeaser.tsx',
    'src/components/marketing/sections/TrustSection.tsx',
    'src/components/marketing/sections/PricingSection.tsx',
    'src/lib/marketing-pricing.ts',
  ];
  const banned = /\b(revolutionary|game[- ]changing|next[- ]gen)\b/i;
  for (const rel of files) {
    const src = read(rel);
    assert.doesNotMatch(src, banned, `${rel} contains a banned buzzword`);
  }
});

test('marketing phase 3 · homepage composes pricing teaser and trust section in order', () => {
  const src = read('src/app/page.tsx');
  const order = [
    'Hero', 'CommandOrbit', 'PlatformPositioning', 'ModuleGatewayGrid',
    'HowItWorks', 'PricingTeaser', 'TrustSection', 'FinalCta',
  ];
  const positions = order.map(name => src.indexOf(`<${name}`));
  for (let i = 1; i < positions.length; i++) {
    assert.ok(
      positions[i] > positions[i - 1] && positions[i - 1] >= 0,
      `expected <${order[i]}> after <${order[i - 1]}> in src/app/page.tsx`,
    );
  }
});

test('marketing phase 3 · /pricing renders the pricing + trust sections inside the marketing shell', () => {
  const src = read('src/app/pricing/page.tsx');
  assert.match(src, /MarketingLayout/, '/pricing must stay inside the marketing shell');
  assert.match(src, /PricingSection/, '/pricing must render the shared PricingSection');
  assert.match(src, /TrustSection/,   '/pricing should surface the trust section alongside tiers');
});

test('marketing phase 3 · pricing teaser links to /pricing with the required CTA test-id', () => {
  const src = read('src/components/marketing/sections/PricingTeaser.tsx');
  assert.match(src, /data-testid="marketing-pricing-teaser"/);
  assert.match(src, /data-testid="pricing-teaser-cta"/);
  assert.match(src, /href="\/pricing"/);
});

test('marketing phase 3 · trust section avoids unsupported compliance claims', () => {
  const src = read('src/components/marketing/sections/TrustSection.tsx');
  // Strip comments so the JSDoc that *explains* why these claims are
  // banned isn't itself flagged as a banned claim.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  // No SOC 2 / HIPAA / ISO 27001 / PCI / FedRAMP badges — brief forbids
  // claims tied to certifications we have not actually completed.
  const banned = /\b(SOC\s*2|HIPAA|ISO\s*27001|PCI[- ]DSS|FedRAMP)\b/i;
  assert.doesNotMatch(stripped, banned, 'TrustSection must not assert unsupported compliance certifications');
  // Required positioning bullets from the brief.
  assert.match(src, /[Rr]ole-based access/);
  assert.match(src, /[Tt]enant-aware/);
  assert.match(src, /[Aa]udit/);
});

test('marketing phase 3 · billing CTA helper centralizes the auth-aware routing rule', () => {
  const src = read('src/lib/marketing-cta.ts');
  assert.match(src, /billingCtaTarget/, 'should export billingCtaTarget helper');
  // Signed-in billing CTA must point at a reachable console route.
  // `/app/billing` is NOT a Next route in this repo — Billing lives
  // inside the console shell behind `activePage='billing'` — so the
  // helper resolves to `/app` and lets the in-app sidebar take over.
  assert.match(
    src,
    /signedIn[\s\S]*\?\s*\{\s*href:\s*'\/app'\s*,\s*label:\s*'Manage billing'/,
    'signed-in billing CTA must resolve to /app with "Manage billing" copy',
  );
});
