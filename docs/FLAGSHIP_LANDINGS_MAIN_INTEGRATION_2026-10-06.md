# Flagship landing/pricing integration on current main

Status: **LOCAL INTEGRATION VERIFIED / NOT PUSHED OR DEPLOYED**.

Branch: `codex/flagship-landings-current-main` in an isolated task worktree.
Base: **`e62c89356f11d50940134790c8dad7e3eee268ab`**, fetched and verified from
GitHub `main` on 2026-10-06. The final local commit is recorded in the accompanying
evidence manifest. This continuation completes the original Oct 5 public-page
task; it introduces no new module implementation or commercial policy.

## Provenance and reconciliation

The original **`5e4c8c435405436eeef6fe33e27b13692c718a04`** commit and its clean
`codex/flagship-landings-pricing-oct5` worktree remain preserved. The canonical
`C:\Dev\OperatorOS` checkout is preserved on `codex/commercial-publication-evidence`
at **`60c7122104a2cc65dac35cd499fbf67e659845c4`**, including its existing untracked
sales presentation directory. No existing checkout was reset or rewritten.

Read-only GitHub metadata confirms:

| PR | State and exact identity |
| --- | --- |
| #115 | Merged; head `0ea0f792db70936c95f60be41fbf457da3fdbf91`, merge `2cf783c9e7da5f7171ad7097900440d9679a593a` |
| #116 | Merged; documentation head `60c7122104a2cc65dac35cd499fbf67e659845c4`, merge/current main `e62c89356f11d50940134790c8dad7e3eee268ab` |

Candidate `0ea0f792` and merge `2cf783c9` share tree
`c9354c37c91d1bb4e364206668a71018959bec6b`. Changes from candidate to main are
limited to four release documentation files. The current-main publication record
identifies serving source `0ea0f792` and prior exact-head hosted acceptance; those
are inherited historical release records, not verification of this new candidate.
No new live serving, provider or payment acceptance is claimed here.

The original commit was applied without committing first. All **28 source/test/
configuration files outside `docs/`** match its Git blobs exactly. Source code
had no conflicts. Only `IMPLEMENTATION_STATUS.md` and `MODULE_PARITY_INDEX.md`
conflicted at their opening overlays; resolution retains all current-main
publication history and adds this local integration record. The original pricing
report now explicitly labels its failed old dependency baseline as historical.

Global/repository AGENTS, relevant Codex memories, `.agents/memory`, SSO,
ecosystem, implementation, parity, E2E/readiness, backup and plan documents were
reviewed. The current checkout still has no `.agents/skills` directory. Existing
API, catalog, billing, exact-host SSO, tenant, RBAC and entitlement authority stay
intact; the optional AbortSignal on the public catalog client is the only auth
client change, exactly as in the original candidate.

## Customer behavior and pricing

The existing canonical routes are retained:

- `/for/trades`: TradeFlowKit, with a concrete customer → quote → job → invoice
  workday and current integration limits.
- `/for/msps`: TechDeck, with client/system, ticket, time, evidence, structured
  closeout and reviewed knowledge workflows; no endpoint/discovery/script execution
  or enabled semantic-search claim.
- `/for/healthcare-legal`: PulseDesk, limited to general office operations, equipment,
  facilities, supplies, ownership and closeout. No PHI, clinical chart or legal-case
  management/compliance certification claim.

Prices come from `GET /v1/billing/catalog` (browser proxy `/api/billing/catalog`)
and current `packages/sdk/src/products.ts`: TradeFlowKit **$149/month**, TechDeck
**$99/month**, PulseDesk **$149/month**, extra eligible companion **$29/month**,
extra seat **$15/month**, five included seats and one included eligible companion.
No catalog constants, Stripe products/prices, terms, credentials or settings change.

The preserved original anonymous browser evidence demonstrated the rendering cause:
the old client-only null catalog displayed 16 “Price unavailable” labels while a
held catalog GET was pending, then recovered to $149/month. This is historical
diagnostic evidence, not a newly reproduced live outage. Current main left that
pricing component unchanged. Integration restores validated server catalog data,
bounded client fallback, distinct loading/error states and retry without an old-price
fallback. Invalid/outage/provider-unconfigured states retain billing restrictions.

Module/companion/seat preferences and bounded public UTM labels survive pricing,
header/footer/mobile auth links, reload, back/forward and fixed relative return
navigation. They grant no identity, tenancy, role, entitlement or billing authority.
No tracking collector, testimonial, fabricated metric or trial promise is added.

## Dependency baseline and unchanged security policy

PR #115 updates the dependency baseline, including Fastify 5.12.5, axios 1.20.0,
proxy-addr 2.0.8, sharp 0.35.5 and other locked overrides. Existing installed-package
regressions cover proxy subnet trust, shell quoting, selectors and source maps.

The merged node-forge 1.4.0 patch checks nested DigestAlgorithm element bounds;
its regression accepts a valid RSA signature and rejects a malformed additional
element. The braces 3.0.3 patch bounds both brace and parentheses nesting at 128;
its regression rejects 4,000-depth input and preserves ordinary expansion. Existing
image-size ICNS/JXL patches and regressions remain intact. Frozen pnpm installation
applies the lockfile's existing patch hashes; tests resolve the actual installed
transitive packages, not a copied source fixture or imported security log.

The fresh unchanged scanner reports:

- **PASS**, zero source secret/SAST findings, deployment scope PASS.
- **4 disclosed high advisories**, zero critical, **0 unresolved advisory IDs**.
- Complete audit response, command exit 0, exception integrity true.
- Existing exclusions: `GHSA-5p2g-fcmc-qvqq`, `GHSA-w3rx-r6r6-pgpr`,
  `GHSA-86w9-cpqp-85rv`, `GHSA-vfj7-8cjw-p6xm`.

Thus the updated baseline resolves the original candidate's failing security gate
**under the merged, patch-backed policy**. This is not a zero-vulnerability or
no-exception claim. This integration changes no lockfile, workspace audit policy,
package manifest, patch, scanner, SDK catalog or API source. No new exception or
duplicated dependency remediation is introduced.

## Fresh local verification

Windows PowerShell, Node 24.16.0, pinned pnpm 10.34.5. Frozen install uses the task's
existing local pnpm store; no `.env` or credentials are copied. An ignored local
shim resolves nested pnpm invocations. Root lint is defined by the current
package.json despite the older AGENTS command paragraph.

| Check | Result |
| --- | --- |
| `corepack pnpm install --frozen-lockfile --store-dir ../.pnpm-store` | PASS, lock unchanged |
| `corepack pnpm build:production` with loopback catalog API | PASS, contracts, all four typechecks, SDK/API/runner/web artifacts |
| `corepack pnpm lint` | PASS, zero warnings |
| Six affected pricing/landing/SSO-routing/marketing/SEO test files | **53/53 PASS**, zero failures/skips, including real local HTTP checks |
| Existing ecosystem mocked-provider and forward-commerce static tests | **15/15 PASS**, zero failures/skips; no Stripe or DB access |
| Existing launch/image-size/scanner/deployment-scope regression files | **18/18 PASS**, zero failures/skips |
| `node scripts/phase39/security-scan.mjs` | **PASS**, with the four disclosed high advisory exceptions above |
| Affected compiled local Chromium suite | **18/18 PASS**, zero retries, including all three landings at desktop/mobile, prices, accessible reflow, metadata, real 404, auth handoffs, back/forward/reload, error/loading/retry and UI billing restrictions |

Focused test commands, from root; marketing HTTP checks set
`WEB_BASE_URL=http://127.0.0.1:5100`:

```text
node node_modules/tsx/dist/cli.mjs --test apps/api/test/pricing-selection.test.ts apps/api/test/public-pricing-catalog.test.ts apps/api/test/public-landing-routing.test.ts apps/api/test/middleware-login-routing.test.ts apps/api/test/marketing-shell.test.ts apps/api/test/public-seo.test.ts
node node_modules/tsx/dist/cli.mjs --test apps/api/test/ecosystem-stripe-audit.test.ts apps/api/test/forward-commerce-contract-static.test.ts
node --test scripts/phase39/launch-dependency-regression.test.mjs scripts/phase39/image-size-regression.test.mjs scripts/phase39/security-scan.test.mjs scripts/phase39/deployment-scope.test.mjs
```

Browser recipe: source-derived loopback catalog fixture at 5101 (provider flags
false, no DB/checkout/enrollment), compiled Next at 5100 with that internal API,
then from `apps/web`:

```text
node node_modules/@playwright/test/cli.js test --config playwright.landing.config.ts
```

The full application database/API/integration suites, unified production supervisor,
production-host authenticated SSO/tenant/billing acceptance, full visual golden
suite, hosted CI and real Stripe acceptance were not run in this public-page
continuation. No disposable DB or real provider credentials were configured.
No-JavaScript checks inspect initial pricing data; the shared Next loading stream
requires JavaScript to reveal the page. Full visible no-JS support is not claimed.

Evidence logs in this isolated worktree: `integration-install.log`,
`integration-build.log`, `integration-lint.log`, `integration-focused-tests.log`,
`integration-commerce-tests.log`, `integration-security-regressions.log`,
`integration-security.log`, `integration-browser.log`, plus
`build/phase39/security-scan.json`. Refreshed full-page screenshots under
`output/playwright/flagship-landings` show the three modules at 1440/390 pixels and
pricing loaded/loading/failure/malformed states. The affected browser suite
finished in 54.8 seconds. These checks exercised the pending source tree that
became the local commit; they are not an exact-head hosted release run or unified
supervisor acceptance. An ignored final evidence manifest records commit/tree,
32 changed files, baseline policy hashes and artifact checksums.

## Release boundary

This is a new local candidate; previous main/candidate hosted runs do not cover
its new landing/pricing changes. Included GitHub Actions minutes are exhausted,
and additional cost protection remains unverified. **Do not push, open a
CI-triggering PR, merge or publish during this continuation.** No new spending,
hosted run, credential/setting change, customer outreach, live enrollment,
database mutation or payment action occurred.

Before release: establish approved cost protection and separately authorize the
next release step; reconcile PR #111's overlapping selection work; run required
release checks on the exact integrated candidate (including DB/integration,
unified-supervisor/SSO and full browser/visual scopes as required); then verify
serving source/build/lock identity and affected anonymous pages plus approved
authenticated tenant/billing behavior after an authorized publication. Existing
provider/customer settlement gates remain separate. No production migration is
introduced by this change, and rollback is a normal revert of the integration.
