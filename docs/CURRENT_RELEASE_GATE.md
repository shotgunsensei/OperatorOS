# OperatorOS current release gate

- Evidence date: 2026-07-29
- Candidate branch: `codex/phase-17-production-truth`
- Phase 0 base: `a4598f6ae3dcc16896a48b05962f9a0002071363`
- Phase 1 implementation commit: `50d3b616ed2af8f50c983d29e161baf3c943130f`
- Phase 1 closure commit: `c3e55f7`
- Platform and module source/local gate: **PARTIAL; local gates pass, live-provider and deployed gates remain open**
- Current public release: **commit `48b8691fca5c8a8d79f53b309cb44db79698bbcd`, build `932f83cb0d7c15ce994eb04e`; pre-Phase-17 verifier PASS 48/48**
- Phase 17 candidate public comparison: **EXPECTED PRE-DEPLOY FAIL 45/48; release identity and disabled OutCall are not on the public release**
- First deployment attempt: **FAILED BEFORE BUILD** — deployment
  `0a34bd3d-5706-434d-87ee-fffd3bf6e5cd`, build
  `c49eeb9c-5f0b-40b3-9f31-44813446124c`
- Overall release decision: **CLOSED — do not promote**

## Phase 17 production truth

At the start of Phase 17, refreshed `origin/main` and the commit identified by
public health/readiness were both
`48b8691fca5c8a8d79f53b309cb44db79698bbcd`; the source-to-production Git
difference was zero.

The Phase 17 candidate adds a deployment timestamp and explicit database
release v29/29 to the non-secret release identity, makes readiness fail closed
on that complete identity, lets the public verifier pin the intended Git
commit, and reconciles the documented planned OutCall boundary across the
catalog, registry, database seed, verifier, and browser gate.

Fresh isolated evidence passes the clean and idempotent 29-step release,
46/46 focused contracts, workspace typecheck, production build, core
preflight, compiled supervisor health/readiness, all-12-module SSO/global
logout 1/1, deep-link/sibling/local logout 1/1, and entitlement/OutCall denial
1/1. These are candidate results, not deployed results.

The strengthened verifier returns 45/48 against the unchanged public release:
both health snapshots lack Phase 17 deployment/database identity and the old
OutCall callback still renders. Promotion remains blocked on the exact
workflow in `docs/PHASE17_PRODUCTION_RELEASE_RUNBOOK.md` and the evidence
record in `docs/PHASE17_PRODUCTION_EVIDENCE_REPORT.md`.

## Decision

Phase 1 has produced a reproducible, fail-closed control-plane deployment and
verified it locally through the production build, compiled supervisor, restored
PostgreSQL data, HTTPS canonical-host routing, SSO, deep links, logout,
authorization, tenant isolation, and health/readiness paths.

At the owner's explicit direction, Phase 2 added the shared Business Directory
and passed its local database, browser, build, and health gates. That source
progress does not waive the still-failed public deployment gate.

The owner then explicitly authorized Phase 3 and later source branches despite
that failed public gate. Phase 3 added shared attachments, provider adapters,
notifications/outbox, jobs, verified webhook receipts, usage/activity ledgers,
idempotency, and the shared worker. Its clean database, aggregate regression,
production build, compiled runtime, and backup/restore gates passed locally.
This direction permits continued source work only; it does not authorize a
deployment, production data mutation, promotion, or production-ready label.

Phase 4 then recovered TradeFlowKit provenance and delivered its approved
source/local workflow as a state 4 candidate. The 17-step release,
backup/restore, production build/runtime, full API regression, TradeFlowKit
workflow, and local production-host SSO pass. The refreshed ecosystem browser
gate still fails on nine later-phase PulseDesk, TechDeck, and TorqueShed gaps;
TradeFlowKit also remains below state 5 until deployed workflow/public-document
smoke and an approved data cutover pass.

Phase 5 recovered TechDeck provenance and delivered its approved managed
operations workflow as a source/local state 4 candidate. Configuration
inventory, network/IPAM, lifecycle, documentation/runbooks, backlinks,
attachments, evidence, reports, comments, time, and deep links now run inside
OperatorOS boundaries. The current 18-step release, focused regression,
production build/runtime, anonymous deep-link checks, and local production-host
SSO pass. Remote action and secret values remain deliberately absent. TechDeck
stays below state 5 until deployed workflow/provider acceptance and an
authorized standalone-data cutover pass.

Phase 11E recovered CallCommand AI provenance and delivered its approved
consent-first call-operations workflow as a source/local state 4 candidate.
Tenant configuration, consent, suppression, persistent calls/safe events,
signed inbound DTMF intake, operator dispositions, reviewed follow-up drafts,
real analytics, a test-only adapter, fail-closed Twilio placement, signed
replay-safe callbacks, recording privacy and canonical deep links now run
inside OperatorOS authority. Focused static and PostgreSQL workflows pass, the
clean aggregate passes 825/825, the
clean/idempotent release contains 27 steps, compiled health/readiness passes,
and the production-host matrix passes 9/9 locally. Bulk/cold/predictive
dialing, child authority, fake delivery and incomplete providers remain
excluded. CallCommand stays below state 5 until the exact revision is
deployed and authorized source-data reconciliation/cutover, live-provider and
deployed acceptance pass.

Phase 12A recovered Ninjamation from the Replit-synced AutomationPacks source
and replaced the inferred workflow shell with its approved reviewed-script
boundary. Tenant script authoring, immutable versions/hashes, server static
analysis, admin review decisions, approved-current-version audited downloads,
shared AI drafts and canonical deep links now run inside OperatorOS authority.
Focused contracts and 4/4 PostgreSQL workflows pass, the clean aggregate
passes 836/836, the clean/idempotent release contains 28 steps, compiled
health/readiness passes, the production-host matrix remains green at 9/9 and
the separate first-screen suite passes 2/2. AutoWorkFlowHub is discontinued
and excluded; endpoint/browser execution and child authority remain absent.
Ninjamation stays below state 5 until the exact revision is deployed and an
authorized source-data reconciliation/cutover and deployed workflow acceptance
pass.

Phase 12B reconstructs OutCall from the owner's recovered prompt set as a
distinct verified-self personal-safety exit-assistance workload. It persists
safety acceptance, global verified-phone ownership, neutral profiles,
encrypted private triggers, verified-destination immediate/delayed requests,
safe events, shared jobs/activity and exactly-once usage. The clean aggregate
passes 839/839, the clean/idempotent release contains 29 steps, compiled
health/readiness passes, the production-host matrix passes 9/9 across all 13
enabled modules, and the first-screen suite passes 2/2. Live Twilio
verification/SMS/voice/DTMF/callbacks, export/deletion UI and deployed
acceptance remain incomplete, so OutCall is not state 4/5 or production-ready.

The first Phase 15 deployment attempt did not reach the repository build
command. Replit's automatic `npm install` rejected pnpm-only `parent>child`
override selectors in the root `package.json` with `EINVALIDTAGNAME`. The
selectors remain authoritative in `pnpm-workspace.yaml`; the npm-facing
duplicates were removed and direct dependency overrides now use npm's `$name`
references. A fresh `npm install --ignore-scripts --package-lock=false
--dry-run`, frozen pnpm install, zero-vulnerability audit, typecheck, and
production build pass locally. No runtime or database change occurred in the
failed deployment.

The reviewed Phase 15 merge is now deployed. A contract-corrected verifier
passes 48/48 against its exact readiness identity. The earlier 31/48 result was
verifier drift: it probed the legacy apex `/app` redirect instead of root
`/login`, expected obsolete short transaction-cookie names rather than the
authoritative `operatoros_sso_*` names, and used Replit's provider-reserved
`/healthz` path instead of the same API health snapshot exposed through
`/api/health`.

The overall release gate remains closed until authenticated browser acceptance
passes on this exact revision.

No module is declared production-ready by this platform gate. Real workflow
and migration parity remain controlled by the module parity index.

## Gate matrix

| Gate | Result | Fresh evidence |
| --- | --- | --- |
| Frozen dependency contract | PASS FROM PHASE 0 | Pinned pnpm `10.34.5`; lockfile unchanged by Phase 1 |
| Production environment contract | PASS | Machine-readable contract plus 7 preflight tests; core CLI preflight passed with exact canonical values and non-secret local test credentials |
| Unsafe configuration rejection | PASS | Rejects missing/short secrets, legacy `APP_URL`, parent `COOKIE_DOMAIN`, public unified-runtime API URL, unsafe commands, legacy SSO rollback, wildcard/insecure/credentialed/loopback CORS, and drifted module hosts |
| Database release plan | PASS | Phase 17 declares release v29 with 29 ordered, additive, secret-free steps; clean apply and idempotent reapply passed on disposable PostgreSQL 16 |
| Backup/restore rehearsal | PASS LOCALLY | Phase 4 custom dump restored in 3.570 s; source/restore matched 94 public tables, 17 TradeFlowKit, 9 Directory, and 10 shared-service tables |
| Restored data/constraints | PASS | Restored release apply passed; dump SHA-256 `d2df4f815a5fa678b058e1b602211fd7d8c878b32811807ed96e175130568c82` |
| Production build | PASS | Phase 17 produced SDK, API, runner gateway, and Next 15.5.22 artifacts after API/runner/web typechecks; 20 page entries generated. The exact Replit wrapper remains pinned to pnpm 10.34.5. |
| Compiled production supervisor | PASS | Phase 17 compiled 29-step release ran idempotently, Fastify and the shared worker reached readiness on 5001 with the complete release identity, then compiled Next reached ready on 5000; no `tsx` production runtime |
| Local canonical-host health | PASS | HTTPS apex `/healthz` returned 200 with `operatoros-api`; API `/readyz` returned 200 with database/auth/SSO/registry configured |
| Local public URL diagnostics | PASS | TechDeck diagnostic resolved forwarded exact host, HTTPS origin, module role, and host-only cookie mode |
| Production-host SSO browser gate | PASS LOCALLY | Phase 17 focused compiled-candidate gates pass 3/3: all 12 enabled modules plus global logout; TechDeck/PulseDesk deep link, sibling SSO and local logout; tenant-denied TechDeck and planned OutCall denial. No credential URL/storage leakage |
| Focused Phase 1 tests | PASS | 11/11 database-release, preflight, and supervisor contract tests |
| Focused Phase 2 tests | PASS | 9/9 directory, UI, deep-link, and release-contract tests |
| Focused Phase 3 tests | PASS | 24/24 shared-service, route, retention, lease-recovery, release, webhook, and provider-state tests on a clean database |
| Focused Phase 4 tests | PASS | 29/29 TradeFlowKit-focused tests in the final aggregate run, including concurrent conversion, Directory association, restart, provider, migration, and financial reconciliation |
| Focused Phase 5 tests | PASS | TechDeck 16/16 plus new Phase 5 5/5 for managed operations, network/IPAM, lifecycle, documentation/evidence/report/time workflow, roles, isolation, importer, release, and deep links |
| Focused Phase 10A tests | PASS | 11/11 domain/import/static/deep-link/release contracts plus fresh 5/5 shell/deep-link contracts and 1/1 isolated PostgreSQL workflow for persistence, tenant isolation, viewer denial, scoring, assignments, immutability and restart |
| Focused Phase 11B tests | PASS | 17/17 domain/import/database/release/deep-link contracts including private attachment controls, review authority, tenant isolation, viewer denial, append-only custody, report/export, retention and canonical routes |
| Focused Phase 11E tests | PASS | Static domain/import/release/deep-link contracts plus 5/5 tenant/authorization/consent/disposition/persistence and 4/4 signed callback/inbound/replay/recording-privacy PostgreSQL workflows |
| Focused Phase 12A tests | PASS | Domain/import/static/release/deep-link contracts plus 4/4 tenant/authorization/version/analysis/approval/download/AI-usage PostgreSQL workflows |
| Focused Phase 12B tests | PASS | 3/3 OutCall tenant/authorization/encryption/verified-destination/idempotency/usage workflows plus 34/34 registry/release/preflight/SSO contracts |
| Phase 2 browser workflow | PASS LOCALLY | 1/1 on compiled artifacts; CRUD, refresh persistence, same organization ID across three modules, and no script-readable auth |
| Full API regression | PASS | Fresh untouched-schema aggregate on the exact Phase 12B source passed 839/839 with 0 failures, 0 skips and 0 todo |
| Replit automatic npm preinstall | PASS LOCALLY AFTER DEFECT FIX | npm dry-run exits 0; pnpm-only scoped overrides remain in `pnpm-workspace.yaml` |
| Public read-only runtime verifier | BASELINE PASS; CANDIDATE EXPECTED FAIL | Existing public release `48b8691`, build `932f83cb0d7c15ce994eb04e`, passed the pre-Phase-17 48/48 gate. The strengthened candidate verifier returns 45/48 until the complete identity and disabled OutCall are deployed |
| Formatting/lint | NOT DEFINED | Repository has no supported formatting or lint script; no pass is claimed |

## Public deployment result

The current 2026-07-29 public release is healthy and identified as
`48b8691fca5c8a8d79f53b309cb44db79698bbcd`, build
`932f83cb0d7c15ce994eb04e`. It passed the prior public 48/48 contract. It is
not the Phase 17 candidate.

The strengthened Phase 17 verifier intentionally returns 45/48 against that
unchanged release. The three failures are the missing deployment/database
identity on health and readiness and the old enabled OutCall callback. No
Phase 17 deployed pass is claimed.

## Human deployment closure

1. Review and merge the Phase 17 pull request, then deploy the exact merged
   revision through the `.replit` autoscale build/run path.
2. Validate the real production secrets with
   `corepack pnpm preflight:production -- --core`; enable provider profiles only
   when the corresponding feature is meant to be live.
3. Confirm the provider-managed backup is current before the database release.
4. Set `OPERATOROS_EXPECTED_RELEASE_COMMIT` to `git rev-parse origin/main`, run
   `corepack pnpm verify:production`, and require 48/48 including the exact
   complete identity on health and readiness.
5. Provision the two synthetic accounts and six `E2E_PHASE17_*` values listed
   in `docs/PHASE17_PRODUCTION_RELEASE_RUNBOOK.md`, then run
   `corepack pnpm --dir apps/web test:e2e:phase17-deployed` and require 3/3.
6. Record the deployed commit and results in this file and
   `docs/auth/VALIDATION_MATRIX.md`.

Until those steps pass, promotion and all production-ready labels remain
blocked. Later phase source branches may proceed only under the owner's explicit
direction and must preserve this gate.
