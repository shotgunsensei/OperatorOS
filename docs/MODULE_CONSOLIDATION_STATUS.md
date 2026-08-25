# OperatorOS module consolidation status

Baseline refreshed: 2026-08-08

## Current ecosystem identity and hierarchy overlay — 2026-08-22

OperatorOS remains the parent authority. TradeFlowKit, PulseDesk, and TechDeck
are now the only applications classified and presented as **Main Modules**;
every other registered product is a **Companion Application**, without changing
its legitimate free, add-on, or provider-gated commercial state. The stable
internal slugs `ninja-pool-hall`, `ninja-launch-kit`, and `ninjamation` remain
in place for database, API, entitlement, Stripe, and migration compatibility,
while their public identities are Operator Pool Hall, Deploy Ops, and Script
Ops at `operatorpoolhall.operatoros.net`, `deployops.operatoros.net`, and
`scriptops.operatoros.net`. Legacy hosts are redirect-only aliases and are not
valid SSO callbacks, logout targets, allowed origins, or newly generated launch
URLs. This presentation and routing refactor does not promote any parity state;
production DNS attachment, publish, deployed SSO/browser acceptance, and
rollback proof remain open.

## Current Replit publish-scan overlay — 2026-08-21

GitHub main's empty Replit marker `9cb875e` (same tree as source-bearing parent
`9f48a03`) did not become production-live: deployment `0a34bd3d` first failed
when provider pnpm recursively self-installed, then build `ddc1c1f3` proved
that recursion was closed but failed at the source `preinstall` because the
security scanner stripped the initially recognized environment signals. Both
attempts stopped before the repository build or release-v55 apply. The
follow-up source hotfix adds an exact pnpm 10.26.1 / Node 24.12.0 / Linux x64
fallback for that stripped provider container, permits only a bounded Replit
provider pnpm 10.26+ major-10 scan path, and preserves the exact
10.34.5 frozen deployment build plus all alternate-lock controls. Focused,
hardening, type, lint, and production-build gates pass locally. Production
continues to identify commit `399f4d2`, build `e15147cfd811c794a780887f`, and
database release v54. No module parity state changes; republish, v55
backup/apply, exact release identity, and deployed acceptance remain open.

## Current release v55 invitation-consent overlay

Every OperatorOS account retains a real default single-owner tenant. Invitation
account creation and existing-account sign-in authenticate the exact recipient
but do not join or select the inviting tenant. The recipient must explicitly
join or decline: join transactionally writes the bounded invited membership and
selects that tenant; decline writes no membership and leaves the current tenant
unchanged. The invitation route now tolerates its expected anonymous identity
`401`, eliminating the first-open navigation loop without weakening protected
app routes. Generic auth paths no longer auto-reconcile invitations by email or
domain. Release v55 is additive and locally verified, including 3/3 optimized
production-build browser cases. The complete API aggregate is 1,175 pass, 15
unrelated worktree failures, and 6 intentional HTTP-only skips; no broad-green
claim is made. This shared-platform correction changes no module parity state.
Production migration, deployment, delivered-email, and
deployed-browser acceptance remain open. This overlay supersedes the v54
invitation behavior described below; v54 deletion and audit-retention decisions
remain in force.

## Current release v54 identity/onboarding overlay

OperatorOS invitation onboarding now remains inside the shared identity and
tenant authority: one-host password creation atomically accepts the exact
invitation, existing-account acceptance is idempotent, and an exact pending
same-business-domain invitation can be recovered during platform account
creation or authentication without introducing domain-wide tenant discovery.
Confirmed tenant and user removal cascades owned platform/module data while
active billing and company-tenant ownership fail closed. Audit events survive
identity purge through release-v54 actor snapshots and nullable live actor
references. Focused disposable-database acceptance passes; the complete API
aggregate remains red on 13 existing module-shell/source-snapshot assertions.
This shared-platform repair changes no module parity state. Production
backup/apply, deployment, authenticated browser acceptance, and rollback are
still required.

## Current Phase 40 certification overlay

Candidate `4c24d818f5108aa0d049241c7ae386ae7787a211` is **not
certified**. The clean-clone/fresh-database root gate passed 11/14 stages but
failed strict parity (2,458 issues), API source integrity (TorqueShed 181 files
versus 165 declared), and static route/control integrity (118 defects). The
current compiler total is 7,396 capabilities with 1,449 required blockers and
zero owner waivers. No module can be promoted to production state 5 from the
local exact-host, build, database, or hardening passes alone. No owner journeys,
live-provider acceptance, production backup, tag, release, deployment, or
cutover were recorded. The Phase 40 report supersedes historical consolidation
claims for release decisions.

## Current Phase 37 CallCommand MSP intake overlay

Release v46 extends the complete Phase 35 CallCommand product with the
owner-specified MSP intake boundary: exact signed Twilio routing; approved-line
organization association; encrypted display-once SupportLink contact
association; A0-A4 assurance/policy; local cases; exactly-once BMS outbox/test
links; technician screen-pop; hash-linked evidence; and responsive
organization/contact/integration/policy/audit/onboarding workflows. OperatorOS
retains identity, tenant, Directory, entitlement, billing, secret, registry,
launch, and audit authority.

Phase 1 is source/local implemented. Focused 14/14, complete CallCommand
80/80, typecheck, production build, and disposable v46 plan/apply/reapply pass.
The broad aggregate was exercised but remains non-green on existing
cross-product contracts. Live Kaseya BMS and Twilio acceptance, production
backup/apply, deployed exact-host/browser evidence, pricing,
reconciliation, rollback, and deployment remain open. Datto read/actions,
cloud reset, and the AD broker remain Phase 2-5 gates and are not advertised as
active. This overlay supersedes the CallCommand summary row below; see ADR-0040,
the MSP intake matrix, and the Phase 37 report.

## Current Phase 33 StudyForge overlay

The generated StudyForge ledger has 317 exact source facets: 192 native and 125
shared-equivalent, with zero blocked or waived. ADR-0037 reopens the earlier
folders/aggregate-set/artifact/countdown/streak/template/limit retirements using
transactional generation, deterministic and validated shared-AI paths,
race-safe OperatorOS usage/entitlements, and real persisted learning sessions,
history and exports. Additive release v42 and local compiled exact-host
acceptance pass. Production backup/apply, provider readiness, reconciliation,
deployed acceptance, and rollback remain open. See
`docs/phase-33/STUDYFORGE-COMPLETE-PRODUCT-REPORT.md`. Other modules' blockers
are unchanged by this overlay.

## Current Phase 32 SnapProofOS overlay

The generated SnapProofOS ledger now has 341 source facets: 240 native and 101
shared-equivalent, with zero blocked or waived. ADR-0036 re-opens the historical
customer/job/cost/template/branding/export/share retirements using additive v41,
secure shared attachments, immutable report snapshots, real PDF/DOCX bytes, and
constrained hashed shares. OperatorOS remains the only parent authority. See
`docs/phase-32/SNAPPROOFOS-COMPLETE-PRODUCT-REPORT.md` for the exact ledger and
local gate evidence. Other modules' blockers remain unchanged by this overlay.

## Current Phase 22 shared-service foundation

Phase 22 adds an additive v34 shared control plane for encrypted provider
references/readiness, notification suppression and attempt evidence, HMAC
webhooks with SSRF protection, schedules, asynchronous exports/signed
retrieval, service identities/API tokens, feature flags, tenant-safe search,
and legacy-reference adapters. A real tenant-admin Shared Services console is
role-gated, tenant-scoped, durable, and audited. Deterministic email, SMS, AI,
storage, webhook, and OAuth adapters report `recorded_not_delivered` and never
claim external success.

The executable adapter contract is generated from all 181 current
`ACTIVE_SHARED_EQUIVALENT` records and requires each mapping to name its source
outcome, compatibility assertion, adapter, and exact behavior test. This
foundation does not change module totals or completion states: all 6,189
required blockers and the Phase 21 route/schema/visual/control failures remain
release-blocking. See `docs/phase-22/SHARED-SERVICE-CONTRACT-REPORT.md`.

## Current Phase 21 executable release truth

The Phase 20 inventory is now compiled against the active repository on every
release run. An active capability must resolve to live hashed implementation
paths and runnable test IDs; routes and database capabilities must also resolve
to discoverable route and schema IDs. Shared equivalents retain the source
outcome and explicit compatibility assertion. Source drift, missing evidence,
required blockers, incomplete waivers, duplicate IDs, stale counts, route or
schema gaps, visual drift, and dead controls all fail the release gate.

Current result: **release blocked** with 6,289 strict parity failures, 74 static
route/control failures, and 40 visual-contract failures. Per-module reports are
generated in JSON, Markdown, and HTML. Historical consolidation prose below is
still useful provenance, but cannot override the executable result. See
`docs/phase-21/EXECUTABLE-RELEASE-GATE-REPORT.md`.

## Current Phase 20 release truth

The current executable baseline is `docs/parity/source-manifest.json` and the
13 ledgers under `docs/parity/modules/`. It records 6,646 source-derived
capabilities: 276 `ACTIVE_NATIVE`, 181 `ACTIVE_SHARED_EQUIVALENT`, 0
`OWNER_WAIVED`, 6,189 `BLOCKED`, and 0 unclassified. Therefore Phase 20 and
module parity are **blocked**, regardless of the historical consolidation-state
language below.

The canonical inventory remains useful implementation history, but descriptions
such as "zero approved parity gaps", "excluded", or "retired" are not current
completion states. The new model requires tested behavioral equivalence or an
exact, owner-approved capability waiver. In particular, 469 former security or
product-boundary facets remain blocked (462 `BLOCKED_REVIEW` plus 7 with
missing claimed source implementation paths), and 113 facets across the three
old ledgers point to source files absent from the pinned imports; FaultlineLab is 4 mapped
runnable cases versus 52 blocked source-runnable cases; TradeFlowKit retains an
open visual-contract mismatch and Phase 17's historical 57-gap evidence;
TorqueShed has unproven native mobile parity; and OutCall has no recovered full
source application.

See `docs/phase-20/PRODUCT-TRUTH-REPORT.md` for exact counts and the
current-to-branch/source reconciliation. The material below is preserved as
historical architecture and verification evidence, not a Phase 20 parity
clearance.

This file is the honest source-of-truth for **source ownership and functional
migration**. A module being registered, entitled, or reachable on an
`operatoros.net` subdomain does not by itself mean that its standalone product
workflows have been migrated into the shared OperatorOS runtime.

## Target architecture

OperatorOS is a modular monorepo and shared Replit runtime:

- OperatorOS owns identity, host-only sessions, tenants, roles, billing,
  entitlements, module launch, and audit.
- Every product has one explicitly registered HTTPS host under
  `operatoros.net`. Host labels normally match the module slug; Ninja Launch
  Kit intentionally uses `ninjalaunchkit.operatoros.net`. These Replit-attached
  subdomains are the production destinations, not an interim migration layer.
  Standalone branded domains are legacy references only. OutCall is active in
  the Phase 18 source candidate; its provider remains fail-closed until the
  reviewed Replit and Twilio configuration is present and deployed acceptance
  passes.
- Module code owns only its product UI, tenant-scoped workflows, module data,
  and operational integrations.
- A module may become a separately deployed workload only when its runtime or
  scaling requirements justify it. It must still consume the same OperatorOS
  SSO and entitlement contract and must not restore local platform billing or
  duplicate account authority.

## Canonical inventory

| Product | Slug | Canonical host | Commercial class | Source project observed | Current OperatorOS functional state |
| --- | --- | --- | --- | --- | --- |
| TradeFlowKit | `tradeflowkit` | `tradeflowkit.operatoros.net` | core | Original baseline `6d0c13df5e324f6aba9cdf2cf14a550d0cf0ca55`; clean restored product evidence `C:\Dev\TradeFlowKit` at `37aa67f1da804fc3ac56f36e50e01362077d7a26` | Source/local state 4 with zero approved parity gaps: the executable ledger classifies all 277 capabilities as 145 active, 58 shared replacements, 43 security retirements, and 31 product-boundary retirements. Existing revenue/field-service workflows plus imports, search, retention, saved views, accounting, safe bulk, lead messaging/operations, admin-controlled privacy/consent-bound public intake, signed source adapters, and provider-gated Stripe Connect business payments are implemented under trusted OperatorOS authority. ADR-0032 keeps customer payments separate from platform billing and requires exact callback, separate signed webhook, account/mode binding, replay safety, and atomic settlement. Release v32 adds the required constrained tables/fields and applies cleanly/idempotently. A guarded v1 core-data apply passes synthetic rehearsal, but real export/production apply, reviewed provider onboarding/payment/refund, deployed browser acceptance, backup/rollback, and cutover remain open, so not state 5 |
| TorqueShed | `torqueshed` | `torqueshed.operatoros.net` | free | Dirty read-only `C:\Dev\TorqueShed-Codex`: local `68da4548f665`, committed reference `508b384b6f66a1eacd3d4cd8d9c5edd4bf47fe75`; immutable snapshot remains `c33ade5...` | Source/local state 4: Phase 7 automotive foundation; Phase 8 server-context safety-ranked Assist and OperatorOS-owned append-only token accounting; Phase 9 persistent Marketplace listings/search/saved/contact/messages/expiry/reports and Community profiles/preferences/follows/blocks/posts/tags/comments/reactions/scanned media/reports/append-only moderation with native UI/deep links. No protection/payment/shipping/reputation claims. Fresh focused, PostgreSQL, release v29, build/runtime/health, and dedicated exact-host browser gates pass locally; deployed provider/data/rollback/cutover gates still block state 5 |
| TechDeck | `techdeck` | `techdeck.operatoros.net` | core | Clean `C:\Dev\Tech-Deck` at `8125f8d89d8d39d60a50c8061a26133a0c917792`; executable source ledger inventories all 382 discovered capabilities with zero unclassified/gaps | Source/local state 4 candidate: Directory-linked clients/sites and tickets/comments/time; typed configuration inventory; network/IPAM topology; lifecycle; versioned documentation/runbooks/backlinks; shared private attachments; evidence metadata; deterministic reports; persisted dashboards; mobile/KB compatibility; and exact configuration/ticket/client/document/evidence/report deep links. The ledger records 91 active, 109 shared replacements, 48 security retirements, and 134 product-boundary retirements. ADR-0012/0013/0014 exclude discovery/device mutation, secret values, remote execution, unsafe intake, recurrence, and business invoicing; deployed workflow/provider/cutover evidence still block state 5 |
| PulseDesk | `pulsedesk` | `pulsedesk.operatoros.net` | core | Clean `C:\Dev\PulseDesk` at `937849471e489ed23db2a263d04160a388402740`; executable source ledger inventories all 309 discovered capabilities with zero unclassified/gaps | Source/local state 4 candidate: PHI-minimized shared-Directory clients/facilities/requesters; departments; operational assets; numbered tickets; queues/teams/assignments; internal notes/requester replies; shared private attachments; time/SLA; vendor, supply and facility coordination; knowledge/tags/saved views/preferences; dashboards, configuration, bulk actions, legacy-compatible deep links, equipment-issue prefill, and exact Directory client detail. The ledger records 91 active, 74 shared replacements, 53 security retirements, and 91 product-boundary retirements. ADR-0015 excludes EHR/clinical records and resolves the TechDeck boundary; deployed workflow and authorized privacy-reviewed cutover evidence still block state 5 |
| FaultlineLab | `faultlinelab` | `faultlinelab.operatoros.net` | free | `C:\Dev\Faultline-Lab` at pinned snapshot `46877aae35565149ccf4f4988dd94627fc6bb92b` | Phase 25 source/local candidate: deterministic `allCases` compiler imports every valid authored standalone/pack definition as a published immutable version; dynamic catalog/search/filter/sort/daily; restart-safe standard/daily/preview/assignment/Chaos attempts; append-only evidence and server scoring; assignments/progress/badges; private scanned proof/author assets; analytics/exports; versioned validate/preview/publish/retire/import/export; dedicated responsive UI/deep links. Zero-exclusion full-catalog action/score/reload passes locally; deployed acceptance and authorized user/session data cutover still block state 5 |
| Operator Pool Hall | `ninja-pool-hall` | `operatorpoolhall.operatoros.net` | free companion | Clean `C:\Dev\Shotgun-ninja-pool-hall` and snapshot at `62439c4018ec551ce2891800351200c8ab2cb9e7` | Phase 30 source/local state-4 candidate: real Canvas Free Shoot, seeded CPU, hot-seat, and authenticated online rooms; deterministic physics/full rules; durable snapshots/events/rate windows; independent server re-simulation; reconnect/expiry; touch/English/audio/performance/PWA; profiles and local results. ADR-0020/0034 exclude ranking/reward/wagering/proof claims and child authority. Production v39 apply, exact-host two-device acceptance, rollback, and deployment still block state 5 |
| BrandForgeOS | `brandforgeos` | `brandforgeos.operatoros.net` | add-on | Pinned clean snapshot `5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e`; 348 tracked/272 retained files; executable Phase 31 ledger inventories 793 facets | Phase 31 source/local state-4 candidate: complete Brand HQ/personas/offers; campaign production/collaboration/landing/calendar/recorded metrics; ten-mode Copy Studio; six guided workflows; global/custom premium-gated templates; twelve shared-provider connections and durable sync history; recommendations/leads/notifications/activity; six white-label report types and asynchronous integrity-hashed exports; atomic OperatorOS credits and platform-admin projection. All 793 facets are 463 native and 330 shared-equivalent with zero blocked/waived. Additive v40 and 6/6 PostgreSQL journey pass locally; production apply, live provider/OAuth, deployed exact-host/mobile/visual acceptance, source-data cutover, backup/restore and rollback still block state 5 |
| SnapProofOS | `snapproofos` | `snapproofos.operatoros.net` | add-on | Clean `C:\Dev\snapproof` and snapshot at `26bded38c13b5b6361d407462c68052b0c30613d` | Phase 11B source/local state-4 candidate: tenant-scoped evidence cases; private note/file capture with signature/MIME validation, shared scan and SHA-256 recheck; member submit/admin review; findings; append-only comments and hash-linked custody; immutable reports; real JSON/CSV exports; retention/legal hold/archive; persisted dashboard and canonical deep links. ADR-0022 excludes child identity/billing, public share/file URLs, fake exports and arbitrary integrations. Clean 24-step release, aggregate 787/787, compiled health/readiness and production-host matrix 6/6 pass locally; deployed acceptance and authorized data reconciliation/cutover still block state 5 |
| StudyForge AI | `studyforge-ai` | `studyforge-ai.operatoros.net` | add-on | Pinned snapshot at `a607a9f34442b1d0f6bfffbf0293609529494825`; 317 exact facets | Phase 33 source/local state-4 candidate: folders and complete transactional study sets; all generated artifacts; deterministic and validated shared-AI paths; flashcard/quiz/plan learning and history; countdown/streak/usage; lifecycle/export and exact routes. ADR-0037 preserves OperatorOS parent authority. Additive v42 and compiled exact-host 2/2 pass; broad API retains 29 unrelated existing failures. Production provider, backup/apply, reconciliation, restore/rollback and deployed acceptance block state 5 |
| Deploy Ops | `ninja-launch-kit` | `deployops.operatoros.net` | add-on companion | Clean `C:\Dev\Ninja-Launch-Kit` and snapshot at `30bd1abc05846926e97bc7b26c5b7d6625e8f161` | Phase 11D source/local state-4 candidate: tenant-scoped launches, phases, milestones, task dependencies, reviewed campaign artifacts, private shared assets, server-computed readiness, OperatorOS-owned AI/idempotency/usage/activity, audited JSON/Markdown/CSV exports, responsive workspace and canonical deep links. ADR-0024 separates launch execution from BrandForgeOS brand/campaign authority and excludes child identity/billing/admin, legacy URL-token SSO and simulated claims. Clean 26-step release, aggregate 816/816, compiled health/readiness and production-host matrix 8/8 pass locally; deployed acceptance and authorized data reconciliation/cutover still block state 5 |
| CallCommand AI | `callcommand-ai` | `callcommand-ai.operatoros.net` | add-on | Clean `C:\Dev\Call-Command-AI` snapshot at `d49434e1d641d62cc141591c7208539a7afbf11e`, complete Phase 35 product ledger, and owner-spec Phase 37 MSP matrix | Phase 35 restores the complete receptionist/telephony/intelligence/flow/switchboard product. Phase 37 adds paid MSP Phase 1 under ADR-0040: signed exact-destination intake; encrypted/HMAC-indexed approved lines and SupportLinks; Directory-backed organization/contact association; A0-A4 policy vocabulary; deterministic redacted issue capture; durable local cases; idempotent BMS outbox/test links; operator screen-pop; hash-linked evidence; provider onboarding/kill switches; and responsive MSP operations/organization/contact/integration/policy/audit/onboarding UI. OperatorOS retains all parent authority and OutCall remains a separate verified-self safety product. Focused Phase 37 14/14, complete CallCommand 80/80, workspace typecheck, production build, and disposable v46 plan/apply/reapply pass locally; the exercised broad aggregate remains non-green on existing cross-product contracts. Release v46 production backup/apply, real Twilio/BMS, deployed browser, monitoring, pricing, reconciliation, rollback and deployment remain open. Datto, Graph reset and AD-broker phases remain disabled pending separate acceptance; state 5 is not claimed. |
| Script Ops | `ninjamation` | `scriptops.operatoros.net` | add-on companion | Replit-synced AutomationPacks source at `C:\Dev\Ninjamation`, application commit `cca75338d04ed35b89f28d614eb51559735aa32f`, catalog commit `ca0e55fd086f6751a43964927166bfa69db012b6`; 263 tracked/184 retained files, 2,855,775 bytes, zero high-confidence secret findings | Phase 12A source/local state-4 candidate: tenant-scoped PC automation script authoring; immutable versions; server static analysis; review submission; tenant-admin approve/reject/retire; approved-current-version-only downloads with immutable audit; shared AI drafts with idempotent usage; responsive workspace and canonical deep links. ADR-0026 forbids OperatorOS/browser script execution and excludes child identity/billing/admin/sync. AutoWorkFlowHub is discontinued and excluded. Clean/idempotent 28-step release, aggregate 836/836, compiled health/readiness, production-host matrix 9/9 and first-screen workflows 2/2 pass locally; deployment and authorized reconciliation/cutover still block state 5 |
| OutCall | `outcall` | `outcall.operatoros.net` | add-on | No canonical source repository recovered; product contract reconstructed from the owner's ten-phase prompt set | Phase 18 source/local state-4 candidate: active exact-host launch; verified-self Twilio Verify; encrypted neutral profiles and profile-bound exact triggers; immediate/scheduled durable calls; controlled voice/DTMF; private SMS ingestion; signed/replay-safe callbacks; persistent rate limits; safe history/cancellation; export and password-confirmed deletion; responsive customer workspace and deep links. Release v33 applies cleanly/idempotently. Recording, emergency/duress/location claims, arbitrary destinations, trusted-contact escalation, bulk/autonomous dialing, impersonation, and child authority/billing remain excluded. Replit/provider configuration and deployed browser/provider/backup/rollback acceptance still block state 5 |

## Current verification boundary

The 2026-07-29 zero-gap rebaseline adds an executable, commit-pinned TechDeck
ledger covering 65 pages, 221 routes, 45 tables, 46 provider/config
references, and 5 background processes. Fresh evidence passes 20/20 focused
non-database tests, 14/14 navigation/static confirmation, 3/3 isolated
PostgreSQL workflows, workspace typecheck, 29-step release plan/apply,
production build/preflight/runtime, HTTP 200 health/readiness, and an
exact-host browser workflow 1/1 in 20.3 seconds. No public deployment,
provider enablement, import apply, or cutover is inferred.

Phase 18 advances OutCall to source/local state 4 and registers 13 active
product modules. Fresh evidence passes 44/44 focused OutCall/provider/contracts,
5/5 PostgreSQL workflows, the 914-pass/6-skip aggregate, the clean and
idempotent 33-step release, workspace typecheck, and production build. The
candidate is not deployed and no Twilio request, public callback, production
database, or traffic was touched. State 5 still requires reviewed Replit
secrets, v33 backup/apply, real verified-self provider acceptance, authenticated
exact-host SSO/denial/logout for all enabled modules, and rollback evidence.

Phase 12A adds the ordered `ninjamation_tables` release step and replaces the
inferred workflow-automation shell with the commit-pinned AutomationPacks
product boundary: reviewed PC automation scripts. Fresh closure evidence
passes domain/import/static contracts, 4/4 PostgreSQL persistence/isolation/
authorization/version/approval/download/AI checks, the clean aggregate
836/836, workspace typecheck, production build/core preflight, clean and
idempotent 28-step release, compiled direct and web-proxied `/healthz` and
`/readyz`, the production-host browser matrix 9/9, and the four-module
first-screen suite 2/2. The Ninjamation browser workflow creates a safe
PowerShell draft, reports a clean static analysis, submits it, approves it
with tenant-admin authority, and records an actual `.ps1` download.
OperatorOS never executes the script. This is local/source evidence; no public
deployment, standalone-data apply, endpoint execution or traffic cutover is
inferred.

The shared source passes the API, runner, and web typechecks and the exact
production build shape with `INTERNAL_API_URL=http://localhost:5001`. The
historical Phase 5 clean-database aggregate passed 696, failed 0, and skipped
6 HTTP-only tests out of 702. The current TechDeck zero-gap evidence supersedes
its older focused counts and is recorded above. These are source and
isolated-database results, not a public deployment claim.

The 2026-07-29 zero-gap rebaseline adds an executable, commit-pinned PulseDesk
ledger covering 23 pages, 183 routes, 50 tables, 45 provider/config
references, and 8 background processes. Fresh evidence passes 42/42 focused
non-database tests, 1/1 isolated PostgreSQL workflow, workspace typecheck,
29-step release plan/apply, production build/preflight/runtime, HTTP 200
health/readiness, and an exact-host browser workflow 1/1 in 17.5 seconds.
No public deployment, provider enablement, import apply, or cutover is inferred.

Phase 6 adds 37/37 focused PulseDesk passes and a final clean-database
aggregate of 706 pass, 0 fail, and 6 HTTP-only skips out of 712 in 1,305,103
ms. Its dry-run importer resolved 34/34 references with zero missing/privacy
findings. These remain source/local results, not a public deployment or data
cutover claim.

The Replit deployment path is Corepack-free. The checked-in build uses `npm
exec` with exact pnpm `10.34.5`, runs the mandatory workspace typecheck, and
builds the API, runner gateway, and Next application. The production supervisor
uses compiled artifacts only: it applies or verifies the current 21-step database
release, starts the compiled API, waits for readiness, and starts compiled
Next. The Phase 6 release adds `pulsedesk_tables` after TechDeck and before
shared services and applied cleanly/idempotently on disposable PostgreSQL 16.
The Phase 7 plan adds `torqueshed_tables` after PulseDesk and before shared
services; Phase 8 extends that same ordered operation with Assist, purchase,
rate/circuit and append-only ledger tables, and Phase 9 adds Marketplace,
Community, report, block, rate and append-only moderation tables. Its apply is unverified because
Docker Desktop does not provide a usable daemon. The historical 19-step Phase 6 and 18-step Phase 5 releases applied
repeatedly without drift.
A PostgreSQL 16 custom-format Phase 4 backup with SHA-256
`d2df4f815a5fa678b058e1b602211fd7d8c878b32811807ed96e175130568c82`
restored into a new disposable database in 3.570 seconds. Source and restore
matched 94 public tables, including all 17 TradeFlowKit, 9 Directory, and 10
shared-service tables; the restored database accepted the full release apply.
This closes the local Phase 6 additive schema gate, but not public deployment
or standalone-data cutover.

The reviewed candidate passes the local production-host SSO matrix 2/2, but it
has not been promoted to the public target. The read-only public production
verification now passes 48/48 against deployed merge `c249a753`, build
`2eb701089a539d9e6da5af80`: API health/readiness and release identity, auth
headers, all 17 diagnostics, root/app plus all 13 enabled authorization
transactions, callbacks, and OutCall fail-closed behavior pass. Per explicit
owner direction, later
source branches may proceed; every promotion and production-ready claim remains
blocked until the cumulative candidate is deployed and the public gate passes
in full.

The current production-host Playwright gate also passes locally against a disposable
PostgreSQL database and HTTPS host-preserving proxy: one central credential
entry establishes the apex session, then all thirteen enabled modules launch
silently with independent host-only sessions, survive reload, keep credentials
out of URLs/storage, and honor global revocation. The fresh Phase 6 2/2 run
completed in 3.9 minutes and passed direct deep-link return, browser Back
without a central-auth loop, sibling-tab PulseDesk SSO, and host-only local
logout. Core deep-link dispatch is explicit for the currently migrated
workflows and returns a module-scoped recovery state for unsupported paths.
This raises confidence in the shared runtime but does not change the honest
workflow-parity labels in the inventory above.

The formerly generic enabled modules now execute native shared-runtime
workflows as well. A 5/5 isolated-PostgreSQL contract proves TorqueShed,
FaultlineLab, BrandForgeOS, and SnapProofOS create, list, update, and soft-delete
tenant records; reject stale writes; isolate a second tenant; and permit module
viewers to read while denying their writes. All thirteen enabled modules now
have an OperatorOS-owned functional surface. OutCall's surface is intentionally
bounded and keeps all live provider operations fail closed.

TradeFlowKit now runs its approved revenue and field-service workflow inside
OperatorOS. Lead conversion creates or reuses shared Directory identities and
a numbered job; first-class tasks enforce dependencies and optimistic
versions; normalized quote/invoice items use integer cents; public quote
decisions and customer documents store only token hashes; invoice conversion,
manual payments, test-provider completion, and outbound messages are
idempotent. The native shell exposes persisted operations metrics, tasks,
settings, CSV exports, loading/empty/error/conflict states, and supported deep
links. Customer payments remain explicitly separate from OperatorOS
subscription/add-on billing authority, and production processing fails closed
until a reviewed centralized adapter is configured.

Phase 16A re-baselines TradeFlowKit against the newer clean restored source
commit instead of treating the Phase 4 snapshot as full-product parity. Its
machine-readable ledger has zero unclassified source items, 145 active
capabilities, and zero explicit gaps. Thirteen persisted increments now cover
Workflow Studio, revenue documents, customer import, full customer/job/task
editing, global search, retention, lead messaging, saved views, accounting
exports, non-destructive safe-bulk actions, internal lead operations, and
bounded tenant/customer-reconciled job plus exact-cent invoice imports, then
controlled public lead intake and Stripe Connect business payments.
Versioned lead settings/templates, the internal capture profile,
transactionally scheduled/manual follow-ups, sanitized adapter validation and
history, and authenticated-admin delivery checks run through trusted tenant
authority and the shared idempotent outbox. Public capture is explicitly
admin-enabled, consent/version bound, rate-limited, replay-safe, and supports
HMAC-signed adapters. Stripe Connect uses short-lived tenant/user-bound OAuth
state, server-priced direct charges, a separate signed webhook, and atomic
settlement while OperatorOS retains platform billing authority. ADR-0031
resolves standalone tasks, autonomous scheduling, legacy communication
providers, and unreviewed lead AI without activating them; ADR-0032 supersedes
ADR-0030 only for the controlled public/provider design. The
version 1 migration path can read a scoped legacy snapshot
and atomically apply bounded core business records to one trusted entitled
tenant with explicit user mappings, exact fingerprints, migration references,
audit, replay safety, and money reconciliation. Only synthetic disposable data
has been applied; no real source export, production data mutation, or cutover
is claimed.

Phase 3 added the shared-infrastructure foundation used by the Phase 4 state 4
candidate: job attachments use private authorized
storage, scan jobs, idempotency, usage/activity, notifications/outbox, and
transaction-bound platform audit. CallCommand and TradeFlowKit provider
callbacks use the shared verified receipt/deduplication/retry ledger.
TradeFlowKit still requires a later import version for restored workflows/
general tasks/contacts, deployed public/payment browser smoke, accounting and
Connect sandbox acceptance, approved real-data cutover, and rollback evidence
before state 5. The current local candidate passes 908/0/6 across 914 API tests
on a fresh disposable database, signed webhook settlement/replay/tamper proof,
zero-gap ledger verification, v32/32 clean/idempotent release, workspace
typecheck, and the 20-page production build. Existing exact-host customer/job/
invoice import acceptance remains 1/1 in 9.6 seconds; the new provider/public
browser acceptance has not run.

TechDeck now runs its approved managed-operations workflows in the shared
runtime. Directory-linked configuration items model infrastructure,
network/IPAM, and lifecycle records with same-tenant topology and optimistic
versions. Documentation/runbooks have draft-review-approve-publish transitions,
immutable revisions, backlinks, private attachments, and safe rendering.
Evidence metadata, checksummed report snapshots, ticket comments, and time are
persisted. Focused tests cover role denial and cross-tenant isolation, and the
native shell exposes real loading/empty/error/conflict states and the supported
deep routes. OperatorOS deliberately exposes no execution route or secret
value store; any future command execution requires a separately reviewed,
signed endpoint-agent trust boundary.

Local logout is also server-revocable now: OperatorOS deny-lists only the
SHA-256 fingerprint of the current host token, rejects copied-token replay,
preserves sibling-host sessions, and prunes expired fingerprints. Global
logout continues to rotate `tokenVersion` for all hosts.

Live route/header probes on 2026-07-14 confirm the attached subdomains still
serve the older release: `api.operatoros.net/healthz` and every module
`/sso?code=probe&state=probe` callback return 404, and legacy redirects still
carry the old cookie/header behavior. The unified Replit release and
authenticated browser matrix therefore remain pending.

## Completion states

Use these states consistently in release notes and validation reports:

1. **Registered** — canonical host, client ID, callback, classification, and
   entitlement key exist.
2. **Source imported** — auditable source is present under
   `apps/modules/<slug>/source`, with generated/runtime artifacts excluded.
3. **Authority conformed** — local login, platform subscription billing, and
   entitlement authority are removed or disabled in favor of OperatorOS.
4. **Workflows migrated** — product UI, APIs, jobs, storage, integrations, and
   deep links run from the OperatorOS-owned workload.
5. **Verified** — build, unit/integration tests, tenant isolation, entitlement
   denial, browser SSO, refresh, local/global logout, and production subdomain
   smoke all pass.

A module is not "fully consolidated" until it reaches state 5. The shared
shell or a copied source snapshot alone is not functional parity.

## Snapshot import policy

The eight additional available product repositories are now imported under
`apps/modules/<slug>/source` through `scripts/import-module-snapshot.ps1`.
Every snapshot records its source remote, exact commit, file/byte totals, and
exclusions in `SOURCE_SNAPSHOT.json`. The importer accepts only clean Git
worktrees and tracked files, scans for high-confidence live credentials, and
excludes environment files, Replit-specific configuration, keys, local data,
dependencies, build/cache output, backups, mockup/design sandboxes, and
unreferenced uploaded assets.

These snapshots are deliberately outside the executable pnpm workspace. Their
Express/Vite/React 19/Drizzle 0.45 servers and generic database migrations must
not be started against the Fastify/Next 14/React 18/Drizzle 0.39 OperatorOS
runtime. Product workflows move through tested, namespaced vertical slices.

## Migration order

1. Close and deploy the shared SSO/host/entitlement foundation.
2. Migrate the three revenue-critical core products one at a time:
   TradeFlowKit, TechDeck, then PulseDesk.
3. Apply and verify the reviewed Ninja Pool Hall Phase 30 and TorqueShed
   state-4 releases before state 5; retain Ninja Pool Hall's ADR-0034 room
   authority and require TorqueShed live-provider/data/rollback gates.
4. Reconcile the already-imported add-on source products against the native
   MVP implementations before choosing each vertical slice.
5. Deploy and accept the Phase 18 OutCall state-4 candidate only after release
   v33 backup/apply, reviewed Replit/Twilio configuration, controlled
   verified-self provider tests, exact-host browser coverage, and rollback
   evidence pass.

For every module, preserve tenant-scoped data and module permissions while
removing duplicate identity, platform billing, and entitlement ownership.
