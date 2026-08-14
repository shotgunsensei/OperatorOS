# ADR-0022: SnapProofOS evidence-integrity boundary

Status: Accepted for Phase 11B source/local implementation
Date: 2026-07-26

## Context

The pinned SnapProof source at
`26bded38c13b5b6361d407462c68052b0c30613d` contains persistent jobs,
findings, notes, reports, exports and file metadata, but also owns child JWT
credentials, organizations, teams and billing. Its file records trust
client-supplied URLs, its public share tokens expose case content, and its
export route reports completion without producing a file. It has no
cryptographic custody chain, secure file transfer, scan enforcement, or
tenant-safe joins for every child resource.

## Decision

SnapProofOS uses evidence cases as its collection boundary. The source `jobs`
concept maps to evidence cases; no duplicate generic project model is created
without distinct multi-case semantics. The approved workload includes:

- tenant-scoped, versioned cases with retention and legal hold;
- evidence notes or private attachments with captured time, source context,
  detected MIME type, scan state and SHA-256;
- server-side submit and tenant-admin verify/reject decisions;
- findings and append-only internal/review/decision comments;
- sequence-locked, SHA-256-linked, append-only custody events;
- immutable report snapshots and real JSON/CSV exports containing report and
  custody-head provenance hashes;
- shared OperatorOS activity, private attachment storage, scan jobs, tenant
  roles, entitlement and navigation.

OperatorOS remains the only identity, session, tenant, membership, role,
entitlement, billing, provider, shared-storage and platform-audit authority.
Tenant, user, module, role and entitlement fields are rejected in browser
mutation payloads. All object lookup and foreign-reference validation repeats
the trusted tenant scope and returns a non-enumerating 404.

Custody events, comments and export records are immutable in normal operation.
The audited platform tenant hard-delete transaction may explicitly set the
transaction-local `operatoros.tenant_hard_delete` database flag before removing
these records in dependency order.

## Excluded or disabled

- child login, JWT, password reset, users, organizations, team membership,
  billing and plan controls;
- client-supplied file URLs, public buckets, bearer download URLs, URL tokens,
  public share links and legacy share-token import;
- fake completed exports, static dashboards and inactive source buttons;
- provider credentials or arbitrary outbound integration URLs;
- source migrations/server startup and automatic source-data apply;
- an external integration until its provider-specific OAuth, webhook,
  egress, secret and reconciliation contract is implemented through shared
  OperatorOS adapters.

## Consequences

The release adds ordered, tenant-composite constraints and indexes after the
shared attachment tables. File bytes never enter custody payloads or logs.
Downloads require the active entitled session, revalidate tenant/module/object
scope, require an acceptable scan state, and rehash stored bytes. Case approval
is blocked until every evidence item is verified. Legal hold blocks archive.
Only approved reports can be exported.

The deterministic source migration endpoint is dry-run only. It pins the
source commit, reports mappings and counts, refuses standalone authority, and
blocks apply when validated attachment bytes are absent. State 5 still
requires the exact revision deployed plus deployed SSO, return, logout,
health, persistence, authorization, isolation and browser acceptance.

## Rollback

The database release is additive. Freeze SnapProof writes, restore the verified
pre-release backup into a new database, validate the ordered manifest and
switch traffic according to `docs/DATABASE_BACKUP_RESTORE.md`. No destructive
down migration is provided.
