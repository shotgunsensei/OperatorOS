# OperatorOS current release gate

- Evidence date: 2026-07-18
- Candidate branch: `codex/phase-5-techdeck-state-5`
- Phase 0 base: `a4598f6ae3dcc16896a48b05962f9a0002071363`
- Phase 1 implementation commit: `50d3b616ed2af8f50c983d29e161baf3c943130f`
- Phase 1 closure commit: `c3e55f7`
- Platform and Phases 2-5 source/local gate: **PASS; TradeFlowKit and TechDeck are state 4, not state 5**
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
| Database release plan | PASS | `db:plan` emits 18 ordered, additive, secret-free steps; `db:apply` passed repeatedly on PostgreSQL 16; the Phase 4 17-step release also passed after restore |
| Backup/restore rehearsal | PASS LOCALLY | Phase 4 custom dump restored in 3.570 s; source/restore matched 94 public tables, 17 TradeFlowKit, 9 Directory, and 10 shared-service tables |
| Restored data/constraints | PASS | Restored release apply passed; dump SHA-256 `d2df4f815a5fa678b058e1b602211fd7d8c878b32811807ed96e175130568c82` |
| Production build | PASS | Installed workspace toolchain produced SDK, API, runner gateway, and Next artifacts after API/runner/web typechecks; Next 14.2.35 generated 20 static page entries. The exact Replit wrapper remains pinned to pnpm 10.34.5. |
| Compiled production supervisor | PASS | Compiled 18-step release ran, Fastify and the shared worker reached readiness on 5001, and Next reached ready on 5000; no `tsx` production runtime |
| Local canonical-host health | PASS | HTTPS apex `/healthz` returned 200 with `operatoros-api`; API `/readyz` returned 200 with database/auth/SSO/registry configured |
| Local public URL diagnostics | PASS | TechDeck diagnostic resolved forwarded exact host, HTTPS origin, module role, and host-only cookie mode |
| Production-host SSO browser gate | PASS LOCALLY | Phase 5 2/2 Playwright scenarios in 1.7 minutes across root/app/auth and all 12 enabled modules; PKCE/state/nonce, exact callbacks, host-only cookies, TechDeck deep-link return, Back, refresh, silent sibling launch, local logout, and global revocation passed |
| Focused Phase 1 tests | PASS | 11/11 database-release, preflight, and supervisor contract tests |
| Focused Phase 2 tests | PASS | 9/9 directory, UI, deep-link, and release-contract tests |
| Focused Phase 3 tests | PASS | 24/24 shared-service, route, retention, lease-recovery, release, webhook, and provider-state tests on a clean database |
| Focused Phase 4 tests | PASS | 29/29 TradeFlowKit-focused tests in the final aggregate run, including concurrent conversion, Directory association, restart, provider, migration, and financial reconciliation |
| Focused Phase 5 tests | PASS | TechDeck 16/16 plus new Phase 5 5/5 for managed operations, network/IPAM, lifecycle, documentation/evidence/report/time workflow, roles, isolation, importer, release, and deep links |
| Phase 2 browser workflow | PASS LOCALLY | 1/1 on compiled artifacts; CRUD, refresh persistence, same organization ID across three modules, and no script-readable auth |
| Full API regression | PASS | Final Phase 5 run: 702 total, 696 passed, 0 failed, 6 HTTP-only skips in 616.9 seconds on a new PostgreSQL 16 database. Earlier stale TechDeck-navigation and pnpm-policy assertions were corrected and passed in focused and final reruns. |
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
