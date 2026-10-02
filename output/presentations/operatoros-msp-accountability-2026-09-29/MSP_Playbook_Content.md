# OperatorOS: Show Your Work

How an MSP uses OperatorOS to cover its ass.

A recommended operational playbook with illustrative scenarios. Product boundaries and source attribution are in the PDF.

## 01. You touched it. Now it is broken.

A synthetic MSP client reports intermittent authentication failures the morning after an approved maintenance window. The engineer needs to establish what changed and what was already failing.

- **Before work:** Keep the actual authorization and window reference. Capture the affected asset, pre-change symptoms, baseline checks, intended change, and rollback plan.
- **During work:** Record the exact script or procedure revision, operator, execution time and timezone, outputs, failed attempts, and any unplanned effect. Collect execution evidence from the tool that actually ran the work.
- **After work:** Compare equivalent checks before and after. Import the reviewed closeout into TechDeck, retain the source revision, and link the ticket, asset, evidence, and remaining checks.

**Record-supported answer:** We can show the approved scope, exact change, observed baseline, and tests we performed. The later symptom is recorded; causation remains unproven until the evidence supports it.

**Boundary:** Script approval is not permission to run it on this client. OperatorOS does not automatically collect endpoint execution logs or prove causation from timing.

**Pilot check:** Ask an uninvolved engineer to reconstruct the window and identify every unverified claim.

## 02. You never warned us about that risk.

A synthetic client postpones replacing a failing storage device. Weeks later, an outage raises the question of what was recommended, who received it, and who owned the follow-up.

- **State the observation:** Link the asset and dated diagnostic evidence. Describe the observed condition, business impact, recommendation, and uncertainty in a versioned document or ticket record.
- **Preserve the decision:** Retain the actual dated client response from the authorized communication channel, including sender identity and any relevant scope. A technician's note that the client declined is a separate, weaker source.
- **Keep the risk open:** Record the unresolved condition, follow-up owner, due date, and escalation trigger. If the recommendation changes, append current context without rewriting the historical response.

**Record-supported answer:** Here is what we observed, the recommendation we sent, the response we retained, and the follow-up that remained open. The source shows what the client actually said.

**Boundary:** This is a documented operating practice, not a dedicated risk-acceptance or e-signature feature. A recorded refusal does not automatically transfer responsibility or remove an MSP's obligations.

**Pilot check:** Can a reviewer distinguish the original response, technician interpretation, and remaining action?

## 03. We did not authorize that work.

A synthetic engineer has administrator access and an approved cleanup script. A client disputes whether the specific production action was authorized during the agreed window.

- **Bind the scope:** Retain the actual work request and authorizing person's source response. Specify the client, assets, action, window, exclusions, and rollback conditions in the work record.
- **Pin the asset:** Use Script Ops to review the exact source revision and its prerequisites. Download only the approved current version; keep its identity with the change record.
- **Record actual execution:** Use the separately authorized execution tool and preserve its output. Record any deviation, pause, escalation, or new permission before extending the work.

**Record-supported answer:** The record separates who could access the system, who reviewed the script, who authorized this action, and what actually ran. Each decision has its own source.

**Boundary:** RBAC grants product access. Script approval governs a reusable asset. Neither substitutes for client change authorization or a maintained contract/change-control process.

**Pilot check:** For one action, identify all three decisions: access, asset approval, and client work authorization.

## 04. The ticket said fixed. It was not tested.

A synthetic line-of-business service restarts successfully, but the user's full transaction still fails. The closeout must distinguish service recovery from functional acceptance.

- **Name the check:** Record the exact functional check, who performed it, the environment/asset, observation time, and expected result. A green service status is one check, not the whole acceptance test.
- **Keep mixed outcomes:** Retain successful checks, failures, side effects, and pending validation in the structured closeout. Record the current state in language the next engineer and client can interpret.
- **Assign the remainder:** Give uncompleted validation an owner and next action. Produce a reviewed client summary that preserves those limitations instead of flattening everything into 'resolved'.

**Record-supported answer:** The service restarted and the recorded health check passed. End-to-end client testing remained pending, with a named owner. We did not record full acceptance we had not observed.

**Boundary:** A validated JSON import proves format and screening checks, not technical truth. A model-generated closeout must be reviewed against the original work and test results.

**Pilot check:** Can another engineer state exactly what passed, what failed, and what was never tested?

## 05. Nobody told the next technician.

A synthetic overnight engineer attempts several fixes, recovers from a side effect, and hands the ticket to the day shift. A short final note would cause the same failed branch to be tried again.

- **Preserve the whole path:** Record the action sequence, failed attempts, qualified causal claims, recovery, present state, and remaining questions. Keep exact identifiers and the relevant source evidence.
- **Make the next action explicit:** Assign the ticket and follow-up, identify what must not be repeated without review, and link the correct current document. Confirm handoff through the team's normal process.
- **Reuse with review:** Search the incident by exact identifier. Create a cited KB/runbook draft; prepare a FaultlineLab case only after manager and privacy review. Source changes should trigger a new review.

**Record-supported answer:** The handoff retained the failed step, the recovery, the unverified assumption, and the next owner. A later reader can find the source instead of trusting a copied conclusion.

**Boundary:** A saved assignment or published document does not prove that the next technician read it. Training exports require privacy review; masking alone is not complete de-identification.

**Pilot check:** Give the case to a fresh engineer and inspect their first proposed action before briefing them.

## 06. Why are we being billed for this?

A synthetic client disputes the labor and completion of an installation. Photos, technician notes, approval, and the invoice are spread across different systems.

- **Capture the work:** Associate the correct customer/job and collect dated notes, before/after photos, findings, parts, labor, and relevant acceptance evidence. Keep original scope and approved variations as source records.
- **Review the package:** Use SnapProofOS to assemble and approve the customer report. Retain its snapshot and source context, generate the document, and share only the approved report through a deliberate channel.
- **Connect the commercial record:** Where TradeFlowKit is entitled, return the approved PDF to the originating job using its supported handoff. Otherwise attach the reviewed document to the existing PSA/invoice workflow manually.

**Record-supported answer:** Here is the scope, recorded work, reviewed report, and associated commercial record. Client acceptance and payment remain separate facts supported by their own sources.

**Boundary:** Report approval is internal; sharing is not receipt; receipt is not acceptance; an invoice is not settlement. TradeFlowKit is a separate core product, not automatically included in a TechDeck tenant.

**Pilot check:** Reconstruct one billed item from authorized scope to work evidence, report, and payment state.

## TechDeck

Reconstruct technical work and preserve what remains unknown.

Use ticket/client/asset context, reviewed closeout imports, exact retrieval, and source-linked documentation as the primary technical record.

- **Service operations:** Manage client/site-linked tickets, assignments, comments, time, requester updates, and accountable closeout.
- **Configuration and lifecycle inventory:** Track typed configurations, asset context, warranty/renewal dates, lifecycle changes, and related records.
- **Network and IPAM records:** Maintain network, subnet, address, and topology relationships as documented operational context.
- **Versioned documentation:** Edit knowledge articles and runbooks with revisions, backlinks, review, approval, publication, and private attachments.
- **Resolution evidence intake:** Import structured closeouts with screened source material, immutable revisions, validation, warnings, failures, and side effects.
- **Exact and full-text retrieval:** Search identifiers and narrative; inspect evidence, components, action chronology, revision history, and native links.
- **Evidence-derived knowledge:** Preview deterministic KB/runbook drafts, retain source citations, link multiple incidents, and block stale-source approval.
- **Protected reports and audit:** Use tenant-scoped report snapshots, private attachments, audited source downloads, and current source-access controls.

- **The outage accusation:** Compare the approved action and actual timeline against pre-existing symptoms. Retrieve the exact outputs and unresolved causal questions.
- **The forgotten side effect:** Keep the failed remediation and its observed effect in the source closeout. The next engineer sees both recovery and warning.
- **The unsupported fix claim:** Record performed, failed, and pending checks separately. A client summary can then state the precise limits of validation.

## SnapProofOS

Show what was captured, reviewed, and included in the report.

Use approved snapshots and controlled report access for field proof. Preserve external permission and response records separately.

- **Customers, jobs, and assignments:** Select shared customer identity, create proof work, assign field tasks, and retain job context.
- **Field evidence capture:** Collect photos, private notes, files, observations, parts, labor, and dated work context.
- **File integrity and scanning:** Apply type/signature checks, private storage, scan state, and SHA-256 verification through shared services.
- **Findings and review:** Submit evidence, inspect findings, record comments, and move reports through authorized review and approval.
- **Branded report output:** Generate approved PDF and DOCX documents from the selected report snapshot and template.
- **Controlled report shares:** Create expiring and revocable report links; inspect access history without exposing the private source library.
- **Custody and retention:** Retain hash-linked custody history, immutable report context, archive controls, retention, and legal-hold state.
- **Connected proof packages:** Receive TradeFlowKit job or TorqueShed diagnostic context; return the exact approved PDF to its originating job.

- **The missing installation evidence:** Tie dated photos, notes, findings, parts, and labor to the correct job. Review them into a specific customer report.
- **The changed-report question:** Retrieve the approved snapshot and its source context. Hash-linked custody helps examine the recorded history without claiming notarization.
- **The overshared evidence folder:** Share the approved report with expiry/revocation controls. Keep private notes and raw captures outside that customer-facing package.

## Script Ops

Identify exactly which source version was reviewed and downloaded.

Approval governs a script asset. Actual execution, client authorization, and endpoint telemetry remain outside Script Ops.

- **Searchable script library:** Organize PowerShell, Python, batch, and shell assets with source/provenance context.
- **Authoring and import:** Create or import source and record the purpose, prerequisites, expected behavior, risk, and rollback.
- **Immutable versions:** Pin the exact revision, content identity, and change context used by subsequent review and download.
- **Server static analysis:** Inspect findings and risk indicators before submitting a script version for approval.
- **Governed review lifecycle:** Submit, approve, reject, or retire scripts under tenant-admin controls with recorded decisions.
- **Approved download controls:** Allow only the approved current version to be downloaded; retain integrity and download audit history.
- **Optional AI drafting:** Request drafts through shared AI, idempotency, and usage controls; generated source remains unapproved.
- **TechDeck documentation handoff:** Create a non-executing draft runbook and protected file-integrity record from an approved script revision.

- **Which script did we approve?:** Inspect the immutable revision, static findings, and decision. Preserve the external execution output to establish what actually ran.
- **The AI-generated quick fix:** Keep the draft unapproved until an engineer addresses findings and a reviewer accepts that exact revision.
- **The procedure-code mismatch:** Create the supported non-executing TechDeck runbook draft from an approved revision. Review the resulting guidance before reuse.

## FaultlineLab

Turn known mistakes into repeatable diagnostic practice.

Attempt traces support coaching. A score does not prove production competence, permission, or compliance.

- **Challenge catalog:** Discover published challenges through search, filters, sorting, authored packs, and daily selection.
- **Persistent attempts:** Resume standard, daily, preview, assignment, and Chaos-mode attempts across refresh and restart.
- **Evidence-driven investigation:** Select diagnostic actions, reveal clues, record findings, use progressive hints, and submit a conclusion.
- **Server scoring:** Evaluate submitted work against the versioned scenario and retain append-only attempt evidence.
- **Assignments and progress:** Assign cases, inspect learning progress and badges, and select further practice from observed results.
- **Authoring lifecycle:** Validate, preview, publish, retire, import, and export controlled challenge versions.
- **Analytics and exports:** Review attempts and outcome history; export material for coaching and team discussion.
- **Operational case reuse:** Convert reviewed TechDeck, PulseDesk, and TorqueShed records into private first-draft challenges.

- **The repeat troubleshooting mistake:** Turn a reviewed resolved incident into an unpublished challenge draft. Remove sensitive material and revise before publishing.
- **The onboarding blind spot:** Assign a versioned case and inspect actions and missed evidence. Coach the actual investigation rather than quiz vocabulary alone.
- **The lesson nobody retained:** Repeat a suitable exercise and compare investigation behavior. Use the result to choose the next practice task.

## TradeFlowKit

Connect scope, jobs, proof, invoices, and recorded payments.

TradeFlowKit is a separate core product. A TechDeck-led MSP can retain its existing PSA/accounting and use manual reviewed exports.

- **Lead and customer management:** Capture leads; qualify and convert opportunities; use shared customer identity, contacts, search, and bounded CSV imports.
- **Jobs and recurring work:** Schedule and assign jobs; retain owners, dates, status, recurring templates, pause controls, and run history.
- **Tasks and workflow stages:** Track job-scoped tasks, dependencies, comments, tags, workflow transitions, and personal or shared saved views.
- **Quotes and conversion:** Build multi-line quotes; record decisions; convert to jobs or invoices with duplicate-safe server operations.
- **Invoices and payments:** Maintain invoice items, partial/full payment records, balances, numbering, and history; connected settlement needs provider acceptance.
- **Customer communication:** Use scoped public views, customer portals, and consent-aware email/SMS outbox actions with explicit delivery state.
- **Reporting and accounting handoff:** Inspect workload and revenue from persisted records; export invoice CSV, QuickBooks IIF, and Xero-oriented CSV files.
- **Proof and recovery:** Create SnapProofOS work from a job, return the approved PDF, and use guarded archive/restore workflows.

- **The scope expansion:** Retain the accepted quote and actual variation authorization with the job. Distinguish a manually recorded decision from its original source.
- **The disputed invoice:** Link the job, approved proof report, invoice line context, and recorded payments. Retrieve the record behind the balance.
- **The unbilled completed job:** Use recorded job/invoice state to find missed handoffs. Review the work and scope before creating a commercial document.

## PulseDesk

Make operational ownership and escalation visible across departments.

Use for non-clinical facilities, equipment, supply, and vendor work. It is a separate core product, with no EHR or compliance-certification claim.

- **Facilities and departments:** Maintain directory-linked organizations, facilities, requesters, departments, and operational context.
- **Operational request intake:** Create numbered requests with structured classification, equipment-issue prefill, tags, and supporting records.
- **Queues, teams, and assignment:** Route work to an accountable team or owner; prioritize through queues, filters, saved views, and bulk actions.
- **Targets and escalation:** Track service targets, time, at-risk work, escalation paths, and response history.
- **Notes and requester updates:** Keep internal coordination separate from requester-facing replies; retain private attachments and work history.
- **Equipment and vendor coordination:** Associate operational assets with facility issues, supply requests, service vendors, and department needs.
- **Knowledge and reporting:** Use operational knowledge, persisted dashboards, configuration, preferences, trend reporting, and exports.
- **Reviewed handoffs:** Accept operations-only CallCommand requests and prepare privacy-reviewed resolved-work drafts for FaultlineLab.

- **The ownerless equipment issue:** Associate the department, asset, service target, and assigned team. The record shows where operational responsibility sat.
- **The missed shift handoff:** Retain internal notes, requester updates, and outstanding actions so the next shift can reconstruct status.
- **The privacy-sensitive training case:** Review a resolved operations request before a FaultlineLab draft transfer. Exclude patient/clinical data and revise the draft.

## CallCommand AI

Retain the request and route an owned follow-up when live service is accepted.

Call capture and caller association do not authorize account resets or prove a person's authority. Simulations remain separate from real calls.

- **Receptionist configuration:** Define business knowledge, hours, greetings, behavior, and approved routing destinations.
- **Call-flow design and simulation:** Prepare conversation paths, test a no-cost simulated call, and correct routing before live enablement.
- **Number and launch controls:** Manage number setup, readiness checks, capacity, usage, service health, and deliberate go-live controls.
- **Call records and intelligence:** Search history; inspect summaries, timelines, transcripts, consent state, outcomes, and reviewed analysis.
- **Follow-up operations:** Review leads, tasks, alerts, and staff actions with clear ownership and retained call context.
- **Core-module handoffs:** Convert eligible analyzed provider calls into reviewed TradeFlowKit, TechDeck, or operations-only PulseDesk work.
- **MSP intake foundation:** Use approved lines, SupportLinks, Directory-backed organization/contact association, local cases, and operator screen-pop.
- **Provider and audit controls:** Use signed callbacks, durable retry/outbox records, kill switches, evidence history, and explicit test/live distinctions.

- **What did the caller request?:** Inspect the retained transcript/summary and any uncertainty. Confirm consequential instructions through the approved client process.
- **The missed support handoff:** After live-provider acceptance, review an eligible analyzed call and create a linked TechDeck ticket. Simulator calls are rejected.
- **The urgent reset request:** Use MSP intake context and screen-pop to support review. Privileged reset and endpoint actions need separately accepted processes.

## BrandForge OS

Keep service claims and approved campaign material consistent.

This supports communication discipline; it is not contract approval, client consent, or proof that a campaign was delivered.

- **Brand HQ:** Maintain brand kits, positioning, voice, offers, and audience personas; associate approved shared customer identity.
- **Campaign planning:** Create campaign briefs, objectives, channels, budgets, timelines, and related landing content.
- **Copy Studio and workflows:** Develop copy variants, calls to action, ad prompts, strategy, and creative directions through guided modes.
- **Logo concepts:** Preview wordmark, lockup, badge, and monogram compositions; export editable SVG and standard/2x PNG.
- **Review and collaboration:** Manage draft/review/approval states, comments, assets, activity, and recoverable selected logos.
- **Calendar and reusable templates:** Organize delivery work and reuse global/custom templates subject to the applicable entitlements.
- **Recorded performance and reports:** Track entered results, recommendations, and campaign reports; create controlled exports.
- **Launch-package handoff:** Transfer a campaign into Deploy Ops with copy, visual-production briefs, work items, and an approval starting state.

- **Marketing promised too much:** Review a shared service-offer and brand brief before exporting variants. Remove claims the actual service does not support.
- **The obsolete service description:** Find the current reviewed campaign asset and its context. Coordinate external replacement manually in the publishing tools.
- **The confused customer identity:** Associate the correct shared customer with the brand and keep the campaign's assets and review states distinct.

## Deploy Ops

Expose missing campaign deliverables and record reviewed handoffs.

Deploy Ops prepares campaign launches. It does not deploy software or prove a live external publication from a completed checklist.

- **Business templates and briefs:** Start from reusable templates; define audience, offer, action, tone, channels, and launch date.
- **Multi-channel campaign packages:** Prepare landing, ad, email, SMS, social, FAQ, flyer, and call-to-action copy.
- **Visual-production briefs:** Create up to nine visual briefs, with included plan items made explicit.
- **Versioned artifacts:** Retain saved packages, revisions, source context, approved inputs, and related private assets.
- **Launch execution workspace:** Assign phases, milestones, owners, required files, tasks, and dependencies.
- **Computed readiness:** Calculate readiness from recorded conditions and approvals; inspect missing prerequisites before a launch transition.
- **Verified exports:** Download supported text, Markdown, JSON, and CSV packages with checksum and audit context.
- **Reviewed completion:** Receive BrandForgeOS campaign handoffs and record externally confirmed completion with a reference.

- **The missing deliverable:** Inspect task dependencies, required files, and approval state before exporting the campaign package.
- **The ambiguous handoff:** Generate a verified export from the reviewed version, then retain the actual receiving team's acknowledgement through your process.
- **The false launch-complete claim:** Record external completion only after a person verifies the published result and provides a reference.

## StudyForge AI

Make approved operating material easier to study and revisit.

Study packs and quiz history assist learning. They do not prove policy acknowledgement, certification, or authorization to work independently.

- **Folders and study sets:** Organize source material, course/exam context, titles, descriptions, and reusable study sets.
- **Complete study packs:** Create summaries, key terms, flashcards, multiple-choice questions, short answers, review sheets, and plans.
- **Built-in and optional AI paths:** Use deterministic creation or configured shared AI refinement with validation, provenance, and fallback behavior.
- **Flashcard learning:** Practice with keyboard/touch controls and retain known/learning state and session progress.
- **Quizzes and review:** Use server-scored attempts, inspect explanations and missed answers, and retain retry/history records.
- **Plans and progress:** Track date-based study plans, exam countdowns, streaks, usage, and learning trends.
- **Content lifecycle:** Edit, search, filter, duplicate, regenerate, archive, restore, and remove supported study material.
- **Portable output:** Export study sets and supported progress/results as JSON or entitlement-gated CSV.

- **The unread procedure manual:** Build a source-based pack from approved, non-secret material. Correct it against the source before staff practice.
- **The weak knowledge area:** Use quiz explanations and session history to identify topics for another pass; keep live supervision decisions separate.
- **The unavailable AI service:** Use built-in creation and manual review to maintain learning without depending on an external model.

## TorqueShed

Apply the same diagnostic record discipline to vehicle or fleet work.

Relevant to an automotive/fleet service boundary, not general endpoint defense. Physical findings and verification need actual technician evidence.

- **Garage and service history:** Record vehicles, mileage, owner concerns, repairs, maintenance, and service chronology.
- **Structured diagnostics:** Organize symptoms, codes, observations, likely causes, tests, findings, and verification.
- **Torque Assist:** Request context-aware diagnostic guidance through OperatorOS-owned AI and usage/token accounting.
- **Build journals and cost context:** Track build stages, parts, labor, costs, notes, and supporting media.
- **Repair reports and collaboration:** Create workshop exports and repair records; use supported live-bay and sharing workflows.
- **Community:** Maintain profiles, preferences, posts, comments, reactions, follows/blocks, private media, and moderation records.
- **Marketplace listings:** Search and save listings; contact sellers; retain conversations, expiry, reports, and listing history.
- **Proof and training handoffs:** Prepare diagnostic proof in SnapProofOS and reviewed automotive challenge drafts in FaultlineLab.

- **The repeat vehicle complaint:** Record symptoms, tests, failed steps, repair, and actual verification instead of preserving only the final part replacement.
- **The disputed workshop history:** Retrieve service entries, parts/labor, and supporting media to reconstruct what the workshop recorded.
- **The repair-to-proof handoff:** Review an authorized diagnostic and prepare a SnapProofOS package. Treat customer acceptance as a separate source fact.

## Operator Pool Hall

A free companion with no direct MSP accountability function.

Included to preserve the full ecosystem map. Gameplay records should not be represented as service evidence, readiness, or staff performance controls.

- **Free Shoot practice:** Practice shot selection, aim, power, and cue-ball control in the Canvas play surface.
- **CPU matches:** Play against seeded CPU behavior with the supported rules and deterministic physics.
- **Local hot-seat play:** Share a device for turn-based play with visible match and turn state.
- **Authenticated online rooms:** Create or join protected rooms through OperatorOS identity and access controls.
- **Authoritative match checks:** Use durable snapshots/events and independent server re-simulation of submitted actions.
- **Reconnect and expiry:** Recover supported room state after interruptions and enforce room lifecycle limits.
- **Touch, English, and audio:** Use touch-friendly controls, spin/English, audio options, and performance settings.
- **Profiles and local results:** Keep supported profile/result records and use the installable web-app experience.

- **A short team break:** Use Free Shoot between support sessions. The benefit is recreation, with no claim that it reduces service liability.
- **A remote team social:** Play in a protected room and reconnect within the supported lifecycle. Keep it separate from client work records.
- **A state-recovery demonstration:** Use a test match to discuss durable events and server validation. This does not certify the security of another module.

## OutCall

No current role in an MSP's defensible service workflow.

OutCall remains coming soon. Verified-self personal calls are outside MSP escalation, emergency response, and client authorization.

- **Safety acknowledgement:** Explain the personal-use and non-emergency boundary before preparing a call workflow.
- **Verified-self phone setup:** Use a controlled phone-ownership verification path; arbitrary destinations are excluded.
- **Neutral call profiles:** Store private profiles with controlled voice/script and supported keypad behavior.
- **Private exact triggers:** Bind exact-match trigger phrases to an approved profile and verified self-owned destination.
- **Immediate and scheduled requests:** Prepare bounded call requests using durable state and supported scheduling controls.
- **Cancellation and history:** Inspect actual request/provider state, cancel eligible requests, and retain private history.
- **Signed provider events:** Enforce controlled voice/SMS/DTMF callbacks, replay checks, and persistent rate limits.
- **Private export and deletion:** Use password-confirmed export and account-slice deletion controls for the retained personal records.

- **A future personal exit cue:** After separate activation acceptance, an individual could request a neutral call to their own verified number; not an MSP on-call service.
- **A cancelled personal plan:** A future accepted workflow would show cancellation/history accurately. It does not provide incident acknowledgement or dispatch proof.
- **A private history request:** Supported personal export/deletion needs its own accepted workflow. Do not use it as a customer evidence-retention system.
