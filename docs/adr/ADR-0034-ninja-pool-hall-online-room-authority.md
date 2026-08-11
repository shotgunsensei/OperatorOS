# ADR-0034: Ninja Pool Hall authenticated online room authority

Status: Accepted

Date: 2026-08-11

## Context

ADR-0020 approved the deterministic Canvas engine, Free Shoot, CPU, and local
hot-seat modes but excluded the source online relay because it used an
unauthenticated browser-generated identity, process-memory room state,
permissive CORS, and an unverified host result. Phase 30 requires the source
host/join outcome without reactivating that child authority.

Browser WebSocket clients cannot attach `X-Tenant-Id`. Exact-host and parent
module sessions still need to resolve one server-verified OperatorOS tenant and
module context without placing credentials in a URL.

## Decision

- OperatorOS sessions, tenant membership, module entitlement, and write access
  gate every room REST and WebSocket path. A tenant ID may be carried as a path
  routing value for WebSocket upgrades; the sealed module session and tenant
  guard must match it before the handler runs.
- The authenticated host occupies seat zero and an authenticated same-tenant
  guest occupies seat one. Browser client IDs never identify a player.
- The host browser runs the visible fixed-step simulation. A guest sends only a
  strictly parsed shot intent. The API independently re-simulates every host
  result with the promoted engine and rules before accepting its result hash.
- PostgreSQL stores room/player bindings, authoritative state, state hash,
  pending guest intent, sequence/version, reconnect timestamps, expiry,
  completion, and append-only action traces. Process memory stores transport
  sockets and presence only.
- Expected versions, idempotent client action IDs, sequence numbers, state
  requests, result hashes, and authoritative snapshots resolve stale messages,
  reconnects, duplicates, and desynchronization.
- Room starts, joins, shots, and WebSocket messages are bounded. Shot geometry
  is finite and allowlisted; impossible ball-in-hand placements, out-of-turn
  actions, forged guest results, oversized messages, and result mismatches are
  rejected.
- A disconnected participant may reclaim only the same authenticated seat
  during the five-minute reconnect window. Rooms expire after one hour; an
  exceeded reconnect window finalizes an active room as abandoned.
- Online results are `host_result_server_resimulated`. This is stronger than a
  client report but is not an anti-cheat, wagering, prize, ranking, or
  verified-skill attestation system.

## Consequences

Practice, CPU, local, and online modes remain one product and one rules engine.
An API restart preserves rooms and replay state. A socket loss does not invent
or duplicate a shot. Cross-tenant users cannot enumerate or join a room.

The host still controls when it submits a shot result and can disconnect; the
server's guarantee is deterministic validation of submitted intents, not proof
of a human cue action. Competitive rewards and public rankings remain outside
the approved boundary.

## Data, migration, and rollback

Cumulative additive release v39 creates `ninja_pool_online_rooms`,
`ninja_pool_online_events`, and `ninja_pool_online_rate_limits` with tenant
foreign keys, lifecycle checks, idempotency indexes, and bounded counters.
Platform tenant/user hard-delete removes these rows in dependency order.

Production apply requires the standard reviewed backup, release-plan check,
apply/reapply verification, exact-host WebSocket acceptance, and rollback
rehearsal. Rollback restores the pre-release backup into a new database and
switches traffic; it does not drop tables in place.

## Superseded records

This ADR supersedes only ADR-0020's exclusion of online host/join play and its
statement that online cards must remain disabled. ADR-0020 remains authoritative
for local-mode result honesty, absence of rewards/rankings, and child-authority
retirement.
