# Phase 48 shared module application shell specification

Status: source/local accepted on 2026-08-15. TradeFlowKit adoption is compiled and visually accepted; later module migrations remain separate phases.

## Purpose and boundary

`ModuleApplicationShell` extracts the route-oriented structural qualities proven by TradeFlowKit without extracting TradeFlowKit business logic or forcing its visual identity onto another product. The shell owns application framing, navigation, context, route transitions, and shared states. A module page continues to own its API calls, data boundaries, workflows, permissions, terminology, and product-specific state components.

The shared structure provides:

- an ecosystem/global header slot;
- a module brand slot and organization/access context chips;
- grouped desktop route navigation;
- an accessible mobile drawer by default, with an intentional bottom-navigation mode for TradeFlowKit compatibility;
- route-derived active state and breadcrumbs;
- page eyebrow, title, subtitle, and primary-action slots;
- typed settings/help/My Apps utility actions or a product-specific top-action slot;
- loading, empty, error/retry, forbidden, and provider-disabled states;
- a skip link, focus target, Escape-close drawer behavior, and route-change focus restoration;
- instance-scoped theme variables, reduced motion, accessible focus, and responsive reflow.

The shell is not an authorization substitute. Its capability/role manifest makes inaccessible route state explicit in the UI, while the existing server session, tenant, entitlement, and route/API authorization remain authoritative.

## Theme-token contract

`ModuleThemeTokens` is defined in `apps/web/src/components/module-application-shell/contracts.ts`.

| Token group | Required values |
| --- | --- |
| Identity | stable `id`, `colorScheme` |
| Surfaces | background, panel, raised panel, border |
| Content | text, muted text |
| Actions | primary, secondary, accent, danger, success, focus |
| Shape | small, medium, and large radius |
| Density | compact, comfortable, or spacious |
| Typography | body, heading, optional accent stack |
| Imagery | optional hero, background, and overlay hooks |

`moduleThemeStyle` maps one theme object to CSS custom properties on that shell instance. No theme mutates `:root`; one module therefore cannot overwrite another module's palette. The compile-only `Tidal Relay` harness uses dark cyan, violet, spacious density, and serif headings, and imports no TradeFlowKit token. TradeFlowKit retains its approved orange/navy/light contract in `TradeFlowKitShell.contract.ts` and its existing complete light/dark CSS bridge.

## Route-manifest contract

Each `ModuleRouteManifestItem` declares:

- stable route ID;
- canonical URL path;
- desktop label and optional mobile label;
- icon;
- breadcrumb label override;
- exact, prefix, or alias-path active matching;
- optional required capability and roles;
- optional badge and ready/attention/disabled status.

Manifest helpers normalize query/hash/trailing slash differences, match detail routes without hidden tab state, resolve the current breadcrumb/active entry, and evaluate capability plus role requirements. Links remain ordinary Next links, preserving URL discovery, browser history, refresh, Back, Forward, and keyboard activation.

TradeFlowKit's manifest covers Dashboard, Leads, Customers, Jobs/tasks, Quotes, Invoices/payments, Analytics, Settings, and Trash. Its product page resolver and business components remain in `TradeFlowKitShell.tsx`; the shared shell does not load their APIs.

## TradeFlowKit extraction

The approved TradeFlowKit DOM roles and product CSS classes are passed into the shared component as a structural class map. This keeps:

- orange primary actions and navy hierarchy;
- light/dark/system theme toggle behavior;
- the current logo and service-management purpose;
- organization and access presentation;
- existing global search, protection, notification, settings, and theme actions;
- desktop side rail and the approved four-item mobile bottom navigation;
- all lead, customer, job, quote, invoice, payment, analytics, directory, trash, and settings business components;
- the existing `tradeflowkit-overview` focus/deep-link target and test IDs.

The shared default remains a mobile drawer. TradeFlowKit deliberately selects bottom mode so extraction does not redesign the approved mobile product.

## Visual and interaction evidence

The pre-extraction baselines remain immutable:

- [Before: desktop](../../apps/web/e2e/visual-baselines/tradeflowkit-desktop.png)
- [Before: tablet](../../apps/web/e2e/visual-baselines/tradeflowkit-tablet.png)
- [Before: mobile](../../apps/web/e2e/visual-baselines/tradeflowkit-mobile.png)

The compiled post-extraction captures are:

- [After: desktop](screenshots/tradeflowkit-after-desktop.png)
- [After: tablet](screenshots/tradeflowkit-after-tablet.png)
- [After: mobile](screenshots/tradeflowkit-after-mobile.png)

Playwright compared every after image to its matching before baseline with `maxDiffPixelRatio: 0.005`; all three passed. The same pass also found zero WCAG 2 A/AA and 2.2 AA violations, no unnamed visible controls, no horizontal overflow, no browser console/page/request failures, and correct loading completion.

The first refactor comparison caught a mobile-only drawer control appearing in TradeFlowKit's bottom-nav mode (4% pixel difference and a 4 px page-height shift). The final implementation omits the drawer control entirely in bottom mode; the original 0.5% visual tolerance then passed without updating any baseline.

## Verification

Environment: compiled production API/web artifacts, isolated disposable PostgreSQL 16, local HTTPS gateway, Chromium, test identity and organization, providers disabled.

```powershell
corepack pnpm --dir apps/api exec tsx --test test/module-application-shell-contract.test.ts
# PASS 3/3: matching/access, theme isolation, structural ownership/harness

corepack pnpm --dir apps/web typecheck
# PASS

$env:DATABASE_URL='<isolated disposable PostgreSQL URL>'
$env:PARITY_DATABASE_IS_DISPOSABLE='1'
corepack pnpm test:phase48:module-shell
# PASS 1/1 across desktop, tablet, and mobile visual/accessibility contracts
```

The focused browser gate additionally activates Leads with the keyboard, proves the route-aware sidebar and breadcrumb, verifies focus moves to the route heading, reloads the deep link, and returns with browser Back to Dashboard.

## Adoption rules

1. Declare a unique theme and typed route manifest before mounting the shell.
2. Keep product APIs and workflows in focused route/page components.
3. Use canonical paths; do not introduce top-level tab state as information architecture.
4. Declare capability/role metadata, but retain server-side authorization.
5. Choose the default mobile drawer unless an already-approved product interaction requires another explicit mode.
6. Add that module's visual baselines before migration; never update them merely to make an unexplained diff green.
7. Preserve global My Apps/settings/help/return actions through the global header slot or typed utilities.

## Release boundary

This phase migrates only TradeFlowKit plus an unmounted compile-time theme harness. It does not migrate TorqueShed or the other modules, change database state, deploy a release, or claim deployed exact-host acceptance. Those are owned by Phases 49–52 and the final human release gates.
