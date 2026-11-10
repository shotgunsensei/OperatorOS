# Secondary OperatorOS module ledger, 2026-11-10

## Verdict and evidence boundary

Frozen source reviewed: ed1ab8dcf75db4ce0832006ca19b6ff0b3d4b3ea. Registry (`ecosystem.registry.json`) actually contains 14 active modules. Eleven are reviewed below; TechDeck, TradeFlowKit and PulseDesk have a separate primary-app review. Active means registered, not production accepted. No catalog/parity promotion is justified by this review.

This is a source-backed workflow/security/usability review, not rendered visual acceptance or production-shaped end-to-end proof. No new screenshots, browser, provider, PostgreSQL, migration, production, GitHub or held-folder access was performed for the ledger. Prior November 9 reports describe their own 321 DB-free/static/native and 83 Chromium checks, not fresh tests of every row here. The prior StudyForge replay binding and SnapProof offline ownership fixes are present and are not re-reported as unresolved defects.

Shared control evidence: `apps/api/src/lib/tenant-auth.ts:339-389` resolves current session/tenant/module entitlement and records effective access before write guards reject viewers. A route using `requireTenantModuleAccess` alone is not evidence of missing tenant authentication: that helper establishes it. Active API registration is `apps/api/src/routes/module-shell-routes.ts`. Actual UI routes are the module `*RouteShell` / `*Route.contract` files, not imported `apps/modules/*/source` snapshots. All source paths below are relative to this checkout; UI names live in `apps/web/src/components/module-shells`, route/helper names in `apps/api/src/routes` or `apps/api/src/lib`.

## Eleven-module parity ledger

### TorqueShed / torqueshed — integrated source; deployment unverified
- Goal and path: garage vehicle -> diagnostic -> repair/work log -> saved vehicle history; `/garage/vehicles/new`, `/diagnostics/new`, dashboard and repair views in `TorqueShedWorkspace.tsx`. Marketplace inquiries are not payment settlement.
- Authority/persistence: `torqueshed-routes.ts:31-48,160-192` uses tenant/module/write guards plus manager-or-owner predicates. DB records under the tenant are real source persistence; AI Assist/credit/payment and native app are separate provider/device dependencies.
- States: `TorqueShedWorkspace.tsx:168-218,257-270,396,438` preserves partial-load failures, read-only message, retry and live loading status. Cancellation/refund/credit outcomes must follow server status, not an optimistic purchase message.
- Risks/acceptance: verify latest selection wins and owner-private results across account/tenant changes; keyboard diagnostics and narrow/mobile forms require rendered inspection. Existing `torqueshed-*` domain/DB/credit tests and `torqueshed-phase49-routes.spec.ts` are test sources, not newly executed. Accept saved work after restart plus real AI/credit settlement only under separate authorization.

### SnapProofOS / snapproofos — integrated source; deployment unverified
- Goal/path: jobs -> evidence/findings/costs -> review/report -> approved generated PDF/share. `SnapProofFieldWorkspace.tsx` and `SnapProofRoute.contract.ts` expose field work; approved PDF can return to its originating TradeFlow job through explicit provenance, not arbitrary cross-app IDs.
- Authority/persistence: `snapproofos-phase32-routes.ts:30-32,187-197` tenant/module/write/admin and tenant-qualified job/customer joins; expected capture identity is a consistency check, not authority. Durable reports/captures/shares depend on storage and scan contracts.
- States: loading/error/retry, held legacy/other-account captures, immutable ownership and identity recheck exist (`SnapProofFieldWorkspace.tsx:162-280,295-320`). Failed/uncertain upload retains bytes and replay key. Legacy captures are not silently adopted.
- Risks/acceptance: preserve API/UI version compatibility, test mobile offline->reconnect plus scanning and explicit approved sharing. Keyboard capture and dense report layouts need pixels. Existing `snapproof` domain/route/DB and offline component tests establish historical local coverage only. No native-device or customer-share acceptance here.

### StudyForge AI / studyforge-ai — integrated source with selection-lifetime defect
- Goal/path: sources/notes -> `/sets/:id` -> flashcards/quiz -> saved sessions/progress/export. `StudyForgeRouteShell.tsx:18-19`, `StudyForgeCompleteWorkspace.tsx`.
- Authority/persistence: `studyforge-phase33-routes.ts:25-27,184-198` enforces tenant/module/write/admin plus personal study-set ownership. Prior quiz/card replay-intent binding is included. DB-backed cards/quizzes/history exist; deterministic generation and configured AI must be distinguished.
- States: first-load error + Try again, loading, read-only notice and selected-set Close exist (`StudyForgeCompleteWorkspace.tsx:73-120`). Fresh extracted-handler reproduction shows older set A resolving after B overwrites B, and a read resolving after dismissal repopulates selection. This is a client consistency defect, not a demonstrated authorization bypass.
- Risks/acceptance: add request/scope fencing for open/dismiss; verify stale success AND error, route changes, account/tenant changes and repeated actions. Review keyboard focus and reduced-motion behavior of unconditional smooth scrolling with pixels. Existing phase33, replay-binding and learning tests do not certify this UI race. Real DB concurrency/provider/deployed study outcome remains open.

### CallCommand AI / callcommand-ai — integrated source; live operation gated
- Goal/path: `/setup`, `/numbers`, `/agents`, `/workflows` -> consented call -> `/calls` transcript/analysis -> deliberately reviewed follow-up. `CallCommandRoute.contract.ts:41-52`, Commercial/MSP workspaces.
- Authority/persistence: commercial reads/writes/admin guards (`callcommand-commercial-routes.ts:58-60`), tenant SQL and encrypted provider-secret references. Signed telephony callbacks, resource reservations and consent are separate server controls. MSP A0 is unverified/manual association; SupportLink is not an authentication credential.
- States: detail effect has cancellation guard; operations distinguish saved mutation from refresh failure (`CallCommandCommercialWorkspace.tsx:159-186`); managed-number charges require acknowledgment and provider failures are not success. Prior six lifetime fixes and bounded recovery are retained.
- Risks/acceptance: actual voice interruption/transfer/consent/STOP, signed callbacks and support mailbox/PSA receipt remain unverified. Queued email is not ticket delivery. Review call-history small-screen navigation/focus with screenshots. Existing commercial, realtime, restart, first-contact, MSP and SupportLink suites are source evidence; prepared DB journeys are not newly run.

### BrandForgeOS / brandforgeos — integrated authoring; live connector transport absent
- Goal/path: `/brands` -> persona/campaign -> approved content/calendar -> deliberate exports, or reviewed Deploy Ops package. `BrandForgeRouteShell.tsx`, `BrandForgeWorkspace.tsx`.
- Authority/persistence: phase31 module/write/admin guards and tenant-qualified brand/campaign/report lookups (`brandforgeos-phase31-routes.ts:61-68,131-149`). Stored authoring assets/generations exist. `brandforgeos-connector-policy.ts:14-65` explicitly returns production adapter unavailable; deterministic test success has `externalDelivery:false`.
- States: load/mutation errors and role=alert; production read effect has a cancellation guard (`BrandForgeWorkspace.tsx:138-210,242-251,322,733+`). Connector-unavailable is honest and must remain so.
- Risks/acceptance: missing transport is engineering, not just keys. Agree exact provider/recipient/event/security contract before implementing. Review generation previews/export feedback on mobile and keyboard; no visual claim. Existing connector-policy/domain/phase31 and creative component tests need exact-candidate reruns. No social publishing or ad purchase implied.

### Deploy Ops / ninja-launch-kit — integrated preparation, not deployment
- Goal/path: brief -> preview -> saved campaign package -> revise/duplicate/export. `NinjaLaunchKitCompleteWorkspace.tsx`, RouteShell. Branding does not mean website deployment, DNS, ads or campaign publication.
- Authority/persistence: `ninja-launch-kit-phase34-routes.ts:44-46,174-192` tenant/module/write/admin and personal brand/kit ownership with explicit shared-review policy. Saved package/revision records; provider generation and export acceptance separate.
- States: loading/error/invalid-deep-link, read-only and shared-review restrictions (`NinjaLaunchKitCompleteWorkspace.tsx:208-255,298-377`). Optional `workspace().catch(() => null)` at 214 merits verification that unavailable context is not represented as successful empty analytics; not confirmed as a defect here.
- Risks/acceptance: verify owner/non-owner shared review, provider failure/retry and exact exported package. Rendering of long briefs/revisions/export controls requires screenshots. Existing phase34 domain/static/DB and creative browser tests are not fresh proof here.

### FaultlineLab / faultlinelab — integrated training; false-success reads confirmed
- Goal/path: `/challenges` -> `/sessions/:id` investigation -> server-scored submission -> `/runs` and evidence. Authoring/assignments are separate restricted paths (`FaultlineLabRoute.contract.ts:55-64`). Simulated terminal commands never execute on the host.
- Authority/persistence: `faultlinelab-routes.ts:52-79,181` tenant/module/write/admin and owner/manager rules; versioned cases, attempts, evidence and progress persist. Good provider-independent pilot, but deployed acceptance still required.
- States/defect: main loading/error and partial task results exist. Analytics and members failures are swallowed as null/empty (`FaultlineLabWorkspace.tsx:190-191`); author/session attachment failures become empty attachments (`209,247`). Extracted live source expression reproduces this false-success condition. Failed reads must be visibly unavailable with read-only retry, preserving other successful panels.
- Risks/acceptance: repair with stale-request/scope fencing, keyboard-readable panel error and truthful empty state. Run failures/recovery plus late success/error after switching record/account/tenant. Existing `faultlinelab-domain`, `workflow`, `full-catalog`, guided-authoring and phase50 routes test sources exist; this review alone does not accept rendered training or deployed authorization.

### Script Ops / ninjamation — integrated library/review; no remote execution
- Goal/path: `/library` or `/generate` -> `/review` approved immutable revision -> integrity-checked download; explicit reviewed revision -> TechDeck draft runbook/evidence. `NinjamationRouteShell.tsx:77-119`, `NinjamationShell.tsx`.
- Authority/persistence: phase36 module/write/admin guards, tenant-bound script lookup, sync actor and current authority (`ninjamation-phase36-routes.ts:50-70,95-135`). DB revision/provenance and fixed-repository sync exist. Download is not endpoint execution.
- States: loading, list/search errors, unavailable clipboard and download errors are visible (`NinjamationShell.tsx:289-380`). Review/reject/cancel remains human workflow, not automatic execution.
- Risks/acceptance: accept current-authority sync and immutable checksum downloads with real repository/persistence only when permitted. Verify code viewers/download and reviewer controls at keyboard/mobile widths. Existing legacy-download-integrity, sync-current-authority, viewer-gating and phase36 tests are relevant, not freshly rerun here. Standalone ScriptForge remains a separate integration question.

### OutCall / outcall — integrated private self-call preparation; live activation gated
- Goal/path: `/contacts` verified destination -> `/schedules` request/cancel -> `/calls` outcome; private trigger/reminder configuration. Not emergency assistance or general outbound marketing.
- Authority/persistence: `outcall-routes.ts:42-62,140-152` current module/write grant, trusted tenant/user and verified phone ownership; provider adapter and reservation policy gate live work. Schedules/history/privacy state is DB-backed source.
- States: explicit load retry, older-history error, pending request keeps same identity and distinguishes rejected from uncertain outcomes (`OutCallWorkspace.tsx:70-101,115-121,273-296`). Read-only explanation covers verify/call/cancel/export/delete.
- Risks/acceptance: actual verified-self delivery, STOP, uncertain provider submission and cancel-before-submission require controlled live proof; never retry as a fresh request. Review confirmation accessibility/mobile schedule input with pixels. Provider/resource/phase50 tests exist; no calls or provider activation here.

### Operator Pool Hall / ninja-pool-hall — integrated game; deployed multiplayer unverified
- Goal/path: `/practice`, `/cpu`, `/local`, `/online` -> completed match -> `/history`/profile. `NinjaPoolHallRouteShell.tsx:77-132` and Online/Practice/Match components.
- Authority/persistence: `ninja-pool-online-routes.ts:40-71` module/write and host/guest seat checks; DB room/events/rate limits persist, socket map is transient fan-out, not all persistence. Socket authority/reconnect is independently implemented.
- States: loading and host/recovery failure; cancelled effect ignores disposed host/recover replies; invalid guest shot restores saved state (`NinjaPoolHallOnline.tsx:169-235`). Existing host-entry semantics must be tested for repeated navigation rather than assuming a room POST is harmless.
- Risks/acceptance: real two-player reconnect, revocation, latency, touch aiming and keyboard equivalents remain open. No ranking certification. Existing socket-authority, rules/physics, match/practice/recovery and online-DB tests support targeted acceptance but were not rerun here.

### FieldNode / fieldnode — protected gateway implemented; visible management intentionally unavailable
- Goal/path: free app -> Manage my FieldNodes -> approved ownership pairing -> actual device access. `FieldNodeShell.tsx` currently renders 'Remote management is not connected yet' and local-console guidance, not a fabricated device list.
- Authority/persistence: gateway routes validate exact host/origin, CSRF for mutations, central identity and fixed configured upstream (`fieldnode-management-gateway-routes.ts:40-118`). Streaming checks session expiry/identity fingerprint; hardware pairing/device grants/local MFA are distinct requirements. Free access is not device ownership.
- States: honest unavailable status and working introduction/My Apps navigation. Remote gateway has explicit unconfigured/identity/origin failures. Need actual configured portal and pairing to establish end-to-end outcome.
- Risks/acceptance: actual devices, streams, serial, MFA recovery and revoked access require separate authorized hardware acceptance. Screenreader status/links and mobile layout need rendered proof. Existing free-module, identity-contract, managed-surface and gateway tests are source evidence only.

## Priorities and boundaries

1. FaultlineLab truthful recoverable read failures, then StudyForge selection lifetime. Both are client reliability fixes, not evidence of server-auth bypass.
2. Pilot a provider-independent Faultline investigation or deterministic StudyForge learning outcome through deployed identity/persistence once release gates are authorized.
3. BrandForge transport needs actual implementation/contract. CallCommand, OutCall, FieldNode and AI/payment integrations need controlled acceptance, not activation by this review.
4. Keep standalone HearthRelay identity/data/storage boundaries separate. It is not one of the fourteen registry modules. OfficeExit/VendorTrust are independent-tool entries; no held VendorTrust or canonical C:\Dev reads here. Lunch Break is a separate public hub, not another tenant module.

Fresh source reproduction: `node evidence/secondary-module-audit-nov10/reproduce.cjs`, final exit 0; `SOURCE_REPRODUCTION.json` records StudyForge stale A/B/dismiss and Faultline failed attachment -> empty. First attempt failed because extracted TypeScript syntax was not erased; final harness removes only those type annotations. This is not a React/browser test and has no visual or authenticated acceptance value. No source changes were made for this ledger; follow-on fixes will have their own receipt.

## Accepted local follow-on

The frozen-source findings above remain the review baseline. FaultlineLab now has a separately verified local recovery repair described in [FAULTLINE_READ_RECOVERY.md](FAULTLINE_READ_RECOVERY.md). StudyForge selection lifetime remains open. No other module is promoted by this repair.
