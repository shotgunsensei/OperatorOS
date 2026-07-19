# TechDeck migration plan

Assessment date: 2026-07-18

## Source and target

The provenance source is the clean `C:\Dev\Tech-Deck` checkout at commit
`8125f8d89d8d39d60a50c8061a26133a0c917792`. It remains read-only. Its
standalone server, identity, billing, dependencies, migrations, uploads, and
runtime are never copied into or started from OperatorOS.

The target is the OperatorOS-owned TechDeck schema plus shared Directory and
shared attachment services. Directory organizations and sites remain the only
client/site authority. OperatorOS remains the only identity, tenant,
entitlement, subscription, billing, and platform-audit authority.

## Supported dry run

From the OperatorOS repository root:

```powershell
corepack pnpm import:techdeck:dry-run -- --input <export.json>
```

The planner accepts the versioned TechDeck export contract, computes one
whole-export SHA-256 fingerprint and stable per-record source references,
validates duplicates and cross-record references, reports exclusions and row
errors, and produces mapping/count/reconciliation output without connecting
to PostgreSQL. The checked-in fixture produces fingerprint
`356117c32885d1761fa3c0a1674d185d9d63b6dad910cfaac2bbdb09674fd374`,
8 mappings, 12 resolved references, 0 missing references, and
`readyToApply: true`.

`readyToApply` means only that the export is internally coherent. Apply mode
is intentionally unsupported and no production export has been read.

## Mapping rules

- Legacy clients and sites map to existing or separately reconciled shared
  Directory organization/site records; the importer never creates identity
  tenants or accepts a client-supplied tenant authority.
- Configuration items map to tenant-scoped `techdeck_assets` records with
  stable migration references. Network/IPAM and lifecycle records use the
  typed configuration model from ADR-0012.
- Relationships map only after both same-tenant endpoints resolve.
- Folders, documentation, runbooks, links, revisions, evidence metadata,
  reports, comments, and time entries map to namespaced TechDeck records.
- Binary content maps through shared private attachments only after a future
  approved export contract and malware-scanning/provider decision.
- Passwords, tokens, MFA material, API keys, private keys, connection strings,
  local users/sessions, standalone subscriptions/billing, and browser-local
  vault data are excluded and never copied. External vault references may be
  carried only in the bounded non-secret form defined by ADR-0013.
- Script or runbook text remains documentation. No execution history or device
  action is inferred; ADR-0014 remains controlling.

## Human-gated apply and reconciliation

Before any apply implementation or cutover, a human must authorize the exact
source export, destination tenant, reviewed commit, maintenance/write-freeze
window, production backup, provider configuration, and rollback operator. The
apply design must add idempotent import claims, transaction boundaries,
source-to-target IDs, row-level errors, counts by entity, relationship
reconciliation, attachment checksums/scan states, and a repeatable rerun
policy. A second-tenant negative rehearsal and an authenticated browser smoke
on the deployed revision are mandatory.

## Rollback

The Phase 5 release is additive and has no destructive down migration. Before
an authorized production apply, take a provider snapshot and verified logical
backup. Rollback restores the pre-cutover backup into a new database, runs the
matching OperatorOS release contract, reconciles counts/constraints, and
switches traffic only after identity, tenant, entitlement, audit, readiness,
and browser checks pass. Never overwrite the only recoverable database.
