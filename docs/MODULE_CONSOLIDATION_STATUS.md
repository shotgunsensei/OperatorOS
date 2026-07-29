# OperatorOS module consolidation status

Baseline refreshed: 2026-07-29

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
  Standalone branded domains are legacy references only. OutCall's subdomain
  is active for the bounded shared-runtime Phase 12B workload.
- Module code owns only its product UI, tenant-scoped workflows, module data,
  and operational integrations.
- A module may become a separately deployed workload only when its runtime or
  scaling requirements justify it. It must still consume the same OperatorOS
  SSO and entitlement contract and must not restore local platform billing or
  duplicate account authority.

## Canonical inventory

| Product | Slug | Canonical host | Commercial class | Source project observed | Current OperatorOS functional state |
| --- | --- | --- | --- | --- | --- |
| TradeFlowKit | `tradeflowkit` | `tradeflowkit.operatoros.net` | core | Original baseline `6d0c13df5e324f6aba9cdf2cf14a550d0cf0ca55`; clean restored product evidence `C:\Dev\TradeFlowKit` at `37aa67f1da804fc3ac56f36e50e01362077d7a26` | Approved-scope state 4 remains, but full Phase 16 parity is open: the zero-unclassified source ledger records 57 explicit gaps. Existing revenue/field-service workflows now include Workflow Studio, governed job transitions, team job-task views, activity, direct invoice creation, versioned quote/invoice draft editing, history-safe archive, idempotent quote-to-job, source-valid high priority, and bounded Directory-reconciled customer CSV import. Destructive customer bulk delete/restore is retired by ADR-0011. A read-only snapshot and guarded atomic v1 core-data apply pass synthetic isolated rehearsal; no real export/production cutover occurred and later import versions are required. Deployed acceptance still blocks state 5 |
| TorqueShed | `torqueshed` | `torqueshed.operatoros.net` | free | Dirty read-only `C:\Dev\TorqueShed-Codex`: local `68da4548f665`, committed reference `508b384b6f66a1eacd3d4cd8d9c5edd4bf47fe75`; immutable snapshot remains `c33ade5...` | Phase 9 source candidate: Phase 7 automotive foundation; Phase 8 server-context safety-ranked Assist and OperatorOS-owned append-only token accounting; Phase 9 persistent Marketplace listings/search/saved/contact/messages/expiry/reports and Community profiles/preferences/follows/blocks/posts/tags/comments/reactions/scanned media/reports/append-only moderation with native UI/deep links. No protection/payment/shipping/reputation claims. State remains 3 because Docker engine failure blocks clean DB/payment/ledger/scanner/moderation/concurrency/workflow/runtime/browser evidence |
| TechDeck | `techdeck` | `techdeck.operatoros.net` | core | Clean `C:\Dev\Tech-Deck` at `8125f8d89d8d39d60a50c8061a26133a0c917792`; executable source ledger inventories all 382 discovered capabilities with zero unclassified/gaps | Source/local state 4 candidate: Directory-linked clients/sites and tickets/comments/time; typed configuration inventory; network/IPAM topology; lifecycle; versioned documentation/runbooks/backlinks; shared private attachments; evidence metadata; deterministic reports; persisted dashboards; mobile/KB compatibility; and exact configuration/ticket/client/document/evidence/report deep links. The ledger records 91 active, 109 shared replacements, 48 security retirements, and 134 product-boundary retirements. ADR-0012/0013/0014 exclude discovery/device mutation, secret values, remote execution, unsafe intake, recurrence, and business invoicing; deployed workflow/provider/cutover evidence still block state 5 |
| PulseDesk | `pulsedesk` | `pulsedesk.operatoros.net` | core | Clean `C:\Dev\PulseDesk` at `937849471e489ed23db2a263d04160a388402740`; executable source ledger inventories all 309 discovered capabilities with zero unclassified/gaps | Source/local state 4 candidate: PHI-minimized shared-Directory clients/facilities/requesters; departments; operational assets; numbered tickets; queues/teams/assignments; internal notes/requester replies; shared private attachments; time/SLA; vendor, supply and facility coordination; knowledge/tags/saved views/preferences; dashboards, configuration, bulk actions, legacy-compatible deep links, equipment-issue prefill, and exact Directory client detail. The ledger records 91 active, 74 shared replacements, 53 security retirements, and 91 product-boundary retirements. ADR-0015 excludes EHR/clinical records and resolves the TechDeck boundary; deployed workflow and authorized privacy-reviewed cutover evidence still block state 5 |
| FaultlineLab | `faultlinelab` | `faultlinelab.operatoros.net` | free | `C:\Dev\Faultline-Lab` at pinned snapshot `46877aae35565149ccf4f4988dd94627fc6bb92b` | Phase 10A source/local state-4 candidate: four hash-pinned runnable cases; immutable versioned authoring/publish; safe challenge projections; standard/daily/preview/assignment/Chaos attempts; append-only evidence; server scoring; assignments/progress/badges; private proof; analytics/exports; dedicated UI/canonical session deep links; dry-run reconciliation excludes 52 planned cards and all child authority. Compiled runtime/health and production-host SSO/workflow pass locally; deployed acceptance and authorized data cutover still block state 5 |
| Ninja Pool Hall | `ninja-pool-hall` | `ninja-pool-hall.operatoros.net` | free | Clean `C:\Dev\Shotgun-ninja-pool-hall` and snapshot at `62439c4018ec551ce2891800351200c8ab2cb9e7` | Phase 10B source/local state-4 candidate: Free Shoot, CPU 8-ball and local hot-seat; exact physics/types/rules/bot/audio promotion; persistent profiles/preferences; structured server-rules match events/results/aggregates; recovery and canonical deep links. Continuous physics remains browser-local and evidence is explicitly client-reported. ADR-0020 excludes unsafe online relay, ranking/reward/proof claims and child authority. Local compiled runtime/health and production-host SSO/gameplay pass; deployed acceptance still blocks state 5 |
| BrandForgeOS | `brandforgeos` | `brandforgeos.operatoros.net` | add-on | Clean `C:\Dev\BrandForge-OS` and snapshot at `5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e` | Phase 11A source/local state-4 candidate: versioned brand kits/personas; campaign, copy and calendar lifecycle; persisted metrics and exports; OperatorOS-owned AI/idempotency/usage/activity; viewer denial, tenant isolation and canonical deep links. ADR-0021 excludes child identity/billing/credits/admin, random analytics, fake integrations and template purchasing. Clean 23-step release, compiled health/readiness and production-host SSO/workflow pass locally; deployed acceptance and authorized data cutover still block state 5 |
| SnapProofOS | `snapproofos` | `snapproofos.operatoros.net` | add-on | Clean `C:\Dev\snapproof` and snapshot at `26bded38c13b5b6361d407462c68052b0c30613d` | Phase 11B source/local state-4 candidate: tenant-scoped evidence cases; private note/file capture with signature/MIME validation, shared scan and SHA-256 recheck; member submit/admin review; findings; append-only comments and hash-linked custody; immutable reports; real JSON/CSV exports; retention/legal hold/archive; persisted dashboard and canonical deep links. ADR-0022 excludes child identity/billing, public share/file URLs, fake exports and arbitrary integrations. Clean 24-step release, aggregate 787/787, compiled health/readiness and production-host matrix 6/6 pass locally; deployed acceptance and authorized data reconciliation/cutover still block state 5 |
| StudyForge AI | `studyforge-ai` | `studyforge-ai.operatoros.net` | add-on | Clean `C:\Dev\Study-Forge` and snapshot at `a607a9f34442b1d0f6bfffbf0293609529494825` | Phase 11C source/local state-4 candidate: tenant-scoped subjects and private note/document sources; source-grounded AI decks, quizzes and plans; editable draft/review/publish lifecycle; server grading; per-user spaced repetition/session completion; shared usage/idempotency/activity; real exports and canonical deep links. ADR-0023 excludes child identity/billing/admin, ungrounded publication and fake analytics. Clean 25-step release, aggregate 801/801, compiled health/readiness and production-host matrix 7/7 pass locally; deployed acceptance and authorized data reconciliation/cutover still block state 5 |
| Ninja Launch Kit | `ninja-launch-kit` | `ninjalaunchkit.operatoros.net` | add-on | Clean `C:\Dev\Ninja-Launch-Kit` and snapshot at `30bd1abc05846926e97bc7b26c5b7d6625e8f161` | Phase 11D source/local state-4 candidate: tenant-scoped launches, phases, milestones, task dependencies, reviewed campaign artifacts, private shared assets, server-computed readiness, OperatorOS-owned AI/idempotency/usage/activity, audited JSON/Markdown/CSV exports, responsive workspace and canonical deep links. ADR-0024 separates launch execution from BrandForgeOS brand/campaign authority and excludes child identity/billing/admin, legacy URL-token SSO and simulated claims. Clean 26-step release, aggregate 816/816, compiled health/readiness and production-host matrix 8/8 pass locally; deployed acceptance and authorized data reconciliation/cutover still block state 5 |
| CallCommand AI | `callcommand-ai` | `callcommand-ai.operatoros.net` | add-on | Clean `C:\Dev\Call-Command-AI` and snapshot at `d49434e1d641d62cc141591c7208539a7afbf11e` | Phase 11E source/local state-4 candidate: tenant channels, bounded receptionist/intake profiles, review-only transfer targets, purpose-specific outbound consent, do-not-call suppression, signed inbound DTMF intake, persistent calls/safe events, operator dispositions, reviewed follow-up drafts and record-derived analytics; explicit test-only adapter; fail-closed Twilio provider; replay-safe callbacks; forced-off recording with no SID/URL activation; responsive workspace and canonical deep links. ADR-0025 assigns contacts to Shared Directory and excludes child authority/billing, fake delivery, transfer execution, recording/transcription/AI summaries, incomplete SIP providers and bulk/cold/predictive/autonomous dialing; OutCall remains disabled. Clean 27-step release, aggregate 825/825, compiled health/readiness and production-host matrix 9/9 pass locally; deployed/live-provider acceptance and authorized reconciliation/cutover still block state 5 |
| Ninjamation | `ninjamation` | `ninjamation.operatoros.net` | add-on | Replit-synced AutomationPacks source at `C:\Dev\Ninjamation`, application commit `cca75338d04ed35b89f28d614eb51559735aa32f`, catalog commit `ca0e55fd086f6751a43964927166bfa69db012b6`; 263 tracked/184 retained files, 2,855,775 bytes, zero high-confidence secret findings | Phase 12A source/local state-4 candidate: tenant-scoped PC automation script authoring; immutable versions; server static analysis; review submission; tenant-admin approve/reject/retire; approved-current-version-only downloads with immutable audit; shared AI drafts with idempotent usage; responsive workspace and canonical deep links. ADR-0026 forbids OperatorOS/browser script execution and excludes child identity/billing/admin/sync. AutoWorkFlowHub is discontinued and excluded. Clean/idempotent 28-step release, aggregate 836/836, compiled health/readiness, production-host matrix 9/9 and first-screen workflows 2/2 pass locally; deployment and authorized reconciliation/cutover still block state 5 |
| OutCall | `outcall` | `outcall.operatoros.net` | add-on | No canonical source repository recovered; product contract reconstructed from the owner's ten-phase prompt set | Phase 12B bounded source/local candidate: verified-self personal-safety exit assistance with safety acknowledgment, encrypted verified phone and triggers, neutral profiles, immediate/delayed requests, persistent safe history, shared jobs/activity/usage and canonical deep links. ADR-0027 keeps it distinct from CallCommand and excludes emergency dispatch, impersonation, recording, location, arbitrary destinations and unfinished extensions. Deterministic no-contact browser workflow passes; live Twilio verification/SMS/voice/DTMF/callbacks and deployed acceptance remain gated |

## Current verification boundary

The 2026-07-29 zero-gap rebaseline adds an executable, commit-pinned TechDeck
ledger covering 65 pages, 221 routes, 45 tables, 46 provider/config
references, and 5 background processes. Fresh evidence passes 20/20 focused
non-database tests, 14/14 navigation/static confirmation, 3/3 isolated
PostgreSQL workflows, workspace typecheck, 29-step release plan/apply,
production build/preflight/runtime, HTTP 200 health/readiness, and an
exact-host browser workflow 1/1 in 20.3 seconds. No public deployment,
provider enablement, import apply, or cutover is inferred.

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
machine-readable ledger has zero unclassified source items and 57 explicit
gaps. Workflow templates/stages, governed job transitions, team job-task
views, activity, source-valid high job priority, direct invoices, versioned
quote/invoice draft editing, guarded archive, and idempotent quote-to-job are
now real persisted increments. Bounded customer CSV import validates in the
browser and server, serializes same-tenant imports, reconciles shared Directory
records atomically, suppresses normalized duplicates, and persists safe
activity; legacy bulk delete/restore remains absent by ADR-0011. The new
version 1 migration path can read a scoped legacy snapshot
and atomically apply bounded core business records to one trusted entitled
tenant with explicit user mappings, exact fingerprints, migration references,
audit, replay safety, and money reconciliation. Only synthetic disposable data
has been applied; no real source export, production data mutation, or cutover
is claimed.

Phase 3 added the shared-infrastructure foundation used by the Phase 4 state 4
candidate: job attachments use private authorized
storage, scan jobs, idempotency, usage/activity, notifications/outbox, and
transaction-bound platform audit. CallCommand's signed Twilio status callback
uses the shared verified receipt/deduplication/retry ledger. TradeFlowKit still
requires implementation or explicit disposition of every remaining Phase 16
gap, a later import version for restored workflows/general tasks/contacts,
fresh aggregate/build/browser evidence, deployed workflow/public-document
smoke, and approved real-data cutover evidence before state 5.

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
3. Deploy and verify the reviewed Ninja Pool Hall Phase 10B revision before
   state 5; keep its online relay disabled. TorqueShed still requires clean
   foundation/Assist regression and runtime evidence before promotion.
4. Reconcile the already-imported add-on source products against the native
   MVP implementations before choosing each vertical slice.
5. Resolve OutCall through the Phase 12B distinct/merge/cancel ADR; keep it
   disabled until a deliberate product decision, workload and tests exist.

For every module, preserve tenant-scoped data and module permissions while
removing duplicate identity, platform billing, and entitlement ownership.
