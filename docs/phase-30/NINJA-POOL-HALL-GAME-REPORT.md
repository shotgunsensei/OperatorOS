# Phase 30 — Ninja Pool Hall Full Game and Multiplayer Restoration

> Generated from the pinned Ninja Pool Hall source snapshot and the executable OperatorOS parity ledger. Capability counts and item states are not maintained by hand.

## Outcome

Pinned source commit `62439c4018ec551ce2891800351200c8ab2cb9e7` compiles to **56 exact facets**: **50 ACTIVE_NATIVE**, **6 ACTIVE_SHARED_EQUIVALENT**, **0 OWNER_WAIVED**, and **0 BLOCKED**.

The pinned source contains 222 tracked files; 145 bounded product files (1,817,463 bytes) are retained as read-only evidence. Exact facets: 1 api_endpoint, 8 asset, 2 background_process, 19 component_action, 9 integration, 2 mobile_pwa_surface, 2 source_test, 7 ui_page, 6 ui_route.

Practice free-shoot, seeded CPU 8-ball, local hot-seat, and authenticated online rooms are real Canvas gameplay modes. No form or dashboard card substitutes for a game mode.

This is source/local release evidence: additive v39 was applied and reapplied against disposable PostgreSQL, and the compiled exact-host journey passed locally. It does not claim production database promotion or deployment.

## Physics and rules coverage

- Fixed-step browser and API engines share the pinned collision, cushion, pocket, jaw, friction, spin, and placement model.
- Four fixed initial-state golden shots cover straight, cut, side-English, follow/draw, rail, collision, and pocket behavior. Browser and server output the same state/events/result hash.
- Rules fixtures cover legal and failed breaks, 8-on-break choices, break and regular scratches, open-table group assignment, fouls, rail-after-contact, ball-in-hand/head-string placement, called-pocket 8-ball, early/incorrect/scratch 8-ball losses, legal 8-ball wins, and the optional three-foul loss.
- The CPU uses a seeded jitter path. A deterministic CPU-vs-CPU rack reaches the source-correct early 8-ball loss in 14 bounded shots under the local performance budget.
- Touch/mouse aiming, power, side English, follow/draw, called pocket, responsive 2:1 Canvas sizing, reduced motion, procedural audio, mute/haptics, table speed, and device-local visual quality are active.

## Multiplayer authority and traces

- OperatorOS session, tenant membership, module entitlement, and write access gate room REST and WebSocket paths. Browser-generated player identity and permissive standalone CORS remain retired.
- A guest submits a strictly parsed shot intent. The host runs the visible deterministic simulation and returns an eight-character result hash. Fastify independently re-simulates the exact shot before transactionally committing the next state.
- Room state, pending guest intent, sequence/version, result hashes, player bindings, reconnect timestamps, expiry, completion, and append-only events persist in PostgreSQL. Process memory stores sockets/presence only.
- Fixed size/rate windows, shot-start limits, a 500-shot cap, finite geometry bounds, ball-in-hand placement validation, stale-version rejection, idempotent client action IDs, result-hash mismatch recovery, and tenant non-authority protect the room.
- The two-client database test proves host/join, two committed shots, authenticated intent forwarding, stale rejection, cross-tenant denial, explicit leave, same-user rejoin, socket reconnect, host disconnect persistence, state request, and reconnect-window abandonment.

## PWA and navigation

- `/practice`, `/cpu`, `/local`, `/online`, `/host`, `/join`, `/profile`, `/matches/:id`, and `/rooms/:id` resolve on both the module host and `/modules/ninja-pool-hall/*` parent route.
- The manifest selects exact-host or parent-route start/scope at request time. The service worker never caches authenticated pages or API data and returns a static reconnect-safe offline shell.
- The OperatorOS ecosystem header remains the canonical return path to My Apps. The module session remains tenant/module sealed, including the tenant-in-path WebSocket route browsers require because they cannot set `X-Tenant-Id`.

## Executable evidence

- `apps/api/test/ninja-pool-phase30-domain.test.ts` — golden hashes, browser/API parity, chained scratch parity, impossible-shot rejection, idempotent authenticated-intent relay, seeded CPU rack, and performance budget.
- `apps/api/test/ninja-pool-rules.test.ts` — break, foul, scratch, groups, ball-in-hand, called-pocket, legal/illegal 8-ball, and three-foul fixtures.
- `apps/api/test/ninja-pool-online-db.test.ts` — real PostgreSQL and two authenticated WebSocket clients with authority, replay, reconnect, disconnect, and expiry traces.
- `apps/api/test/ninja-pool-physics.test.ts` — stationary rack, fixed-step repeatability, geometry bounds, and aim prediction.
- `apps/api/test/ninja-pool-phase10b-contract.test.ts` — routes, guards, deep links, Canvas controls, PWA, and trust-boundary static contract.
- `apps/web/e2e/ninja-pool-hall-phase30.spec.ts` — compiled exact-host two-browser 23-shot full rack, legal 8-ball completion, mobile touch, reconnect, resize/orientation, no-overflow, manifest, and service-worker contract.
- `scripts/phase20-product-truth.test.mjs` — reproducible 56-facet ledger with zero blocked/waived outcomes and evidence on every facet.

## Verification status

- API and web TypeScript: PASS.
- Golden physics/rules/CPU focused suite: PASS.
- Disposable PostgreSQL two-WebSocket workflow: PASS.
- Compiled production build: PASS. Exact-host Playwright two-browser full-rack journey: PASS. Production deployment remains a separate owner gate.

## Full source capability ledger

| # | Type | Source identity | State | Current boundary | Capability ID |
|---:|---|---|---|---|---|
| 1 | api_endpoint | GET /healthz | ACTIVE_SHARED_EQUIVALENT | apps/api/src/lib/auth.ts; apps/api/src/lib/database-release-contract.ts; apps/api/src/lib/tenant-auth.ts | `ninja-pool-hall.api_endpoint.247d8a284573ad12` |
| 2 | asset | artifacts/pool/public/screenshot-wide-game.png | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.asset.233328f90595731b` |
| 3 | asset | artifacts/pool/public/icon-512-maskable.png | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.asset.44dba01c741214ee` |
| 4 | asset | artifacts/pool/public/icon-512.png | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.asset.5262f2f9ff7b3104` |
| 5 | asset | artifacts/pool/public/opengraph.jpg | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.asset.76971b12e544b93f` |
| 6 | asset | artifacts/pool/public/favicon.svg | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.asset.7c28aa33031a7cda` |
| 7 | asset | artifacts/pool/public/screenshot-narrow-game.png | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.asset.95b9b52bb9b2512a` |
| 8 | asset | artifacts/pool/public/screenshot-narrow-menu.png | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.asset.acb4ba888e9f03a1` |
| 9 | asset | artifacts/pool/public/icon-192.png | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.asset.c04f51e4fa680f07` |
| 10 | background_process | setInterval () => { if (!alive) { try { ws.terminate(); } catch { /* ignore */ } clearInterv | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.background_process.180233f09c7e6951` |
| 11 | background_process | setInterval cleanupRooms | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.background_process.3ec2ab14a54fadb6` |
| 12 | component_action | Got it | ACTIVE_SHARED_EQUIVALENT | apps/api/src/lib/auth.ts; apps/api/src/lib/database-release-contract.ts; apps/api/src/lib/tenant-auth.ts | `ninja-pool-hall.component_action.00f01d7afb015976` |
| 13 | component_action | Back to menu | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.15ee8074a46dd037` |
| 14 | component_action | New game | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.28c54ce3ae2415a1` |
| 15 | component_action | Back to menu | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.311172d65ca216c4` |
| 16 | component_action | Join room | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.459c1ff2e0480573` |
| 17 | component_action | Dismiss install prompt | ACTIVE_SHARED_EQUIVALENT | apps/api/src/lib/auth.ts; apps/api/src/lib/database-release-contract.ts; apps/api/src/lib/tenant-auth.ts | `ninja-pool-hall.component_action.4ada2edbb2386a5e` |
| 18 | component_action | item.to | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.4b2eaed5f84ffa9c` |
| 19 | component_action | Back | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.5ae7a5e4a3c72cb1` |
| 20 | component_action | Install | ACTIVE_SHARED_EQUIVALENT | apps/api/src/lib/auth.ts; apps/api/src/lib/database-release-contract.ts; apps/api/src/lib/tenant-auth.ts | `ninja-pool-hall.component_action.5bd44d3c7eff0172` |
| 21 | component_action | Back to menu | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.7224c162e452237e` |
| 22 | component_action | Copy link | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.86d409550b4b679b` |
| 23 | component_action | Vs CPU | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.939c02cd49069d5e` |
| 24 | component_action | Free shoot | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.9de92aa3b01b0855` |
| 25 | component_action | Back to menu | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.a79a2d0d8bc0687e` |
| 26 | component_action | Re-rack &amp; re-break | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.bb1cae2af1262ad6` |
| 27 | component_action | Install | ACTIVE_SHARED_EQUIVALENT | apps/api/src/lib/auth.ts; apps/api/src/lib/database-release-contract.ts; apps/api/src/lib/tenant-auth.ts | `ninja-pool-hall.component_action.c3adbaf7a7c1e24c` |
| 28 | component_action | Play the table | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.d4bd84dff402d7b5` |
| 29 | component_action | Button onClick | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.e807796860aeabc3` |
| 30 | component_action | Restore defaults | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.component_action.fcc0377d44ce15e8` |
| 31 | integration | NODE_ENV | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.integration.12c33045e4358b0e` |
| 32 | integration | BASE_PATH | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.integration.311f596995db128c` |
| 33 | integration | REPL_ID | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.integration.80e87209399a7125` |
| 34 | integration | LOG_LEVEL | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.integration.819266ee1ab141a7` |
| 35 | integration | PORT | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.integration.a3b35305e7005732` |
| 36 | integration | PORT | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.integration.a70eb4962ca8b4ef` |
| 37 | integration | DATABASE_URL | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.integration.c3d1daf29128afd4` |
| 38 | integration | NODE_ENV | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.integration.cdfe1fefd17183ff` |
| 39 | integration | DATABASE_URL | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.integration.d0a532eafc961528` |
| 40 | mobile_pwa_surface | artifacts/pool/public/sw.js | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.mobile_pwa_surface.2f899c79ba702a25` |
| 41 | mobile_pwa_surface | artifacts/pool/public/manifest.webmanifest | ACTIVE_SHARED_EQUIVALENT | apps/api/src/lib/auth.ts; apps/api/src/lib/database-release-contract.ts; apps/api/src/lib/tenant-auth.ts | `ninja-pool-hall.mobile_pwa_surface.993e38bc98295314` |
| 42 | source_test | artifacts/pool/src/lib/rules.test.ts | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.source_test.78356f00f13e0cbf` |
| 43 | source_test | artifacts/pool/src/lib/physics.test.ts | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.source_test.7cada70fd2483d0b` |
| 44 | ui_page | JoinGame.tsx | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.ui_page.19aa22f7ccd0744a` |
| 45 | ui_page | Practice.tsx | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.ui_page.3a64ceb4df8ebb8c` |
| 46 | ui_page | MainMenu.tsx | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.ui_page.3d0614f6d2c76bb7` |
| 47 | ui_page | LocalTwoPlayer.tsx | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.ui_page.4ba491f67ae26288` |
| 48 | ui_page | HostGame.tsx | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.ui_page.a020b507c9e46235` |
| 49 | ui_page | not-found.tsx | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.ui_page.bac9680925042ae7` |
| 50 | ui_page | Settings.tsx | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.ui_page.bbb239b2a07e4e42` |
| 51 | ui_route | / | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.ui_route.106dc7eaeece5fae` |
| 52 | ui_route | /practice | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.ui_route.130225b9994b8a65` |
| 53 | ui_route | /settings | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.ui_route.38fbe4265413dd77` |
| 54 | ui_route | /host | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.ui_route.9e5e1bad0d8fa6ef` |
| 55 | ui_route | /join | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.ui_route.d279f763fe6f3f77` |
| 56 | ui_route | /local | ACTIVE_NATIVE | apps/api/src/lib/ninja-pool-game.ts; apps/api/src/lib/ninja-pool-hall-db-init.ts; apps/api/src/lib/ninja-pool-match.ts | `ninja-pool-hall.ui_route.fda04d18d0021191` |

## Deployment gates

- Back up the reviewed target database and apply cumulative additive release v39 through the supported release runner.
- Verify the reviewed commit on `ninja-pool-hall.operatoros.net`, including module SSO, exact-host WebSocket upgrade, two-device full-rack play, reconnect, PWA install, and return to OperatorOS.
- Run target backup/restore and rollback rehearsal. Production promotion remains owner-controlled.

