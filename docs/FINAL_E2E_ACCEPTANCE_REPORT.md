# OperatorOS ecosystem final E2E acceptance report

Assessment date: 2026-07-29
Target: local production-mode HTTPS topology backed by disposable PostgreSQL 16
Scope: Phase 17 OperatorOS release identity and enabled-module SSO gate
Verdict: **NOT ACCEPTED — release gate failed**

## TorqueShed State 4 follow-up — 2026-07-31

The dedicated TorqueShed exact-host scenario passed 1/1 in 13.8 seconds on
compiled OperatorOS artifacts, the local HTTPS host topology, and a disposable
PostgreSQL 16 database. It uses the native UI for the complete accepted path:
VIN-masked vehicle and diagnostic creation, trouble-code and measurement
evidence, one server-owned token purchase, one signed deterministic payment
credit, one server-selected Assist result and exact append-only debit,
Marketplace publication, Community publication/reaction/comment, mobile
layout, global revocation, diagnostic deep-link reauthentication, My Apps
return/relaunch, Marketplace refresh, and host-only logout. Direct database
assertions confirm every business record exactly once in the trusted tenant.

Supporting gates also pass: 23/23 focused contracts, 3/3 TorqueShed
PostgreSQL workflows, release v29 clean apply/idempotent reapply, workspace
typecheck, production build, core preflight, readiness-gated supervisor, and
web-proxied health/readiness HTTP 200. This promotes TorqueShed to
source/local consolidation state 4.

The ecosystem remains **NOT ACCEPTED** for production. The tested payment and
AI adapters were explicitly local/test-only; no live Stripe/OpenAI traffic,
Replit deployment, production backup/restore, real-data apply/reconciliation,
or cutover occurred. State 5 requires authenticated acceptance on the exact
deployed revision and the remaining provider/data/rollback gates.

## TechDeck zero-gap follow-up — 2026-07-29

TechDeck was re-baselined against clean source commit
`8125f8d89d8d39d60a50c8061a26133a0c917792`. Its executable ledger inventories
all 382 discovered capabilities—65 pages, 221 routes, 45 tables, 46
provider/config references, and 5 background processes—with 91 active, 109
shared replacements, 48 security retirements, 134 product-boundary
retirements, zero unclassified items, and zero restoration gaps. This closes
the approved source/local inventory gate without restoring child identity,
billing, provider authority, secret storage, anonymous intake, recurrence,
business invoicing, or remote device/script execution.

The current exact-host TechDeck test passed 1/1 in 20.3 seconds against a
compiled production build, readiness-gated supervisor, local HTTPS host proxy,
and disposable PostgreSQL 16 database. It proves PKCE login/return,
tenant-scoped configuration and network creation, topology and health updates,
exact item deep links, runbook review/approval/publication and reload, typed
evidence, reports, time, ticket creation/update/reload, exact shared Directory
client selection, workspace persistence, 390-pixel mobile compatibility,
My Apps return/reopen, and host-only local logout. API health/readiness and web
health returned HTTP 200.

This follow-up does not change the ecosystem **NOT ACCEPTED** verdict or claim
TechDeck state 5. The reviewed revision was not deployed, production
attachment/providers were not enabled, and no real export, apply,
reconciliation, rollback rehearsal, or cutover was authorized.

## Phase 17 production-truth update — 2026-07-29

The public release and refreshed `origin/main` matched at
`48b8691fca5c8a8d79f53b309cb44db79698bbcd` when Phase 17 began. Public
health identified build `932f83cb0d7c15ce994eb04e`, and the pre-change
read-only verifier passed 48/48.

The Phase 17 candidate adds the missing deployment timestamp and database
release v29/29 to the Git/build/lock identity, makes readiness depend on that
complete identity, pins public verification to an intended commit, and aligns
OutCall with its documented planned/disabled boundary.

Fresh compiled-candidate browser evidence passes three focused tests:

- 1/1 in 29.5 seconds for one-login SSO across all 12 enabled child modules,
  host-only cookies, no credential URL/storage leakage, and global revocation;
- 1/1 in 20.1 seconds for TechDeck deep-link return/Back, silent PulseDesk
  sibling SSO, persistent operations, and TechDeck local logout preserving the
  sibling;
- 1/1 in 5.3 seconds for tenant-disabled TechDeck
  `MODULE_ACCESS_DENIED` and planned OutCall `MODULE_UNAVAILABLE`.

The strengthened public verifier returns 45/48 against the unchanged public
release because both health snapshots lack the new identity fields and the old
OutCall callback still renders. This is expected pre-deployment evidence.
Review/merge, Replit deployment, public 48/48, and the production-safe
authenticated 3/3 gate remain open. No state 5 or deployed success is claimed.

## PulseDesk zero-gap follow-up — 2026-07-29

PulseDesk was re-baselined against clean source commit
`937849471e489ed23db2a263d04160a388402740`. Its executable ledger inventories
all 309 discovered capabilities—23 pages, 183 routes, 50 tables, 45
provider/config references, and 8 background processes—with 91 active, 74
shared replacements, 53 security retirements, 91 product-boundary
retirements, zero unclassified items, and zero restoration gaps. This closes
the approved source/local inventory gate without restoring child identity,
billing, schema authority, unsafe connectors, EHR/clinical data, or TechDeck
device/network ownership.

The current exact-host PulseDesk test passed 1/1 in 17.5 seconds against a
compiled production build, readiness-gated supervisor, local HTTPS host proxy,
and disposable PostgreSQL 16 database. It proves PKCE login/return, silent
sibling SSO, tenant-scoped operational asset creation, the
`/assets/:id/report-issue` prefilled intake path, UI ticket creation, internal
note persistence after reload, `/analytics` and `/service-desk-admin`, exact
shared Directory `/clients/:id`, My Apps return, and host-only local logout.
API health, readiness, and web-proxied health returned HTTP 200.

The unfiltered ecosystem matrix finished 5 passed and 4 failed in 23.9
minutes. PulseDesk passed. BrandForgeOS, StudyForge AI, and Ninja Launch Kit
timed out on AI generation while OpenAI was intentionally disabled;
CallCommand expected its local test adapter while the production-mode runtime
correctly disabled it. Those results are recorded as separate provider
configuration gates, not PulseDesk regressions.

This follow-up does not change the ecosystem **NOT ACCEPTED** verdict or claim
PulseDesk state 5. The reviewed revision was not deployed, live providers were
not enabled, and no real export, apply, reconciliation, rollback rehearsal, or
cutover was authorized.

## Phase 16A TradeFlowKit follow-up

TradeFlowKit was re-baselined against clean restored source commit
`37aa67f1da804fc3ac56f36e50e01362077d7a26` rather than treating the earlier
approved-scope snapshot as full-product parity. The executable source ledger
inventories 35 pages, 194 API routes, 40 tables, and 8 provider/config
references with zero unclassified items. After the Workflow Studio,
revenue-document, customer-import, core-record editing, global-search,
retention, lead-messaging, saved-view, accounting-export, safe-bulk,
lead-operations, and bounded record-import increments, 137 items are active,
58 use shared OperatorOS replacements, and 8 remain explicit Phase 16 gaps.

The current revenue increment adds persistent direct invoice creation;
optimistically versioned, multi-line draft editing for quotes and invoices;
history-safe soft archive; and row-locked idempotent quote-to-job conversion.
All writes resolve tenant and module authority from the validated server
session, reconcile normalized child items within the parent transaction, and
write activity. Viewers see a read-only UI and are independently denied by the
API. Accepted quotes and financial-history-bearing invoices cannot be
rewritten or destructively archived.

The customer-import increment adds a responsive `.csv` flow bounded to 256 KB,
100 rows, and five declared fields. The browser parses the file and sends JSON;
the server revalidates each row, requires a bounded idempotency key, serializes
same-tenant imports, suppresses normalized/fingerprint duplicates, and
atomically reconciles shared Directory organizations/contacts with
TradeFlowKit customers. The shared OperatorOS idempotency service stores only
the bounded result shape, not contact fields. Tests prove viewer denial,
second-tenant isolation, safe audit/activity metadata, exact
same-key/same-body original-result replay, `409 IDEMPOTENCY_KEY_REUSE` on body
drift, and database persistence after API shutdown. Legacy customer bulk
delete/restore is explicitly retired under ADR-0011.

The bounded record-import increment restores job and invoice CSV workflows
without reviving standalone authority. Both browser flows cap files at 256 KB
and 100 rows, send parsed JSON, require module write access and a replay key,
serialize per tenant, and suppress deterministic duplicates. Jobs resolve a
unique active tenant customer and allocate canonical numbers. Repeated invoice
references group at most 50 normalized lines, decimal inputs become exact
integer cents/basis points, and paid status is rejected so imports cannot
manufacture payment history. ADR-0031 also resolves the legacy scheduler,
standalone-task, SendGrid/Twilio, and unreviewed lead-AI entries through the
already accepted deterministic/job-scoped/shared-provider boundaries. Public
anonymous intake and production business-payment activation remain fail-closed.

The core CRUD increment completes the shortest functional field-service loop:
customer → job/work order → task. Operators can create, read, fully edit,
deep-link, refresh, and dependency-safely archive each record. Customer edits
atomically update the linked shared Directory organization and primary
contact, while customer archive deliberately leaves that cross-module identity
active. Server authorization still denies viewers and hides foreign-tenant
records; optimistic versions reject stale writes. ADR-0010 remains authoritative,
so no duplicate project table or project endpoint was introduced.

The global-search increment adds one bounded read endpoint and responsive
search surface across leads, customers, jobs, tasks, Directory organizations
and contacts, quotes, and invoices. Every query uses the trusted session tenant,
escapes wildcard input, and returns at most five rows per group. Search results
use canonical module-host workflow paths; the exact-host test follows a returned task
and confirms the selected persistent record rather than merely asserting a
rendered result label.

The retention increment adds a canonical `/trash` workspace and bounded safe
projections for archived customers, jobs, and invoices. Owner/admin restores
require current optimistic versions and active dependencies, serialize with
parent archives through tenant-specific advisory locks, and write activity.
Viewers remain read-only, foreign records remain non-enumerating, document
token hashes are never projected, and no permanent-purge route exists.

The lead-messaging increment restores dedicated lead email and SMS actions
without creating module-local provider authority. Destinations are derived
from the tenant-owned lead, SMS requires stored consent and enforced opt-out
wording, changed-message idempotency-key reuse fails, and the shared outbox
records queue state. The Lead Center exposes responsive queue actions and a
viewer read-only state while accurately leaving delivery to the shared worker.

The lead-operations increment adds versioned tenant settings, an internal
capture profile, seven server-allowlisted trade templates, transactional
follow-up scheduling, manually actioned shared-outbox delivery, safe adapter
contract validation, sanitized source history, and an admin-only delivery
check bound to the authenticated OperatorOS email. ADR-0030 keeps automatic
response execution, direct provider credentials, and anonymous/public intake
disabled. Release v31 adds four tenant-scoped tables with composite tenant/lead
foreign keys, optimistic versions, bounded JSON, and database checks that keep
automatic response and public intake off.

The safe-bulk increment restores the non-destructive batch workflows under
ADR-0029: owner/admin job-status updates, archived job/invoice restore, and
exact-remaining-balance invoice settlement, each bounded to 25 versioned
records. Stable row locks, trusted tenant predicates, all-or-nothing
optimistic concurrency, shared idempotency replay/body-drift checks, dependency
validation, and per-record plus batch activity keep the workflow atomic and
non-enumerating. Invoice settlement creates real successful payment rows.
Legacy bulk delete and permanent purge remain retired.

Fresh safe-bulk evidence on 2026-08-01 passes 1/1 static contract, 3/3
isolated PostgreSQL workflows, 23/23 adjacent regressions, workspace
typecheck, production build, core preflight, compiled v30/30 readiness, and
1/1 exact-host Chrome in 19.7 seconds. The browser completes real PKCE login,
persists a job-status batch, archives the dependent records in order, and
restores the job through the batch UI. This is local evidence only; providers
were disabled and deployment/cutover were not run.

Fresh lead-operations evidence on 2026-08-01 passes 6/6 focused static and
isolated PostgreSQL checks, 27/27 adjacent TradeFlowKit regressions, workspace
typecheck, production build, core preflight, clean/idempotent v31/31 release,
compiled readiness, and 1/1 exact-host Chrome in 21.8 seconds. The final clean
API aggregate passes 900, fails 0, and intentionally skips 6 HTTP-only cases
across 906 tests. The aggregate also exposed and closed a Torque Assist balance
race by serializing each tenant/user balance read and append-only debit under a
transaction advisory lock; its concurrency workflow passed five consecutive
repeats plus the final aggregate. External providers remained disabled and no
deployment, live traffic, or production data mutation was performed.

Fresh local evidence adds a 2/2 PostgreSQL workflow and a 1/1 exact-host Chrome
workflow in 16.4 seconds against the production build and readiness-gated
supervisor. The browser case proves PKCE login/return, all three record editors
and deep links, task status change, refresh persistence, return to My Apps,
module reopen, and task → job → customer archive ordering. The disposable
database/container and all synthetic data were removed after the run.

Fresh global-search evidence on 2026-07-31 passes 16/16 non-database checks,
21/21 isolated PostgreSQL regressions, the 104-active/56-gap executable ledger,
workspace typecheck and production build, release-v29 compiled health/readiness,
and 1/1 exact-host Chrome in 16.1 seconds. The public deployment passes its
own unpinned 48/48 read-only gate but identifies an older commit; pinning
current main fails only the two release-identity assertions. Deployment and
authenticated deployed acceptance therefore remain open.

Fresh retention evidence on 2026-07-31 passes 4/4 focused static/routing
checks, 22/22 adjacent isolated PostgreSQL regressions, workspace typecheck,
production build, core preflight, release-v29 compiled health/readiness, and
1/1 exact-host Chrome in 19.3 seconds. The browser archives task, job, and
customer; visits canonical `/trash`; restores customer then job; and confirms
the task remains archived. This is local production-mode evidence only.

Fresh lead-messaging evidence on 2026-07-31 passes 9/9 focused non-database
checks, 23/23 adjacent isolated PostgreSQL regressions, workspace typecheck,
production build/core preflight/readiness-gated runtime, and 1/1 exact-host
Chrome in 20.7 seconds. The browser creates a consent-marked lead, queues an
email, verifies its server-owned shared-outbox destination, then completes the
existing archive/restore workflow. No provider delivery was invoked.

Local evidence on 2026-07-28 includes 5/5 focused PostgreSQL/static checks; a
clean API aggregate at 872 total, 866 pass, zero fail, and six intentional
HTTP-only skips; workspace typecheck; production build; the compiled 29-step
release; `200` health/readiness; and an exact-host Chrome workflow. That
current customer-import workflow passes 1/1: it completed exact-path PKCE
login, imported two valid customers plus shared Directory identities, rendered
one invalid-row diagnostic, survived `/quotes` refresh, and re-imported the
same logical rows under a fresh key with zero new writes. It returned to My
Apps and passed a 390-pixel no-overflow check. Prior cumulative browser
evidence also covers customer/quote creation, two-line quote editing,
send/accept, quote-to-job/invoice, direct invoice create/edit/archive, secure
host-only cookies, and no credential storage.

The first rebuilt browser attempt completed its product assertions but failed
fixture teardown on the new `shared_idempotency_keys` tenant FK. The
tenant-scoped cleanup was repaired, the scenario passed 1/1 in 8.5 seconds,
and a count-only check confirmed no synthetic import-gate identity remained.
The clean rebuilt runtime and core production preflight both pass.

Focused record-import/API/UI evidence on 2026-08-02 passes 6/6, covering
viewer denial, bounds, tenant separation, customer reconciliation, schedule
validation, exact same-key replay, changed-body conflict, deterministic
duplicate suppression, grouped normalized invoice lines, exact-cent totals,
synthetic-paid-history rejection, and safe batch metadata. The final clean
aggregate passes 904 with zero failures and six intentional HTTP-only skips
across 910 tests. Workspace typecheck, the 20-page production build, v31/31
release-plan proof, compiled health/readiness, and the exact-host browser
workflow also pass locally. The browser imports customers, jobs, and grouped
invoice lines, verifies the exact database totals, reports invalid rows,
suppresses duplicate re-imports, survives refresh, fits a 390-pixel viewport,
returns to My Apps, and relaunches; 1/1 passed in 9.6 seconds.

This follow-up does not change the ecosystem **NOT ACCEPTED** verdict or claim
TradeFlowKit state 5. Eight parity gaps remain, and deployed authenticated
acceptance, live providers, an approved real export/apply/reconciliation,
rollback rehearsal, and production cutover have not occurred.

## Phase 12B follow-up

OutCall was reconstructed from the owner's recovered ten-phase prompt set
because no canonical standalone repository could be located. ADR-0027 defines
it as discreet verified-self exit assistance under OperatorOS authority, not
CallCommand AI, emergency dispatch, monitoring, or a 911 replacement.

The bounded shared-runtime slice persists safety acknowledgment, global
verified-phone ownership, tenant profiles, encrypted private triggers,
immediate/delayed requests, safe history, shared jobs, activity and
exactly-once usage. The server selects only the authenticated user's verified
number; client destinations, tenant overrides, viewer mutation, foreign phone
claims, cross-tenant reads, unsafe impersonation text, recording and replayed
idempotency are rejected.

Local evidence on 2026-07-27 includes 3/3 OutCall PostgreSQL workflows, 34/34
focused contracts, a clean aggregate at 839/839, a clean/idempotent 29-step
release, typecheck, production build, core plus OutCall preflight, compiled direct/web-proxied
health/readiness, the 9/9 production-host matrix across all thirteen modules,
and the 2/2 first-screen suite. The deterministic OutCall browser case accepts
the safety contract, verifies a test-owned number, creates a neutral profile
and private trigger, schedules a verified-self request through the shared
worker, masks the number in history, and denies a non-entitled tenant. No
external call occurs.

This does not change the ecosystem report's **NOT ACCEPTED** verdict. Live
Twilio Verify/SMS/voice/DTMF and signed callback handling, deployed acceptance,
and a user-facing export/deletion workflow remain incomplete. Trusted
contacts, check-ins, duress, location, arbitrary destinations, recording and
emergency-service behavior are disabled or excluded.

## Phase 12A follow-up

The Ninjamation Phase 12A source/local candidate was verified on 2026-07-27
against disposable PostgreSQL 16 and compiled production artifacts. Source
archaeology pins the Replit-synced AutomationPacks application commit
`cca75338d04ed35b89f28d614eb51559735aa32f` and catalog commit
`ca0e55fd086f6751a43964927166bfa69db012b6`. AutoWorkFlowHub is discontinued
and explicitly excluded. ADR-0026 defines Ninjamation as a reviewed PC
automation script library and forbids OperatorOS/server/browser script
execution.

The active module provides tenant-scoped script authoring, immutable versions
and hashes, server static analysis, review submission, tenant-admin
approve/reject/retire decisions, approved-current-version-only audited
downloads, shared AI-generated drafts with idempotent usage, a responsive
workspace and canonical deep links. Child identity, passwords, billing,
administration, GitHub sync and arbitrary execution are not imported.

Fresh evidence includes focused domain/import/static contracts; 4/4
PostgreSQL persistence, authorization, tenant-isolation, version, approval,
download and AI-usage workflows; the complete untouched-database API
aggregate at 836 pass, 0 fail and 0 skip; workspace typecheck; clean and
idempotent 28-step release; production build/core preflight; and compiled
direct/web-proxied health and readiness. The canonical-host browser matrix
passes 9/9 in 1.9 minutes and silently launches all twelve enabled modules.
The separate compiled-artifact first-screen suite passes 2/2 in 9.3 seconds:
it creates a safe PowerShell draft, confirms clean static analysis, submits
and approves it with admin authority, downloads an actual `.ps1` artifact,
and proves a non-entitled tenant sees the denial card.

Acceptance also repaired a stale launchpad journey test: registration now
creates a valid personal tenant with free-account entitlements, so the test
must mirror the real invite page by switching to the accepted tenant before
asserting that tenant's exact My Apps grants. The corrected scenario passes
inside the 836/836 aggregate. Two first-screen attempts were excluded because
their harness used an HTTP origin for a Secure cookie and then sent raw
`/v1/*` requests to the Next-only TLS proxy. The final rerun used separate
same-host TLS proxies for Fastify and Next; no cookie, host, or rate-limit
control was weakened.

This follow-up does not change the ecosystem report's **NOT ACCEPTED** verdict
or claim state 5. The candidate is not deployed, no production backup or
database apply occurred, no source-data import/cutover was authorized, and no
script execution capability is claimed.

## Phase 11E follow-up

The CallCommand AI Phase 11E source/local candidate was verified on 2026-07-27
against disposable PostgreSQL 16 and compiled production artifacts. It
provides tenant-scoped channels, bounded receptionist/intake profiles,
review-only transfer targets, purpose-specific outbound consent, do-not-call
suppression, signed inbound DTMF intake, persistent calls, safe events,
operator dispositions, reviewed follow-up drafts, record-derived analytics,
signed replay-safe Twilio callbacks, forced-off recording privacy and
canonical responsive deep links. ADR-0025 assigns contacts to Shared Directory
and excludes child identity/billing/admin, fake delivery, transfer execution,
recording/transcription/AI summaries, incomplete SIP providers, raw provider
payload retention, public recording URLs and bulk/cold/predictive/autonomous
dialing; OutCall remains disabled.

Fresh evidence includes focused static/domain/import contracts, 5/5
tenant/authorization/consent/disposition/persistence PostgreSQL workflows,
4/4 signed callback/inbound/replay/recording-privacy workflows, the complete
clean API aggregate at 825 pass, 0 fail and 0 skip, deterministic no-apply
import, workspace
typecheck, clean and idempotent 27-step release, production build/core
preflight, and compiled direct/web-proxied health and readiness. The final
production-host browser matrix passes 9/9 in 1.8 minutes. Its CallCommand
scenario persists channel/profile configuration and consent, completes an
explicit test-adapter call with no external contact, verifies an operator
disposition, three persisted safe events, a review-only follow-up draft and no
recording URL schema, blocks the suppressed number,
refreshes the call deep link, checks mobile navigation, returns through My
Apps, globally logs out, directly reauthenticates to the call deep link and
confirms persistence.

The focused browser run captured a real failure after suppression: the API
sent the intended 409 response but the route did not return the sent Fastify
reply, so a second response attempt terminated the process. Every
CallCommand validation exit now returns the reply explicitly. A stale wording
assertion was corrected to the UI's actual safety statement. A separate
environment-only attempt was excluded after a stale local API process
reclaimed port 5001 and caused browser registration and Playwright's database
assertions to use different disposable databases. The stale listener was
terminated and the stack was aligned before the corrected focused workflow
passed 1/1 in 12.3 seconds, followed by the full 9/9 regression in 1.8
minutes.

This follow-up does not change the ecosystem report's **NOT ACCEPTED** verdict
or claim State 5. The candidate is not deployed, and no production backup,
database apply, source-data reconciliation, live Twilio traffic, recording
jurisdiction approval or cutover was authorized.

## Phase 11D follow-up

The Ninja Launch Kit Phase 11D source/local candidate was verified on
2026-07-27 against disposable PostgreSQL 16 and compiled production artifacts.
It provides tenant-scoped launch workspaces, phases, milestones, dependent
tasks, versioned reviewed artifacts, private shared assets, server-computed
readiness, OperatorOS-owned AI/idempotency/usage/activity, audited
JSON/Markdown/CSV exports and canonical responsive deep links. ADR-0024 keeps
reusable brand and ongoing-campaign authority in BrandForgeOS and excludes
child identity/billing/admin, duplicate credentials, legacy URL-token SSO,
simulated analytics and unsupported integrations.

Fresh evidence includes the focused domain/import/database/static contracts
and 4/4 PostgreSQL workflows, the complete clean API aggregate at 816 pass,
0 fail and 0 skip, deterministic no-apply import, workspace typecheck, clean
and idempotent 26-step release, production build/core preflight, and compiled
direct/web-proxied health and readiness. The final production-host browser
matrix passes 8/8 in 1.7 minutes. Its Ninja Launch Kit scenario persists a
launch, completes the required plan, generates draft campaign artifacts with
the deterministic local adapter, explicitly reviews and approves them,
reaches 100% server readiness, marks the launch live, downloads a real audited
export, checks mobile navigation, returns through My Apps, globally logs out,
directly reauthenticates to the launch deep link, refreshes and confirms
persistence.

The first browser run reached only 80% because rapid test clicks did not wait
for each server-reloaded review state. The UI now exposes task completion as
pressed state and the test waits for every task and artifact transition. The
focused failed scenario passed 1/1, followed by the full 8/8 regression.
Repeated local registrations then reached the intentional in-memory rate
limit; only the disposable API process was restarted before the authoritative
clean-process matrix. No production limit or security control was weakened.

This follow-up does not change the ecosystem report's **NOT ACCEPTED** verdict
or claim State 5. The candidate is not deployed, and no production backup,
database apply, source-data reconciliation, live provider traffic or cutover
was authorized.

## Phase 11C follow-up

The StudyForge AI Phase 11C source/local candidate was verified on 2026-07-27
against disposable PostgreSQL 16 and compiled production artifacts. It
provides tenant-scoped subjects, private note/scanned-document sources,
source-grounded AI decks/quizzes/plans, exact citation evidence, editable
draft/review/publish lifecycles, server-authoritative grading, persistent
attempts, per-user spaced repetition and plan completion, shared usage/
idempotency/activity, real JSON/CSV exports and canonical responsive deep
links. Child identity, billing/admin authority, ungrounded publication, fake
analytics and unsafe document formats remain excluded under ADR-0023.

Fresh evidence includes 14/14 focused contracts, the complete clean API
aggregate at 801 pass/0 fail/0 skip, deterministic no-apply import, workspace
typecheck, clean and idempotent 25-step release, production build/preflight,
and compiled direct/proxied health and readiness. The final production-host
browser matrix passes 7/7 in 1.5 minutes. Its StudyForge scenario persists
private note and document sources; generates, edits, reviews and publishes a
deck, quiz and plan; records a card review, server-graded attempt and completed
session; verifies exactly three usage events; downloads a real export; checks
mobile navigation; returns through My Apps; globally logs out; directly
reauthenticates to a deep link; refreshes; and confirms persistence.

The closure runs exposed and closed an ambiguous StudyForge selector, a stale
SnapProofOS selected-case closure, and two acceptance synchronization races
around quiz publication and plan completion. Focused StudyForge and
SnapProofOS scenarios passed, followed by the complete 7/7 matrix. Repeated
disposable registrations reached the intentional in-memory rate limit; only
the disposable API process was restarted and no production control was
weakened.

This follow-up does not change the ecosystem report's **NOT ACCEPTED** verdict
or claim State 5. The candidate is not deployed, and no production backup,
database apply, source-data reconciliation, live provider traffic or cutover
was authorized.

## Phase 11B follow-up

The SnapProofOS Phase 11B source/local candidate was verified on 2026-07-26
against disposable PostgreSQL 16 and compiled production artifacts. It
provides tenant-scoped evidence cases, private note/file capture,
signature/MIME/scan/hash controls, member submission and tenant-admin review,
findings, append-only comments and hash-linked custody, immutable reports, real
JSON/CSV exports with provenance, retention/legal hold/archive, persisted
dashboard metrics and canonical responsive deep links. Child identity,
organizations, billing, public share/file URLs, fake exports and arbitrary
integrations remain excluded under ADR-0022.

Fresh evidence includes 17/17 focused contracts, the complete clean API
aggregate at 787 pass/0 fail/0 skip, deterministic no-apply import, workspace
typecheck, clean and idempotent 24-step release, production build/preflight,
and compiled health/readiness. The production-host browser matrix passes 6/6
without retry. Its SnapProofOS scenario exercises private attachment upload and
scan state, evidence/case/report decisions, finding and internal note,
custody-chain continuity, approved export download, legal hold, mobile
navigation, My Apps return, global logout, direct deep-link reauthentication,
refresh and persistence.

The first browser run completed the workflow but its final status locator
matched both list and detail labels. After scoping the assertion, the focused
case passed 1/1 and the full matrix passed 6/6. An immediate repeated matrix
then reached the intentional per-process registration limit accumulated by
earlier disposable identities; restarting only the local test API cleared the
bucket. No security control was weakened.

This follow-up does not change the ecosystem report's **NOT ACCEPTED** verdict
or claim state 5. The candidate is not deployed, and no production backup,
database apply, source-data reconciliation, provider traffic or cutover was
authorized.

## Phase 11A follow-up

The BrandForgeOS Phase 11A source/local candidate was verified on 2026-07-26
against disposable PostgreSQL 16 and compiled production artifacts. It
provides versioned brand kits and personas, campaign/copy/calendar lifecycle,
persisted dashboard metrics, real JSON/CSV exports, and OperatorOS-owned AI
generation with redaction, idempotency, shared usage and activity. Child
identity, billing, credits, admin mutation, random analytics, fake
integrations and template purchasing remain excluded under ADR-0021.

Fresh evidence includes 28/28 focused contracts and PostgreSQL workflows, the
prior 774-test aggregate with 768 pass/0 fail/6 intentional live-HTTP skips,
the deterministic no-apply import, workspace typecheck, clean 23-step release,
production build, and compiled health/readiness. The production-host browser
matrix passes 5/5. Its BrandForgeOS scenario persists a brand, persona,
campaign, copy asset, calendar item and metrics; exercises the deterministic
test AI adapter and records usage exactly once; refreshes canonical deep
routes; returns through My Apps; globally logs out; reauthenticates; and
confirms persistence.

The first closure run correctly exposed an insecure mixed-environment cookie
decision and cross-scenario loopback rate-limit exhaustion. Session cookies
now fail secure when either runtime signal is production, and each browser
scenario receives a distinct client identity only at the local trusted test
proxy. Production auth limits were not weakened. Cookie/proxy tests pass 9/9,
and the full browser matrix then passed without retries.

This follow-up does not change the ecosystem report's **NOT ACCEPTED** verdict
or claim state 5. The candidate is not deployed, and no production backup,
database apply, source-data reconciliation, provider traffic or cutover was
authorized.

## Phase 10B follow-up

The Ninja Pool Hall Phase 10B source/local candidate was verified on
2026-07-22 against disposable PostgreSQL 16 and the compiled production
artifacts. It provides Free Shoot, CPU 8-ball, local hot-seat, persistent
profiles/preferences, structured matches, append-only events, server-applied
logical rules/results, recovery, result detail, personal aggregates, and
canonical deep links. Continuous physics remains browser-local and every match
is labeled `client_reported_server_rules`; online rooms, ranking, rewards,
wagering, and verified competition remain disabled under ADR-0020.

Fresh evidence includes focused domain/rules/import/route/static contracts,
scoped PostgreSQL persistence/isolation/viewer/hard-delete workflows, exact
five-file and zero-row dry-run reconciliation, workspace typecheck, clean and
idempotent 22-step release apply, production preflight/build, compiled
supervisor startup, and canonical HTTPS health/readiness. The production-host
browser matrix passes 4/4. Its dedicated scenario persists profile settings,
takes real canvas shots in CPU and local modes, saves and deep-refreshes a match
trail, exercises recovery/abandon and mobile navigation, returns through My
Apps, invalidates the module session through global logout, reauthenticates,
and confirms persistence without URL or browser-storage credentials.

This follow-up does not change the ecosystem report's **NOT ACCEPTED** verdict
or claim state 5. The cumulative revision is not deployed and no production
backup, apply, traffic switch, or cutover was authorized. The full API aggregate
also remains red on two unrelated deterministic TorqueShed foundation/Assist
assertions after all Phase 10B and portability failures passed focused reruns.

## Phase 10A follow-up

The FaultlineLab Phase 10A source/local candidate was verified on 2026-07-22
against disposable PostgreSQL 16. It adds four validated runnable challenges,
immutable content versions, safe pre-completion projections, server-recorded
investigation actions, server-only scoring, daily and Chaos modes,
assignments, progress/badges, private proof, analytics/exports, and dedicated
responsive deep links. The 52 incomplete source catalog cards remain
non-playable, and FaultlineLab makes no certificate claim.

Fresh evidence includes 11/11 focused contracts, a fresh 1/1 persistent
PostgreSQL workflow with tenant and role negatives, a deterministic dry-run
reconciliation, API/runner/web typecheck, clean 21-step release apply,
production build, idempotent compiled supervisor startup, and canonical HTTPS
health/readiness. The production-host browser matrix passes 3/3. Its dedicated
FaultlineLab scenario creates and server-scores a real attempt, persists the
score through canonical `/sessions/:id` refresh, returns through My Apps,
invalidates the module session through global logout, reauthenticates, and
reopens the same score without URL or browser-storage credentials.

FaultlineLab is therefore a source/local state-4 candidate. This follow-up does
not change the ecosystem report's **NOT ACCEPTED** verdict or claim state 5:
the cumulative revision is not deployed, no authorized standalone data apply
or cutover occurred, and the aggregate API harness retains unrelated
bootstrap-sensitive failures.

## Phase 6 follow-up

The PulseDesk source/local Phase 6 candidate was verified on 2026-07-18 against
disposable PostgreSQL 16. It resolves the healthcare-operations boundary in
ADR-0015 and adds the approved shared-Directory client/facility/requester,
operational asset, numbered ticket, queue/team assignment, internal
note/requester reply, shared attachment, time/SLA, vendor, supply/facility,
knowledge, saved-view, configuration, dashboard and ticket deep-link workflow.
Recursive no-PHI controls, requester/internal visibility isolation, trusted
tenant references, capability checks, versions, idempotency, transactions and
content-free notification payloads are covered by focused and aggregate tests.

Fresh local evidence includes 37/37 focused PulseDesk tests, a 712-test clean
API aggregate with 706 pass/0 fail/6 HTTP-only skips, the privacy dry-run with
34/34 references and no findings, a clean 19-step PostgreSQL release, workspace
typecheck, production build, compiled readiness, eight path-preserving
PulseDesk PKCE redirects, and the production-host SSO matrix at 2/2 in 3.9
minutes. The direct browser case covers deep-link return, refresh, Back,
sibling PulseDesk SSO, host-only local logout and global revocation.

The historical PulseDesk failures below are therefore closed in the current
local source; patient charts, diagnosis, treatment, insurance and clinical
records remain deliberately absent, and network/configuration authority stays
in TechDeck. The deterministic importer performed only a privacy-review dry
run. No source files, standalone database, provider credentials, patient data,
authority or billing records were copied into OperatorOS.

This follow-up does not change the report's **NOT ACCEPTED** verdict. The exact
cumulative revision has not been deployed, the full deployed workflow has not
been exercised, and no production export/apply/reconciliation/cutover was
authorized. This section supersedes the local PulseDesk parity diagnosis in
the dated failure table without changing that historical run's response or
counts.

## Phase 5 follow-up

The TechDeck source/local Phase 5 candidate was verified on 2026-07-18 through
the compiled production runtime, a disposable PostgreSQL 16 database, and the
host-preserving HTTPS proxy. The production-host SSO matrix passed 2/2 in 1.7
minutes across all twelve enabled modules. Its direct TechDeck case preserved
the `/assets` deep link through credential entry, survived refresh and browser
Back without an auth loop, silently launched PulseDesk in a sibling tab, and
passed host-only local logout. Global revocation passed in the all-module case.

Focused TechDeck tests now pass for Directory-linked configuration inventory,
VLAN/subnet/address topology, lifecycle records, document/runbook workflow,
evidence, deterministic reports, comments, time, attachments, roles, tenant
isolation, and record deep links. The historical step 12 failure below is
therefore closed in the current local source by shared Directory client/site
authority plus typed network/IPAM records; no duplicate TechDeck client/site
authority was added.

This follow-up does not change the report's **NOT ACCEPTED** verdict. The full
35-step historical sequence has not yet been rerun on the cumulative candidate,
the public target still reflects the older release, and deployed TechDeck
workflow/provider/data-cutover evidence is absent. This section supersedes the
local TechDeck parity diagnosis in the dated failure table, but it does not
retroactively alter that run's captured response or pass/fail counts.

## Phase 4 follow-up

The local production-host acceptance was rerun on 2026-07-18 after the
TradeFlowKit Phase 4 candidate. It produced 29 passing evidence records and 9
failures. Every TradeFlowKit-specific row passed: SSO launch, shared-directory
customer creation, numbered job and first-class task persistence, intentional
project-endpoint denial under ADR-0010, return navigation, reopen persistence,
and disabled-entitlement denial. TradeFlowKit deep-link refresh also passed
inside the combined step; that step remained failed only because TorqueShed's
`/diagnostics` route is Phase 7 scope. The remaining nine failures are in
PulseDesk, TechDeck, and TorqueShed and are carried into their later phases.

The complete two-test local production-host SSO matrix separately passed all
12 enabled modules. This follow-up does not change the report's **NOT
ACCEPTED** verdict: the candidate is not deployed, the broader ecosystem gaps
remain, and TradeFlowKit still lacks approved cutover/deployed workflow and
public-document smoke evidence required for state 5.

## Phase 2 follow-up

After this dated 35-step run, Phase 2 added one OperatorOS-owned persistent
Business Directory used by TradeFlowKit, TechDeck, and PulseDesk for shared
organizations, contacts, addresses, sites, associations, and module-specific
profiles. A production-artifact browser test created records, refreshed, and
reused the same organization ID across all three modules. This closes only the
shared client/contact/site foundation; it does not retroactively change this
report's verdict or close projects/tasks, PulseDesk asset/ticket/note/time,
TechDeck VLAN/subnet, TorqueShed, deployed SSO, or deployed health gates. The
full acceptance sequence must be rerun on the reviewed deployed revision.

This report does not mark any application production-ready. The final browser
gate produced 28 passing evidence records and 10 failures. Authentication,
entitlement filtering, SSO launch/return, coordinated logout, implemented-data
persistence, negative authorization, tenant isolation, production builds, and
health checks passed. Required domain workflows remain absent.

## Test topology

- Real Next.js production build on `http://127.0.0.1:5000`.
- Real Fastify API in production mode on `http://127.0.0.1:5001`.
- Host-preserving TLS proxy on `https://127.0.0.1:443` for every canonical
  `*.operatoros.net` origin.
- Disposable PostgreSQL 16 database on `127.0.0.1:55432`.
- Disposable registered users and tenant-scoped entitlement rows; no fake
  browser session or response stubs.
- Browser requests were executed in Chromium through the production host and
  cookie boundaries. Domain record creation used the live same-origin APIs
  from the authenticated module browser page.

Raw machine-readable evidence is emitted by
`apps/web/e2e/operatoros-final-acceptance.spec.ts` to the Playwright test
output as `operatoros-final-acceptance.json`. The final run was generated at
2026-07-16T16:06:16.140Z.

## Acceptance summary

Passed behavior:

- Anonymous OperatorOS entry and one-credential SSO login.
- My Apps showed exactly `pulsedesk`, `techdeck`, `torqueshed`, and
  `tradeflowkit` for the disposable entitlement set.
- All four modules launched through SSO and returned through shared My Apps
  navigation.
- Global logout revoked the platform session; every module became unusable and
  restarted authentication.
- Re-login reopened every module. Implemented records persisted with observed
  counts: TradeFlowKit 2, PulseDesk 1, TechDeck 3, TorqueShed 1.
- TradeFlowKit, PulseDesk, and TechDeck supported their registered deep routes
  and browser refresh. All four canonical module roots supported direct URL
  navigation.
- Expired sessions restarted canonical authentication.
- A disabled tenant entitlement returned 403 (`req-ba`) and did not enter the
  protected route handler.
- A client-supplied foreign tenant returned 403
  `SESSION_TENANT_MISMATCH` (`req-bc`) without foreign data.
- An unauthenticated direct module API call returned 401 (`req-bd`).
- `/healthz` and `/readyz` returned 200; readiness reported database healthy,
  auth configured, SSO-code encryption configured, and module registry
  configured.
- No module navigation link targeted an unsupported `/app` path.
- Profile, Billing, and Support primary destinations rendered without
  placeholder or “coming soon” content.

## Failure evidence

Every API failure below was also present in the Fastify structured request log
with the same `requestId`, method, normalized route, status 404, and module
context. Routes absent before authentication pre-handlers correctly have null
user and tenant log fields. The owning repository for every row is the
consolidated `C:\Dev\OperatorOS` runtime.

| Step | URL | Captured request | Captured response / server log | Request ID | Owning area | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | `https://tradeflowkit.operatoros.net/` | `POST /api/modules/tradeflowkit/tasks` with `projectId` and `title` | 404, `Route POST:/v1/modules/tradeflowkit/tasks not found` | `req-65` | TradeFlowKit API/domain | Client and job persisted, but distinct project/task contracts do not exist. Not fixed; requires a persistent project/task product increment and browser UI. |
| 8 | `https://pulsedesk.operatoros.net/` | `POST /api/modules/pulsedesk/clients` with `name` | 404, `Route POST:/v1/modules/pulsedesk/clients not found` | `req-6k` | PulseDesk API/domain | Department and PHI-minimized operational request persisted. Client/contact/asset/ticket endpoints do not exist. Not fixed; the requested MSP-style model also conflicts with PulseDesk's healthcare-operations boundary and needs an explicit domain decision. |
| 9 | `https://pulsedesk.operatoros.net/` | `POST /api/modules/pulsedesk/tickets/probe/notes` with internal note data | 404, `Route POST:/v1/modules/pulsedesk/tickets/probe/notes not found` | `req-6o` | PulseDesk API/domain | Internal-note and time-entry ticket contracts do not exist. Not fixed; depends on the step 8 domain decision and persistent ticket model. |
| 12 | `https://techdeck.operatoros.net/` | `POST /api/modules/techdeck/clients` with `name` | 404, `Route POST:/v1/modules/techdeck/clients not found` | `req-74` | TechDeck API/domain | Server, firewall, and runbook persisted. Client/site/VLAN/subnet contracts do not exist. Not fixed; requires persistent topology entities and UI. |
| 15 | `https://torqueshed.operatoros.net/` | `POST /api/modules/torqueshed/vehicles` with year/make/model | 404, `Route POST:/v1/modules/torqueshed/vehicles not found` | `req-7j` | TorqueShed API/domain | Generic diagnostic-case data persisted, but vehicle and diagnostic-session entities do not exist. Not fixed; requires first-class durable records and UI. |
| 16 | `https://torqueshed.operatoros.net/` | `POST /api/modules/torqueshed/diagnostic-sessions/probe/trouble-codes` with `P0302` | 404, route not found | `req-7l` | TorqueShed API/domain | Trouble-code and measurement child-record contracts do not exist. Not fixed. |
| 17 | `https://torqueshed.operatoros.net/` | `POST /api/modules/torqueshed/torque-assist` with `adapter: test` | 404, route not found | `req-7n` | Torque Assist service/API | No Torque Assist adapter contract exists. Not fixed; no simulated result was accepted. |
| 18 | `https://torqueshed.operatoros.net/` | `GET /api/modules/torqueshed/token-ledger` | 404, route not found | `req-7o` | Torque Assist metering | No tenant/user/session-scoped token ledger exists. Not fixed. |
| 19 | `https://torqueshed.operatoros.net/` | `POST /api/modules/torqueshed/marketplace/listings` with title and price | 404, route not found | `req-7p` | TorqueShed marketplace/community | Marketplace listing and community post contracts do not exist. Not fixed; no placeholder was treated as functionality. |
| 26 | `https://torqueshed.operatoros.net/diagnostics` | `GET /diagnostics` followed by browser refresh | HTTP 200 recovery shell, but no supported diagnostic route/screen; no API request ID applies | — | TorqueShed routing/UI | Not fixed; requires a registered durable diagnostic-session route. |

The same scenarios were rerun after fixing the eligible shared-routing defects.
The ten rows above reproduced consistently and are product-scope blockers, not
test-harness or environment failures.

## Defects fixed during acceptance

1. The canonical My Apps root automatically redirected tenant owners/admins to
   Tenant Command Center, so the module header's “My Apps” return did not land
   on My Apps. The role-based automatic redirect was removed; Command Center
   remains an explicit sidebar destination. The browser return steps now pass.
2. A production OperatorOS host requesting legacy `/app` could resolve to a
   localhost destination when `NODE_ENV` was non-production. Middleware now
   derives production canonicalization from the registered host, not process
   mode. Live retest: 308 to `https://app.operatoros.net/`, `Cache-Control:
   no-store`, hostile `next` discarded.
3. API listen failures previously emitted only a generic startup error.
   Startup logging now exposes safe socket metadata (`code`, `syscall`,
   `address`, `port`) without secrets; this identified and removed a stale
   local listener during acceptance.
4. Tenant/module pre-handlers sent the correct denial response but returned
   `undefined`, allowing Fastify to continue into a protected handler and log
   `FST_ERR_REP_ALREADY_SENT`. All authentication, tenant, entitlement, and
   write-denial branches now return the reply. Live retest: disabled
   entitlement `req-ba` returned one clean 403 with no handler execution or
   duplicate-reply error.
5. The API compiled successfully but its production `start` entry pointed at a
   nonexistent output path, and the workspace SDK resolved TypeScript source
   under plain Node. The API build now emits the SDK, the SDK exposes a
   production-only compiled export, and `start` uses the actual emitted API
   entrypoint with Node's `production` condition. The compiled production API
   started successfully and served the final acceptance run.

## Final application matrix

| Application | SSO | Return navigation | Dashboard | CRUD | Persistence | Tenant isolation | Authorization | Deep links | Logout | Production build | Health check | End-to-end result | Outstanding defects |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OperatorOS | Pass | Pass | Pass; exact entitlement set | Pass for existing identity/tenant/entitlement surfaces | Pass | Pass | Pass | Pass | Pass; global revocation verified across all modules | Pass | Pass | **FAIL — ecosystem release gate** | Child-module core workflows below remain incomplete; no deployment readiness claim. |
| TradeFlowKit | Pass | Pass | Pass | **Partial**: client/job pass; project/task fail | Pass for client/job | Pass | Pass | Pass and refresh pass | Pass | Pass in consolidated build | Pass in shared runtime | **FAIL** | Persistent project/task API and browser workflow absent. |
| PulseDesk | Pass | Pass | Pass | **Partial**: department/request pass; requested client/contact/asset/ticket/note/time fail | Pass for department/request | Pass | Pass | Pass and refresh pass | Pass | Pass in consolidated build | Pass in shared runtime | **FAIL** | Requested data model absent and conflicts with the established healthcare-operations boundary. |
| TechDeck | Pass | Pass | Pass | **Partial**: server/firewall/runbook pass; client/site/VLAN/subnet fail | Pass for implemented records | Pass | Pass | Pass and refresh pass | Pass | Pass in consolidated build | Pass in shared runtime | **FAIL** | Persistent client/site/VLAN/subnet topology and UI absent. |
| TorqueShed | Pass | Pass | Pass | **Partial**: generic diagnostic case passes; required vehicle/session/code/measurement/assist/ledger/marketplace/community fail | Pass only for generic diagnostic case | Pass | Pass | **Fail** for `/diagnostics`; root direct URL passes | Pass | Pass in consolidated build | Pass in shared runtime | **FAIL** | First-class diagnostic model, Torque Assist adapter, token ledger, marketplace, community, and diagnostic deep route absent. |

## Verification results

- Final production-host acceptance gate: **28 pass evidence records, 10 fail**.
- Production-host SSO browser matrix: **2/2 passed** after rate-limit state was
  reset by restarting the disposable API process.
- Full isolated-PostgreSQL API suite: **670 tests; 664 passed, 0 failed, 6
  explicit live-HTTP skips** after the routing fix. A prior run against the
  acceptance database was discarded because pre-seeded catalog rows polluted
  test fixtures.
- Focused ecosystem/navigation regression suite: **15/15 passed**.
- Targeted database-backed tenant/module RBAC suite: **8/8 passed** against a
  clean disposable PostgreSQL database after the pre-handler fix.
- Root typecheck: API, runner gateway, and web **passed**.
- Root production build: API (including the workspace SDK), runner gateway,
  and Next web **passed**; the compiled API production start was exercised.
- The same build without `INTERNAL_API_URL` failed before compilation with the
  expected configuration error; the configured build used
  `INTERNAL_API_URL=http://localhost:5001` and passed.
- Final post-fix web typecheck and Next production build: **passed**.
- Live HTTPS `/healthz`: **200**.
- Live HTTPS `/readyz`: **200**, database/auth/SSO/registry healthy or
  configured; Stripe, email, Twilio, and OpenAI intentionally disabled in the
  local acceptance environment.
- Static placeholder scan found only input placeholder attributes, catalog
  status handling, and cards explicitly labeled `Migration pending —
  disabled`; no unfinished primary navigation destination was presented as
  functional.

## Release decision

No application in this matrix is production-ready under the supplied release
rule. PulseDesk's local product gap is closed by the Phase 6 follow-up, but the
ecosystem still requires the later module phases beginning with TorqueShed,
then a fresh empty-database acceptance run and the separately authorized
deployed-target gate on the reviewed cumulative revision.

## Phase 7 source remediation note — 2026-07-18

The observations above remain the authoritative result for the older tested
revision and were not rewritten as passes. The Phase 7 source branch adds
first-class vehicles, diagnostic sessions, trouble codes, measurements, and a
supported `/diagnostics` native deep route. The acceptance script now carries
the returned vehicle/session identifiers instead of hard-coded `probe` IDs.
Torque Assist/ledger and marketplace/community remain later-phase failures by
design.

This suite was **not rerun** because Docker Desktop could not start its daemon
and no isolated PostgreSQL runtime was available. No deployed or
production-ready claim is inferred from source, typecheck, or build evidence.

## Phase 8 source remediation note — 2026-07-18

The historical failure rows above remain unchanged. The Phase 8 branch adds
server-loaded diagnostic context, strict evidence/safety-ranked Torque Assist
results, shared provider controls, OperatorOS-priced token checkout, signed
raw-body payment/refund handling, and an append-only computed-balance ledger.
The acceptance script no longer accepts a client-selected test adapter: it
creates a server-owned purchase intent, verifies a signed deterministic-test
payment event, runs Assist, and requires exactly one matching purchase credit
and one matching diagnostic debit.

This suite was **not rerun**. The workspace typecheck, production build, and
core preflight pass, but Docker still does not provide an isolated PostgreSQL
runtime. No source or build assertion is substituted
for signed-webhook, concurrency, persistence, runtime, browser, provider, or
deployed evidence.

## Phase 9 source remediation note — 2026-07-18

The historical failure rows and release decision above remain unchanged. The
Phase 9 branch adds tenant/user-authorized persistent Marketplace listings,
categories, search/filter/sort/page, saved items, in-app contact/messages,
expiry/renewal, scanned images and reports; Community profiles/preferences,
follows/blocks, posts/topics/tags/comments/reactions/media; and owner/admin/
manager moderation with an append-only action ledger. ADR-0018 and the native
UI explicitly exclude checkout, escrow, shipping/tracking, tax, title,
inspection, reputation, guarantee, dispute and refund claims.

Acceptance step 19 now creates valid draft listing and post payloads and then
publishes both using returned IDs and optimistic versions. The suite was
**not rerun** because Docker's Linux-engine info endpoint returns HTTP 500 and
no isolated PostgreSQL/runtime is available. Source contracts, typecheck,
build and preflight are not substituted for database persistence, scanning,
tenant/block privacy, moderation trigger, browser, or deployed evidence.
