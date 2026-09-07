# Release v60 GitHub synchronization verification

Status: **SOURCE CONTROL, PRODUCTION DATABASE V60, AND REPLIT DEPLOYMENT VERIFIED — AUTHENTICATED AND PROVIDER ACCEPTANCE OPEN**<br>
Verification date: 2026-09-07

## Final synchronized outcome

- PR #95 merged the v60 customer-outcome release at
  `013bf4c273563a4d73e6443b67956bd1f6841f3e`; exact-merge release-gate run
  `34078325613` passed.
- PR #96 merged the Replit routed-constraint correction at
  `f864bed869372fed3c1295b7ca048f06ac7a9a65`; PR run `34125791407` and
  post-merge `main` run `34127904461` passed. A fresh fetch after Replit
  publication confirmed local and remote `main` still match that commit.
- Replit development was converged and verified at v60/60. The three routed
  data-fabric keys are named, validated PostgreSQL UNIQUE constraints.
- The actual production database was explicitly selected, public traffic was
  paused, and a private custom-format logical backup was created and validated
  (2,233,007 bytes; 3,524 restore-list entries). The repository-owned one-shot
  apply completed all 60 steps; independent verification returned v60/60.
- Aggregate reconciliation preserved 5 active/trialing legacy subscriptions as
  5 explicit grandfathered rows, 75 of 75 existing module grants, zero
  Stripe-linked subscriptions, zero Application Stack rows, and zero
  open/failed webhook deliveries. Both data-fabric checks and all three routed
  UNIQUE constraints are validated. The temporary logical backup was deleted
  and masked connection cleared after success as authorized; Replit PITR
  remains available.
- The final Replit publish kept development-data overwrite and Stripe
  sandbox-to-live sync off. Security, build, bundle, and Autoscale promotion
  completed. Public readiness identifies exact commit
  `f864bed869372fed3c1295b7ca048f06ac7a9a65`, build
  `570ecdc6285790ae91f1333e`, and database v60/60 ending in
  `forward_commerce_contract`.
- Main, API, and API-host health/readiness return HTTP 200. Representative
  public module pages and protected deep links prove exact-host routing and SSO
  initiation. Signed-in production workflows, Stripe-hosted billing, live
  provider operations, scheduled-backup configuration, and a restore drill
  remain separate open acceptance scopes.

## Source verification baseline (2026-09-06)

- GitHub repository `shotgunsensei/OperatorOS` uses `main` as its default branch.
- Local `main` and `origin/main` both resolved to verification baseline
  `cb2ddb88b903b3a3070382274e60b00b6809d913` after a fresh fetch.
- Release-v60 implementation and acceptance commit
  `0ffa95bc0b1f3433b37e969c171ca99802ba4f5d` is an ancestor of that baseline.
- Differences after the accepted v60 commit comprise an empty Replit
  publication marker, `.codex/environments/environment.toml`, and the following
  promote-failure hardening. None removes or reorders a v60 release step:
  - `apps/api/src/lib/database-release.ts` replaces three direct `::regclass`
    casts with null-safe `to_regclass(...)` lookups so a missing commerce table
    returns a failed check instead of crashing the verifier.
  - `apps/api/src/lib/cross-module-data-fabric-db-init.ts` validates
    `shared_workflow_run_idempotency_scope_check` and
    `shared_domain_event_signature_envelope_check` after row convergence.
  - `apps/api/test/database-release-contract.test.ts` asserts all three safe
    lookups and both validation statements.
- `corepack pnpm db:plan` reports contract version 1, release version 60,
  `mode: idempotent-apply`, `destructive: false`, exactly 60 ordered steps, and
  `forward_commerce_contract` last.
- The manifest maps `forward_commerce_contract` to
  `ensureForwardCommerceContract`, and the v60 implementation remains in
  `apps/api/src/lib/application-stack-billing-db-init.ts`.
- GitHub release-gate run `33960836790` passed the accepted v60 commit. The two
  later `main` commits also passed: run `33967412073` for the Replit publication
  marker and run `33968536242` for the environment marker. Exact-main-head run
  `34075815089` for the verifier-hardening baseline is also terminal green. The
  synchronization branch's additional validation-state verifier change remains
  subject to its PR gate.

## Replit promote failure reconciliation

The supplied Replit diagnostic shows that the image build succeeded and the
promotion failed during startup database verification. Its read-only evidence
identified two source-level defects now addressed by baseline `cb2ddb8`:

1. A direct `tenant_application_subscriptions` `::regclass` cast threw when the
   table was absent instead of reporting `forward_commerce_contract=false`.
2. Two v60 data-fabric constraints could exist as `NOT VALID`, leaving the
   expected release contract incomplete.

The source patch makes verification fail closed without crashing and ensures a
supported v60 apply converges those constraints to validated state. It does not
make the production database current by itself. The Replit report still shows
the target database lacks the commerce contract and has 16 pending release
changes.

The synchronization branch closes one additional gap found during independent
reproduction: the verifier previously accepted the correct check definition
even when PostgreSQL marked it unvalidated. Both data-fabric checks now require
`pg_constraint.convalidated`, the normalized definition no longer permits a
`notvalid` suffix, and disposable-database drift cases deliberately recreate
each correct-but-unvalidated constraint and require `db:verify` to reject it.

## Pull-request lineage correction

The original v60 implementation commits reached `main` through an owner-
authorized direct push. GitHub's commit-to-pull-request API returns no associated
pull request for the accepted v60 commit or current verifier-hardening baseline.
The source is therefore committed, present on `main`, and baseline-CI-green;
the original delivery did not have a pull-request review/merge record. The
additional verifier correction remains a PR candidate until its checks pass and
it is merged.

This synchronization attestation and the matching authoritative release-status
updates are intentionally delivered through branch
`codex/v60-github-sync-verification` and a real pull request to `main`. That PR
adds the requested review-and-merge audit trail without reverting, duplicating,
or rewriting the already accepted v60 migration history. The GitHub pull-request
record is authoritative for its final number, checks, approval, merge commit,
and timestamps.

## Commands used

```powershell
git fetch --prune origin
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git merge-base --is-ancestor 0ffa95bc0b1f3433b37e969c171ca99802ba4f5d main
git diff --name-status 0ffa95bc0b1f3433b37e969c171ca99802ba4f5d..main
corepack pnpm db:plan
corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/database-release-contract.test.ts
corepack pnpm typecheck
gh api repos/shotgunsensei/OperatorOS/commits/0ffa95bc0b1f3433b37e969c171ca99802ba4f5d/pulls
gh run list --branch main --workflow release-gate.yml
```

## Historical production boundary before the 2026-09-07 cutover

This verification concerns Git commits, GitHub synchronization, pull-request
lineage, the read-only release plan, and CI evidence. It does not show that the
production PostgreSQL database is at v60. No `db:apply`, Replit redeploy, Stripe
operation, provider action, DNS change, customer-data operation, or even the
development-only constraint-validation transaction proposed in the Replit
diagnostic is performed by this verification. Production promotion still
requires the backup-gated one-shot v60 apply, independent `db:verify`, exact
deployed identity, and authenticated acceptance described in
`docs/DATABASE_BACKUP_RESTORE.md` and `docs/CURRENT_RELEASE_GATE.md`.
