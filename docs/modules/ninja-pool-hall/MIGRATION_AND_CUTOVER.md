# Ninja Pool Hall Phase 10B migration and cutover

## Source-data finding

The pinned source has no persistent database records for profiles, settings,
achievements, progression, leaderboards, or historical summaries. Preferences
and the room client identifier exist only in browser `localStorage`; room state
exists only in process/browser memory. Those values are not an authorized,
complete, tenant-mappable export and are not imported.

`corepack pnpm import:ninja-pool-hall:dry-run` is the only supported source
reconciliation command. It verifies the pinned source manifest, exact hashes
for physics/types/rules/bot/audio, capability dispositions, and zero authority
or billing imports. There is deliberately no apply mode.

## Schema release

The root ordered release adds `ninja_pool_hall_tables` after
`faultlinelab_tables`. It creates tenant/user profiles, structured match
sessions, and append-only application events. Existing Free Shoot summaries
remain compatible. The apply path is only:

```powershell
corepack pnpm db:plan
$env:OPERATOROS_DATABASE_RELEASE_MODE='apply'
corepack pnpm db:apply
```

Do not run source Drizzle commands or its Express/WebSocket server.

## Authorized cutover checklist

1. Identify the reviewed commit and PostgreSQL version.
2. Take and verify the provider snapshot and logical backup per
   `docs/DATABASE_BACKUP_RESTORE.md`.
3. Review the 22-step additive plan and dry-run reconciliation output.
4. Build and start only through the unified readiness-gated supervisor.
5. Require schema/FK/index checks, profile/CPU/local/recovery workflows,
   second-tenant and viewer negatives, `/healthz`, `/readyz`, and exact-host
   browser SSO/deep-link/return/logout.
6. Confirm `/host`, `/join`, and `/ws/pool` are not presented or reachable as
   functional module features.
7. Record the deployed commit and deployed evidence before state 5.

No production apply, traffic switch, or deployment is authorized by Phase
10B source work.

## Rollback

There is no destructive down migration. Freeze writes, restore the verified
pre-release backup into a new database, run the matching prior release, require
auth/tenant/SSO/readiness/browser gates, and switch traffic only after review.
