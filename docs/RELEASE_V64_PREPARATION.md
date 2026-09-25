# v64 source preparation and branch reconciliation

Prepared 2026-09-25 from `994308311c702d67b6e4047748e07ccb3d7c6fbd`.
User authorization covers commits, pushes, pull requests and merging passing work
to `main`. Production database operations and publication remain separate gates.
See [implementation status](IMPLEMENTATION_STATUS.md) for final validation results.

## Branch reconciliation

Fetched origin and inspected all local/remote branch tips and registered worktrees.
No open pull request existed at the start. Existing branches/worktrees were kept.

| Branch group | Finding and disposition |
| --- | --- |
| 26 prior local branches, including audience, customer workflows, CallCommand and v63 evidence | Their tips are already ancestors of `origin/main`; no content merge needed. |
| `codex/autoscale-startup-readiness` at `3829ce9` | `git cherry` reports an equivalent patch already on main (`963cec4e`). Keep the current verification-only startup and readiness gate. |
| `codex/replit-schema-deploy-fix` at `009c0cb` | Ported the missing TradeFlowKit declarative tenant keys. Matched workflow/stage unique-column order to the actual initializer. Added an applied-database comparison regression. |
| Remote historical branches | All are contained in main except the same schema-fix branch addressed above. |
| Resolution plan/foundation branches | The plan and implementation are delivered together in this change. |

The old schema-fix commit also contains a proposed v59 manifest entry, an older
startup apply mode, and a reconciliation helper. Current main has v63, the
dedicated release lock, verify-only serving startup and the original TradeFlowKit
initializer's named keys. Those older alternatives were not replayed. The preserved
declarations match the applied database; no old manifest step was renumbered and no
duplicate repair operation was appended. This is content reconciliation, not a
claim that every historical branch has identical Git ancestry.

Git fetch refreshed origin successfully but its automatic housekeeping reported
permission errors for stale `.git/worktrees` registrations unrelated to the four
active worktrees. No permissions or unrelated worktrees were changed.

## Source release scope

- Canonical MSP closeout prompt and shortcut; formal version 1.0 schema and packaged
  SDK/API contract artifacts.
- Additive release v64: Resolution Intelligence evidence/revision storage,
  tenant-composite constraints, typed FixGraph, exact identifiers and full-text
  projections. No customer import or visible technician workflow yet.
- TradeFlowKit ORM declarations aligned with existing tenant constraints to reduce
  misleading deployment schema differences.
- Required generated-contract/build checks and focused database tests included in
  the existing release gate. No new dependency, secret or provider activation.

Design and field mapping: [Resolution Intelligence data model](techdeck/resolution-intelligence-data-model.md).

## Replit publication checklist

1. Import the reviewed merged `main` revision and review its read-only `db:plan`.
2. Separately approve and take verified private backups of Replit development and
   production before their respective one-shot applies. Pause production traffic
   for the production release operation.
3. Use only root `db:apply` with temporary `OPERATOROS_DATABASE_RELEASE_MODE=apply`,
   remove that flag, and independently run `db:verify` for each selected database.
4. Both databases must report v64/64 ending in
   `techdeck_resolution_intelligence_tables`. Reconcile existing platform/customer
   records; no resolution incident is seeded by the release. Cancel any destructive
   schema-diff proposal or production-to-development data-copy proposal.
5. Publish the reviewed build after those gates, then verify the deployed commit,
   build identity, `/readyz`, exact-host SSO and affected authenticated workflows.

The source and local/CI evidence cannot establish these live outcomes. The runtime
intentionally stays unready on a v63 database until the approved apply completes.
Rollback follows the [shared backup/restore runbook](DATABASE_BACKUP_RESTORE.md).
