# OperatorOS module audit and bounded repairs

Date: 2026-11-09. Source baseline: `8b8f974891f201335ac7f2d51f1a4c4533a328cf`.
Repair branch: `codex/module-audit-nov09`. The frozen integration remains unchanged.

## Verdict

All fourteen catalog modules have identifiable customer purposes and active
implementation. Most are substantially more complete than a launcher shell.
That does not establish deployed, provider-connected or commercially accepted
functionality. The reviewed source expects schema 68; the separately checked
public deployment remains on `5e4615a0`, whose code advertises required release
67. Health's release version is compiled metadata, not a measured database
migration version. The actual production migration state remains unverified.

The useful next step is to release and accept a complete customer workflow,
not add more module names. Retain imported source snapshots and historical
evidence until parity and retention decisions are explicit. Do not delete a
module merely because its external integration is gated.

## Current product ledger

| Product | Customer outcome present in source | Remaining acceptance or engineering |
| --- | --- | --- |
| TradeFlowKit | Shared customer, job, quote, invoice and recorded-payment workflow with transactions, versions and tenant checks. | The later isolated [RevenueFlow repair](TRADEFLOW_REVENUE_RECORDS.md) adds exact older-record retrieval and bounded searchable pages for its lists/create/edit choices and recurring-customer selection; other bounded recent collections remain. Real PostgreSQL checks are prepared/typechecked only. Accept a real lead-to-cash workflow, restart persistence and separately configured payment providers. |
| TechDeck | Tickets, configuration records, evidence, reviewed runbooks, service portal, resolution knowledge and scoped automation tokens. | Module-bound token revocation is repaired in this branch. Accept ticket-to-evidence-to-reviewed-resolution workflow and revoked-source access on the deployed target. Runbooks are not remote execution. |
| PulseDesk | Healthcare operational requests, departments, facilities, assets, vendors, supplies, SLA events and role-filtered internal activity. | Accept mailbox/reconnect/dedup with approved non-patient test content. Not an EHR or a compliance certification. Package declarations alone do not prove mailbox runtime readiness. |
| TorqueShed | Vehicle history, diagnosis, repair/work logs, journals, community and marketplace inquiries. | Prove owner-private diagnostic/repair outcomes, live AI/credit settlement and actual native-device acceptance separately. Marketplace settlement remains off-platform. |
| FaultlineLab | Versioned troubleshooting cases, server-scored investigation/submission and persistent progress; catalog declares 56 cases. | Strong provider-independent pilot. Accept deployed start, investigate, submit, reload and trainer/non-owner boundaries. Simulated commands are not host execution; no certification claim. |
| BrandForgeOS | Brands, personas, campaigns, approved copy, calendars, metrics, templates, generation and deliberate exports. | Production connector transport is missing engineering, not merely missing keys. Choose provider/event/receiver contract, then implement and accept delivery with idempotency and fencing. |
| SnapProofOS | Field jobs, customer evidence, findings, costs, review, immutable report snapshots, exports and controlled shares. | Offline ownership and POST identity consistency are repaired locally. Deploy the API and capture UI together; legacy unbound captures need manual recovery. Accept storage/scanning, mobile reconnect and approved customer handoff on the target deployment. |
| StudyForge AI | Persisted study packs, summaries, cards, quizzes, practice/history, countdowns, quotas and exports. | Reject same idempotency key reused for another quiz/set or answer intent. Accept configured AI separately; deterministic generation is useful source functionality. Tutor labeling does not prove group workflows. |
| Deploy Ops | Brief-to-launch-kit preparation, templates, visual-production briefs, saved brands, revisions, duplication and export. | Accept provider and owner/non-owner export workflows. This does not deploy a site, purchase ads, change DNS or publish campaigns. |
| CallCommand AI | Receptionist preparation, managed numbers, consent, calls/transcripts, transfers, bounded realtime recovery, MSP SupportLink/manual intake and queued email work. | Controlled live voice, interruption, transfer, mailbox receipt and PSA/BMS association remain separate. Three recent PostgreSQL journeys are prepared but unrun. A local case or queued email is not a delivered ticket. |
| Script Ops | Reviewed script library, immutable versions, approval, integrity-checked downloads, AI drafts and fixed-repository catalog sync. | Accept real sync/provenance/download behavior. No endpoint, server or browser script execution is implied. |
| OutCall | Verified-self call preparation, profiles, triggers, scheduling/cancellation, history, privacy and signed callbacks. | Active catalog entry, but live provider needs explicit enablement and approved resource policy. Accept verified-self calling, STOP, uncertain outcomes and cancellation. Not emergency assistance. |
| FieldNode | Free hardware/application entry and fixed-upstream protected management gateway with central identity, local MFA and explicit device grants. | Complete/accept portal binding, ownership pairing, recoverable MFA configuration and actual devices/streams/serial. An active free entry is not connected-appliance proof. |
| Operator Pool Hall | Practice, CPU/hot-seat, persistent results and protected online rooms/reconnect. | Accept deployed two-user reconnect, authorization, latency and mobile gameplay. Recorded results are not independently certified rankings. |

### Evidence and authority

Catalog: `ecosystem.registry.json`; module guards:
`apps/api/src/lib/tenant-auth.ts`; active registrations:
`apps/api/src/routes/module-shell-routes.ts`.

Core paths: `TradeFlowKitRevenueFlow.tsx`, `techdeck-literal-routes.ts`,
`techdeck-routes.ts`, `pulsedesk-service-desk-routes.ts`,
`torqueshed-routes.ts`, and `faultlinelab-routes.ts`.
Companion paths: `brandforgeos-phase31-routes.ts`,
`brandforgeos-connector-policy.ts`, `snapproofos-phase32-routes.ts`,
`studyforge-phase33-routes.ts`, `ninja-launch-kit-phase34-routes.ts`,
`callcommand-commercial-routes.ts`, `callcommand-msp-routes.ts`,
`ninjamation-phase36-routes.ts`, `outcall-routes.ts`, `outcall-provider.ts`,
`fieldnode-management-gateway.ts`, and `ninja-pool-online-routes.ts`.
Route files are under `apps/api/src/routes`; helper files are under
`apps/api/src/lib`; module UI is under `apps/web/src/components/module-shells`.

The JSON ledgers in `docs/parity/modules` are source-inventory classifications.
They do not certify a deployment or a provider. Several older human parity
matrices still display superseded blocked counts, online exclusions or
`coming_soon` language. Read their dated history with this current overlay,
the active registry, actual routes and specific acceptance evidence.

## Repair 1: TechDeck API-token ownership

The TechDeck list/create paths restricted service identities to TechDeck, but
revocation originally checked only the tenant and token ID. A module-scoped
administrator who knew another same-tenant token ID could revoke it.

The shared helper now accepts a module restriction, and TechDeck supplies its
server-resolved module ID. A correlated `EXISTS` checks service-identity ID,
tenant and module in the same atomic mutation. Missing/foreign/already-revoked
results retain the same 404 behavior. The platform administrator route retains
its existing tenant-wide authority. No schema, permissions, secrets or
production tokens were changed by this repair.

Fresh local verification, using existing installed assets with inherited
credentials removed and all network blocked:

- `node ..\evidence\module-audit-nov09\check-techdeck.cjs unit techdeck-unit-final`:
  12 passed, 0 failed, 0 skipped across the new five-case regression plus
  attachment-rescan and shared-platform UI contract suites.
- `node ..\evidence\module-audit-nov09\check-techdeck.cjs types techdeck-types-final`:
  complete API source, new DB-free regression and prepared PostgreSQL route
  regression typecheck passed.
- `node ..\evidence\module-audit-nov09\check-techdeck.cjs lint techdeck-lint-v2`:
  changed helper, route and both regression files passed zero-warning lint.
- `node ..\evidence\module-audit-nov09\techdeck-token-sql-proof.cjs`:
  exact generated SQL against disposable in-memory SQLite reproduced four
  baseline failures and passes all eight candidate cases, including other
  modules, platform tokens, foreign tenants and mismatched identity tenants.
- Independent read-only review found no blocking correctness issue.

SQLite and generated-SQL tests are not PostgreSQL, full authenticated HTTP,
concurrency or deployed acceptance. No production database was accessed.
The additional real-database regression in `techdeck-literal-product.test.ts`
uses a module session to check own, platform, other-module and foreign-tenant
tokens, but was **typechecked, not run**. Its existing schema guard requires a
disposable database before test setup or cleanup.

## Repair 2: SnapProof offline capture ownership

The previous browser queue was shared across accounts and tenants without an
ownership binding. Reconnection could send another account's saved capture with
the current session. A fresh identity GET alone cannot close the race in which
the cookie changes in another tab immediately before the upload POST.

Each new capture now retains the immutable user and tenant from before file
reading. Listing and flushing select only that scope. Other-account and legacy
unbound rows stay saved and hidden behind a generic held-captures notice, never
adopted by the current account. Storage failures preserve the current form/file.
Same-page flushes share one operation; a fresh final queue read keeps captures
added mid-flush visible for their next retry. Failed or uncertain uploads retain
the original bytes, scope and replay key.

The sole tracked production file-upload consumer now sends
`expectedCaptureIdentity` from the saved scope. `/jobs/:id/files` requires this
consistency assertion and compares it with the POST's trusted user/tenant before
byte decoding, job lookup or replay. The assertion grants no authority. Missing
or malformed assertions return 400; mismatches return a generic 409 without
writes. Existing replay rows must also belong to the current trusted actor.
The notes route and the existing viewer/tenant/module guards are unchanged.

Fresh final checks in `evidence/module-audit-nov09`, outside this source tree:

- `snapproof-server-api-final-receipt.json`: 50/50 DB-free tests, zero skipped,
  covering the actual route with synthetic auth/SQL boundaries, pure validation,
  exact route placement and existing static contracts.
- `snapproof-server-browser-final-receipt.json`: 15/15 Chromium tests using
  actual IndexedDB, queue and component code. Includes same-tenant account
  changes, tenant changes, legacy retention, overlapping flushes, file-reader
  identity changes, failed storage, uncertain outcomes, a cookie change between
  identity GET and POST, and a capture added mid-flush.
- The same API tests against frozen original upload-route bytes produce eight
  expected failures, with 42 passing and zero skipped. Neither source checkout
  was changed for that negative proof.
- `snapproof-api-types-final-receipt.json` and
  `snapproof-web-types-server-final-receipt.json`: all API/web source and the
  changed respective tests typecheck. The updated PostgreSQL suite is
  **typechecked, not run**.
- `snapproof-api-lint-final-receipt.json` and
  `snapproof-web-lint-server-final-receipt.json`: scoped zero-warning lint passes.
- Independent review confirms correct route placement, replay ownership,
  retained bytes and fresh remaining counts. No blocking issue remains in this
  bounded review.

These tests reuse existing October 27 installed assets with credentials removed
and networking blocked. Browser requests and identity boundaries are synthetic.
The API harness reads existing package paths for CJS fixture resolution; it does
not install, link or materialize dependencies. TypeScript 5.6.3, ESLint 10.8.1,
Next 15.5.25, React 18.3.1 and Playwright 1.61.1 are examples of the retained test
assets, not proof of a complete current frozen-lockfile installation. No live
session, provider, PostgreSQL, production build or deployed acceptance follows.

Rollout must keep API and capture UI on the same version. Stale clients will
receive 400 and need a workspace reload; their earlier unbound queued captures
remain held for manual recovery, not silently relabeled or deleted. Existing
capture contents must be preserved before any recovery procedure. This branch
does not provide an automatic legacy-ownership migration.

## Adjacent products and repository scope

The following bounded review used their retained source candidates, not an
assumption that every repository in the account was active or deeply audited.
The historical inventory lists 54 repositories and 20 review rows. Repository
names or an unarchived flag are not evidence of a working product.

| Product / reviewed source | Useful current scope | Concrete remaining work |
| --- | --- | --- |
| OfficeExit 2026 `71754f0c`; separate Replit history `f53bc3ec` | Windows Office lifecycle assessment, migration planning, Publisher archiving, customer portal, organization-bound records and signed desktop entitlements. | Central activation is deliberately closed. Review existing provider/mode/prices, signing trust, approved immutable artifacts, recovery and actual Windows/Publisher/RMM acceptance. Preserve both histories. |
| VendorTrust365 | Catalog evidence describes Windows Microsoft 365 permission review/reporting. | Independent security/native acceptance is outstanding; this audit did not inspect the independent repository. Do not upgrade historical inert checks to production proof. |
| ScriptForge `61bac6c8` | Public PowerShell catalog, review/scanning, official/community separation; protected content fails closed. | Central SSO adapter remains a placeholder. Decide shared Script Ops entitlement versus distinct companion authority, then implement subject/tenant/grant binding and delivery. System status must not convert failed review/upload reads into successful zero counts. |
| PlayPack Pilot `6f0236ca` | Local PWA-to-Android preparation, configuration, signing instructions, templates, checklists and exports. | Current API only mounts health/public diagnostics; schema has no models and Pro gating is browser state. Decide local tool versus tenant SaaS. Label the local Pro preview beside its action; do not present it as paid server authority. |
| Controversy Archive `1c8a174b` | PostgreSQL topic catalog and stored research dossiers; public reads never initiate paid generation. | Enabled editor generation needs quantitative spend allowance, deadline, concurrency/retry and uncertain-outcome policy. Row locks/cache alone do not guarantee exactly-once provider spend. Paginate metadata queries instead of loading all topic bodies. |
| HearthRelay `d778e6dc` | Independent family administrative coordination with real database/export/vault composition, Supabase identity, private storage, encryption and queues. | Actual error-monitor and telemetry exporter transports are absent. Select receiver/protocol/auth/signals/alert contract, implement transports and prove delivery/outage/shutdown behavior. Endpoint variables alone cannot complete this. |
| Lunch Break in OperatorOS | Public five-game destination hub, separate from tenant/SSO/payment authority. | Existing destination observations date to October 21; current website/device/game health needs verification. Pool Hall separately requires OperatorOS sign-in. |
| Dispatch Sentinel `27104c7a` | MSP ticket classification, component selection, approvals and controlled execution design. | Default composition uses mock BMS/Datto adapters and volatile repositories. TCP database reachability is not authenticated schema/durability proof. Wire production adapters/persistence and distinguish liveness from true readiness before approved dry-run acceptance. |

OfficeExit and VendorTrust are the **only two independent-tool catalog
entries**, each USD 99 once per whole tenant, eligible with free or paid base
plans and no bundled renewal/support fee. Real purchase-ledger, owner checks,
OfficeExit mapping/fulfillment and private artifact-delivery code exists, but
default `CLOSED_TOOL_COMMERCE` keeps checkout and delivery closed. This is not
an absence of implementation and is not authorization to activate sales.

Exact integrated references: `packages/sdk/src/tool-modules.ts`,
`apps/api/src/lib/tool-commerce.ts`, `apps/api/src/routes/tool-module-routes.ts`,
`apps/web/src/components/IndependentToolsCatalog.tsx` and
`packages/modules/lunch-break.ts`. Adjacent source references include
ScriptForge `lib/scripts/auth/operatorOsAuth.ts` and `system-status.ts`,
PlayPack API `src/routes/index.ts` and database `schema/index.ts`, Archive
`routes/topics.ts` and `lib/deepDive.ts`, HearthRelay
`packages/observability/src/index.ts`, and Dispatch `apps/api/src/app.ts`.

## Outstanding release gates

Historical baseline, before dependency remediation: the fresh frozen-source
scan reported 20 high and 1 critical affected paths, covering 18 unresolved
high/critical advisory IDs. At that point the isolated dependency branch had
a plan, not completed fixes. Zero source findings and preserved exception
integrity did not clear that vulnerable graph. This baseline evidence remains
valid history, not the current combined candidate result.

Current local overlay: the integrated runtime at `864e130c98d6a697cb75ac73a9fba9d01ca71876`
passes the unchanged Phase 39 gate with **zero unresolved high/critical** IDs,
two existing tested patch exceptions and two remaining moderate advisories.
No suppression or gate relaxation was added. Canonical installed-graph checks
pass: 62 module DB-free tests, 77 Zod/domain/workspace tests, 46 mailbox tests,
15 Chromium cases, 8 native unit tests, expanded API/web test types, root
types/lint and the full production build. Both prepared PostgreSQL suites are
typechecked, not executed. See the [dependency remediation report](../../security/DEPENDENCY_REMEDIATION_2026-11-09.md)
for exact commits, package changes, receipts, remaining moderate/peer risks
and offline native export limits. This clears the local dependency/build
blocker, not the database, deployed identity or live-provider acceptance gates.

Source publication, the production backup/recovery decision, schema 68 apply
and verify, Replit deployment identity, authenticated tenant/role tests and
provider acceptance remain separately tracked. Do not mark this audit or
these isolated repairs as a platform release.

The supported database apply reruns the cumulative 68-step manifest. The final
tool-purchase ledger step is additive, but earlier catalog/backfill steps consume
updated inputs, including live OutCall and free/live FieldNode. Inspect the full
plan and pre/post catalog and entitlement effects under an approved maintenance
and write pause, after verified backup and recovery preparation. Do not replace
the supported process with only the final DDL or promise zero-downtime rollout.
The new supervisor verifies required objects before starting the API; it does
not automatically apply the migration.
