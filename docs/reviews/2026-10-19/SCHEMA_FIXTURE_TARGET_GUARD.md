# Direct schema fixture target guard

Verdict: offline safety regressions pass; complete disposable database suite
and exact-head CI remain unverified locally. No database was connected.

Base: `c55e580f8858ec3e3200a717af310a184285832b`.
Branch: `codex/operatoros-fixture-guard-oct19`, separate from the webhook fix.
Existing dependencies from the isolated audit clone were reused through local
junctions. No package acquisition, install or production operation occurred.

## Boundary and compatibility

The authoritative API release runner validates its disposable database target,
but direct test-file execution could call `ensureSchemaReady()` without that
gate. The helper then invokes schema creation and repair routines. An offline
baseline probe replaced `pg.Pool.connect` with a sentinel and showed the old
helper reaching it once with a synthetic remote target. No real connection
or SQL execution occurred during that reproduction.

The shared helper now invokes the existing
`assertDisposableDatabaseEnvironment` before importing or invoking DDL modules.
It requires the explicit `PARITY_DATABASE_IS_DISPOSABLE=1` opt-in, a PostgreSQL
URL, an allowed loopback hostname, a delimited disposable database-name marker,
and no query/fragment retargeting. It validates `databasePool.options.connectionString`,
because the pool captures its URL when `db.ts` loads: replacing `process.env.DATABASE_URL`
later must not authorize an earlier unsafe pool. Missing URLs cannot fall back
to libpq defaults. The guard introduces no connection or migration authority.

The exact release CI and semantic-vector fixtures already supply a marked
loopback database URL and opt-in. Production-artifact tests can retain their
existing environment signals; this patch adds no new APP_ENV/NODE_ENV policy.
Set DATABASE_URL before starting a direct test process. AGENTS.md now includes
the required opt-in beside the direct API test command. The application database
pool and production runtime are unchanged. This guard protects this bootstrap
entry point; it does not claim to authorize every direct SQL call in all tests.

## Verification

Local runtime is Node 24.16.0 with existing pinned pnpm 10.34.5 dependencies.

- `pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/schema-fixture-target-guard.test.ts test/outcall-resource-fixture-guard.test.ts`: 8 passed, zero failures/skips/cancellations/todos. Four new regressions run 15 isolated sentinel probes. Rejected missing/remote/persistent/query-retargeted targets record zero connection attempts; valid CI/local disposable identities reach only the sentinel. Changing environment after pool capture cannot bypass rejection.
- `pnpm --dir apps/api exec tsc --noEmit --strict --allowJs --resolveJsonModule --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck test/schema-fixture-target-guard.test.ts test/_setup.ts`: passed. An initial invocation without resolveJsonModule failed on an existing imported JSON configuration; the corrected command passed.
- `pnpm lint`: passed, zero warnings.
- `git diff --check`: passed.

The initial sentinel stub implemented only promise-style connect; correcting it
to support the existing pool's callback form made the positive control valid.
No product check was weakened or converted to a skip. Fresh independent worker
spawn and completed-worker reuse were unavailable due the agent thread limit;
a separate source/compatibility/bypass review pass checked the pool's constructor,
actual query/connect behavior, direct fixture callers, both CI profiles, mutable
environment transition, and safety tests. No additional confirmed bypass remains
within this bootstrap boundary.

The broad local API suite was not run: no installed disposable PostgreSQL
binary was confirmed. Production build is irrelevant to this test-only helper
change. Full Node 20 release/vector CI and review remain required before merge.
Production's source-v67/historical-live-v65 reconciliation, exact database target,
recoverable backup, write-pause and explicit apply approval remain separate gates.
