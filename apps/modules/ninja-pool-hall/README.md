# Operator Pool Hall module

## Consolidated Runtime Status

Operator Pool Hall is an active free-account companion application in the
unified OperatorOS deployment. Its stable internal slug remains
`ninja-pool-hall`. Phase 10B provides three single-device workflows: Free Shoot,
CPU 8-ball, and local hot-seat 8-ball:

- canonical production host: `https://operatorpoolhall.operatoros.net`
- redirect-only legacy host: `https://ninja-pool-hall.operatoros.net`
- local/module fallback: `/modules/ninja-pool-hall`
- command-center route: `/app/apps/ninja-pool-hall`
- UI shell: `apps/web/src/components/module-shells/NinjaPoolHallShell.tsx`
- practice UI: `apps/web/src/components/module-shells/NinjaPoolHallPractice.tsx`
- match UI: `apps/web/src/components/module-shells/NinjaPoolHallMatch.tsx`
- profile/result UI: `apps/web/src/components/module-shells/NinjaPoolHallProfile.tsx`
  and `NinjaPoolHallMatchDetail.tsx`
- promoted engine: `apps/web/src/lib/ninja-pool-hall/`

The browser owns continuous ball simulation and sends bounded practice counters
or structured shot facts to the shared API. OperatorOS owns authentication,
tenant membership, module access, user identity, profiles, match lifecycle,
logical rule projection, results, persistence, and personal aggregates. Match
evidence is labeled `client_reported_server_rules`; it is not verified
competition, ranking, reward, wagering, or anti-cheat evidence.

## Native API Contract

All endpoints require an authenticated tenant member with access to the
`ninja-pool-hall` module:

- `GET /v1/modules/ninja-pool-hall/practice-sessions?limit=8`
- `POST /v1/modules/ninja-pool-hall/practice-sessions`
- `PATCH /v1/modules/ninja-pool-hall/practice-sessions/:id`
- `POST /v1/modules/ninja-pool-hall/practice-sessions/:id/abandon`
- `GET /v1/modules/ninja-pool-hall/profile`
- `PATCH /v1/modules/ninja-pool-hall/profile`
- `GET /v1/modules/ninja-pool-hall/matches?limit=8`
- `POST /v1/modules/ninja-pool-hall/matches`
- `GET /v1/modules/ninja-pool-hall/matches/:id`
- `POST /v1/modules/ninja-pool-hall/matches/:id/shots`
- `POST /v1/modules/ninja-pool-hall/matches/:id/abandon`

`ninja_pool_practice_sessions` stores per-tenant, per-user session summaries:
status, shots, object balls pocketed, scratches, optimistic-lock version, and
lifecycle timestamps. The API derives tenant and user identity from the
OperatorOS session, permits exactly one new shot per progress write, keeps
counters monotonic, completes a rack at 15 object balls, and masks missing,
foreign-tenant, and foreign-user session IDs behind the same 404 response.

This slice introduces no child authentication, billing authority, schema
migration runner, or environment variables. Shared startup DDL creates the
additive table and constraints idempotently. OperatorOS remains the only auth,
entitlement, and billing authority.

`ninja_pool_player_profiles`, `ninja_pool_match_sessions`, and append-only
`ninja_pool_match_events` add versioned preferences, one active structured
match per tenant/user, idempotent shot writes, server-applied rules, bounded
history, recovery, result detail, and completed/win/loss/hot-seat aggregates.
Foreign-tenant and foreign-user IDs are masked behind the same 404 response;
viewers can read but cannot mutate.

## Imported Source Boundary

The pinned source snapshot remains under `apps/modules/ninja-pool-hall/source`
as provenance, audit, and rollback material. It is not an executed application
or runtime dependency. Only the pure `physics.ts`, `types.ts`, `rules.ts`,
`bot.ts`, and `audio.ts` files were promoted into the native web runtime from
source commit
`62439c4018ec551ce2891800351200c8ab2cb9e7`.

The following imported capabilities remain quarantined and inactive:

- WebSocket `/ws/pool` networking, live rooms, host/join, and matchmaking
- anonymous browser/local identity
- rankings, rewards, wagering, and verified competitive proof
- Wouter routes, PWA/service-worker behavior, and the standalone server
- imported auth, billing, database, or migration authority

Do not runtime-import from `source/`. Promote future workflows as separately
reviewed, tenant-scoped OperatorOS vertical slices.

## Verification

Use `docs/ninja-pool-hall-manual-qa.md` for launch, gameplay, authority,
concurrency, mobile, and database-backed checks.
