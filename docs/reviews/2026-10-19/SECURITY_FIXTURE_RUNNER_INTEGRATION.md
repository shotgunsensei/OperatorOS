# Fixture and runner integration verification

Verdict: implementation verified; deployment unverified. Independent integration
review passed. Keep the integration draft until its exact-head hosted release
checks pass. No merge, publication or production operation is performed here.

## Provenance and scope

- Base main: `09897e223be28a18e2c52d40b36cdf180275de33`, containing the reviewed
  webhook fix from PR127.
- Integration branch: `codex/operatoros-security-integration-oct19`.
- Fixture source: draft PR128, `1b8d6242c4050aa703f574fcbd03d3440768f456`.
- Runner source: draft PR129, `63f8ca2761af65d3390b9f2e35d345284a4391b9`.

The two reviewed commits were applied with no-commit cherry-picks in a new
isolated worktree. Original branches, commits and drafts are preserved. Code
and test application was conflict-free. Only the shared implementation-status
and module-parity insertions conflicted; all webhook, fixture and runner
records were retained, with this new integration overlay.

`git diff --exit-code` against each original candidate proves unchanged Git
content for its implementation, tests, AGENTS fixture instructions and detailed
review receipt. For example, the fixture bootstrap blob is
`30603a6810af8922c4e555ec9640522e16b5792e`, runner index blob
`1641712dd1ba1616150b699ab91f6e55f3e987ce`, and runner test blob
`101c79ee602b8fa83c032b4f038391d1cf0e046b` in both original and integration.

The fixture gate still checks the connection URL actually captured by pg.Pool
before any DDL imports or calls. The runner still defaults only its standalone
listener to loopback, preserves explicit interfaces and mode selection, and
never launches an execution workload in these tests. Existing production
supervisor behavior and the merged webhook transport are unchanged.

Package manifests, lockfile, workflows, release schema manifest, `.replit`
and the supervisor match the base. No new dependency, migration, provider,
paid-feature, credential or host-setting change is included.

## Fresh local verification

Environment: Windows; existing Node 24.16.0 and pinned pnpm 10.34.5. Existing
task-local dependencies were reused with junctions; no install or acquisition
was performed. Commands ran from the integration worktree with the existing
Node/pnpm shims on PATH.

| Command | Actual result |
| --- | --- |
| `pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/public-webhook-http.test.ts test/deterministic-outbound-isolation.test.ts test/shared-queue-tenant-scope.test.ts test/replit-unified-runtime.test.ts` | 16 passed, 0 failed/skipped/cancelled |
| `pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/schema-fixture-target-guard.test.ts test/outcall-resource-fixture-guard.test.ts` | 8 passed, 0 failed/skipped/cancelled; 15 isolated connection-sentinel probes |
| `pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/runner-gateway-loopback.test.ts test/replit-unified-runtime.test.ts test/phase39-production-hardening.test.ts` | 9 passed, 0 failed/skipped/cancelled |
| `pnpm lint` | Passed, zero warnings |
| `pnpm typecheck` | All four workspace typechecks passed |
| `pnpm --dir apps/api exec tsc --noEmit --strict --allowJs --resolveJsonModule --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck test/schema-fixture-target-guard.test.ts test/_setup.ts test/runner-gateway-loopback.test.ts src/lib/public-webhook-http.ts test/public-webhook-http.test.ts` | Passed |
| `pnpm --dir apps/runner-gateway build` | Passed |
| `RUNNER_GATEWAY_TEST_COMPILED=1 pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/runner-gateway-loopback.test.ts` | 2 passed, 0 failed/skipped/cancelled |
| `git diff --check` and staged counterpart | Passed |

The three source groups execute 33 checks total; the three unified-supervisor
tests run in both webhook and runner groups, so there are 30 unique tests.
This count does not imply a full API or customer-workflow suite. The compiled
fixtures verify health, disabled exec 126, explicit localhost compatibility and
exclusive default IPv4 loopback binding. No real database was connected, SQL
executed, workspace workload launched or external provider contacted.

An independent read-only reviewer verified the original Git blobs, complete
combined code/test delta, captured-pool target guard, existing disposable CI
identity, deterministic webhook fixtures, transport/caller and supervisor/runner
compatibility. It ran all eight focused files in one command: 30 unique tests
passed with zero failures/skips/cancellations/todos in 20.415 seconds; its
separate compiled-runner rerun passed 2/2 in 1.275 seconds. It reviewed the final
combined documentation and both diff checks, and found no material integration
bypass or regression. This is ordinary source review, not a formal security
scan or production acceptance.

## Remaining gates and recovery

The hosted Node 20 release workflow must exercise the combined exact head,
including disposable database apply/reapply and browser acceptance; the local
full database and browser suites were not run. The original detailed receipts
retain their historical scope and limitations. No module parity or live release
claim is promoted by this integration.

Production remains separate: current source requires schema67; historical live
schema65 is not fresh production evidence. Exact target confirmation,
recoverable backup, write pause and explicit approval remain required before
any production database apply. Publication remains manual and separately gated.
No release setting or security control is changed by these source patches.

Source rollback is a reviewed revert of this integration onto its parent tree;
there is no schema rollback to perform because the manifest is unchanged.
Reverting restores the prior fixture/listener behavior, so reassess those
exposure and test-target risks before choosing that rollback. Original drafts
must remain preserved until the combined change is proven and reconciled.
