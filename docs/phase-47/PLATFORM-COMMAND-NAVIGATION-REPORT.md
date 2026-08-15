# Phase 47 Platform Command navigation report

Status: source/local accepted on 2026-08-15. Production deployment and deployed super-admin acceptance remain explicit human gates.

## Result

`/app/platform/**` now has one persistent, responsive Platform Command shell. The URL is the only source of command-view state, so direct links, refresh, Back, and Forward retain the selected collection or detail record. The existing API and page authorization boundaries remain fail closed: only `platformRole=super_admin` receives the command navigation or record components.

The shell adds:

- always-visible OperatorOS and Platform Command identity;
- same-tab My Apps, OperatorOS Home, profile/security, help/support, and global sign-out actions;
- active-section context plus route-derived collection/detail breadcrumbs;
- persistent Overview, Tenants, Users, Modules, Billing Events, Pricing, Credit Catalog, Health, Audit, and SSO navigation;
- a keyboard-operable mobile drawer with 44-pixel targets and reduced-motion handling;
- non-secret environment and release identity from host classification plus the public `/api/health` release contract;
- a 403 state that confirms no platform records were loaded and provides safe My Apps/Home exits.

Credit Catalog is intentionally retained as an additive first-class section because Phase 42 made it the durable TorqueShed credit-product authority.

## Route and return map

| Command destination | Canonical path | Breadcrumb | Collection return |
| --- | --- | --- | --- |
| Overview | `/app/platform` | Platform Command | n/a |
| Tenants | `/app/platform/tenants` | Platform Command / Tenants | n/a |
| Tenant detail | `/app/platform/tenants/:id` | Platform Command / Tenants / `:id` | Back to tenants |
| Users | `/app/platform/users` | Platform Command / Users | n/a |
| User detail | `/app/platform/users/:id` | Platform Command / Users / `:id` | Back |
| Modules | `/app/platform/modules` | Platform Command / Modules | n/a |
| Module detail | `/app/platform/modules/:slug` | Platform Command / Modules / `:slug` | Back |
| Billing Events | `/app/platform/billing` | Platform Command / Billing Events | n/a |
| Pricing | `/app/platform/pricing` | Platform Command / Pricing | n/a |
| Credit Catalog | `/app/platform/credit-catalog` | Platform Command / Credit Catalog | n/a |
| Health | `/app/platform/health` | Platform Command / Health | n/a |
| Audit | `/app/platform/audit` | Platform Command / Audit | n/a |
| SSO | `/app/platform/sso` | Platform Command / SSO | n/a |

All collection/detail transitions use Next links or `router.push`. Global destinations are real same-tab anchors. There is no `_blank` command link. On the exact app host, source-compatible `/app` canonicalizes to the workspace root `/`; the browser page count remains unchanged.

## Authorization and information boundary

The route waits for authenticated identity before rendering command content. A signed-in non-super-admin receives the shared global header and a 403 panel, but receives no command sidebar, tenant/user/module component, or record identifier. The backend `requireSuperAdmin` pre-handler remains authoritative for `/api/platform/**`; browser acceptance separately confirms `/api/platform/stats` returns 403 to the ordinary user without tenant identifiers or collection payloads.

Global sign-out calls the server-authoritative revoke-everywhere endpoint. A failed revocation leaves the session visibly active and reports an actionable error instead of claiming success.

## Accessibility and responsive evidence

The shell includes a skip link, labelled global and command navigation landmarks, `aria-current` for the active section and breadcrumb, an `aria-controls`/`aria-expanded` drawer control, visible focus treatment from the shared design system, and mobile targets of at least 44 pixels. The existing user-detail subscription and role selects gained explicit accessible names after the focused axe run identified them.

Compiled Chromium acceptance checks the drawer's actual on-screen bounding box after its transition, rather than treating an off-canvas element as usable merely because it exists in the accessibility tree.

- [Desktop user-detail shell](screenshots/platform-command-desktop.png)
- [390 px mobile drawer](screenshots/platform-command-mobile-drawer.png)

## Verification

Environment: compiled production API/web artifacts, local HTTPS exact-host gateway, isolated disposable PostgreSQL 16 database, Chromium, providers disabled.

```powershell
corepack pnpm --dir apps/api exec tsx --test test/platform-command-navigation-contract.test.ts
# PASS 2/2

corepack pnpm --dir apps/web typecheck
# PASS

$env:DATABASE_URL='<isolated disposable PostgreSQL URL>'
$env:PARITY_DATABASE_IS_DISPOSABLE='1'
$env:SESSION_SECRET='<non-production test secret>'
$env:SSO_CODE_ENCRYPTION_SECRET='<non-production test secret>'
corepack pnpm test:phase47:platform-command
# PASS: API build, SDK build, Next production build, Playwright 2/2
```

The browser gate covers every collection route, tenant/module/user detail routes, Back, Forward-history return, refresh, breadcrumbs, My Apps current-tab navigation and page count, desktop axe critical/serious violations, 390 px keyboard drawer behavior and horizontal overflow, release/environment labels, plus page/API denial for an ordinary authenticated user.

## Release boundary

No production data, identity, edge route, provider, or deployment was changed. Before public acceptance, deploy the reviewed commit, confirm its release identifier, and rerun the authenticated super-admin and ordinary-user journey at the deployed app host. Production backup/restore and rollback remain separate release controls when a later phase promotes database changes.
