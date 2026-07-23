# ADR-0020: Ninja Pool Hall local-result trust boundary

Status: Accepted

Date: 2026-07-22

## Context

The pinned Ninja Pool Hall source at
`62439c4018ec551ce2891800351200c8ab2cb9e7` contains a deterministic browser
physics engine, an 8-ball rules engine, Free Shoot, a basic CPU opponent,
same-device hot-seat play, and an online host/join room. The online relay is
in-memory, accepts a browser-generated `localStorage` client identifier, has no
OperatorOS session or tenant binding, and treats the host browser as the
authoritative simulation. Reopening a room can replace a disconnected player
slot with an unrelated browser identifier.

The source has no durable player profiles, historical results, achievements,
progression, rankings, or database-backed preferences. Browser settings and
the online client identifier are the only locally retained values. Treating
those values or relay messages as trusted identity, verified competition, or
migratable shared data would violate the OperatorOS authority model.

## Decision

Ninja Pool Hall runs only in the canonical OperatorOS Next/Fastify runtime and
uses the validated OperatorOS session, tenant, membership, role, module access,
and entitlement context.

- Approved modes are Free Shoot, CPU 8-ball, and same-device two-player.
  `/practice`, `/cpu`, and `/local` are durable module routes.
- The pinned physics, rules, bot, types, and procedural audio files are promoted
  exactly into the active web bundle. Continuous physics and animation remain
  browser-local.
- OperatorOS owns a tenant/user player profile and preferences. No child login,
  browser player identity, parent-domain cookie, bearer storage, billing, or
  entitlement authority is introduced.
- Structured matches store one server-owned logical 8-ball projection, not
  arbitrary client game state. The client submits bounded shot facts; the API
  applies the promoted rules engine, controls turns/groups/fouls/choices/winner,
  and appends an idempotent outcome event in the same transaction.
- Client shot facts cannot prove physical play. Every result is labeled
  `client_reported_server_rules`. Results may drive personal history and
  non-competitive counts, but never rewards, proof-of-skill, public rankings,
  anti-cheat claims, wagering, or a verified leaderboard.
- One active structured match per tenant/user, start limits, a 500-shot cap,
  a bounded 100-match history, optimistic versions, idempotency keys, strict
  allowlists, and cross-tenant/user non-enumeration constrain abuse and replay.
- Reload recovery never invents ball coordinates. A recovered active logical
  record must be explicitly ended before a fresh physical table begins.
- The unauthenticated WebSocket host/join room and browser `clientId` are
  excluded. Online multiplayer remains visibly disabled until a separate ADR
  defines authenticated participants, tenant/public scope, durable room state,
  reconnect ownership, server authority, abuse controls, and operational
  capacity.
- The source contains no durable profiles, settings, achievements, or results
  to apply. Reconciliation is a deterministic read-only plan with no apply
  mode and imports zero identity or billing records.

## Consequences

The approved source game is playable without activating a second trust system.
CPU and hot-seat results persist after reload, server rules cannot be replaced
by UI-only winner claims, preferences follow the OperatorOS user and tenant,
and all records remain explicitly honest about their client-reported physical
inputs. Online room cards are not presented as functional.

This decision deliberately does not create achievements or leaderboards that
do not exist in the source. A future verified competition product would need a
server-authoritative simulation/attestation design and a new security review.

## Data, migration, and rollback

The ordered release adds `ninja_pool_player_profiles`,
`ninja_pool_match_sessions`, and `ninja_pool_match_events` after the accepted
FaultlineLab schema. Tenant-composite relationships, uniqueness, lifecycle
checks, indexes, and audited platform hard-delete ordering are mandatory.

The dry-run reconciler verifies exact promoted engine hashes and records why
the standalone relay/client identity is excluded. It writes nothing. Rollback
follows `docs/DATABASE_BACKUP_RESTORE.md`: restore the verified pre-release
backup into a new database and switch traffic. Production apply, cutover, or
deployment requires separate human authorization.

## Superseded records

This ADR supersedes any standalone-source assumption that `localStorage`
identity, permissive CORS, the in-memory WebSocket relay, host-browser state,
or client-computed results are OperatorOS production authority.
