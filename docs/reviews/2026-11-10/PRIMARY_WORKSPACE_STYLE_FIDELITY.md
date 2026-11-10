# Primary workspace style fidelity review

## Outcome

No production color or layout change is justified by the reported PulseDesk crop.
The previous component fixture applied the real dark canvas but omitted the
production route shell's scoped CSS. Its near-invisible heading and squeezed
mobile search were fixture defects, not demonstrated application defects.
The fixture now loads the actual static `pulseDeskRouteCss` from
`PulseDeskShell.tsx` and applies its real `pulsedesk-module-shell` scope marker.
It fails explicitly if that stylesheet disappears or becomes interpolated.
No application, permission, identity, billing, database or dependency bytes change.

## Source and composition

Runtime source is 908126aef8ce941ce29255620f46019e8b79b112. Final primary-read
base is 2fbaaabc5f87b6755d7373117d8ff3881006577b, tree
abdc0899fc2b787f8f449b59211c083b562735a0. Its docs-only final commit is
cherry-picked here as 7f177cfc (identical base tree). Only the fixture and these
review/status notes differ from that final base.

Included: real globals.css, brand variables, local Inter/Open Sans fonts,
PULSEDESK_THEME canvas/type, actual workspace component and its embedded CSS,
and actual PulseDeskShell scoped route CSS. Trade retains its actual
TradeFlowKitShell.module.css theme and real operations component.
Source Git blobs:
- PulseDeskShell.tsx: 8a7676e56eb5f4b0c470a838a2e70f8287aed40d
- PulseDeskRoute.contract.ts: 9cbba015a847c8ad024f50d3a2c68a97cb00ce05
- TradeFlowKitShell.module.css: 0b37fa6ef91334f54a41231dfddb68a8f0fcab92

The real ModuleApplicationShell applies its module background/text variables and
content layout; PulseDeskShell nests the workspace directly in the requests
section with its scoped stylesheet. The fixture reproduces the route style
composition but does NOT mount authenticated ModuleApplicationShell navigation,
header, gutters or providers. These are workspace crops, not full-shell proof.

## Viewed steps and measurements

1. Original 390px Pulse crop: defective fixture. Heading #102033 on #07111b,
   calculated contrast 1.155:1. Search width58px/height40px; status129px/42px;
   priority132px/42px. Original evidence remains untouched.
2. Corrected 390px Pulse crop: readable scoped style composition. Heading
   #eaf4ff on #07111b, contrast17.088:1. Search334px/44px; both selects358px/44px.
   All controls fit; document width390px. Search -> status -> priority keyboard
   Tab progression verified. Selected filter focus is visible in the screenshot.
3. Corrected 1440px Pulse crop: readable two-column workspace. Same heading
   contrast17.088:1. Search523.594px/40px; status129px/42px; priority132px/42px.
   Document width1440px, controls inside viewport. Control foreground #eaf4ff
   on #0a1520 has calculated contrast16.549:1. Mobile minimum heights are not
   asserted for desktop. Sticky detail crop does not show the entire workflow.
4. Trade390px and1440px crops: unchanged theme, inspected. Mobile job choices
   intentionally use a horizontal overflow list per actual component CSS;
   partial next card is not evidence of inaccessible clipping. This review does
   not claim touch scrolling or complete keyboard list acceptance.

## Fresh verification

- Actual-component Chromium suite:38 passed,0 failed,0 skipped,29.0s.
  `node ../evidence/primary-workspace-contrast-nov10/check.cjs browser`
  mirrors `pnpm --dir apps/web exec playwright test --config
  playwright.primary-read-lifetimes.config.ts` using the finalized primary
  worktree's installed assets read-only; no install or server needed.
- Two omitted-route-CSS negative controls: both fail the new computed foreground
  assertion, reproducing1.155:1 and mobile58px search. Only external transformed
  fixture CSS injection was omitted. Earlier negative harness attempts pointed
  to the positive config, then passed empty content rejected by Playwright;
  neither is counted as negative proof. Final `negative.log` is the actual control.
- Focused strict TypeScript on changed test passes after resolving Playwright's
  declaration path (initial harness used its JS entry and failed resolution).
- Focused ESLint on changed test with existing config: exit0, zero warnings.
- `git diff --check` passes. No production rebuild: application bytes unchanged
  from primary-read runtime whose exact production build passed independently.

External evidence: `evidence/primary-workspace-contrast-nov10/` contains browser,
negative, type/lint receipts and new pulse/trade workspace390/1440 screenshots.
Original evidence: `evidence/primary-read-lifetimes-nov10/`; not overwritten.
Actual images were opened and inspected. Fixtures use synthetic identities/data,
blocked HTTP/API calls, blocked external browser network and no listening server.

## Remaining gates

This is not authenticated-shell, real-device, screenreader, full contrast audit,
WCAG acceptance, live API/provider/database or production acceptance. No parity
promotion. No push, deployment, credentials, user browser, shared asset changes,
or new dependency. Existing publication and production gates remain unchanged.
