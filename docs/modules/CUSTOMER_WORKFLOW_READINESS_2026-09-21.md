# Customer workflow and connection readiness

Date: 2026-09-21. Branch: `codex/customer-workflow-readiness`.
Starting source: `665c4e2` on a clean `main`.
Status: **LOCAL IMPLEMENTATION / LIVE WORKFLOW ACCEPTANCE STILL OPEN**.

This pass improves shared instructions, connection setup, failure recovery,
file scanning, email retries, and organization isolation. It does not certify
all application functions or claim that vendor services have been activated.
No production data, service account, billing catalog, or deployment was changed.

## Customer experience

- Audited the structured Help content: 15 product guides and 198 page guides.
  Replaced the remaining implementation terms in instructions, especially
  Platform Command. Product terminology in technical training and actual scripts
  remains meaningful; the language check is not a claim that every dynamic API
  error or every application screen has been rewritten.
- Added a first task, service requirements, completion check, and a verified
  canonical destination for OperatorOS and all 13 modules. Vendor names are
  searchable in Help. These cards describe requirements, not live account state.
- Shared services now presents email, texts, subscription payments, AI, and file
  checks before advanced settings. Configuration is explicitly distinguished
  from completed delivery. Unknown results do not appear ready.
- Loading and failed requests no longer produce invented zero counts or empty
  connection claims. PulseDesk has a working retry action. Organization changes
  remount the shared-services workspace so old responses and access keys cannot
  populate the new organization's screen.
- Matched shared panel colors, spacing, rounded corners, readable status labels,
  keyboard focus, and phone layouts. Advanced connection forms remain available.

## Operational repairs and new integration

**Email:** the shared Resend adapter now sends a stable, hashed idempotency key.
The outbox supplies an organization-and-delivery-specific identity, preventing
two organizations with the same caller key from sharing a vendor identity.
Resend retains its keys for 24 hours; this is not indefinite exactly-once delivery.
The existing persistent outbox remains the long-term record. No email was sent.
[Resend's documented behavior](https://resend.com/docs/dashboard/emails/idempotency-keys).

**Organization isolation:** all 12 queue counts and oldest-work calculations
on customer-facing shared-service routes now filter by the validated tenant.
The platform readiness probe intentionally retains aggregate health. Tests
inspect generated parameterized SQL for both organizations; database execution
is still an open verification gate in this environment.

**Files:** added a production ClamAV INSTREAM adapter to the existing shared
attachment worker. It sends bounded byte chunks without filenames or shell
commands, accepts only a complete scanner result, caps the response, applies a
deadline, and rejects uncertain results. Network failures throw a safe error so
the existing job retry policy applies while files remain blocked. Detected files
remain quarantined. Disabled configuration preserves the existing unavailable
behavior. No customer file was submitted to any service.

The scanner is off by default and ignored in normal and deterministic production
tests. Test harnesses strip its environment settings. Only loopback or private
IPv4 literals, plus IPv6 loopback, are accepted. This is a private service
integration, not an account with a public file-analysis vendor. ClamAV does not
authenticate or encrypt its TCP interface; use a trusted private network or
authenticated tunnel, never an Internet-exposed scanner port.
[ClamAV network guidance](https://docs.clamav.net/manual/Usage/Scanning.html),
[streaming protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html).

## Module completion map

Every row received setup guidance. Existing application functionality and
availability gates were retained. No row has been promoted to production parity.

| Module | First useful workflow | Connection or remaining functional gap | Acceptance still needed |
| --- | --- | --- | --- |
| TradeFlowKit | Customer → quote → invoice → payment | Existing Stripe Connect and email setup; merchant payments remain separate from platform billing | Saved invoice, approved test payment, payment receipt, second-user access |
| TechDeck | Ticket → assignment → service record → resolution | Existing shared notifications; remote script execution remains outside the product | Persisted team ticket, permissions, notification delivery |
| PulseDesk | Operational request → department → resolution | Direct intake exists; live mailbox adapters are still unimplemented | Persisted routing and privacy checks; separate mailbox implementation and consent |
| TorqueShed | Vehicle → tests → repair → proof | AI service and credit billing where required | Saved repair history, approved AI usage and billing test |
| FaultlineLab | Challenge → evidence → result | No new vendor required for built-in cases | Saved attempt, score, feedback and team assignment |
| Operator Pool Hall | Practice → game → history | No vendor required for local play; online availability must be checked separately | Completed saved game and reconnect behavior |
| BrandForgeOS | Brand → campaign → review → export | Existing AI; direct social/advertising publication remains unimplemented | Saved approved deliverable and export; separate publishing integration |
| SnapProofOS | Job → evidence → report → delivery | New private ClamAV adapter plus existing storage; not activated | Real scan, quarantine, authorized download and complete report |
| StudyForge AI | Sources → study set → practice → progress | Existing AI and usage allowance | Saved generated set, scoring, usage limits and reload |
| Deploy Ops | Brief → launch package → review → export | Existing AI; deployment and publication remain separate | Approved package and correct export contents |
| CallCommand AI | Business setup → number → receptionist → follow-up | Existing Twilio/OpenAI/Stripe; user confirms Twilio is in use | Real approved call, saved result, follow-up, number/payment/usage acceptance |
| Script Ops | Source → script → review → download | Existing AI; execution remains an authorized technician's task | Correct approved version, download and saved review history |
| OutCall | Availability review → verified destination → callback | Customer availability remains closed; do not enable by changing UI | Product activation review and approved end-to-end phone delivery |

## Vendor priorities and proposed enhancements

These are recommendations, not installed or purchased services. Prefer completing
the existing connections before adding recurring vendor costs.

1. **Complete Twilio + OpenAI + Stripe acceptance for CallCommand.** Existing
   source has guided setup and managed numbers. Verify one complete call and
   follow-up before expanding messaging. US business texting on local numbers
   also needs the applicable registration in Twilio.
   [Twilio messaging setup](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc).
2. **Finish Resend and Stripe Connect for TradeFlowKit.** Resend is already used
   for email; this pass improves retry behavior. Stripe Connect supports charging
   on each connected merchant's account. Confirm the existing merchant flow
   before adding an accounting synchronization product.
   [Stripe direct charges](https://docs.stripe.com/connect/direct-charges).
3. **Connect private ClamAV for shared files.** The new code supplies the missing
   production scanner adapter. It supports the shared attachment path used by
   evidence and report workflows; a healthy scanner does not prove every
   module-specific export format works.
4. **Microsoft 365 mailbox intake for PulseDesk and TechDeck is a useful next
   integration.** Graph supports mailbox change notifications. Implementation
   still needs organization-specific consent, mailbox scoping, renewal, missed
   event recovery, duplicate protection, and an operations-only data boundary.
   PulseDesk must not ingest patient inboxes. This connector was not added here.
   [Microsoft's mailbox notification contract](https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview).
5. **NHTSA vehicle lookup is a useful TorqueShed enhancement.** vPIC can decode
   manufacturer vehicle details and reduce manual entry. Add it as an explicit
   user-requested lookup with review before saving; preserve existing masked VIN
   storage. It is not diagnostic or repair evidence and was not integrated here.
   [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/).

For BrandForgeOS and Deploy Ops, choose the actual publication destination
before building a connector. For Script Ops and TechDeck, use the customer's
approved device-management tool rather than silently turning downloads into
remote execution. FaultlineLab, study tracking, and local Pool Hall do not need
an additional vendor simply to justify their existing workflows.

## Configuration and owner handoff

| Owner | Action | Evidence required |
| --- | --- | --- |
| Platform operator | Provision a maintained private ClamAV service with current signatures and permitted network access from the app | Scanner version/signature freshness; clean and approved detection-test results; failure leaves downloads blocked |
| Platform operator | Set `ATTACHMENT_SCANNER=clamav`, `ATTACHMENT_CLAMAV_HOST`, `ATTACHMENT_CLAMAV_PORT` (default 3310), `ATTACHMENT_CLAMAV_TIMEOUT_MS` (default 15000); existing maximum defaults to 10 MiB | Shared-services configuration plus successful real file workflow |
| Scanner operator | Set `StreamMaxLength` and `MaxFileSize` at least to `ATTACHMENT_MAX_BYTES`; set suitable archive limits and enable `AlertExceedsMax` and `AlertEncrypted` | Over-limit/encrypted/unsupported files do not receive an unsafe clean result |
| John / service-account owner | Confirm approved Twilio, OpenAI, Resend, Stripe accounts and the test destinations | Configuration in the deployment secret manager; no secrets in chat or Git |
| Developer / release operator | Restore a disposable PostgreSQL test environment and run shared-service persistence/RBAC suites and the full module browser suite | Fresh successful database-backed results before release |
| John / release operator | Review the candidate, authorize publication, then run exact deployed workflow acceptance | Deployed commit/build identity and per-module saved results |

Existing files are never automatically released. After configuring scanning,
an administrator can choose **Check file again** for an unavailable or failed
check. The existing administrator and enabled-module gates protect the route.
One transaction moves only an eligible, non-deleted file in the trusted
organization/module to pending, queues its version-specific scan, and records
an audit entry. Missing, foreign, infected, clean, or already pending files
cannot use this action. Network-failed pending jobs retain the existing job
retry controls. Real database execution of this recovery remains unverified.
There is no database migration in this candidate.

## Verification

Final confirmation after the rescan feature and last copy changes: focused
suite **31/31** (16.14 seconds), quality-gate suite **20/20** (1.16 seconds),
and browser suite **14/14** (58.4 seconds), all with zero failures/skips.
The final production build, root lint, security scan, and diff check passed.
The shared-services browser case also confirms a rescan request contains the
owning app and transitions the synthetic file to Waiting without a duplicate
request. Desktop and phone screenshots were visually inspected.

- Focused source/unit/protocol suite: 31 passed, 0 failed, 0 skipped. Includes
  all Help routes, language checks, connection-state handling, generated SQL
  scoping, Resend retries, local synthetic ClamAV sockets, transactional rescan boundaries with injected
  executors, and outbound isolation.
- `corepack pnpm build:production`: passed deployment-scope checks, catalog
  validation, all four workspace typechecks, and API/runner/web builds; 35 pages.
- `corepack pnpm lint`: passed. The current package defines this command even
  though the older repository instructions describe its prior absence.
- `corepack pnpm --dir apps/web exec playwright test --config playwright.ui.config.ts`:
  14 passed, 0 failed, 0 skipped in the first successful run (51.8 seconds).
  Synthetic API fixtures only. All 14 setup cards were checked; the previous
  11 main-module presentation cases also passed. No serious/critical axe finding
  in audited regions; phone horizontal-overflow checks passed.
- `node scripts/phase39/security-scan.mjs`: passed with no runtime findings and
  no unresolved dependency advisories. `corepack pnpm audit --prod --json` exited
  zero with two existing disclosed high advisory patch exceptions; not a claim
  that the advisory metadata contains zero records.
- `git diff --check`: passed.

The final web-only rebuild initially omitted the required `INTERNAL_API_URL`;
it failed before compiling and was rerun with the documented loopback value.

The first browser attempt failed two fixture checks: a keyboard interaction
occurred before Help hydration, and the local console URL omitted `/app`.
The tests now wait for working search interaction and use the correct local
route. These were corrected and rerun, not skipped.

Docker Desktop's Linux engine pipe is unavailable and its Windows service is
stopped. A hidden Desktop startup attempt did not provide the engine. No
persistent or production database was substituted. Shared-service database
integration, all-route authenticated acceptance, full-platform visual review,
live vendor transactions, ClamAV engine/signature acceptance, deployed SSO,
backup and rollback remain open. The pass must not be described as all modules
fully operational.

Exact focused test command:

```powershell
node --import tsx --test --test-concurrency=1 apps/api/test/attachment-rescan.test.ts apps/api/test/customer-readiness.test.ts apps/api/test/resend-delivery-retry.test.ts apps/api/test/shared-queue-tenant-scope.test.ts apps/api/test/clamav-scanner.test.ts apps/api/test/help-center-contract.test.ts apps/api/test/shared-platform-ui-static.test.ts apps/api/test/ecosystem-guided-polish.test.ts apps/api/test/deterministic-outbound-isolation.test.ts
$env:INTERNAL_API_URL='http://localhost:5001'
corepack pnpm build:production
corepack pnpm lint
node --test scripts/parity/quality-gates.test.mjs
corepack pnpm --dir apps/web exec playwright test --config playwright.ui.config.ts
node scripts/phase39/security-scan.mjs
corepack pnpm audit --prod --json
git diff --check
```

Artifacts: `build/customer-readiness-*.log`,
`build/customer-readiness-audit.json`, `build/customer-readiness/*.png`, and
`build/phase39/security-scan.json`. Synthetic visual evidence contains no
customer account, message, payment, or file.

Rollback: revert the scoped application changes and unset the four new scanner
configuration keys. No schema rollback is needed. Keep file quarantine and
existing outbox records intact. Removing the email retry repair removes vendor
duplicate-send protection; retain the repair unless a verified fault requires
its rollback. Never loosen download checks to work around scanner downtime.

## Changed files

- `.env.example`
- `PLANS.md`
- `apps/api/src/lib/clamav-scanner.ts`
- `apps/api/src/lib/shared-attachments.ts`
- `apps/api/src/lib/shared-notification-outbox.ts`
- `apps/api/src/lib/shared-platform-control-plane.ts`
- `apps/api/src/lib/shared-provider-adapters.ts`
- `apps/api/src/lib/shared-service-worker.ts`
- `apps/api/src/routes/shared-platform-routes.ts`
- `apps/api/src/routes/shared-service-routes.ts`
- `apps/api/test/attachment-rescan.test.ts`
- `apps/api/test/clamav-scanner.test.ts`
- `apps/api/test/customer-readiness.test.ts`
- `apps/api/test/resend-delivery-retry.test.ts`
- `apps/api/test/shared-queue-tenant-scope.test.ts`
- `apps/web/e2e/customer-readiness.spec.ts`
- `apps/web/playwright.ui.config.ts`
- `apps/web/src/components/help/HelpCenter.tsx`
- `apps/web/src/components/help/ModuleSetupGuide.module.css`
- `apps/web/src/components/help/ModuleSetupGuide.tsx`
- `apps/web/src/components/module-shells/PulseDeskConnectorConsole.tsx`
- `apps/web/src/components/pages/ServiceReadiness.module.css`
- `apps/web/src/components/pages/ServiceReadiness.tsx`
- `apps/web/src/components/pages/SharedServicesAdminPage.tsx`
- `apps/web/src/lib/auth.ts`
- `apps/web/src/lib/help/companion-module-guides.ts`
- `apps/web/src/lib/help/index.ts`
- `apps/web/src/lib/help/module-setup.ts`
- `apps/web/src/lib/help/operatoros-guides.ts`
- `apps/web/src/lib/help/primary-module-guides.ts`
- `apps/web/src/lib/service-readiness.ts`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/modules/CUSTOMER_WORKFLOW_READINESS_2026-09-21.md`
- `docs/modules/MODULE_PARITY_INDEX.md`
- `scripts/parity/lib/database.mjs`
