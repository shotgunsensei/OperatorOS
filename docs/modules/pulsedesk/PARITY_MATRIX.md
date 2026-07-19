# PulseDesk Phase 6 parity matrix

Assessment date: 2026-07-18

The clean provenance source is `C:\Dev\PulseDesk` at
`937849471e489ed23db2a263d04160a388402740` (`main`, clean). The older
quarantined snapshot has 211 files. Of the current source's 228 tracked files,
181 match the snapshot byte-for-byte, 30 differ, and 17 newer tracked files
are absent from the snapshot. The missing files include the July 15 service
desk restoration routes, pages, migration, smoke, and E2E evidence. Neither
source tree is executable OperatorOS code; its server, dependencies,
migrations, local storage, and provider processes remain unmounted.

The current source defines 182 Express route declarations and more than 50
standalone tables across service delivery, identity, billing, connectors, and
email. The active pre-Phase-6 OperatorOS slice has four PulseDesk tables and a
PHI-minimized department escalation queue.

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
requires deployment of the reviewed cumulative revision, the public 47/47
gate, authenticated deployed PulseDesk workflow/deep-link/logout/privacy
acceptance, provider decisions, and an approved standalone-data apply and
cutover. No local result waives those gates.
