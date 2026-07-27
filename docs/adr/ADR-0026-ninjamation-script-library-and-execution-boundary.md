# ADR-0026: Ninjamation script library, review, and execution boundary

Status: accepted for Phase 12A source/local implementation, 2026-07-27.

## Context

The prior OperatorOS Ninjamation shell was inferred from the product name. It
displayed five hard-coded cross-application “automations” and persisted an
enabled row, but it did not execute the advertised trigger or action. Those
claims were placeholder behavior.

Source archaeology identified the Replit-synced Ninjamation application on the
`master` branch of
`https://github.com/shotgunsensei/AutomationPacks.git`, pinned at
`cca75338d04ed35b89f28d614eb51559735aa32f`. Its own `replit.md`, routes,
schema, and UI define Ninjamation as a subscription PC automation script
library and AI script generator. The repository `main` branch, pinned at
`ca0e55fd086f6751a43964927166bfa69db012b6`, contains the separate endpoint
automation catalog that the child app was designed to synchronize.

The owner explicitly identified AutoWorkFlowHub as discontinued. It is neither
Ninjamation source nor a migration target and is excluded.

The application branch has no tracked `LICENSE` file while its root
`package.json` declares MIT. The repository main branch has an Apache-2.0
`LICENSE`. This mismatch prevents a blanket claim that every catalog payload
may be redistributed under one verified license. Ownership of the repository
does not remove the need to review third-party snippets and dependencies.

Automation scripts are executable code. Presenting AI output, repository
content, or an unreviewed user draft as safe or executed would create a
material endpoint, credential, persistence, destructive-action, and supply
chain risk.

## Decision

Ninjamation owns tenant-scoped authoring, immutable script versions,
deterministic static analysis, human review, tenant-admin approval, approved
downloads, AI-assisted draft generation, and append-oriented download and
review evidence for PowerShell, Python, batch, and Bash scripts.

The lifecycle is `draft -> review -> approved -> retired`. Editing an approved
script creates a new immutable content version, returns the record to draft,
and clears approval. Only a tenant admin may approve, reject, or retire.
Critical static-analysis findings block approval. Static analysis is an aid,
not proof that code is safe; human review remains mandatory.

Every approved download is bound to the trusted tenant, user, exact immutable
version, filename, SHA-256, request ID, and timestamp. Counts are derived from
these persisted events. A client cannot supply a download count, tenant,
approval, status, hash, or audit identity.

AI generation uses only the shared OperatorOS provider and usage/idempotency
services. The provider returns a draft; it never grants approval. Production
fails closed when the shared provider is unconfigured. The deterministic
adapter is available only in the repository test environment. Ninjamation
stores a prompt hash in its generation record rather than a raw prompt.

OperatorOS does not execute a Ninjamation script on its server, in the browser,
or on an endpoint. It does not claim that a script was tested, deployed, or
run. Remote execution is excluded until a separate ADR approves a signed
endpoint agent, device identity, command policy, per-action consent, least
privilege, secret isolation, integrity verification, timeout, output
redaction, rollback, and incident controls.

OperatorOS remains the sole authority for identity, sessions, tenants,
memberships, roles, billing, entitlements, module routing, provider
credentials, usage, audit, and coordinated logout. Replit Auth, child bearer
tokens, child Stripe, child admin authority, and GitHub synchronization
credentials are not activated.

Ninjamation differs from adjacent modules:

- BrandForgeOS owns reusable brand and campaign creative, not technical code.
- Ninja Launch Kit owns a time-bounded launch plan and reviewed campaign
  artifacts, not endpoint automation.
- TechDeck owns documentation-grade runbooks. Its ADR-0014 remote-action
  boundary remains in force; Ninjamation does not create an execution bypass.
- Cross-module business workflow orchestration is not a Phase 12A claim.

## Data and security consequences

- Every script, version, review, generation, and download includes the trusted
  session tenant ID. Composite tenant foreign keys reject cross-tenant
  relationships.
- Unique active names, constrained languages/statuses/risks, content bounds,
  SHA-256 checks, indexes, soft-delete fields, optimistic versions, and audit
  timestamps are database-enforced.
- Script bodies are private tenant data and are omitted from workspace lists,
  logs, activity metadata, generation records, and download audit rows.
- Approval is server authorization, never UI-only. Viewers may read and
  download approved content but cannot create/edit; admins own approval.
- Downloads use `text/plain`, `nosniff`, a safe filename, private no-store
  caching, and an integrity header.
- Static rules block encoded commands, dynamic evaluation, remote
  pipe-to-shell, and destructive root/volume operations. They flag persistence,
  security-control changes, network downloads, and process launch for review.
- Generated/imported scripts cannot contain OperatorOS credentials or acquire
  provider, billing, tenant, or admin authority.

## Migration and rollback

The tracked-files-only snapshot is quarantined at
`apps/modules/ninjamation/source`; it is not in the pnpm workspace and its
server, migrations, auth, billing, or sync process must never run against the
OperatorOS database.

Phase 12A supplies a deterministic, commit-pinned dry-run planner. Any future
apply requires an approved tenant/user map, a source database export, license
review, secret scan, static analysis, human review, row/hash reconciliation,
backup/restore rehearsal, write freeze, and rollback thresholds. Imported
scripts enter as `catalog_import` drafts. Legacy users, sessions, billing,
credentials, mutable counters, admin roles, and execution claims are excluded.

The additive release retains `module_automations` as historical data but
removes it from active Ninjamation routes and UI. It is not silently converted
because the placeholder rows contain no executed workflow evidence. Rollback
uses restore-to-new-database and traffic switching.

## Superseded records

This ADR supersedes the inferred “AI-assisted cross-app workflow automation”
description, the hard-coded template activation shell, and any status record
claiming the canonical Ninjamation source was unknown. It does not authorize
AutoWorkFlowHub, endpoint execution, or production deployment.
