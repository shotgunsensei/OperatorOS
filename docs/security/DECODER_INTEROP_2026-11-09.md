# Native query-string decoder interop, 2026-11-09

This isolated follow-on starts at frozen `ed1ab8dcf75db4ce0832006ca19b6ff0b3d4b3ea`.
It patches only query-string 7.1.3's decoder import to accept either a callable
CommonJS export or a callable ESM default, and reject unsupported shapes.
The decode-uri-component 0.5.1 security override, existing forge/plist/braces
patches, advisory policy and publication holds remain unchanged.

## Scope and impact

The unpatched installed API throws for ordinary parse inputs because its
decoder is an ESM namespace, not a callable. Its vendored React Navigation
getStateFromPath also fails for a synthetic route with a query. Both now pass.
This does not establish a broken ordinary TorqueShed deep-link flow: Expo
Router supplies a different inbound parser using URL.searchParams, and its
outbound stringify path already worked. No authentication behavior changed.

## Verification

Commands use Node 24.16.0 and approved pnpm 10.34.5, with task-local store/cache.
Lock-only refresh and frozen install ran offline with `--ignore-scripts` and
zero downloads. Root and installed locks match byte-for-byte at SHA256
`7d020fd1976bc47ed5e81ff8af8ee98cc1c4b673de8df58b3e12037ccd7c0a65`.
The SBOM was regenerated from that exact lock (1,311 components).

- `node --test scripts/phase39/decoder-interop-regression.test.mjs`: 5 passed.
  Actual installed API and vendored navigation, no-query/decode-disabled/
  stringify controls, both supported export shapes and invalid shapes,
  malformed UTF-8/percent input, bounded hostile input, and Expo native Babel
  transformation on Android and iOS are covered.
- Historical installed decoder 0.5.0 versus 0.5.1: 12 bounded synthetic cases
  agree; each subprocess has a three-second bound. This is not a comparison
  with 0.2.0, which was not available in the inspected historical assets.
- Root typecheck and zero-warning lint pass. Native unit tests: 8 passed;
  native configuration validation passes.
- `node --test scripts/phase39/*.test.mjs`: final suite 36 passed, zero
  failures/skips. An early decoder invocation while installation was still
  linking failed with missing expo-router; all reported passes are after the
  frozen install completed. No failure was converted to a skip.
- Offline `pnpm --filter @operatoros/torqueshed-native export:mobile` passes
  for Android and iOS through Metro, producing Hermes bytecode artifacts.
  This is compilation/export evidence, not device or Hermes runtime execution.
- Security scan passes with zero source findings. Raw advisory metadata has
  zero critical, zero high and two moderate entries; unfiltered audit exits
  1 for those moderates. No new suppression was added. This is not an
  all-packages-latest or vulnerability-free claim.

External evidence is in the task's `evidence/operatoros-decoder-interop-nov09`
directory, including install/check logs, raw audit, bounded differential
probe and a machine-checked equivalence receipt.

## PostgreSQL proof and release boundaries

November 10 recovery: the November 9 full `pnpm build:production` attempt lost
its execution connection during API emit/Next compilation. Its session no
longer exists, no candidate-owned Node processes remain, and its saved log
contains no completion or exit receipt. Its outcome is unverified, not a
passing production build. Focused successful checks above remain their own
evidence; no build result is inferred from them.

All importer entries, resolved package inventory and security overrides are
unchanged. Recursive lock snapshot closures compare equal for root (763),
apps/api (238), and packages/agent-runtime, profiles and sdk (one each).
Root package.json, apps/api and packages sources compare byte-identically
against ed1. The only snapshot edits are query-string patch identity and its
expo-router reference. Thus existing API/database proof retains its original
source and dependency premises, but it remains a receipt for its original
commit. PostgreSQL was NOT rerun on this follow-on and no prior receipt was
relabeled. Frozen ed1 remains clean, with its original tree/lock intact.

Real-device/Hermes acceptance, authenticated deep-link flows, full PostgreSQL
suite, provider/network acceptance, publication and deployment remain unrun.
No parity promotion, DB/provider changes, GitHub objects or publication were
performed. The November 6 uncertain-publication hold remains in force.
