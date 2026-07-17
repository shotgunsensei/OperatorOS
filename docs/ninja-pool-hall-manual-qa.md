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
```

Confirm every row has valid tenant and user foreign keys, statuses are limited
to `active`, `completed`, or `abandoned`, counters remain within their database
constraints, versions increase on each accepted update, and at most one active
row exists per tenant/user. Confirm completed racks create bounded activity
metadata containing only counters, `mode: local_practice`, and
`evidence: client_reported`; no ball positions, arbitrary game state, tokens,
or personal data should be present. These summaries must not be used as
verified proof, ranking, anti-cheat evidence, or an authoritative physics log.

Restart the API twice against the verification database and confirm the table,
constraints, and indexes remain intact. The complete clean-PostgreSQL suite ran
619 tests with 613 passed, 0 failed, and 6 live-HTTP checks skipped because no
Next development server was running. It includes the Ninja Pool tenant-viewer,
isolation, lifecycle, retention, recovery, and hard-delete assertions. Focused
SSO remains 38/38 and tenant RBAC remains 12/12. Re-run the focused Ninja Pool
database test after every route, role, DDL, or lifecycle change; a passing
isolated run is not a substitute for the pending production browser smoke.

## Quarantine Checks

- Confirm the active web bundle imports physics and types only from
  `apps/web/src/lib/ninja-pool-hall/`, never from the imported source snapshot.
- Confirm browser network traffic contains no `/ws/pool` connection, live-room
  request, ranking request, child auth request, or child billing request.
- Treat `apps/modules/ninja-pool-hall/source` as non-executed audit/provenance
  material. WebSocket rooms, matchmaking, rankings, bot/rule logic, PWA code,
  Wouter routes, and the standalone server remain out of production scope.

The current native scope is Free Shoot practice only. Full rules, CPU play,
multiplayer, spin, sound, rankings, and proof-of-skill behavior are not yet
consolidated and must not be represented as production-ready.

No new environment variables are introduced by this workflow.
