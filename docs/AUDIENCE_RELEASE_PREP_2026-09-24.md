# Audience entry and marketing release preparation — 2026-09-24

Status: **SOURCE/LOCAL VERIFIED; NEW PUBLICATION AND FULL CANDIDATE CI OPEN**.
The previous v63 publication remains the deployed baseline. This pass changes
public acquisition pages, plan selection, link navigation, marketing artwork,
and their regression coverage. It does not close all module/provider acceptance.

## Customer experience

The homepage starts with three equal choices instead of the full application
catalog. The catalog and ecosystem remain available through their existing routes.

| Audience | Public information page | Plan selection |
| --- | --- | --- |
| Trade Companies | `/for/trades` | TradeFlowKit |
| MSPs | `/for/msps` | TechDeck |
| Healthcare / Legal | `/for/healthcare-legal` | PulseDesk |

Each page explains the owner outcome, a four-step workday, relevant companions,
connection limits, FAQs, and the next action. PulseDesk retains its healthcare
operations identity. The legal-office fit covers internal requests, equipment,
supplies, facilities, and vendors; it does not claim legal case management,
court deadlines, trust accounting, patient records, or compliance certification.

Shared customer guidance describes the current linked Directory identity in
TradeFlowKit, BrandForge OS, and SnapProofOS. It preserves organization/application
access, explicit customer selection, legacy-link review, and historical snapshots.

The pricing route accepts only the three catalog product keys. Unknown or repeated
query values fall back to TradeFlowKit. The choice survives the sign-in return
path. Query parameters do not set price, roles, entitlements, or billing authority.

Public authentication links use full document navigation, preventing Next's
background prefetch from initiating a cross-host SSO transaction. The authentication
protocol and security headers remain unchanged. The shared footer now uses readable
text contrast. Phone, tablet, and desktop layouts keep all links and content usable.

## Marketing delivery

`output/marketing/choose-your-lane-2026-09-24/` contains 12 PNGs, three original
ImageGen photographs, the exact generation prompts, 12 Facebook/LinkedIn/X captions,
CSV publishing copy, a manifest, and usage notes. The graphics include overview,
TradeFlowKit, TechDeck, and PulseDesk themes in 1080×1080, 1080×1350, and 1200×630.
The existing OperatorOS mark is unchanged. The people are illustrative, not actual
customers or testimonials. No post, paid campaign, or vendor connection was created.

The website uses three optimized WebP photographs totaling 215,060 bytes and four
landscape social images. Each audience page has its own canonical URL, social
preview, and FAQ structured data. The sitemap includes the three public paths.
The campaign links must not be promoted until these pages are deployed.

## Fresh verification

Environment: Windows, Node 24.16.0, pnpm 10.34.5, Next 15.5.25; loopback-only
disposable PostgreSQL 16 container `operatoros-audience-test-20260924`, database
`operatoros_audience_test`. No persistent development or production database was
used. Test credentials are disposable fixtures, and live providers are unconfigured.

- `CI=true corepack pnpm install --frozen-lockfile`: completed without lock changes.
- `INTERNAL_API_URL=http://localhost:5001 corepack pnpm build:production`: passed
  deployment-scope validation, four catalog tests, all four workspace typechecks,
  and API/runner/web builds. Next generated 38 static pages including three audience
  pages. A final `corepack pnpm --dir apps/web build` passed after the final social
  exports were copied into the website.
- With `OPERATOROS_DATABASE_RELEASE_MODE=apply` only in the disposable process:
  `node --conditions=production apps/api/dist/apps/api/src/scripts/database-release.js
  --apply`: clean v63 apply, 23,278 ms. No schema code changed. The serving process
  then removed apply authority.
- `node scripts/start-unified-runtime.mjs`: compiled database verification and
  private API/Next readiness completed before the public loopback gateway opened.
- `corepack pnpm preflight:production -- --core`: passed against the synthetic local
  production environment; this does not validate live vendor credentials.
- `corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1
  test/marketing-shell.test.ts test/marketing-pricing-shape.test.ts
  test/public-seo.test.ts test/commerce-forward-model-static.test.ts
  test/module-product-value-contract.test.ts`: **61 passed, 0 failed, 0 skipped,
  0 todo** (2,308.6997 ms), with the compiled web server available.
- `node --test scripts/operatoros-brand-assets.test.mjs`: **4 passed, 0 failed,
  0 skipped**; original logo/mark checksums remain intact.
- `corepack pnpm test:route-integrity`: **0 failures**, 223 active target files,
  1,304 route capabilities, 974 crawl routes.
- Local exact-host HTTPS proxy plus `corepack pnpm --dir apps/web exec playwright
  test e2e/audience-lanes.spec.ts e2e/operatoros-branding.spec.ts
  e2e/ecosystem-identity-hierarchy.spec.ts --retries=0 --reporter=line`:
  **12 passed, 0 failed, 0 skipped**, covering lane-to-plan-to-sign-in, invalid/repeated
  selections, social/canonical metadata, sitemap, unknown-route 404, catalog retention,
  footer, 1440/768/390-pixel reflow, and accessibility. APIRequestContext asset probes
  explicitly use loopback because Chromium hostname mapping does not apply to them.
- Codex in-app browser: manual desktop/phone review of the homepage and audience
  page, including image loading, hierarchy, text, links, and crop.
- Export verification: **12/12** PNG signatures/dimensions/file sizes match the
  manifest; **4/4** website social images match their campaign exports byte-for-byte.

Initial regression runs exposed the footer contrast problem, authentication
prefetch errors, and stale tests that still required the old homepage assembly.
Those were corrected without suppressing assertions or lowering accessibility
thresholds. The six initially skipped HTTP-only source checks were rerun with the
compiled server available and all passed. The new five-test audience browser file
is included in the release runner; the existing module gates remain required.
No lint or formatting pass is claimed.

## Full release work still open

1. Full clean-candidate CI on the production Node 20 environment, source review,
   and Replit publication of this change, followed by deployed page/SSO acceptance.
2. Microsoft 365 and Google email/calendar connections; QuickBooks Online sync;
   Facebook, LinkedIn, and X publishing. These require executable adapters plus
   provider registration, tenant authorization, and real acceptance, not saved
   configuration alone. CallCommand's live call acceptance remains separate.
3. Production shared-customer create/edit/link journeys and account-security
   acceptance across roles; confirmation of the outstanding credential recovery
   action from the v63 handoff.
4. Durable scheduled encrypted backups and a documented restore rehearsal.
5. The remaining saved onboarding, shared attention, organization MFA/workplace
   login, and spend-control work in `PLANS.md`. OutCall remains unavailable.

## Deployment and rollback

No new database release, environment variable, OAuth permission, billing price,
entitlement, or provider secret is required for the audience pages. Publish through
the existing reviewed build and readiness-gated supervisor. Verify the exact new
commit/build identity, the three new paths, selection-preserving pricing/sign-in,
metadata images, mobile navigation, and the existing module launcher afterward.
Application rollback restores the prior build; the database stays at v63. Marketing
links should remain unpublished until target routes are accepted on the live host.
