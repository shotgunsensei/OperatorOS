# OperatorOS current release gate

## Release v59 Core Suite evaluation - SOURCE/LOCAL PASS, PRODUCTION HOLD (2026-09-01)

Release v59 adds one no-card, once-per-verified-email, 168-hour personal-workspace
evaluation of TradeFlowKit, TechDeck, and PulseDesk. It does not grant company
workspaces, permanent-free applications, companion applications, or any module
outside the immutable three-item offer. It does not create Stripe or tenant
grant state. Paid plan/add-on access remains server-confirmed and has precedence;
module data remains stored when evaluation access ends.

The durable ledger uses a versioned HMAC of normalized email, PostgreSQL time,
user/offer and identity/offer uniqueness, and nullable subject references that
survive account deletion. Verification tokens are hashed, expiring, single-use,
and reset on email change. Exact-host SSO and module refresh recheck entitlement
and prevent a trial-derived session from outliving the database window.

Source/local evidence passes the combined 72/72 auth, email, trial, release,
preflight and SSO/session gate, 59/59 affected customer-shell checks with six expected HTTP-only
skips, all four workspace typechecks, the production build with 35/35 generated
routes, and a 59-step non-destructive release plan plus disposable apply/reapply.
The full API aggregate is not claimed green: after two v59 expectations were
corrected, three untouched CallCommand source-slicing contract failures remain.

Status remains **SOURCE/LOCAL PASS; PRODUCTION HOLD**. Before activation:

1. review and back up the production database, then promote the exact v59
   artifact through the readiness-gated supervisor;
2. configure a stable high-entropy
   `OPERATOROS_TRIAL_IDENTITY_HMAC_SECRET`, transactional email provider/sender,
   and only then set `OPERATOROS_SELF_SERVICE_TRIALS_ENABLED=1`;
3. prove external inbox verification, duplicate-start idempotency, personal vs.
   organization isolation, exact-host launch/refresh, post-expiry denial with
   data preservation, and paid plan/add-on restoration;
4. reconcile trial/audit counts, observe monitoring, and retain a verified
   restore-to-new-database traffic-switch path.

No production database, provider, billing, deployment, DNS, merge, push, or
publish action was performed by this change.

## Customer-facing module identity repair - SOURCE/LOCAL PASS, LIVE RELEASE PENDING (2026-08-30)

The current source candidate closes the stale catalog-name path that allowed
authenticated Workspace Home, catalog, tenant, billing, and administrator
surfaces to show Ninja Pool Hall, Ninja Launch Kit, or Ninjamation after their
approved public rename. The canonical display identities are now Operator Pool
Hall, Deploy Ops, and Script Ops. Their existing slugs, routes, database
schemas, entitlement keys, Stripe keys, migration IDs, and redirect aliases do
not change.

The SDK catalog owns first-party display names. Release-v56 module seeding
repairs persisted name drift idempotently; authenticated API projections use
the SDK name defensively; both module-admin mutation paths reject a retired
catalog name; and Workspace Home renders the registry name for registered
cards. Custom/admin-created modules remain editable.

Fresh source/local evidence passes 7/7 focused disposable-database/API tests,
17/17 broader identity and launcher contracts, 3/3 focused launcher contracts,
the full API suite at 1,204/1,204 with 6 expected HTTP-only skips, all four
workspace typechecks, and the production build with 35/35 generated routes. A
read-only database plan remains v56/56 and non-destructive. A full v56
disposable apply, deliberate three-row legacy-name drift, and full reapply
finished successfully; the final rows matched all three canonical names.

Release status remains **SOURCE/LOCAL PASS; PRODUCTION HOLD**. This branch was
not merged, pushed, published, or deployed, and no production database was
read or mutated. Production backup, reviewed promotion, v56 apply through the
readiness-gated runtime, exact deployed commit/build identity, authenticated
Workspace Home/catalog/tenant/billing acceptance, monitoring, and rollback
proof remain required.

## Current reconciled candidate - SOURCE/LOCAL PASS, LIVE RELEASE PENDING (2026-08-26)

The `codex/green-release-gate` candidate preserves the pulled Replit
package-manager compatibility repair and reconciles the applicable stashed
product work. `corepack pnpm verify:release` passes all 14 stages with zero
failed stages. The strict matrix contains 7,396 capabilities: 4,281 native,
3,115 tested shared equivalents, zero owner waivers, and zero blockers.

Fresh clean-checkout evidence: security/hardening passes with 1,291 tracked
source files and zero findings;
42/42 unit tests; 1,203/1,203 API tests; 28/28 disposable PostgreSQL release,
apply, reapply, and integration tests; four-workspace typecheck; zero-warning
ESLint; production build; 1,304 route capabilities across 964 crawl routes
with zero failures; 13 governed visual contracts and 78 reviewed Linux/Windows
responsive hashes; 21/21 exact-host workflow/accessibility browser tests; 4/4
immutable visual tests; and production preflight. The read-only release-v56 database plan
has 56 ordered, idempotent, non-destructive steps. Release v56 adds central
encrypted TOTP, one-time MFA login challenges, one-way recovery codes, and the
complete login/invitation/settings workflow without creating module-local
identity authority.

The final visual portability repair self-hosts pinned Inter and Open Sans
variable-font packages in the Next.js build. OperatorOS and the module shells
no longer depend on Google Fonts, a CDN, or host-installed Arial, Segoe UI,
Inter, or Open Sans files. All 39 Linux and 39 Windows references were
regenerated through the readiness-gated production supervisor, visually
reviewed, bound to exact approval hashes, and then passed again on both
platforms with snapshot updates disabled at the unchanged 0.5% threshold.
This closes the GitHub-runner font-substitution failure without suppressing a
layout change or weakening accessibility checks. The disposable visual
identity now keeps its unique credential while assigning a fixed tenant
display label before capture, so random glyph widths cannot change mobile
header wrapping. Global-logout reauthentication also continues in a fresh
browser page after server revocation, preventing the signed-in shell's own
redirect from racing the deliberate module deep-link check.

Both prior GitHub Desktop stashes were audited before removal. Of the 57
source paths in the substantive stash, 37 were byte-identical to this
candidate, 12 merged to no additional change, and the remaining eight carried
superseded v55, route, parity, or signing-container state that would regress
the current v56 candidate. The other stash contained only caches, Playwright
last-run metadata, and a disposable test certificate/private key. No useful
source remained exclusively in a stash.

No waiver approval is required. FaultlineLab's former 501 blocked rows were
source-to-executable-evidence mappings, not HTTP 500 failures; current
FaultlineLab parity is 246 native plus 311 shared with zero blocked, while all
56 compiled cases complete action, server scoring, reload, and restart
persistence tests. OutCall uses the explicitly authorized current
reconstruction but stays `coming_soon` until provider activation is separately
accepted.

Release status is **SOURCE/LOCAL PASS; PRODUCTION HOLD**. GitHub CI evidence is
reported from the final committed revision; fresh Replit publish, pre-apply
backup, production v56 apply, exact deployed release identity, DNS/exact-host
authenticated acceptance, live provider acceptance, monitoring, and rollback
proof remain human/production gates. A green source or CI gate does not
authorize publishing or production mutation.

## Current Phase 36 source/local overlay - RELEASE BLOCKED (2026-08-13)

Ninjamation Phase 36 is source/local implemented at cumulative additive
database release v45. Its compiler-derived ledger is 189/189 active or
shared-equivalent: 111 native, 78 shared-equivalent, zero waiver, and zero
blocker. Focused domain/database tests pass 7/7, static/deep-link/release
contracts pass, typecheck/build pass, clean/idempotent v45 passes, and the
compiled exact-host private/public browser gate passes.

This is not a production promotion. Live GitHub/OpenAI provider acceptance,
production source reconciliation, backup/apply, deployed restart and
exact-host/mobile acceptance, rollback rehearsal, merge, and deployment remain
owner gates. The historical records below remain provenance and do not
override this overlay.

## Current Phase 35 source/local overlay - RELEASE BLOCKED (2026-08-13)

CallCommand Phase 35 is source/local implemented at cumulative additive
database release v44. Its exact ledger is 589/589 active or shared-equivalent
with zero waiver or blocker. Root lint/typecheck, production build, restored
42/42 live-call gate, focused 66/66 regression, disposable PostgreSQL 5/5,
clean/idempotent v44, parity/report 8/8, and compiled local browser 1/1 pass.

This is not a production promotion. The cross-product API aggregate still has
unrelated existing Ninja Pool/TradeFlowKit static-contract failures, although
all Phase 35 tests pass. Production backup/apply, configured real-provider
acceptance, deployed exact-host/mobile verification, source reconciliation,
restart, restore/rollback, merge, and deployment remain owner gates. The
historical records below remain provenance and do not override this overlay.

## Current Phase 33 source/local overlay - RELEASE BLOCKED (2026-08-12)

StudyForge Phase 33 is source/local implemented at cumulative additive database
release v42. Its exact ledger is 317/317 active or shared-equivalent with zero
waiver or blocker. Typecheck, focused 8/8 plus PostgreSQL 7/7, combined
StudyForge 29/29, integration 28/28, clean/reapplied v42, production build, and
compiled local exact-host 2/2 pass.

This is not a production promotion. The broad API aggregate remains non-green
because of existing unrelated cross-product failures. Production backup/apply,
live shared-AI configuration,
deployed exact-host/mobile acceptance, data reconciliation, restore/rollback,
commit/merge, and deployment are owner gates. The historical release records
below remain provenance and do not override this current overlay.

## Current Phase 32 source/local overlay - RELEASE BLOCKED (2026-08-12)

SnapProofOS Phase 32 is source/local implemented at additive database release
v41. Its exact ledger is 341/341 active or shared-equivalent with no waiver or
blocker. Root lint/typecheck, focused 10/10 contracts, disposable PostgreSQL
4/4 workflow, release apply/reapply, and exact-ledger 6/6 pass.

This is not a promotable production identity. The existing global `next/font`
configuration received HTTP 404 for Google-hosted WOFF2 files during the final
web production build, so compiled browser acceptance remains open. Production
backup/apply, scanner readiness, source-data reconciliation, exact-host
desktop/tablet/mobile acceptance, rollback, commit/merge, and deployment are
owner gates. The historical Phase 20 release record below is retained as prior
evidence and does not override this current overlay.

## Current source/local gate - Phase 20 PASS (2026-08-03)

`SOURCE/LOCAL PUBLIC-LAUNCH FUNCTIONAL CLOSURE: PASS`. Release v33 remains the
current ordered database contract. The executable matrix contains 20
`ACTIVE_AND_PROVEN`, 10 `HUMAN_PHASE18`, zero `FIX_NOW`, and zero unclassified
capabilities across all 13 active modules. The fresh PostgreSQL API aggregate
passes 924/0/6 across 930 tests, the compiled exact-host browser aggregate
passes 14/14 plus the independent TradeFlowKit vertical 1/1, and the final
production artifact reports build `312564d8a52867e6caba7eab`, healthy API,
ready=true, web 200, and release v33/33 before a clean shutdown.

This working tree is source/local evidence, not a frozen deployable identity:
the release metadata still identifies base commit
`a146be3b2d00ff1dfe3c365f4d8a9f6ae2f40b57` because the corrections are
uncommitted. No production environment or provider was touched. The owner may
begin the Phase 18 guide only after freezing the exact merged commit; deployment,
public 48/48, authenticated 3/3, controlled real-provider acceptance, rollback,
and the final PROMOTE/HOLD/ROLLBACK decision remain human gates. Exact evidence
is in `docs/PHASE20_PUBLIC_LAUNCH_FUNCTIONAL_CLOSURE.md` and
`docs/PHASE20_CONTINUATION.json`.

- Evidence date: 2026-08-03
- Current reviewed base: `a146be3b2d00ff1dfe3c365f4d8a9f6ae2f40b57`
- Current source candidate: `codex/phase20-public-launch-closure-final2`; final deployment identity pending commit/merge
- Phase 0 base: `a4598f6ae3dcc16896a48b05962f9a0002071363`
- Phase 1 implementation commit: `50d3b616ed2af8f50c983d29e161baf3c943130f`
- Phase 1 closure commit: `c3e55f7`
- Platform and module source/local gate: **PASS; live-provider and deployed gates remain open**
- Current public release: **commit `c29cbca376525885e906d10b3e2df647cfce6b00`, build `25095fde5c3543a8aa748634`; current unpinned verifier PASS 48/48**
- Current-main public comparison: **EXPECTED PRE-DEPLOY FAIL 46/48; only health/readiness release-commit identity differs**
- First deployment attempt: **FAILED BEFORE BUILD** — deployment
  `0a34bd3d-5706-434d-87ee-fffd3bf6e5cd`, build
  `c49eeb9c-5f0b-40b3-9f31-44813446124c`
- Overall release decision: **SOURCE/LOCAL PASS — human Phase 18 deployment/provider acceptance required before promotion**

## Current Phase 18 OutCall and release v33 source gate

OutCall is active in source as the thirteenth product module and reaches
source/local consolidation state 4. Its approved verified-self workflow now
includes Twilio Verify, encrypted profiles and exact triggers,
immediate/scheduled controlled calls, DTMF acknowledgment, private SMS
triggering, signed and replay-safe callbacks, persistent rate limits, history,
cancellation, private export, and password-confirmed deletion. Recording,
emergency claims, location, duress, trusted-contact escalation, arbitrary
destinations, impersonation, bulk/autonomous dialing, and child authority
remain excluded.

The ordered database contract is v33/33. Clean apply and idempotent reapply
pass on disposable PostgreSQL 16. Focused release/registry/provider contracts
pass 45/45, focused OutCall/provider/contracts pass 44/44, OutCall PostgreSQL
workflows pass 5/5, and the Phase 20 final aggregate passes 924 with 0 failures
and 6 intentional HTTP-only skips across 930 tests. API/runner/web typechecks
and the production build pass. The compiled readiness-gated supervisor reports
healthy API, ready=true, web 200, configured SSO/worker checks, and database
release v33/33 on base identity `a146be3`, build
`312564d8a52867e6caba7eab`.

The complete local canonical-host matrix now passes 14/14 in 3.2 minutes. It
proves one-login launch across all thirteen active modules, host-only Secure
sessions, no URL/storage credential leakage, deep links, sibling/local/global
logout, tenant denial for TechDeck and OutCall, and the major persistent module
workflows. TradeFlowKit's independent customer/job/task archive/restore vertical
passes 1/1 in 35.2 seconds. The gate retains 28 distinct screenshots across
390/768/1440 widths for every module's first useful and completed workflow,
plus catalog and entitlement denial.

No deployed candidate, Replit secret, Twilio request, production database,
public callback, or traffic was touched. The release remains closed pending the
final merged commit/build identity, provider-managed backup and production v33
apply, reviewed provider configuration, controlled verified-self provider
acceptance, deployed exact-host 3/3 acceptance, public health/readiness and
48/48 verification, and rollback evidence.

## Historical additive release v30 source gate

The current Phase 16A increment does not change the v30 database contract. It
adds bounded format-v1 QuickBooks IIF/invoice CSV and Xero
customer/invoice/payment CSV projections over existing tenant-scoped data.
Format/static contracts pass 2/2, the isolated PostgreSQL auth/tenant/payment
workflow passes 1/1, adjacent revenue/document/saved-view regressions pass
11/11, and the executable ledger advances from 115 active/45 gaps to 120
active/40 gaps with zero unclassified items. Workspace typecheck, production
build, readiness-gated compiled runtime at v30/30, and the updated exact-host
download workflow pass locally; the browser gate is 1/1 in 21.5 seconds and
inspects a real authenticated QuickBooks IIF download. These are working-tree
artifacts, not a deployable release identity; a fresh build from the final
committed revision remains required. Prior v30 evidence below remains
historical baseline evidence.

The current source candidate advances the ordered database contract from v29
to additive v30. Step 30 creates bounded, tenant/user-owned
`tradeflowkit_saved_views` persistence; it does not change the semantics of
the already released v29 steps. Clean apply and idempotent reapply pass on
disposable PostgreSQL 16, and compiled health/readiness report v30/30 with
`tradeflowkit_saved_views` as the last step.

The saved-view increment passes 14/14 focused release/static contracts, 1/1
dedicated PostgreSQL workflow, 10/10 adjacent TradeFlowKit PostgreSQL tests,
workspace typecheck, production build, core preflight, compiled supervisor
health/readiness, and exact-host Chrome 1/1 in 22.0 seconds. The executable
TradeFlowKit ledger moves from 111 active/49 gaps to 115 active/45 gaps with
zero unclassified items.

This is source/local evidence only. Working-tree artifacts are validation, not
a deployable identity; release handoff requires a fresh build from the final
committed revision. That revision must still be deployed and pass the
authenticated live workflow, provider, data-cutover, and rollback gates
before promotion.

## Historical Phase 17 production truth

The public release now exposes the complete Phase 17 release identity,
database release v29/29, and planned/disabled OutCall boundary. The current
read-only verifier passes 48/48 without an expected-commit pin.

The Phase 17 candidate adds a deployment timestamp and explicit database
release v29/29 to the non-secret release identity, makes readiness fail closed
on that complete identity, lets the public verifier pin the intended Git
commit, and reconciles the documented planned OutCall boundary across the
catalog, registry, database seed, verifier, and browser gate.

Current main is newer than that deployed identity. Pinning
`OPERATOROS_EXPECTED_RELEASE_COMMIT` to
`92ca0db4a2609f4090104909bbd558e5b3b3157f` returns 46/48; the only failures
are the health and readiness release-commit comparisons. All public routes,
SSO redirect contracts, callbacks, and disabled-OutCall assertions still pass.

Promotion of current main remains blocked on deployment plus the exact
authenticated/provider/data/rollback workflow in
`docs/PHASE17_PRODUCTION_RELEASE_RUNBOOK.md`; an unpinned public 48/48 result
does not prove that the current source revision is deployed.

## TorqueShed local acceptance follow-up

TorqueShed's previously open local Phase 7-9 gate is closed on
`codex/torqueshed-state4-acceptance`: 23/23 focused contracts, 3/3 isolated
PostgreSQL workflows, release v29 plan/apply/reapply, typecheck, production
build/core preflight/supervisor health, and the dedicated exact-host browser
workflow 1/1 in 13.8 seconds pass. This promotes only the source/local module
state from 3 to 4. The overall release remains closed because the exact
revision is not deployed and live provider, authenticated deployed workflow,
second-tenant, backup/rollback, data reconciliation, and cutover gates remain
open.

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

Historical Phase 12B reconstructed OutCall from the owner's recovered prompt
set as a distinct verified-self personal-safety exit-assistance workload. Its
original 839-test, 29-step-release, and local browser evidence is superseded by
the Phase 18 source/local state-4 implementation and v33 evidence above.

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
| Database release plan | PASS | Current source declares release v33 with 33 ordered, additive, secret-free steps; clean apply and idempotent reapply passed on disposable PostgreSQL 16. Phase 17 v29 remains a historical deployed baseline. |
| Backup/restore rehearsal | PASS LOCALLY | Phase 4 custom dump restored in 3.570 s; source/restore matched 94 public tables, 17 TradeFlowKit, 9 Directory, and 10 shared-service tables |
| Restored data/constraints | PASS | Restored release apply passed; dump SHA-256 `d2df4f815a5fa678b058e1b602211fd7d8c878b32811807ed96e175130568c82` |
| Production build | PASS | Current source produced SDK, API, runner gateway, and Next 15.5.22 artifacts after API/runner/web typechecks; 20 page entries generated. The pre-commit identity is validation-only and must be rebuilt at the final commit. |
| Compiled production supervisor | PASS LOCALLY | The current v33 artifacts started through the readiness-gated supervisor; API/web health, database, SSO, worker and release identity passed on merged-main commit `d96c698`, build `50b91a50eab34dcbef995bbe` |
| Local canonical-host health | PASS | HTTPS apex `/healthz` returned 200 with `operatoros-api`; API `/readyz` returned 200 with database/auth/SSO/registry configured |
| Local public URL diagnostics | PASS | TechDeck diagnostic resolved forwarded exact host, HTTPS origin, module role, and host-only cookie mode |
| Production-host SSO browser gate | PASS LOCALLY | Canonical-host matrix PASS 12/12 across all 13 active modules with persistent workflows, denial, deep links and local/global logout; compiled first-screen PASS 2/2 adds OutCall's first durable workflow. Deployed authenticated 3/3 remains open. |
| Focused Phase 1 tests | PASS | 11/11 database-release, preflight, and supervisor contract tests |
| Focused Phase 2 tests | PASS | 9/9 directory, UI, deep-link, and release-contract tests |
| Focused Phase 3 tests | PASS | 24/24 shared-service, route, retention, lease-recovery, release, webhook, and provider-state tests on a clean database |
| Focused Phase 4 tests | PASS | 29/29 TradeFlowKit-focused tests in the final aggregate run, including concurrent conversion, Directory association, restart, provider, migration, and financial reconciliation |
| Focused Phase 5 tests | PASS | TechDeck 16/16 plus new Phase 5 5/5 for managed operations, network/IPAM, lifecycle, documentation/evidence/report/time workflow, roles, isolation, importer, release, and deep links |
| Focused Phase 10A tests | PASS | 11/11 domain/import/static/deep-link/release contracts plus fresh 5/5 shell/deep-link contracts and 1/1 isolated PostgreSQL workflow for persistence, tenant isolation, viewer denial, scoring, assignments, immutability and restart |
| Focused Phase 11B tests | PASS | 17/17 domain/import/database/release/deep-link contracts including private attachment controls, review authority, tenant isolation, viewer denial, append-only custody, report/export, retention and canonical routes |
| Focused Phase 11E tests | PASS | Static domain/import/release/deep-link contracts plus 5/5 tenant/authorization/consent/disposition/persistence and 4/4 signed callback/inbound/replay/recording-privacy PostgreSQL workflows |
| Focused Phase 12A tests | PASS | Domain/import/static/release/deep-link contracts plus 4/4 tenant/authorization/version/analysis/approval/download/AI-usage PostgreSQL workflows |
| Focused Phase 18 OutCall tests | PASS | 44/44 provider/registry/release/preflight/SSO contracts plus 5/5 PostgreSQL verified-self, scheduling, signed callback, DTMF, private SMS, export/deletion, authorization, and isolation workflows |
| Phase 2 browser workflow | PASS LOCALLY | 1/1 on compiled artifacts; CRUD, refresh persistence, same organization ID across three modules, and no script-readable auth |
| Full API regression | PASS | Fresh disposable-schema aggregate on the Phase 18 working candidate passed 914, failed 0, and skipped 6 intentional HTTP-only cases across 920 tests |
| Replit automatic npm preinstall | PASS LOCALLY AFTER DEFECT FIX | npm dry-run exits 0; pnpm-only scoped overrides remain in `pnpm-workspace.yaml` |
| Public read-only runtime verifier | PUBLIC PASS; CURRENT MAIN NOT DEPLOYED | Public release `c29cbca`, build `25095fde5c3543a8aa748634`, passes 48/48 unpinned. Pinning current main `92ca0db` returns 46/48 solely on health/readiness release-commit mismatch |
| Formatting/lint | NOT DEFINED | Repository has no supported formatting or lint script; no pass is claimed |

## Public deployment result

The last verified 2026-07-31 public release was healthy and identified as
`c29cbca376525885e906d10b3e2df647cfce6b00`, build
`25095fde5c3543a8aa748634`. The current verifier passes 48/48 unpinned,
including complete release/database identity for that older deployed revision.

The public deployment was not re-verified during the v30 source work. No
deployment or acceptance of the current candidate is claimed.

## Human deployment closure

1. Deploy the exact reviewed current-main revision through the `.replit`
   autoscale build/run path.
2. Validate the real production secrets with
   `corepack pnpm preflight:production -- --core`; enable provider profiles only
   when the corresponding feature is meant to be live.
3. Confirm the provider-managed backup is current before the database release.
4. Set `OPERATOROS_EXPECTED_RELEASE_COMMIT` to `git rev-parse origin/main`, run
   `corepack pnpm verify:production`, and require 48/48 including the exact
   complete identity on health and readiness.
5. Provision the two synthetic accounts and six `E2E_PHASE17_*` values listed
   in `docs/PHASE18_HUMAN_COMPLETION_GUIDE.md`, then run
   `corepack pnpm --dir apps/web test:e2e:phase17-deployed` and require 3/3.
6. Record the deployed commit and results in this file and
   `docs/auth/VALIDATION_MATRIX.md`.

Until those steps pass, promotion and all production-ready labels remain
blocked. Later phase source branches may proceed only under the owner's explicit
direction and must preserve this gate.
