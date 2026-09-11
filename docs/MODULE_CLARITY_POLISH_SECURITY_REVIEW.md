# Module clarity, visual polish, and security review

Date: 2026-09-09. Branch: `codex/module-clarity-polish-security`.
Scope: active OperatorOS web/module surfaces, shared presentation and Help,
active API/runner/native/package security scan, archived-source secret-pattern
checks, and workspace dependency graph.
Imported `apps/modules/*/source` snapshots remain read-only migration evidence.

## Customer-facing changes

- Every active module gets compact, optional step-by-step help inside its page
  layout. The primary page heading and working actions remain visible first.
- Page guidance uses the specific task instructions already maintained for the
  product, instead of repeating the same generic three steps everywhere.
- Exact page/tab matches and the most specific parent route take precedence.
  `/app`, `/dashboard`, and module-root aliases select their home guide.
- The panel explains common product terms, view-only access, saved results,
  draft versus completed work, timeout recovery, and service setup requirements.
- The Help Center displays each instruction once instead of duplicating it in
  both the features and workflow columns.
- Shared module navigation uses a Radix modal drawer on phones. It contains
  keyboard focus, supports Escape, restores focus to the trigger, and includes
  an explicit close control. Closed navigation is absent from the mobile tab
  order. Existing desktop and bottom navigation modes are preserved.
- Navigation captions and workflow descriptions are larger. Headers/actions
  wrap, focus remains visible, numbers align, reduced motion remains respected,
  and phone form controls have larger touch targets.
  Tablet headers give breadcrumbs and action buttons room to wrap separately.
- TradeFlowKit guidance follows its existing light/dark theme tokens.
- TradeFlowKit lead summaries and saved-view empty states use readable theme
  colors and larger labels. Customer/invoice CSV selectors and revenue forms
  use the same light/dark surface tokens as the surrounding page.
- CallCommand help now covers the current setup, AI receptionist, workflow,
  usage, and readiness navigation, including the distinction between a saved
  setup simulation and an actual external call.
- The launcher updates its recent-app display after the native anchor click
  completes. This preserves Ctrl-click/new-tab behavior when launching an app
  would otherwise reorder the clicked card during event dispatch.
- Unavailable-app messaging distinguishes a not-yet-launched app from missing
  organization access and a disabled app, using the server's returned status.
  OutCall no longer asks users to request access that administrators cannot
  enable. Access checks show a loading state when the requested app changes.

## Module coverage

The browser inventory follows all maintained Help routes. Existing module
identities, slugs, server access controls, business functions, and paid/free
boundaries are preserved.

| Module | Documented sections | Workflow focus |
| --- | ---: | --- |
| TradeFlowKit | 18 | Lead, customer, job, quote, invoice, and payment |
| PulseDesk | 10 | Operations requests, ownership, escalation, and resolution |
| TechDeck | 19 | Support requests, assets, procedures, and service proof |
| TorqueShed | 17 | Vehicle history, diagnosis, repair, and proof |
| FaultlineLab | 9 | Challenge, investigation, and feedback |
| Operator Pool Hall | 8 | Practice, match play, and player progress; still free |
| BrandForgeOS | 12 | Brand, audience, campaign, review, and deliverables |
| SnapProofOS | 21 | Field records, photos/files, review, and reports |
| StudyForge AI | 9 | Sources, study sets, practice, and progress |
| Deploy Ops | 8 | Campaign preparation, approval, and export |
| CallCommand AI | 17 | Setup, call review, and owned follow-up |
| Script Ops | 9 | Draft, review, approval, and download |
| OutCall | Unavailable entry checked | Coming-soon/access-denied state retained |
| Total active sections | 157 | Route rendering is distinct from transaction acceptance |

## Security findings and fixes

1. **Missing dependency patches.** Initial pnpm metadata reported 2 critical,
   13 high, and 6 moderate vulnerability entries across 1,279 dependencies.
   Updated the Next.js 15 release floor to 15.5.24 (lock resolves 15.5.25),
   sharp to at least 0.35.4, xmldom to at least 0.9.12, qs to at least 6.16.0,
   js-yaml 4.x to at least 4.3.2, decode-uri-component to at least 0.5.0, and
   affected uuid resolutions to 11.1.1. Kept npm-compatible root overrides and
   pnpm-scoped workspace overrides separate. See the
   [Next.js image optimization advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4).
2. **Legacy runner UI injection.** Route parameters were interpolated into
   inline JavaScript; workspace/task/profile data, verification output, and
   trace/event details were concatenated into HTML. Added script-safe JSON
   serialization, HTML escaping, URL-component encoding, and a data-driven
   task button listener. Tests exercise hostile route values and rendered
   records; this is not merely a static pattern assertion.
3. **Incomplete access response.** Module UI now requires an explicit
   `unlocked === true` decision. A missing decision cannot render the module.
   Server-side authorization remains the actual permission boundary.
4. **Audit-report completeness.** The security scanner now rejects empty,
   malformed, and incomplete dependency-audit output instead of treating
   missing counts as zero. Regression coverage includes incomplete results.

The final dependency review must retain disclosure of the two existing high
image-size advisories, GHSA-5p2g-fcmc-qvqq and GHSA-w3rx-r6r6-pgpr. They remain
covered by the checked-in patch, exception-integrity check, and regression
fixtures. They were not silently removed from the vulnerability totals.

The maintained scanner examined 4,316 eligible files, including a read-only
secret-pattern check of 2,898 archived source files. No scanner findings
remained. Runtime rules and dependency patching apply to the active workspaces;
archived apps were not installed, executed, or modified. The refreshed
CycloneDX inventory contains 1,239 components from the final pnpm lockfile.

## Verification

Evidence is local and uses synthetic identities and two explicitly disposable
PostgreSQL 16 databases, `operatoros_polish_test` and
`operatoros_polish_browser_test`. Provider credentials are stripped by the
browser harness. Canonical production hostnames resolve to the local TLS proxy.
The browser runs compiled production artifacts through
`scripts/start-unified-runtime.mjs`, with `RUNNER_MODE=disabled`.

Required commands and final outcomes are recorded in
`docs/IMPLEMENTATION_STATUS.md`. Generated artifacts are under
`build/module-polish/`, `build/phase39/security-scan.json`, and the task's
`output/polish-*.log` files. The route artifact records each visited section;
screenshots and accessibility results record the desktop and phone states.
These are review screenshots, not automatically approved visual baselines.

The broad browser suite passed 32/32 with no skips. It visited all 157 listed
sections, found no serious/critical axe findings on their desktop states, and
found no page-level overflow at desktop/phone widths. Module entry screens
were additionally checked at desktop, tablet, and phone widths with expanded
guidance. The focused presentation rerun after the final unavailable-state
copy and header-wrap adjustments passed 16/16 with no skips in 1.7 minutes.
API regression coverage passed 1,453/1,453 with no skips, followed by
15 focused Help/security tests after the last Help-content changes.

## Remaining boundaries and rollback

- No production database, deployment, GitHub push, merge, provider connection,
  billing object, outbound communication, or customer record was changed.
- Browser route/accessibility acceptance does not prove every transaction,
  external delivery, live payment, telephone call, native-device interaction,
  or comprehension by an actual first-time customer. API persistence and
  authorization tests are reported separately.
- The existing CSP allows inline scripts for Next.js compatibility. This is
  an existing defense-in-depth gap; a nonce/hash migration still requires
  careful framework/runtime verification. It is not evidence of a currently
  exploitable injection after the fixes above.
- Native dependencies retain existing Expo/React peer warnings. Native device
  visual acceptance is outside the desktop-browser evidence in this report.
- No database schema changes. Rollback consists of reverting the reviewed
  UI/security source changes and restoring the matching lockfile, then
  rebuilding. Reverting dependency patches restores the disclosed exposure;
  retain the security patches if only the presentation changes need rollback.

## Changed files

- `apps/api/src/ui.ts`
- `apps/api/test/core-suite-workday-static.test.ts`
- `apps/api/test/help-center-contract.test.ts`
- `apps/api/test/legacy-ui-xss.test.ts`
- `apps/api/test/phase15-release-identity.test.ts`
- `apps/web/e2e/help-center.spec.ts`
- `apps/web/e2e/module-clarity-polish.spec.ts`
- `apps/web/package.json`
- `apps/web/src/app/apps/[slug]/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/help/HelpCenter.module.css`
- `apps/web/src/components/help/HelpCenter.tsx`
- `apps/web/src/components/module-application-shell/ModuleApplicationShell.module.css`
- `apps/web/src/components/module-application-shell/ModuleApplicationShell.tsx`
- `apps/web/src/components/module-shells/CallCommandShell.tsx`
- `apps/web/src/components/module-shells/CoreSuiteWorkdayBrief.module.css`
- `apps/web/src/components/module-shells/CoreSuiteWorkdayBrief.tsx`
- `apps/web/src/components/module-shells/ModulePageGuide.module.css`
- `apps/web/src/components/module-shells/ModulePageGuide.tsx`
- `apps/web/src/components/module-shells/TradeFlowKitLeadCenter.tsx`
- `apps/web/src/components/module-shells/TradeFlowKitOperations.tsx`
- `apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx`
- `apps/web/src/components/module-shells/TradeFlowKitShell.module.css`
- `apps/web/src/components/pages/MyAppsPage.tsx`
- `apps/web/src/lib/help/companion-module-guides.ts`
- `apps/web/src/lib/help/index.ts`
- `apps/web/src/lib/help/module-glossary.ts`
- `apps/web/src/lib/help/page.ts`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/MODULE_CLARITY_POLISH_SECURITY_REVIEW.md`
- `docs/modules/MODULE_PARITY_INDEX.md`
- `docs/phase-39/OPERATOROS-SBOM.cdx.json`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `scripts/parity/run-browser-tests.mjs`
- `scripts/phase39/security-scan.mjs`
- `scripts/phase39/security-scan.test.mjs`
