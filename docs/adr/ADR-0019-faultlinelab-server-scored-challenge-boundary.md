# ADR-0019: FaultlineLab server-scored challenge boundary

Status: Accepted

Date: 2026-07-22

## Context

The pinned FaultlineLab source contains four runnable troubleshooting cases,
browser-local scoring and profile state, and 52 catalog cards that do not have
complete runnable content. Its standalone identity, sessions, roles, billing,
and child database are not valid OperatorOS authorities. Treating the planned
cards, client score, or browser state as production data would present
unfinished or tamperable behavior as functional.

## Decision

FaultlineLab runs inside the canonical OperatorOS Next/Fastify deployment and
uses only the validated OperatorOS session, tenant, membership, module access,
and entitlement context.

- The four complete cases pinned to source commit
  `46877aae35565149ccf4f4988dd94627fc6bb92b` initialize idempotently as
  tenant-scoped, published, immutable challenge versions. The 52 planned cards
  remain non-playable provenance and are not imported.
- Personal and tenant challenges use validated immutable content versions.
  Tenant publication, retirement, assignments, and aggregate analytics require
  tenant owner/admin authority. Participant writes require write-capable module
  access.
- Every attempt is pinned to one challenge version. Investigation actions,
  submissions, badge awards, and daily outcomes are append-only evidence.
  Mutable projections use optimistic versions.
- Before completion, the API exposes only safe challenge projections. Root
  cause detail, evidence detail, hint text, command output, and debrief content
  are released only by server-recorded actions or completion.
- Scoring, evidence eligibility, hint/risk/time penalties, Chaos settings,
  badges, progress, and assignment completion are computed by the server. A
  client score or locked evidence identifier is never trusted.
- FaultlineLab may record badges and export authorized attempt evidence. It
  does not issue identity-verified certificates or credentials.
- Proof files use the shared private attachment and scanning boundary. No raw
  public object URL is introduced.
- Source reconciliation is dry-run only. It imports no standalone users,
  sessions, tenants, roles, billing, subscriptions, or child migrations.

## Consequences

FaultlineLab has a real persistent product workflow without creating a second
authority system. Existing attempts do not drift when authors publish a new
version, tenant resources cannot be enumerated across boundaries, and scoring
can be audited from immutable inputs. Planned source content stays visibly
unavailable until it has complete validated challenge data.

State 4 requires the approved source/local workflow, clean database release,
tenant/RBAC negatives, persistence, deep-link, build, and browser evidence.
State 5 still requires deployed SSO, return navigation, logout, health,
authorized data cutover or explicit no-data reconciliation, and end-to-end
acceptance on the exact deployed revision.

## Migration and rollback

The ordered OperatorOS release manifest owns additive FaultlineLab tables.
The dry-run planner verifies the pinned manifest and content hashes but has no
apply mode. Rollback follows `docs/DATABASE_BACKUP_RESTORE.md`: restore a
verified pre-release backup into a new database and switch traffic. Append-only
evidence triggers are not disabled for cleanup or rollback.

## Superseded records

This ADR supersedes any standalone-source assumption that browser-local
identity, scoring, profiles, planned catalog cards, billing, or child database
migrations are OperatorOS production authority.
