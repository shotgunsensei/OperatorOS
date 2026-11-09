# Practical module add-ons and connected-work recovery

Date: 2026-11-09. Isolated branch: `codex/lateral-workflows-nov09`.
Base: `405740c8846818b349822bdd6061d979033d7466` (tree
`da19ca51cb33c808e65e9307f2dada9bcc60c605`). No existing worktree, held
canonical checkout, dependency manifest, schema or production service changed.
The repository has root `AGENTS.md`; no `.agents/skills` is present.

## Customer outcome and implemented slice

Finish a confirmed cross-app handoff, leave the record, and return to the right
result without creating the work again or carrying another account's receipt.
This improves already implemented flows rather than adding a new generic menu:

- TradeFlowKit job -> SnapProof field job and draft closeout report -> approved
  generated PDF attached back to the originating TradeFlow job.
- TechDeck resolved ticket or PulseDesk resolved operational request -> private
  FaultlineLab training draft, with manager approval and trainer privacy review.
- CallCommand completed analyzed call -> a deliberately selected TradeFlow lead
  or job, TechDeck ticket, or non-clinical PulseDesk operations request.
- Approved Script Ops revision -> non-executing TechDeck draft runbook/evidence.
- Existing BrandForge -> Deploy Ops and TorqueShed -> proof/training flows also
  use the shared component and receive the same continuity protections.

`OutcomeWorkflowAction.tsx` now scopes component state and saved receipts to
actor, tenant, workflow/action, source record/type/kind/link, source version,
idempotency scope, and complete payload intent. Object keys are canonicalized;
array order remains meaningful. Only a SHA-256 scope digest plus the retry key
and run ID are stored. Payload text is not persisted in the receipt. Previous
actor-unbound keys are neither adopted nor deleted.

Revisiting an exact saved scope offers **Check status**, not another creation
confirmation. The result is fetched through the existing GET and must match run
ID, workflow, source record and (when supplied) source module before links appear.
An account/tenant/record/action/version/intent change remounts the action, clears
confirmation and results, and fences late readiness, submission and polling
successes and failures. Explicit tenant/context mismatch blocks the action.
Synchronous repeated confirmations are locally locked. Unknown submission
outcomes retain the same retry key and are described as uncertain, not as
confirmed failure. Review and explicit confirmation remain necessary to retry.

Storage denial retains an in-instance receipt and shows a warning that leaving or refreshing the
page (including component unmount/remount) loses local recovery information. No durable recovery is claimed in that
case. Server semantic deduplication remains authoritative; no new backend lookup,
automatic mutation, provider action or entitlement grant is introduced.
Observed terminal failure may discard a receipt on deliberate review, as before;
the existing backend decides whether an operation can be requeued.

Destination navigation permits canonical `/modules/<slug>/<area>/<id>` paths and
the existing approved-proof `?attachment=<id>` suffix. Protocol-relative paths,
backslashes, encoded/ambiguous paths, arbitrary queries and nested redirects are
rejected. The reviewed adapter emits exactly these path shapes. This is not a
new generic URL sanitizer or a change to central SSO routing.

## Three core applications: actual records and boundaries

| Core app | Existing entry and records | Useful next work; what is not implied |
| --- | --- | --- |
| TradeFlowKit | `TradeFlowKitOperations.tsx` selects a job; `TradeFlowKitRevenueFlow.tsx` handles customers/quotes/invoices. The adapter joins `tradeflowkit_jobs` to same-tenant active `tradeflowkit_customers`, checks the reviewed job version, and creates/reuses qualified SnapProof customer context. | Best immediate add-on is proof of work without re-entry. A generated, approved PDF can come back only through saved provenance. Job/customer IDs in another app are not interchangeable. Recent operations lists remain bounded; this slice does not repair their historical retrieval. |
| TechDeck | `TechDeckTicketQueue.tsx` exposes training for a resolved ticket. `techdeck_tickets`, comments and evidence supply the reviewed source. Script Ops also creates TechDeck documents and checksum evidence. | Best add-ons are reproducible training and reviewed technician instructions. An imported runbook does not execute on endpoints. Attachment retrieval, service tokens and all ticket permissions remain their existing server contracts. |
| PulseDesk | `PulseDeskServiceDeskWorkspace.tsx` exposes resolved operational-request training. `pulsedesk_requests`, messages and ticket events supply source context. CallCommand can create a reviewed operational request. | Best add-ons are administrative reception and staff practice using non-patient content. It is not an EHR, clinical triage tool or compliance certification. Basic identifier masking is not proof that data is safe to publish. |

Shared directory membership and explicit organization/site/contact associations
are legitimate connection points, not evidence that every app entity is the same
record. `customer-workspace-routes.ts` already checks a TradeFlow job against
selected directory context before field-proof submission; `customer-workspace.ts`
and delivery revalidate the association/version. That distinct workspace action
has its own UI; this shared-component change does not claim to replace it or add
PulseDesk/TechDeck directory mappings automatically.

## Every catalog module: useful add-on role and acceptance

The table covers all fourteen actual catalog modules, including the three cores.
"Proposed" means no direct handoff is claimed in the reviewed adapter registry.
Every actual handoff requires the current tenant plus appropriate source and
destination entitlement/access; paid/free catalog placement never bypasses those
guards. Sources are the current registry, active module route files and the
specific adapters below, not just historical module parity totals.

| Module | TechDeck / TradeFlowKit / PulseDesk customer job | Existing capability versus missing connection | Dependencies and acceptance needed |
| --- | --- | --- | --- |
| TechDeck | Main IT service system; adjacent IT issues for TradeFlow businesses and PulseDesk facilities. | Tickets, configuration, evidence and reviewed runbooks exist. Direct automatic conversion of another core app's ticket/job into a TechDeck ticket is not claimed. CallCommand intake and Script Ops runbooks are implemented. | TechDeck membership/grants; accept same-tenant intake and non-owner restrictions. Cross-core conversion needs an explicit owner/source/duplicate contract before implementation. |
| TradeFlowKit | Main lead-to-cash system; commercial follow-up for service providers using TechDeck. Usually separate from PulseDesk's operational requests. | Customers/jobs/quotes/invoices and actual SnapProof round trip exist. No automatic billing of support or clinical operations is implied. | Current source/destination write access, saved version and explicit proof confirmation. Accept approved PDF provenance, archived/wrong-tenant jobs, retry/restart and no accidental invoice/payment. |
| PulseDesk | Main healthcare operations system. Adjacent facilities operations for organizations already using TechDeck; limited fit for generic TradeFlow sales. | Requests, assets, supplies, facilities, vendors and role-filtered activity exist. Reviewed CallCommand intake and Faultline training exist. | Operations-only acknowledgement, module roles and tenant guard. Accept no patient/clinical content, mailbox delivery separately, and private/internal-message boundaries. |
| SnapProofOS | TechDeck: proposed site/installation evidence. TradeFlow: strongest ready add-on for field proof and closeout. PulseDesk: proposed non-clinical facilities/asset evidence. | Field jobs/findings/costs/reports/shares exist. TradeFlow -> field job/report and approved PDF -> originating job are implemented. No TechDeck/PulseDesk evidence adapter is registered. | Both write grants, source version, active records; return requires approved report, generated PDF integrity and original TradeFlow provenance. Accept offline identity, file scanning, manager review and deliberate sharing separately. |
| FaultlineLab | TechDeck: teach resolved incidents. TradeFlow: staff troubleshooting practice, usually standalone. PulseDesk: operational incident practice with privacy review. | Versioned/scored practice and persisted progress exist. Resolved TechDeck/PulseDesk -> private authoring draft is implemented; automatic TradeFlow training is not. | Source and destination manager access, resolved/active source, author/privacy approval. Trainer must author a reviewed revision before publication; accept masking limitations, learner isolation and no automatic publishing. |
| CallCommand AI | TechDeck: reception -> support ticket. TradeFlow: reception -> chosen lead or job. PulseDesk: reception -> non-clinical operational request. | Completed analyzed call adapters to all three exist; lead/job selection is distinct intent. Simulated calls are rejected. SupportLink/manual intake is separately implemented, not proof of external ticket delivery. | Both write grants and actual analyzed non-simulated source; PulseDesk operations-only approval. Accept consent, live voice/interruption/transfer, provider enablement and downstream request receipt separately. |
| Script Ops (`ninjamation`) | TechDeck: strongest fit, approved script documentation. TradeFlow/PulseDesk: only IT administrators maintaining their supporting systems, not everyday operators. | Versioned approved scripts, integrity downloads and catalog sync exist. Approved revision -> TechDeck non-executing runbook/evidence is implemented. No execution or generic core-app automation connector exists. | Both write grants and approved current revision. Accept checksum/provenance, permissions and separate human deployment/execution controls. Never describe a runbook as remote management. |
| StudyForge AI | TechDeck: learn reviewed operating procedures. TradeFlow: staff skills. PulseDesk: non-clinical onboarding. | Packs/cards/quizzes/progress/exports exist. No direct core-record import or competency-to-role grant is registered. Practical near-term use is reviewed, deliberately entered learning material; automated imports remain proposed. | StudyForge access, ownership and generation quota/provider policy. Accept pack provenance, deletion/privacy, scoring/replay and no production secrets/PHI auto-copy. Training completion must not grant operational permission. |
| BrandForgeOS | TechDeck service business marketing; TradeFlow customer-facing campaigns; PulseDesk only separate approved organizational communications. | Brand/persona/campaign copy, calendars, templates and exports exist. Campaign -> Deploy Ops kit is implemented. Core customer lists are not automatically marketing lists; connector transport remains missing engineering. | BrandForge access; Deploy Ops write access/quota for kit handoff. Accept copy approvals/consent and chosen delivery transport before sending; no PHI/customer-list sync or publication implied. |
| Deploy Ops (`ninja-launch-kit`) | Marketing handoff for TechDeck/TradeFlow businesses; approved general communications for PulseDesk organizations. | Brief-to-launch-kit, revisions/duplication and exports exist. Receives BrandForge campaigns. No actual site deployment, DNS, ad purchase or core operating-record import. | Actor-owned kit/brand permissions and generation allowance. Accept owner/non-owner exports and real provider generation separately. Keep release marketing distinct from infrastructure deployment. |
| TorqueShed | TradeFlow automotive field-service niche; TechDeck fleet maintenance and PulseDesk facilities vehicles only when genuinely needed. | Private vehicle diagnosis/repair history and existing diagnosis -> SnapProof/Faultline flows exist. No direct core job, asset or fleet-ID mapping. | TorqueShed ownership plus target grants; training manager/privacy review. Accept vehicle owner privacy, real diagnosis/provider quotas and explicit fleet mapping before any proposed core linkage. |
| OutCall | Optional verified-self reminders for individual operators in any core app. Low fit for transferring customer work. | Profiles, self-verification, schedules/cancel/history and callbacks exist. No core ticket/job trigger is claimed. Do not turn it into customer outbound dialing or emergency escalation. | Explicit provider enablement/resource policy, verified self and current access. Accept STOP/cancel, uncertain calls, schedule ownership and live provider separately. |
| FieldNode | Strong prospective TechDeck device-management adjacency; TradeFlow/PulseDesk only approved site-device operational access. | Free catalog entry and fixed-upstream protected gateway exist. Device grants/local MFA do not establish full ownership pairing, data mapping or live telemetry. | Central identity, explicit device grants, tenant/portal binding and local MFA. Accept actual pairing/revocation/device behavior before attaching records or streams; never imply gateway entry means device readiness. |
| Operator Pool Hall (`ninja-pool-hall`) | Optional break activity for all three, not a business-record add-on. | Practice/local play and protected online rooms/results exist. Keep separate from customer, ticket, employee performance and medical data. | Its own access/session and room ownership rules. Accept two-user reconnect/mobile gameplay; no mandatory work integrations, rankings certification or shared customer records. |

Priority: accept the existing TradeFlow proof round trip, TechDeck reviewed
runbook/training, and PulseDesk non-clinical intake/training before adding new
adapters. Next proposed engineering should be one explicit proof/evidence link
from a TechDeck ticket, if field demand warrants it, with a selected destination
record, provenance and same-tenant object checks. Do not make a generic
"send this anywhere" action. Study material and marketing exports should remain
manual/reviewed until content/receiver/retention contracts are approved.

## Source and server contract trace

- Registry: `ecosystem.registry.json`; active registrations:
  `apps/api/src/routes/module-shell-routes.ts`; authority:
  `apps/api/src/lib/tenant-auth.ts` and the SSO integration contract.
- Named workflow contracts, semantic idempotency, readiness, publish, delivery
  and run visibility: `apps/api/src/lib/cross-module-data-fabric.ts`.
- Record reads/writes and canonical destination paths:
  `apps/api/src/lib/cross-module-workflow-adapters.ts`.
- HTTP routes: `apps/api/src/routes/cross-module-data-fabric-routes.ts`.
  Module aliases fix source namespace; request bodies cannot claim tenant,
  actor, role or entitlement. Authenticated session guards bind module/tenant.
- UI request functions: `sharedPlatformApi` and `dataFabricApiBase` in
  `apps/web/src/lib/auth.ts`; module-host GET/POST use the existing namespace.
- Actual source UIs: `TechDeckTicketQueue`, `PulseDeskServiceDeskWorkspace`,
  `TradeFlowKitOperations`, `CallCommandCommercialWorkspace`,
  `SnapProofFieldWorkspace`, `NinjamationShell`, `BrandForgeWorkspace`,
  `TorqueShedWorkspace`, under `apps/web/src/components/module-shells`.
- Other capability sources: `studyforge-phase33-routes.ts`,
  `ninja-launch-kit-phase34-routes.ts`, `brandforgeos-phase31-routes.ts`,
  `brandforgeos-connector-policy.ts`, `outcall-routes.ts`, `outcall-provider.ts`,
  `fieldnode-management-gateway.ts`, `ninja-pool-online-routes.ts`.

POST validates UUID/registered workflow, canonical source link/type/kind,
reviewed version, both current write grants, manager policy when required, and
current source-object access before semantic deduplication. The transactional
client lock binds tenant/workflow/actor/retry key; semantic locking binds the
contract's actor/tenant scope and normalized intent. Request fingerprints detect
conflicting reuse. Delivery rechecks source/destination and manager access and
executes native record work plus provenance links under the transaction. The
original saved actor is retained; no browser actor field supplies authority.

GET filters by tenant/run and optional source namespace, re-resolves both module
accesses, and allows only the owner or the existing admin/manager/tenant-outcome
read policy. Associated links/events remain tenant-joined; metadata is narrowed
for non-manager shared-outcome readers. GET neither calls publication nor replay.
This slice does not alter that authorization policy or turn browser receipts
into authority. Receipt scope and response matching are extra UI consistency
checks, not replacements for server guards.

## Fresh verification and limits

Windows; existing canonical installed assets from sibling
`operatoros-module-integration-nov09` at the frozen base, Node 24.16.0,
TypeScript 5.6.3, Playwright 1.61.1, React 18.3.1 and ESLint 10.8.1.
No install, download, dependency change or global setting was performed.
Harness environment keeps only OS/runtime essentials, removes inherited provider
and database credentials, blocks Node external network/listening sockets and
intercepts browser requests. Browser proxy points to a closed loopback port.
No API server or PostgreSQL process is launched.

Executed from this isolated checkout:

1. `node build/lateral-check/prepare.cjs` prepares the local component fixture
   and source/test type configuration against explicit retained assets.
2. `node build/lateral-check/run.cjs`: **34/34 Chromium component cases pass**,
   zero skips. Actual component/sessionStorage/history/crypto; identity and API
   responses are synthetic. Includes confirmation/cancel, repeated clicks,
   unknown POST, same key retry, denied storage, reload/back/forward, actor and
   tenant changes, record/version/action/payload changes, canonical object
   ordering, meaningful array ordering, stale success/error for all requests,
   denied readiness/GET, no automatic POST on recovery, wrong returned run/
   workflow/record/module, old receipt rejection, payload privacy, URL rejection,
   valid attachment query, safe digest failure and desktop/mobile layout.
3. `node build/lateral-check/check.cjs`: complete web source plus new test strict
   typecheck passes; changed component/test zero-warning lint passes. Explicit
   retained asset resolution is not a fresh materialized candidate install.
4. `node build/lateral-check/contracts.cjs`: **15/15 existing DB-free source
   contracts pass**, zero skips, from `cross-module-data-fabric-static.test.ts`,
   `named-module-outcome-workflows-static.test.ts` and
   `scripts/phase38/data-fabric-contract.test.mjs`. These read/inspect the current
   source; they are not executable PostgreSQL transaction proof.
5. `node build/lateral-check/baseline.cjs`: the same candidate assertions against
   immutable baseline component source at `405740c8` reproduce **three expected
   failures**, zero passes: no saved-status action after revisit, stale actor
   results, and a changed retry key after uncertain submit -> Review again ->
   revisit. The initial negative run had two failures and one pass because the
   uncertain test originally only revisited; adding explicit Review again
   correctly targets the former key-clearing defect. Both logs are retained.
   Baseline source and checkout were not modified.
6. `git diff --check`: passes.

An independent read-only source review found no blocking issue, verified all
adapter link shapes and GET response fields, and identified the need to describe
storage loss on leaving/remount as well as reload; that wording is included.

Harness files/logs and four screenshots are retained in this worktree's ignored
`build/lateral-check`. Initial harness setup failed to resolve Playwright from
the isolated checkout, then encountered CJS/ESM entry resolution; explicit
retained ESM resolution fixed it. Initial type configuration needed its own
rootDir/composite settings; the lint config suffix was corrected. Those were
harness failures, not suppressed/skipped behavior tests. Successive full browser
runs passed 19, 25, 30 and 34 cases while coverage was expanded.

Screenshots `review-1440.png`, `review-390.png`, `recovery-1440.png` and
`recovery-390.png` show the actual isolated component; the mobile recovery
capture was inspected. The fixture has no app font/theme/shell, so it proves
neither deployed aesthetics nor whole-application mobile acceptance.

Not run: PostgreSQL source/access/concurrency/transaction journeys, full root
build/lint gate, real authenticated host/SSO navigation, actual cross-host cookie
changes, provider/mailbox/payment/device flows, deployment, publication or runtime
activation. New tests do not independently prove backend authorization, which
was source-traced and retained unchanged. Browser context changes are tested;
a cookie changed outside React's known identity still depends on existing
server guards and subsequent identity refresh. Storage-denied navigation/remount/full-reload
recovery is explicitly unavailable. No module parity state or inventory count
is promoted; production publication and activation holds remain unchanged.
