# Phase 13 migration and cutover program

Status: source/local dry-run rehearsal implemented. No production cutover,
standalone write freeze, source mutation, database apply, DNS change, deployment,
or archive/decommission is authorized or complete.

## Authority and safety boundary

OperatorOS remains the sole authority for identity, credentials, sessions,
tenants, memberships, platform roles, subscriptions, billing, entitlements,
module registry, and audit. A migration must never import:

- passwords/hashes, sessions, refresh/bearer tokens, SSO codes, or replay data;
- an unreconciled standalone user;
- child tenants, memberships, roles, admin, subscriptions, entitlements,
  Stripe state, or billing authority;
- provider credentials, API keys, webhook secrets, encryption keys, or raw
  provider payloads.

The machine-readable manifest and orchestrator live in
`apps/api/src/lib/migration-program.ts`. The supported review command is:

```powershell
corepack pnpm migration:rehearse
corepack pnpm migration:rehearse -- --module tradeflowkit
```

It runs every planner twice, verifies deterministic fingerprints, performs no
database write, and always reports `productionCutoverReady: false`. The command
has no apply mode. Existing per-module commands remain dry-run only.

## Program stages

1. **Inventory:** pin source system, schema/export version, application commit,
   optional catalog commit, target release step, media/provider disposition,
   and excluded authority.
2. **Export approval:** owner approves a read-only, immutable, privacy-reviewed
   export and its SHA-256. Exports contain source references but no secrets.
3. **Mapping approval:** reconcile each source owner with an existing
   OperatorOS user and tenant. Client-supplied tenant overrides are forbidden.
4. **Disposable rehearsal:** restore a production-like OperatorOS backup into a
   disposable environment; run the supported database release; dry-run the
   frozen export; then run the separately reviewed apply implementation if one
   exists.
5. **Reconciliation:** compare counts, unique keys, orphans, ownership,
   timestamps, archived/deleted state, money in integer minor units,
   attachments/bytes/hashes, and verified provider IDs. Module tolerances
   default to exact equality; an exception requires written owner approval.
6. **Performance review:** record export/import duration, batch size, peak
   memory, query plans, slow statements, and required indexes. Rehearsal must
   complete inside the approved maintenance window.
7. **Cutover approval:** approve backup evidence, rollback owner, freeze window,
   delta strategy, mapping/reconciliation reports, deployed SSO/workflow smoke,
   and communications.
8. **Cutover:** follow `CUTOVER_AND_ROLLBACK_RUNBOOK.md`.
9. **Acceptance:** archive the standalone source only after deployed SSO,
   authorization, tenant isolation, persistence, deep links, logout, health,
   production build, and E2E acceptance pass.

## Apply runner requirements

No master apply runner exists yet because no production export or cutover has
been approved. Any future apply implementation must:

- require an isolated target and a separately approved apply switch;
- verify the source export SHA-256 and approved manifest version;
- write checkpoint rows keyed by module, export hash, batch, and source range;
- resume only from a committed checkpoint and be idempotent on replay;
- use bounded batches and explicit transaction boundaries;
- store immutable source-system/source-table/source-ID migration references;
- reject conflicts to a row-error report without logging rejected values;
- stop when error thresholds or exact reconciliation tolerances are exceeded;
- never modify the source system or enable dual write;
- preserve the failed target for diagnosis and restore to a new database for
  rollback instead of destructively overwriting evidence.

## Local rehearsal versus cutover

A successful local planner rehearsal proves that mapping logic is deterministic,
commit/version gates are enforced, authority exclusions are present, and no
writes occur. It does **not** prove that a real source export exists, owners are
mapped, attachments are complete, backups restore, production performance is
acceptable, a provider works, or deployed workflows pass. Those remain explicit
cutover blockers in the final matrix.
