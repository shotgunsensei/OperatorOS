# Companion workflow automation review

Date: 2026-09-02  
Scope: the six paid companion modules in `CompanionModuleKey` and the canonical
product catalog: BrandForgeOS, SnapProofOS, StudyForge AI, Deploy Ops,
CallCommand AI, and Script Ops.

## Outcome

Each companion dashboard now converts facts already returned by its
tenant-scoped API into the same small decision pattern:

1. a three-step first-value path when the workspace is empty;
2. three operational metrics that explain the current workload;
3. up to six deterministically ranked next actions with direct canonical links;
4. one primary action; and
5. two existing, safe automation paths that reduce repeat entry.

The builders are pure presentation logic. They do not call APIs, create jobs,
change records, infer access, or auto-execute a provider or high-impact action.
The dashboards therefore reduce menu hunting without becoming a second source
of identity, tenant, role, entitlement, billing, provider, audit, or workflow
authority.

## Workflow findings and implemented reductions

| Companion | Highest-friction customer journey | Implemented reduction | Explicit human/provider boundary retained |
| --- | --- | --- | --- |
| BrandForgeOS | The user had to infer the path from brand kit and persona through campaign review and calendar state. | `Campaign Flow Brief` starts with reusable brand/audience context and ranks overdue calendar items, late campaigns, review handoffs, and active campaigns with no schedule. It links to brands, personas, campaigns, AI workflows, and calendar. | AI output remains review-ready, not approved. No content is published and no ad spend or provider action is triggered. |
| SnapProofOS | The full field/evidence navigation made it easy to miss an overdue job, empty collecting case, evidence review, report approval, or unresolved finding. | `Proof-to-Delivery Brief` starts with customer, job, and capture; then ranks overdue jobs, evidence/report review, empty collecting cases, and open findings with direct case/queue links. | Private evidence, manager review, report approval, share creation, retention, and legal hold remain server-authorized actions. No share is created automatically. |
| StudyForge AI | Users could see counts but still had to decide whether to configure preferences, create a set, review weak results, or study for the nearest exam. | `Learning Focus Brief` routes first-time users through preferences, complete-set generation, and sessions; then ranks near exams, weak quiz averages, and interrupted active-set work. | Generated material remains source-grounded and reviewable. Scores, usage, plan limits, and saved progress remain server-owned. |
| Deploy Ops | Release-package generation and the separate execution/readiness workspace were both valid, but users had to discover the handoff between them. | `Launch Readiness Brief` connects template, brief, package, export, and server-computed readiness. It ranks overdue readiness items, unfinished packages, missing exports, and unlaunched workspaces. | The brief never claims or performs deployment, publication, traffic switching, paid spend, or provider activation. Deployment remains a separate human-controlled gate. |
| CallCommand AI | Seven go-live facts, provider reconciliation, receptionist configuration, workflow publication, and caller follow-up were spread across multiple routes. | `Receptionist Readiness Brief` turns the existing server checklist into ordered links, puts manual provider reconciliation first, and surfaces urgent caller follow-up. Setup points to number, receptionist, workflow, simulator, and health paths. | Number purchase still requires explicit charge confirmation and entitlement. Provider ownership, routing, billing, Realtime, transfer verification, repair, release, and go-live remain server-verified/admin-controlled. |
| Script Ops | The user had to move among catalog provenance, authoring, static analysis, review, and download to discover the next safe action. | `Script Delivery Brief` starts with library search, then guarded drafting and human review. It ranks critical static findings, approval work, failed incremental sync, and lack of an approved version. | AI drafts remain unapproved. Only the approved current immutable version can be downloaded. OperatorOS does not execute script source. |

## Shared implementation contract

- `apps/web/src/lib/companion-workflow.ts` owns deterministic ranking and copy.
  It receives only already-authorized response objects and returns links and
  display facts.
- `CoreSuiteWorkdayBrief` now presents both Main Module and companion focus
  briefs with product-specific color tokens, keyboard focus, status text, and
  a single-column mobile layout.
- Route-shell `hrefFor` helpers are passed into the affected workspaces so every
  action works both on exact module hosts and the `/modules/<slug>` fallback.
- Deploy Ops reads its existing execution summary on the dashboard as an
  optional partial-success enhancement. Failure to load that secondary summary
  does not block the release-package workspace or manufacture readiness.
- No schema, release-manifest, API authorization, import plan, provider,
  entitlement, billing, SSO, or session behavior changed.

## High-leverage follow-up automation backlog

These are appropriate follow-ups only after separate product and acceptance
work. They are not claimed as implemented by this overlay.

| Companion | Next safe reduction | Required safeguards |
| --- | --- | --- |
| BrandForgeOS | Suggest draft calendar items and reuse approved campaign blocks from the saved brand/persona/offer combination. | Suggestions only; explicit approval before scheduling or publishing; provider and spend confirmation remain separate. |
| SnapProofOS | Offer a customer-to-job quick-create transaction and compute a capture-completeness checklist from the assigned template. | Tenant transaction, idempotency, role checks, private attachment/scanner readiness, and no automatic report/share approval. |
| StudyForge AI | Build a daily adaptive review queue from saved recall history, quiz misses, countdowns, and the daily time goal. | Deterministic explanation of why each item is due, plan/usage enforcement, and no client-trusted score mutation. |
| Deploy Ops | Suggest dependency-aware date shifts and prefill the execution workspace from an approved release package. | Human acceptance of date changes, immutable source linkage, no deployment credentials, and no readiness claim without evidence. |
| CallCommand AI | Add a resumable setup checkpoint and combine non-costing profile/workflow defaults after the number path is chosen. | Preserve explicit provider-purchase confirmation, destination verification, billing settlement, dry-run reconciliation, and explicit go-live. |
| Script Ops | Recommend existing approved scripts before generation and group review queues by static-analysis reason. | Pinned provenance, exact-version review, no auto-approval, no endpoint/browser/API execution, and audited download only. |

## Verification evidence

- Focused deterministic/static regression: 22/22 pass across the six companion
  builders, all six dashboard mounts, and the existing three Core Suite briefs.
- Combined focused and Phase 50/51/shared route-contract run: 34/34 pass.
- Root `corepack pnpm typecheck`: pass for API, runner gateway, web, and
  TorqueShed native.
- `INTERNAL_API_URL=http://localhost:5001` plus bounded Node heap,
  `corepack pnpm build:production`: pass, including deployment-scope validation,
  FaultlineLab compiler tests 4/4, repeated four-target typecheck, API, runner
  gateway, SDK, and optimized Next production output for 35 pages.
- `git diff --check`: no whitespace error; only normal Windows line-ending
  notices.

This is source/local evidence. No persistent or production database, provider,
customer data, billing state, entitlement, deployment, domain, traffic, commit,
push, or publication changed. Exact-host authenticated browser/mobile/
accessibility, realistic data-volume, production release identity, monitoring,
backup, restore, and rollback acceptance remain open. The companion modules
retain their existing state-4/source-local parity boundaries.
