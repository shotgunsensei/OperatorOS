# Browser release contract repairs, 2026-11-14

## Final verification

- Final-source Linux visual comparison: PASS, 39 viewports, one test, zero skips, 2.4 minutes, exit 0. No snapshot updates; original pixel threshold 0.005, accessibility, geometry, console and network-error assertions retained.
- Native browser evidence: complete run passed 117 of 119 tests. After correcting both failures and rebuilding, Phase 39 performance/accessibility and TechDeck resolution passed (2 tests, 1.3 minutes). This is not a fresh unified 119-test pass.
- Focused static contracts passed. Final build, TypeScript, lint and 13-module visual-contract verifier passed. Hosted exact-head release verification remains required.

## Contract corrections

- All-module SSO includes 14 enabled modules and their real shell identifiers. FieldNode launches its public introduction; protected management uses exact-host SSO and explicitly returns the unconfigured gateway response in the disposable harness. Cookie, credential, PKCE, origin and tenant protections remain intact. Global revocation targets an actual protected workspace.
- Deployed Phase 17 separately checks anonymous introduction, PKCE S256, state, nonce, exact callback and host-only session. Accepting the documented unavailable gateway requires E2E_PHASE17_FIELDNODE_GATEWAY_STATE=unconfigured and emits service-readiness evidence with gatewayReady:false and deviceManagementAccepted:false. Unexpected configured service requires appliance acceptance. No deployed tests were run.
- Cross-module receipt restoration follows Check status, validates the original run and asserts zero repeat creation POSTs. PulseDesk selects the sample form rather than its live-provider form. TradeFlowKit selects the exact customer combobox rather than its search field.
- Sidebar snapshots include Customer Workspace. Static copy contracts follow current organization/privacy text. FieldNode's VM fixture binds actual navigation helpers and stylesheet classes without replacing component behavior.
- Screenshot assertions are soft only to collect all mismatches; they still fail the release at the unchanged threshold. Other assertions remain hard.

## Real mobile layout repairs

The fixed Help pill obscured newly flowed BrandForge and StudyForge headings. The opt-in moduleMobileFooter now places Help after content at widths <= 720 px, with a 44 px target and 92 px bottom clearance. Other surfaces and larger viewports retain their existing behavior. TechDeck's legacy overlay-hiding rule excludes this in-flow footer.

The module route reserves at least 100dvh during its short access-loading transition, preventing the footer from entering and then leaving the initial viewport. The CLS budget is unchanged. TechDeck resolution now requires visible static Help below the actual workspace rather than the old hidden-overlay behavior.

Mobile geometry checks use painted heading visibility: closed native disclosures can retain nonzero DOM rectangles even when not rendered. Checks still require static positioning, 44 by 44 px targets and no overlap, with offending heading bounds in failures.

## Reviewed baseline changes

Exactly 33 Linux replacements: 20 desktop/tablet and all 13 mobile images. Every expected/actual pair was individually reviewed; changed final CallCommand, OutCall and TechDeck captures were re-viewed. Every approved byte hash was checked before handoff. No Windows baselines changed.

Desktop/tablet scope: BrandForge tablet; Faultline, Deploy Ops, Pool Hall, Script Ops, OutCall, SnapProof, StudyForge and TorqueShed desktop/tablet; PulseDesk, TechDeck and TradeFlowKit tablet.

Integrated source explains the intended changes: beaaf1db introduces embedded-workspace spacing, typography, Faultline's simulated-case hero, Pool Hall responsive cards, mobile journey targets and privacy copy; fb35551c adds section filtering. OutCall activation 27589d3b replaces the old unavailable gate with a readiness workspace that still explicitly discloses disconnected calling. TradeFlowKit removes decorative icons and excess settled-workday height. Final mobile images also include the unobstructed Help footer.

Per-image reviewers, reasons and hashes are in docs/parity/visual-baseline-approvals.json. Source and browser provenance are in docs/reviews/2026-11-14-linux-mobile-capture.json.

## Evidence provenance and limits

Hosted source evidence:
- Run 43623221975 on 7c105891, artifact 14124928867, archive SHA256 77076434c810f28ef14596fc0380243c5b3c8d795eca4e9f9980b123dd65b7ff.
- Run 43626320490 on a348d99, artifact 14127836037, archive SHA256 400f6e8a17d0d08c38a9419d42d2b7f390ed6f16d69e3f8c4c7e19f30344bb69.

Final strict comparison used official Playwright 1.61.1 Noble with Linux Chromium 149.0.7827.55 revision 1228 against the final production-built source. Retained trace SHA256 b8ae6244587d1e891396a6a13ba5f5c9a07c2b5eb0f25d6eafd34db5bb2f865c records 1,709 network entries, all 127.0.0.1. All 346 API response request IDs match the local runtime. Deny-default transport recorded 395 connections only to 127.0.0.1:443, zero denied/nonloopback requests, and a unique proof request correlated to the runtime. Service workers stayed enabled; temporary services were cleaned up. Current source hashes match the strict-run manifest.

Earlier candidate generation used an external update-snapshots directory and lacked a retained final network trace; it is not retrospectively counted as isolation proof. The unrelated remote canonical-host attempt is not acceptance evidence. The final explicit-loopback strict run supplies the current verified visual and network result.
