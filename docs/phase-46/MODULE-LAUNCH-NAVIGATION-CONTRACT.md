# Phase 46 module launch navigation contract

Status: source/local accepted on 2026-08-15. Public deployment and deployed authenticated verification were not authorized and remain open.

## Contract

OperatorOS module navigation is browser-native by default:

1. A primary module action is a real anchor to the canonical module host and has no `target` or `rel` attribute. An ordinary click therefore replaces the current document and creates a usable Back history entry.
2. The browser owns Ctrl/Cmd-click, Shift-click, middle-click, keyboard activation, context-menu actions, and link-address discovery. OperatorOS does not intercept these web gestures.
3. A separately labelled `Open <module> in a new tab` action may set `target="_blank"` only with `rel="noopener noreferrer"`.
4. Programmatic web fallback is limited to `window.location.assign`. It is not the primary card/catalog path.
5. Capacitor native primary activation remains a deliberate exception: it is intercepted only for an unmodified primary activation and opens the system browser through Capacitor Browser.
6. Stripe Checkout and external document/preview URLs use `openExternalDocument`; that external-document primitive is not a module launcher.
7. Launch telemetry and recent-app tracking may run synchronously in the anchor click handler, but must not call `preventDefault` on web or block navigation.

The canonical host-first SSO contract is unchanged: a module host without a local host-only session redirects to the exact auth client/callback and returns with opaque single-use code, state, nonce, and PKCE S256 binding. No bearer token, credential, or tenant authority is placed in the URL.

## Active launch matrix

The browser acceptance derives this list from `config/operatoros-module-registry.json`; a missing shell selector or any count other than the twelve enabled child modules fails before the test starts.

| Module | Canonical destination | Ordinary activation | Intentional additional page |
| --- | --- | --- | --- |
| TradeFlowKit | `https://tradeflowkit.operatoros.net` | current page | browser modifier/context menu or explicit control |
| TorqueShed | `https://torqueshed.operatoros.net` | current page | browser modifier/context menu or explicit control |
| TechDeck | `https://techdeck.operatoros.net` | current page | browser modifier/context menu or explicit control |
| PulseDesk | `https://pulsedesk.operatoros.net` | current page | browser modifier/context menu or explicit control |
| FaultlineLab | `https://faultlinelab.operatoros.net` | current page | browser modifier/context menu or explicit control |
| Ninja Pool Hall | `https://ninja-pool-hall.operatoros.net` | current page | browser modifier/context menu or explicit control |
| BrandForgeOS | `https://brandforgeos.operatoros.net` | current page | browser modifier/context menu or explicit control |
| SnapProofOS | `https://snapproofos.operatoros.net` | current page | browser modifier/context menu or explicit control |
| StudyForge AI | `https://studyforge-ai.operatoros.net` | current page | browser modifier/context menu or explicit control |
| Ninja Launch Kit | `https://ninjalaunchkit.operatoros.net` | current page | browser modifier/context menu or explicit control |
| CallCommand AI | `https://callcommand-ai.operatoros.net` | current page | browser modifier/context menu or explicit control |
| Ninjamation | `https://ninjamation.operatoros.net` | current page | browser modifier/context menu or explicit control |

OutCall remains source-recovery locked and disabled in the deployment registry. Its route definitions remain intact, but it is not counted as an active Phase 46 journey.

## Migrated entry points

| Surface | Result |
| --- | --- |
| My Apps primary cards | shared same-tab anchor; separately labelled icon control opens a new tab |
| My Apps recent apps | shared same-tab anchor; recent tracking retained |
| Apps catalog | shared same-tab anchor; separately labelled new-tab action retained |
| Ecosystem catalog | shared same-tab anchor |
| Generic `/app/apps/[slug]` fallback | shared same-tab anchor to canonical host |
| Shared module `ShellChrome` launcher | shared same-tab anchor |
| Programmatic SSO fallback | web `location.assign`; native Capacitor Browser |
| Tenant billing Checkout | intentionally external via `openExternalDocument` |

Legacy ordinary-launch uses of `window.open(..., '_blank')`, `openExternal`, popup waits, and fallback `target="_blank"` were removed from the module surfaces above. Remaining `_blank` links are intentionally labelled public documents, previews, privacy notices, portfolio URLs, or the explicit module secondary action.

## Browser evidence

Environment: compiled production API/web artifacts, local HTTPS exact-host proxy, isolated disposable PostgreSQL database, Chromium, Stripe and AI providers disabled.

The focused scenario proves:

- one central credential entry and no repeat login POST;
- exactly one browser page before and after every ordinary module launch;
- every active module reaches its real shell on its canonical host;
- exactly one registered `/sso` callback per first module launch with only `code` and `state` query fields;
- no credential-bearing URL fields or browser credential storage;
- Back returns to My Apps after every ordinary module launch;
- Ctrl-click and middle-click each produce one additional page;
- the explicit new-tab action produces one additional page and `window.opener === null`;
- global logout prevents reuse of the final module journey.

Exact commands and results:

```powershell
corepack pnpm --dir apps/api exec tsx --test test/command-center-launch-flow-static.test.ts test/module-launch-navigation-contract.test.ts
# PASS 6/6

corepack pnpm typecheck
# PASS: API, runner gateway, web, and TorqueShed native

$env:INTERNAL_API_URL='http://127.0.0.1:5001'
corepack pnpm build:production
# PASS: release metadata, typecheck, SDK/API/runner, and Next production build

$env:DATABASE_URL='<isolated disposable PostgreSQL URL>'
$env:PARITY_DATABASE_IS_DISPOSABLE='1'
$env:APP_ENV='test'; $env:NODE_ENV='test'
corepack pnpm test:phase46:same-tab
# PASS 1/1 in 27.6 seconds
```

The first successful run generated Playwright evidence for the My Apps catalog plus same-tab TradeFlowKit at 390 px, TorqueShed at 768 px, and TechDeck at 1440 px. The full trace and video remain in the ignored local `apps/web/test-results/playwright` evidence directory.

## Native behavior

`ModuleLaunchLink` detects Capacitor only for an unmodified primary activation, prevents the web navigation, and delegates to `navigateToModuleProgrammatically`, which uses the Capacitor Browser plugin. Modifier behavior is left untouched in web runtimes. External documents also use Capacitor Browser, while their web equivalent deliberately opens an isolated additional page.

## Release boundary

The source, production build, isolated database, and local exact-host browser behavior are accepted. Phase 46 does not prove the public deployment, edge configuration, deployed SSO, or a physical native-device handoff. Those remain explicit release gates.
