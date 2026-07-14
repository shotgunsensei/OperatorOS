# Ninja Pool Hall Module

## Consolidated Runtime Status

Ninja Pool Hall is an active free-account module in the unified OperatorOS
deployment. Its first native shared-runtime workflow is a single-device Free
Shoot practice rack:

- production host: `https://ninja-pool-hall.operatoros.net`
- local/module fallback: `/modules/ninja-pool-hall`
- command-center route: `/app/apps/ninja-pool-hall`
- UI shell: `apps/web/src/components/module-shells/NinjaPoolHallShell.tsx`
- practice UI: `apps/web/src/components/module-shells/NinjaPoolHallPractice.tsx`
- promoted engine: `apps/web/src/lib/ninja-pool-hall/`

The browser owns the deterministic ball simulation and sends only bounded
practice counters to the shared API. OperatorOS owns authentication, tenant
membership, module access, user identity, and the persisted summary.

## Native Practice Contract

All endpoints require an authenticated tenant member with access to the
`ninja-pool-hall` module:

- `GET /v1/modules/ninja-pool-hall/practice-sessions?limit=8`
- `POST /v1/modules/ninja-pool-hall/practice-sessions`
- `PATCH /v1/modules/ninja-pool-hall/practice-sessions/:id`
- `POST /v1/modules/ninja-pool-hall/practice-sessions/:id/abandon`

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

## Imported Source Boundary

The pinned source snapshot remains under `apps/modules/ninja-pool-hall/source`
as provenance, audit, and rollback material. It is not an executed application
or runtime dependency. Only the pure `physics.ts` and `types.ts` engine files
were promoted into the native web runtime from source commit
`62439c4018ec551ce2891800351200c8ab2cb9e7`.

The following imported capabilities remain quarantined and inactive:

- WebSocket `/ws/pool` networking and live rooms
- anonymous browser/local identity
- multiplayer matchmaking and rankings
- bot behavior and competitive rule enforcement
- Wouter routes, PWA/service-worker behavior, and the standalone server
- imported auth, billing, database, or migration authority

Do not runtime-import from `source/`. Promote future workflows as separately
reviewed, tenant-scoped OperatorOS vertical slices.

## Verification

Use `docs/ninja-pool-hall-manual-qa.md` for launch, gameplay, authority,
concurrency, mobile, and database-backed checks.
