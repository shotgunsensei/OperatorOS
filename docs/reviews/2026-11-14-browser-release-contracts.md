# Hosted release browser contract repairs, 2026-11-14

Source evidence: GitHub release run 43623221975 on 7c105891e1a870219c752d9fe1075aaba742f648. Playwright evidence artifact 14124928867 (archive SHA256 77076434c810f28ef14596fc0380243c5b3c8d795eca4e9f9980b123dd65b7ff).

## Contract repairs

- Local SSO collection now requires all fourteen enabled registry modules, including FieldNode's actual management-unavailable surface. OutCall remains subject to tenant denial, with no handoff issued. Cookie, credential, origin, PKCE and navigation assertions remain unchanged.
- Deployed acceptance uses the current real shell identifiers and includes FieldNode. This edit does not execute deployed tests or claim device management is available.
- Sidebar snapshots include the already-integrated Customer Workspace. Static customer/TorqueShed tests assert current organization/private-data language rather than removed decorative captions. FieldNode's real-component VM fixture binds the actual navigation helper and stylesheet class names without substituting component behavior.

## Reviewed Linux desktop baselines

Expected and actual full-page PNGs were visually compared, and differences were traced to existing integrated source. Only two Linux desktop entries were updated; all other platform/viewport images and approval identities remain unchanged.

- BrandForgeOS: 1440x1467 to 1440x1290. Shared section search added. Embedded workspace now removes duplicate inner padding, background and minimum height; actions use the previously implemented higher-contrast colors. Current image preserves tenant/account context, entitlement context, navigation, first-campaign guidance and workspace cards without visible clipping.
- TradeFlowKit: 1440x1162 to 1440x1159. Shared section search added, duplicate decorative shield/bell icons removed, workflow spacing reflects current source. Core dashboard content, tenant/role labels, account links and first-action controls remain visible.

Reviewer: Codex visual QA. The exact artifact pixels and individual SHA256 hashes are bound in docs/parity/visual-baseline-approvals.json. Screenshot tolerance remains 0.005; accessibility assertions are unchanged. This is not a review or approval of uncaptured responsive or Windows differences.

## Fresh verification

- Five DB-free suites: 44/44 passed, zero failures/skips/cancelled/todo.
- Scoped ESLint for all eight modified test files: passed, zero warnings after the frozen offline dependency installation.
- Local SSO test discovery (`--list --reporter=list`) passes and lists 15 tests, including all-module launch and active OutCall denial. Discovery is not an E2E pass. The default fail-on-skipped release reporter remains unchanged.
- Visual-contract verifier: 13 visual modules, zero failures/issues.
- `git diff --check`: passed (line-ending normalization warnings only).
- Exact-host E2E, full visual comparison and responsive acceptance require the next fully provisioned release run. No production/provider calls, baseline threshold changes or test skips were introduced.

Screenshot comparisons now use soft assertions only so a single hosted run captures every viewport mismatch. The same pixel threshold still records test failures and fails the release; accessibility, navigation and data assertions remain hard failures.
