/**
 * Marketing pricing config — shape lock test (Phase 3, task #87).
 *
 * The /pricing UI is intentionally a static UI shell for Phase 3 and
 * sources its tiers from `apps/web/src/lib/marketing-pricing.ts`. A
 * follow-up task will swap that source for live `/v1/billing/plans`
 * data. To make that swap safe, this test pins the contract by
 * statically parsing the config file and asserting:
 *
 *   - It defines exactly the four required tiers, in order.
 *   - Each tier carries every required field with the right type.
 *   - `ctaHref` only points at the four whitelisted marketing
 *     destinations (no leaks of /v1/billing or external URLs).
 *   - Exactly one tier is marked `isFeatured: true`.
 *   - No raw Stripe price IDs, secret-looking keys, or live dollar
 *     prices appear in the public copy.
 *
 * This is a structural file-shape test (matches the existing
 * marketing-shell.test.ts pattern); it does not import the TS module
 * directly because apps/api can't resolve apps/web aliases.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB_ROOT = resolve(import.meta.dirname, '..', '..', 'web');
const CONFIG_REL = 'src/lib/marketing-pricing.ts';

function read(rel: string): string {
  const p = resolve(WEB_ROOT, rel);
  assert.ok(existsSync(p), `Expected file to exist: ${rel}`);
  return readFileSync(p, 'utf-8');
}

test('marketing pricing · config file exists and exports the array', () => {
  const src = read(CONFIG_REL);
  assert.match(src, /export\s+const\s+marketingPricingTiers/, 'must export marketingPricingTiers');
  assert.match(src, /MarketingPricingTier/, 'must declare MarketingPricingTier interface');
});

test('marketing pricing · all four required tiers are defined in order', () => {
  const src = read(CONFIG_REL);
  const slugMatches = [...src.matchAll(/slug:\s*'([a-z][a-z0-9-]*)'/g)].map((m) => m[1]);
  // First match in the file is the config — interface has no slugs.
  const expected = ['starter', 'pro', 'business-command', 'elite'];
  assert.deepEqual(
    slugMatches.slice(0, expected.length),
    expected,
    `tiers must appear in order: ${expected.join(', ')} (got ${slugMatches.slice(0, expected.length).join(', ')})`,
  );
});

test('marketing pricing · each tier carries every required field', () => {
  const src = read(CONFIG_REL);
  const required = [
    'slug', 'tierName', 'description', 'idealFor', 'priceLabel',
    'includedModules', 'highlightedFeatures', 'ctaLabel', 'ctaHref',
    'isFeatured',
  ];
  for (const field of required) {
    const matches = src.match(new RegExp(`\\b${field}:`, 'g')) ?? [];
    // 4 tiers + 1 interface declaration = at least 5 hits.
    assert.ok(
      matches.length >= 5,
      `field "${field}" should appear in interface + every tier (got ${matches.length})`,
    );
  }
});

test('marketing pricing · ctaHref only targets whitelisted marketing routes', () => {
  const src = read(CONFIG_REL);
  const hrefs = [...src.matchAll(/ctaHref:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 4, 'every tier should set a ctaHref');
  const allowed = new Set(['/login', '/app', '/pricing', '/app/billing']);
  for (const h of hrefs) {
    assert.ok(
      allowed.has(h),
      `ctaHref "${h}" must be one of ${[...allowed].join(', ')} — marketing CTAs may not point at billing API routes or external URLs`,
    );
  }
});

test('marketing pricing · exactly one tier is featured', () => {
  const src = read(CONFIG_REL);
  // Strip line + block comments so a JSDoc mention of "isFeatured: true"
  // doesn't count as a second featured tier.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const featuredTrue = [...stripped.matchAll(/isFeatured:\s*true/g)];
  assert.equal(
    featuredTrue.length, 1,
    'exactly one tier should set isFeatured: true so the UI knows which card to ribbon',
  );
});

test('marketing pricing · no Stripe price IDs or secret-looking keys leak', () => {
  const src = read(CONFIG_REL);
  // Stripe price IDs follow `price_<alnum>` and secret keys start
  // with `sk_`. Either appearing in a public marketing config is a
  // ship-blocker.
  assert.doesNotMatch(src, /\bprice_[A-Za-z0-9]{8,}\b/, 'must not embed Stripe price IDs');
  assert.doesNotMatch(src, /\bsk_(live|test)_[A-Za-z0-9]+/,  'must not embed Stripe secret keys');
});

test('marketing pricing · price labels are public-safe (no exact live prices)', () => {
  const src = read(CONFIG_REL);
  // Brief: marketing config must not hardcode live currency amounts
  // anywhere in the public copy. Public-safe labels only:
  //   "Free during beta", "See plans", "Coming soon", "Starting at <free term>".
  assert.match(src, /Free during beta|See plans|Coming soon/,
    'pricing copy should lean on Free / See plans / Coming soon');
  // Strip comments first so the JSDoc that *describes* the rule
  // isn't itself flagged.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.doesNotMatch(
    stripped,
    /\$\s*\d/,
    'marketing pricing config must not hardcode live dollar amounts ($NN). Use "See plans" / "Coming soon" / "Free during beta" instead.',
  );
});

test('marketing pricing · PricingSection consumes the shared auth-aware CTA helpers', () => {
  // Architect feedback: pricing CTAs must route through the
  // marketing-cta helpers (not reinvent the auth-aware logic inline).
  const src = readFileSync(
    resolve(WEB_ROOT, 'src/components/marketing/sections/PricingSection.tsx'),
    'utf-8',
  );
  assert.match(src, /from\s+['"]@\/lib\/marketing-cta['"]/, 'PricingSection should import from marketing-cta');
  assert.match(src, /billingCtaTarget/, 'PricingSection should consume billingCtaTarget');
  assert.match(src, /primaryCtaTarget/, 'PricingSection should consume primaryCtaTarget');
});
