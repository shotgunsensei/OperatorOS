# Phase 21 executable parity compiler and fail-closed release gate

## Cumulative refresh on 2026-08-09

After the Phase 23 visual mapping, Phase 24 recurring-work mapping, and Phase
25 full-catalog mapping, the compiler still fails closed. The current manifest
contains 6,646 capabilities: 336 native, 181 shared-equivalent, 0 waived, and
6,129 blocked. Fresh `verify:parity` returns 6,229 failures: 6,129
`BLOCKED_REQUIRED`, 61 `MISSING_TARGET_ROUTE`, and 39
`MISSING_TARGET_SCHEMA`. Current target discovery contains 693 files, 762
routes, 418 schema declarations, 972 test IDs, 726 controls, and 53 forbidden-
pattern observations. The dated Phase 21 execution record below is retained as
the original infrastructure evidence; this refresh is the current release
truth.

## Original Phase 21 execution record

Date: 2026-08-08  
Branch: `codex/phase-21-executable-parity-gate`  
Decision: **PHASE 21 INFRASTRUCTURE IMPLEMENTED; OPERATOROS RELEASE BLOCKED**

## Executive result

Phase 21 turns the Phase 20 source-derived ledgers into executable release
contracts. The compiler discovers source and target state, correlates each
capability with live paths and test IDs, writes one JSON/Markdown/HTML report
per module, and returns a non-zero status whenever parity evidence is
incomplete or stale. No hand-maintained aggregate is used as the compiler's
source of truth.

The implementation is working precisely because it refuses to certify the
current repository. The fresh strict result is **6,289 failures**:

| Failure | Count | Meaning |
| --- | ---: | --- |
| `BLOCKED_REQUIRED` | 6,189 | A source-derived required capability remains blocked in Phase 20. |
| `MISSING_TARGET_ROUTE` | 61 | An active route/endpoint/public-flow record does not identify a discoverable executable target route. |
| `MISSING_TARGET_SCHEMA` | 39 | An active database-table record does not identify a discoverable target schema declaration. |
| **Total** | **6,289** | Release remains fail-closed. |

Phase 21 does not reinterpret those failures, generate substitute evidence, or
approve visual baselines for screens that have not been reviewed against the
pinned source. The full `verify:release` story therefore stops at the first
broken boundary, `verify:parity`. Component-level regression checks were still
run independently and are recorded below.

## Executable compiler

The compiler is under `scripts/parity/`:

| Entry point | Contract |
| --- | --- |
| `discover-source.mjs` | Re-reads the Phase 20 manifest and all 13 ledgers, selects a source-specific adapter, recomputes source-tree fingerprints, per-module digests, state counts, and source drift. |
| `discover-target.mjs` | Parses active API, web, runner, package, script, and test files; discovers Fastify and Next routes, schema declarations, runnable test IDs, controls, and forbidden completion patterns. Imported `apps/modules/*/source` trees are never treated as target code. |
| `build-ledger.mjs` | Correlates every source capability with hashed implementation files, route IDs, schema IDs, evidence files, and runnable test IDs. |
| `verify-parity.mjs` | Fails on source drift, missing mappings, files, routes, schemas, evidence, or tests; all-skipped required evidence; required blockers; malformed/unapproved/expired waivers; duplicate IDs; stale counts; or incomplete shared-equivalent contracts. |
| `report-parity.mjs` | Produces human-readable and machine-readable per-module output under `build/parity/reports/`. |

The fresh discovery contains:

| Inventory | Count |
| --- | ---: |
| Source modules | 13 |
| Source capabilities | 6,646 |
| Target files | 660 |
| Target routes | 743 |
| Target schema declarations | 404 |
| Target automated test IDs | 940 |
| Target controls | 699 |
| Static forbidden-pattern observations | 41 |

The 6,646 capability state counts remain source-derived and reproduce Phase 20:
276 `ACTIVE_NATIVE`, 181 `ACTIVE_SHARED_EQUIVALENT`, 0 `OWNER_WAIVED`, and
6,189 `BLOCKED`, with no source drift and no unclassified item. All 457 active
items compile to at least one live implementation path and runnable automated
test ID. Every shared-equivalent item also carries the original source outcome
and an explicit compatibility assertion. Exact routes and schemas remain
separate fail-closed obligations, which is why 100 additional live failures are
reported.

Generated reports are intentionally build artifacts rather than checked-in
claims. A fresh run wrote all 13 module reports in JSON, Markdown, and HTML,
plus `index.json`, the compiled ledger, discovery inventories, and issue
details. CI uploads that directory even when a gate fails.

## Root command contract

Existing root commands were preserved. Phase 21 adds the following executable
surface:

| Command | Orchestration |
| --- | --- |
| `pnpm lint` | Active JS/TS syntax and safety lint with zero-warning policy. |
| `pnpm test` | Unit, API aggregate, and isolated integration/apply/reapply stages. |
| `pnpm test:unit` | Phase 20 reproducibility, Phase 21 compiler negatives, visual-contract negatives, and route/control negatives. |
| `pnpm test:api` | API aggregate; refuses to run without `PARITY_DATABASE_IS_DISPOSABLE=1` and `DATABASE_URL`. |
| `pnpm test:integration` | Resets only an explicitly marked, loopback, test-named database; applies release v33 twice; then runs release-contract, session-boundary, and tenant-isolation tests. |
| `pnpm test:e2e` | Starts the compiled readiness-gated runtime and exact-host proxy, then runs SSO plus parity route/control browser tests. |
| `pnpm test:visual` | Validates contracts/approvals, then runs the three-viewport screenshot and accessibility suite. |
| `pnpm verify:parity` | Runs the strict Phase 21 compiler. The previous Phase 20-only check remains available as `verify:parity:phase20`. |
| `pnpm verify:release` | Writes reports, then orchestrates strict parity, typecheck, lint, unit, API, integration apply/reapply, production build, static route/control, static visual, exact-host/visual/accessibility browser gates, and production core preflight. It records every stage in `build/parity/release-gate-results.json` and exits non-zero if any stage fails. |

`scripts/parity/run-release-gate.mjs --plan` returned all 12 expected stages in
the order above. The runner does not discard later stage results after one
failure; CI can therefore upload a complete failure bundle. The verification
story in this report stopped at parity because the current repository is
already known not to be releasable.

## Clean-checkout CI contract

`.github/workflows/release-gate.yml` runs on pull requests, pushes to `main`,
and manual dispatch. It:

1. checks out the exact revision;
2. activates pinned pnpm 10.34.5 and Node 20;
3. caches only the immutable pnpm store keyed by the lockfile;
4. starts a fresh PostgreSQL 16 service database with synthetic credentials;
5. performs a frozen install and installs pinned Chromium;
6. captures the read-only release-v33 migration plan;
7. runs `pnpm verify:release`; and
8. uploads parity reports, release metadata/results, the migration plan,
   Playwright HTML reports, screenshots, traces, videos, and test results even
   on failure.

The database runners refuse to start unless both a database URL and the
explicit disposable marker are present. The integration reset additionally
requires a loopback host and a database name containing `test`, `phase21`,
`ci`, or `disposable`; it drops and recreates only that database's `public`
schema before apply/reapply and records sanitized reset metadata. A controlled
unit test rejects both a non-loopback URL and a production-like database name.
No mutable test data is cached or reused for clean apply/reapply.
The unit, API, and integration wrappers capture Node test summaries and fail on
any skip, todo, cancellation, failure, or missing summary; each writes a JSON
summary artifact. Playwright uses a Phase 21 reporter that changes the run
result to failure if any selected release test is skipped, and writes a skip
audit artifact. The browser tests independently fail on console errors, page errors, failed
network requests, HTTP 4xx/5xx responses, invalid anchors, missing accessible
names, and placeholder/completion text.

## Visual contracts

`docs/parity/visual-contracts.json` defines one module-owned critical suite for
each of the 13 products. Each contract pins source references, source-owned
branding tokens, a critical authenticated route, and these viewport widths:

| Viewport | CSS width | Contract use |
| --- | ---: | --- |
| Desktop | 1440 | Full critical screen and navigation. |
| Tablet | 1024 | Responsive intermediate layout. |
| Mobile | 390 | Narrow control visibility and overflow. |

The Playwright suite checks HTTP status, module identity, console/page/network
errors, horizontal overflow, visible control names, basic computed contrast,
and screenshot diff. The update path is deliberately split:

1. `pnpm visual:update` produces candidate PNGs.
2. A human reviews each exact PNG against the pinned source references.
3. `pnpm visual:approve -- --approve --approved-by <identity> --reason <reason>`
   binds the PNG SHA-256, reviewer, time, and reason in
   `visual-baseline-approvals.json`.
4. Missing files, hash drift, or incomplete approvals fail the static gate.

No baseline was approved in this phase. The fresh static visual gate reports
40 failures: 39 missing viewport baselines and one missing OutCall branding
contract. OutCall's recovered source boundary contains only a README, so Phase
21 does not invent source-owned brand tokens. This preserves the Phase 20
source-recovery blocker.

## Route and control integrity

The static integrity compiler emits a browser crawl plan from every active
public/authenticated route it can resolve, checks active target files, and
scans JSX/TSX controls and completion markers. The Playwright suite then visits
the 13 critical authenticated module screens in a disposable seeded session.

The current static result is 74 failures:

| Failure | Count | Current evidence |
| --- | ---: | --- |
| `ROUTE_NOT_CRAWLABLE` | 61 | Active route records lack exact executable route IDs. |
| `DEAD_BUTTON_STATIC` | 12 | PulseDesk service-workspace buttons have no discoverable handler, submit type, or disabled state. |
| `COMING_SOON_COMPLETION_MARKER` | 1 | `apps/api/src/routes/module-routes.ts:480` still exposes a coming-soon marker. |

The browser suite additionally rejects 404/500 responses, dead or targetless
anchors, missing accessible names, placeholder/coming-soon/not-implemented
copy, unsupported error-free success, failed requests, console errors, and page
errors. It is wired into the release runner but was not promoted past the
already-failing parity boundary in this execution.

## Controlled failure demonstrations

The negative fixtures clone discovery state in memory and mutate only the
clone. They never delete or edit a real source, implementation, test, schema,
route, or waiver. The root unit command executed every fixture and passed all
assertions with zero skipped tests.

| Controlled mutation | Required detected failure |
| --- | --- |
| Source fingerprint drift | `SOURCE_DRIFT` |
| Active item loses all implementation mappings | `MISSING_MAPPING` |
| Mapped implementation file is removed | `MISSING_TARGET_FILE` |
| Executable route discovery is removed | `MISSING_TARGET_ROUTE` |
| Executable schema discovery is removed | `MISSING_TARGET_SCHEMA` |
| Active item loses evidence files | `MISSING_EVIDENCE` |
| Evidence file loses its test IDs | `MISSING_TEST_ID` |
| Every referenced test is marked skipped | `REQUIRED_TESTS_SKIPPED` |
| Stable capability ID is duplicated | `DUPLICATE_CAPABILITY_ID` |
| Item is waived without an exact approval | `UNAPPROVED_WAIVER` |
| Manifest count is made stale | `STALE_MANIFEST_COUNTS` |
| Shared equivalent loses the source outcome | `MISSING_ORIGINAL_USER_OUTCOME` |
| Shared equivalent loses compatibility assertion | `MISSING_COMPATIBILITY_ASSERTION` |
| Required item is blocked | `BLOCKED_REQUIRED` |
| Visual contract loses branding tokens | `MISSING_MODULE_BRANDING_TOKENS` |
| Visual contract loses a required viewport | `MISSING_VISUAL_VIEWPORT` |
| Visual contract names an invalid route | `INVALID_VISUAL_ROUTE` |
| Route/control fixture contains a dead button and unresolved active route | `DEAD_BUTTON_STATIC` and `ROUTE_NOT_CRAWLABLE` |
| Database reset is given a non-loopback or production-like database URL | Reset guard throws before connecting or dropping any schema. |
| Required Node test telemetry is missing or contains a skip | Required-test summary evaluator returns failure. |

The missing-file and missing-test-ID fixtures are the requested controlled proof
that `verify:parity` becomes stricter when one mapped implementation or test is
removed. The live repository also independently demonstrates route, schema,
blocker, visual, and control failures.

## Exact execution evidence

The host's generic pnpm fallback is 11.16.0, while this repository pins
10.34.5. The exact cached pinned CLI was therefore invoked through the bundled
Node runtime:

```powershell
$node = 'C:\Users\J20\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = 'C:\Users\J20\AppData\Local\pnpm\store\v11\links\@\pnpm\10.34.5\5fb44e6255699bf9dc403a0967820c44f56445bf0d82a1d00e75f51d62e858c7\node_modules\pnpm\bin\pnpm.cjs'
$env:CI = 'true'
$env:PATH = 'C:\Users\J20\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH
```

Commands and results:

| Exact command | Result |
| --- | --- |
| `& $node scripts/parity/discover-source.mjs` | PASS: 13 modules, 6,646 capabilities, zero drift. |
| `& $node scripts/parity/discover-target.mjs` | PASS: 660 files, 743 routes, 404 schemas, 940 tests, 699 controls. |
| `& $node scripts/parity/build-ledger.mjs` | PASS as a compiler operation; wrote ledger with 6,289 release issues. |
| `& $node scripts/parity/report-parity.mjs` | PASS: 13 reports in JSON/Markdown/HTML. |
| `& $node $pnpm verify:parity:phase20` | PASS: reproducible 6,646-item source baseline, zero failures. |
| `& $node $pnpm verify:parity` | EXPECTED FAIL: 6,289 strict release failures. |
| `& $node $pnpm test:unit` | PASS: 31/31, 0 fail, 0 skip, 0 todo after the final fixture expansion. |
| `& $node $pnpm typecheck` | PASS: API, runner, and web 3/3. |
| `& $node $pnpm lint` | PASS: zero errors and zero warnings. |
| `& $node scripts/parity/verify-controls.mjs` | EXPECTED FAIL: 74 route/control failures. |
| `& $node scripts/parity/verify-visual-contracts.mjs` | EXPECTED FAIL: 40 visual-contract failures. |
| `& $node scripts/parity/run-release-gate.mjs --plan` | PASS: 12 required stages emitted in order. |
| `& $node $pnpm build:production` with `INTERNAL_API_URL=http://localhost:5001` | PASS: SDK/API/runner/Next production build; build ID `a4e35a7bac1506e0f809abc7`. |
| `& $node $pnpm db:plan` with synthetic non-production environment values | PASS: release v33, 33/33 non-destructive ordered steps. No connection or apply occurred. |
| `& $node $pnpm preflight:production -- --core` with the complete synthetic production contract | PASS core. |

The final unit count is 31 because it includes 18 compiler/negative-fixture
tests, 8 quality/safety-contract tests, and 5 Phase 20 reproducibility tests. Earlier
in the implementation, the same suite passed 26/26 before the route, schema,
and skipped-test fixtures were added.

Two environment-only setup failures occurred and were corrected before the
corresponding gates were evaluated:

- the generic pnpm 11.16.0 wrapper attempted a non-interactive `node_modules`
  replacement and aborted because `CI=true` was absent; the pinned 10.34.5 CLI
  was then selected directly; and
- the first synthetic core-preflight invocation omitted
  `OPERATOROS_DATABASE_RELEASE_MODE=apply`; the corrected exact contract
  passed. No secret value was printed.

## Acceptance status

| Acceptance gate | Status |
| --- | --- |
| Root `verify:parity` fails when a mapped implementation is removed | **PROVEN** by `missing-target`. |
| Root `verify:parity` fails when a mapped test is removed or all referenced tests are skipped | **PROVEN** by `missing-test-id` and `tests-skipped`. |
| `verify:release` is executable from a clean checkout and disposable PostgreSQL service | **IMPLEMENTED IN CI; NOT CLAIMED PASSING**. The workflow provisions the clean checkout/database and the runner enforces the disposable marker, but current parity intentionally fails first. |
| Every module produces a machine-readable report | **PROVEN**: 13/13 JSON reports plus Markdown/HTML. |
| Controlled negative exists for each major compiler/visual/control failure class | **PROVEN** by the fixture table and 31/31 unit run. |
| Existing required production commands do not regress | **PROVEN FOR TYPECHECK, BUILD, DB PLAN, AND CORE PREFLIGHT**. The production build and all three typechecks pass; release v33 plan remains 33/33 and non-destructive. |
| OperatorOS can be labeled release-complete | **BLOCKED**: strict parity 6,289; route/control 74; visual 40. |

The clean database apply/reapply, API aggregate, compiled runtime, and browser
stages were not rerun as a full Phase 21 release story after strict parity
failed. They remain mandatory stages in `verify:release` and CI, not implied
passes. This is the intended fail-closed boundary rather than an incomplete
success claim.

## Data, production, and rollback statement

No imported source tree was modified or executed. No production deployment,
provider call, persistent database, production migration, restore, customer
data, or traffic was touched. Phase 21 adds no database release step and does
not change platform identity, session, tenant, entitlement, billing, or module
authority.

Rollback for Phase 21 is repository-only: remove the `scripts/parity/`
toolchain, root command additions, CI workflow, visual contract files,
Playwright parity suites/config, lint config, and this documentation overlay.
The existing v33 database contract and application runtime need no data
rollback because Phase 21 does not mutate them.
