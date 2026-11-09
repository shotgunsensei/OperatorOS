# Dependency security remediation, 2026-11-09

## Scope and current result

This isolated candidate starts at frozen `8b8f974891f201335ac7f2d51f1a4c4533a328cf`; the frozen source remains unchanged. Scoped official-registry acquisition, manifest/lock updates and local build/tests with install scripts disabled were authorized. No publication, deployment, production database, migration or live provider action occurred.

The unchanged high-severity release policy passes: **zero unresolved high/critical advisories**, zero source scan findings, complete audit report and existing exception integrity true. This is not a zero-advisory claim.

- Fresh frozen-source baseline: 20 high, 1 critical, 29 moderate and 7 low affected paths across 1,310 paths; 18 unresolved high/critical advisory IDs.
- Remediated graph: 2 high, 0 critical, 2 moderate and 0 low across 1,378 paths. The two high counts are existing reviewed patch exceptions. All four original ignored GHSA IDs remain unchanged and their installed-implementation regressions pass. No ignore, severity reduction or skipped gate was added.
- Remaining moderate advisories: `1244013` / `GHSA-3g3m-2fjr-6pw4`, glob 13.0.7 via Expo fingerprint; `1244623` / `GHSA-g3hv-75wg-m249`, minimatch 10.2.6 via ESLint/typescript-eslint. Patched versions require glob 14 / minimatch 11; maintained parents still select the older major. Unsupported transitive major overrides were not forced.
- The earlier hosted `5e4615a0` audit (13 high and 1 critical) is separate historical evidence, not the fresh `8b8f9748` baseline above.

## Package changes and compatibility

- Next 15.5.25 to 15.5.28; Fastify 5.12.5 to 5.12.6 across root/API/runner; compatible overrides for body-parser 2.4.0, decode-uri-component 0.5.1, follow-redirects 1.16.2, fast-uri 4.2.3 and qs 6.16.1 or later within major 6.
- ImapFlow 1.3.1 to 1.7.8 and Mailparser 3.9.8 to 3.14.2, including matching API/runtime exact pins and fixtures. Maintained parent updates remove old Nodemailer, LinkifyIt and IP-address findings. Offline real MIME parsing and client method contracts pass; OAuth/live mailbox acceptance is separate. The new text converter requires Node 20.19 or newer. Local validation used Node 24.16.0; deployment must satisfy the engine requirement.
- Zod 3.25.76 to 4.6.6. Six GUID declarations preserve the prior hex-shaped UUID contract. `apps/api/src/lib/zod-string-length.ts` preserves UTF-16 min/max/exact limits in BrandForge, Directory, customer search and messenger, matching HTML `maxLength` and JavaScript length/truncation. Tests cover emoji, lone surrogates, trim/order, optional/null/default behavior, strict objects, records, email/coercion and stable application status/code/path. Unsafe integers deliberately fail; library-generated error prose can change. Constrained oversized array/map/set inputs fail before element parsing; unbounded collections are not claimed protected.
- Removed unused root `@hookform/resolvers`, `drizzle-zod` and `zod-validation-error`. Active runtime/tests/tooling search found no consumers. Read-only imported snapshots were excluded and remain unmodified and nonexecuted.
- Same-major Expo 57 maintenance CLI/config/native-tool updates remove the CLI's Zod 3 copy and obsolete deepmerge. No Expo or React Native major upgrade. Newly introduced font/constants/Metro peer mismatches were reconciled with maintenance versions, not suppressed.
- node-forge 1.4.1 retains the exact existing nested-DigestInfo mitigation; only patch hunk position moved from 1172 to 1201. Expo plist 0.8.2 retains the existing BOM/XML-MIME patch unchanged. RSA, BOM/XML, cross-realm redirect headers, malformed URI and compressed-body regressions exercise installed implementations.
- Lock inventory: 1,270 to 1,336 package/version components, 78 removed and 144 added, largely maintained native-tool trees. `graph-diff.json` retains the exact delta. The regenerated CycloneDX SBOM has normalized lock SHA-256 `2a9a02064647029e9ada1f4b6edd858d0883aea97cda1f1a8d8ed244dcf81266`.

The unchanged ignored IDs are `GHSA-5p2g-fcmc-qvqq`, `GHSA-w3rx-r6r6-pgpr`, `GHSA-86w9-cpqp-85rv` and `GHSA-vfj7-8cjw-p6xm`.

## Integrated source and completed verification

Dependency commit `7da260e29a88db88b978947a66aaaae86369e537` is followed by module repair `45d6c57ecb4612886ee4e944293c2f1a254ae2e6` (original `d881c5f0`) and database-state documentation clarification `864e130c98d6a697cb75ac73a9fba9d01ca71876` (original `7a2fdce9`). The final runtime and dependency checks below ran at **864e130c**. Subsequent finalization changes only documentation/SBOM metadata.

All checks use the actual installed graph, without fallback package resolvers. Install lifecycle scripts remain disabled. Inherited database/provider credentials were removed from test/build shells; DB-free module, mailbox and Zod checks additionally block network connections. No snapshot application or migration executed.

- Frozen installation: `corepack pnpm install --offline --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org --store-dir <task>/dependency-audit-evidence-nov09/pnpm-store --cache-dir <task>/dependency-audit-evidence-nov09/pnpm-cache` passed with an unchanged lock and no downloads. Earlier authorized online installs used these task-local flags for the final graph. Initial runs used the existing per-user pnpm cache, not a global installation or settings change; it was preserved. `.modules.yaml` verifies task-local store `pnpm-store/v10` and this worktree's `node_modules/.pnpm`. Nested scripts use the pre-existing task pnpm command shim only in process PATH.
- `corepack pnpm verify:hardening:phase39`: passed. Scanner, deployment scope and patch integrity pass; 30 script tests and 20 API/preflight tests pass, zero failures/skips. Scanner generated at `2026-11-09T15:50:48.469Z` has zero unresolved high/critical IDs.
- Eight Zod/domain/customer-workspace DB-free files: **77/77**. New six-contract regression also passes standalone strict TypeScript and lint.
- Seven module DB-free files: **62/62**, combining SnapProof 50 and TechDeck/shared-platform 12. These test actual pure/source handlers with explicit synthetic boundaries, not a real database or signed-session deployment.
- Canonical SnapProof Chromium component/IndexedDB suite: **15/15**, zero skipped, at clean 864e130c. Nine runtime/test hashes and five manifest/lock hashes remained unchanged. Playwright 1.61.1, existing Chromium 1228, esbuild 0.25.12, tsx 4.23.12 and React 18.3.1; no old-asset fallback, acquisition or live requests.
- Mailbox adapter/routes: **46/46**. Native unit tests: **8/8**; native configuration validation passed.
- `corepack pnpm typecheck`: all four targets passed. `corepack pnpm lint`: zero-warning pass.
- Expanded strict API/web source plus changed-test checks passed using canonical dependencies. API includes both `techdeck-literal-product.test.ts` and `snapproofos-db.test.ts`: **typechecked, not executed**. Initial external Windows backslash globs omitted runtime roots and caused two WebSocket augmentation errors; forward-slash includes restore all runtime roots and nine API test roots. No types, checks or source were weakened. Initial failing receipts are retained.
- `INTERNAL_API_URL=http://localhost:5001 corepack pnpm build:production`: passed deployment scope, source catalog checks, all types, API/runner compilation and Next 15.5.28 production generation **40/40**. Next's unchanged redundant internal type/lint skip is not used as proof; root checks ran separately.
- `EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 corepack pnpm --filter @operatoros/torqueshed-native export:mobile`: Android and iOS bundles exported successfully on the same final graph before module integration. Module commits do not change native source or dependencies. This is not signing, device or store acceptance.

## Remaining limits and rollout requirements

Four exact baseline native peer warnings remain, unchanged from before this work:

1. expo-modules-core 57.0.10 expects react-native-worklets `^0.7.4 || ^0.8.0 || ^0.9.0 || ^0.10.0`; resolves 0.11.4.
2. React Native 0.86.2 community CLI expects @react-native/metro-config 0.86.2; resolves 0.87.0.
3. Native inherited @types/react-dom 18.3.7 expects @types/react `^18.0.0`; native resolves 19.2.18.
4. Native inherited react-dom 18.3.1 expects React `^18.3.1`; native resolves 19.2.3.

No peer warning was suppressed. Native unit/type/config/export checks pass, but real-device compatibility remains a separate gate. Exact baseline/current peer requirements and resolutions are retained in `peer-baseline-current.json`; the emitted final warnings are in `lock-update-6.log`.

An additional standalone strict check including the pre-existing customer-workspace fixture exposes its line 101 callback annotation mismatch. It is outside the normal project config; it was not hidden or declared passed. The new regression file alone passes strict compilation.

SnapProof API and capture UI must deploy together. Legacy unbound queued captures stay held for manual recovery and are never silently reassigned or deleted. Compiled health release metadata is not measured database state. Production migration state is unverified; the supported apply reruns all 68 manifest steps, including catalog/backfill effects, and needs the separately approved backup/recovery and maintenance plan.

No PostgreSQL aggregate, migrations, production startup/preflight, authenticated deployed browser journey, provider, billing, credential, publication or deployment acceptance was performed. Module parity states are unchanged. Local success does not make this a production release.

External evidence under `<task>/dependency-audit-evidence-nov09` includes exact audit JSON/IDs, install/lock receipts, graph delta, integrated logs/configs/receipts and `FINAL_VERIFICATION.json`. Browser evidence is `<task>/evidence/module-audit-nov09/snapproof-canonical-browser-864e130c-receipt.json` and its log. Historical failed patch-position, test-expectation and external type-config runs are retained alongside corrected passing results.
