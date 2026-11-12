# Shared module navigation refinement, 2026-11-12

## Outcome and scope

Implementation verified locally; not published, deployed or production accepted.
Base: `fc1d4e61b86974618142e8444147d83a8108f52f`, tree
`de1a681e65b5466fc2b2c0833f95fc7a801ba26a`. Isolated worktree
`operatoros-module-navigation-nov12`, branch `codex/module-navigation-nov12`.
Implementation commit: `fb35551cb01bd6994412a0bcad5d6c85855ebdea`.
Existing worktrees are preserved. This finalization restores the review document
after a failed text replacement left it empty in the implementation commit.
No runtime bytes change during documentation finalization.

Long module menus now have a compact labeled section filter. It matches words
in the current manifest's section/group labels, exposes matching destinations
without requiring users to find their disclosure first, announces actual match
counts and provides clear no-results recovery. Menus with seven or fewer entries
retain their compact presentation. This reduces route-finding interaction cost;
it is not a claimed measured runtime-performance gain.

The filter does not fetch, invent, rank, persist or grant routes. Existing omitted
entries stay omitted. Denied/disabled entries remain the original non-link disabled
spans, explanations and capability checks. No API, identity, SSO, permissions,
billing, database, provider, registry or dependency change. No parity promotion.

## Interaction repair

- Selecting the current route closes the mobile menu and focuses its content
  heading, including normalized trailing-slash/query/hash equivalents.
- Completed new-route navigation focuses content after Radix closes its focus
  scope, rather than being overwritten by ordinary return-to-trigger behavior.
  Full shell remount and React StrictMode are covered.
- Close, Escape dismissal and outside dismissal restore the menu trigger. A
  breakpoint change to desktop focuses visible content instead of a hidden trigger.
- Escape clears a nonempty filter first, retaining the menu and input focus. The
  next Escape dismisses it. Composition Escape does neither. Clear returns focus
  to the filter; empty results do not discard keyboard position.
- Modified click handlers retain the menu and do not move content focus. A
  new-route click whose navigation has not completed keeps the destination
  available; closing does not depend on a speculative route outcome.
- Query state resets across route/module changes, dismissal, breakpoint changes
  and a shorter manifest. Back/Forward cannot resurrect a prior search. Current
  capability and supplied-manifest changes are reflected immediately.
- Mobile Radix content uses a generic dialog container; desktop keeps its aside
  landmark. The former aside carrying role=dialog violated ARIA role composition.

Search/clear controls have at least 44px height and a 44px clear target, module
theme variables, visible focus and no horizontal overflow at tested widths.
The existing desktop rail width stays unchanged. Long menus scroll rather than
shrinking children; keyboard focus can bring the final destination into view.

## Fixture fidelity and dependency provenance

The fixture mounts actual ModuleApplicationShell and Radix dialog, real
global/shared CSS, local Inter font, actual TechDeck theme/manifest, real page
guide and TechDeckShell's static scoped route CSS. Only router and page data are
synthetic. No application/API/database server, credentials, account or provider
is used. It is not authenticated full-app acceptance or a new public test route.

Installed assets are reused from unchanged frozen sibling
`operatoros-primary-read-lifetimes-nov10` through candidate-local node_modules
junctions and explicit asset paths. No install, package download, graph update or
lifecycle script was performed. This is not a fresh candidate dependency install.
The baseline and asset sibling worktrees remain Git-clean. API source, packages,
database-release and lock/workspace manifests have no candidate diff.

## Fresh verification

Reproducible committed commands with an existing installed graph:

```powershell
corepack pnpm --dir apps/web exec playwright test --config playwright.module-navigation.config.ts
corepack pnpm typecheck
corepack pnpm lint
$env:INTERNAL_API_URL='http://127.0.0.1:5001'
corepack pnpm build:production
```

External receipts are in `task/evidence/module-navigation-nov12/`.

- Actual-shell Chromium suite: **31 passed, zero failed/skipped**, 33.6 seconds,
  through `node ../evidence/module-navigation-nov12/check.cjs browser`.
- Committed portable config: the **same 31/31** pass directly from TypeScript in
  21.8 seconds, via external `aggregate.cjs portable`. This is a second run, not
  62 distinct cases. It requires no transformed-file harness.
- Coverage includes three scoped axe scans with zero violations, repeated
  open/close, keyboard selection, interrupted navigation, IME Escape, empty/clear
  recovery, capability/manifest/module changes, 320/390/1440px layout, scrolling,
  current/normalized route, shell remount, resize and Back/Forward.
- Frozen baseline: **three expected failures**, zero passes/skips, against the
  untouched `fc1d4e61` shell. They reproduce current-route menu persistence,
  destination focus loss and invalid aside/dialog semantics. The final command
  is `check.cjs baseline 'mobile current-route selection|mobile destination keeps|mobile navigation has valid dialog'`.
  These prove existing defects, rather than only absence of a new feature.
- Aggregate four-workspace typecheck: exit 0, 51.8 seconds.
- Aggregate zero-warning lint: exit 0, 35.5 seconds. Standalone Playwright config
  lint also passes; its exact command and result are in `config-lint.receipt.json`.
- Final expanded web-source plus new test/config strict TypeScript: exit 0,
  20.0 seconds via `aggregate.cjs webTypes`, superseding the earlier 34.8s run.
- Production build: exit 0, 74.5 seconds via `aggregate.cjs build`. Deployment
  scope and generated TechDeck resolution contracts verify, four Faultline
  catalog regressions pass with zero skips, all four workspace types pass again,
  SDK/API/runner/web compile and Next generates **40/40 pages**. Next's internal
  type/lint skips are covered by the separate successful commands.
- `git diff --check` and staged whitespace checks pass.

The production build ran on final runtime working-tree bytes before commit. Its
release metadata therefore records the base HEAD, not the forthcoming commit.
Only final documentation changed afterward. Source blobs, final commit/tree,
unchanged authority-tree identities and receipt/image hashes are recorded in
external `FINAL_RECEIPT.json`.

The external browser runner sanitizes inherited environment, blocks Node sockets,
HTTP and fetch, aborts nonfixture browser requests and uses a closed loopback
proxy. The committed config uses the same proxy and starts no server. Modified
click checks dispatch handler events then cancel browser defaults at the final
bubbling boundary: they prove no dismissal/focus theft, not actual new-tab/window
creation. Touch targets are browser geometry, not real-device touch acceptance.
Axe is scoped to the navigation fixture, not full WCAG or screen-reader proof.

Initial measurement and setup findings remain in the receipt directory. An
arbitrary 160px minimum input width failed at 320px (actual 153.2px); inspection
showed a readable query, 44px clear control and no overflow. The invented bound
was replaced by 120px, also covering the narrower desktop rail. No CSS repair
was made for that nondefect. An intermediate axe run exposed the existing invalid
role before its repair. Reattachment changed LOCALAPPDATA to an empty sandbox
pnpm cache; the first build launcher exited before any build stage. The known
existing exact pnpm 10.34.5 path was then used; failed receipts were preserved.

## Visual proof and limits

External screenshots: `before-navigation-390.png`, `before-navigation-1440.png`,
`after-navigation-390.png`, `after-navigation-1440.png`, and
`filtered-navigation-320.png`, `filtered-navigation-390.png`,
`filtered-navigation-1440.png`. Mobile 320/390 and desktop 1440 screens were
opened and inspected. Search, clear, match count and destination remain legible;
the drawer keeps a visible Close action and scrolling. These are clearly labeled
synthetic navigation previews, not live records or full module-page aesthetics.

No real account/tenant, live SSO/Next router, full module workflow, provider,
database integration, physical-device or production accessibility acceptance was
performed. Previous uncertain publication remains un-retried. Hosted CI,
publication reconciliation, production backup/apply/redeploy, deployed health
and authenticated acceptance remain held. Revert the focused implementation
commit to roll back; there is no data migration or dependency change.
