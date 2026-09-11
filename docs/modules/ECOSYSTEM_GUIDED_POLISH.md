# Ecosystem workflow, administration, and communication polish

Date: 2026-09-11. Branch: `codex/ecosystem-guided-polish`.
Source base: `dd49a950fce6ef36ac5d7e97c7304ff331b812c3` (`mainmodulespass`).
Status: local source candidate; no deployment or production parity promotion.

## Customer-facing changes

The remaining module workspaces use linked workflow stages, quieter secondary
navigation, optional dashboard totals, and the same compact daily-priority
pattern introduced for TradeFlowKit, TechDeck, and PulseDesk. Links follow the
actual route and existing available navigation. Stages describe where the user
is working; they never assert that a record or automation has completed.

| Module | Guided path and simplification |
| --- | --- |
| TorqueShed | Vehicle, diagnosis, service, export; garage totals on demand |
| FaultlineLab | Challenge, session, evidence, results; training progress on demand |
| Operator Pool Hall | Practice, play, results, profile; match record on demand; remains free |
| BrandForgeOS | Brand, campaign, creation, approval, export; concise campaign priorities and optional totals |
| SnapProofOS | Job, evidence, review, delivery; concise proof priorities and optional totals |
| StudyForge AI | Sources, study set, practice, progress; study-plan details on demand |
| Deploy Ops | Project, brief, deliverables, review, export; package details and totals on demand |
| CallCommand AI | Setup, configure, calls, follow-up; existing guided activation and provider gates retained; optional operations totals |
| Script Ops | Sources, generation, review, run; concise script priorities and optional library totals |
| OutCall | Shared workflow configuration is prepared behind the existing availability gate. The customer entry remains unavailable and no activation is exposed. |

All existing routes and form fields remain. Secondary controls are disclosed
on demand, and active sidebar sections open automatically. Role and disabled
navigation checks also filter the new stage links.

## OperatorOS and administrator workflows

- The common account menu groups profile, billing, and sign-out actions.
  My Apps, Help, and Messages remain readily available across modules.
- OperatorOS and Platform Command add navigation search and keyboard-operated
  mobile dialogs with Escape and focus restoration. The phone tenant selector
  has its own row so its controls are not clipped.
- The platform overview presents explicit service, billing, number-routing,
  and reconciliation exceptions with links to their existing review controls.
  Tenant, user, module-availability, and audit controls are accessible directly.
  Clickable overview metrics are native keyboard-operable buttons.
- A failed overview request displays a retry state instead of zero metrics.
  Refresh retrieves current information. Local, non-production, recognized
  production, and unverified host labels no longer imply that every unknown
  host is production.
- The organization overview brings team conversations, membership review,
  invitations, and tool access together, with detailed totals folded away.
  Failed requests cannot become a successful empty overview.
- Bookmarked console pages survive initial session loading. The existing auth
  and role decisions still determine which content can render.

These changes expose and connect existing authorized administration controls.
They do not add privilege, change account lifecycle policy, or introduce
automatic billing retries or global message broadcasts.

## Messenger behavior

- Search saved conversations by participant or group name, or show unread
  conversations. Inspect the people in the current conversation.
- Keep separate in-memory drafts and reply targets for each conversation.
  Closing the panel preserves drafts in that mounted workspace; reload,
  navigation that unmounts the messenger, sign-out, and tenant changes clear
  them. No message body is persisted in browser storage.
- A retry of the same failed send reuses its client message ID. A late send
  response cannot append into another open conversation or erase its draft.
- Message-load failures have a visible retry action. The open conversation
  also refreshes through polling while realtime is disconnected.
- New-conversation controls require explicit recipients from the active
  organization. The organization overview action only opens that composer.
- Messenger, mobile navigation, and account menus use the installed Radix
  primitives. Message deletion and removal from personal history have focused
  confirmation dialogs. Their existing server-side semantics are unchanged.
- Keyboard composition respects IME input; Enter sends and Shift+Enter adds
  a line. Desktop notifications remain opt-in.

## Authority and operational scope

No API handler, database schema/release, auth provider, SSO contract,
subscription, entitlement, or provider configuration changed. Messenger still
uses session-derived tenant membership, including for platform administrators.
No administrator gets cross-tenant message visibility. Existing edit/delete
ownership, expected versions, persistent idempotency, and membership-revalidated
websocket behavior remain enforced by the server.

No new production environment variable or dependency is needed. Test-only
configuration requires a loopback disposable PostgreSQL URL and
`PARITY_DATABASE_IS_DISPOSABLE=1`; its safety helper validates both and strips
external provider configuration. Browser interception is confined to test
files. No customer messages, payments, provider calls, or production data were
used or changed.

## Verification

Final consolidated browser run: **29 passed, 0 failed, 0 skipped** (1.8 minutes),
output `apps/web/test-results/ecosystem-final-2`. This includes 11 Core Suite
regressions, 9 authenticated available-module cases, 1 OutCall boundary case,
and 8 messenger/organization/platform interaction cases. No serious or critical
axe findings remained in the audited visible regions.

The production build passed at local candidate metadata `c5940e4cb994df3cdcc5ba18`
over base `dd49a95`. The final confirmation-dialog change was subsequently
rebuilt through `corepack pnpm --dir apps/web build`; web typecheck and lint
passed again. This is an uncommitted local candidate, not an exact deployed
release identity.

| Check | Evidence |
| --- | --- |
| Focused journey, admin-priority, shell, Help, brief, messenger source contracts | 26 passed; 0 failed; 0 skipped; 2.149 seconds |
| Additional admin-client, account/navigation, role, central-auth, and overlay contracts | 32 passed; 0 failed; 0 skipped; 2.415 seconds |
| Existing real messenger API and UI contracts against disposable PostgreSQL | 14 passed; 0 failed; 0 skipped; 64.647 seconds |
| Production build | API, runner and web compilation; all four workspace typechecks; 4 catalog checks; 35 Next pages; final rebuild recorded above |
| Lint | `corepack pnpm lint` passed; this command exists in the current package |
| Security scan | 4,476 files; 0 runtime findings; 0 unresolved dependency advisories; exception-integrity check passed |
| Production dependency audit | Exit 0; two disclosed high advisory exceptions, `GHSA-5p2g-fcmc-qvqq` and `GHSA-w3rx-r6r6-pgpr`, retained under the existing patch/exception policy; not a zero-advisory claim |

The database suite covers schema reapplication, tenant membership isolation,
direct conversation idempotency, owner-only group rename, durable sends and
unread state, sender-only edits/deletes, realtime events, removal of membership
from an open socket, personal history removal, and tenant-scoped presence.

The available-module browser matrix uses real local login, disposable tenant
and entitlement fixtures, and the compiled API/Next app. It checks dashboard
presentation, available stage destinations, disclosures, keyboard navigation,
and widths of 1440, 820, and 390 pixels. It is not full persistent workflow or
provider acceptance. OutCall's unavailable boundary is separately checked.

Messenger and administrator browser cases use explicitly synthetic intercepted
responses to control failures, membership presentation, and delayed acknowledgments.
They do not establish server authorization. The real messenger database suite
provides separate server evidence. Core Suite regressions retain the prior
synthetic forms, privacy acknowledgment, denied/viewer, and theme checks.
Accessibility scans cover the identified visible regions and serious/critical
WCAG 2 A/AA and 2.1 AA findings; they are not a whole-product certification.

Commands from the repository root unless a directory is shown:

```powershell
$env:INTERNAL_API_URL='http://127.0.0.1:5001'
corepack pnpm build:production
corepack pnpm lint
node --import tsx --test --test-concurrency=1 apps/api/test/ecosystem-guided-polish.test.ts apps/api/test/module-application-shell-contract.test.ts apps/api/test/help-center-contract.test.ts apps/api/test/core-suite-journey.test.ts apps/api/test/core-suite-workday.test.ts apps/api/test/core-suite-workday-static.test.ts apps/api/test/tenant-messenger-ui-static.test.ts
node --import tsx --test --test-concurrency=1 apps/api/test/platform-command-navigation-contract.test.ts apps/api/test/admin-console-static.test.ts apps/api/test/sidebar-role.test.ts apps/api/test/shared-platform-ui-static.test.ts apps/api/test/module-navigation-contract.test.ts apps/api/test/module-launch-navigation-contract.test.ts apps/api/test/auth-navigation.test.ts
node scripts/phase39/security-scan.mjs
corepack pnpm audit --prod

# Disposable PostgreSQL only; this named container was created for this task.
docker run --detach --rm --name operatoros_ecosystem_polish_test_20260911 --label codex.task=ecosystem-guided-polish -p 127.0.0.1:55461:5432 -e POSTGRES_USER=ecosystem_test -e POSTGRES_DB=operatoros_ecosystem_test -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine
$env:DATABASE_URL='postgresql://ecosystem_test@127.0.0.1:55461/operatoros_ecosystem_test'
$env:APP_ENV='test'; $env:NODE_ENV='test'
$env:SESSION_SECRET='ecosystem-polish-disposable-session-secret'
node --import tsx --test --test-concurrency=1 apps/api/test/tenant-messenger.test.ts apps/api/test/tenant-messenger-ui-static.test.ts

# From apps/web, with the same disposable URL:
$env:PARITY_DATABASE_IS_DISPOSABLE='1'
$env:E2E_API_URL='http://localhost:5001'
$env:E2E_WEB_URL='http://localhost:5000'
node node_modules/@playwright/test/cli.js test --config playwright.ecosystem.config.ts --output test-results/ecosystem-final-2 --max-failures=2
```

The local browser configuration starts the compiled API with
`--conditions=production` to resolve built package exports, while retaining
`APP_ENV=test`, test session secrets, and the disposable database. It starts
compiled Next on loopback. This does not replace the separate exact-host,
readiness-gated production supervisor/SSO acceptance harness.

Intermediate failures were resolved, not skipped: the API test command needed
its package export condition; a rebuild needed the documented API URL;
OutCall's test expected an obsolete selector; console session loading lost
bookmarked routes; the organization mobile label needed stronger contrast;
the tenant selector clipped on phones; confirmation Escape could dismiss the
parent messenger. The final run retains explicit regression assertions for
these behaviors. No failure was changed to a skip.

## Changed files and artifacts

| Area | Paths under repository root |
| --- | --- |
| Journey model and renderer | `apps/web/src/lib/module-workflow-journey.ts`, `apps/web/src/components/module-shells/ModuleWorkflowJourney.tsx` |
| Shared module behavior | `apps/web/src/components/module-application-shell/ModuleApplicationShell.tsx`, `apps/web/src/components/module-shells/CoreSuiteWorkdayBrief.tsx` |
| Module workspace disclosures | `BrandForgeWorkspace.tsx`, `SnapProofWorkspace.tsx`, `StudyForgeCompleteWorkspace.tsx`, `NinjaLaunchKitCompleteWorkspace.tsx`, `CallCommandWorkspace.tsx`, `NinjamationShell.tsx`, `TorqueShedWorkspace.tsx`, `FaultlineLabWorkspace.tsx`, `NinjaPoolHallShell.tsx` in `apps/web/src/components/module-shells/` |
| Shared account and shell | `apps/web/src/components/OperatorOSAccountMenu.tsx`, `OperatorOSChrome.module.css`, `SaasLayout.tsx`, `module-shells/OperatorOSEcosystemHeader.tsx`, `platform/PlatformCommandShell.tsx`, `platform/PlatformCommandShell.module.css` |
| Administration | `apps/web/src/components/pages/PlatformPage.tsx`, `TenantCommandCenterPage.tsx`, `apps/web/src/components/platform/PlatformWorkspace.module.css`, `apps/web/src/lib/platform-attention.ts`, `apps/web/src/app/app/page.tsx` |
| Messenger | `apps/web/src/components/TenantMessenger.tsx`, `TenantMessenger.module.css`, `apps/web/src/lib/messenger.ts` |
| Tests | `apps/api/test/ecosystem-guided-polish.test.ts`, `apps/api/test/platform-command-navigation-contract.test.ts`, `apps/web/e2e/ecosystem-guided-polish.spec.ts`, `ecosystem-messenger-polish.spec.ts`, `apps/web/playwright.ecosystem.config.ts` |
| Verification records | This report, `docs/IMPLEMENTATION_STATUS.md`, `docs/modules/MODULE_PARITY_INDEX.md` |

Local review images are under `build/ecosystem-polish/`: nine module dashboards
at three widths, OutCall availability, platform desktop/tablet/phone,
organization phone, and messenger desktop/phone/recipient selection. These
are local test artifacts with disposable or synthetic data, not customer or
deployment screenshots. Security detail is in `build/phase39/security-scan.json`.

## Delivery and rollback

The test-owned PostgreSQL container and its disposable data were removed after
verification. The browser harness stopped its local API and web processes.

The previous Core Suite pass is retained in base commit `dd49a95`. This pass
remains on its scoped branch. A source rollback can revert the scoped UI,
helper, test and documentation changes; no database rollback or migration is
needed. Existing API contracts remain compatible. Deployment and CI are not
claimed by local checks, and authenticated production/provider acceptance
remains separate from this interface pass.
