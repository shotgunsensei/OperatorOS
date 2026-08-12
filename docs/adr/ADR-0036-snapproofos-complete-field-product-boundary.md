# ADR-0036: SnapProofOS complete field-product and secure-sharing boundary

- Status: Accepted for source/local Phase 32
- Date: 2026-08-12
- Source: `26bded38c13b5b6361d407462c68052b0c30613d`

## Context

Phase 11B retained private proof cases and explicitly retired customer records,
field jobs, costs, templates, branding, PDF/DOCX documents, voice notes, and
public shares. Phase 32 requires every source outcome to receive a new decision:
security controls may change implementation authority, but may not erase the
field technician or customer outcome.

## Decision

Restore SnapProofOS-owned work product natively: customers, jobs, assignment,
findings, audience-scoped notes and voice attachments, parts, labor, captured
files, templates, organization report branding, report lifecycle, persisted
PDF/DOCX exports, and constrained public report shares.

Keep these authorities in OperatorOS and expose shared equivalents inside
SnapProofOS:

- identity, sessions, tenants, memberships, roles, module access, and audit;
- plans, billing, entitlements, usage, team administration, and assignment
  membership validation;
- private attachment storage, signature/MIME validation, scan/quarantine,
  retention, integrity verification, and background scan execution;
- exact-host routing, module launch/return, and platform activity.

Public shares are allowed only for approved immutable report snapshots. Tokens
contain 256 bits of randomness, are stored only as SHA-256 hashes, expire, can
be revoked, are rate-limited on view and download, return non-enumerating misses,
disable indexing/caching, and expose only the customer-intended snapshot.
Approved report and export bytes remain historical even when live job records or
organization branding later change.

## Consequences

- ADR-0022 remains the historical reduced-product decision, but its public-share
  and product-boundary retirements are superseded by this constrained contract.
- There is still one identity, tenant, role, billing, entitlement, storage,
  scanner, and audit authority across the ecosystem.
- Additive release v41 may be rehearsed locally. Production promotion,
  source-data apply, attachment-scanner readiness, exact-host acceptance,
  backup/restore, rollback, and cutover remain explicit owner gates.
