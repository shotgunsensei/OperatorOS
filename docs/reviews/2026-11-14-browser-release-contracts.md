# Hosted release browser contract repairs, 2026-11-14

Final local visual status: PASS. The final source passed all 39 viewport comparisons without updating snapshots at the original 0.005 threshold, with retained loopback-only network proof. Browser evidence is an earlier complete 117/119 run followed by both corrected scenarios passing on the final rebuild, not a fresh unified 119-test pass. Hosted exact-head release verification remains required.

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

## Follow-up a348d99 hosted evidence

Run 43626320490, artifact 14127836037, archive SHA256 400f6e8a17d0d08c38a9419d42d2b7f390ed6f16d69e3f8c4c7e19f30344bb69. Authenticated GitHub CLI retrieved the 630 MB archive after the connector's 512 MiB transport cap; no permission denial occurred.

### Five browser failures

- Cross-module receipt restoration now follows the real read-only Check status action, verifies the original run ID, and asserts zero repeated creation POSTs across reload.
- PulseDesk scopes its sample connection form independently from the live-provider form. No provider call is introduced.
- TradeFlowKit uses the exact Document customer combobox rather than matching both search and select controls, at both widths.
- FieldNode's launcher opens the public introduction. Local SSO follows Manage my FieldNodes and requires exact callback/cookies plus 503 FIELDNODE_GATEWAY_UNCONFIGURED; global revocation uses the last actual protected workspace.
- Deployed Phase 17 separately verifies anonymous public introduction, PKCE S256, state, nonce, exact callback, host-only session, and documented unavailable management. It requires explicit E2E_PHASE17_FIELDNODE_GATEWAY_STATE=unconfigured and writes a service-readiness annotation/JSON with gatewayReady:false and deviceManagementAccepted:false. Unexpected configured service fails this scenario and needs appliance acceptance. Existing tenant/OutCall denial checks remain intact. No production tests were run.

### Reviewed desktop/tablet baselines

Exactly 20 Linux baseline updates remain: BrandForge tablet; Faultline desktop/tablet; Deploy Ops desktop/tablet; Pool Hall desktop/tablet; Script Ops desktop/tablet; OutCall desktop/tablet; PulseDesk tablet; SnapProof desktop/tablet; StudyForge desktop/tablet; TechDeck tablet; TorqueShed desktop/tablet; TradeFlowKit tablet. Each expected/actual pair was individually viewed and traced to source. File hashes, reviewer and individual rationale are in visual-baseline-approvals.json.

Source trace: beaaf1db adds embedded workspace spacing/typography, Faultline simulated-case hero, Pool Hall 3/2/1-column mode cards, shared mobile journey targets, Pulse warning icon and Torque privacy notice. fb35551c adds section filtering. OutCall activation 27589d3b intentionally replaces its unavailable gate with the explicit Readiness and safety workspace; provider-disabled status remains visible. TradeFlowKit removes decorative icons and clears settled workday minimum height. Screenshot threshold 0.005 and hard accessibility assertions are unchanged.

### Mobile gate and real layout correction

Review rejected newly flowed BrandForge/StudyForge headings obstructed by fixed Help. ContactLink now takes opt-in moduleMobileFooter on actual InternalAppPage and fallback ModuleState. At widths <= 720 px the Help action stays in normal flow below content with 44 px minimum height and 92 px bottom clearance for fixed navigation. Auth/admin/invite and desktop/tablet behavior remain unchanged.

All initial mobile copies were withdrawn before fresh Linux capture and individual review. The final 13 reviewed mobile replacements are now adopted; source and image hashes are recorded in 2026-11-14-linux-mobile-capture.json. Visual tests now assert static positioning, a 44 by 44 px target and Help below visible module headings. Static Help contracts 6/6, SSO static matrix 3/3 and scoped lint passed. The parent also verified a fresh production build and all five focused browser scenarios against a clean disposable database.

The Linux capture caught a geometry false positive in PulseDesk: a mounted heading inside a closed native disclosure reported bottom 2123.97 px although checkVisibility() was false. Help was at 1615.47 px with 44 by 82 px bounds, below all three painted headings (last bottom 770.47 px). The regression now uses actual painted visibility and reports obstructed heading text/bounds; static positioning and target-size requirements remain unchanged. No source layout bypass was added.

TechDeck had a legacy mobile rule from e8930f50 hiding every floating Help link. It now excludes the explicit in-flow module footer while retaining the original overlay suppression elsewhere. This resolves the zero-height link and empty padded footer without relaxing the visible 44 px or non-overlap assertions.

### Final Linux capture and adoption

Official Playwright 1.61.1 Noble image with Linux Chromium 149.0.7827.55 revision 1228 rendered the same production-built working tree using explicit loopback visual routes. Retained-trace verification of every response destination is still pending. Final candidate capture passed all 39 viewports, accessibility, geometry, console, page-error and network checks (one test, zero skips, 2.0 minutes). Candidate generation used update-snapshots only in an external candidate directory.

All 13 mobile images were individually reviewed; final changed CallCommand, OutCall and TechDeck images were re-viewed. Every copied byte matches the final provenance manifest, and every captured source hash matches the current source. No Windows baselines changed. The original screenshot threshold remains 0.005. Strict no-update comparison was pending at adoption; the final result below records its separate pass.

Final focused static rerun: 51 tests passed, zero failures, skips or cancellations. Web TypeScript, scoped ESLint and the 13-module visual-contract verifier also passed before strict screenshot comparison.

Capture provenance qualification: the final candidate-generation trace was not retained, so passing request/response-error assertions alone do not prove destination isolation. Candidate bytes remain visually reviewed, but network-verification status is pending. A safe explicit-loopback strict comparison with retained destination evidence is required before release sign-off.

### Loading layout reservation

The full native browser sweep exposed mobile CLS after introducing the in-flow footer: InternalAppContent temporarily renders a short Checking tool access state between the full-height auth loader and the actual module. A mobile-only route wrapper now reserves at least 100dvh throughout that transition, keeping Help below the first viewport instead of moving it through visible content. Mature module layouts exceed that minimum, so their final geometry should be unchanged. The existing CLS budget remains intact; a fresh build and performance rerun are required.

The complete native sweep passed 117 of 119 scenarios before the loading-reservation correction. Its other failure was the old TechDeck resolution assertion requiring hidden floating Help. That assertion now requires visible static Help, a 44 by 44 px target and bounds below the resolution workspace. All evidence import, permission, download and audit checks remain unchanged. Focused performance and resolution reruns are required.

Final focused rerun after rebuilding the loading reservation: Phase 39 accessibility/performance and TechDeck resolution both passed (2 tests, 1.3 minutes). Evidence is a complete earlier run with 117 passes and 2 failures, followed by both corrected cases passing on the final build. This is not a claim of a fresh unified 119-test pass. Strict Linux visual comparison and retained network-isolation proof were pending at that point; both are now verified below.

### Final strict comparison

PASS: original 39 viewport comparisons, one test, zero skips, 2.4 minutes, exit 0. Snapshot updates were disabled and the pixel-difference threshold stayed 0.005. Source hashes match the final working tree, including the loading reservation; all approved baseline bytes were rechecked against their manifest hashes.

Retained trace SHA256 b8ae6244587d1e891396a6a13ba5f5c9a07c2b5eb0f25d6eafd34db5bb2f865c contains 1,709 network entries, all for 127.0.0.1. All 346 API response request IDs matched the saved local runtime log. The deny-default transport recorded 395 connections, only to 127.0.0.1:443, with zero denied or nonloopback requests. A unique local proof request was also matched to the runtime. Browser service workers and all original assertions remained enabled. Temporary services were stopped afterward.

This final strict run resolves current visual/network verification. The earlier candidate-generation trace gap remains a historical limitation; the unrelated remote canonical-host attempt is not counted as acceptance evidence. Detailed sanitized source hashes and audit counts are stored with the capture provenance. No fresh unified 119-test or hosted release pass is claimed.
