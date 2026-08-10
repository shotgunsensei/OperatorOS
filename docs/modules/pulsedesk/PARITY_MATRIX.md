# PulseDesk parity matrix

## Phase 20 truth notice (2026-08-08)

The matrix below is historical implementation evidence. Current release truth
is `docs/parity/modules/pulsedesk.json`: 889 capabilities, 65 native, 60
shared-equivalent, 0 owner-waived, and 764 blocked. The strict source check
found 49 facets whose claimed implementation paths are absent from the pinned
import; former retirements remain blocked. See
`docs/phase-20/PRODUCT-TRUTH-REPORT.md`.

Assessment date: 2026-07-29

The clean provenance source is `C:\Dev\PulseDesk` at
`937849471e489ed23db2a263d04160a388402740` (`main`, clean). The older
quarantined snapshot has 211 files. Of the current source's 228 tracked files,
181 match the snapshot byte-for-byte, 30 differ, and 17 newer tracked files
are absent from the snapshot. The missing files include the July 15 service
desk restoration routes, pages, migration, smoke, and E2E evidence. Neither
source tree is executable OperatorOS code; its server, dependencies,
migrations, local storage, and provider processes remain unmounted.

The current source defines 183 Express route declarations and 50
standalone tables across service delivery, identity, billing, connectors, and
email. The active pre-Phase-6 OperatorOS slice has four PulseDesk tables and a
PHI-minimized department escalation queue.

## Executable zero-gap rebaseline

`SOURCE_LEDGER.json` is generated and verified by
`node scripts/pulsedesk-source-ledger.mjs`. It commit-pins and classifies all
309 discovered source capabilities: 23 pages, 183 routes, 50 tables, 45
provider/config references, and 8 background processes. The current
dispositions are 91 active, 74 shared OperatorOS replacements, 53 retired for
security, 91 retired by product boundary, zero unclassified, and zero
restoration gaps.

The verifier fails when the source commit or cleanliness changes, a discovered
capability is omitted, an active/shared target path is missing, an evidence
pointer is missing, or any item remains unclassified or a restoration gap.
This makes “no approved source/local gap” executable rather than a narrative
claim. Retired items do not become product omissions: local identity,
subscription billing, unsafe credentials/connectors, child schema/runtime
authority, EHR/clinical records, device/network authority, and out-of-bound
contract/procurement functions remain intentionally outside PulseDesk.

The legacy `/app`, `/submit`, `/service-desk-admin`, `/analytics`,
`/clients/:id`, and `/assets/:id/report-issue` paths now resolve to active
shared-runtime experiences. Client detail opens the matching shared Directory
organization, and equipment-issue intake opens the ticket workflow with the
trusted tenant-scoped asset preselected.

| Source capability | OperatorOS target/disposition | Phase 6 evidence target |
| --- | --- | --- |
| Local users, passwords, sessions, organizations, memberships, invites, super-admin | Excluded; OperatorOS authority only | SSO/integration contracts and auth negative tests |
| Local plans, Stripe checkout/portal/webhooks, subscription and entitlement snapshots | Excluded; OperatorOS platform billing/entitlement authority only | No mounted child route or schema import |
| Clients, contacts, and sites | Shared Directory organizations, contacts, sites, associations, and `pulsedesk_service_client_profiles` | Directory references and cross-tenant relationship tests |
| Departments | Namespaced facility/site-aware departments | CRUD, versions, facility validation |
| Tickets/service requests and tenant counters | Existing request rows expanded as the one canonical PulseDesk ticket record, exposed by compatible request/ticket routes | Human ID, state machine, search/filter/sort/page, archive and restart tests |
| Configurable statuses, priorities, types, categories | Namespaced bounded workflow options; lifecycle states remain server-governed | Admin role and option validation tests |
| Queues, teams, team members, assignments | Namespaced queue/team/assignment records with tenant/user/module checks | Assignment and role-denial tests |
| Public replies and internal notes | Separate idempotent message visibility classes | Viewer isolation and duplicate-retry tests |
| Attachments | Shared private attachment/blob service, linked as requester-visible or internal | MIME/signature/scan/auth and internal visibility tests |
| Time entries | Bounded ticket/user time records | Transaction, version, restart, and aggregation tests |
| SLA policies/events | Persisted response/resolution targets and due/at-risk/overdue projections | SLA create, first-response, resolve, breach-risk and reopen tests |
| Assets/devices | PulseDesk operational equipment references only; network/IP/configuration remains TechDeck | Directory/site/department validation and ADR-0015 |
| Vendors/contracts | Vendor organizations stay in Directory; PulseDesk stores ticket coordination state, not duplicate vendor identity or platform billing | Vendor-reference and tenant-isolation tests |
| Supply requests and facility requests | Namespaced PHI-minimized operational requests with controlled states | CRUD/transition/activity tests |
| Knowledge | Bounded plain-text operational knowledge with draft/published visibility | Admin authoring and viewer visibility tests |
| Tags and saved ticket views | Namespaced tags/links and bounded JSON filter definitions | Search/view and safe bulk-operation tests |
| Notifications and preferences | Shared in-app/email/SMS outbox and provider authority; module preferences remain bounded | Content-free notification and idempotency tests |
| Analytics/dashboard | Real persisted ticket/SLA/time/supply/facility aggregates | API/UI empty/loading/error/data evidence |
| Email-to-ticket, Google/Microsoft/IMAP connectors, inbound webhooks | Not mounted from the child source; requires shared provider credentials, signed callbacks, minimized parsing, retention, and provider acceptance | Explicitly disabled, not represented as delivered |
| Standalone filesystem attachments | Excluded | Shared attachment service only |
| Child migration/runtime ensure-schema | Excluded | Root ordered database release only |

## Completion boundary

Phase 6 may reach source/local state 4 after the approved rows above are
implemented and verified on an isolated database. State 5 additionally
requires deployment of the reviewed cumulative revision, the public 48/48
gate, authenticated deployed PulseDesk workflow/deep-link/logout/privacy
acceptance, provider decisions, and an approved standalone-data apply and
cutover. No local result waives those gates.
