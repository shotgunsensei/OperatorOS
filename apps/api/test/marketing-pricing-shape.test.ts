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

test('marketing pricing · every tier ships a footnote so card heights stay balanced', () => {
  // Architect feedback: `footnote` is declared optional in the type
  // but the visual grid balances better when every tier provides one.
  // This test pins the contract: all four tiers must carry a footnote.
  const src = read(CONFIG_REL);
  const footnotes = [...src.matchAll(/footnote:\s*'/g)];
  assert.ok(
    footnotes.length >= 4,
    `every tier must declare a footnote (found ${footnotes.length})`,
  );
});

test('marketing pricing · no tier self-loops to /pricing (would dead-end signed-in viewers)', () => {
  const src = read(CONFIG_REL);
  const hrefs = [...src.matchAll(/ctaHref:\s*'([^']+)'/g)].map((m) => m[1]);
  for (const h of hrefs) {
    assert.notEqual(
      h, '/pricing',
      'tier ctaHref must not point back at /pricing — that dead-ends signed-in viewers on the page they are already viewing',
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

test('marketing pricing · resolvePricingCta routes every tier correctly for signed-out and signed-in viewers', async () => {
  // Behavioral test: import the pure helper + tier config and exercise
  // every tier's CTA for both auth states. This is the lock that
  // prevents a future edit from silently dead-ending signed-in users
  // back at /login or /pricing.
  const mod = await import(
    new URL('../../web/src/lib/marketing-pricing.ts', import.meta.url).href
  );
  const { marketingPricingTiers, resolvePricingCta } = mod as typeof import('../../web/src/lib/marketing-pricing.ts');

  assert.equal(marketingPricingTiers.length, 4, 'expected 4 tiers');

  for (const tier of marketingPricingTiers) {
    const out = resolvePricingCta(tier, false);
    const inn = resolvePricingCta(tier, true);

    // Signed-out viewers should never be dropped onto an authenticated
    // route — they always get bounced through /login first.
    assert.ok(
      !out.href.startsWith('/app'),
      `tier ${tier.slug}: signed-out viewer landed on authenticated route "${out.href}"`,
    );

    // Signed-in viewers must never be sent back to /login or to a
    // self-loop on /pricing — both are dead ends for an authenticated
    // user clicking a pricing CTA.
    assert.notEqual(
      inn.href, '/login',
      `tier ${tier.slug}: signed-in viewer was sent back to /login`,
    );
    assert.notEqual(
      inn.href, '/pricing',
      `tier ${tier.slug}: signed-in viewer dead-ended at /pricing`,
    );

    // Every resolution must produce a non-empty label.
    assert.ok(out.label.length > 0, `tier ${tier.slug}: empty signed-out label`);
    assert.ok(inn.label.length > 0, `tier ${tier.slug}: empty signed-in label`);
  }

  // Spot-check the two console-routing branches explicitly so the
  // helper's contract is pinned regardless of tier copy edits.
  const billingTier = { ctaHref: '/app/billing' as const, ctaLabel: 'See plans' };
  assert.deepEqual(
    resolvePricingCta(billingTier, false),
    { href: '/login', label: 'See plans' },
  );
  assert.deepEqual(
    resolvePricingCta(billingTier, true),
    { href: '/app/billing', label: 'Manage billing' },
  );

  const consoleTier = { ctaHref: '/app' as const, ctaLabel: 'Start free' };
  assert.deepEqual(
    resolvePricingCta(consoleTier, false),
    { href: '/login', label: 'Start free' },
  );
  assert.deepEqual(
    resolvePricingCta(consoleTier, true),
    { href: '/app', label: 'Launch OperatorOS' },
  );
});

test('marketing pricing · resolvePricingCta is the single source of truth for pricing CTA routing', () => {
  // The pricing helper must compose the Phase 2 marketing-cta helpers
  // (primaryCtaTarget / billingCtaTarget) rather than reinvent the
  // auth-aware contract. Static check: marketing-pricing.ts imports
  // both helpers from marketing-cta.
  const cfg = read(CONFIG_REL);
  assert.match(cfg, /from\s+['"]\.\/marketing-cta['"]/, 'marketing-pricing must import from ./marketing-cta');
  assert.match(cfg, /primaryCtaTarget/, 'resolvePricingCta should compose primaryCtaTarget');
  assert.match(cfg, /billingCtaTarget/, 'resolvePricingCta should compose billingCtaTarget');

  // And PricingSection consumes the composed helper (not the raw
  // routing helpers) so there is exactly one routing source.
  const section = readFileSync(
    resolve(WEB_ROOT, 'src/components/marketing/sections/PricingSection.tsx'),
    'utf-8',
  );
  assert.match(section, /resolvePricingCta/, 'PricingSection must use resolvePricingCta');
});
