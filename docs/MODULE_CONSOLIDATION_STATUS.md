# OperatorOS module consolidation status

Baseline refreshed: 2026-07-26

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
  is attached/reserved but remains planned and disabled.
- Module code owns only its product UI, tenant-scoped workflows, module data,
  and operational integrations.
- A module may become a separately deployed workload only when its runtime or
  scaling requirements justify it. It must still consume the same OperatorOS
  SSO and entitlement contract and must not restore local platform billing or
  duplicate account authority.

## Canonical inventory

| Product | Slug | Canonical host | Commercial class | Source project observed | Current OperatorOS functional state |
| --- | --- | --- | --- | --- | --- |
| TradeFlowKit | `tradeflowkit` | `tradeflowkit.operatoros.net` | core | `C:\Dev\TradeFlowKit` at `6d0c13df5e324f6aba9cdf2cf14a550d0cf0ca55` | Source/local state 4 candidate: lead conversion into shared Directory customers; numbered jobs and first-class dependent tasks; comments/tags/private attachments/activity; quotes/public decisions; idempotent invoices; partial manual and deterministic test-provider payments; customer portal/documents; shared messaging; settings; real analytics; CSV export; complete local deep links. ADR-0010/0011 resolve projects and excluded authority/unsafe legacy scope; deployed workflow and cutover evidence still block state 5 |
| TorqueShed | `torqueshed` | `torqueshed.operatoros.net` | free | Dirty read-only `C:\Dev\TorqueShed-Codex`: local `68da4548f665`, committed reference `508b384b6f66a1eacd3d4cd8d9c5edd4bf47fe75`; immutable snapshot remains `c33ade5...` | Phase 9 source candidate: Phase 7 automotive foundation; Phase 8 server-context safety-ranked Assist and OperatorOS-owned append-only token accounting; Phase 9 persistent Marketplace listings/search/saved/contact/messages/expiry/reports and Community profiles/preferences/follows/blocks/posts/tags/comments/reactions/scanned media/reports/append-only moderation with native UI/deep links. No protection/payment/shipping/reputation claims. State remains 3 because Docker engine failure blocks clean DB/payment/ledger/scanner/moderation/concurrency/workflow/runtime/browser evidence |
| TechDeck | `techdeck` | `techdeck.operatoros.net` | core | Clean `C:\Dev\Tech-Deck` at `8125f8d89d8d39d60a50c8061a26133a0c917792` | Source/local state 4 candidate: Directory-linked tickets/comments/time; typed configuration inventory; network/IPAM topology; lifecycle; versioned documentation/runbooks/backlinks; shared private attachments; evidence metadata; deterministic reports; persisted dashboards and deep links. ADR-0012/0013/0014 exclude discovery/device mutation, secret values, and remote execution; deployed workflow/provider/cutover evidence still block state 5 |
| PulseDesk | `pulsedesk` | `pulsedesk.operatoros.net` | core | Clean `C:\Dev\PulseDesk` at `937849471e489ed23db2a263d04160a388402740` | Source/local state 4 candidate: PHI-minimized shared-Directory clients/facilities/requesters; departments; operational assets; numbered tickets; queues/teams/assignments; internal notes/requester replies; shared private attachments; time/SLA; vendor, supply and facility coordination; knowledge/tags/saved views/preferences; dashboards, configuration, bulk actions and ticket deep links. ADR-0015 excludes EHR/clinical records and resolves the TechDeck boundary; deployed workflow and authorized privacy-reviewed cutover evidence still block state 5 |
| FaultlineLab | `faultlinelab` | `faultlinelab.operatoros.net` | free | `C:\Dev\Faultline-Lab` at pinned snapshot `46877aae35565149ccf4f4988dd94627fc6bb92b` | Phase 10A source/local state-4 candidate: four hash-pinned runnable cases; immutable versioned authoring/publish; safe challenge projections; standard/daily/preview/assignment/Chaos attempts; append-only evidence; server scoring; assignments/progress/badges; private proof; analytics/exports; dedicated UI/canonical session deep links; dry-run reconciliation excludes 52 planned cards and all child authority. Compiled runtime/health and production-host SSO/workflow pass locally; deployed acceptance and authorized data cutover still block state 5 |
| Ninja Pool Hall | `ninja-pool-hall` | `ninja-pool-hall.operatoros.net` | free | Clean `C:\Dev\Shotgun-ninja-pool-hall` and snapshot at `62439c4018ec551ce2891800351200c8ab2cb9e7` | Phase 10B source/local state-4 candidate: Free Shoot, CPU 8-ball and local hot-seat; exact physics/types/rules/bot/audio promotion; persistent profiles/preferences; structured server-rules match events/results/aggregates; recovery and canonical deep links. Continuous physics remains browser-local and evidence is explicitly client-reported. ADR-0020 excludes unsafe online relay, ranking/reward/proof claims and child authority. Local compiled runtime/health and production-host SSO/gameplay pass; deployed acceptance still blocks state 5 |
| BrandForgeOS | `brandforgeos` | `brandforgeos.operatoros.net` | add-on | Clean `C:\Dev\BrandForge-OS` and snapshot at `5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e` | Phase 11A source/local state-4 candidate: versioned brand kits/personas; campaign, copy and calendar lifecycle; persisted metrics and exports; OperatorOS-owned AI/idempotency/usage/activity; viewer denial, tenant isolation and canonical deep links. ADR-0021 excludes child identity/billing/credits/admin, random analytics, fake integrations and template purchasing. Clean 23-step release, compiled health/readiness and production-host SSO/workflow pass locally; deployed acceptance and authorized data cutover still block state 5 |
| SnapProofOS | `snapproofos` | `snapproofos.operatoros.net` | add-on | Clean `C:\Dev\snapproof` and snapshot at `26bded38c13b5b6361d407462c68052b0c30613d` | Phase 11B source/local state-4 candidate: tenant-scoped evidence cases; private note/file capture with signature/MIME validation, shared scan and SHA-256 recheck; member submit/admin review; findings; append-only comments and hash-linked custody; immutable reports; real JSON/CSV exports; retention/legal hold/archive; persisted dashboard and canonical deep links. ADR-0022 excludes child identity/billing, public share/file URLs, fake exports and arbitrary integrations. Clean 24-step release, aggregate 787/787, compiled health/readiness and production-host matrix 6/6 pass locally; deployed acceptance and authorized data reconciliation/cutover still block state 5 |
| StudyForge AI | `studyforge-ai` | `studyforge-ai.operatoros.net` | add-on | Clean `C:\Dev\Study-Forge` and snapshot at `a607a9f34442b1d0f6bfffbf0293609529494825` | Phase 11C source/local state-4 candidate: tenant-scoped subjects and private note/document sources; source-grounded AI decks, quizzes and plans; editable draft/review/publish lifecycle; server grading; per-user spaced repetition/session completion; shared usage/idempotency/activity; real exports and canonical deep links. ADR-0023 excludes child identity/billing/admin, ungrounded publication and fake analytics. Clean 25-step release, aggregate 801/801, compiled health/readiness and production-host matrix 7/7 pass locally; deployed acceptance and authorized data reconciliation/cutover still block state 5 |
| Ninja Launch Kit | `ninja-launch-kit` | `ninjalaunchkit.operatoros.net` | add-on | `C:\Dev\Ninja-Launch-Kit` | Commit-pinned source snapshot + tenant-gated native scaffold MVP; source-product alignment and parity pending |
| CallCommand AI | `callcommand-ai` | `callcommand-ai.operatoros.net` | add-on | `C:\Dev\Call-Command-AI` | Commit-pinned source snapshot + partial tenant-gated telephony MVP; advanced workflow parity pending |
| Ninjamation | `ninjamation` | `ninjamation.operatoros.net` | add-on | No saved Codex project/source path observed | Tenant-gated native MVP shell/API; canonical source decision pending |
| OutCall | `outcall` | `outcall.operatoros.net` | add-on | No saved Codex project/source path observed | Planned/disabled placeholder; not purchasable or launchable |

## Current verification boundary

Phase 11C adds the ordered `studyforge_tables` release step and a dedicated
workspace backed only by tenant-scoped PostgreSQL, shared private attachments,
shared AI usage/idempotency and activity. Fresh closure evidence passes 14/14
focused contracts, the clean aggregate 801/801, workspace typecheck,
production build/preflight, clean and idempotent 25-step release, compiled
`/healthz` and `/readyz`, and the complete production-host browser matrix 7/7.
The matrix proves all twelve silent launches plus StudyForge private source
capture, source-grounded generation, editing, review/publish, server grading,
spaced repetition, plan completion, export, mobile navigation, return,
deep-link refresh, global logout, reauthentication and persistence. This is
local/source evidence; no public deployment or data cutover is inferred.

The shared source passes the API, runner, and web typechecks and the exact
production build shape with `INTERNAL_API_URL=http://localhost:5001`.
TechDeck's focused suite passed 16/16 and the new Phase 5 subset passed 5/5.
The first complete Phase 5 API run reported 702 total, 695 passed, one stale
static-navigation assertion failed, and 6 HTTP-only skips. The assertion was
updated after the old TechDeck placeholder navigation became live and its
focused rerun passed 8/8. A second stale contract expecting pnpm's obsolete
package-level build policy was corrected to validate workspace `allowBuilds`
and passed 2/2. The final clean-database aggregate passed 696, failed 0, and
skipped 6 out of 702 in 616,919 ms. These are source and isolated-database
results, not a public deployment claim.

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
verification currently passes 32/47 checks: API readiness, all 17 module
diagnostics, all 12 enabled callback routes, and OutCall fail-closed behavior
pass; apex `/healthz` and anonymous host-only SSO transaction-cookie checks
still reflect the older deployed release. Per explicit owner direction, later
source branches may proceed; every promotion and production-ready claim remains
blocked until the cumulative candidate is deployed and the public gate passes
in full.

The production-host Playwright gate also passes locally against a disposable
PostgreSQL database and HTTPS host-preserving proxy: one central credential
entry establishes the apex session, then all twelve enabled modules launch
silently with independent host-only sessions, survive reload, keep credentials
out of URLs/storage, and honor global revocation. The fresh Phase 6 2/2 run
completed in 3.9 minutes and passed direct deep-link return, browser Back
without a central-auth loop, sibling-tab PulseDesk SSO, and host-only local
logout. Core deep-link dispatch is explicit for the currently migrated
workflows and returns a module-scoped recovery state for unsupported paths.
This raises confidence in the shared runtime but does not change the honest
workflow-parity labels in the inventory above.

The four formerly generic enabled modules now execute native shared-runtime
workflows as well. A 5/5 isolated-PostgreSQL contract proves TorqueShed,
FaultlineLab, BrandForgeOS, and SnapProofOS create, list, update, and soft-delete
tenant records; reject stale writes; isolate a second tenant; and permit module
viewers to read while denying their writes. Together with the eight existing
shells, all twelve enabled modules now have an OperatorOS-owned functional
surface. OutCall remains the deliberate planned/disabled exception.

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

Phase 3 added the shared-infrastructure foundation used by the Phase 4 state 4
candidate: job attachments use private authorized
storage, scan jobs, idempotency, usage/activity, notifications/outbox, and
transaction-bound platform audit. CallCommand's signed Twilio status callback
uses the shared verified receipt/deduplication/retry ledger. TradeFlowKit still
requires deployed workflow/public-document smoke and approved migration
cutover evidence before state 5.

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
5. Locate or create the canonical Ninjamation and OutCall source projects;
   keep OutCall disabled until a real product workload and tests exist.

For every module, preserve tenant-scoped data and module permissions while
removing duplicate identity, platform billing, and entitlement ownership.
