# Replit dependency scan reconciliation — 2026-08-20

## Status

**SOURCE/LOCAL VERIFIED; REPLIT REPUBLISH PENDING.** The supplied Replit Basic
Checks report contained 35 rows representing 23 unique package/version pairs.
The findings were reconciled against every tracked dependency lock and the
actual Replit deployment path. Most rows came from an obsolete root
`package-lock.json` or from non-executable module source snapshots, not from the
authoritative pnpm graph.

The obsolete npm lock and ten historical source-snapshot pnpm locks have been
removed from the current tree. They remain recoverable from Git history. The
source code and provenance needed for migration, audit, and historical
reference remain in place.

## Latest Node 20 provider rejection — 2026-08-25

Replit retried deployment `0a34bd3d-5706-434d-87ee-fffd3bf6e5cd` as build
`974c6e95-4124-4647-8010-16f4b2c09415`. The provider security scan completed
resolution and installation with bundled pnpm `10.26.1`, then the root
`preinstall` rejected that pnpm under Node `v20.20.0`, Linux x64. The attempt
stopped before the checked-in deployment build, database release, runtime, or
health checks.

GitHub and local `main` at `b2b8a06495e255360c237230facb66baca746338`
already include the exact Node 20 tuple through commit `9a5cd76`. That current
predicate accepts the supplied log's tuple, so the failed provider output is
strong evidence of a stale or otherwise different source snapshot. Replit did
not include a source SHA in the supplied log, so the snapshot identity cannot
be confirmed from provider evidence alone.

The current merge separately reintroduced public mappings for internal ports
5001 and 5002; GitHub workflow `32881726210` caught those mappings in the
deployment-scope gate. The local repair restores the single public-port
contract and makes `REPLIT_DEV_DOMAIN` an unconditional denial for every scan
exception. Regression coverage accepts only the two observed stripped tuples
and rejects Node `v20.20.1`, pnpm `10.26.2`, ARM64, and exact tuples presented
from the interactive editor.

Provider-like pnpm 10.26.1 and exact pnpm 10.34.5 frozen installs both pass
locally without changing the sole root lock hash. Phase 39 passes 14/14, the
security scan reports zero findings across 1,279 files, deployment scope sees
only root `pnpm-lock.yaml` and public port 80, npm fails with
`EBADDEVENGINES` without creating a lock, and the production build completes
all four TypeScript targets and 32/32 Next pages. This is source/local proof,
not a successful Replit rescan or publication. Current GitHub CI has additional
release-contract failures, and live readiness remains on commit `399f4d2`,
build `e15147c`, database v54.

## Replit publish-scan runtime recursion — 2026-08-21

GitHub `main` had advanced to Replit's empty publication-marker commit
`9cb875ef9e1430500df69753ac466173457bb75d` when Replit started deployment
`0a34bd3d-5706-434d-87ee-fffd3bf6e5cd` / build
`e60c962d-76da-4817-a888-a220195bdf4f`. The attempt did not reach the
repository's `.replit` build. The empty marker's tree is identical to
source-bearing parent `9f48a036e2ac55bcf748d98bef54d42c12801c4f`.
Replit's provider-owned publish security scan ran direct `pnpm install` with
Nix Node 24.12.0; provider pnpm recursively attempted to install pinned
`pnpm@10.34.5` through nested `pnpm add pnpm@10.34.5` calls until Node could
not create another worker thread.

After source repair `0da3c627947979f85d40588b6a13362e7450a262` reached
GitHub main, Replit retried the same deployment as build
`ddc1c1f3-1299-49d7-a5df-64a8d995d191`. Resolution completed from the root
lock, package installation completed, and recursion did not recur. The root
`preinstall` then rejected `pnpm/10.26.1` because this security-scan container
did not expose either initially recognized Replit signal. This second failure
is the local package-manager gate, not a dependency resolution, application
build, runtime, migration, or health-check failure.

The workspace now sets `managePackageManagerVersions: false`, preventing that
recursive provider bootstrap. Exact pnpm 10.34.5 remains mandatory everywhere
except a bounded Replit pre-build provider context. There, pnpm 10.26.0 or a
newer version within major 10 may perform the ephemeral scan install. The
exception prefers Replit's documented provider/deployment variables or the
observed Linux `/nix/store/` Node path, without the editor-only
`REPLIT_DEV_DOMAIN`. Because the provider security scan may strip those
signals, a fallback accepts only the exact observed `pnpm/10.26.1` + Linux
`x64` tuples for Node `v24.12.0` and the current Node `v20.20.0` scanner
runtime. The stripped-signal path also requires a non-Nix runtime so an
interactive editor remains rejected. It rejects adjacent pnpm and Node versions, other
architectures/platforms, and editor context. `.replit` subsequently reinstalls the sole graph
with explicit pnpm 10.34.5 and `--frozen-lockfile`; npm remains rejected by
`devEngines`, and ignored/alternate locks remain fail-closed inputs.

Local reproduction used provider-like pnpm 10.26.1. The exact Replit
`pnpm install` command shape completed without recursive self-install and left
the root lock hash unchanged at
`5b72b16f727bd8852868b7d9af9e5598ee5f1b861da0afc1d66fc2265f20c6f7`.
The same version remains rejected outside a recognized provider context unless
the complete stripped-environment toolchain fingerprint matches. An actual
Linux Node 24.12 container accepts the exact fingerprint and rejects pnpm
10.26.2; unit coverage also rejects a changed Node patch, architecture, and
editor context. Exact 10.34.5 frozen install passed. Phase 39 passed 14/14
scripts and 13/13 API/preflight checks; TypeScript, ESLint, and the 32-route
optimized production build passed. This proves the hotfix source locally, not
Replit acceptance.

Both public hosts remained healthy after the failed attempt, but `/readyz`
identified commit `399f4d2cb64ecf9511d7c82e8066c332c31ac7eb`, build
`e15147cfd811c794a780887f`, and database release v54. The v55 main candidate
was not made production-live. A new exact-commit publish, provider rescan,
release identity check, production backup/apply, and deployed browser gates
remain required.

## PR #83 frozen-install correction — 2026-08-21

The first PR #83 `verify-release` run stopped during `pnpm install
--frozen-lockfile`. The original npm-regeneration safeguard used
`package-lock=false` in root `.npmrc`; pnpm consumes npm configuration and
interpreted that setting as prohibiting its own lockfile, so the frozen install
could not read `pnpm-lock.yaml` and emitted a secondary overrides-mismatch
message.

Root `.npmrc` has been removed. `package.json` now uses a portable Node
`preinstall` hook that accepts only pnpm `10.34.5` and rejects npm, Yarn, an
older pnpm, or an unidentified lifecycle. This preserves the single-lock policy
without changing pnpm's lockfile configuration. A local rerun of the exact
frozen install reports the lock current and completes the hook. That correction
was pushed as PR #84 commit `015ebe9ed7`; the review follow-up below supersedes
its original deployment-scope evidence.

## PR #84 ignored-lock review correction — 2026-08-21

Automated review of commit `015ebe9ed7` correctly identified that npm updates
`package-lock.json` before it runs `preinstall`, and that the ignored root lock
was absent from the gate's Git-visible file list. `package.json` now declares
an error-level `devEngines.packageManager` requirement for pnpm `10.34.5`, so
supported npm CLIs reject the repository before installation. The portable
`preinstall` enforcement remains as a second boundary for pnpm and package
managers that do not implement npm's `devEngines` contract.

The deployment-scope verifier now also merges a bounded filesystem scan with
the Git-visible inventory. It inspects root files and historical
`apps/modules/*/source` trees for dependency locks, including ignored files,
without recursively traversing executable `node_modules` or build output. A
controlled ignored root `package-lock.json` failed the gate, and a real npm
11.13.0 install failed with `EBADDEVENGINES` without creating the lock. The
follow-up was merged through PR #84; the first Replit publish of the resulting
main candidate exposed the provider recursion above.

The GitHub release run against the older `015ebe9ed7` head confirms that the
original frozen-install blocker is closed: install, Phase 39 hardening,
typecheck, lint, and production build all passed. The fail-closed release
contract remained non-green at five later steps: global parity, two unit
assertions, 19 API assertions, route-control static findings, and exact-host
browser startup. Those downstream failures are separate release/parity work;
they are not represented as a passing security or deployment acceptance gate.

## Finding reconciliation

| Replit package/version | Reported severity | Current deployable state |
|---|---:|---|
| `vitest@2.1.9` | Critical | Historical source lock removed; not present in the root pnpm graph |
| `vitest@3.2.4` | Critical | Historical source lock removed; not present in the root pnpm graph |
| `tar@7.5.10` | Critical / High | Stale lock input removed; root pnpm resolves `7.5.22` |
| `image-size@1.2.1` | High | Active transitive Metro dependency; locally patched for both exact GHSAs because upstream has no patched version, with two executable malicious-input regressions |
| `brace-expansion@5.0.4` | High | Stale lock input removed; root pnpm resolves `5.0.9` |
| `brace-expansion@5.0.7` | High | Historical lock removed; root pnpm resolves `5.0.9` |
| `rollup@4.53.5` | High | Stale lock input removed; root pnpm resolves `4.62.4` |
| `flatted@3.3.3` | High | Stale lock input removed; root pnpm resolves `3.4.4` |
| `picomatch@2.3.1` | High | Historical lock removed; root pnpm resolves only `4.0.5` |
| `picomatch@4.0.3` | High | Stale/historical locks removed; root pnpm resolves `4.0.5` |
| `@xmldom/xmldom@0.8.11` | High | Stale lock input removed; root pnpm resolves `0.9.11` |
| `drizzle-orm@0.45.1` | High | Historical locks removed; root pnpm resolves `0.45.2` |
| `vite@7.3.1` | High | Historical locks removed; root pnpm resolves `7.3.6` |
| `deepmerge-ts@7.1.6` | High | Historical lock removed; not present in the root pnpm graph |
| `@clerk/express@2.1.2` | High | Historical lock removed; not present in the root pnpm graph |
| `@clerk/react@6.4.0` | High | Historical lock removed; not present in the root pnpm graph |
| `find-my-way@9.5.0` | High | Stale lock input removed; root pnpm resolves `9.7.0` |
| `ws@8.19.0` | High | Historical lock removed; root pnpm resolves only `8.21.3` |
| `ws@8.20.0` | High | Historical lock removed; root pnpm resolves only `8.21.3` |
| `vite@5.4.21` | High | Historical lock removed; root pnpm resolves only `7.3.6` |
| `vite@7.3.2` | High | Historical locks removed; root pnpm resolves only `7.3.6` |
| `http-proxy-middleware@3.0.5` | High | Historical locks removed; not present in the root pnpm graph |
| `ip-address@10.1.0` | High | Historical lock removed; not present in the root pnpm graph |

Repeated Replit rows share the same resolution and are not counted as separate
dependency roots in this table.

## Preventive controls

- `pnpm-lock.yaml` at the repository root is the only allowed dependency lock.
- `.gitignore` rejects alternate root locks and all dependency locks below
  `apps/modules/*/source`; npm's `devEngines` check rejects supported npm CLIs
  before install, and the root `preinstall` hook provides lifecycle enforcement
  without changing pnpm's lockfile configuration.
- `scripts/import-module-snapshot.ps1` excludes dependency locks during future
  tracked-source imports and records each exclusion in `SOURCE_SNAPSHOT.json`.
- `.replit` disables automatic hosting package installation and package
  guessing, ignores the historical module area for package discovery, hides it
  from the default file tree, and exposes only the readiness-gated public port.
- `scripts/verify-deployment-scope.mjs` fails the production build if another
  lockfile appears even when Git ignores it, historical source enters the
  workspace, the importer or ignore policy regresses, Replit package discovery
  is re-enabled, or an internal service port becomes public.
- The Phase 39 security scan includes this deployment-scope result alongside
  dependency audit, secret scan, and SAST results.

## Verified local evidence

- Frozen pnpm install: pass; lockfile already current.
- Full and production pnpm audits at high threshold: exit 0, no actionable
  advisories or actions, 0 critical, and 0 unresolved high. Audit metadata
  continues to disclose the two exact patched `image-size` highs.
- Phase 39 security scan: 1,278 files, 0 findings, 1,257 dependencies, scope
  gate pass.
- Phase 39 script tests, including package-manager enforcement, the bounded
  Replit provider path, deployment scope, scanner controls, both patched image
  regressions, budgets, and SBOM stability: 14/14 pass.
- Phase 39 API/preflight hardening tests: 13/13 pass.
- Source-snapshot provenance and Replit runtime tests: 13/13 pass.
- TypeScript, ESLint, and the production build: pass.

These results prove the source/local candidate tree. They do not mark Replit's
provider-owned findings resolved. After the GitHub-synchronized hotfix is
republished, Replit must rescan the exact candidate commit. A version-only scanner may
continue to display `image-size@1.2.1`; if so, the local patch and regression
evidence must be reviewed rather than replacing it with `2.0.2`, which is also
affected.
