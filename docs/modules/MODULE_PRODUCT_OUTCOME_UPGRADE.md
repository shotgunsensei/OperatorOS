# Module product outcome upgrade

Status: **implementation source-published; final follow-up local guards, build, full exact-host, and visual gates green; final GitHub gate, production v60 apply, redeployment, providers, Stripe, and deployed acceptance open**<br>
Date: 2026-09-05

## Follow-up exact-host and visual acceptance

GitHub release-gate run `33949354505` passed 13 of 14 stages and blocked on the
combined browser gate. This was not a product authorization defect: v60 had
removed the fixture's accidental legacy-plan access, the fixture queried the
obsolete module status `active`, and OperatorOS correctly rendered an
organization-level entitlement denial. Eight selectors also still described
the pre-alignment engineering copy. The denied screens were rejected rather
than recorded as new baselines.

The corrected browser profiles use explicit tenant-scoped, grandfathered pre-
v60 compatibility identities and grant only current `live` modules. Both local
Playwright configs, the runner, and the mutating helpers invoke the shared local-
browser guard before application requests. It requires a marked loopback
PostgreSQL database and bounded API, web, proxy, listener, root, and supported
navigation targets. The standalone proxy independently rejects an unsafe
upstream, listener, or port without database authority. Production-artifact deterministic
adapters additionally require `CI=true`, explicit deterministic-provider mode,
the disposable marker, and the independently validated loopback database URL.

The entitlement and customer-language repair produced passing focused workflows
for PulseDesk, TechDeck, TorqueShed, BrandForgeOS, Deploy Ops, CallCommand AI,
and SnapProofOS, including the TechDeck literal path. On the settled guard diff,
Windows visual comparison passed 4/4 in 1.6 minutes. All 78 approvals remain
hash-bound, and the 13-module static contract reports zero failures. The full
optimized exact-host suite passed 21/21 in 5.7 minutes, including one-credential
launch across every available child application, direct and sibling-tab SSO,
host-only logout, deep-link reauthentication, tenant denials, persisted
workflows, accessibility, responsive layouts, and public compliance routes. The
prior Linux comparison passed 4/4 as supporting evidence. OutCall remains
intentionally denied by its source-recovery lock, and the exact-revision GitHub
Linux matrix remains the final source-publication gate, including a fresh Linux
comparison.

This browser identity is suitable for SSO, route, workflow, persistence,
accessibility, and visual compatibility. It is not a simulated v60 purchase and
does not prove Application Stack checkout, one-core enforcement, Stripe
customer or webhook behavior, or seat activation. Those remain covered by the
separate forward-commerce database contracts and require deployed Stripe
acceptance. A fresh terminal-green GitHub release gate is still required before
this follow-up source is called release-ready.

## Current release-candidate integrity clarification

“Present” means the described path exists in source and passed the cited local
or disposable-database checks on the revision named. An earlier result does not
silently certify a later follow-up diff. “Present” never means that production,
its database, a live provider, Stripe, or an authenticated deployed browser has
accepted the change.

Every connected-workflow request must include the reviewed source version, and
delivery reloads and compares the exact organization-owned source before
writing. Configured CallCommand rules derive the expected version from the
analyzed call's current update timestamp. A changed source is rejected instead
of silently exported. Semantic identity prevents a second accepted operation,
while an eligible dead-lettered operation can be deliberately queued again as
the same business operation after correction.

The TorqueShed-to-SnapProofOS workflow adds record-level authorization to the
application checks at both queue and delivery: a regular member must own the
diagnostic or it must be shared with the organization. Manager-authorized
TorqueShed-to-FaultlineLab transfer remains limited to managers. Workflow
administrative activity is limited to tenant or platform administrators and is
then filtered to runs whose source and destination applications they may access.
Exact-run detail follows a separate policy. The creator, a tenant/platform
administrator, or a person with manager access in both applications can inspect
the complete run. For nine tenant-owned outcomes, a non-creator with write
access in both applications can open the already-created shared result, but the
original actor, request idempotency key, and request fingerprint are omitted. A
non-creator ordinary user cannot open the actor-scoped BrandForgeOS-to-Deploy
Ops run. Viewers without the required authority and cross-tenant callers receive
not-found. BrandForgeOS-to-Deploy Ops is actor-scoped for deduplication and
ordinary-user access; authorized tenant oversight remains intact.

BrandForgeOS's logo result is deliberately local and recoverable: four useful
compositions, four design styles, three palettes, three background treatments,
an optional tagline, responsive previews, editable SVG, standard and 2x PNG
downloads, private scanned PNG save, safe SVG text handling, upload limits,
saved-kit colors, and a 30-day recovery period for a replaced generated logo.
The existing primary logo remains active until a person explicitly saves the
reviewed candidate. Canva and Figma are manual import destinations, not
connected providers.

No external or live provider, production deployment, billing/Stripe,
production-database, customer-data, DNS, or deployed authenticated browser
operation was performed
for this upgrade. Workflow persistence, authenticated exact-host workflows, and
database release v60 were exercised only against local disposable PostgreSQL,
and the production artifact was built locally. Deployed exact-host browser and
mobile, deployed identity, live-provider, monitoring, backup/restore, and
rollback evidence remain open. The owner approved the single flagship-stack
model, and implementation commit `5024bfce4a16cd5fd7d47143d5057879316f3981`
was successfully source-published to GitHub `main`. Production database and
provider mutations remain separate gates.

## Fresh local verification

- The final complete API aggregate on the settled guard diff ran on a disposable
  PostgreSQL 16 database and reported **1,444 tests: 1,444 passed, 0 failed, 0
  skipped, 0 cancelled, and 0 todos** in **629,733.0017 ms**. It includes the
  provider-isolation and browser-safety regressions; the immutable final commit's
  GitHub aggregate remains decisive.
- `corepack pnpm typecheck` passed for `apps/api`, `apps/runner-gateway`,
  `apps/web`, and `apps/torqueshed-native`.
- `corepack pnpm lint` passed the repository-defined ESLint scope with
  `--max-warnings=0`.
- The root unit/compiler gate passed **52/52**, the release-safety quality gate
  passed **20/20**, and `git diff --check` reported no whitespace errors.
- The disposable PostgreSQL 16 integration gate passed **31/31**. Clean v60
  apply passed in 18,253 ms, immediate idempotent reapply in 1,867 ms, and
  independent verify-current in 956 ms with `forward_commerce_contract` last.
- `corepack pnpm build:production` passed deployment-scope verification, the
  56-case FaultlineLab catalog check and its four compiler tests, all four
  typechecks, API/runner compilation, and Next 15.5.23 production generation of
  35/35 pages.
- `corepack pnpm preflight:production -- --core` failed closed as intended
  because this local process did not contain the production database, secrets,
  production environment flags, exact 13 application URLs, disabled-runner
  declaration, or trusted-proxy declaration. No secret value was printed.

These results are source/local and disposable-database evidence. They are not
production-database, live-provider, Stripe, DNS, deployment, or deployed
authenticated exact-host browser evidence.

## Why this change exists

OperatorOS already had broad organization-scoped application capability, but
the customer experience often described storage, record lineage, and internal
system boundaries before it explained the useful business result. The most
valuable cross-application workflows were available only through an
administrator-facing activity console. That made capable applications feel
like disconnected record organizers.

This upgrade establishes one customer-value contract for every canonical
application and exposes the safest existing cross-application adapters at the
record where a customer needs them. It does not replace the underlying module,
duplicate authorization, or invent provider success.

## Customer outcome standard

The shared SDK now defines, for every application, a plain-language promise,
primary buyer, first useful result, tangible deliverables, complete primary
workflow, completion condition, supported connections, and honest setup
boundary. Catalog, pricing-card, and marketing descriptions project from that
same contract.

| Application | Customer job it finishes | First useful result |
| --- | --- | --- |
| TradeFlowKit | Move service work from inquiry through job, quote, invoice, and payment | Capture a lead and turn it into scheduled work with a visible next action |
| PulseDesk | Route non-clinical healthcare operations work through ownership, service targets, escalation, and resolution | Turn one operational request into assigned work with a requester update |
| TechDeck | Move a client support or system concern through technician work to a reusable resolution | Connect one issue to the affected client/system and preserve the complete action trail |
| TorqueShed | Move a vehicle concern through tests and repair to a shareable verified history | Add one vehicle and record the concern, findings, and next diagnostic step |
| FaultlineLab | Turn realistic troubleshooting practice into scored coaching and a targeted next assignment | Complete one challenge and see the actions and reasoning behind the score |
| Operator Pool Hall | Give OperatorOS members a free practice and team-play break | Start a complete rules-based rack without another purchase |
| BrandForgeOS | Turn brand decisions into an approved campaign package and measurable follow-up | Complete a brand brief and produce a focused campaign direction |
| SnapProofOS | Turn field work into an approved customer-ready proof package with clear findings, costs, and controlled access | Create a field job and capture the first dated photo or finding against it |
| StudyForge AI | Turn trusted notes into a full study pack, practice loop, and next-session recommendation | Create a summary, terms, flashcards, quizzes, review sheet, and plan from one source |
| Deploy Ops | Turn one business brief into a coordinated campaign-launch package the team can review, export, and carry into its publishing tools | Generate campaign copy, visual-production briefs, a launch checklist, and an approval-ready handoff |
| CallCommand AI | Turn an important call into an owned sales, service, or operations follow-up | Configure a receptionist, run a no-cost simulation, and inspect the resulting action |
| Script Ops | Turn a one-off infrastructure fix into reviewed, versioned automation ready for deliberate use | Import or create one script, analyze it, and move an exact version through approval |
| OutCall | Prepare a private call to the user's own verified phone for a planned exit from an uncomfortable situation | Verify the user's own number and prepare an immediate or scheduled request |

Operator Pool Hall remains a free team/community benefit. OutCall remains
coming soon and must not be sold or launched until its production and real
provider gates pass.

## Ten working connected outcomes

The customer-facing workflow component previews the exact records to be
created, requires an explicit confirmation, queues the existing signed and
tenant-scoped workflow, follows its persisted status, and links to the created
record. Browser retry identity is stable for the source version and selected
outcome, while server idempotency prevents duplicate accepted runs.

| Starting point | Confirmed result |
| --- | --- |
| TradeFlowKit active job | Connected SnapProofOS customer, field job, and draft closeout report |
| SnapProofOS approved report with verified PDF and originating TradeFlowKit job | PDF attached back to that exact TradeFlowKit job |
| Completed, analyzed, non-simulated CallCommand call | A selected TradeFlowKit lead or customer/job |
| Completed, analyzed, non-simulated CallCommand call | A PulseDesk operations request after a person confirms the summary is operations-only and contains no patient or clinical data |
| Completed, analyzed, non-simulated CallCommand call | A TechDeck support ticket |
| Resolved TechDeck ticket or PulseDesk operations request | Unpublished FaultlineLab authoring draft with a usable case narrative, evidence clues, progressive hints, diagnostic actions, remediation guidance, and common identifiers masked, after manager author and privacy review |
| TorqueShed diagnostic | Connected SnapProofOS diagnostic job, copied observations, and draft report |
| Verified or resolved TorqueShed diagnostic | Unpublished FaultlineLab automotive training draft built from the diagnosis, observations, tests, remediation, and common-identifier masking, after privacy review |
| BrandForgeOS campaign | Deploy Ops campaign-launch package with copy, up to nine visual-production briefs, launch work, and an approval starting point |
| Approved Script Ops revision | One non-executing TechDeck draft runbook document, its first revision, and protected file-integrity record |

These are ten registered workflow contracts; the resolved-support contract
accepts either TechDeck or PulseDesk as its reviewed source. CallCommand
configured rules evaluate only allowed conditions against a completed,
provider-originated call, bind the expected source version, and do not run for
simulations. CallCommand-to-PulseDesk is deliberately per-call only: it
requires explicit confirmation that the summary is limited to facility,
equipment, supply, vendor, or department operations and contains no patient or
clinical data, and cannot be configured as an unattended rule.

## Named application improvements

- **TradeFlowKit:** quotes, invoices, payments, work, and customer decisions
  remain connected, but internal status controls now say “Mark as sent” and
  “Record customer acceptance/decline.” Confirmation explains that these
  actions do not deliver an email or independently prove a customer's action;
  a secure link and separately confirmed response are handled explicitly.
- **FaultlineLab:** challenge authors now have a seven-stage guided editor with
  readiness checks, server validation feedback, learner preview, evidence links,
  and safe simulated tests. Training handoffs build a meaningful private first
  draft from the recorded problem, observations, likely-cause alternatives,
  diagnostic actions, progressive hints, and remediation instead of placeholder
  exercise text. The imported first revision remains unpublishable until a
  trainer reviews and saves a new revision.
- **BrandForgeOS:** a saved brand kit can now generate deterministic wordmark,
  lockup, badge, and monogram concepts across four styles, three palettes, and
  three background treatments; preview them responsively; download editable SVG
  or standard/2x PNG; and save a selected PNG through the private scanned-
  attachment service. The files can be imported into Canva, Figma, or another
  design tool for refinement; there is no live OAuth connection and
  BrandForgeOS does not claim a provider-side result. A reviewed campaign can
  create a Deploy Ops campaign-launch package. External publication is recorded
  only through the dedicated confirmed-publication action with a supplied
  provider reference.
- **SnapProofOS:** field teams can assemble an approved PDF or DOCX report and
  create an expiring, revocable share link with access history. The
  return-to-job action appears only for an approved report that came from
  TradeFlowKit and already has a generated PDF, and attaches that exact verified
  file to the originating job. Neither a link nor an attachment claims that a
  customer received or opened it, an invoice was issued, payment was collected,
  or job status changed.
- **StudyForge AI:** the dashboard now leads to the next useful study session or
  the first complete study-pack workflow. Study-pack creation checks extracted
  concepts, duplicate material, topic balance, source-grounded multiple-choice
  questions, and quality metadata before returning summaries, terms,
  flashcards, quizzes, short-answer practice, review sheets, and study plans.
  Quiz attempts and flashcard-session writes now require write authorization.
- **TechDeck:** operational, status, and compliance reports can be opened in the
  application, downloaded as JSON or CSV, and packaged with their supporting
  records in a compliance ZIP. Exact report and record routes load the requested
  item even when it falls outside the first bounded list page.
- **Deploy Ops:** the dashboard now leads from a business brief through
  versioned campaign copy, up to nine visual-production briefs with the current
  plan clearly identified, assignments,
  milestones, required files, approval checks, and integrity-checked handoff
  exports. It records an external launch only after the checklist is complete,
  a person explicitly confirms the outside result, and a reference is supplied.
  It does not deploy software, change DNS, publish a website or ad, send a
  campaign, purchase media, or alter a provider environment.
- **Script Ops:** an approved exact revision can become technician-ready draft
  documentation in TechDeck. It remains non-executing until a person downloads
  it and uses a separately authorized execution tool.

## Authorization and safety invariants

- OperatorOS remains the only identity, organization, membership, role,
  subscription, billing, entitlement, and application-access authority. The
  server-provided access level controls whether editing controls are available;
  the API independently enforces every read and write, so a browser-supplied
  role or a visible button never grants access.
- A customer outcome workflow requires current write access to both its source
  and destination applications when queued and again when delivered.
- The server binds source module, source kind, and source record type to the
  registered workflow. The browser cannot redefine them.
- Every adapter reloads the tenant-owned source record and validates its real
  status and expected version before creating destination records. Changed
  source records fail closed instead of silently exporting stale content.
- Newly published workflow events use an HMAC-SHA-256 signature-envelope v2
  that binds the trusted organization, workflow run, workflow contract, source
  and destination applications, consumer, actor, source reference, event and
  aggregate identity, idempotency identity, source deep link, payload, and
  correlation/causation chain. Delivery rejects an unsupported envelope version
  or mismatched payload/signature. Existing signature-envelope v1 rows remain
  verifiable and deliverable only while their signing material is retained in
  the controlled current/previous-key compatibility window. Nine shared
  business outcomes deduplicate for the whole organization, so another authorized employee cannot
  recreate the same result. BrandForgeOS-to-Deploy Ops remains actor-scoped
  because generation allowance and authorship are personal. An eligible failed
  run can be deliberately retried without creating a second business operation.
- Training transfers mask common email, phone, government-identifier, and payment-number patterns, remain unpublished, and require a manager's privacy review before creation plus a trainer's full privacy and accuracy review before publication. The masking is not represented as comprehensive de-identification.
- Provider purchase, publishing, deployment, DNS changes, paid spend, customer
  communication, billing, and script execution are never implied by these
  internal application workflows.

## Data-fabric signing-key operation

Production should use a dedicated event-signing secret instead of coupling
queued workflow delivery to the shared secret-vault key. The implementation
supports `DATA_FABRIC_EVENT_SIGNING_KEY` and a unique, non-secret
`DATA_FABRIC_EVENT_SIGNING_KEY_VERSION`; this worktree did not inspect or change
the signing material used by the deployed runtime. The key must be a securely
generated 32-byte value encoded as 64 hexadecimal characters or base64, stored in the
deployment secret manager, and never committed, logged, or placed in a browser
environment variable. The shared secret-vault key remains a compatibility
fallback for deployments that have not completed this adoption; the
deterministic fallback is available only in a test environment.

Use this sequence for adoption or rotation:

1. Inspect pending, retrying, processing, and deliberately retryable
   dead-letter workflow events, and choose a new unique current version.
2. Deploy the new current key and version together. At the same time, place the
   immediately preceding key and its exact version in
   `DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY` and
   `DATA_FABRIC_EVENT_SIGNING_PREVIOUS_KEY_VERSION`. On first adoption, if
   existing events were signed with the shared secret-vault key, that shared
   key and its configured version are the previous pair for this window.
3. Restart the API and background workers as one controlled release. Confirm
   that new events carry the new version and that events carrying the previous
   version continue to verify and finish.
4. Keep the previous pair until every older event has completed or an operator
   has explicitly decided that a failed event will never be retried. Then clear
   both previous variables together in a later release.

Only one previous key/version pair is accepted. Never reuse a version, configure
only half of the previous pair, or make the previous version equal to the
current version; those states fail closed. Rotating either signing key without
the matching version and overlap window can strand queued or retryable work.

## Approved commerce contract

The owner approved one forward-sale model for this release:

- OperatorOS, TorqueShed, FaultlineLab, and Operator Pool Hall are free.
- A tenant may buy one monthly flagship: TradeFlowKit at $149, PulseDesk at
  $149, or TechDeck at $99.
- The tenant receives five included seats and selects one of six eligible
  companions at no additional charge: SnapProofOS, BrandForgeOS, StudyForge
  AI, Deploy Ops, CallCommand AI, or Script Ops.
- Additional eligible companions are $29/month each and additional tenant seats
  are $15/month each.
- OutCall remains excluded and coming soon.

The release reconciles the public offer with the executable commercial
boundary. New Starter, Pro, Elite, annual, plan-change, reactivation, and
individual application add-on sales fail closed with stable retirement codes.
Existing contracts, Stripe references, and quota history remain available for
grandfathered access and safe cancellation instead of being deleted. Only
legacy subscriptions marked during the one-shot release-v60 promotion can
continue to grant legacy application access; creating a plan row later cannot
silently restore that retired access model.

Stack billing is tenant-owned. The tenant owner, or an audited platform
superadministrator acting within server-validated authority, may start checkout,
change the included companion, or open the Stripe portal. Tenant administrators
have billing visibility without contract-mutation authority. Checkout is
monthly-only, validates the shared six-companion allowlist, persists and reuses
the tenant's Stripe customer, blocks a second flagship stack, and waits for a
signature-verified Stripe event before activating paid entitlements. Core,
free, coming-soon, and legacy individual-price rows no longer appear as
per-module prices that an administrator can create or synchronize.

Release v60 appends `forward_commerce_contract` after the exact 59 manifest
entries, IDs, kinds, and order present on `origin/main`. This is a manifest-
identity and ordering statement; it does not claim that implementation bodies
used by cumulative earlier operations are byte-for-byte unchanged. Production
promotion requires a reviewed backup followed by a separate one-shot
`db:apply` and `db:verify` before the verify-only Replit serving runtime can
accept the new artifact. Live production remains v59 until that promotion and
the subsequent Replit redeploy are proven. This source change does not grant
permission to mutate the production database or create or synchronize live
Stripe Products or Prices.

## Acceptance boundary

This product-outcome brief does not replace the authoritative implementation,
parity, release, or acceptance reports, which carry exact command results and
gate evidence. Final source/local gates pass, but that evidence does not
establish that production contains or accepts the release-v60 candidate.
Production acceptance still requires exact published and deployed identity,
production v60 verification, authenticated exact-host desktop/mobile journeys
with realistic organization roles, provider checks where applicable,
monitoring, restore, and rollback evidence.

Provider boundaries also remain explicit:

- Canva and Figma are reviewed file-import destinations; no authenticated API
  connector is installed or represented as connected.
- Deploy Ops has no software-deployment, DNS, publishing, messaging, or paid
  media authority. It prepares a campaign package and records a separately
  verified external result.
- PulseDesk direct mailbox adapters remain unavailable in this release.
- CallCommand AI live calling still requires controlled Twilio, OpenAI, Stripe,
  callback, and exact-host acceptance; a simulation is not live-call evidence.
- OutCall remains coming soon until its production activation and real-provider
  acceptance gates pass.

No production database, billing account, provider, customer data, deployment,
DNS record, or traffic is changed by this source/local work. The approved
commercial contract is implemented in source, but live Stripe catalog
configuration, reviewed production backup, manual release-v60 apply/verify,
Replit redeployment, and authenticated purchase/portal acceptance remain
separate operator-controlled gates.
