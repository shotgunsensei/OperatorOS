# Ninja Pool Hall Manual QA

Use this checklist after Ninja Pool Hall shared-runtime changes and before
production deployment.

## Launch and Access

- Launch Ninja Pool Hall from the OperatorOS Command Center and confirm the
  browser enters `https://ninja-pool-hall.operatoros.net/`. The authorization
  flow may transiently visit `auth.operatoros.net/login` and the module `/sso`
  callback before returning to the canonical module host.
- Confirm the canonical host renders the OperatorOS-owned Ninja Pool Hall
  shell. Treat `/app/apps/ninja-pool-hall` only as a platform compatibility or
  internal route, not the final production URL.
- While logged out, confirm a direct visit routes to OperatorOS login or a
  controlled launch-required state. No child login or registration form should
  appear.
- Use an explicitly revoked entitlement, disabled module, suspended tenant, or
  disabled user fixture and confirm the shell and every practice-session
  endpoint deny access before returning session data.
- Confirm the module remains classified as a free-account module; no local
  pricing, checkout, subscription, or billing UI should appear.

## Free Shoot Practice

- Start a rack and confirm a full 15-object-ball rack plus cue ball appears.
- Aim with mouse and touch input, adjust power, take a shot, and confirm the
  table animation settles before another shot can be submitted.
- Confirm each successful shot updates the server summary by exactly one shot
  and displays current shots, object balls pocketed, and scratches.
- Pocket the cue ball and confirm the scratch counter increments once and the
  cue ball is restored for the next shot.
- Pocket all 15 object balls and confirm the session becomes `completed` with a
  completion time. A finalized session must not accept another progress write.
- End an active rack and confirm it becomes `abandoned`; start a new rack and
  confirm it receives independent counters and version state.
- Attempt two concurrent starts for the same tenant/user. Confirm both resolve
  to one active session and the database contains only one active row for that
  tenant/user pair.
- Create ten sessions within one hour for the same tenant/user, finalizing each
  before the next start. Confirm the next start returns HTTP 429,
  `NINJA_POOL_PRACTICE_START_RATE_LIMITED`, and `Retry-After: 3600`.
- Create more than 100 historical sessions older than the one-hour rate window
  for a tenant/user in a controlled test fixture, then start another session.
  Confirm retention remains bounded to 100 summaries and no active session is
  deleted during pruning.
- Reload the page and confirm recent history contains only the signed-in user's
  sessions for the active tenant.
- Reload with an active server summary. Confirm the UI does not invent or
  restore ball positions: it displays the recovered bounded totals and requires
  **End recovered rack** before starting a new local table.
- Simulate a successful progress write whose response is lost. On retry or
  reconciliation, confirm only the exact expected version-plus-one and exact
  counters are accepted as already committed. Any different server state must
  enter recovery, and **Discard local rack** must not treat browser physics as
  server-authoritative.
- Exercise loading, empty-history, save-error, and retry states. Confirm API
  failures display bounded status/code details without stack traces or secrets.
- Repeat below 700 px and with reduced-motion enabled. Confirm the table,
  controls, history, and touch aiming remain usable.

## CPU and Local 8-ball

- Open `/cpu`, start a match, and confirm the real canvas rack, aim/power
  controls, turn/rule HUD, and CPU opponent are usable. Take at least one real
  player shot and allow the CPU to take a rules-driven shot.
- Open `/local`, enter a bounded guest display name, start a hot-seat match,
  and take shots for both local players. Confirm turn, group, foul,
  ball-in-hand, call-shot-on-8, three-foul, and game-over choices come only
  from server-applied rule state.
- Confirm every shot uses a unique idempotency key and expected match version.
  Retry the same key with the same facts and confirm the original response is
  returned; reuse it with different facts and confirm a controlled conflict.
- Confirm the API rejects impossible 8-ball claims, including `eightPocket`
  without pocketing ball 8 and call-shot-on-8 without an explicit pocket.
- Complete or abandon a match, open `/matches/:id`, refresh the browser, and
  confirm the saved logical event trail and result persist. Recovery must not
  invent continuous ball positions after reload.
- Open `/profile`, update display/preferences, reload, and confirm persistence.
  Exercise a stale profile version and confirm the conflict response contains
  only the safe profile projection, not tenant/user identifiers.
- Confirm personal totals reflect only durable completed match results and are
  labeled as local/client-reported evidence, with no XP, achievement,
  leaderboard, reward, wager, or verified-skill claim.
- Confirm `/host`, `/join`, `/matches`, and `/ws/pool` do not present functional
  online or unsupported routes. Direct visits must fail closed without a
  redirect loop.

## Authority and Input Validation

Use two tenants and two entitled users in one tenant so both isolation layers
are tested.

- Request a session ID owned by another tenant, another user, and a nonexistent
  ID. Confirm each produces the same `404 NINJA_POOL_PRACTICE_NOT_FOUND`
  response.
- Submit `tenantId`, `userId`, `status`, timestamps, ball coordinates, arbitrary
  game state, or other unknown fields. Confirm the API rejects them with
  `400 INVALID_NINJA_POOL_PRACTICE_INPUT` rather than trusting client authority.
- Submit progress that skips a shot, decreases a counter, records more than one
  new scratch, exceeds 1,000 shots, or exceeds 15 object balls. Confirm the API
  rejects it with `INVALID_NINJA_POOL_PRACTICE_PROGRESS` or the bounded input
  validation error.
- Send two updates using the same `expectedVersion`. Confirm one succeeds and
  the stale write returns `409 NINJA_POOL_PRACTICE_VERSION_CONFLICT`.
- Attempt progress or abandon after completion/abandonment and confirm the
  finalized-state conflict is controlled and does not modify the row.
- Repeat foreign-tenant, foreign-user, nonexistent-ID, viewer, stale-version,
  and finalized-state checks for match/profile endpoints. Confirm foreign
  resources are never enumerated and viewers cannot start, shoot, abandon, or
  update profiles.
- Grant module-level `viewer` access and confirm history remains readable while
  start, progress, and abandon return HTTP 403
  `TENANT_MODULE_WRITE_ACCESS_REQUIRED`. Repeat with a tenant-level `viewer`
  that otherwise has module-manager access; tenant viewer must remain
  read-only.
- Hard-delete a test user and a test tenant through the supported platform
  lifecycle routes. Confirm their Ninja Pool rows are removed in the same
  transaction. Force a later foreign-key failure during user deletion and
  confirm practice cleanup and audit insertion both roll back.

## Read-only Database Verification

Run these checks against a non-production database after shared API startup DDL
has completed:

```sql
SELECT tenant_id, user_id, status, shots, object_balls_pocketed,
       scratches, version, started_at, completed_at, updated_at
FROM ninja_pool_practice_sessions
ORDER BY tenant_id, user_id, started_at DESC;

SELECT tenant_id, user_id, action, entity_id, metadata, created_at
FROM activity_feed
WHERE entity_type = 'ninja_pool_practice_session'
ORDER BY created_at DESC;

SELECT tenant_id, user_id, mode, status, version, logical_state,
       winner_seat, result, finish_reason, started_at, updated_at
FROM ninja_pool_match_sessions
ORDER BY tenant_id, user_id, started_at DESC;

SELECT match_id, tenant_id, user_id, sequence_number, event_kind,
       input, outcome, created_at
FROM ninja_pool_match_events
ORDER BY match_id, sequence_number;
```

Confirm every row has valid tenant and user foreign keys, statuses are limited
to `active`, `completed`, or `abandoned`, counters remain within their database
constraints, versions increase on each accepted update, and at most one active
row exists per tenant/user. Confirm completed racks create bounded activity
metadata containing only counters, `mode: local_practice`, and
`evidence: client_reported`; no ball positions, arbitrary game state, tokens,
or personal data should be present. These summaries must not be used as
verified proof, ranking, anti-cheat evidence, or an authoritative physics log.

Restart the API twice against the verification database and confirm the tables,
constraints, append-only trigger, and indexes remain intact. Re-run the focused
Ninja Pool database/domain/import/route tests after every route, role, DDL,
lifecycle, engine, or rule change. A passing isolated run is not a substitute
for the production-artifact browser gate or deployed acceptance.

## Quarantine Checks

- Confirm the active web bundle imports physics, types, rules, bot, and audio
  only from
  `apps/web/src/lib/ninja-pool-hall/`, never from the imported source snapshot.
- Confirm browser network traffic contains no `/ws/pool` connection, live-room
  request, ranking request, child auth request, or child billing request.
- Treat `apps/modules/ninja-pool-hall/source` as non-executed audit/provenance
  material. WebSocket rooms, online matchmaking, rankings, PWA code, Wouter
  routes, and the standalone server remain out of production scope.

The current native scope is Free Shoot, CPU 8-ball, and local hot-seat 8-ball.
Online multiplayer, rankings, rewards, wagering, and proof-of-skill behavior
are not consolidated and must not be represented as functional or
production-ready.

No new environment variables are introduced by this workflow.
