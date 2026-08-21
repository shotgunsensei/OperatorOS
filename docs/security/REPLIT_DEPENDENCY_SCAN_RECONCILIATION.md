# Replit dependency scan reconciliation — 2026-08-20

## Status

**SOURCE/LOCAL VERIFIED; REPLIT RESCAN PENDING.** The supplied Replit Basic
Checks report contained 35 rows representing 23 unique package/version pairs.
The findings were reconciled against every tracked dependency lock and the
actual Replit deployment path. Most rows came from an obsolete root
`package-lock.json` or from non-executable module source snapshots, not from the
authoritative pnpm graph.

The obsolete npm lock and ten historical source-snapshot pnpm locks have been
removed from the current tree. They remain recoverable from Git history. The
source code and provenance needed for migration, audit, and historical
reference remain in place.

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
  `apps/modules/*/source`; `.npmrc` prevents npm from regenerating the obsolete
  root lock as an untracked Replit scanner input.
- `scripts/import-module-snapshot.ps1` excludes dependency locks during future
  tracked-source imports and records each exclusion in `SOURCE_SNAPSHOT.json`.
- `.replit` disables automatic hosting package installation and package
  guessing, ignores the historical module area for package discovery, hides it
  from the default file tree, and exposes only the readiness-gated public port.
- `scripts/verify-deployment-scope.mjs` fails the production build if another
  lockfile appears, historical source enters the workspace, the importer or
  ignore policy regresses, Replit package discovery is re-enabled, or an
  internal service port becomes public.
- The Phase 39 security scan includes this deployment-scope result alongside
  dependency audit, secret scan, and SAST results.

## Verified local evidence

- Frozen pnpm install: pass; lockfile already current.
- Full and production pnpm audits at high threshold: exit 0, no actionable
  advisories or actions, 0 critical, and 0 unresolved high. Audit metadata
  continues to disclose the two exact patched `image-size` highs.
- Phase 39 security scan: 1,277 files, 0 findings, 1,257 dependencies, scope
  gate pass.
- Phase 39 script tests, including deployment scope, scanner controls, both
  patched image regressions, budgets, and SBOM stability: 11/11 pass.
- Phase 39 API/preflight hardening tests: 13/13 pass.
- Source-snapshot provenance and Replit runtime tests: 13/13 pass.
- TypeScript, ESLint, and the production build: pass.

These results prove the source/local candidate tree. They do not mark Replit's
provider-owned findings resolved. After merge and republish, Replit must rescan
the exact candidate commit. A version-only scanner may continue to display
`image-size@1.2.1`; if so, the local patch and regression evidence must be
reviewed rather than replacing it with `2.0.2`, which is also affected.
