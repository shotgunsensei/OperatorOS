# ADR-0019: FaultlineLab server-scored challenge boundary

Status: Accepted

Date: 2026-07-22

## Context

The pinned FaultlineLab source contains a complete `allCases` export composed
from standalone definitions and six authored packs, alongside browser-local
scoring and profile state. Earlier OperatorOS work artificially restricted the
runtime to four cases even though the pack definitions are runnable. Its
standalone identity, sessions, roles, billing, and child database are not valid
OperatorOS authorities. Client score or browser state cannot be treated as
production authority.

## Decision

FaultlineLab runs inside the canonical OperatorOS Next/Fastify deployment and
uses only the validated OperatorOS session, tenant, membership, module access,
and entitlement context.

- Every valid definition reachable from `allCases` at source commit
  `46877aae35565149ccf4f4988dd94627fc6bb92b` is compiler-discovered and
  initializes idempotently by source hash as a tenant-scoped, published,
  immutable challenge version. Counts are generated, not maintained in this
  ADR. Invalid authored records are repaired through an explicit repair ledger
  or fail compilation; none is silently excluded.
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
can be audited from immutable inputs. Authored pack cases are playable under
the same immutable contract as standalone cases.

State 4 requires the approved source/local workflow, clean database release,
tenant/RBAC negatives, persistence, deep-link, build, and browser evidence.
State 5 still requires deployed SSO, return navigation, logout, health,
authorized data cutover or explicit no-data reconciliation, and end-to-end
acceptance on the exact deployed revision.

## Migration and rollback

The ordered OperatorOS release manifest owns additive FaultlineLab tables.
The compiler and dry-run planner verify the pinned manifest and content hashes;
tenant initialization reuses a matching immutable hash or appends a new version.
Rollback follows `docs/DATABASE_BACKUP_RESTORE.md`: restore a
verified pre-release backup into a new database and switch traffic. Append-only
evidence triggers are not disabled for cleanup or rollback.

## Superseded records

This ADR supersedes any standalone-source assumption that browser-local
identity, scoring, profiles, billing, or child database
migrations are OperatorOS production authority.
