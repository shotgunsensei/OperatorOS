# OperatorOS current release gate

- Evidence date: 2026-07-27
- Candidate branch: `codex/phase-12b-outcall-rebuild`
- Phase 0 base: `a4598f6ae3dcc16896a48b05962f9a0002071363`
- Phase 1 implementation commit: `50d3b616ed2af8f50c983d29e161baf3c943130f`
- Phase 1 closure commit: `c3e55f7`
- Platform and Phases 2-12B source/local gate: **PARTIAL; Phase 12B bounded scoped gates and clean ecosystem aggregate pass, live-provider and deployed gates remain open**
- Public deployment gate: **FAIL (32/47)**
- Overall release decision: **CLOSED — do not promote**

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

The candidate was not deployed because deployment/publishing was not
authorized. The current public hosts still serve an older release. The release
gate remains closed until a human deploys the reviewed commit and the public
verifier reaches 47/47 plus authenticated browser acceptance on that exact
revision.

No module is declared production-ready by this platform gate. Real workflow
and migration parity remain controlled by the module parity index.

## Gate matrix

| Gate | Result | Fresh evidence |
| --- | --- | --- |
| Frozen dependency contract | PASS FROM PHASE 0 | Pinned pnpm `10.34.5`; lockfile unchanged by Phase 1 |
| Production environment contract | PASS | Machine-readable contract plus 7 preflight tests; core CLI preflight passed with exact canonical values and non-secret local test credentials |
| Unsafe configuration rejection | PASS | Rejects missing/short secrets, legacy `APP_URL`, parent `COOKIE_DOMAIN`, public unified-runtime API URL, unsafe commands, legacy SSO rollback, wildcard/insecure/credentialed/loopback CORS, and drifted module hosts |
| Database release plan | PASS | `db:plan` emits 29 ordered, additive, secret-free steps; Phase 12B clean apply and idempotent reapply passed on disposable PostgreSQL 16, including `outcall_tables` |
| Backup/restore rehearsal | PASS LOCALLY | Phase 4 custom dump restored in 3.570 s; source/restore matched 94 public tables, 17 TradeFlowKit, 9 Directory, and 10 shared-service tables |
| Restored data/constraints | PASS | Restored release apply passed; dump SHA-256 `d2df4f815a5fa678b058e1b602211fd7d8c878b32811807ed96e175130568c82` |
| Production build | PASS | Installed workspace toolchain produced SDK, API, runner gateway, and Next artifacts after API/runner/web typechecks; Next 14.2.35 generated 20 static page entries. The exact Replit wrapper remains pinned to pnpm 10.34.5. |
| Compiled production supervisor | PASS | Compiled 29-step release ran idempotently, Fastify and the shared worker reached readiness on 5001, and compiled Next reached ready on isolated public port 5100; no `tsx` production runtime |
| Local canonical-host health | PASS | HTTPS apex `/healthz` returned 200 with `operatoros-api`; API `/readyz` returned 200 with database/auth/SSO/registry configured |
| Local public URL diagnostics | PASS | TechDeck diagnostic resolved forwarded exact host, HTTPS origin, module role, and host-only cookie mode |
| Production-host SSO browser gate | PASS LOCALLY | Fresh Phase 12B matrix passed 9/9 in 2.1 minutes across root/app/auth and all 13 enabled modules. PKCE/state/nonce, exact callbacks, Secure host-only cookies, return/Back/refresh, silent launches, local/global logout and persistent module workflows passed. Separate first-screen workflows pass 2/2, including OutCall verified-self no-contact scheduling and non-entitled denial |
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
| Public read-only runtime verifier | FAIL | 32/47 on 2026-07-18; no authentication and no mutation |
| Formatting/lint | NOT DEFINED | Repository has no supported formatting or lint script; no pass is claimed |

## Public deployment blocker

The 2026-07-18 read-only verifier confirmed TLS/host attachment, API
readiness, all 17 public diagnostics, every enabled callback route, and
OutCall's fail-closed callback. It failed these release-critical checks:

- `https://operatoros.net/healthz` returned 404.
- The apex `/app` path did not emit the registered PKCE authorization request.
- The app host and all 12 enabled module launch redirects lacked the three
  host-only SSO transaction cookies expected from the candidate release.

This signature is consistent with the reviewed source not being deployed. It
is not fixed by changing DNS, widening cookies, adding legacy redirects, or
weakening the verifier.

## Human deployment closure

1. Review and deploy the scoped cumulative revision through the `.replit` autoscale
   build/run path.
2. Validate the real production secrets with
   `corepack pnpm preflight:production -- --core`; enable provider profiles only
   when the corresponding feature is meant to be live.
3. Confirm the provider-managed backup is current before the database release.
4. Run `corepack pnpm verify:production` and require 47/47.
5. Run authenticated browser SSO, direct deep-link, return navigation, refresh,
   local logout, global logout, expired session, disabled entitlement, second
   tenant isolation, and unauthorized API checks on the deployed revision.
6. Record the deployed commit and results in this file and
   `docs/auth/VALIDATION_MATRIX.md`.

Until those steps pass, promotion and all production-ready labels remain
blocked. Later phase source branches may proceed only under the owner's explicit
direction and must preserve this gate.
