# OperatorOS engineering overview

Snapshot: 2026-09-29 | commit `ee9ca05e8346bdb1770932029ae8a9a8d682ef0f`

All case studies are illustrative scenarios, not measured customer outcomes. See the PDF for architecture and platform discussion.

## TradeFlowKit

Keep service work connected to cash.

A shared operations workspace for service businesses: customer context, execution, commercial documents, and collections remain connected throughout the job lifecycle.

Access: Core product

- **Lead and customer management:** Capture leads; qualify and convert opportunities; use shared customer identity, contacts, search, and bounded CSV imports.
- **Jobs and recurring work:** Schedule and assign jobs; retain owners, dates, status, recurring templates, pause controls, and run history.
- **Tasks and workflow stages:** Track job-scoped tasks, dependencies, comments, tags, workflow transitions, and personal or shared saved views.
- **Quotes and conversion:** Build multi-line quotes; record decisions; convert to jobs or invoices with duplicate-safe server operations.
- **Invoices and payments:** Maintain invoice items, partial/full payment records, balances, numbering, and history; connected settlement needs provider acceptance.
- **Customer communication:** Use scoped public views, customer portals, and consent-aware email/SMS outbox actions with explicit delivery state.
- **Reporting and accounting handoff:** Inspect workload and revenue from persisted records; export invoice CSV, QuickBooks IIF, and Xero-oriented CSV files.
- **Proof and recovery:** Create SnapProofOS work from a job, return the approved PDF, and use guarded archive/restore workflows.

**Boundary:** Live payments and outbound delivery require configured, accepted providers. Accounting exports are files, not live QuickBooks/Xero synchronization. Recording a sent state is not email delivery.

### Scenario 1: The unbilled service call

**Situation:** A field-service team finishes a repair, but the invoice handoff is lost between the technician and office.

**Workflow:** Link the customer, job, task completion, and quote. Use the workday brief to find completed jobs without an invoice, then review and create the commercial record.

**Expected output:** A job-linked invoice with an owner and an explicit balance; no automatic charge is implied.

**Measure in a pilot:** Completed jobs without invoices; days from completion to invoice.

### Scenario 2: Recurring maintenance without duplicate jobs

**Situation:** A contractor repeats the same service at several customer sites and recreates the work manually each month.

**Workflow:** Define recurring job templates, inspect the next run, and let the supported scheduler create the dated job. Pause a schedule during an outage and inspect its history before resuming.

**Expected output:** Repeatable work records whose schedule/run identity prevents replay from creating duplicates.

**Measure in a pilot:** Manual setup time; duplicate jobs per scheduled run.

### Scenario 3: A defensible proof-to-payment handoff

**Situation:** An office needs to show what was done before following up on an unpaid installation.

**Workflow:** Create SnapProofOS work from the originating job. Review the captured evidence and approved report, return its PDF to that exact job, then review invoice and recorded payment state.

**Expected output:** Commercial context and approved proof remain linked. A report attachment does not assert customer receipt.

**Measure in a pilot:** Jobs with linked approved proof; time spent reconstructing an invoice history.

## TechDeck

Make resolution knowledge reusable.

An MSP and IT operations console that binds support work to client, configuration, network, procedure, and evidence context. Resolution Intelligence preserves what actually happened, including failed attempts.

Access: Core product

- **Service operations:** Manage client/site-linked tickets, assignments, comments, time, requester updates, and accountable closeout.
- **Configuration and lifecycle inventory:** Track typed configurations, asset context, warranty/renewal dates, lifecycle changes, and related records.
- **Network and IPAM records:** Maintain network, subnet, address, and topology relationships as documented operational context.
- **Versioned documentation:** Edit knowledge articles and runbooks with revisions, backlinks, review, approval, publication, and private attachments.
- **Resolution evidence intake:** Import structured closeouts with screened source material, immutable revisions, validation, warnings, failures, and side effects.
- **Exact and full-text retrieval:** Search identifiers and narrative; inspect evidence, components, action chronology, revision history, and native links.
- **Evidence-derived knowledge:** Preview deterministic KB/runbook drafts, retain source citations, link multiple incidents, and block stale-source approval.
- **Reports and controlled connections:** Use persisted dashboards, client reports, portal/status workflows, scoped API tokens, and signed outbound webhooks.

**Boundary:** Runbooks do not execute scripts. Inventory is not live discovery or endpoint control. Phase 5 semantic retrieval is source-implemented and provider-disabled; ordinary exact/text search is independent.

### Scenario 1: A recurring application failure

**Situation:** A second engineer inherits a symptom that resembles an earlier incident, but a copied final fix omits a harmful intermediate step.

**Workflow:** Search the exact error or component. Review the prior chronology, failed action, observed side effect, warning, and validation before choosing a procedure for the new client issue.

**Expected output:** An evidence-informed plan with uncertainty retained. The previous outcome does not prove the same root cause now.

**Measure in a pilot:** Time to relevant evidence; repeated failed actions avoided during a reviewed pilot.

### Scenario 2: A client infrastructure handover

**Situation:** An MSP technician leaves and the replacement must reconstruct dependencies from tickets and isolated notes.

**Workflow:** Connect the client's sites, configurations, IPAM records, lifecycle dates, and versioned documentation. Link current tickets and supporting evidence, then prepare a client-facing operational report.

**Expected output:** A navigable service context with named records and a reusable procedure trail.

**Measure in a pilot:** Time to locate the affected system, owner, and current approved procedure.

### Scenario 3: From one repair to a maintained runbook

**Situation:** A difficult incident is resolved, but the team needs repeatable guidance that will not silently drift from its source.

**Workflow:** Preview an evidence-derived runbook, review the cited sections, save a draft, and submit it through approval. When source evidence changes, inspect the stale warning and prepare current guidance.

**Expected output:** A reviewed document with source-revision links and access inherited from every linked incident.

**Measure in a pilot:** Time from closeout to reviewed guidance; stale-source publications prevented.

## PulseDesk

Coordinate the work around care.

Healthcare operations coordination for facilities, equipment, supplies, departments, and vendors. The work model captures operational ownership and response history while minimizing patient information.

Access: Core product

- **Facilities and departments:** Maintain directory-linked organizations, facilities, requesters, departments, and operational context.
- **Operational request intake:** Create numbered requests with structured classification, equipment-issue prefill, tags, and supporting records.
- **Queues, teams, and assignment:** Route work to an accountable team or owner; prioritize through queues, filters, saved views, and bulk actions.
- **Targets and escalation:** Track service targets, time, at-risk work, escalation paths, and response history.
- **Notes and requester updates:** Keep internal coordination separate from requester-facing replies; retain private attachments and work history.
- **Equipment and vendor coordination:** Associate operational assets with facility issues, supply requests, service vendors, and department needs.
- **Knowledge and reporting:** Use operational knowledge, persisted dashboards, configuration, preferences, trend reporting, and exports.
- **Reviewed handoffs:** Accept operations-only CallCommand requests and prepare privacy-reviewed resolved-work drafts for FaultlineLab.

**Boundary:** No patient chart, clinical decision, EHR/PACS integration, or HIPAA certification is claimed. Direct Microsoft 365, Google Workspace, IMAP, and SendGrid mailbox intake is unavailable in this release.

### Scenario 1: An equipment issue between departments

**Situation:** An imaging department reports an unavailable workstation or equipment accessory; responsibility spans facilities and a vendor.

**Workflow:** Create an operations-only request, associate the facility and asset, assign an owner, set the service target, and retain vendor coordination and requester updates in the work record.

**Expected output:** A visible accountable path to restoring operational availability without storing a patient chart.

**Measure in a pilot:** Unassigned age; response time; handoffs without a named owner.

### Scenario 2: A supply delay before a busy shift

**Situation:** A department has an unresolved supply request with a deadline, while the next shift sees only a message thread.

**Workflow:** Classify the supply need, associate the department and vendor, record the due target, and use the queue to escalate the delay. Close the request with the actual resolution and timing.

**Expected output:** A shared request history that survives shift changes and shows what remains open.

**Measure in a pilot:** Overdue operational requests; time spent reconstructing shift context.

### Scenario 3: Learning from repeated facility incidents

**Situation:** Several resolved facilities requests reveal a recurring troubleshooting mistake useful for staff training.

**Workflow:** Review the operational history and select a suitable resolved request. Managers with access to both applications review privacy and prepare an unpublished FaultlineLab draft for trainer revision.

**Expected output:** A controlled training starting point; the imported first revision cannot publish directly.

**Measure in a pilot:** Repeat incident patterns identified; reviewed training cases produced.

## TorqueShed

Preserve the reasoning behind the repair.

A garage and automotive diagnostics workspace for vehicle history, structured tests, workshop records, and shareable proof. Torque Assist adds governed guidance when its provider and credit controls are configured.

Access: Free companion; optional metered Assist

- **Garage and service history:** Record vehicles, mileage, owner concerns, repairs, maintenance, and service chronology.
- **Structured diagnostics:** Organize symptoms, codes, observations, likely causes, tests, findings, and verification.
- **Torque Assist:** Request context-aware diagnostic guidance through OperatorOS-owned AI and usage/token accounting.
- **Build journals and cost context:** Track build stages, parts, labor, costs, notes, and supporting media.
- **Repair reports and collaboration:** Create workshop exports and repair records; use supported live-bay and sharing workflows.
- **Community:** Maintain profiles, preferences, posts, comments, reactions, follows/blocks, private media, and moderation records.
- **Marketplace listings:** Search and save listings; contact sellers; retain conversations, expiry, reports, and listing history.
- **Proof and training handoffs:** Prepare diagnostic proof in SnapProofOS and reviewed automotive challenge drafts in FaultlineLab.

**Boundary:** Physical tests and repair judgment remain with the technician. Marketplace listings do not imply escrow, shipping, buyer protection, or reputation guarantees. AI and native-device acceptance are separate gates.

### Scenario 1: Diagnose before replacing parts

**Situation:** A shop receives an intermittent vehicle complaint with several plausible causes and incomplete prior history.

**Workflow:** Record symptoms, codes, and earlier work, choose the next physical test, and capture its findings. Use Assist only as reviewed guidance when configured; record the actual repair and verification.

**Expected output:** A test-driven diagnostic record that explains why a repair was selected.

**Measure in a pilot:** Diagnostic steps with recorded findings; repeat visits for the same complaint.

### Scenario 2: A build that outlives its original owner

**Situation:** A custom vehicle changes hands after months of modifications spread across receipts and photos.

**Workflow:** Organize stages, parts, labor, costs, media, and service entries in the build journal. Produce a workshop export or controlled repair record for the receiving party.

**Expected output:** A coherent modification and service history with traceable supporting material.

**Measure in a pilot:** Missing part/service records; time required to reconstruct a modification.

### Scenario 3: A verified diagnosis becomes training

**Situation:** A mechanic resolves a difficult fault that would make a useful diagnostic exercise for apprentices.

**Workflow:** Finish the diagnostic record with recorded tests and findings. A manager reviews privacy and transfers a training draft to FaultlineLab, then edits the narrative and evidence before publication.

**Expected output:** An unpublished automotive case that retains diagnostic structure without bypassing trainer review.

**Measure in a pilot:** Reviewed cases created from real work; learner investigation quality.

## FaultlineLab

Evaluate the path to the answer.

A diagnostic challenge environment for technical practice. Versioned scenarios, persistent investigation traces, and server scoring let a reviewer inspect the reasoning path as well as the final answer.

Access: Free companion

- **Challenge catalog:** Discover published challenges through search, filters, sorting, authored packs, and daily selection.
- **Persistent attempts:** Resume standard, daily, preview, assignment, and Chaos-mode attempts across refresh and restart.
- **Evidence-driven investigation:** Select diagnostic actions, reveal clues, record findings, use progressive hints, and submit a conclusion.
- **Server scoring:** Evaluate submitted work against the versioned scenario and retain append-only attempt evidence.
- **Assignments and progress:** Assign cases, inspect learning progress and badges, and select further practice from observed results.
- **Authoring lifecycle:** Validate, preview, publish, retire, import, and export controlled challenge versions.
- **Analytics and exports:** Review attempts and outcome history; export material for coaching and team discussion.
- **Operational case reuse:** Convert reviewed TechDeck, PulseDesk, and TorqueShed records into private first-draft challenges.

**Boundary:** Training scores are scenario performance, not accredited certification or production authorization. Imported incidents require privacy review and a revised trainer-approved version before publication.

### Scenario 1: A repeatable technician onboarding exercise

**Situation:** Two new engineers know the terminology, but the lead needs to see how they investigate an ambiguous failure.

**Workflow:** Assign the same versioned challenge, compare action sequences and missed evidence, and discuss the submitted cause and response using the retained attempt trace.

**Expected output:** A concrete coaching conversation grounded in observed diagnostic choices.

**Measure in a pilot:** Missed critical clues; unnecessary actions; score progression on comparable cases.

### Scenario 2: Turn a resolved incident into an exercise

**Situation:** An internal outage contains a useful lesson but also client names and sensitive operational details.

**Workflow:** Use the supported resolved-work handoff, review privacy, and revise the private draft. Validate and preview the case before publishing a controlled version for the intended learners.

**Expected output:** Reusable practice material with a deliberate editorial and privacy boundary.

**Measure in a pilot:** Time from incident review to approved exercise; privacy findings caught before publication.

### Scenario 3: Diagnose under changing conditions

**Situation:** Experienced staff need practice handling incomplete clues and disruption without changing a production environment.

**Workflow:** Use a suitable Chaos or daily challenge. Retain the investigation trace, inspect the result, and repeat a targeted exercise where the original reasoning missed a signal.

**Expected output:** A safe training record that exposes decision habits under scenario pressure.

**Measure in a pilot:** Recovery of investigation after new evidence; repeat occurrence of the same reasoning error.

## Operator Pool Hall

A free shared space for the team.

A browser-based 8-ball companion with real gameplay, persistent match state, and protected online rooms. Its engineering interest lies in deterministic simulation, server validation, and recovery across interruptions.

Access: Free companion

- **Free Shoot practice:** Practice shot selection, aim, power, and cue-ball control in the Canvas play surface.
- **CPU matches:** Play against seeded CPU behavior with the supported rules and deterministic physics.
- **Local hot-seat play:** Share a device for turn-based play with visible match and turn state.
- **Authenticated online rooms:** Create or join protected rooms through OperatorOS identity and access controls.
- **Authoritative match checks:** Use durable snapshots/events and independent server re-simulation of submitted actions.
- **Reconnect and expiry:** Recover supported room state after interruptions and enforce room lifecycle limits.
- **Touch, English, and audio:** Use touch-friendly controls, spin/English, audio options, and performance settings.
- **Profiles and local results:** Keep supported profile/result records and use the installable web-app experience.

**Boundary:** A community benefit with no wagering, paid competition, prizes, or independently certified rankings. Online two-device and performance acceptance should be demonstrated in the target environment.

### Scenario 1: A five-minute practice break

**Situation:** An engineer wants a short break between long support sessions without setting up another account.

**Workflow:** Launch the free companion through OperatorOS and enter Free Shoot. Practice a repeatable shot while adjusting aim, power, and English with the supported controls.

**Expected output:** Immediate, self-contained practice inside the same account ecosystem.

**Measure in a pilot:** Time from launcher to first playable shot; input responsiveness on the chosen device.

### Scenario 2: A teammate disconnects mid-match

**Situation:** Two coworkers play in a protected online room and one browser loses connectivity.

**Workflow:** Play through normal server-checked actions, reconnect within the supported room lifetime, and inspect the restored turn and match state from durable snapshots and events.

**Expected output:** A recoverable game state rather than an unverified client-only continuation.

**Measure in a pilot:** State agreement after reconnect; abandoned matches caused by recoverable disconnects.

### Scenario 3: A practical state-consistency demo

**Situation:** A team wants a small, understandable example of authoritative state and replay validation.

**Workflow:** Use an authorized test session to examine normal shot submission, server re-simulation, and refresh recovery. Compare visible state across clients without claiming a formal security assessment.

**Expected output:** An accessible demonstration of client input, authoritative checks, and durable state.

**Measure in a pilot:** Consistent ball/turn state across refreshes and the two test clients.

## BrandForge OS

Give creative work a durable system.

A brand and campaign workspace for reusable context, reviewed assets, and coordinated delivery packages. The catalog uses the compact name BrandForgeOS; both refer to the same application.

Access: Paid companion

- **Brand HQ:** Maintain brand kits, positioning, voice, offers, and audience personas; associate approved shared customer identity.
- **Campaign planning:** Create campaign briefs, objectives, channels, budgets, timelines, and related landing content.
- **Copy Studio and workflows:** Develop copy variants, calls to action, ad prompts, strategy, and creative directions through guided modes.
- **Logo concepts:** Preview wordmark, lockup, badge, and monogram compositions; export editable SVG and standard/2x PNG.
- **Review and collaboration:** Manage draft/review/approval states, comments, assets, activity, and recoverable selected logos.
- **Calendar and reusable templates:** Organize delivery work and reuse global/custom templates subject to the applicable entitlements.
- **Recorded performance and reports:** Track entered results, recommendations, and campaign reports; create controlled exports.
- **Launch-package handoff:** Transfer a campaign into Deploy Ops with copy, visual-production briefs, work items, and an approval starting state.

**Boundary:** Direct advertising, social, email, analytics, and CRM delivery are unavailable in this release. Canva/Figma use manual file import. Generated assets require review; a scheduled item is not publication.

### Scenario 1: One offer, several inconsistent messages

**Situation:** An MSP launches a service package, but website copy, sales emails, and social drafts describe different benefits.

**Workflow:** Define the audience, offer, proof points, and voice once. Build campaign variants from that context, review the claims together, and export the approved materials for each external channel.

**Expected output:** A coherent campaign kit whose variants can be traced back to agreed positioning.

**Measure in a pilot:** Review rounds caused by inconsistent claims; time to produce an approved variant.

### Scenario 2: Agency work without cross-client confusion

**Situation:** A small team manages several customers and repeatedly copies brand details between disconnected documents.

**Workflow:** Associate each brand with the correct shared customer, maintain distinct personas and offers, and retain campaign assets, comments, and review states under the authorized organization.

**Expected output:** Customer-linked creative context and an inspectable approval history.

**Measure in a pilot:** Misattributed assets; time required to locate the latest approved brand direction.

### Scenario 3: From campaign approval to a launch package

**Situation:** A campaign is approved, but the coordinator still needs channel copy, production briefs, and assigned launch work.

**Workflow:** Review the current campaign and queue the Deploy Ops handoff. Inspect the returned package, complete missing production items, and export only after the team checks the resulting materials.

**Expected output:** A coordinated execution package; no advertising spend or external publication occurs automatically.

**Measure in a pilot:** Time from approval to handoff; missing deliverables discovered before launch.

## SnapProofOS

Turn completed work into reviewable proof.

A field-work and evidence workflow for customer jobs, dated captures, findings, review, and branded reports. Controlled sharing is tied to approved report snapshots rather than unrestricted raw evidence.

Access: Paid companion

- **Customers, jobs, and assignments:** Select shared customer identity, create proof work, assign field tasks, and retain job context.
- **Field evidence capture:** Collect photos, private notes, files, observations, parts, labor, and dated work context.
- **File integrity and scanning:** Apply type/signature checks, private storage, scan state, and SHA-256 verification through shared services.
- **Findings and review:** Submit evidence, inspect findings, record comments, and move reports through authorized review and approval.
- **Branded report output:** Generate approved PDF and DOCX documents from the selected report snapshot and template.
- **Controlled report shares:** Create expiring and revocable report links; inspect access history without exposing the private source library.
- **Custody and retention:** Retain hash-linked custody history, immutable report context, archive controls, retention, and legal-hold state.
- **Connected proof packages:** Receive TradeFlowKit job or TorqueShed diagnostic context; return the exact approved PDF to its originating job.

**Boundary:** Storage, scanning, and document workers need acceptance. A share link is not proof of delivery or receipt. Hash-linked history supports integrity review; it is not a legal-admissibility guarantee.

### Scenario 1: A field installation with incomplete closeout

**Situation:** An engineer completes a network cabinet installation, but photos and labor notes remain scattered across devices.

**Workflow:** Create the customer job, assign capture work, add dated photos and notes, record findings and costs, and assemble the customer-facing template for review.

**Expected output:** One approved report with supporting job context instead of a loose image folder.

**Measure in a pilot:** Jobs missing required evidence; time from site departure to approved report.

### Scenario 2: Review a disputed service outcome

**Situation:** A customer questions what was included in a repair or inspection performed several weeks earlier.

**Workflow:** Open the authorized job and inspect its captured evidence, comments, custody history, and approved report snapshot. Generate or retrieve the exact document relevant to the reviewed work.

**Expected output:** An inspectable record of what was captured and approved, without assuming the record proves causation.

**Measure in a pilot:** Time to reconstruct the work package; gaps in the evidence-to-report chain.

### Scenario 3: Share the report, control the access

**Situation:** A project manager needs to give a customer a finished report while keeping internal notes and raw captures private.

**Workflow:** Approve the snapshot, generate the requested format, and deliberately create an expiring report share. Deliver it through the team's approved channel and revoke access when appropriate.

**Expected output:** A bounded customer report link with expiry, revocation, and access history.

**Measure in a pilot:** Unrestricted evidence links created; share expiry/revocation behavior in the pilot.

## StudyForge AI

Make training material easier to use.

A source-based study workspace that turns supplied notes into complete study packs and persistent practice. Built-in creation remains useful without the optional shared AI service.

Access: Paid companion

- **Folders and study sets:** Organize source material, course/exam context, titles, descriptions, and reusable study sets.
- **Complete study packs:** Create summaries, key terms, flashcards, multiple-choice questions, short answers, review sheets, and plans.
- **Built-in and optional AI paths:** Use deterministic creation or configured shared AI refinement with validation, provenance, and fallback behavior.
- **Flashcard learning:** Practice with keyboard/touch controls and retain known/learning state and session progress.
- **Quizzes and review:** Use server-scored attempts, inspect explanations and missed answers, and retain retry/history records.
- **Plans and progress:** Track date-based study plans, exam countdowns, streaks, usage, and learning trends.
- **Content lifecycle:** Edit, search, filter, duplicate, regenerate, archive, restore, and remove supported study material.
- **Portable output:** Export study sets and supported progress/results as JSON or entitlement-gated CSV.

**Boundary:** Generated material needs source review. AI requires shared-service setup. No outside citations, accredited qualification, automatic mastery judgment, or invented classroom/group workflow is claimed.

### Scenario 1: Prepare for a platform handover

**Situation:** An engineer must learn an internal service before joining the support rotation.

**Workflow:** Supply approved, non-secret operating notes, build a study pack, correct the generated material against the source, and use flashcards and a quiz to reveal weak areas.

**Expected output:** A repeatable learning aid with an inspectable source basis and saved practice history.

**Measure in a pilot:** Questions missed by topic; preparation time using the same approved material.

### Scenario 2: Turn a long workshop into practice

**Situation:** A technical workshop produces useful notes, but participants rarely revisit the full document.

**Workflow:** Create a focused set from the approved workshop material. Review terms, short answers, and the review sheet; schedule study around the intended date and inspect the quiz explanations.

**Expected output:** Multiple ways to rehearse the same material without claiming the generated pack is authoritative.

**Measure in a pilot:** Study sessions completed; repeated mistakes after source corrections.

### Scenario 3: Keep learning when AI is unavailable

**Situation:** A team wants a study workflow before external AI service approval is complete.

**Workflow:** Use built-in pack creation, manually refine the material, and practice through the existing flashcard and quiz paths. Export the set for review and retain usage/history in the workspace.

**Expected output:** A functioning study process that does not depend on live model access.

**Measure in a pilot:** Completion of the study workflow with AI disabled; content corrections found in review.

## Deploy Ops

Make campaign launch work inspectable.

A campaign-package and readiness workspace. Despite the name, its current product scope is coordinated campaign preparation and human-verified delivery records, not software deployment automation.

Access: Paid companion

- **Business templates and briefs:** Start from reusable templates; define audience, offer, action, tone, channels, and launch date.
- **Multi-channel campaign packages:** Prepare landing, ad, email, SMS, social, FAQ, flyer, and call-to-action copy.
- **Visual-production briefs:** Create up to nine visual briefs, with included plan items made explicit.
- **Versioned artifacts:** Retain saved packages, revisions, source context, approved inputs, and related private assets.
- **Launch execution workspace:** Assign phases, milestones, owners, required files, tasks, and dependencies.
- **Computed readiness:** Calculate readiness from recorded conditions and approvals; inspect missing prerequisites before a launch transition.
- **Verified exports:** Download supported text, Markdown, JSON, and CSV packages with checksum and audit context.
- **Reviewed completion:** Receive BrandForgeOS campaign handoffs and record externally confirmed completion with a reference.

**Boundary:** Does not deploy software, change DNS, publish sites/ads, send campaigns, or buy media. A readiness score reflects recorded package conditions; external completion needs a person's verified reference.

### Scenario 1: Launch an MSP service offer

**Situation:** A new managed service needs consistent landing copy, FAQs, ads, and a practical launch checklist.

**Workflow:** Define the business brief and channels, generate the package, review every claim, assign production tasks, and export the approved material to the people operating the external tools.

**Expected output:** A coordinated campaign package with clear owners and outstanding work.

**Measure in a pilot:** Missing launch assets; time from accepted brief to reviewed export.

### Scenario 2: Find the launch blocker before launch day

**Situation:** Copy is finished, but required artwork and approval are missing from a campaign nearing its deadline.

**Workflow:** Use the execution workspace to inspect required files, dependencies, owners, and computed readiness. Complete and review the missing work before recording the launch transition.

**Expected output:** An evidence-based readiness decision with the unresolved dependency visible.

**Measure in a pilot:** Late blockers found before the deadline; launch transitions with incomplete prerequisites.

### Scenario 3: Hand a campaign to another team

**Situation:** A campaign coordinator needs a clean package for an agency or internal publishing team.

**Workflow:** Review the current package, create a verified export, and use the team's normal delivery channel. After publication, a person checks the external result and records its reference.

**Expected output:** A traceable artifact handoff and separately recorded external confirmation.

**Measure in a pilot:** Rework caused by missing copy or context; exports lacking a reviewed version.

## CallCommand AI

Make every call end in an owned next action.

A business receptionist, call-intelligence, and MSP intake workspace with simulations, flow design, follow-up records, and explicit provider readiness. Real calls require accepted telephony, AI, and billing configuration.

Access: Paid companion; live provider gates

- **Receptionist configuration:** Define business knowledge, hours, greetings, behavior, and approved routing destinations.
- **Call-flow design and simulation:** Prepare conversation paths, test a no-cost simulated call, and correct routing before live enablement.
- **Number and launch controls:** Manage number setup, readiness checks, capacity, usage, service health, and deliberate go-live controls.
- **Call records and intelligence:** Search history; inspect summaries, timelines, transcripts, consent state, outcomes, and reviewed analysis.
- **Follow-up operations:** Review leads, tasks, alerts, and staff actions with clear ownership and retained call context.
- **Core-module handoffs:** Convert eligible analyzed provider calls into reviewed TradeFlowKit, TechDeck, or operations-only PulseDesk work.
- **MSP intake foundation:** Use approved lines, SupportLinks, Directory-backed organization/contact association, local cases, and operator screen-pop.
- **Provider and audit controls:** Use signed callbacks, durable retry/outbox records, kill switches, evidence history, and explicit test/live distinctions.

**Boundary:** Live Twilio/OpenAI/Stripe and callback acceptance remain separate. Simulations cannot create production call handoffs. BMS delivery and privileged Datto/Graph/AD actions are not accepted by the MSP foundation.

### Scenario 1: Test after-hours intake before activation

**Situation:** An MSP wants consistent after-hours intake but needs to inspect what the receptionist will ask and where it will route work.

**Workflow:** Configure hours, approved knowledge, and escalation paths. Run simulations, inspect captured answers and routing, and correct the flow before the separate provider go-live checks.

**Expected output:** A reviewed receptionist configuration and test outcome without purchasing or placing a live call.

**Measure in a pilot:** Required intake fields captured in simulations; incorrect routes found before activation.

### Scenario 2: A real call becomes a support ticket

**Situation:** After provider acceptance, a caller describes an issue that should enter the technical queue with usable context.

**Workflow:** Review the completed, analyzed provider call and choose the TechDeck handoff. The system reloads the reviewed version and checks access before creating the destination ticket.

**Expected output:** A linked ticket from an eligible real call; simulator records are rejected.

**Measure in a pilot:** Calls without an owner; manual re-entry time; duplicate destination tickets.

### Scenario 3: Separate caller context from privileged action

**Situation:** An MSP caller requests urgent account help, but caller recognition must not become authorization for a reset.

**Workflow:** Use approved intake channels and organization/contact association to capture the issue and open a local case. Review screen-pop and evidence, then use the independently authorized support process.

**Expected output:** Useful intake context without an automatic identity reset or endpoint action.

**Measure in a pilot:** Unassociated cases; quality of issue capture; privileged actions requiring explicit separate approval.

## Script Ops

Approve the exact automation asset.

A script-authoring and governance workspace for reusable IT automation. Static analysis, immutable versions, explicit review, and audited downloads preserve the boundary between preparing source and executing it.

Access: Paid companion

- **Searchable script library:** Organize PowerShell, Python, batch, and shell assets with source/provenance context.
- **Authoring and import:** Create or import source and record the purpose, prerequisites, expected behavior, risk, and rollback.
- **Immutable versions:** Pin the exact revision, content identity, and change context used by subsequent review and download.
- **Server static analysis:** Inspect findings and risk indicators before submitting a script version for approval.
- **Governed review lifecycle:** Submit, approve, reject, or retire scripts under tenant-admin controls with recorded decisions.
- **Approved download controls:** Allow only the approved current version to be downloaded; retain integrity and download audit history.
- **Optional AI drafting:** Request drafts through shared AI, idempotency, and usage controls; generated source remains unapproved.
- **TechDeck documentation handoff:** Create a non-executing draft runbook and protected file-integrity record from an approved script revision.

**Boundary:** OperatorOS does not execute this source in the browser, API, server, or customer environment. Static analysis is not proof of safety. Execution and endpoint acceptance belong to a separately authorized tool.

### Scenario 1: Retire the copied desktop script

**Situation:** Several technicians keep slightly different copies of a maintenance script with unclear origin and prerequisites.

**Workflow:** Import the reviewed source, document requirements and rollback, run static checks, and submit an exact version for approval. Technicians download the approved current revision for their authorized environment.

**Expected output:** One governed automation asset with a visible version and decision history.

**Measure in a pilot:** Untracked variants; downloads without an approved current version.

### Scenario 2: Use AI without auto-approving its output

**Situation:** An engineer wants help drafting a repetitive inventory script but must inspect its behavior before distribution.

**Workflow:** Request a draft through the configured shared AI service, inspect its source, address static findings, and submit the corrected immutable revision to a tenant administrator.

**Expected output:** A reviewable draft that cannot become an approved download merely because a model generated it.

**Measure in a pilot:** Findings corrected before approval; generated drafts distributed without review.

### Scenario 3: Preserve procedure beside the code

**Situation:** A useful script exists, but new staff do not know when to use it or how to interpret its output.

**Workflow:** Select an approved current revision and create the supported TechDeck draft runbook. Review its prerequisites and handling instructions in TechDeck before publishing the procedure.

**Expected output:** Linked source identity and reviewed guidance; the handoff performs no execution.

**Measure in a pilot:** Approved assets with current runbook context; source/runbook version mismatches.

## OutCall

A private, verified-self call workflow.

A reconstructed application for a discreet call to a person's own verified phone. Source/local workflow evidence exists, but the production catalog remains unavailable and these scenarios describe gated behavior.

Access: Coming soon / unavailable

- **Safety acknowledgement:** Explain the personal-use and non-emergency boundary before preparing a call workflow.
- **Verified-self phone setup:** Use a controlled phone-ownership verification path; arbitrary destinations are excluded.
- **Neutral call profiles:** Store private profiles with controlled voice/script and supported keypad behavior.
- **Private exact triggers:** Bind exact-match trigger phrases to an approved profile and verified self-owned destination.
- **Immediate and scheduled requests:** Prepare bounded call requests using durable state and supported scheduling controls.
- **Cancellation and history:** Inspect actual request/provider state, cancel eligible requests, and retain private history.
- **Signed provider events:** Enforce controlled voice/SMS/DTMF callbacks, replay checks, and persistent rate limits.
- **Private export and deletion:** Use password-confirmed export and account-slice deletion controls for the retained personal records.

**Boundary:** UNAVAILABLE: no live launch or sale. Requires production activation and controlled real-provider acceptance. No emergency response, monitoring, location tracking, duress detection, or third-party dialing.

### Scenario 1: A planned social exit cue

**Situation:** A person wants a neutral call to their own phone at a chosen time as a private reason to step away.

**Workflow:** In a future accepted live workflow, acknowledge the limits, verify the self-owned number, choose a neutral profile, schedule the request, and inspect the actual provider outcome.

**Expected output:** A self-directed call request. This scenario is illustrative; live availability is still blocked.

**Measure in a pilot:** Correct verified destination; truthful delivery state; no unauthorized destination expansion.

### Scenario 2: Cancel when the plan changes

**Situation:** A previously scheduled personal call is no longer wanted and should not proceed if it remains cancellable.

**Workflow:** Open the private history, inspect the request state, and cancel the eligible schedule. Verify that the record distinguishes cancellation from an already submitted provider action.

**Expected output:** An explicit lifecycle decision with no fabricated claim that an in-flight call was recalled.

**Measure in a pilot:** Cancellation state consistency; late or duplicate requests in controlled acceptance tests.

### Scenario 3: Review and remove personal history

**Situation:** A user wants a private copy of retained records and then wants the supported account slice removed.

**Workflow:** After activation acceptance, use the password-confirmed export and deletion controls. Review the product's actual retained scope and verify the resulting state in a controlled test.

**Expected output:** A deliberate privacy workflow; no emergency or third-party-monitoring capability is implied.

**Measure in a pilot:** Export access controls; deletion-scope accuracy; resistance to cross-account access.
