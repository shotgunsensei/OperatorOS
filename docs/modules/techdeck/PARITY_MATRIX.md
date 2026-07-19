# TechDeck Phase 5 parity matrix

Assessment date: 2026-07-18

Recovered source: `C:\Dev\Tech-Deck` at
`8125f8d89d8d39d60a50c8061a26133a0c917792` (`main`, clean). The legacy
quarantined snapshot contains 302 files: 265 are byte-identical to the
recovered checkout, 36 contain earlier OperatorOS conversion edits, and one is
snapshot-only. The recovered checkout has 122 additional tracked files,
primarily agent/prompt evidence plus the later operations workspace. None of
the standalone server, dependencies, uploads, or migrations are activated.

The recovered source defines 45 PostgreSQL tables, 215 Express route
registrations across auth and 27 route modules, 20 module manifests, and 17
test files with 135 direct test declarations. Its July 15 operations
restoration is the primary product evidence for infrastructure, network,
documentation, lifecycle, and import behavior.

| Source capability | OperatorOS target/disposition | Phase 5 evidence |
| --- | --- | --- |
| Local users, sessions, MFA, tenants, memberships, invitations, system admin | Excluded; OperatorOS authority only | SSO/integration contracts and existing negative tests |
| Local plans, Stripe checkout/webhooks, subscriptions, usage entitlements | Excluded; OperatorOS platform billing only | Existing 410/decommission evidence; routes remain unmounted |
| Clients, contacts, sites | Shared Directory organizations, contacts, sites, relationships, and `techdeck_managed_client_profiles` | Directory DB/browser tests plus Phase 5 compatibility and association tests |
| Legacy assets and recovered configuration inventory | Expanded namespaced `techdeck_assets` configuration model with Directory references, lifecycle, health, technical metadata, versions, archive state | Phase 5 workflow and restart tests |
| Servers, workstations, firewalls, switches, APs, printers, network devices, applications/services, vendors | Typed configuration items | Phase 5 create/filter/search tests |
| VLAN, subnet, address, gateway, DHCP, DNS, WAN circuit, public IP | Typed network/IPAM configuration records with syntactic validation and topology relationships | ADR-0012 and Phase 5 network journey |
| Configuration relationships | Same-tenant directed graph with composite foreign keys and duplicate/self-link denial | Phase 5 relationship/isolation tests |
| Licenses, certificates, warranties | Lifecycle configuration records and due/expired dashboard projections | Phase 5 metrics and lifecycle assertions |
| Tickets/comments/SLA | Existing technician tickets retained; Directory/site/configuration links, versions, comments, and time are added without owning PulseDesk service delivery | Phase 5 ticket/time workflow tests |
| Runbooks/procedures | Safe documentation records with draft, review, approve, publish, archive, immutable revisions, links, and shared attachments | ADR-0014 and Phase 5 document workflow tests |
| Documentation folders/pages/tags/backlinks | Namespaced folders, safe Markdown/text pages, tag arrays, explicit cross-links/backlinks, revisions | Phase 5 search/deep-link/revision tests |
| Evidence vault and reports | Namespaced evidence metadata plus deterministic report snapshots; binary files use shared private attachments | Shared attachment controls and Phase 5 evidence/report tests |
| Time entries | Bounded tenant/user/ticket/client/site/configuration-linked minutes and notes | Phase 5 workflow tests |
| CSV import preview/commit | Deterministic dry-run importer with source fingerprints, duplicate/reference checks, row errors, counts, and reconciliation; apply remains human-gated | Phase 5 import tests and fixture |
| External credential reference | Bounded non-secret vault reference only; no value/reveal API | ADR-0013 and forbidden-field tests |
| IT Ops AI/script console and browser localStorage "vault" | Excluded from active runtime; no remote action or secret store | ADR-0013/0014 and threat model |
| Calendar/dispatch and recurring ticket generator | Excluded from Phase 5: scheduling belongs in shared leased jobs and needs recurrence/timezone/cancellation semantics | Parity disposition; no active button |
| Business invoicing | Excluded from TechDeck core; TradeFlowKit owns lead-to-cash and OperatorOS owns platform billing | Boundary documentation |
| Standalone Knowledge Base | Consolidated into versioned TechDeck documentation pages | Phase 5 documentation workflow |
| Secure intake/client portal | Not approved for anonymous Phase 5 activation; shared attachments exist, but token abuse, uploader identity, consent, retention, and portal relationship policy require a later decision | Threat-model residual gap; no placeholder claim |
| License server, API tokens, outbound webhooks, public status pages | Excluded from TechDeck product parity: platform/shared capabilities require separate OperatorOS-wide policy | Existing shared services and explicit parity disposition |
| Mobile routes | Responsive OperatorOS shell rather than a second mobile application/router | Web typecheck/build and browser viewport evidence |

## Completion boundary

Phase 5 may reach source/local state 4 when the approved target rows above are
implemented and locally verified. State 5 still requires deployment of the
cumulative revision, public 47/47 verification, authenticated deployed
TechDeck workflow/deep-link/logout evidence, production attachment/provider
decisions, and an approved standalone-data cutover. No local result waives
those gates.
