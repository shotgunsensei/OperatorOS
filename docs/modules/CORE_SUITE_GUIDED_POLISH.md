# Core Suite guided workflow and visual polish

Date: 2026-09-11. Scope: TradeFlowKit, TechDeck, and PulseDesk.
Status: local implementation; no deployment or module parity promotion.

## What changed for users

- Today's priority appears before workspace directories and secondary reports.
  Empty workspaces show a short start path without a wall of zero counters.
- Active briefs show the first three ranked actions. Remaining ranked records
  stay available in an expandable list with their original direct links.
- Recurring work, intake, and follow-up options sit in an optional section
  labeled "Save time on repeat tasks." Opening it navigates to the existing
  configuration or review workflow; it does not enable an automation.
- Secondary sidebar groups are collapsed until opened, or until the active
  route belongs to that group. Every existing navigation item and permission
  check is retained. TradeFlowKit also has a complete keyboard-accessible
  phone menu alongside its existing bottom navigation.
- Relevant work pages show their position in a linked workflow:
  TradeFlowKit customer / quote / job / invoice / payment; TechDeck triage /
  investigate / record work / report; PulseDesk capture / coordinate /
  resolve / review. These indicate navigation position, not record completion.
- TradeFlowKit's business totals and connected proof package, TechDeck's
  service tools, and PulseDesk's detailed totals and training handoff remain
  available in optional sections. Existing confirmation and role checks apply.
- PulseDesk's analytics page opens its reporting details without repeating
  the home brief. Its main dashboard now precedes the workspace tool directory.
- PulseDesk request entry keeps the summary, context, type, priority, impact,
  and required privacy acknowledgment visible. Location, routing, equipment,
  and response-target options can be expanded; equipment-issue deep links
  expand that section automatically. The `/requests/new` intent no longer
  tries to fetch a ticket with the identifier `new`.
- TechDeck ticket deadlines and TradeFlowKit document notes are optional
  disclosures. Inputs stay mounted so folding a section preserves values
  and the existing submission payload.
- All three main modules receive calmer typography, consistent spacing,
  readable action lists, and responsive controls. TradeFlowKit preserves
  light/dark themes, including its phone drawer and compact utility toolbar;
  TechDeck and PulseDesk retain their existing dark themes.

## Changed files

Paths below are relative to the repository root. Paired files share the shown
directory.

| Area | Files |
| --- | --- |
| Shared shell and navigation | `apps/web/src/components/module-application-shell/ModuleApplicationShell.tsx`, `ModuleApplicationShell.module.css` |
| Shared daily brief | `apps/web/src/components/module-shells/CoreSuiteWorkdayBrief.tsx`, `CoreSuiteWorkdayBrief.module.css` |
| Guided stages and optional sections | `apps/web/src/lib/core-suite-journey.ts`; `apps/web/src/components/module-shells/CoreSuiteJourney.tsx`, `CoreSuiteSection.tsx`, `CoreSuiteWorkflow.module.css` |
| TradeFlowKit | `apps/web/src/components/module-shells/TradeFlowKitShell.tsx`, `TradeFlowKitShell.module.css`, `TradeFlowKitOperations.tsx`, `TradeFlowKitRevenueFlow.tsx` |
| TechDeck | `apps/web/src/components/module-shells/TechDeckShell.tsx`, `TechDeckTicketQueue.tsx`, `TechDeckWorkdayBrief.tsx` |
| PulseDesk | `apps/web/src/components/module-shells/PulseDeskShell.tsx`, `PulseDeskServiceDeskWorkspace.tsx` |
| Regression checks | `apps/api/test/core-suite-journey.test.ts`; `apps/web/e2e/core-suite-guided-polish.spec.ts`; `apps/web/playwright.ui.config.ts` |
| Evidence | This report; `docs/IMPLEMENTATION_STATUS.md`; `docs/modules/MODULE_PARITY_INDEX.md` |

## Reliability and authority

TradeFlowKit no longer renders a setup/clear brief when the dashboard data
request fails, and it no longer loads saved job filters on the dashboard.
PulseDesk withholds its brief when a dashboard load fails. TechDeck adds a
direct retry action. Loading, failure, and successful empty states remain
distinct.

No API handler, database table, release manifest, authentication decision,
SSO contract, membership, entitlement, billing operation, provider operation,
or audit policy changed. No new production environment variables are needed.
PulseDesk's operational-data boundary and mandatory privacy acknowledgment
remain intact. Native disclosures do not grant access; the existing servers
continue to authorize every read and write.

## Verification environment and limits

Windows PowerShell; Node 24.16.0; Next 15.5.25; installed workspace dependencies.
Browser tests load compiled Next assets on loopback and intercept API and
WebSocket traffic with explicitly synthetic fixtures. They block non-loopback
requests and start no API or database. The dedicated UI config strips external
provider variables and clears `DATABASE_URL` in the child server environment.

This proves presentation, client navigation, form payload preservation,
client access-state rendering, and error recovery. It does not prove real
authentication, server authorization, persistent writes, exact-host SSO,
delivery, billing, production readiness, or deployed acceptance.

### Final results

| Check | Result |
| --- | --- |
| Focused workday/journey native tests | 11 passed; 0 failed; 0 skipped |
| Broader shell/Help/workday/journey source contracts | 19 passed; 0 failed; 0 skipped (includes the focused 11) |
| Synthetic compiled-browser UI suite | 11 passed; 0 failed; 0 skipped; final run 39.9 seconds, exit 0 |
| Responsive dashboard checks | 10 module/viewport combinations: all three at 1440, 820, 390px; TradeFlowKit also at 740px; no horizontal page overflow beyond 1px |
| Accessibility scan | No serious or critical axe violations in the audited module dashboard regions across that matrix and the additional TradeFlowKit dark-phone state |
| Production build | Passed deployment-scope validation, catalog 4/4, four workspace typechecks, API/runner/web compilation, and 35/35 Next pages |
| Final web presentation build | Passed 35/35 Next pages after the phone-toolbar and dark-theme fixes |
| Final web typecheck / repository lint / diff check | Each exited 0; lint uses the current repository-defined ESLint command with zero warnings allowed |

The browser suite also verified keyboard disclosure controls; phone drawer
focus entry, Escape, and focus return; retry after an unavailable dashboard;
all five synthetic ranked invoice links; current workflow-stage navigation;
folded TechDeck deadline and PulseDesk routing values in submitted payloads;
PulseDesk's required privacy acknowledgment; denied/viewer presentation; and
TradeFlowKit's dark-theme variables inside the portaled phone menu. Automated
accessibility checks cover these screens, not the entire product or every
possible dataset. They are not a full accessibility certification.

Review screenshots contain only synthetic data and live under
`build/core-suite-polish/`: `tradeflowkit-1440.png`, `techdeck-1440.png`,
`pulsedesk-1440.png`, each module's `-820.png` and `-390.png`, plus
`tradeflowkit-740.png` and `tradeflowkit-dark-390.png`.

### Commands

From the repository root:

```powershell
node --test apps/api/test/core-suite-workday.test.ts apps/api/test/core-suite-workday-static.test.ts apps/api/test/core-suite-journey.test.ts
corepack pnpm lint
corepack pnpm --dir apps/web typecheck
$env:INTERNAL_API_URL='http://127.0.0.1:5001'
corepack pnpm build:production
corepack pnpm --dir apps/web build
git diff --check
```

The focused native tests passed 11/11. The wider shell/Help/workday/journey
slice passed 19/19 using the local import-resolution helper
`build/core-suite-polish/typescript-resolver.mjs`:

```powershell
node --import ./build/core-suite-polish/typescript-resolver.mjs --test apps/api/test/module-application-shell-contract.test.ts apps/api/test/help-center-contract.test.ts apps/api/test/core-suite-journey.test.ts apps/api/test/core-suite-workday.test.ts apps/api/test/core-suite-workday-static.test.ts
```

The helper resolves existing emitted `.js` and extensionless relative imports
to their TypeScript sources for Node's native stripping. The usual `tsx`
loader fails before test execution on this managed host with
`uv_os_get_passwd ENOMEM`; no assertions were changed or skipped.

From `apps/web`:

```powershell
$env:E2E_WEB_URL='http://localhost:5000'
node node_modules/@playwright/test/cli.js test --config playwright.ui.config.ts --output test-results/core-suite-ui-reviewed --max-failures=1
```

Browser evidence and screenshots are under `build/core-suite-polish/`.
The managed Windows host required a fresh output directory after interrupted
runs, and stopping the exact test-owned Next process after assertions finished
to let Playwright complete its server teardown. Do not terminate unrelated
Node processes. Direct standalone preview startup was rejected by automatic
approval review; verification used the provider-stripped test launcher.

## Delivery and rollback

Changes remain uncommitted in the current checkout because this session cannot
write Git metadata. No push, merge, publication, database apply, or deployment
occurred. Rollback is the scoped web presentation diff; there is no database
migration to reverse. Review the module screens in an authenticated staging
session before a separately authorized deployment.
