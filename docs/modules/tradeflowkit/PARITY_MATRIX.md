# TradeFlowKit parity matrix

- Assessment date: 2026-07-28
- Canonical runtime: `C:\Dev\OperatorOS`
- Standalone reference: `C:\Dev\TradeFlowKit`
- Original upstream reference commit: `6d0c13df5e324f6aba9cdf2cf14a550d0cf0ca55`
- Restored product evidence commit: `37aa67f1da804fc3ac56f36e50e01362077d7a26`
- Quarantined evidence: `apps/modules/tradeflowkit/source`
- Phase 4 approved-scope result: state 4 candidate
- Phase 16 approved-scope restoration result: complete locally; not state 5
- State 5 result: blocked; the public OperatorOS read-only release gate passes
  48/48, while authenticated module workflow, provider, and data-cutover gates
  remain open

## Provenance

The original upstream worktree has 525 tracked files. Of the product files shared with
the quarantined snapshot, 317 match SHA-256 byte-for-byte. The snapshot omits
204 repository-agent/support files and has four deliberate quarantine/SSO
adaptations: `server/env.ts`, `server/routes/sso.ts`, `server/sso/consume.ts`,
and `tsconfig.json`. This commit is the recovered Phase 4 provenance baseline;
the snapshot is still read-only and outside the pnpm workspace.

Phase 16 additionally pins the clean restored branch at
`37aa67f1da804fc3ac56f36e50e01362077d7a26`. It adds real workflow templates,
workflow stages, team tasks, contacts, activity, and operations routes after
the original snapshot. `PHASE16_SOURCE_LEDGER.json` inventories 35 client
routes, 194 API routes, 40 tables, and 8 provider/config references from that
commit. The executable verifier reports zero unclassified items. After the
complete approved-scope restoration, it classifies 117 items active, 65 as
shared OperatorOS replacements, zero as open Phase 16 gaps, 45 as retired for
security, and 50 as retired by accepted product boundary. Counts are generated
by:

```powershell
corepack pnpm verify:tradeflowkit:phase16
```

Every inventoried source item is now either active, replaced by an
OperatorOS-owned shared service, or explicitly retired by an accepted
security/product boundary. State 5 remains blocked on deployed acceptance,
live-provider checks for enabled providers, and approved data cutover.

## Authority mapping

| Standalone concept | OperatorOS target | Disposition |
| --- | --- | --- |
| `users`, recovery codes, local login/registration, 2FA, sessions | OperatorOS users, host-only sessions, exact-host SSO | Rejected from module by ADR-0001/0002/0011 |
| `orgs`, memberships, invitations, role mutation | OperatorOS tenants, tenant users, module access | Rejected from module by ADR-0001/0011 |
| customers and contact fields | shared Directory organization/contact/site plus `tradeflowkit_customers` link | Implemented |
| subscription plans, checkout, portal, entitlements | OperatorOS billing and entitlement authority | Rejected from module by ADR-0001/0011 |
| platform Stripe webhook dedupe | OperatorOS billing webhook authority | Rejected from module |
| invoice/customer payment domain | TradeFlowKit invoices/payments; provider via approved adapter only | Manual/test implemented; production adapter gated |

## Source feature inventory and target parity

Status values: **complete**, **partial / Phase 16 gap**, **excluded by ADR**,
**deployment blocked**.

| Source feature / evidence | Canonical UI / API | Canonical data / service | Verification | Status |
| --- | --- | --- | --- | --- |
| Dashboard `/dashboard`, invoice dashboard query | `TradeFlowKitOperations`, `GET /operations` | live aggregate queries across leads/jobs/tasks/invoices/payments | state-5 workflow test | complete |
| Lead list/detail/CRUD, stats, pipeline | Lead Center; `GET/POST/PATCH/DELETE /leads` | `tradeflowkit_leads`, activity | lead and workflow tests | complete |
| Lead conversion `/leads/:id/convert` | Convert action and job deep link; `POST /leads/:id/convert` | transaction creates/reuses Directory org/contact, customer, numbered job, conversion links | duplicate conversion + tenant test | complete |
| Public lead forms/source adapters | none | none | ADR-0011 consent/abuse decision | excluded by ADR |
| AI scoring/qualification | none | none | deterministic-scope decision | excluded by ADR |
| Customers CRUD/import/bulk, `/customers/:id` | revenue flow record editor/deep link plus shared Business Directory; `POST/PATCH/DELETE /customers/:id`; bounded browser-parsed CSV import via `POST /customers/import` | versioned customer writes atomically reconcile the linked Directory organization/primary contact; dependency-guarded customer archive leaves shared Directory identity active; import retains shared idempotency, tenant advisory lock, normalized duplicate suppression, and deterministic source fingerprint | core CRUD PostgreSQL + exact-host E2E; customer-import PostgreSQL/static tests + directory E2E | complete for single-record create/read/update/archive and bounded import; destructive bulk delete/restore excluded by ADR-0011 |
| Jobs CRUD, schedule, assignment, events | operations board with full editor/deep link; `POST /jobs`, `GET/PATCH/DELETE /jobs/:id`; bounded CSV import and optimistic bulk status | numbered/versioned `tradeflowkit_jobs`, dependency-guarded soft archive, source fingerprints, activity | core CRUD plus bounded import/bulk PostgreSQL and exact-host workflow | complete |
| Recurring jobs and bulk destructive actions | none | none | ADR-0011 scheduling/retention decision | excluded by ADR |
| Workflow templates, stages, and job transitions | Workflow Studio; workflow CRUD/stage APIs; `POST /jobs/:id/workflow-transition` | `tradeflowkit_workflows`, `tradeflowkit_workflow_stages`, job stage FK, activity | Phase 16 work-management integration test | complete for ADR-0028 governed scope |
| Team task workspace | team list/search/detail plus full edit/status/archive UI and exact task deep-link selection; job-scoped create/dependencies/comments | `tradeflowkit_tasks`, `tradeflowkit_task_dependencies`, comments, activity | core CRUD exact-host/API restart workflow | complete for job-scoped ADR-0010 model; standalone task creation is excluded by the accepted product boundary |
| Job work steps (Phase 4 requirement) | task board; `POST /jobs/:id/tasks`, `PATCH/DELETE /tasks/:id`, dependency API | `tradeflowkit_tasks`, `tradeflowkit_task_dependencies` | dependencies, full record edit, archive ordering, stale version, restart | complete |
| Project endpoint requested by old acceptance probe | `/projects` intentionally absent | no project table | 404 acceptance probe | excluded by ADR-0010 |
| Job/record notes | comments UI-ready APIs | `tradeflowkit_comments` + activity | state-5 workflow | complete |
| Tags | `GET/POST /tags`, assignment API | `tradeflowkit_tags`, assignments | expanded state-5 workflow + full API suite | complete |
| Private attachments | shared job attachment routes | shared private attachment/blob/scan/job/usage/activity/outbox tables | Phase 3 24/24 | complete |
| Quotes CRUD, public view, acceptance, rejection, expiration | revenue flow with multi-line draft editor/archive/restore; public quote page/API; controlled response | numbered/versioned quotes + transactionally reconciled normalized quote items + token hash | document mutation, retention, public decision, and conversion tests | complete |
| Quote-to-invoice and quote-to-job | both conversion actions are idempotent | unique source quote plus quote row lock/link transaction | duplicate retry and tenant-isolation tests | complete |
| Invoices CRUD/public view/payment link/email | revenue flow with direct create, multi-line draft editor, bounded multi-line CSV import, history-safe archive/restore; public invoice page; public-link and messaging APIs | numbered/versioned invoices + transactionally reconciled normalized items + token hash + source fingerprints + shared outbox | document mutation, bounded import/bulk PostgreSQL, retention, exact-host workflow, public projection | complete; external provider processing remains fail-closed until configured |
| Manual payments/bulk mark paid | partial/full payment API plus bounded optimistic multi-select action | first-class payments, integer cents, balance invariant, shared idempotency, atomic linked-job update | manual partial, duplicate retry, and bulk settlement workflow | complete |
| Stripe Connect/provider checkout | test-only provider session/complete API | explicit disabled/test adapter and provider references | test adapter workflow | production adapter excluded pending reviewed centralized contract |
| Customer portal `/portal/:token` | anonymous responsive portal page/API | hashed customer portal token; bounded jobs/quotes/invoices | workflow API proof; browser deployment pending | complete locally |
| Lead email/SMS, quote/invoice email, reminders | `POST /:entityType/:entityId/message` | shared notification/outbox/provider worker, idempotency, activity | Phase 3 provider/outbox tests | complete for operator-triggered communication |
| Autonomous reminder/recurrence loops | none | none | ADR-0011 durable scheduling decision | excluded by ADR |
| Settings, numbering, tax/rate/business defaults | responsive settings form; `GET/PATCH /settings` | settings + atomic document sequences | expanded state-5 workflow + release apply | complete |
| Analytics `/analytics/*` | live operations metrics | persisted aggregate queries | state-5 workflow financial assertion | complete |
| Search/filter | lead and operations search/status filters | bounded limit/offset and tenant predicates | validation/compiler; browser deployment pending | complete |
| Global search and saved views | bounded cross-record search plus per-user create/apply/delete controls | tenant-scoped active-record queries and durable `tradeflowkit_saved_views` | exact-host persistence and deep-route workflow | complete |
| QuickBooks/Xero/IIF exports | authenticated customer/invoice/payment CSV links | tenant-scoped canonical CSV projections | state-5 invoice CSV assertion + full API suite | complete for canonical export; vendor formats excluded by ADR-0011 |
| Standalone version 1 core export/import | read-only scoped snapshot; deterministic dry-run; explicitly gated apply CLI | exact tenant/org/actor/user-map/fingerprint/backup gates; atomic advisory-locked apply; Directory + core workflow mappings; sanitized historical payments/activity; per-record refs; audit; exact money reconciliation | planner, command contract, and isolated apply/replay/drift/tenant/role tests | complete for bounded v1 core data; no real export or production apply occurred, and an approved later version is needed only for legacy data outside v1 |
| Trash restore/permanent purge | tenant-scoped retention center and versioned dependency-ordered restore | trusted tenant predicates over `deleted_at`/`archived_at`, activity and retention policy | PostgreSQL retention workflow plus exact-host restore | restore complete; permanent purge excluded by ADR-0011 |
| Review requests | shared message/outbox + activity, no duplicate domain table | shared services | Phase 3 tests | dedicated legacy table excluded by ADR |
| Call Recovery subscription/missed-call AI | none in TradeFlowKit | reserved for CallCommand boundary | ADR-0011 | excluded by ADR |
| Local auth/org/subscription/admin | none executable | OperatorOS authority | auth/SSO/entitlement suites | excluded by ADR |
| PWA/mobile shell | responsive Next shell/public pages | unified web runtime | web typecheck/build; deployed viewport smoke pending | complete locally |

## Test inventory

Standalone evidence includes route/unit tests for auth, entitlements, leads,
messaging, deployment readiness, analytics, and public pages. The canonical
tests do not execute that quarantined server. Active coverage is provided by:

- `tradeflowkit-state5-workflow.test.ts`
- `tradeflowkit-work-management.test.ts`
- `tradeflowkit-revenue-flow.test.ts`
- `tradeflowkit-document-mutations.test.ts`
- `tradeflowkit-customer-import.test.ts`
- `tradeflowkit-bulk-import.test.ts`
- `tradeflowkit-revenue-ui-static.test.ts`
- `tradeflowkit-shared-runtime-leads.test.ts`
- `tradeflowkit-import-plan.test.ts`
- `tradeflowkit-import-command-contract.test.ts`
- `tradeflowkit-import-apply.test.ts`
- `business-directory.test.ts` and browser E2E
- `shared-service-routes.test.ts` and other Phase 3 shared-service tests
- `core-module-deep-link-routing.test.ts`
- `tradeflowkit-customer-import.spec.ts`
- `tradeflowkit-core-crud.spec.ts`
- `sso-v1.spec.ts` and `operatoros-final-acceptance.spec.ts`

Fresh core CRUD evidence on 2026-07-28 includes a 2/2 focused PostgreSQL
workflow, workspace typecheck, production build, readiness-gated compiled
runtime, and 1/1 exact-host Chrome workflow in 16.4 seconds. The API workflow
proves viewer denial, cross-tenant non-enumeration, stale-version rejection,
Directory reconciliation, restart persistence, dependency-blocked archives,
and safe task → job → customer archive ordering. The browser workflow proves
the same customer/job/task create-edit-deep-link path, refresh, My Apps return,
module reopen, and archive controls on the production artifacts. Customer
archive intentionally preserves the shared Directory organization.

Fresh customer-import evidence on 2026-07-28 includes 5/5 focused
PostgreSQL/static checks, the clean API aggregate at 866 pass, zero fail, and
six intentional HTTP-only skips, workspace typecheck, production build, the
29-step compiled release, healthy/readiness responses, and a real exact-host
Chrome workflow. The current 1/1 browser gate starts at `/quotes`, completes
exact-path PKCE return, imports two valid rows while rendering one invalid-row
diagnostic, verifies both Directory reconciliation and database persistence,
refreshes the deep route, re-imports under a fresh key with zero new writes,
returns to My Apps, and passes a 390-pixel no-overflow check. The API workflow
separately proves exact same-key/same-body original-result replay and `409`
changed-body rejection. The prior browser workflow also covers quote/document
mutation and conversion. This is local production-mode evidence, not deployed
acceptance or a data cutover.

Fresh Phase 4 evidence includes 29/29 TradeFlowKit-focused tests, API/web
typechecks, the API/runner/Next production build, compiled health/readiness, a
syntactically valid-token public-route smoke, and 2/2 local production-host SSO
browser tests. The first complete API run reported 687 pass, 2 fail, and 6 skip
out of 695 because two older static tests used the renamed TradeFlowKit schema
heading as their slice boundary; the corrected Ninja Pool/PulseDesk boundary
regression passed 13/13. A later stale placeholder-card assertion was also
updated to require the completed TradeFlowKit shell to expose no migration
placeholder. The frozen-source aggregate passed 687, failed 0, and skipped 6
out of 693 in 346.8 seconds.

## Honest completion boundary

Phase 16 approved-scope source/local restoration is complete: the executable
ledger has zero gaps and zero unclassified items. Active behavior includes the
persisted workflow/revenue/customer/job/task/document/payment/portal/settings/
analytics surface, bounded customer/job/invoice import, optimistic safe bulk
updates, retention restore, global search, saved views, canonical export, and
the guarded version 1 core-data apply. Every omitted legacy surface has an
accepted security, authority, or product-boundary disposition; none is
presented as an inactive or mock feature. The synthetic import rehearsal does
not prove real customer data has moved.

State 5 additionally requires the cumulative revision to be deployed, public
verification, authenticated deployed TradeFlowKit browser workflow,
public-document smoke, real production provider acceptance for any provider
enabled at launch, and cutover reconciliation on an approved export.
