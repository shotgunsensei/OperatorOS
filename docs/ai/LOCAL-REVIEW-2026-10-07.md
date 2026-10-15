# Local review of bfd9bf0d - 2026-10-07

Reviewed candidate: `bfd9bf0d6438c57c1be1829ca64b9e596edc33c5` on
`codex/openai-responses-budget-oct7`. This report accompanies the local review-fix
commit. The original implementation and this review remain unpushed. No hosted CI,
publication, account setting, credential, production data or paid API was changed.

## Findings and changes

1. The request ledger retained measured usage, but shared activity/usage metadata
   lost input/output/cache counts: the existing secret sanitizer removes keys
   containing `token`. Fixed by naming safe numeric telemetry `input`, `output`,
   `cachedInput`, `cacheWrite`, with `unit: tokens`. The ledger retains its original
   measured usage fields. The sanitizer and security policy are unchanged.
2. A same-key replay of a settled, measured failure incorrectly said it was pending
   reconciliation. It now returns `AI_REQUEST_FAILED` (502). Reserved/unknown rows
   still return `AI_REQUEST_PENDING` (409), keep full holds and never redispatch.
   No automatic provider retry was added. The activity summary now says guidance
   was generated *for review*, without implying a person already reviewed it.
3. Guidance errors dropped the server request reference in the console. A bounded
   reference is now visible for support, and generation has visible busy text and
   `aria-busy`. Unvalidated output stays hidden. Completed answers remain structured,
   documentation-only and bound to the tenant view.
4. Two inherited TechDeck static assertions failed after the original extraction:
   one looked for response guarantees inside the route rather than the service;
   the other expected documentation-only diagnostic copy that had been removed.
   Updated the assertion to follow the invoked service and assert no process-spawn
   execution; restored the documentation-only copy. Existing access, public-path,
   export and safety assertions remain in place. No failure was skipped.

## Legacy AI compatibility

A new deterministic transport contract proves that new budgeted Responses
configuration does not change legacy `getAiProvider()` or shared adapter selection.
Legacy requests still use Chat Completions, existing model/temperature/max-token
and JSON-object fields, and the existing response/provider/version/tokenCount
shape. The optional measured usage field is not required by legacy callers.
Missing legacy keys remain disabled; ordinary test mode remains deterministic.
Existing configuration rotation and the full selected Torque Assist credit,
retry/refund/reconciliation workflow pass without using the new dollar ledger.
TechDeck literal persistence/export/public-path workflows also pass.

The TechDeck guidance route intentionally requires an idempotency key and explicit
new budget approval; existing raw callers must supply that key. Its old text
`response`, `tokenCount` and documentation-only flags remain alongside structured
`guidance`. This is an intentional fail-closed boundary for this flow, not a global
provider change. Legacy agents, script generation and voice remain outside this cap.

## Retry and usage evidence

The integration tests verify full input/output/cache counts survive shared metadata
sanitization, with exactly one usage event for a completed request and its replay.
A same-key retry while dispatch is in progress returns pending without another
reservation or call; it later replays the completed result. A same-key failed
retry adds neither a charge nor usage event. A caller's explicit new attempt with
a new key preserves the failed attempt's cost and charges the new one separately:
the synthetic example totals 5,580 micro-USD across two 2,790 micro-USD attempts,
and successful replay leaves that total unchanged. These are synthetic rates.
Unknown usage/timeout tests still retain 52,000 micro-USD holds across rollover;
no provider retry occurs. The approved budget serializes concurrent calls and
accounts observed overruns before disabling the policy.

## Populated v65-to-v66 upgrade

`shared-ai-budget-upgrade.mts` runs against its own fresh disposable database.
The actual v65 source is exported from immutable `5b50b2c`, not simulated by
deleting v66 tables. The old supported release CLI applies v65, then the test
creates two synthetic users, tenants, memberships, TechDeck entitlements,
subscriptions, tickets and legacy usage events. Existing v65 free-account
backfill is allowed to converge by running the real v65 CLI again before the
baseline is captured. At that point the new AI tables do not exist.

The current supported release applies all 66 steps and verifies the schema.
Complete JSON row snapshots of users, tenants, memberships, module entitlements,
subscriptions, tickets and usage events compare exactly, including identifiers
and timestamps. Reapply/verify v66 passes and the snapshots remain identical.
Both new AI tables are empty after upgrade. A test-only policy insert proves
disabled/zero defaults, an invalid budget update is rejected, and all new
constraints are validated. No existing billing or work row is replaced.

Reproduce the immutable fixture from the isolated worktree:

```powershell
New-Item -ItemType Directory -Force build/ai-review/v65-source
git -c gc.auto=0 -c maintenance.auto=false archive --format=tar --output=build/ai-review/v65-source.tar 5b50b2cadd815ba1c6de1af79deb04e8971af0b4 -- apps/api packages scripts package.json config
tar -xf build/ai-review/v65-source.tar -C build/ai-review/v65-source
# Reuse the existing installed node_modules with ignored root/API junctions.
# Use a NEW marked loopback database; the test refuses an already-populated DB.
$env:APP_ENV='test'; $env:NODE_ENV='test'
$env:DATABASE_URL='postgresql://postgres:synthetic_local_review_only@127.0.0.1:55440/operatoros_ai_upgrade_test'
$env:PARITY_DATABASE_IS_DISPOSABLE='1'
corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/shared-ai-budget-upgrade.mts
```

## Final verification

The review gate below passes **43/43**, zero fail/cancel/skip/todo. Its actual
Chromium console checks cover desktop/mobile answers and replay, disabled
configuration recovery, in-flight tenant switch/busy state, invalid-output error,
unknown-usage error, support references and non-billing same-key retries.
The browser harness supplies surrounding auth/workspace fixtures and calls real
Fastify/PostgreSQL routes; it does not prove deployed SSO or customer acceptance.

```powershell
$env:APP_ENV='test'; $env:NODE_ENV='test'
$env:SESSION_SECRET='synthetic-review-session-secret-at-least-32-bytes'
$env:DATABASE_URL='postgresql://postgres:synthetic_local_review_only@127.0.0.1:55440/operatoros_ai_review_test'
$env:PARITY_DATABASE_IS_DISPOSABLE='1'
corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/ai-provider-legacy-compatibility.test.ts test/ai-provider-configuration.test.ts test/openai-responses-budget.test.ts test/database-release-contract.test.ts test/techdeck-ai-budget.integration.test.ts test/techdeck-ai-guidance.browser.mts test/torque-assist-domain.test.ts test/torque-assist-static.test.ts test/torque-assist-workflow.test.ts test/techdeck-literal-static.test.ts test/techdeck-literal-product.test.ts
```

Additional checks pass: populated upgrade **1/1**; provider-isolation/preflight
**13/13**; offline environment and installed security regressions **13/13**;
production build with four workspace typechecks and four Faultline catalog tests;
existing root lint command exits 0. Security scan: 4,642 files, zero findings,
1,278 dependencies, zero critical/unresolved advisories and all four inherited
patched high exceptions intact: GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr,
GHSA-86w9-cpqp-85rv, GHSA-vfj7-8cjw-p6xm. Lockfile, dependency patches and security
policy are unchanged. No fresh install was performed.

The final compiled supervisor smoke passes after the transient port reuse clears:
public port 55840, private Next 55842 and API 5001; disposable populated v66 DB;
ready 200/true, public health/homepage 200, unauthenticated guidance 401. It checks
the generated local build identity `e8d7de07ec82d646893a502f`, inherits no provider
credentials and leaves providers off. The wrapper is `../ai-runtime-smoke.mjs`.
Metadata identifies the pre-review base head `bfd9bf0d`; compiled source includes
the tested working-tree fixes. This is local artifact verification, not a
published exact-commit release or full hosted SSO acceptance.

Raw local logs are in `build/ai-review`: `review-tests.log`,
`populated-upgrade.log`, `production-build.log`, `provider-isolation.log`,
`security-regressions.log`, `security-scan.log` and `runtime-smoke.log`.
Screenshots in `build/ai`: `guidance-desktop.png`, `guidance-mobile.png`,
`guidance-error-invalid.png`, `guidance-error-unknown.png`.
The current mobile answer and invalid-output error screenshots were visually
inspected; guidance and the bounded support reference are visible and readable.

Original review failures are retained in this explanation: fixture export initially
missed `packages/auth`; the initial populated comparison included the existing
v65 free-account backfill rather than a converged baseline; inherited assertions
still targeted the old route/copy. They were corrected, without skips or weaker
database/authorization assertions. A runtime smoke also encountered local Windows
port reuse; other runtime responses were explicitly excluded from evidence.

The full hosted release gate, live model access, production migration/publication
and real non-admin customer acceptance remain outside this local review. Spending
stays disabled by default. Canonical main now has separate checkout/data-fabric
work in progress; it was preserved. The landing branch and existing SBOM change
were also preserved. Only this review's disposable container is removed.
