# ADR-0016: TorqueShed ownership, VIN, diagnostics, and public-build boundary

Status: Accepted
Date: 2026-07-18

## Context

TorqueShed must serve a personal garage, a tenant/team garage, and future
public build storytelling without leaking private ownership identifiers,
service costs, documents, or diagnostic evidence. The standalone source also
contains local identity/session authority and later-phase AI, token, billing,
marketplace, and community concepts that cannot define Phase 7.

## Decision

OperatorOS owns identity, sessions, tenants, memberships, module roles,
entitlements, billing, shared files, and platform audit. Every TorqueShed row
uses the trusted session tenant. Vehicles, builds, diagnostics, templates, and
vendors have an owner user; managers may administer their tenant, ordinary
users may mutate only owned records, and viewers cannot mutate.

Vehicle/build visibility is `private`, `tenant`, or `public_build`.
`public_build` is only a publication-eligibility classification in Phase 7;
it does not create an anonymous endpoint. Diagnostics and diagnostic
templates are only `private` or `tenant`. Public-build material must be a
future projection that allowlists narrative build fields and excludes VIN,
maintenance/repair costs, vendor/contact details, reminders, attachments,
and the entire diagnostic timeline by default.

The system never stores a plaintext VIN. A validated 17-character VIN is
normalized in memory, reduced to a SHA-256 fingerprint for tenant-local
duplicate detection and a six-character suffix for masking, and then
discarded. APIs return only the masked form.

Phase 7 includes deterministic garage, service, repair, build, reminder, and
diagnostic workflows. Torque Assist, token/usage commerce, marketplace, and
community remain outside this decision and require their later phase and ADR.

## Consequences

- Public-build publishing cannot accidentally be implemented by exposing an
  internal vehicle row.
- A full VIN cannot be recovered from OperatorOS; a later workflow that truly
  requires it needs a separately approved encrypted data design.
- Team visibility is explicit and server-enforced. UI hiding is never
  authorization.
- Costs are integer minor units. Optimistic versions, archive timestamps,
  tenant-composite foreign keys, and activity events support concurrency,
  non-repudiation, and rollback analysis.

## Migration and rollback

Standalone identities map to existing OperatorOS users through a reviewed
mapping ledger. Plaintext VINs are transformed before insert. Attachment
metadata/bytes enter only through the shared attachment service and scanner.
No repository, database, session, credential, or child migration is copied.
The release is additive; rollback restores a verified backup into a new
database and switches traffic after full acceptance.
