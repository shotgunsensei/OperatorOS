# Phase 50 — Business Operations Route Migration

Status: implementation in progress  
Branch: `codex/phases-41-52-revenue-routes`

## Authority and scope reconciliation

The active module registry, deep-link compatibility map, Phase 31–40 delivery records, and the six native shells were reviewed before implementation. The business-operations batch is TechDeck, PulseDesk, FaultlineLab, SnapProofOS, CallCommand AI, and OutCall. CallCommand AI and OutCall are the active operations/communications products introduced or materially expanded in Phases 31–40; no additional active operations module was found that should be silently added to this batch. OperatorOS remains the only identity, tenant, role, entitlement, launch, and platform-billing authority.

This document records each owner-readable route map before that module is changed. Legacy paths remain compatibility aliases to a canonical route. A listed route must render an existing capability or an honest state; it must never imply that a placeholder is a working feature.

## Pre-implementation route maps

### TechDeck

| Owner task | Canonical route | Existing capability retained | Compatibility paths |
| --- | --- | --- | --- |
| See operational posture | `/` | Readiness, prioritized workflow entry, tenant and role context | `/dashboard`, `/m` |
| Triage service tickets | `/tickets` | Queue, assignment, SLA pressure, status transitions, record targeting | `/m/tickets`, `/tickets/:ticketId` |
| Manage clients and assets | `/clients`, `/assets` | Shared clients/sites/contacts and configuration inventory | `/inventory`, `/sites`, `/contacts`, `/assets/:assetId` |
| Maintain network records | `/network` | Network/IPAM relationships and managed infrastructure | `/ipam` |
| Control lifecycle | `/lifecycle` | Warranty, renewal, expiration, health, and record posture | — |
| Maintain procedures | `/documentation`, `/runbooks` | Versioned documents, knowledge, approval-controlled runbooks | `/kb`, `/knowledge-base`, `/scripts` |
| Capture technical evidence | `/evidence` | Evidence creation, evidence register, record targeting | `/evidence/upload`, `/evidence/:evidenceId` |
| Produce reports and time | `/reports`, `/time` | Checksummed snapshot reports and technician time | `/reports/:reportId`, `/m/time` |
| Run recurring work | `/calendar` | Appointments and recurring service tickets | `/recurring-tickets` |
| Collaborate with clients | `/portal` | Client/site-scoped portal ticket and evidence collaboration | `/portal/tickets`, `/portal/evidence` |
| Manage product licensing | `/licenses` | Issue, validate, revoke, and audit licenses | `/licenses/developer`, `/licenses/:licenseId` |
| Manage status and compliance | `/status`, `/compliance` | Incidents/components, secure intake, compliance packets, IT operations guidance | `/status-admin`, `/secure-intake`, `/compliance-packets`, `/itops` |
| Manage integration access | `/webhooks`, `/api-tokens` | Outbound webhooks and scoped API tokens | — |
| Control module access | `/settings` | OperatorOS-owned access and module context | — |

### PulseDesk

| Owner task | Canonical route | Existing capability retained | Compatibility paths |
| --- | --- | --- | --- |
| See care-operations posture | `/` | Request/work-queue metrics, tenant and access context | `/app`, `/dashboard` |
| Work requests and queues | `/requests` | Service requests, categories, departments, SLA/escalation workflow | `/tickets`, `/submit`, `/requests/new`, `/requests/:requestId` |
| Coordinate assignments | `/assignments` | Department/team assignment and escalation context | `/departments`, `/service-desk/admin`, `/service-desk-admin` |
| Manage authorized contacts | `/contacts` | Shared clients, facilities/sites, contacts, and vendors without introducing PHI | `/clients`, `/facilities`, `/sites`, `/vendors` |
| Handle inbound work | `/inbound` | Authorized inbound communication and intake boundaries | `/supply-requests`, `/facility-requests` |
| Review analytics | `/analytics` | Operational reporting and SLA posture | — |
| Maintain operational knowledge | `/knowledge` | Existing knowledge capability and safe workflow guidance | — |
| Configure integrations | `/integrations` | Existing provider/integration readiness surfaced honestly | — |
| Control module access | `/settings` | OperatorOS-owned identity, membership, and healthcare boundary guidance | — |

### FaultlineLab

| Owner task | Canonical route | Existing capability retained | Compatibility paths |
| --- | --- | --- | --- |
| See diagnostic-learning posture | `/` | Progress, assigned work, and challenge overview | `/dashboard` |
| Browse the case library | `/challenges` | Challenge board and daily challenge | `/daily`, `/challenges/:challengeId` |
| Work an investigation | `/sessions/:sessionId` | Investigation workspace, evidence, answers, scoring, and durable run state | `/sessions` |
| Manage assignments | `/assignments` | Tenant assignment workflow | — |
| Review runs and evidence | `/runs`, `/evidence` | Durable sessions, evidence, and progress | `/progress` |
| Author challenges | `/authoring` | Existing challenge authoring and validation | — |
| Report tenant outcomes | `/reports` | Tenant analytics and learning outcomes | `/analytics` |
| Control module behavior | `/settings` | Access and module context | — |

### SnapProofOS

| Owner task | Canonical route | Existing capability retained | Compatibility paths |
| --- | --- | --- | --- |
| See evidence-operation posture | `/` | Job/case posture and capture priorities | `/dashboard` |
| Manage jobs | `/jobs` | Existing case/job creation and record workflow | `/cases`, `/jobs/new`, `/jobs/:jobId`, `/cases/:caseId` |
| Capture and preserve evidence | `/capture`, `/evidence` | Capture, uploads, metadata, checksums, custody and retention | `/evidence/:evidenceId`, `/custody`, `/retention` |
| Review and approve | `/review` | Review queue, approvals, and exceptions | — |
| Report, share, and export | `/reports`, `/share`, `/exports` | Reports, bounded sharing, and authorized export | `/reports/:reportId` |
| Manage customers/projects | `/customers`, `/projects` | Tenant-scoped directory and job/case relationships | `/customers/:customerId`, `/projects/:projectId` |
| Control module behavior | `/settings` | Retention, access, and provider readiness | — |

### CallCommand AI

| Owner task | Canonical route | Existing capability retained | Compatibility paths |
| --- | --- | --- | --- |
| Run the switchboard | `/` | Communications posture and prioritized call work | `/dashboard`, `/switchboard` |
| Review calls | `/calls` | Call records, call details, outcomes, and provider truth | `/calls/:callId` |
| Review recordings/transcripts | `/recordings`, `/transcripts` | Existing recording and transcript availability with compliance boundaries | — |
| Review analysis/actions | `/analysis`, `/actions` | Bounded analysis and explicit follow-up actions | `/work`, `/tickets`, `/leads`, `/tasks` |
| Manage automations | `/automations` | Existing profiles, flows, and channel automation | `/profiles`, `/flows`, `/channels` |
| Manage numbers/providers | `/numbers`, `/providers` | Telephony setup and provider readiness | `/setup/telephony` |
| Maintain MSP organization data | `/organizations` | Existing MSP org/contact/policy/onboarding capability | `/msp/organizations`, `/msp/contacts`, `/msp/policy`, `/msp/onboarding` |
| Review compliance | `/compliance` | Consent, audit, recording, and provider-boundary status | `/msp/audit` |
| Control module behavior | `/settings` | Access and integration configuration | — |

### OutCall

| Owner task | Canonical route | Existing capability retained | Compatibility paths |
| --- | --- | --- | --- |
| See outbound-work posture | `/` | Readiness, upcoming work, and delivery state | `/dashboard` |
| Manage contacts | `/contacts` | Tenant-scoped recipient/contact records | `/profiles` |
| Plan outbound work | `/schedules`, `/campaigns` | Schedules, triggers, and bounded campaigns | `/triggers` |
| Review calls | `/calls` | Call records, result state, and record details | `/calls/:callId` |
| Manage reminders | `/reminders` | Existing reminder workflows | — |
| Verify intended delivery | `/verification` | Verification controls and operator confirmation | — |
| Review provider delivery | `/delivery` | Provider-honest delivery state and readiness | `/readiness`, `/setup` |
| Review history | `/history` | Durable attempts, results, and audit context | — |
| Review compliance | `/compliance` | Privacy, consent, retention, and provider boundaries | `/privacy` |
| Control module behavior | `/settings` | Access, delivery defaults, and integration state | — |

## Implementation and evidence ledger

Each module receives an independent checkpoint only after its focused source/API/browser checks pass. Final cross-module route, responsive, accessibility, and same-tab navigation evidence will be appended after all six checkpoints.

| Module | Route implementation | Focused verification | Checkpoint |
| --- | --- | --- | --- |
| TechDeck | Complete: 19 canonical owner routes plus record paths and compatibility redirects | 23/23 focused API/static checks; root typecheck; production build; 1/1 exact-host route/browser/accessibility check | This commit |
| PulseDesk | Complete: 10 canonical owner routes, durable request detail routes, and compatibility redirects | 38/38 focused API/static/domain checks; root typecheck; production build; 1/1 exact-host route/browser/accessibility check | This commit |
| FaultlineLab | Complete: 9 canonical owner routes, challenge/session record paths, and compatibility redirects | 8/8 focused catalog/domain/import/static/workflow checks; root typecheck; production build; 1/1 exact-host route/browser/accessibility check | This commit |
| SnapProofOS | Complete: 19 canonical owner routes, durable job detail routes, and compatibility redirects | 10/10 focused API/static checks; root typecheck; production build; 1/1 exact-host route/browser/accessibility check | This commit |
| CallCommand AI | Pending | Pending | Pending |
| OutCall | Pending | Pending | Pending |

## TechDeck implementation evidence

- Identity: compact midnight MSP console with cyan infrastructure signals and green verified-state accents (`techdeck-midnight-msp-cyan`). It uses the Phase 48 application shell without adopting another product's visual language.
- Route ownership: URL state now selects exactly one overview, ticket, directory, managed-operations, trust-operations, or settings route. Back, forward, refresh, active navigation, and the source-routed `/modules/techdeck/*` surface are URL-driven.
- Focused loading: tickets, the shared business directory, managed infrastructure, and literal trust operations are dynamically split. Managed routes no longer fetch ticket/literal data; literal routes no longer fetch the managed workspace or ticket queue. Directory profile data is requested by the managed workspace only for inventory/document routes that use it.
- Preserved capabilities: tenant-scoped ticket lifecycle, shared clients/sites/contacts, configuration inventory, network relationships, lifecycle posture, documents, non-executing runbooks, evidence, immutable reports, time, calendar/recurrence, client portal assignments, licensing, public status, HMAC webhooks, scoped tokens, secure intake, compliance packets, and documentation-only IT Ops guidance remain wired to their existing APIs.
- Access and safety: OperatorOS identity, entitlement, tenant, and role authority are unchanged. Viewer writes remain hidden, privileged forms retain their role gates, arbitrary command execution remains unavailable, and one-time secrets retain their copy-now behavior.
- Compatibility: historical aliases redirect to canonical routes. The middleware exclusion was narrowed from every path beginning with `api` to only `/api` and `/api/*`, allowing the pre-existing `/api-tokens` product route to participate in exact-host SSO without changing API proxy behavior.
- Accessibility correction: previously placeholder-only literal-workspace controls now have programmatic names. The exact-host route suite found and closed that defect before acceptance.
- Visual evidence: [TechDeck assets desktop](./evidence/techdeck-assets-desktop.png) and [TechDeck tickets mobile](./evidence/techdeck-tickets-mobile.png).

Verification performed from `C:\Dev\OperatorOS` against the disposable PostgreSQL database on `127.0.0.1:55441`:

```powershell
corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 `
  test/techdeck-state5-static.test.ts test/techdeck-literal-static.test.ts `
  test/techdeck-ops-workflows.test.ts test/techdeck-literal-product.test.ts `
  test/techdeck-shared-runtime-tickets.test.ts test/business-directory.test.ts `
  test/business-directory-ui-static.test.ts
# 23 passed, 0 failed

corepack pnpm typecheck
# 4 workspace projects passed

$env:INTERNAL_API_URL='http://127.0.0.1:5001'
corepack pnpm build:production
# API, runner gateway, and Next production build passed

$env:PARITY_DATABASE_IS_DISPOSABLE='1'
node scripts/phase50-business-operations-browser.mjs
# phase50-techdeck-routes.spec.ts: 1 passed
```

The browser gate exercised all 19 canonical routes, three compatibility redirects, same-tab shell navigation, refresh/back history, route-active state, focused API loading, desktop/mobile overflow, control labeling, five axe scans, and console/HTTP error collection. No TechDeck waiver remains open. This is compiled exact-host local evidence; deployment and public-provider acceptance remain separate gates.

## PulseDesk implementation evidence

- Identity: midnight clinical-operations shell with cyan care-flow signals and green healthy-state accents (`pulsedesk-clinical-operations-blue`). PulseDesk remains a healthcare operations coordinator and is not presented as a helpdesk, patient chart, EHR, medical device, or compliance certification.
- Route ownership: the URL now owns overview, requests, assignments, contacts, equipment/facility operations, inbound communication, analytics, knowledge, integrations, and settings. Request detail deep links survive refresh and back/forward history. Historical service-desk, department, asset, facility, and client paths redirect to their canonical owner routes.
- Focused loading: service-desk, department queue, connector, and directory workspaces are dynamically split. The knowledge route requests only operational knowledge; dashboard, ticket, asset, supply, and facility APIs are not loaded there. Connector setup remains restricted to organization managers and platform administrators.
- Preserved capabilities: tenant-scoped service tickets, request numbering, queues, teams, assignments, SLA evaluation, status transitions, messages, time, attachments, vendors, saved views, bulk actions, department escalation, facilities, contacts, equipment, supply/facility requests, operational knowledge, inbound connectors, and notification settings remain on their existing APIs.
- Access and safety: OperatorOS continues to own identity, entitlement, tenant, membership, and role authority. The route application repeatedly states and enforces the operational-only/no-unnecessary-PHI boundary; no patient-record capability or certification claim was introduced.
- Accessibility and responsive corrections: route migration exposed a queue filter overflow at shell-content width and inherited low-contrast light-theme colors. The queue now reflows inside the shared shell, its complete dark boundary meets the tested WCAG checks, service-desk controls have programmatic names, and headings follow a coherent hierarchy.
- Visual evidence: [PulseDesk requests desktop](./evidence/pulsedesk-requests-desktop.png) and [PulseDesk assignments mobile navigation](./evidence/pulsedesk-assignments-mobile.png).

Verification performed from `C:\Dev\OperatorOS` against the disposable PostgreSQL database on `127.0.0.1:55441`:

```powershell
corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 `
  test/pulsedesk-service-desk-static.test.ts test/pulsedesk-service-desk-domain.test.ts `
  test/pulsedesk-state5-workflow.test.ts test/pulsedesk-requests-domain.test.ts `
  test/pulsedesk-shared-runtime-requests.test.ts test/pulsedesk-queue-ui-static.test.ts `
  test/pulsedesk-literal-static.test.ts test/pulsedesk-literal-product.test.ts `
  test/business-directory.test.ts test/business-directory-ui-static.test.ts
# 38 passed, 0 failed

corepack pnpm typecheck
# 4 workspace projects passed

$env:INTERNAL_API_URL='http://127.0.0.1:5001'
corepack pnpm build:production
# API, runner gateway, and Next production build passed

$env:PARITY_DATABASE_IS_DISPOSABLE='1'
$env:PHASE50_BROWSER_SPEC='pulsedesk'
node scripts/phase50-business-operations-browser.mjs
# phase50-pulsedesk-routes.spec.ts: 1 passed
```

The browser gate exercised all canonical routes and a request record deep link, four compatibility redirects, ticket creation, same-tab shell navigation, refresh/back history, route-active state, focused knowledge loading, desktop/tablet/mobile overflow, control labeling, six axe scans, and console/HTTP error collection. No PulseDesk waiver remains open. This is compiled exact-host local evidence; deployment, authenticated public-host acceptance, and live-provider acceptance remain separate gates.

## FaultlineLab implementation evidence

- Identity: violet diagnostic evidence grid with cyan fault signals (`faultlinelab-violet-evidence-grid`). It uses the shared Phase 48 shell while retaining FaultlineLab’s proving-ground language, evidence trails, and lab visual system.
- Route ownership: overview, challenge library and challenge records, investigation sessions, assignments, runs, evidence, authoring, reports, and settings are URL-owned. The previous internal tab state and manual `history.pushState` path mutation were removed; Next route navigation now owns refresh, back/forward history, active navigation, and session deep links.
- Focused loading: each route requests only the catalog, runs, progress, assignments, daily challenge, members, or manager analytics it consumes. Settings mounts no FaultlineLab API workload. Challenge and session records are loaded only for their record routes.
- Preserved capabilities: all 56 compiler-published cases, catalog search/facets/sort, daily selection, standard/assignment/chaos runs, allowlisted diagnostic actions, sealed evidence, hints, server-only scoring, debriefs, private proof, assignment creation/cancellation, personal progress, badges, CSV export, versioned challenge authoring, validation, preview, import/export, publication, retirement, and author assets remain wired to existing tenant-scoped APIs.
- Access and safety: OperatorOS remains identity, tenant, role, entitlement, and audit authority. Viewers cannot start or mutate attempts, managers retain assignment/publication controls, arbitrary host commands remain unavailable, and scores explicitly do not imply a certificate, production authorization, or live-system access.
- Source corrections: the route migration replaced the monolithic full-workspace loader, corrected heading hierarchy in challenge detail, added programmatic names to proof/command controls, and fixed an authoring file input whose hidden width was being overridden and causing a 566 px horizontal overflow.
- Visual evidence: [FaultlineLab challenge library desktop](./evidence/faultlinelab-challenges-desktop.png) and [FaultlineLab evidence mobile navigation](./evidence/faultlinelab-evidence-mobile.png).

Verification performed from `C:\Dev\OperatorOS` against the disposable PostgreSQL database on `127.0.0.1:55441`:

```powershell
corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 `
  test/faultlinelab-static.test.ts test/faultlinelab-domain.test.ts `
  test/faultlinelab-full-catalog.test.ts test/faultlinelab-import-plan.test.ts `
  test/faultlinelab-workflow.test.ts
# 8 passed, 0 failed

corepack pnpm typecheck
# 4 workspace projects passed

$env:INTERNAL_API_URL='http://127.0.0.1:5001'
corepack pnpm build:production
# catalog drift gate, API, runner gateway, and Next production build passed

$env:PARITY_DATABASE_IS_DISPOSABLE='1'
$env:PHASE50_BROWSER_SPEC='faultlinelab'
node scripts/phase50-business-operations-browser.mjs
# phase50-faultlinelab-routes.spec.ts: 1 passed
```

The browser gate exercised nine canonical routes, challenge and session record deep links, four compatibility redirects, a real start-and-action investigation journey, same-tab navigation, refresh/back history, route-active state, zero-API settings loading, desktop/tablet/mobile overflow, control labeling, six axe scans, and console/HTTP error collection. No FaultlineLab waiver remains open. This is compiled exact-host local evidence; deployment and authenticated public-host acceptance remain separate gates.

## SnapProofOS implementation evidence

- Identity: forensic charcoal evidence workspace with accessible rose control accents and teal integrity signals (`snapproof-forensic-red-teal`). It uses the shared Phase 48 shell while retaining SnapProofOS field-proof, custody, and defensible-delivery language.
- Route ownership: overview, customers, projects, jobs and job records, capture, findings/notes, costs, templates, team, activity, evidence integrity, review, reports, secure sharing, exports, custody, retention, branding, and settings are URL-owned. The previous in-component tab state, duplicate product header/navigation, `history.pushState`, and `popstate` synchronization were removed.
- Focused loading: the field workspace now loads only the customers, jobs, templates, team, activity, branding, export history, or offline queue needed by its active route. Settings mounts no SnapProofOS API workload. Job detail is limited to workflows that consume a selected job. The evidence-integrity workspace likewise scopes dashboard, evidence, report, case-detail, and custody calls by route.
- Preserved capabilities: tenant-scoped customers and jobs, search and filtering, assignments, offline capture/reconciliation, private attachment storage, structured findings and internal notes, parts/labor value, templates, evidence hashes, append-only custody, review decisions, branded immutable report snapshots, validated PDF/DOCX exports, approved JSON/CSV evidence exports, one-time revocable share links, retention/legal hold, audit activity, and branding remain wired to existing persistent APIs.
- Product-boundary reconciliation: the canonical `/projects` owner route uses the durable job workspace as the existing project record rather than inventing a second data model. Historical case paths redirect to canonical job paths because both active workflows are backed by the same `snapproof_cases` records. Platform identity, membership, entitlement, billing, and profile controls remain in OperatorOS.
- Access and safety: OperatorOS continues to own identity, tenant, role, entitlement, and audit authority. Evidence remains private by default; raw credentials or public attachment URLs were not introduced; report export and sharing still require approved records; offline capture retains its local queue and server validation behavior.
- Source corrections: the exact-host suite found and closed an active-navigation contrast defect (4.1:1 before correction) and a server query that requested nonexistent `tenant_users.created_at`; the team endpoint now uses canonical `tenant_users.joined_at` and completed without 500s.
- Visual evidence: [SnapProofOS reports desktop](./evidence/snapproofos-reports-desktop.png) and [SnapProofOS capture mobile navigation](./evidence/snapproofos-capture-mobile.png).

Verification performed from `C:\Dev\OperatorOS` against the disposable PostgreSQL database on `127.0.0.1:55441`:

```powershell
corepack pnpm --dir apps/api exec tsx --test `
  test/snapproofos-phase11b-contract.test.ts `
  test/snapproofos-phase32-static.test.ts `
  test/snapproofos-phase50-routes.test.ts
# 10 passed, 0 failed

corepack pnpm typecheck
# 4 workspace projects passed

$env:INTERNAL_API_URL='http://localhost:5001'
corepack pnpm build:production
# catalog drift gate, API, runner gateway, and Next production build passed

$env:PARITY_DATABASE_IS_DISPOSABLE='1'
$env:PHASE50_BROWSER_SPEC='snapproofos'
node scripts/phase50-business-operations-browser.mjs
# phase50-snapproofos-routes.spec.ts: 1 passed
```

The browser gate exercised all 19 canonical routes and a durable job record deep link, eight compatibility redirects, a real customer-to-job-to-persisted-report journey, same-tab navigation, refresh/back history, route-active state, zero-API settings loading, desktop/tablet/mobile overflow, control labeling, six axe scans, and console/HTTP error collection. No SnapProofOS waiver remains open. This is compiled exact-host local evidence; deployment, public-host acceptance, and live-provider acceptance remain separate gates.
