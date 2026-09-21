# Shared customers and account security

Status: local implementation, not deployed. Branch `codex/customer-workflow-readiness`
continues from `665c4e2`. This report supplements the earlier customer workflow
readiness pass; it does not mark all modules or the requested vendor connections complete.

## Customer experience

- A customer saved in TradeFlowKit appears in Shared customers throughout the
  enabled module shells. BrandForge OS and SnapProofOS can select that customer
  and fill the contact details without another entry.
- A new SnapProofOS customer also creates the common customer identity. The same
  customer can then be selected in TradeFlowKit or BrandForge OS.
- Module headers offer a shared customer search and editor. Changes to name,
  email, phone, address, and website appear in linked module views. The editor
  detects conflicting changes and asks the user to reload.
  Other open views obtain current details on their next load; cross-domain live
  push updates are not implemented.
- Brand names remain independent: a customer may have more than one brand.
  Choosing a customer does not automatically create a brand kit, job, invoice,
  report, or subscription.
- Private module notes and historical report/invoice contents are excluded from
  the shared view. Existing unlinked records are not matched or merged by name.
  New manual TradeFlowKit duplicates prompt users to select the saved customer.
- SnapProofOS directs shared contact edits to the common editor; inspection
  notes remain editable within SnapProofOS. Legacy unlinked customer records
  retain their existing edit behavior.
  Explicit service-site/contact selection and private details are preserved
  when creating a linked SnapProofOS customer.

## Implemented boundaries

OperatorOS's existing Business Directory is the canonical source. There is no
new external database vendor and no duplicate synchronization service to operate.
The common read projection includes organization name, website, primary contact,
and address only. Every join and mutation uses the server-validated tenant.
Reads require access to the destination module; source-module access is not
required and is not granted. Module sessions remain pinned to their module.
Viewer access cannot write. Responses containing shared customers are not cached.

TradeFlowKit and SnapProofOS creation use transactions. Linking an existing
customer is retry-safe with a tenant/customer lock. BrandForge's durable link
has a tenant-composite database foreign key and an audit entry; active customer
validation occurs within its transaction. Shared edits use a revision check,
row locks, and an audit event. Issued document bodies are not rewritten.

## Account security

- Authentication request limits now use atomic database counters shared across
  API instances, with hashed keys, bounded retention, and no fail-open behavior.
- Enrolled accounts must supply an authenticator or recovery code for password,
  sign-in email, and account deletion changes. Recovery codes remain single-use.
- Changing email sends a one-hour confirmation link to the new address. The old
  address remains active until confirmation. Confirming changes the address,
  verifies it, invalidates previous sessions, and attempts a notice to the old
  address. Delivery failures are handled without changing the address early.
- Account settings lists observed signed-in browsers and can revoke one browser.
  No raw session token, token hash, IP address, or full user-agent is returned.
  Existing browsers appear after their next authenticated request; native device
  sessions and dormant older browsers are not a complete device inventory.
  The existing sign-out-everywhere control remains available.
- Email confirmation removes the one-use token from the browser address before
  making the confirmation request.
- Saved generic service configuration no longer claims successful external
  delivery merely because a credential reference and callback flag exist.

Organization-wide MFA policies, passkeys, Microsoft/Google workplace sign-in,
and a full device-management policy remain unimplemented recommendations.

## Database and configuration

The ordered release appends v62 `shared_customer_links` and v63
`auth_security_controls`. v62 adds the canonical customer address and BrandForge
organization link/index/foreign key. v63 adds persistent authentication limits,
pending verified email changes, and observed browser sessions. Existing release
steps and tenant/billing authority are unchanged.

No new provider credentials are required for shared customers. Email confirmation
uses the existing email service configuration. A live provider and verified
sending address must be accepted separately; deterministic test email is not
inbox-delivery evidence. No Microsoft, Google, Intuit, Meta, LinkedIn, or X
environment keys are introduced because their live connectors are not implemented.

Before a production upgrade: follow `docs/DATABASE_BACKUP_RESTORE.md`, take and
verify a backup, review `corepack pnpm db:plan`, apply through the supported root
release path, verify v63/63, then deploy the matching application. The current
runtime remains verify-only. Do not run tests against persistent or production data.

Rollback: use the documented restore-to-new-database and traffic-switch procedure
for a database rollback. An application rollback may leave the additive columns
and tables in place; do not delete audit/session/customer rows as a shortcut.
Rolling back the account code also rolls back these new security guarantees.

## Verification

All database work below used a new disposable PostgreSQL 16 Docker container on
loopback with generated test credentials. No real customer or provider was used.

- Initial customer/security/regression suite: 48 passed, 0 failed, 0 skipped
  (88.475 seconds).
- Wider sign-in/SSO/module/shared-service regression sweep: 172 passed,
  0 failed, 0 skipped (128.313 seconds).
- Final repeatable focused runner: 154 passed, 0 failed, 0 skipped
  (110.330 seconds). After later focused corrections, customer/site/SnapProof
  checks passed 16/16 (23.714 seconds), and provider-readiness checks passed
  14/14 (22.354 seconds). These suites overlap; do not sum the counts.
- Clean ordered v63 release apply: passed in 16,154 ms. Second idempotent apply:
  passed in 642 ms. Independent current-release verification: passed.
- Production build, four workspace typechecks, and root lint passed locally.
- Final combined synthetic browser suite: 18 passed, 0 failed, 0 skipped
  (50.7 seconds). It includes customer selection/autofill, common editing, recovery, phone layout,
  scoped accessibility, individual browser revocation, pending email messaging,
  and the earlier core-suite/setup presentation checks.
- Security scan: no runtime findings or unresolved dependency advisories. Two
  previously disclosed patched high advisories remain tracked:
  `GHSA-5p2g-fcmc-qvqq`, `GHSA-w3rx-r6r6-pgpr`.

The wider verification uses actual API/database operations. Browser cases use
synthetic intercepted responses; they are not authenticated live acceptance.
The new repeatable runner creates and removes only its own disposable container:

```powershell
node scripts/verify-customer-workflows.mjs
$env:INTERNAL_API_URL='http://localhost:5001'
corepack pnpm build:production
corepack pnpm lint
corepack pnpm --dir apps/web exec playwright test --config playwright.ui.config.ts
node scripts/phase39/security-scan.mjs
git diff --check
```

The runner also accepts explicit repository test paths under `apps/api/test/`.
Test logs and synthetic screenshots are in `build/shared-customers*`.
The final confirmation results are recorded in `docs/IMPLEMENTATION_STATUS.md`.

Main changed source groups:

- `apps/api/src/lib/shared-customers.ts`, `shared-customer-db-init.ts`, and the
  directory/TradeFlowKit/BrandForge/SnapProof route files: canonical customer data.
- `apps/web/src/components/module-shells/SharedCustomerPicker.tsx`, its stylesheet,
  `OperatorOSEcosystemHeader.tsx`, and the three module workspaces: reuse/edit UI.
- `apps/api/src/lib/auth-{request-limits,email-change,browser-sessions,security-db-init}.ts`,
  existing auth/MFA/email/cleanup modules and auth routes: account controls.
- `apps/web/src/components/pages/{SettingsPage,AccountSessions,VerifyEmailPage}.tsx`
  and `apps/web/src/lib/auth.ts`: account UI and typed client operations.
- Release manifest/verifier, shared-provider configuration, focused API/browser
  tests, and `scripts/verify-customer-workflows.mjs`: persistence and verification.

## Selected external connections and remaining work

The owner selected both Microsoft 365 and Google Workspace, QuickBooks, Facebook,
LinkedIn, and X. These are confirmed product targets, not connected accounts.
Twilio remains the existing CallCommand choice. No new vendor was purchased,
no external message/post was sent, and no business account was connected.

| Service | Intended customer workflow | Current state | Account-side requirement and acceptance |
| --- | --- | --- | --- |
| Microsoft 365 | Selected mailbox intake/replies for TechDeck and PulseDesk; appointments for TradeFlowKit and CallCommand | Live mailbox/calendar connector not implemented | Platform owner registers the app; tenant administrator authorizes the chosen mailbox/calendar. Prove token renewal, intake deduplication, approved test reply, appointment update, disconnect, and tenant isolation. |
| Google Workspace | Gmail intake/replies and Google Calendar appointments alongside Microsoft 365 | Live mailbox/calendar connector not implemented | Platform owner registers the app and completes applicable consent review; tenant owner chooses the account/calendar. Prove watch renewal, duplicate notification handling, approved test reply, calendar conflict/update, and disconnect. |
| QuickBooks Online | Link shared customers; transfer approved TradeFlowKit invoices and reconcile payment status without changing OperatorOS subscriptions | Accounting connector not implemented; existing TradeFlowKit CSV workflows remain available | Platform owner registers the Intuit app; company owner connects a sandbox first. Prove explicit customer mapping, duplicate-safe invoice transfer, tax/item/account mapping, conflict handling, and reconciliation. QuickBooks Desktop is not included in this proposed scope. |
| Facebook | Approve and publish BrandForge content to selected business Pages | Publisher not implemented | Platform owner establishes Meta app access and any required review; Page administrator selects the destination. Verify actual publishing permissions with Meta before implementation; its documentation returned HTTP 429 during this research. Prove an approved test post, returned receipt, scheduling/retry behavior, and disconnect. |
| LinkedIn | Approve BrandForge posts for an authorized member or organization | Publisher not implemented | Platform owner obtains applicable LinkedIn product access; authorized account/Page administrator connects. Prove correct author selection, current API version, allowed scopes, publication receipt, and failure recovery. |
| X | Approve and publish BrandForge content to the selected X account | Publisher not implemented | Platform owner configures developer application access and applicable usage funding; account owner grants posting permission. Prove PKCE, refresh, publication receipt, duplicate handling, limits, and disconnect. |

Integration requirements: credentials encrypted server-side, expiring single-use
authorization state bound to user/tenant/provider, exact callbacks, consent
tracking, revocation, retry/idempotency handling, provider usage limits, and
tenant isolation. A connection belongs to the tenant and approved account;
it does not grant every module access to an entire mailbox. Social publishing
must require a selected destination and approval, not infer consent from saving
a customer or generating a draft. Customer-sharing does not imply marketing consent.

Primary references reviewed for implementation planning:

- [Microsoft Graph Outlook notifications](https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview)
- [Gmail watch](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch)
- [Google Calendar push notifications](https://developers.google.com/workspace/calendar/api/guides/push)
- [Intuit's OAuth integration example](https://github.com/intuit/quickbooks-online-mcp-server/blob/main/README.md)
- [LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-09)
- [X authorization with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)

Remaining application work also includes saved onboarding progress, a consolidated
attention list, organization MFA policy/passkeys/workplace login, vendor spending
controls, review/linking of older unlinked customers, and form-level shared data
use beyond the three implemented module forms. The earlier all-module report
continues to track module-specific operational gaps. Production backup/apply,
deployment, exact-host SSO, actual provider transactions, scanner-engine acceptance,
and the full authenticated visual/workflow pass remain separate open gates.
