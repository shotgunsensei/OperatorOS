# Dependency recheck and raw-high removal, 2026-11-09

## Result and provenance

This isolated candidate starts at `405740c8846818b349822bdd6061d979033d7466` (tree `da19ca51cb33c808e65e9307f2dada9bcc60c605`). The starting worktree remains unchanged. Evidence is task-local under `dependency-recheck-evidence-nov09`; no deployment, publication, database, migration, live provider or global configuration action occurred.

The fresh official-registry audit now reports **0 high, 0 critical, 2 moderate, 0 low** across 1,353 dependency paths. The unfiltered npm bulk-advisory response independently contains only the two moderates. This is a raw zero-high/critical result, not merely an exception-filtered pass, and it is not a zero-advisory or all-packages-latest claim.

The starting raw counts were 2 high, 0 critical, 2 moderate across 1,378 paths. The two highs were **image-size 1.2.1**, not node-forge or Expo plist:

- [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq): JXL/HEIF parser denial of service.
- [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr): ICNS parser denial of service.

The baseline installed patch regressions passed before changes (17 tests). The vulnerable package has now been removed from the canonical graph. Its unused patch and only its two matching audit exceptions were removed. No new suppression, severity reduction or skipped gate was added.

## Supported updates

- Next 15.5.28 to **15.5.29**, Fastify 5.12.6 to **5.12.8**, Zod 4.6.6 to **4.6.7**, node-forge 1.4.1 to **1.4.3**. These are current maintained patches checked against the official registry at execution time.
- Expo **57.0.32** within the existing SDK 57, with its maintenance dependencies, and fingerprint **0.20.15**. React Native remains 0.86.2 and native React remains 19.2.3. No Expo SDK 58, React or Next major migration was forced.
- Expo selects `@expo/metro@56.0.2`, which pins Metro **0.84.5**. React Native CLI 0.86.2 allows Metro/core/config `^0.84.3`; narrow 0.84.5 overrides resolve those parents consistently inside their declared ranges. Metro 0.84.5 removed image-size upstream. This avoids forcing incompatible image-size 2.x beneath Metro 0.84.4.
- `pnpm why image-size --recursive` is empty. Canonical SBOM inventory and installed Expo/React Native CLI parent regressions both assert its absence and the maintained Metro path. The earlier parser exploit fixtures were replaced by absence/parent regressions because no parser implementation remains in this graph.
- Official node-forge 1.4.3 tarball integrity was verified against registry SHA-512. Its RSA implementation still lacks the reviewed nested-DigestInfo validation, so that patch is retained byte-for-byte at the new package version. Installed RSA regressions pass. Expo plist BOM/XML-MIME and braces depth patches remain unchanged. The remaining historical forge/braces exceptions are not being used to conceal any current returned high advisory.
- The security policy is stricter: it now rejects any nonzero raw high count, even if an advisory was filtered. New regression cases cover filtered high, critical, incomplete response, bad command exit, unresolved ID and invalid patch integrity.

## Remaining advisories and exposure

1. [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), moderate: `apps/torqueshed-native > expo > @expo/fingerprint@0.20.15 > glob@13.0.7`. Abort cancellation can allow continued traversal. Official fix is glob >=14.0.2. Both SDK57 fingerprint and latest fingerprint 0.21.9 still request `glob ^13.0.0`.
2. [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), moderate: audit representative path `root > @typescript-eslint/eslint-plugin > @typescript-eslint/type-utils > @typescript-eslint/typescript-estree > minimatch@10.2.6`; also used by ESLint/Expo tooling. Pattern amplification affects optimization level >=2. Official fix is minimatch >=11.0.1. Latest ESLint 10.14.0 and typescript-estree 8.72.2 still request major 10.

These paths are lint/native build tooling, not direct imports in active API/web/runner/native application source. They remain installed dependencies and are not declared harmless: untrusted workspace paths, patterns or build inputs can matter. No unsupported glob14/minimatch11 override was forced. The supported upstream path is parent adoption of those fixed majors, followed by lint/fingerprint/native-export compatibility tests.

## Latest-version limits

A fresh recursive `pnpm outdated --recursive --format json` inventory is retained as `outdated-direct-clean.json` and `outdated-summary.json`: 101 package-name entries differ from latest tags (63 have the same major number, 38 differ). Same major alone is not a compatibility guarantee, especially 0.x and the native SDK matrix. This pass does not claim the entire repository is latest.

Remaining work includes staged compatible UI/tooling updates and explicit major migrations such as Next16, Expo58, ImapFlow2, React19 across the web stack, and other library majors. Recharts2 is a deprecated line. Review application API changes and coordinated native peers before adopting those releases. ImapFlow1.7.8 and Mailparser3.14.2 remain the tested mailbox contract here; live OAuth/mailbox acceptance is not implied.

The same four native peer warnings remain: worklets versus Expo core's range, React Native CLI's metro-config peer, and native React/types versus root React DOM/types. They were not suppressed. Native config/type/unit/export checks are local evidence, not signed device/store acceptance.

## Verification

All installation commands used pnpm 10.34.5, official npm registry, `--ignore-scripts`, and task-local store/cache. Baseline was installed offline/frozen; updated vetted packages were acquired with install scripts disabled and the final graph installed frozen. No package lifecycle scripts or global installation/settings changes were enabled. Explicit project build/test scripts were run separately. Node was 24.16.0.

Provider/database credentials were removed from test/build shells. The 77 Zod/domain tests additionally used the existing network-blocking preload and preserved GUID/UTF-16 behavior. No disposable or persistent database was used.

Completed:
- Baseline installed exploit/compatibility fixtures: 17/17.
- Full `pnpm verify:hardening:phase39`: source scan, raw-high/critical policy, deployment scope and SBOM pass; 31 script tests plus 20 API/preflight tests pass, zero failures/skips.
- Root `pnpm typecheck`, `pnpm lint`, and `pnpm build:production`: pass.
- Zod/domain/customer workspace DB-free tests: 77/77, zero skipped.
- Native units: 8/8; config validation: pass.
- Offline Android and iOS Expo export: pass, real bundles emitted with maintained Metro.

Exact command receipts and final aggregate evidence are recorded in the final evidence receipt. Production runtime, browser, live mailbox, database, signed device and deployed acceptance were not run in this dependency pass. Existing module/SQL/browser evidence from the source candidate is historical, not rerun evidence for this new graph.

## Staged next-work plan (not yet implemented)

Freeze this security checkpoint before widening dependency changes. The inventory is ongoing work, not a completion claim. Each batch should start from the frozen candidate, preserve install-script restrictions, rerun the raw audit, and stop rather than suppress a new failure.

1. **Low-risk maintenance candidates first:** Prettier 3.9.10, tsx 4.23.15, @types/qrcode 1.5.6, @types/ws 8.18.2, @types/pg 8.23.1, PostCSS 8.5.32 and small Radix patches. Review package release notes and engines, then strict source/test types, zero-warning lint and production build. These are candidates for a safe batch, not compatibility already proven.
2. **Web interaction batch:** coordinate the Radix minor suite, react-query 5.107.1, react-hook-form 7.91.0, input-otp 1.5.0 and wouter 3.13.0. Test accessible dialogs/menus/selects, form validation, interrupted navigation, retry/cache state and desktop/mobile workflow components before acceptance.
3. **Server maintenance batch:** Fastify cookie 11.1.5/websocket 11.3.7, Express 5.3.0, ws 8.22.2, pg 8.23.1 and pino-pretty 13.2.0. Preserve cookie/SSO/tenant boundaries and websocket authorization; use offline/injection checks first. pg database behavior requires an explicitly disposable PostgreSQL fixture, not the user's persistent database. Resolve @fastify/cors major10 versus11 by workspace rather than blindly replacing every copy.
4. **Tooling batch:** pair ESLint 10.14.0 with typescript-eslint 8.72.2 and confirm supported TypeScript/Node engines. These updates do not fix minimatch's moderate advisory. Playwright 1.65.0 and axe 4.14.0 require matching official browser assets and fresh browser/component checks. Do not assume existing Chromium matches a new Playwright version. Native bufferutil needs its own scripts-disabled binary/runtime assessment.
5. **Native maintenance and peer alignment:** keep SDK57 and React Native 0.86 together while reviewing matching Expo module patches, safe-area/screens and the four known peer warnings. Match Capacitor core/android/browser/status-bar as a set; CLI7 to8 is separate. SDK58/React Native0.88/async-storage3 are a coordinated migration with engine requirements (Expo58 declares Node ^22.13, ^24.3, ^26 or >=27), native rebuild, logout/refresh/offline tests, both bundle exports and device acceptance. Do not solve this by forcing arbitrary transitive majors.
6. **Provider and data contracts:** ImapFlow2, OpenAI7, Stripe23 and Twilio6 require adapter/API/engine review, synthetic fixtures and retained sandbox boundaries. Live provider calls, billing, outbound messages or OAuth changes are not authorized by a dependency update alone. Drizzle0.45.4/kit0.31.11 are 0.x compatibility work; inspect schema/migration SQL without executing it against persistent data.
7. **Substantial web/build migrations:** Next16/React19/ReactDOM19/types as a coordinated set; Tailwind4/merge3, Vite8/plugin-react6, TypeScript7/esbuild0.28, Recharts3, DayPicker10, resizable-panels4, Framer14, date-fns4 and Lucide1 each need migration-specific UI/contract coverage. Recharts2's deprecated status makes its scoped migration worthwhile after the checkpoint. Align Node types to the chosen supported deployment runtime rather than installing the newest types unconditionally. Replit 0.x tooling changes need provider/deployment-contract review without changing provider settings.

An upstream adoption check for glob14 and minimatch11 remains a separate small follow-up. Neither moderate is hidden in the meantime.
