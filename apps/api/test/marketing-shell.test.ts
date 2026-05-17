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
