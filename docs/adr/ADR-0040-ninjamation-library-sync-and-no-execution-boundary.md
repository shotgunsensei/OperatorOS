# ADR-0040 — Ninjamation library synchronization and no-execution boundary

- Status: Accepted for Phase 36 source/local candidate
- Date: 2026-08-13

## Decision

Ninjamation is a tenant-scoped script library, generation, review, and delivery
product inside OperatorOS. Displaying, copying, or downloading source does not
authorize execution. The web and API processes expose no execution route and
must never pass catalog, generated, or user-supplied source to a shell,
`child_process`, command interpreter, or dynamic runtime.

AutomationPacks synchronization is restricted in code to the reviewed
`shotgunsensei/AutomationPacks` repository and `main` branch. Each run resolves
a complete commit/tree/blob snapshot, stores commit/blob/content hashes,
versions changed content, restores reappearing paths, and deprecates missing
paths without destructive deletion. Recurrence and retry use shared OperatorOS
jobs and scheduling. Repository paths and commits are never command arguments.

Generated or imported source receives deterministic static analysis and may
receive separately isolated sandbox analysis. Findings are review evidence,
not a universal safety claim. Only an immutable admin-approved version can be
downloaded, and delivery verifies its persisted checksum.

OperatorOS remains the sole identity, tenant, role, entitlement, billing,
provider, usage, audit, and platform-admin authority. Ninjamation projects
those decisions and cannot create a second subscription or user authority.

## Consequences

- Release v45 is additive and preserves existing Phase 12A scripts, versions,
  reviews, downloads, and generations.
- Catalog removal becomes visible deprecation with provenance instead of data
  loss; reappearance is auditable and does not duplicate the script.
- AI and GitHub provider failures are explicit and cannot be reported as
  successful generation or synchronization.
- A future execution feature requires a separate ADR and runner-gateway design
  covering isolation, signed artifacts/jobs, approval policy, allowlists,
  timeouts, resource/output limits, denial, and complete audit.

## Rejected alternatives

- Executing scripts in the API process: rejected because it violates tenant,
  availability, and privilege boundaries.
- Accepting a caller-supplied Git URL or branch: rejected because it creates an
  unnecessary SSRF and supply-chain input surface.
- Deleting scripts missing from a later catalog tree: rejected because it
  destroys history and invalidates prior approvals and downloads.
- Treating a clean static scan as a safety certification: rejected because
  script behavior remains environment- and input-dependent.
