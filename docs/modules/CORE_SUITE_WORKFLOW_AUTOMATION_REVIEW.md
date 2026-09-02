# Core Suite workday automation review

Assessment date: 2026-09-01

Source branch: `codex/core-suite-workday-automation`

Scope: TradeFlowKit, TechDeck, and PulseDesk inside the canonical OperatorOS runtime.

## Outcome

The three Main Modules already contain broad, persistent workflows. Their main
customer friction was not an absent feature catalog; it was that the first
screen made a busy operator choose a subsystem before answering the question
they actually arrive with: **what needs my attention now, why, and where do I
act?**

This change adds a role-safe, read-only workday decision layer over the existing
tenant-scoped APIs:

| Module | Distinctive daily promise | First-screen decision layer |
| --- | --- | --- |
| TradeFlowKit | Close the small-business gap between completed work and collected cash. | **Revenue Rescue** ranks overdue invoices, accepted quotes waiting for invoicing, finished work not invoiced, and late or blocked delivery tasks. |
| TechDeck | Connect service urgency to the configuration, documentation, and evidence needed to resolve and prove the work. | **Risk-to-Proof Brief** ranks SLA exposure, unassigned urgent tickets, unhealthy or lifecycle-due managed items, and procedure review work. |
| PulseDesk | Coordinate non-clinical operational pressure without turning the product into an EHR or inviting PHI into routine work. | **Operational Pulse** ranks overdue or at-risk requests, unassigned urgent work, supply demand, and facility pressure. |

Each module also gets a three-step empty-state path and two links to existing,
bounded ways to remove repeat work. The layer does not mutate records, send
messages, charge customers, assign personnel, execute remote commands, or
create a second identity, tenant, role, billing, or audit authority.

## Design standard for an overloaded customer

The Main Modules now follow one shared workday contract while retaining their
own product identities:

1. Show one primary action, not a wall of equally weighted destinations.
2. Explain the operational reason for every ranked item.
3. Take the user directly to the real record where the work is performed.
4. Start an empty workspace in three bounded steps; advanced configuration is
   available later and is never required just to see first value.
5. Use deterministic business facts for ranking. Do not add an AI summary when
   the source facts already answer the question.
6. Link only to automations that already have persisted state, pause/review
   controls, and existing authorization boundaries.
7. Keep loading structural, errors actionable, mobile layout single-column,
   and urgency understandable without relying on color alone.

## TradeFlowKit: complete workflow review

### Product edge: Revenue Rescue

Many field-service products advertise scheduling, reminders, quoting, and
invoicing. TradeFlowKit should win its narrower daily job by making revenue
leakage visible across the entire lead-to-cash chain without requiring a long
implementation project. The dashboard now identifies the handoffs most likely
to delay cash and sends the operator directly to the source record.

| Workflow stage | Existing persistent path | Busy-user friction found | Implemented or recommended simplification |
| --- | --- | --- | --- |
| Lead capture | Lead pipeline, consent state, follow-up rules and logs | A new user could enter the lead area without knowing which follow-up mattered today. | Dashboard points to lead work only after immediate cash and delivery leakage is clear. Keep outbound follow-up consent-aware and reviewable. |
| Lead qualification | Status, owner and activity history | Operators must infer stalled work from lists. | Next iteration: add a server-computed `next_action_at` exception feed using existing follow-up facts; do not let the browser invent due state. |
| Customer onboarding | Shared Business Directory plus bounded customer import | Full manual re-entry feels like an implementation project. | Empty state starts with **Add or import customers** and explicitly supports the bounded import path. Retain shared organization authority. |
| Quote creation | Quotes, line items, taxes, discounts, public document | The quote route is easy to find, but the quote-to-invoice handoff can be forgotten. | Revenue Rescue detects accepted quotes with no source-linked invoice and ranks them as an action. |
| Job planning | Jobs, owners, tasks, priorities and due dates | Users must scan jobs and tasks separately to find delivery risk. | Late and blocked active tasks are combined into one ranked queue with direct task links. |
| Repeat service | Audited recurring job templates and run history | Repeat customers create repeat data entry. | Quick-start and automation links route to recurring jobs with next-run and pause controls. No silent job generation was added. |
| Job completion | Persisted job status | Completed work can disappear into a generic completed list before billing. | Finished jobs without an invoice-linked job ID are surfaced as revenue leakage. |
| Invoice creation | Invoice records, quote conversion, line items, balance | Accepted work and finished work are not automatically the same as an invoice. | The dashboard distinguishes accepted-quote and finished-job handoffs so the operator can review before billing. |
| Payment and collections | Invoice balance, payments, Stripe Connect business-payment boundary | An outstanding total does not identify which customer action should happen first. | Overdue open invoices are ranked first and show balance plus due date. No auto-charge or unreviewed message is implied. |
| Accounting handoff | Deterministic exports and accounting views | End-of-period export work is discoverable only after navigating the module. | Keep exports in the existing operations header. Next iteration: show an exception badge for unreconciled or export-ready periods, based on persisted server facts. |
| Reporting and recovery | Saved views, CSV exports, audit trail | Users can configure a useful view but may need to learn the system before it helps. | Preserve saved views as the advanced layer; the default workday brief requires no configuration. |

### TradeFlowKit safe automation backlog

- Server-owned reminder proposals for overdue invoices and stalled leads, with
  explicit recipient consent, a preview, idempotency key, provider delivery
  result, opt-out handling, and an audit event. A schedule alone must never be
  presented as successful delivery.
- A reviewed quote-to-invoice batch assistant that presents exact source quote,
  customer, amount, tax, and duplicate checks before one atomic conversion.
- A job-completion checklist that can suggest invoicing only after required
  tasks are complete. It must not charge or send automatically.
- Import mapping presets per tenant so repeated migration files do not require
  remapping, while preserving bounded size, row-level validation, dry-run, and
  duplicate reporting.

## TechDeck: complete workflow review

### Product edge: Risk-to-Proof

TechDeck should not compete by becoming another generic ticket list. Its useful
difference is the MSP/technical-operator chain from request to configuration,
procedure, evidence, time, and deterministic proof. The dashboard now ranks
the work that threatens service delivery and links directly to the record that
contains the technical or documentary context.

| Workflow stage | Existing persistent path | Busy-user friction found | Implemented or recommended simplification |
| --- | --- | --- | --- |
| Client onboarding | Shared organizations, sites and client records | MSP setup can turn into a consulting engagement before the first ticket. | Empty state asks for one managed client, then one managed item, then one real request. It reuses shared organization authority. |
| Request intake | Ticket queue and public intake capability | A feature directory does not show what threatens the day. | Risk-to-Proof ranks overdue tickets ahead of other work. |
| Triage and dispatch | Priority, owner, status and resolution deadline | High-priority unassigned work depends on someone continuously watching the queue. | Unassigned critical/high tickets are surfaced with a direct ticket action; the layer does not assign a technician. |
| Configuration inventory | Configuration items and relationships | Inventory becomes shelfware if it is disconnected from daily service. | Critical/offline configuration items appear alongside ticket risk and link to their evidence-capable records. |
| Network and IPAM | Network/IP inventory | Network context is valuable but expensive to populate upfront. | Keep it progressive: first value requires only one supported item. Next iteration: guided CSV/API discovery dry-runs with explicit field mapping and tenant review. |
| Lifecycle management | Warranty, renewal, expiration and lifecycle-due facts | Renewal risk is easy to miss when operators live in tickets. | Lifecycle-due items enter the same ranked brief after urgent dispatch and health risk. |
| Documentation | Folders, documents, review status and versions | Draft or approved procedures can sit outside the technician's active work. | A small procedure review queue is included after operational risk, linking to documentation or runbook records. |
| Runbooks | Documentation-only runbooks | The word automation can imply remote command execution that the product does not safely provide. | UI copy explicitly frames current automation as scheduling and evidence packaging without remote execution. |
| Evidence and compliance | Evidence records, reports and deterministic exports | Proof is often assembled after the work, creating unbillable admin time. | Quick automation links lead to the existing compliance/evidence export path. Next iteration: suggest an evidence checklist from ticket type without fabricating completion. |
| Time and billing proof | Time entries and reports | Technicians enter time late when it is separated from ticket resolution. | Preserve ticket-linked time. Next iteration: unresolved tickets with activity but no time should become a private exception, never an automatic bill. |
| Recurring service | Calendar, appointments and recurring ticket templates | Routine maintenance creates repetitive ticket creation and follow-up. | Quick automation link routes to the persisted recurring/calendar path with visible templates and schedules. |
| Customer communication | Portal, status pages, webhooks and API tokens | Integrations can become a setup burden and a secret-management risk. | Keep integrations optional and health-visible. Never require a connector for the first client/ticket workflow. |

### TechDeck safe automation backlog

- Deterministic assignment suggestions using client, site, queue, skill tag,
  workload, and on-call facts. A human remains the final assigner until a
  reviewed policy, override, audit, and fairness/fallback contract exists.
- Ticket templates that prefill only non-sensitive operational fields from the
  selected client/site/configuration item and show every inherited value.
- Activity-to-time prompts and resolution-to-evidence checklists. These may
  detect missing proof but may not generate billable time or claim work was
  completed.
- Connector health and webhook replay dashboards with secret values always
  server-side. Remote agent execution remains out of scope until a separate
  signed-agent, approval, isolation, logging, and rollback ADR is accepted.

## PulseDesk: complete workflow review

### Product edge: Operational Pulse

PulseDesk is a healthcare operations coordination product, not a generic
helpdesk and not an EHR. Its differentiator is a PHI-minimized view of
department handoffs, operational SLA pressure, equipment, supplies,
facilities, and vendors. The dashboard now shows the non-clinical pressure
points that need ownership before they become escalations.

| Workflow stage | Existing persistent path | Busy-user friction found | Implemented or recommended simplification |
| --- | --- | --- | --- |
| Operational intake | Protected request entry and public intake route | Long forms encourage workarounds; vague forms invite patient detail. | Empty state begins with one short operational request and repeats the no-patient-data boundary. |
| PHI minimization | Existing warning and non-clinical data model | A warning alone does not help an overloaded submitter write a safe summary. | Next iteration: category-specific examples and client-side pattern warnings that block nothing silently and log no suspected PHI. |
| Triage | Category, department, priority, status and SLA state | Operators must compare queue rows to find the next escalation. | Operational Pulse ranks overdue then at-risk requests and explains the service reason. |
| Assignment | Team/queue/owner and assignment view | Urgent work can remain ownerless between departments. | Critical/high unassigned requests become direct actions. Empty state makes ownership the second setup step. |
| SLA management | Response/resolution policies and evaluation | Full SLA configuration is too much before the first request. | The third setup step links managers to settings and other roles to the queue; the live dashboard consumes existing server-calculated SLA state. |
| Department handoff | Assignment/escalation views | Handoffs become invisible when spread across email and hallway conversations. | Ranked work retains department/location context without exposing charts or clinical detail. |
| Equipment operations | Operational assets | Equipment status can be separated from request pressure. | Equipment count remains visible; next iteration should rank only server-confirmed unavailable equipment tied to open operational impact. |
| Supply coordination | Supply requests | Pending supply demand may be missed when the request queue dominates. | Pending supply pressure is promoted into the same workday brief. |
| Facilities and vendors | Facility requests, locations and vendor links | Facility/vendor work often becomes a parallel spreadsheet. | Open facility pressure is promoted with a direct operations link. |
| Messaging, files and time | Ticket messages, attachments and time entries | Context fragments when users return to email for coordination. | Keep all activity on the request. Next iteration: notify on exception through approved connectors while retaining the full in-product record. |
| Knowledge | Knowledge articles and operational guidance | Users search only after an incident is already delayed. | Next iteration: category-based article suggestions on request creation and detail; never infer or expose clinical information. |
| Mail/public connectors | Inbound connector and public intake | Connector setup can falsely appear complete before delivery or replay behavior is proven. | Manager automation link describes replay protection and health state. No provider success is claimed by configuration alone. |
| Reporting and administration | Dashboard metrics, policies and operational configuration | Administrators need breadth; frontline users need a short daily queue. | Keep the existing metric and admin surfaces below/alongside the new role-safe brief. |

### PulseDesk safe automation backlog

- Department/queue suggestions from explicit operational category and location,
  with visible rationale, human confirmation, fallbacks, and an audit event.
- Escalation notification proposals driven by server-owned SLA state, connector
  health, idempotency, recipient policy, and delivery receipts. No patient or
  clinical payloads may be placed in notification channels.
- PHI-minimized intake templates for facilities, supplies, imaging operations,
  equipment, transport, and vendor coordination. The templates must state what
  not to enter and retain only the submitted operational record.
- Knowledge suggestions based on selected category and asset/location IDs,
  never on a patient chart, diagnosis, free-text clinical inference, or EHR
  data.

## Market-informed choices

This is product-direction evidence, not a claim that local code has achieved
feature superiority or deployed parity.

- Jobber markets quote and invoice follow-ups, visit reminders, client access,
  and quote-to-job/invoice workflows. TradeFlowKit's chosen distinction is the
  unified exception queue across *accepted, completed, invoiced, collected,
  late, and blocked* facts rather than another broad feature directory:
  <https://www.getjobber.com/features/> and
  <https://help.getjobber.com/en/articles/reminders-on-the-schedule/>.
- ConnectWise describes recurring service templates, ticket alerts, and time
  and notes feeding invoicing. TechDeck's chosen distinction is a smaller,
  lower-setup Risk-to-Proof loop that keeps tickets, configuration,
  documentation, evidence, and deterministic exports together without
  pretending that documentation runbooks execute remotely:
  <https://www.connectwise.com/blog/using-service-tickets-and-activities-to-boost-team-visibility>,
  <https://www.connectwise.com/platform/psa/time-tracking>, and
  <https://www.connectwise.com/platform>.
- ServiceNow's healthcare operations material emphasizes operational workflows,
  triage, routing, and handoffs. PulseDesk's chosen distinction is a focused
  PHI-minimized small-team coordination layer for non-clinical requests,
  supplies, facilities, equipment, and vendors—not a replacement for clinical
  systems: <https://www.servicenow.com/products/healthcare-life-sciences.html>
  and
  <https://www.servicenow.com/docs/r/healthcare-life-sciences/healthcare-operations-core/hcls-cto-app.html>.

## Authority and safety boundaries

- All facts continue to come from authenticated module APIs using the
  server-resolved tenant. A browser tenant header remains only a requested
  selection and cannot widen access.
- OperatorOS remains the sole identity, session, tenant, membership, role,
  entitlement, subscription, module registry, launch-policy, and platform-audit
  authority.
- No provider message, email, SMS, remote command, technician assignment,
  invoice, payment, or clinical action is performed by this dashboard layer.
- TradeFlowKit business payments remain separate from OperatorOS platform
  billing. No automatic charge or Stripe catalog change was added.
- TechDeck continues to label runbooks as documentation-only. Remote execution
  requires its own reviewed architecture and acceptance program.
- PulseDesk remains PHI-minimized and non-clinical. It does not diagnose,
  recommend care, read patient charts, or automate clinical decisions.
- The new brief is deliberately bounded to data returned by existing APIs. A
  future server-side exception endpoint is preferable if pagination grows
  beyond a complete daily decision set.

## Verification and release state

Source/local verification on 2026-09-01:

- `corepack pnpm --dir apps/web typecheck` — passed.
- Node native TypeScript test run for the two focused files — **8 passed, 0
  failed, 0 skipped**.
- Existing TradeFlowKit Phase 16, TechDeck Phase 26, PulseDesk Phase 27, and
  shared product-truth ledgers — passed with zero unclassified or blocked
  capability rows in their current source contracts.
- `$env:INTERNAL_API_URL='http://localhost:5001'; corepack pnpm
  build:production` — passed; deployment scope passed, FaultlineLab catalog
  contract passed **4/4**, all four workspace typechecks passed, and the Next
  production build generated **35/35** routes.
- `git diff --check` — passed with only existing line-ending conversion
  warnings.
- `corepack pnpm preflight:production -- --core` — failed closed because the
  local shell intentionally lacks production database, secret, exact-host,
  release-mode, proxy, and environment inputs; no secret value was printed.

The normal `tsx` launcher could not start in this host session because Node's
Windows `os.userInfo()` call returned `uv_os_get_passwd ENOMEM`. The focused
tests were therefore executed by the same installed Node runtime using native
TypeScript type stripping. This workaround changes only the test launcher, not
the assertions or product source.

No database schema changed, so no release-manifest step or database apply is
required. No production database, provider, billing, DNS, deployment, merge,
push, or publish action was performed. Exact-host authenticated browser,
mobile, deployed-provider, accessibility, backup, rollback, monitoring, and
live release-identity acceptance remain required before any production-ready
claim. Existing module consolidation/parity states are unchanged.
