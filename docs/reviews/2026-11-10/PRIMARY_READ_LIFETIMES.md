# Primary workspace read lifetimes — 2026-11-10

## Scope and release truth

This isolated follow-on starts at accepted `75f57998eb675fc45b141695603b292f6c0430b0`.
It repairs client read/selection lifetime defects in PulseDeskServiceDeskWorkspace
and TradeFlowKitOperations only. Server mutations, business rules, billing,
permissions, learning behavior, dependency versions and database release remain
unchanged. Earlier candidates and their receipts are preserved.

These were client reliability defects, not demonstrated authorization bypasses.
Tenant hard reload, identity-loading removal and existing shell remount fences
already constrain cross-identity behavior. The synthetic tests do not establish
server authorization, real-account isolation or production acceptance.

## Implemented behavior

- Independent request generations retire obsolete success, error and finally
  callbacks. Loading/selection ownership never unlocks a separate pending write.
- Pulse ticket and requester/internal attachment results commit together. A new
  request clears prior detail and states that the selected ticket is loading.
- Pulse list batches settle independently, retaining successful panels after a
  sibling failure. Filter/view/tenant/path changes retire old reads and notices.
- Exact ticket reads are not invalidated by absence from a filtered first page.
  Same-area path navigation opens its new ticket; filter changes do not silently
  reopen the previous URL ticket. StrictMode effect replay remains supported.
- Trade operations/settings and saved views have scoped ownership. Revenue and
  saved-view errors no longer erase successful operations. Attachment lists and
  downloads require the current accepted job scope.
- Post-mutation refreshes, form resets, notices and errors cannot act on a newer
  selection/filter/scope. Existing requests are not cancelled on the server.

## Durable regression command

With the existing frozen installed dependencies, run from the repository root:

```powershell
corepack pnpm --dir apps/web exec playwright test --config playwright.primary-read-lifetimes.config.ts
corepack pnpm typecheck
corepack pnpm lint
$env:INTERNAL_API_URL='http://127.0.0.1:5001'
corepack pnpm build:production
```

The committed `apps/web/e2e/primary-read-lifetimes.spec.ts` bundles the actual
components using existing esbuild and runs in Chromium with synthetic API
promises. Its dedicated Playwright config starts no application/server, blocks
browser external requests and uses no database or providers. Source/asset-root
overrides exist only to test frozen baseline components against the same suite.
No new dependency or provider is needed. These focused checks are not wired into
a hosted CI pipeline by this slice.

## Verification and remaining gates

Fresh focused browser proof passes **38/38, zero failed/skipped**, both through
an external evidence harness and the committed portable config on this candidate's
own installed graph. Seven baseline-negative controls fail as expected against
`75f57998`: stale Pulse detail success/error, mixed attachments, stale Trade jobs/
errors/finally/settings. Initial fixture-contract failures are retained, not
counted as source failures. Independent static review found the pagination/path
issues above and cleared their fixes.

Aggregate `pnpm typecheck` (API, runner, web, native) and zero-warning `pnpm lint`
pass. Expanded web-source plus test/config compilation is separately recorded in
the external receipt. A fresh offline frozen scripts-disabled install added
1,205 packages with **zero downloads** from the existing task-local store/cache.
Root and installed lock SHA256 are both
`7d020fd1976bc47ed5e81ff8af8ee98cc1c4b673de8df58b3e12037ccd7c0a65`;
regenerated SBOM matches all 1,311 components. No dependency versions changed.
The exact source commit is prepared for its production rebuild; that build is
pending until the follow-up verification receipt is recorded.

Desktop/mobile screenshots use actual local root fonts/theme and module canvas
or shell tokens with synthetic data. They are component fixtures, not an
authenticated full-shell acceptance run. Pulse route-heading contrast on its dark
canvas is a pre-existing visual follow-up, not fixed here. Ordinary Pulse filter
keystroke overlap remains constrained by its whole-route loading screen; tests
must not be represented as proof of a live auth or tenant bypass.

Publication, hosted CI, deployment, database backup/restore/apply, production
schema and real-user/provider acceptance remain separate held gates. No live
Replit/user Chrome, production database, remote write, PR, push, merge or deploy
was performed. Implementation verification does not mean shipped.

## Bounded visual follow-up

The actual-theme fixture `pulse-workspace-390.png` (also 1440px) in external
`evidence/primary-read-lifetimes-nov10/` shows the route heading inheriting
`.pds { color:#102033 }` against PulseDesk's `#07111b` canvas. Source anchors:
`PulseDeskServiceDeskWorkspace.tsx` route-label heading (line 336) and inline
`.pds` style (line 469), plus `PULSEDESK_THEME.colors.background` in
`PulseDeskRoute.contract.ts`. This is retained for a separate aesthetics slice.
