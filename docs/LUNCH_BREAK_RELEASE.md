# Lunch Break hub release — 2026-10-21

Lunch Break is a public, free landing page inside the existing OperatorOS web/unified runtime. Games stay on separate deployments. The exact five choices are Pool Hall, Scrapshift, Roaming Garden, Neon Racer and Kage. No sixth game, credit meter, paid SKU, subscription check, identity provider or database schema is introduced.

## Source and ownership

Portfolio task `01a15484-b0ad-743c-a86f-aef43e8f3023` reserved the hub page, components, registry, tests and hub-specific navigation/routing/runtime hunks for this task. The frozen source is `28b78070a3312d985425b1b2427e927c8b5136a1`. Its broader integration ancestry is not part of this release. This candidate ports only the hub delta onto freshly fetched GitHub main `329467631640e28d717ee08f9a7f1338ce9628ac`; that deployment-marker commit has the same tree as `677bdb6f`. The held PR136 SSO test file is unchanged from main and was neither uploaded nor executed for this work.

Fresh Replit Shell inspection also reports `32946763`. Publishing shows Lunch Break already bound to the existing OperatorOS deployment, which also owns the canonical platform and module hosts. Before this release, a Chrome visit to `https://lunchbreak.operatoros.net/` returned the OperatorOS application-unavailable page over HTTPS. Public root `/readyz` reports healthy database, auth and workers, live source `677bdb6f`, build `ec5af153072658e37d57c318`, and database release 67/67. These are observations of this deployment, not universal availability claims.

## Fresh audit and polish

1. Live root, desktop and 390px: blocked by missing hub source/routing. Captures `01-live-desktop-before.jpg` and `02-live-mobile-before.jpg`.
2. Ported original source, desktop/mobile: readable hierarchy and working skip link; abstract symbols do not explain the games, free access is buried in a footnote, mobile has a long linear scan, and the second desktop row leaves an empty column. Captures `04-source-desktop-before.jpg` and `05-source-mobile-before.jpg`.
3. Polished source: retain the dark/lime design and headline, add real source imagery with honest illustration/preview captions, show free access beside the primary action, retain the Lunch Break brand on mobile, add five keyboard-accessible jump links, balance desktop rows, and state sign-in/device requirements. Game launch links remain separate tabs with noopener, noreferrer and no-referrer. No tenant/session/query data is appended.
4. Device, keyboard, exact-host and live publication acceptance: final results are recorded below and in the task evidence directory.

The original source glyphs were verified as valid Unicode (`↓`, `✦`, `↻`, `❋`, `↗`, `影`); the initial PowerShell transport displayed replacements. No literal-placeholder or control-character defect is claimed.

## Destinations and truthful availability

| Game           | Exact destination                        | Current evidence and presentation                                                                                                                                    |
| -------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pool Hall      | https://operatorpoolhall.operatoros.net/ | Chrome reaches the exact OperatorOS auth host with the registered Pool Hall callback. Account required; no credentials entered, no full gameplay acceptance claimed. |
| Scrapshift     | https://scrapshift.operatoros.net/       | Garage, vehicle, parts counter and delivery-route UI observed. Linked as a game website/browser demo.                                                                |
| Roaming Garden | https://roaminggarden.operatoros.net/    | Entry screen and full game menu observed after download. Desktop keyboard/mouse or controller, WebGL 2; no mobile touch controls.                                    |
| Neon Racer     | https://neonracer.operatoros.net/        | Landing page, `/play` mode menu and a brief actual arcade scene observed. No measured FPS or complete campaign claim.                                                |
| Kage           | https://kage.operatoros.net/             | Kage-9 Rising campaign menu and field-manual controls observed. Linked as a game website, not coming-soon.                                                           |

The four observed default game websites are enabled in source. Each server-only `LUNCH_BREAK_<GAME>_READY=false` (or empty/non-true value) removes its launch link. Setting a replacement `_URL` requires explicit `_READY=true`; a replacement URL alone is not treated as verified. Invalid/empty URLs remove launch capability. HTTPS, public DNS names, no credentials, query, fragment or nonstandard port remain required. Request parameters never select a destination.

## Assets and load behavior

All five card assets are bundled on OperatorOS under exact `/lunch-break/*` paths; no remote image hotlinks, iframe game runtimes or third-party game scripts are loaded by the hub. Pool Hall uses the existing repository cover illustration, optimized to WebP without changing its content. Kage uses its currently served `/images/kage-9-operator.png`, optimized to WebP. Scrapshift garage, Roaming Garden game menu and Neon Racer arcade images are fresh Chrome screenshots from their verified websites. Captions distinguish illustrations from game previews. Their provenance is the user's existing game sites and repository; no external stock artwork is introduced. The five files total 355,051 bytes. The desktop hero reuses the same Pool Hall image, and card images use native lazy loading with reserved dimensions.

The hub host permits read-only hub routes, its exact five image assets, favicon/brand mark and bundled Next static files. It rejects API/auth/private routes, mutations and all WebSocket upgrades before upstream handling, checking both raw and forwarded host. The page suppresses the authenticated app's PWA manifest. No cookies are issued by this hub, and no auth or subscription request is needed to render it. The page remains noindex during publication acceptance.

## Verification

- Focused seven-file hub/navigation/middleware/gateway/native runtime suite: 42/42, zero failures/skips after polish, sterile process, external network blocked, loopback only, no database or held SSO test. An initial sandboxed baseline ran 40/42; two local sockets were blocked with EACCES. Its scoped rerun passed 42/42. Failed evidence is retained.
- Root `pnpm lint`: passed with zero warnings.
- Production build v2 passed all four workspace type checks, API/runner compilation and the optimized Next build. A subsequent hub-specific loading-state fix is lint-verified and awaits its final build. The inherited generic loader requested the hub-blocked image optimizer; the new loading state uses public text only.
- Built Next exact-host HTTP acceptance: 32/32 checks passed, including no session issuance, no PWA manifest, denied private routes/mutations and five image assets.
- Chrome: no horizontal overflow at 320/390/768/1440px; every launch target is 48px high; skip and game-jump focus work. A real Kage launch preserved an empty referrer and null opener in actual Chrome Runtime inspection. An earlier DOM facade returned an unsupported opener property and is retained as an invalid observation.
- Static route/control scanner: 1,304 capabilities, 978 crawl routes, zero failures. This is not 978 browser visits.
- Final loading-state artifact and deployed acceptance remain pending final freeze.
- Existing ten-case Playwright/Axe specification was updated for the jump links and observed website defaults. This turn uses the user's Chrome for browser acceptance; no separate Playwright CLI browser run is claimed.

Task evidence: `C:\Users\John Xodus\Documents\Codex\2026-10-21\task-2\evidence`. Tool reuse does not establish a new canonical frozen-lockfile install. Initial build stopped on the absent reused `libphonenumber-js/max` dependency; the already-installed locked version 1.13.15 was linked locally and the build restarted. No acquisition or lockfile change occurred. Real free/paid authenticated account acceptance and complete game audits remain separate evidence; the hub itself is public and does not inspect account plan or entitlement.

## Release boundary and rollback

Publish only this narrow candidate through the existing OperatorOS Replit deployment. Do not publish the held broad candidate, alter security or billing settings, enable unrelated commerce/trust features, copy a development database into production, apply migrations, accept new binding terms or create credentials. Stop if Replit requests any such action. The current published v67 runtime is the rollback artifact; use a normal reviewed redeploy rather than a destructive reset or force push. No game redeploy or database rollback is required by this hub change.
