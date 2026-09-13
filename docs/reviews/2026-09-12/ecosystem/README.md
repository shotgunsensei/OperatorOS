# OperatorOS ecosystem release review

**Decision: the ecosystem has substantial working foundations, but it is not ready for an unqualified “fully polished and end-to-end accepted” release claim.** Fix the unintended payment action and native offline-work loss first, repair the failing acceptance contracts, and close the provider/security/deployed evidence gaps. OutCall should remain unavailable while its reconstructed experience and provider lifecycle are completed.

This package contains **35 findings and acceptance gaps, 28 executable phase prompts, 16 value opportunities and a full module/cross-module acceptance matrix**. Findings distinguish reproduced behavior, direct source evidence, risks requiring validation and missing gates. They are not 35 claimed security vulnerabilities or 35 equally severe product bugs.

## Read and use this package

| Document | Purpose |
| --- | --- |
| [Findings](FINDINGS.md) | Exact issue, evidence, impact, priority, affected implementation and required outcome |
| [Phase prompts](PHASE_PROMPTS.md) | Copyable P00–P27 implementation/verification prompts with repo authority, boundaries and completion criteria |
| [Value opportunities](VALUE_OPPORTUNITIES.md) | E01–E16 enhancements, existing foundations, smallest useful scope and honest success measures |
| [Acceptance matrix](ACCEPTANCE_MATRIX.md) | All 13 modules, ten registered handoffs, shared services, native, operations and visual/failure-state criteria |
| [Source inventory](evidence/source-inventory.csv) | Per-file path, category, line/byte count and SHA-256; inventory is explicitly not manual semantic coverage |
| [Reproduced client behavior](evidence/client-reproductions.json) | Four current-source execution probes, with limitations |
| [Public readiness snapshot](evidence/public-readiness.json) | Read-only observed live release/schema/readiness identity |

Start with P00, then P01–P13. Give the independent managed security gate P18 a supported environment. Choose targeted P14–P17/P27 polish after critical repairs. Use P19–P22 to establish provider/browser/native/operational acceptance. P24–P26 are optional differentiators; P23 is maintenance, not an excuse for a late rewrite.

## What was actually reviewed

The initial clean local checkout was `main` at `b14e94a`. A scoped `codex/ecosystem-release-review` branch was created. Read-only public readiness revealed that the live application had already moved to `fe7f1711428e10daefc9b56d15b8e6a73289dadc`, built/deployed September 11 with database v61. The remote was fetched and the clean review branch fast-forwarded to that exact source before finalizing findings and rerunning current gates. This avoids prescribing old fixes already made by the latest guided-workflow and messenger work.

Reviewed scope includes canonical API/web/shared packages, module registry and navigation, central authority boundaries, billing and provider lifecycles, background jobs, file/export flows, all 13 module workspaces and route contracts, TorqueShed native offline behavior, production supervisor/manifest and the quarantined migration evidence/ledgers. The public browser review covered home, applications, pricing/stack selection, sign-in/return and Help, including 390×844 phone screenshots. No authenticated customer account was used on production.

This was an intensive repository-wide **inventory, architectural/workflow trace, targeted source review, automated regression execution and public UX review**. It was not a line-by-line semantic read of every file. The inventory has 3,675 tracked source/test/script files and 660,401 lines, including 2,580 quarantined source files. No finite set of green tests proves every line correct. The managed deep security scan could not start. These limitations are part of the review, not silently converted into passes.

### Inventory at the reviewed commit

| Category | Files | Lines | Treatment |
| --- | ---: | ---: | --- |
| API | 271 | 109,757 | Targeted route/domain/transaction traces and full API gate |
| Web | 271 | 69,418 | Module/client state/route traces, public browser, compiled verification |
| Shared packages | 17 | 3,791 | Registry/SSO/contracts/navigation authority and parity evidence |
| TorqueShed native | 32 | 1,426 | Source and actual queue-domain probe; no real-device certification |
| Runner gateway | 7 | 1,009 | Deployment exclusion and source boundary; not activated |
| Scripts | 90 | 13,813 | Release, parity, source gates, supervisor and DB harness |
| Tests | 372 | 65,890 | Inventory plus executed suites described below |
| Quarantined imports | 2,580 | 335,935 | Read-only provenance/ledger review; no child execution/install/migration |
| Other tracked source | 35 | 59,362 | Includes generated/support code; inventoried, not all semantically reviewed |
| **Total** | **3,675** | **660,401** | **Inventory coverage, not a manual-read completion percentage** |

Tracked `output/` contains 208 files totaling **688,950,001 bytes** at the reviewed commit. Much of the approximately 9.5-million-line recent diff is generated investigation evidence. Keep useful proof, but make ordinary source review manageable with a deliberate artifact-retention policy.

### Module coverage and practical assessment

| Module | Areas traced/reviewed | Main action |
| --- | --- | --- |
| TradeFlowKit | Revenue UI/client/pay transaction, lead/workflow/search/import/proof contracts, current guided shell | Fix Cancel/payment audit; correct obsolete OutCall positioning; closeout packet later |
| TechDeck | Ticket query/UI filters and counts, managed infrastructure/runbook/report paths, shared handoff | Complete queues beyond 100 and exact record access; improve handover |
| PulseDesk | Request list/query/loading, saved views, role/operations/privacy contracts, directories/attachments | Fix paging, view application and typing focus; shift handover later |
| TorqueShed | Journal/record loads, exports/settings, diagnostics/social/live-bay contracts, native queue | Preserve offline work, finish downloads and correct discoverability |
| FaultlineLab | Evidence loads, authoring/session/result lifecycle, deterministic catalog and training-transfer barriers | Distinguish failed evidence; targeted practice after correctness |
| Operator Pool Hall | Active practice/CPU/local/online boundaries, recovery, promoted engine provenance and rule model | Named-browser play/reconnect/accessibility acceptance; keep free and truthful |
| BrandForgeOS | Campaign/content/approval/export state, logo output, ownership/plan and campaign handoff | Finish approved-package readiness and revision clarity |
| SnapProofOS | Team/field-route loader, capture/report/export/share and proof-origin contract | Fix cold Team route and prove complete durable proof package |
| StudyForge AI | Flashcard session/rating/completion API and UI, keyboard, set/quiz/export state | Fix completed-session reuse and keyboard interaction |
| Deploy Ops | Complete workspace/ownership/export, package generation/catalog and review boundary | Inspect real outputs; improve manifest and handoff clarity |
| CallCommand AI | New v61 setup/order state, number/billing lifecycle, call detail/metrics and reviewed operational handoffs | Fix old-call routing/counts and availability copy; provider acceptance remains separate |
| Script Ops | Source/catalog/sync, immutable version review/download and non-executing runbook handoff | Improve exact-version comparison/context; preserve execution boundary |
| OutCall | Canonical reconstructed workspace, verification/profile/schedule/history, lock/provenance/provider gates and public copy | Repair source gate and unreleased flow; remain coming soon |

The review did not manufacture an individual confirmed defect for every module. Some modules primarily need complete acceptance and a carefully chosen improvement rather than another rewrite. The [acceptance matrix](ACCEPTANCE_MATRIX.md) specifies what must be demonstrated for each one.

## Highest-priority findings

| Finding | Why it comes first | Phase |
| --- | --- | --- |
| F01 | Cancel in the payment-reference dialog still invokes a durable payment mutation | P01 |
| F03 | Native permanent sync errors remove queued work and associated durable files | P02 |
| F18 | Dedicated OutCall gate is red because of stale literal copy/fingerprint evidence | P10 |
| F22 | OutCall accepted-timeout/retry identity and async outcome need validation before activation | P11/P19 |
| F27 | Shared batch lease expiry can precede handler execution; two-worker reproduction required | P13 |
| F30 | Static mapping/public readiness cannot close all customer/provider/deployed acceptance | P00/P20–P22 |
| F31 | Managed deep security scan was blocked before starting | P18 |
| F34 | Full current API gate is red on superseded TradeFlowKit copy assertion | P00 |

Other concrete quality gaps include incorrect discoverability display, missing SnapProof roster fetch, incomplete export delivery, bounded-list false negatives, inert saved views, a search input replaced while typing, completed flashcard session reuse, keyboard interception and silent evidence-load failures. OutCall also needs complete lists, explicit profile selection and verification recovery. Public sign-in and pricing state need finishing.

## Fresh verification

Environment: Windows PowerShell, Node **24.19.0**, Corepack pnpm **10.34.5**, official PostgreSQL **16-alpine** in new disposable container `operatoros-review-20260912`, loopback `127.0.0.1:55462`, database `operatoros_test_review_20260912`, synthetic non-production secrets. Repository CI's Node environment may differ; these results are identified as local Windows evidence. No production/developer persistent database was tested or migrated.

The review harness fixes the loopback database and strips external provider environment variables. API checks use `APP_ENV=test`, `NODE_ENV=test`. Integration resets only this disposable schema and uses the supported `db:apply` mode. Compiled browser verification uses explicit deterministic providers, production app mode and the local exact-host proxy; it is not real provider acceptance.

| Command / check | Baseline | Result | Evidence |
| --- | --- | --- | --- |
| `corepack pnpm typecheck` | initial `b14e94a` | Pass, four workspaces | Repeated as part of current production build |
| `corepack pnpm test:unit` | initial `b14e94a` | 52 pass, 0 fail/skip | Historical local baseline only |
| `node scripts/parity/run-api-tests.mjs` through fixed review harness | initial `b14e94a` | 1,450 pass, 0 fail/cancel/skip/todo; 580,537 ms | [Initial API log](evidence/api-b14e94a.log), [metadata](evidence/api-b14e94a.json) |
| `corepack pnpm build:production`, `INTERNAL_API_URL=http://localhost:5001` | initial `b14e94a` | Pass | [Initial build log](evidence/production-build.log) |
| `$env:CI='true'; corepack pnpm install --frozen-lockfile` | current `fe7f171` | Pass | [Install log](evidence/install-fe7f171.log) |
| `corepack pnpm test:unit` | current `fe7f171` | **52 pass, 0 fail/cancel/skip/todo**, 75,900 ms | [Unit log](evidence/unit-fe7f171.log) |
| `corepack pnpm lint` | current `fe7f171` | **Pass**, actual current ESLint script, zero warnings allowed | [Lint log](evidence/lint-fe7f171.log) |
| `node scripts/parity/run-api-tests.mjs` through fixed review harness | current `fe7f171` | **1,477 tests: 1,476 pass, 1 fail, 0 cancel/skip/todo**, 536,328 ms | [API log](evidence/api-aggregate.log), [metadata](evidence/api-execution.json); F34 |
| `node scripts/parity/run-integration-tests.mjs` through fixed review harness | current `fe7f171` | **32 pass, 0 fail/cancel/skip/todo**, 25,177 ms; clean supported apply, reapply and verify passed | [Integration log](evidence/integration-aggregate.log), [metadata](evidence/integration-execution.json) |
| `corepack pnpm build:production`, `INTERNAL_API_URL=http://localhost:5001` | current `fe7f171` | **Pass**, four workspace typechecks, catalog checks, API/runner/web and 35 Next pages | [Current build log](evidence/build-fe7f171.log) |
| `node scripts/parity/verify-controls.mjs` | current `fe7f171` | 223 target files, 1,304 route capabilities, 970 crawl routes, 0 failures | Static control mapping; not 970 completed user journeys |
| `node scripts/parity/verify-visual-contracts.mjs` | current `fe7f171` | 13 modules, 0 failures | Static visual contract; not screenshot comparison |
| `node scripts/parity/verify-parity.mjs` | current `fe7f171` | 13 modules, 7,396 capabilities, 4,281 native + 3,115 shared equivalents, 0 mapping failures | Coverage ledger, not universal behavioral proof |
| `node scripts/phase37-outcall-source-gate.mjs` | current `fe7f171` | **Fail**, literal marketing derivation assertion and stale evidence | [OutCall gate log](evidence/outcall-gate-fe7f171.log) |
| `node --test scripts/phase37/outcall-source-gate.test.mjs` | current `fe7f171` | **3 tests: 1 pass, 2 fail, 0 skips** | [OutCall tests](evidence/outcall-tests-fe7f171.log); F18 |
| `node docs/reviews/2026-09-12/ecosystem/evidence/reproduce-client-findings.mjs` | current `fe7f171` | Four defects reproduced from actual extracted current-source callbacks/expressions | [Probe results](evidence/client-reproductions.json); not product pass tests |
| Compiled supervisor/exact-host browser + visual suite | current `fe7f171` | See final browser result below | Local deterministic provider environment only |
| Public browser/readiness | observed deployed `fe7f171` | Public pages observed; readiness true, schema v61/61 | [Readiness snapshot](evidence/public-readiness.json), seven saved screenshots |
| Managed deep security scan | requested repository scope | **Blocked before start; no scan ID or security coverage** | F31, exact failure below |
| Real provider / native device / authenticated deployed mutation acceptance | — | **Not run** | Required future P19/P21/P22 work |

No formatter run is claimed. The user-provided repository instructions said there was no lint script, but the current package does define one; it was inspected and actually run. Diagnostic seed log lines saying optional demo/bootstrap creation was skipped are not skipped tests; the test summaries above report their own skip counts.

### Browser result

The compiled `--suite all` run is recorded in the final evidence update before delivery. It uses `scripts/start-unified-runtime.mjs` and the repository loopback exact-host proxy. Any failures remain failures; no visual baselines are regenerated to hide differences. This section must be finalized from the actual completed run, not inferred from API/build success.

### Security blocker

The Daybreak eligibility advisory granted access. The deep-scan start tool then returned:

> Deep Scan cannot safely start a read-only worker: the parent must provide a managed filesystem permission profile.

The skill requires surfacing the failure and prohibits retry/replacement scan calls in that response. No scan started and no security certification is claimed. The relevant instruction source is `C:\Users\johnt\.codex\plugins\cache\openai-curated-remote\codex-security\0.1.24\skills\deep-security-scan\SKILL.md`. P18 describes the supported follow-up. This did not prevent completion of the separate functional/product/reliability review and prompt package.

## Design assessment grounded in observed screens

The public site has a coherent visual identity and clearer outcome-oriented product explanations than a generic application directory. The current source also includes recent useful guided-workflow, mobile navigation, admin and messenger improvements. Preserve those investments.

The observed phone sign-in screen places the form below a full viewport of promotional content. Pricing loses a non-default selection when leaving for sign-in. The OutCall card combines “Coming Soon” with purchasable add-on language. These are specific fixable points of friction, supported by screenshots/source, rather than a reason to repaint every page.

| Screenshot | What it establishes |
| --- | --- |
| [Home desktop](screenshots/01-home-desktop.png) | Observed public visual baseline |
| [Pricing desktop](screenshots/02-pricing-desktop.png) | Public pricing layout; not evidence that all prices failed |
| [Stack builder](screenshots/03-stack-builder.png) | Settled pricing selection surface |
| [Sign-in return](screenshots/04-signin-return.png) | Central sign-in entry from pricing |
| [Phone sign-in first viewport](screenshots/05-signin-mobile.png) | Form below promotional content at 390×844 |
| [Phone sign-in after scroll](screenshots/06-signin-mobile-form.png) | Form becomes available after scrolling |
| [OutCall phone card](screenshots/07-outcall-mobile.png) | Contradictory coming-soon/add-on/access copy |

## Final delivery boundary

This branch adds review documentation, evidence and isolated review harnesses. It does not implement the product fixes or enhancements. No commit, push, deployment, provider purchase, customer message or production data mutation is part of this review. The source fast-forward brings the local review branch to the already-published commit; it is not a deployment.

The correct next action is to execute the focused prompts against the then-current candidate, close the highest-risk user failures and gather exact acceptance. The review gives a concrete path to a polished release while keeping unproven claims visible.
