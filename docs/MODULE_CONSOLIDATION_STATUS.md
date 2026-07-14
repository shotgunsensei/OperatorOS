# OperatorOS module consolidation status

Date: 2026-07-14

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
| TradeFlowKit | `tradeflowkit` | `tradeflowkit.operatoros.net` | core | `C:\Dev\TradeFlowKit` | Source snapshot + OperatorOS adapter shell + tenant-scoped Lead Center and native customer → job → quote → invoice → payment workflow. Totals, controlled transitions, idempotent invoice conversion, manual payment audit, optimistic concurrency, deep links, tenant isolation, and viewer denial are verified; provider messaging/public payment/remaining analytics parity pending |
| TorqueShed | `torqueshed` | `torqueshed.operatoros.net` | free | `C:\Dev\TorqueShed-Codex` exists, but is not currently saved in the Codex project list | Commit-pinned source snapshot + native tenant-scoped diagnostic case board (symptoms/context, testing/repair/proof states, audit, optimistic concurrency); deeper standalone parity pending |
| TechDeck | `techdeck` | `techdeck.operatoros.net` | core | `C:\Dev\Tech-Deck` | Source snapshot + OperatorOS adapter shell + tenant-scoped Ticket Queue, asset-health inventory, derived alerts, and approval-only runbooks. Optimistic concurrency, tenant isolation, viewer/member/admin boundaries, audit redaction, and `/assets`, `/alerts`, `/scripts`, `/network` deep links are verified; signed endpoint-agent execution and remaining MSP parity are pending |
| PulseDesk | `pulsedesk` | `pulsedesk.operatoros.net` | core | `C:\Dev\PulseDesk` | Source snapshot + OperatorOS adapter shell + first functional PHI-minimized tenant-scoped Department Escalation Queue source slice; remaining product workflows pending |
| FaultlineLab | `faultlinelab` | `faultlinelab.operatoros.net` | free | `C:\Dev\Faultline-Lab` | Commit-pinned source snapshot + native tenant-scoped diagnostic lab/evidence workflow with validated state transitions, audit, and optimistic concurrency; deeper challenge parity pending |
| Ninja Pool Hall | `ninja-pool-hall` | `ninja-pool-hall.operatoros.net` | free | `C:\Dev\Shotgun-ninja-pool-hall` | Commit-pinned source snapshot + native tenant/user-scoped Free Shoot slice. Physics remains browser-local; the API stores bounded client-reported summaries with one-active, rate-limit, retention, idempotency, recovery, viewer, and lifecycle controls. Full game parity remains pending |
| BrandForgeOS | `brandforgeos` | `brandforgeos.operatoros.net` | add-on | `C:\Dev\BrandForge-OS` | Commit-pinned source snapshot + native tenant-scoped campaign production board with draft-to-published workflow, audit, viewer denial, and optimistic concurrency; deeper asset generation parity pending |
| SnapProofOS | `snapproofos` | `snapproofos.operatoros.net` | add-on | `C:\Dev\snapproof` | Commit-pinned source snapshot + native tenant-scoped evidence/verification ledger with captured/review/verified states, audit, viewer denial, and optimistic concurrency; upload/integration parity pending |
| StudyForge AI | `studyforge-ai` | `studyforge-ai.operatoros.net` | add-on | `C:\Dev\Study-Forge` | Commit-pinned source snapshot + tenant-gated native flashcard-session MVP; remaining parity migration pending |
| Ninja Launch Kit | `ninja-launch-kit` | `ninjalaunchkit.operatoros.net` | add-on | `C:\Dev\Ninja-Launch-Kit` | Commit-pinned source snapshot + tenant-gated native scaffold MVP; source-product alignment and parity pending |
| CallCommand AI | `callcommand-ai` | `callcommand-ai.operatoros.net` | add-on | `C:\Dev\Call-Command-AI` | Commit-pinned source snapshot + partial tenant-gated telephony MVP; advanced workflow parity pending |
| Ninjamation | `ninjamation` | `ninjamation.operatoros.net` | add-on | No saved Codex project/source path observed | Tenant-gated native MVP shell/API; canonical source decision pending |
| OutCall | `outcall` | `outcall.operatoros.net` | add-on | No saved Codex project/source path observed | Planned/disabled placeholder; not purchasable or launchable |

## Current verification boundary

The shared source passes the workspace typecheck and production build with
`INTERNAL_API_URL=http://localhost:5001`. The complete API regression suite ran
against a clean PostgreSQL database with 653 tests: 647 passed, 0 failed, and 6
live-HTTP checks were explicitly skipped because no Next development server was
running. Focused evidence also includes 15/15 HTTPS redirect-policy tests,
38/38 SSO tests, 14/14 viewer tests, and 12/12 tenant-RBAC tests. These are
source and isolated-database results, not a production deployment claim.

The production-host Playwright gate also passes locally against a disposable
PostgreSQL database and HTTPS host-preserving proxy: one central credential
entry establishes the apex session, then all twelve enabled modules launch
silently with independent host-only sessions, survive reload, keep credentials
out of URLs/storage, and honor global revocation. The 2/2 run completed in
29.6 seconds and also passed direct TechDeck deep-link return, browser Back
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

TradeFlowKit now also runs its defining revenue path inside OperatorOS rather
than stopping at manual leads. A focused 2/2 PostgreSQL flow proves customer
and job creation, integer-cent quote totals, controlled quote acceptance,
idempotent quote-to-invoice conversion, manual customer-payment recording,
linked job status, cross-tenant denial, and viewer write denial. The native web
shell exposes this sequence and `/customers`, `/jobs`, `/quotes`, and
`/invoices` deep links resolve to it. Customer payments remain explicitly
separate from OperatorOS subscription/add-on billing authority.

TechDeck now extends beyond its ticket queue with a tenant-scoped operations
workspace. A focused 2/2 PostgreSQL flow proves asset health/version handling,
derived critical/offline/warning alerts, cross-tenant isolation, viewer write
denial, member runbook drafting, and tenant-admin approval. Runbook activity
records exclude script bodies. OperatorOS deliberately exposes no execution
route; any future command execution requires a separately reviewed, signed
endpoint-agent trust boundary. The native shell includes loading, empty,
error, responsive, and admin-only approval states, and the four imported
asset/alert/script/network paths resolve to the live workspace.

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
3. Extend Ninja Pool Hall beyond its first native Free Shoot slice only after
   production verification; migrate TorqueShed and FaultlineLab after their
   authority/data redesigns.
4. Reconcile the already-imported add-on source products against the native
   MVP implementations before choosing each vertical slice.
5. Locate or create the canonical Ninjamation and OutCall source projects;
   keep OutCall disabled until a real product workload and tests exist.

For every module, preserve tenant-scoped data and module permissions while
removing duplicate identity, platform billing, and entitlement ownership.
