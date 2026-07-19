# ADR-0015: PulseDesk owns PHI-minimized healthcare operations service delivery

Status: Accepted

## Context

PulseDesk's clean source at
`C:\Dev\PulseDesk@937849471e489ed23db2a263d04160a388402740` contains a
healthcare-oriented service desk: clients, sites, contacts, tickets, queues,
assignments, replies, internal notes, time, SLAs, assets, vendors, supply and
facility requests, knowledge, saved views, notifications, and analytics. It
also retains standalone identity, tenant, entitlement, billing, connector,
and credential surfaces that OperatorOS already owns or governs.

TechDeck already owns documentation-grade configuration, network/IPAM,
lifecycle, and runbook records. Without a boundary, both products could claim
the same client/site and technical-asset authority, and PulseDesk free text
could drift into patient charts or unnecessary protected health information
(PHI).

## Decision

PulseDesk owns tenant-scoped healthcare **operations service delivery**:

- shared-Directory service-client, facility/site, contact, and vendor
  references;
- facility departments and operational equipment references;
- service requests/tickets, queues, teams, assignment, requester-visible
  replies, internal notes, time, SLA events, and activity;
- vendor coordination, supply requests, facility requests, saved views,
  knowledge, administrative workflow configuration, and operational
  analytics; and
- shared private attachments and shared notification/outbox workflows.

PulseDesk does not own a patient chart, patient identity, diagnosis,
treatment, medication, insurance, clinical note, medical-record number, or
other clinical-record model. A bounded `isPatientImpacting` operational flag
may prioritize facility response, but it must never identify a patient or
describe care. User-facing warnings, explicit no-PHI acknowledgement, field
allowlists, prohibited-key detection, text-pattern checks, plain-text
sanitization, bounded retention-ready fields, and content-free audit and
notification metadata enforce data minimization.

OperatorOS remains the sole identity, session, tenant, role, entitlement,
subscription, billing, platform-audit, shared Directory, file, notification,
job, webhook, and provider authority. Vendors are Directory organizations;
clients, contacts, and sites are never duplicated in PulseDesk tables.

TechDeck owns documentation-grade technical configuration, network/IPAM,
device lifecycle, documentation, and runbooks. PulseDesk may reference an
operational equipment item needed to route and service a ticket, but it does
not store network topology, credentials, configuration state, discovery
claims, or remote actions. A future cross-module relationship must use
tenant-validated identifiers and cannot silently copy or synchronize either
module's authoritative record.

## Consequences

- PulseDesk is a healthcare-operations service desk, not an EHR and not a
  second managed-infrastructure database.
- Requester-visible replies and internal notes are distinct persisted record
  types; requester-facing/viewer access never receives internal content or
  internal attachments.
- Email, SMS, connector, and webhook payloads require the shared provider and
  signed-callback boundaries. Notifications contain ticket identifiers and
  event labels, not user-entered ticket text.
- Standalone auth, sessions, organizations, memberships, Stripe billing,
  entitlement snapshots, local attachment storage, and child migrations are
  excluded from OperatorOS migration.
- Calendar-aware SLA business hours, provider-specific inbox ingestion, and
  patient-data processing require separate accepted decisions and are not
  implied by this ADR.

## Data, security, migration, and rollback

All active PulseDesk tables are namespaced and tenant-scoped. Relationships
are revalidated against the trusted session tenant, important writes use
optimistic versions or idempotency keys, and ticket/event/SLA/time/audit writes
share transactions. Imported free text is rejected when prohibited fields or
PHI indicators are found; migration reports exclusions without echoing the
sensitive value.

The release is additive. The standalone source remains read-only evidence,
and its migrations are never applied to OperatorOS. Import stops at a
deterministic dry-run plan until an exact tenant, frozen export, backup,
privacy review, reconciliation, and cutover are separately authorized.
Rollback is restore-to-new-database and traffic switch; there is no
destructive down migration.
