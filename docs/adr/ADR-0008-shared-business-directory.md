# ADR-0008: OperatorOS-owned shared Business Directory

- Status: Accepted
- Date: 2026-07-17
- Decision owners: OperatorOS platform architecture

## Context

TradeFlowKit, TechDeck, and PulseDesk each contain customer, client, facility,
contact, site, location, or vendor concepts. Those records describe external
business parties. They are not OperatorOS tenants: a tenant is the subscriber
and authorization boundary, while a directory organization is data owned by
that tenant. Treating either concept as the other would couple customer data to
billing identity and create cross-module duplicates.

The imported sources also contain standalone users, organizations, billing,
and tenant identifiers. Those authority records cannot be activated in the
shared runtime.

## Decision

OperatorOS owns one tenant-scoped Business Directory with organizations,
contacts, sites, normalized addresses, organization/site contact associations,
organization relationships, tags, and tag assignments.

- Every row, association, uniqueness rule, query, mutation, and audit event is
  scoped by the trusted OperatorOS tenant ID.
- Directory identifiers are immutable UUIDs. Browser-provided tenant IDs are
  never persisted as authority.
- Names and email/address search keys are normalized server-side. Active
  duplicate names/emails are rejected only inside the current tenant.
- Records use archive semantics and optimistic `version` checks. Archived
  records are excluded by default and remain available for migration/audit.
- Tenant owners, admins, and members may create and update directory data when
  they also have write access to the current module. Viewers are read-only.
  Archive and relationship removal require tenant owner/admin authority.
- The API implementation is shared. Module-host routes remain under the exact
  module namespace so module sessions cannot escape their sealed module scope.
- TradeFlowKit, TechDeck, and PulseDesk store only domain-specific extension
  rows keyed to a shared directory organization. Extensions never copy the
  organization name, contact, site, or address.
- Existing module-owned customer/client records remain legacy migration inputs
  until their owning product phase ports references through a repeatable,
  reconciled migration. Phase 2 does not silently rewrite financial, ticket,
  asset, or healthcare workflow history.

## Consequences

One external organization can be referenced by all three modules without
duplicating its identity. Cross-module search and future shared activity are
possible without widening module authorization. Module-specific attributes
remain independently evolvable.

The shared schema is more relational than the imported single-table address
models, so import tooling must normalize addresses, resolve duplicates within
each tenant, retain source identifiers in mapping records, and report ambiguous
matches for human review.

## Data and security impact

Directory data can contain business contact information but must not contain
credentials, subscription authority, payment secrets, patient data, clinical
notes, or endpoint credentials. PulseDesk extension data is PHI-minimized;
facility/contact identity does not authorize PHI storage.

Foreign identifiers are always queried with `tenant_id`. A missing or foreign
object returns the same 404 response. Duplicate checks never query or disclose
another tenant's records. Related writes and audit events are transactional.

## Migration and rollback

The schema release is additive and idempotent. The mapping authority is
`docs/directory/BUSINESS_DIRECTORY_MIGRATION_MAP.md`. No imported child
migration is executed.

Rollback follows the OperatorOS restore-to-new-database procedure. Application
rollback may stop using the new routes while preserving the additive tables;
destructive table removal is not an accepted rollback mechanism.
