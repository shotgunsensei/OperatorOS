# Phase 49 TorqueShed route migration report

Status: source/local accepted on 2026-08-15. Compiled exact-host behavior is accepted against disposable PostgreSQL and explicit test-provider contracts. Deployment, live Stripe, live AI, and production data operations remain separate human gates.

## Outcome

TorqueShed is now a URL-authoritative route application using the Phase 48 `ModuleApplicationShell`. The former internal `Tab` state, tab buttons, and path-to-tab synchronization have been removed. Browser history, refresh, direct entry, active navigation, record routes, route headings, and responsive navigation now derive from the URL.

The shared shell retains TorqueShed's dark garage/amber identity through the instance-scoped `torqueshed-dark-garage-amber` theme. It exposes the active OperatorOS organization and access role, My Apps, OperatorOS-owned profile/security, help, a route breadcrumb, and an authoritative available-credit chip without creating module-local identity, tenant, role, entitlement, billing, or session authority.

## Canonical route map

| Area | Canonical routes |
| --- | --- |
| Overview | `/` |
| Garage | `/garage`, `/garage/vehicles/new`, `/garage/vehicles/:vehicleId` |
| Service | `/service` |
| Builds and journal | `/builds`, `/builds/:buildId`, `/journal` |
| Diagnostics and Assist | `/diagnostics`, `/diagnostics/new`, `/diagnostics/:diagnosticId`, `/diagnostics/:diagnosticId/assist` |
| Collaboration | `/live-bays`, `/live-bays/:bayId` |
| Knowledge and network | `/templates`, `/marketplace`, `/marketplace/:listingId`, `/community` |
| Account and revenue | `/profile`, `/billing/credits` |
| System tools | `/activity`, `/search`, `/exports`, `/settings` |

The versioned route contract lives in `apps/web/src/components/module-shells/TorqueShedRoute.contract.ts`. Dynamic vehicle, build, diagnostic, Assist, live-bay, and marketplace routes are registered in the consolidated exact-host route map. Legacy links remain recoverable through canonical redirects:

| Legacy route | Canonical destination |
| --- | --- |
| `/dashboard` | `/` |
| `/vehicles` | `/garage` |
| `/vehicles/:vehicleId` | `/garage/vehicles/:vehicleId` |
| `/maintenance`, `/repairs`, `/reminders` | `/service` |
| `/build-journal` | `/journal` |
| `/live-bay` | `/live-bays` |
| `/diagnostic-templates`, `/vendors` | `/templates` |
| `/notifications` | `/activity` |

## Page and data boundaries

`TorqueShedWorkspace` resolves one route state and mounts only its matching page surface. New-vehicle and new-diagnostic forms have dedicated URLs; vehicle, build, diagnostic, Assist, live-bay, and marketplace records use durable record URLs. Search, activity/notifications, exports/reports, settings, and profile no longer share one visible tools page.

The previous workspace bootstrap made seven unrelated requests in one top-level `Promise.all`. It has been replaced by route-focused tasks with per-request application and `Promise.allSettled`. Marketplace, Community, and the route-specific utility loader use the same partial-success rule, so a category, conversation, topic, profile, notification, or settings failure does not discard unrelated successful data.

The primary route components for Marketplace, Community, Journal, Live Bays, and system utilities are loaded with route-level dynamic imports. The compiled Next output therefore separates these product surfaces instead of requiring the entire restoration bundle for the first TorqueShed page.

Observed request fan-out is now bounded by route purpose:

- settings loads its settings record plus the persistent shell credit context instead of the former seven-workspace plus four-tools request fan-out;
- Credits loads authorized vehicles and diagnostics, Assist purchase readiness, and ledger/balance context, and the browser gate proves it does not request builds, reminders, vendors, or diagnostic templates;
- Dashboard loads its metrics, vehicles, builds, diagnostics, and reminders but not templates/vendors;
- Marketplace, Community, Journal, Live Bays, and utilities own their route-local loaders.

This changes the maximum eager workspace fan-out from seven unrelated page requests to zero-to-five route-relevant requests, with larger reductions on focused system routes. The persistent balance chip intentionally remains a shell-level ledger read.

## Credits and Torque Assist boundary

`/billing/credits` is the only TorqueShed page that presents packages, creates Checkout, polls a purchase, explains provider readiness, and displays authoritative purchase and ledger history. Checkout continues to accept only an owned diagnostic session, a canonical server catalog key, and an idempotency key. Browser return identifiers remain read-only; only the existing signed provider settlement pipeline can credit the append-only ledger.

The diagnostic detail route links to `/diagnostics/:diagnosticId/assist`. Assist mounts only on that diagnostic-specific route, loads evidence/context/history independently, reserves the conservative maximum, and keeps provider/no-credit failures actionable. Its only revenue action is a link to the Credits route carrying the diagnostic selection; it no longer contains package purchase or settlement UI.

The explicit test-provider database workflow proves the canonical Roadside package is 25,000 units for `$5.00`, checkout replay is idempotent, mismatched evidence is rejected, a signed test settlement produces exactly one credit, retries do not duplicate credit/debit, provider failures consume zero, refunds/disputes remain policy-bound, and tenant boundaries remain non-enumerating. The browser route proves the same `$5.00` server catalog option is enabled in the compiled test environment. No live Stripe charge was created.

## Accessibility and responsive corrections

The exact-host route journey covers desktop and 390 px mobile behavior, drawer activation, horizontal overflow, visible-control names, reduced motion, and axe analysis on Overview, diagnostic-specific Assist, Credits, and Settings. The focused work fixed:

- an unnamed build-task input;
- unnamed trouble-code, evidence, reference-range, and attachment inputs;
- credit-stat secondary text below the WCAG AA contrast threshold;
- the floating global Contact control being outside a landmark;
- a Settings route heading-level jump.

The gate reports zero remaining violations on its sampled high-risk pages, zero post-auth console errors, and no horizontal overflow across all canonical routes.

## Visual evidence

- [Credits desktop](screenshots/torqueshed-phase49-credits-desktop.png)
- [Garage mobile drawer](screenshots/torqueshed-phase49-garage-mobile.png)

These captures come from the compiled production artifact behind the local HTTPS exact-host gateway with an authenticated disposable test tenant.

## Verification

Environment: Windows/PowerShell, isolated disposable PostgreSQL 16 on `127.0.0.1:55441`, cumulative release through v52, compiled API/Next artifacts, local HTTPS exact-host gateway, Chromium, explicit test identity/tenant, test payment adapter, no live provider traffic.

```powershell
corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 `
  test/core-module-deep-link-routing.test.ts `
  test/torque-assist-static.test.ts `
  test/torqueshed-route-migration.test.ts
# PASS 12/12

corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 `
  test/torque-assist-workflow.test.ts `
  test/torqueshed-foundation-workflow.test.ts `
  test/torqueshed-social-workflow.test.ts `
  test/torqueshed-web-api-product.test.ts
# PASS 5/5 against disposable PostgreSQL

corepack pnpm --dir apps/web typecheck
# PASS

node scripts/phase49-torqueshed-route-browser.mjs
# PASS 1/1; runner builds API/SDK/Next before exact-host acceptance
```

The browser test creates real disposable vehicle, build, diagnostic, live-bay, and marketplace records, traverses all 24 canonical collection/creation/detail routes, proves two canonical redirects, uses Back/reload, verifies active navigation, validates route-focused Credits requests, exercises the mobile drawer, and captures both screenshots.

## Release boundary

Phase 49 does not deploy OperatorOS, mutate production data, apply a live catalog, create a live Stripe charge, call a live AI provider, perform a production backup/restore, or claim public-host acceptance. State 5 still requires the exact reviewed revision on the target deployment, authenticated deployed route journeys, second-tenant denial, approved provider configuration, monitoring/reconciliation, and rollback evidence. Phases 50-52 own the remaining module migrations, cross-module acceptance, and provider/deployment gates.
