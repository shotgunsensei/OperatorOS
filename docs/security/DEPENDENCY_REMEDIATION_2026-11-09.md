# Dependency security remediation, 2026-11-09

## Scope and result

Local source candidate based on frozen 8b8f974891f201335ac7f2d51f1a4c4533a328cf. The frozen source is unchanged. Official-registry dependency updates and scripts-disabled project installation were explicitly authorized. No deployment, publication, production database, migration or live provider action occurred.

The unchanged high-severity release policy now passes: zero unresolved high/critical advisories, zero source scan findings, complete audit report and existing exception integrity true. This is not a claim of zero advisories at every severity.

Before: audit metadata reported 20 high,1 critical,29 moderate,7 low across1310 paths;18 unresolved high/critical advisory IDs. After: metadata reports2 high,0 critical,2 moderate,0 low across1378 paths. The two high counts are existing reviewed local-patch exceptions; all four original ignored GHSA IDs remain unchanged and their exploit tests pass. The two unresolved moderate IDs are1244013 (glob13.0.7 via Expo fingerprint) and1244623 (minimatch10.2.6 via ESLint/typescript-eslint). No new ignore, severity reduction or skipped gate was added. Forcing their unsupported transitive major versions is outside this compatibility-tested change.

## Package changes and compatibility

- Next15.5.25 to15.5.28, Fastify5.12.5 to5.12.6 across root/API/runner, body-parser2.4.0, decode-uri-component0.5.1, follow-redirects1.16.2, fast-uri4.2.3 and qs6.16.1 or later within6.
- ImapFlow1.3.1 to1.7.8 and Mailparser3.9.8 to3.14.2, with matching API/runtime exact pins and fixtures. Their maintained transitive updates remove old Nodemailer, LinkifyIt and IP-address findings. Offline real MIME parsing and maintained client method contracts pass; OAuth/live mailbox availability is not claimed. Mailparser's text-conversion dependency requires Node20.19 or newer; local validation used Node24.16.0, hosted workflows use maintained Node20/22.
- Zod3.25.76 to4.6.6. Six GUID declarations retain prior hex-shaped UUID acceptance. A shared utf16Length refinement preserves existing UTF-16 min/max/exact bounds in BrandForge, Directory, customer search and messenger, matching HTML maxLength and JS length/truncation. Tests cover emoji, lone surrogates, trim/order, optional/null/default behavior, strict objects, records, email/coercion and stable error status/code/path. Unsafe integers now fail deliberately; library-generated issue prose can change. Oversized constrained array/map/set inputs are rejected before element parsing. Unbounded collections are not claimed protected.
- Removed only unused root @hookform/resolvers, drizzle-zod and zod-validation-error dependencies. Active runtime/tests/tooling search found no consumers; quarantined imported snapshots were excluded and remain unmodified/nonexecuted.
- Same Expo57 maintenance CLI/config/native-tool dependencies remove the CLI's Zod3 copy and obsolete deepmerge dependency. No Expo or React Native major upgrade. All three newly introduced font/constants/Metro peer mismatches were reconciled.
- node-forge1.4.1 retains the exact existing nested-DigestInfo patch (hunk moved1172 to1201). Expo plist0.8.2 retains the exact existing BOM/XML-MIME compatibility patch. Neither upstream patch was assumed present. RSA, BOM/XML, cross-realm redirect headers, malformed URI and compressed-body regressions exercise installed implementations.
- Lock inventory:1270 to1336 package/version components,78 removed and144 added, largely maintained native-tool dependency trees. Exact graph delta is retained in the external graph-diff.json receipt; regenerated CycloneDX SBOM is committed.

## Completed verification

All commands used the actual new installed graph, not fallback resolvers. Install lifecycle scripts remained disabled. Inherited database/provider credential variables were absent from test/build shells. No imported snapshot application or migration executed.

- corepack pnpm install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org: passed. Final runs used explicit task-local --store-dir and --cache-dir. Initial runs used the existing per-user pnpm cache, not global installation or settings; cache was preserved. Nested scripts reused the existing task pnpm command shim only in process PATH.
- corepack pnpm verify:hardening:phase39: passed; scanner/deployment scope/patch integrity pass,30 script tests and20 API/preflight tests pass, zero failures/skips.
- Eight Zod/domain/customer-workspace DB-free files:77 passed,0 failed/skipped. The new six-contract test independently passes strict standalone TypeScript and scoped lint.
- Mailbox adapter/routes:46 passed,0 failed/skipped. Actual maintained MIME/client checks also pass within phase39.
- corepack pnpm --filter @operatoros/torqueshed-native test:8 passed,0 failed/skipped; validate:config passed.
- corepack pnpm typecheck: all four targets passed. corepack pnpm lint: passed with zero warnings.
- INTERNAL_API_URL=http://localhost:5001 corepack pnpm build:production: passed deployment scope, source catalog checks, all types, API/runner compilation and Next15.5.28 production generation40/40. Next's redundant internal types/lint skip remains unchanged; root checks were run separately.
- EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 corepack pnpm --filter @operatoros/torqueshed-native export:mobile: Android and iOS bundles exported successfully. This is not signing/device/store acceptance.

## Remaining limits

Four baseline native peer warnings remain: expo-modules-core57.0.10 expects react-native-worklets ^0.7.4/^0.8/^0.9/^0.10 but resolves0.11.4; React Native0.86.2 CLI expects @react-native/metro-config0.86.2 but resolves0.87.0; native inherited react-dom18.3.1 expects React18 but native uses19.2.3; inherited @types/react-dom18.3.7 expects React18 types but native uses19.2.18. These exact warnings existed before this work. No peer warning was suppressed. Native type/unit/config/export checks pass, but real device acceptance remains separate.

An additional standalone strict check that explicitly includes the pre-existing customer-workspace fixture finds its line101 callback annotation mismatch; this is outside the normal project tsconfig, and was not hidden or declared passed. The new regression file alone passes strict compilation.

No PostgreSQL aggregate, migrations, production startup/preflight, authenticated deployed browser journey, provider, billing, credential, production patch, publish or deployment acceptance was performed. Module parity states remain unchanged. The module-audit repair commit is integrated and reverified separately after this dependency commit.

External receipts under dependency-audit-evidence-nov09 include baseline/after audit JSON, exact install logs, graph delta, tests, type/lint/build and mobile-export logs. Early failed patch-position and new-test expectation runs are preserved; their corrected final runs above pass.
