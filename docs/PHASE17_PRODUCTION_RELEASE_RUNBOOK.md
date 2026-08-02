# Phase 17 production release runbook

> Historical runbook. Phase 18 activates OutCall in source and supersedes the
> disabled-OutCall assertions below. Do not use this document to deploy the
> current candidate; follow `docs/outcall/GO_LIVE_CHECKLIST.md`,
> `docs/CURRENT_RELEASE_GATE.md`, and the Phase 18 steps in `PLANS.md`.

This is the authoritative operator workflow for the Phase 17 release candidate.
It uses the existing `.replit` build and `scripts/start-unified-runtime.mjs`
compiled supervisor. It does not authorize a production database restore,
force-push, merge, or deployment by itself.

## 1. Release prerequisites

The release owner must confirm all of the following:

1. The Phase 17 draft pull request is reviewed and all required checks pass.
2. The provider-managed PostgreSQL backup is current and restorable under
   `docs/DATABASE_BACKUP_RESTORE.md`.
3. Replit Deployments access is available for the OperatorOS autoscale
   deployment.
4. The production secret manager contains the core variables required by
   `config/production-environment.contract.json`. Do not copy secret values
   into a terminal transcript, document, issue, or pull request.
5. Two synthetic acceptance accounts are provisioned:
   - an active user/tenant entitled to all 12 enabled Phase 17 modules;
   - an active user/tenant that is deliberately denied TechDeck.

OutCall must remain planned and globally disabled. Do not configure or run the
OutCall live-provider profile for this release.

## 2. Prepare and verify the exact candidate

Run from `C:\Dev\OperatorOS` in PowerShell:

```powershell
git fetch --prune origin
git switch main
git pull --ff-only origin main
$candidate = (git rev-parse HEAD).Trim()
if ($candidate -ne (git rev-parse origin/main).Trim()) {
  throw 'Local main does not match origin/main'
}

$env:CI='true'
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
$env:INTERNAL_API_URL='http://localhost:5001'
corepack pnpm build:production
corepack pnpm db:plan
corepack pnpm preflight:production -- --core
```

The preflight reads production values from the operator's environment. It
prints variable names and validation failures but never secret values. Do not
run `db:apply` against production from this workstation. The Replit supervisor
owns the idempotent compiled release apply.

The database plan must report:

- contract version `1`;
- release version `29`;
- 29 ordered, non-destructive steps;
- final step `free_account_app_backfill`.

## 3. Deploy through the existing Replit architecture

There is no repository-owned Replit deployment CLI. The deployment owner must:

1. Merge the reviewed Phase 17 pull request to `main`.
2. In Replit, open the OperatorOS autoscale deployment.
3. Select **Deploy** for the merged `main` revision.
4. Confirm the build uses the checked-in `.replit` build command.
5. Confirm the run command is `node scripts/start-unified-runtime.mjs`.
6. Record the Replit deployment ID, build ID, deployment timestamp, and merged
   Git commit in `docs/PHASE17_PRODUCTION_EVIDENCE_REPORT.md`.

The supervisor must complete the compiled 29-step release, wait for API
readiness, and only then start Next. A failed release or failed readiness must
prevent the public web process from being promoted.

## 4. Run the public read-only gate

After Replit reports the deployment healthy:

```powershell
git fetch origin main
$candidate = (git rev-parse origin/main).Trim()
$env:OPERATOROS_EXPECTED_RELEASE_COMMIT = $candidate
corepack pnpm verify:production
```

Require **48/48**. In particular, both `/api/health` and `/readyz` must expose
the same non-secret identity:

- exact Git commit `$candidate`;
- deterministic build ID and lockfile hash;
- database release version `29` with 29 steps;
- valid build and deployment timestamps.

The gate also verifies root/app/auth/API routing, all public diagnostics, PKCE
authorization entry for all enabled clients, exact callbacks, and planned
OutCall denial. Any mismatch blocks promotion.

## 5. Run the production-safe authenticated browser gate

The deployed gate performs no direct database access, registration, business
CRUD, or production data seeding. It disables Playwright traces, screenshots,
and video so acceptance passwords cannot be captured. It does rotate and
revoke sessions for the two synthetic test users.

Load these values from an approved secret manager into the current PowerShell
process:

```powershell
$env:E2E_PHASE17_EMAIL = '<entitled acceptance user>'
$env:E2E_PHASE17_PASSWORD = '<secret>'
$env:E2E_PHASE17_TENANT_ID = '<active entitled tenant UUID>'
$env:E2E_PHASE17_DENIED_EMAIL = '<denied acceptance user>'
$env:E2E_PHASE17_DENIED_PASSWORD = '<secret>'
$env:E2E_PHASE17_DENIED_TENANT_ID = '<active tenant UUID denied TechDeck>'
Remove-Item Env:E2E_PRODUCTION_HOSTS -ErrorAction SilentlyContinue
corepack pnpm --dir apps/web test:e2e:phase17-deployed
```

Require **3/3**:

1. one login launches every one of the 12 enabled module hosts, keeps
   credentials out of URLs/storage, and global logout invalidates a sibling;
2. TechDeck local logout preserves a PulseDesk sibling session;
3. the denied tenant receives `MODULE_ACCESS_DENIED`, while OutCall receives
   `MODULE_UNAVAILABLE`, with no handoff URL.

Unset the six acceptance variables when the run is complete.

## 6. Release decision and rollback

Promotion remains blocked until the public gate is 48/48 and the authenticated
gate is 3/3 on the same deployed commit.

For an application rollback, use Replit Deployments to redeploy the last known
good commit, currently
`48b8691fca5c8a8d79f53b309cb44db79698bbcd`, then rerun the public verifier
with that exact expected commit. Phase 17 adds no destructive schema step.
Its OutCall reconciliation changes the existing module status to
`coming_soon`; leaving that module disabled is the safe rollback behavior.

If a database restore is genuinely required, stop and follow
`docs/DATABASE_BACKUP_RESTORE.md`. Restore to a new database and switch traffic;
do not overwrite the production database in place.
