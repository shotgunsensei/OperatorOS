# OperatorOS exact-source Replit release handoff

The release combines preserved AI/landing work with the compatible PR112
TradeFlowKit payment cancellation fix. It preserves current main ancestry,
including source-identical Replit marker `58cab0cf`. The final source commit,
merge commit, CI runs and build identity must be copied from the subsequent
release receipt; this document does not invent its own containing commit.

## Source and test gate

The isolated branch is `codex/tradeflow-payment-cancel-oct9` in
`C:\Users\John Xodus\Documents\Codex\2026-10-07\task\OperatorOS-tradeflow-payment-oct9`.
The canonical checkout at `C:\Dev\OperatorOS` remains clean at `74dc1e3b`.
Original AI, validated/reconciled integration and landing branches remain
preserved. The original landing checkout's pre-existing modified SBOM is
unrelated and must not be overwritten, staged or reset.

Existing local combined `7ea010a3` passed all 14 release stages and a populated
v65-to-v66/reapply rehearsal; reconciled `aa6b5ea4` has the same whole tree.
The payment change adds fresh API **8/8**, desktop/phone browser **2/2**,
zero-warning lint and production build with all four workspace typechecks.
Clean final build `0b7e8878516111e313c8c520` identifies `ef4ba9b7`; its two
browser journeys have zero failures, skips or retries. The payment component
matches PR112 exactly; the strengthened test is required in the existing
release runner. Subsequent source-identical ancestry and release documentation
changes must pass the new exact-source GitHub release and semantic-vector
workflows before merge. The full combined gate is not inherited from earlier
commits as though rerun. Do not weaken any failing assertion or security gate.

Four inherited patched high advisory exceptions remain disclosed and must pass
the existing integrity checks: `GHSA-5p2g-fcmc-qvqq`, `GHSA-w3rx-r6r6-pgpr`,
`GHSA-86w9-cpqp-85rv`, `GHSA-vfj7-8cjw-p6xm`.

## Cost and browser authority

The owner authorized end-to-end ordinary source PR/merge/Replit release on
October 9. The dedicated supported-extension browser task verifies an existing
account-wide Product Actions budget of $0, Stop usage Yes, $0 spent, including
`actions_storage`. Its evidence is at
`C:\Users\John Xodus\Documents\Codex\2026-10-09\task-2\browser-access-evidence-2026-10-09.md`.
No budget, payment method, account setting or security control was changed.
The parent therefore clears push, required CI, PR/merge and preparation.
New provider spending, credentials, OAuth and account changes remain outside
this release. Keep the new Responses workflow disabled; do not enable policy
budgets or provider routes. Legacy AI paths do not gain the new monetary cap.

Native UIAutomation focus was rejected and remains prohibited. No retry or
workaround is permitted. The dedicated supported-extension operator owns
Replit synchronization/publication and must not use a Replit agent prompt to
edit engineering source. Stop for any new charge, plan/upgrade, credential,
security, destructive database diff or production-data-copy proposal.

## Replit synchronization and database gate

Workspace: `https://replit.com/@shotgunninjas/OperatorOS`.
Remote: `https://github.com/shotgunsensei/OperatorOS.git`, branch `main`.
Before synchronization, record branch, HEAD, status and any unpushed publishing
commit. Preserve unrelated/uncommitted work. The current remote publication
marker is preserved in this candidate, so a clean Replit main should converge
through ordinary fetch and fast-forward. Stop and report an unexpected local
commit, dirty state or conflict; do not reset, force-push, stash or overwrite it.
The post-merge script performs frozen package installation and contains no
database apply. Do not start the development server merely to update schema.

Production currently serves commit `74dc1e3b`, build `a8b41fff98705abb62132f29`,
health/readiness 200 and database **v65/65**. This candidate expects **v66/66**
ending in `shared_ai_budget_tables`: two additive tenant-bound policy/request
tables and one budget index. There are no positive policy seeds, provider
activation, customer backfills or new payment-schema steps. The conflicting
PR114 research v66 is excluded.

**Publication is held until the verified database/recovery gate is met.**
`docs/DATABASE_BACKUP_RESTORE.md` requires: "Production backup, release apply,
traffic switch, and restore are separate human-authorized operations."
The owner's standing authority covers normal reviewed reversible release
operations, including this additive v66 apply. It does not supply a missing
backup or proof of development/production convergence. The supported operator
must identify both targets, verify fresh recoverable backup receipts, establish
the traffic/write-pause window and use the supported one-shot v66 operation.
Destructive changes and restore/traffic recovery need separate authorization.
Keep private backup/data/URL
material out of Git, Library reports and public logs; retain only safe receipt
identifiers/checksums and aggregate reconciliation. Do not create paid storage.

For each explicitly selected development/production database, after its backup
gate and approved environment selection, use the repository root in Replit:

```bash
corepack pnpm db:plan
export OPERATOROS_DATABASE_RELEASE_MODE=apply
corepack pnpm db:apply
unset OPERATOROS_DATABASE_RELEASE_MODE
corepack pnpm db:verify
```

Require independently verified **66/66**, last `shared_ai_budget_tables`,
approved unchanged authority/billing/work/usage reconciliation and no enabled
positive policy seed. Never echo the database URL or secrets. Keep the apply
variable unset in the serving/deployment environment. Automatic Replit
database copy/apply stays off, production-data copy stays off, and destructive
schema diffs are rejected. Do not substitute child migrations or ad hoc SQL.

The supported operator verified clean Replit main at `58cab0cf`, with v65/65
read-only root verification. Existing production PITR is On with a seven-day
window and scheduled backups Off; no settings were changed. This establishes
an observed recovery capability, not complete target-specific recovery receipts.
Private production one-shot context, safe target mapping and the approved
write-pause window must still be established without printing connection values.

## Build, publication and smoke

Use the existing `.replit` pinned pnpm 10.34.5 frozen installation and
`build:production`, with `INTERNAL_API_URL=http://localhost:5001`. Publish
through the existing Autoscale deployment only after the source/CI/database
gates; leave account plans, host/provider bindings and secrets unchanged.
The run entry remains `node scripts/start-unified-runtime.mjs`, serving public
5000 with internal API 5001 and Next 5002. Startup verifies schema only and
must fail closed for stale database release state.

Retain the final build's `build/operatoros-release.json` identity. Public
`https://operatoros.net/api/health` and `https://api.operatoros.net/readyz`
must both return 200, identify the exact merged source commit and new build,
and report v66/66 ending in `shared_ai_budget_tables`; readiness must be true
with healthy database/auth/SSO/module/worker/queues. A configured provider flag
does not prove successful delivery or billed-provider acceptance.

Check public root/pricing/audience handoffs and unauthenticated
`https://tradeflowkit.operatoros.net/invoices` canonical login redirect.
Any authenticated deployed acceptance needs an owner-approved non-admin
entitled synthetic/customer tenant. Cancel a payment prompt twice and verify
no request/data mutation; use only an approved synthetic manual-payment record
for acceptance, reload once paid, confirm duplicate rejection and viewer
read-only access. Do not use live invoices, provider charges or production
customer mutations without their separate approval. Stack live purchase,
signed settlement, Stripe Connect payments, voice/message delivery, intake
abuse/consent and legacy-data cutover remain separate acceptance outcomes.

## Rollback and forward repair

Before v66 apply, current v65 artifact remains the known serving reference.
After v66 apply, do not deploy that v65-only artifact onto the v66 database:
its ledger verifier rejects the newer release. Keep the reviewed v66-compatible
application or use a tested v66 forward repair with spending disabled. Never
drop budget tables or rewrite the release ledger to force old readiness.

If a database rollback is necessary, preserve the failed target, freeze writes,
and obtain separate restore/traffic-switch authorization. Restore the approved
full backup into a new database, verify matching release/schema/authority/FKs
and safe auth/tenant/entitlement negatives, then switch only after acceptance.
Never overwrite the only recoverable copy. Record actor, timestamps, exact
source/build/database identities and the rollback or forward-repair decision.
