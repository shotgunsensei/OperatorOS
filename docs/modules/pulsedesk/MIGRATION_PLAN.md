# PulseDesk migration and cutover plan

Assessment date: 2026-07-18

## Source and target

The provenance source is the clean read-only checkout
`C:\Dev\PulseDesk@937849471e489ed23db2a263d04160a388402740`. The older
`apps/modules/pulsedesk/source` snapshot remains read-only migration evidence.
The source server, auth, billing, connector credentials, dependencies,
migrations, local files, and runtime schema initializer are never started or
applied to OperatorOS.

The target uses shared Directory identities, namespaced PulseDesk workflow
tables, shared private attachments, shared notifications/outbox, shared jobs,
and platform activity/audit. OperatorOS is the only tenant, user, role,
entitlement, billing, and provider authority.

## Dry-run contract

The Phase 6 planner accepts a versioned JSON export and performs no database
connection or write. It computes whole-export and per-record SHA-256
fingerprints, detects duplicate source IDs and references, maps legacy clients,
sites, contacts, and vendors to required shared-Directory references, reviews
every imported key/text field for prohibited patient/clinical content, records
authority/provider/file exclusions, and reconciles source/target-plan counts.

Apply mode remains unsupported until separately authorized. `readyToApply`
means only that the export is internally coherent and privacy review found no
blocking field; it is not permission to mutate a database.

## Mapping rules

- Legacy clients and vendors map to Directory organizations; sites and
  contacts map to Directory records and associations. No standalone org or
  membership row is imported.
- Departments may reference the mapped service client/facility and site.
- Legacy tickets map to the canonical PulseDesk request/ticket row with stable
  source references and tenant-local human identifiers. Replies, internal
  notes, assignments, time, SLA events, tags, and activity map only after the
  ticket and all referenced tenant records resolve.
- Assets map to operational equipment references. Device network/IP,
  credential, discovery, remote-action, and configuration fields are excluded
  for TechDeck or later human review.
- Vendors retain Directory identity; only ticket coordination state is stored
  in PulseDesk.
- Supply/facility requests, knowledge, saved views, and bounded preferences
  map only from allowlisted PHI-reviewed fields.
- Attachment bytes require a future authorized export contract, checksum,
  shared private storage, malware scan, visibility classification, and
  reconciliation. Child storage paths are never trusted or copied directly.
- Passwords, sessions, local users, orgs, memberships, invites, Stripe data,
  entitlement snapshots, OAuth/IMAP/SMTP tokens, webhook secrets, raw inbound
  email, and provider configuration are excluded.

## Human-gated apply, cutover, and rollback

Before any apply implementation, a human must authorize the exact source
export, destination tenant, reviewed commit, maintenance/write-freeze window,
privacy reviewer, provider decisions, production backup, and rollback
operator. Apply must add durable idempotent claims, transactional batches,
source-to-target mappings, row-level safe errors, counts, reference checks,
attachment scan reconciliation, a second-tenant negative rehearsal, and
deployed browser acceptance.

The release is additive and has no destructive down migration. Rollback takes
a provider snapshot and verified logical backup, restores into a new database,
runs the matching OperatorOS release, reconciles schema/counts/constraints,
and switches traffic only after auth, tenant, entitlement, audit, readiness,
privacy, and browser checks pass. Never overwrite the only recoverable copy.
