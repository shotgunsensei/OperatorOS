# TechDeck zero-gap parity matrix

## Resolution Intelligence Phase 4 overlay (2026-09-27 UTC)

Evidence-derived KB/runbook previews and linked drafts now use the existing
document editor, revision store and review/approval/publication workflow.
Additional incident links preserve edits. Every linked source restricts generic
document access; changed source revisions block workflow advancement. Broader
compliance packets exclude these documents and declare the exclusion.
Twenty focused, 1,587 API, 102 integration, 32 browser journeys and 4 visual cases
pass, plus production build/typechecks, hardening and supporting gates. Browser
navigation/detail issues were corrected and the final aggregate ran on a clean
disposable database; no baselines or policy limits were weakened. See
[implementation status](../../IMPLEMENTATION_STATUS.md) for exact evidence and
[the document guide](../../techdeck/resolution-intelligence-documents.md) for
scope and rollback constraints. Storage stays v64; historical parity counts and
deployment readiness are not promoted. Phase 5 semantic retrieval remains next.


## Resolution Intelligence Phase 3 overlay (2026-09-27 UTC)

Technician V1 is implemented above the merged v64 storage/ingestion foundation:
native and embedded import/detail/search/history, prompt settings and downloads,
native client/device history links, warning-first evidence and inert commands.
Tenant, role, active revision and archive filters govern every read and score;
raw downloads require administrator authority and append an audit. Review and
archive use optimistic versions. Exact/full-text search is enabled; semantic
search, AI research and document generation remain later scope.

Fourteen focused workspace checks, 1,575 API and 90 integration tests, production
build/typechecks, hardening, preflight and route/static visual contracts pass.
Thirty unchanged browser journeys plus the corrected new technician journey
and four visual cases pass across the documented runs; refer to
[implementation status](../../IMPLEMENTATION_STATUS.md) for exact final counts
and limitations. The [Phase 3 review](../../techdeck/resolution-intelligence-phase3-review.md)
records the merged CI fixture correction, security findings and subsequent
source-backed remediation review. Historical source restoration counts below
are unchanged. Phase 4 evidence-derived document drafts are next; there is no
production-readiness promotion or deployment.


## Resolution Intelligence Phase 2 overlay (2026-09-27 UTC)

This new subsystem is tracked separately from the historical imported-source
counts below. Phase 1 storage is merged and CI-verified; Phase 2 ingestion is
implemented with 43 focused and 1,561 full API checks passing without skips.
Production build, 76 integration checks, 30 browser journeys and 4 visual cases
pass. After the final timestamp correction, 43 focused, 76 integration, a fresh
build and 3 TechDeck production browser checks passed again. Exact chronology,
scope and the existing mobile Help overlap are tracked in
[implementation status](../../IMPLEMENTATION_STATUS.md). Phase 3 technician
pages, search/read/history and prompt settings remain open; no production
readiness or source-restoration count is promoted. See the
[API contract](../../techdeck/resolution-intelligence-api.md) and
[review evidence](../../techdeck/resolution-intelligence-phase2-review.md).

## Phase 20 truth notice (2026-08-08)

The "zero-gap" matrix below is historical implementation evidence, not current
release truth. `docs/parity/modules/techdeck.json` records 1,337 capabilities:
73 native, 101 shared-equivalent, 0 owner-waived, and 1,163 blocked. The strict
source check found 28 facets whose claimed implementation paths are absent from
the pinned import; former retirements remain blocked. See
`docs/phase-20/PRODUCT-TRUTH-REPORT.md`.

Assessment date: 2026-07-29

Recovered source: clean `C:\Dev\Tech-Deck` `main` at
`8125f8d89d8d39d60a50c8061a26133a0c917792`. The source remains read-only:
its standalone server, dependencies, migrations, uploads, identity, billing,
and provider processes are not activated in OperatorOS.

The executable ledger at `docs/modules/techdeck/SOURCE_LEDGER.json` inventories
all 382 discovered source capabilities: 65 pages, 221 API routes, 45 database
tables, 46 provider/config references, and 5 background processes. It records
91 active capabilities, 109 shared OperatorOS replacements, 48 security
retirements, 134 product-boundary retirements, zero unclassified items, and
zero restoration gaps. `corepack pnpm verify:techdeck:source` fails closed on
source drift, missing current-repository targets/evidence, or a newly
unclassified/gap item.

| Source capability | OperatorOS target/disposition | Current evidence |
| --- | --- | --- |
| Local users, sessions, MFA, tenants, memberships, invitations, system admin | Excluded; OperatorOS authority only | SSO/integration contracts, host-only sessions, and negative tests |
| Local plans, Stripe checkout/webhooks, subscriptions, usage entitlements | Excluded; OperatorOS platform billing only | Decommissioned child routes remain unmounted |
| Clients, contacts, sites | Shared Directory organizations, contacts, sites, relationships, and `techdeck_managed_client_profiles` | Directory API/UI tests and exact `/clients/:id` selection |
| Legacy assets and recovered configuration inventory | Namespaced `techdeck_assets` configuration model with Directory references, lifecycle, health, technical metadata, versions, and archive state | Isolated PostgreSQL workflows plus exact item deep links |
| Servers, workstations, firewalls, switches, APs, printers, network devices, applications/services, vendors | Typed configuration items | Create, filter, update, persistence, and browser checks |
| VLAN, subnet, address, gateway, DHCP, DNS, WAN circuit, public IP | Typed network/IPAM configuration records with validation and topology relationships | ADR-0012, database workflow, and exact-host browser journey |
| Configuration relationships | Same-tenant directed graph with composite foreign keys and duplicate/self-link denial | Relationship and tenant-isolation tests |
| Licenses, certificates, warranties | Lifecycle configuration records and due/expired dashboard projections | Metrics and lifecycle assertions |
| Tickets/comments/SLA | Technician tickets with Directory/site/configuration links, versions, comments, and time; PulseDesk retains healthcare service-delivery ownership | Ticket/time API, persistence, exact `/tickets/:id`, and mobile `/m/tickets/:id` |
| Runbooks/procedures | Documentation records with draft, review, approve, publish, archive, immutable revisions, links, and shared attachments | ADR-0014, transition tests, and exact `/kb/:id` browser flow |
| Documentation folders/pages/tags/backlinks | Namespaced folders, safe Markdown/text pages, tags, explicit links/backlinks, and revisions | Search, revision, record selection, and reload evidence |
| Evidence vault and reports | Namespaced evidence metadata plus deterministic report snapshots; binary files use shared private attachments | Typed evidence selector regression plus workflow tests |
| Time entries | Bounded tenant/user/ticket/client/site/configuration-linked minutes and notes | API and responsive `/m/time` browser workflow |
| CSV import preview/commit | Deterministic dry-run importer with source fingerprints, duplicate/reference checks, row errors, counts, and reconciliation; apply remains human-gated | Import tests and fixture |
| External credential reference | Bounded non-secret vault reference only; no value/reveal API | ADR-0013 and forbidden-field tests |
| IT Ops AI/script console and browser localStorage vault | Security-retired; no remote action or secret store | ADR-0013/0014 and threat model |
| Calendar/dispatch and recurring ticket generator | Product-boundary retired; future scheduling must use shared leased jobs and explicit recurrence/timezone/cancellation semantics | Ledger disposition; no inactive button |
| Business invoicing | Product-boundary retired; TradeFlowKit owns lead-to-cash and OperatorOS owns platform billing | Boundary documentation |
| Standalone Knowledge Base | Consolidated into versioned TechDeck documentation pages | Documentation workflow and `/kb` compatibility routes |
| Secure intake/client portal | Security-retired pending shared uploader identity, consent, retention, relationship, rate, and malware-scanning policy | Threat-model residual gate; no anonymous placeholder |
| License server, API tokens, outbound webhooks, public status pages | Retired from the module; these require separate OperatorOS-wide shared-service policy | Ledger disposition and existing shared authority |
| Mobile routes | Responsive OperatorOS shell with `/m`, `/m/tickets`, and `/m/time` compatibility paths rather than a second mobile router | 390-pixel browser acceptance |

## Route and UI compatibility

The active shell now resolves source-compatible `/m`, `/m/tickets`,
`/m/time`, `/kb`, `/evidence/upload`, ticket, managed-client, configuration,
document, evidence, and report record paths to real tenant-scoped state. Exact
records are selected or explicitly reported unavailable rather than rendering
a misleading generic panel. Canonical module-host `/app` remains the
OperatorOS My Apps return path and is intentionally not captured by TechDeck.

The document, evidence, and report selectors retain machine enum values while
showing human-readable labels. This fixes a real create-flow defect where
labels such as `Test result` were previously submitted instead of accepted
values such as `test_result`.

## Completion boundary

TechDeck satisfies consolidation state 4 for its approved source/local product
boundary. State 5 still requires deployment of the reviewed cumulative
revision, public 48/48 verification, authenticated deployed TechDeck
create/update/reload/deep-link/logout and second-tenant denial evidence,
production attachment/provider decisions, and an authorized standalone-data
cutover. No local result waives those gates.
