# TradeFlowKit parity matrix

- Assessment date: 2026-07-18
- Canonical runtime: `C:\Dev\OperatorOS`
- Standalone reference: `C:\Dev\TradeFlowKit`
- Upstream reference commit: `6d0c13df5e324f6aba9cdf2cf14a550d0cf0ca55`
- Quarantined evidence: `apps/modules/tradeflowkit/source`
- Source/local consolidation result: state 4 candidate
- State 5 result: blocked; cumulative candidate is not deployed and the public
  OperatorOS release gate remains 32/47

## Provenance

The upstream worktree has 525 tracked files. Of the product files shared with
the quarantined snapshot, 317 match SHA-256 byte-for-byte. The snapshot omits
204 repository-agent/support files and has four deliberate quarantine/SSO
adaptations: `server/env.ts`, `server/routes/sso.ts`, `server/sso/consume.ts`,
and `tsconfig.json`. This commit is the recovered Phase 4 provenance baseline;
the snapshot is still read-only and outside the pnpm workspace.

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

Status values: **complete**, **excluded by ADR**, **deployment blocked**.

| Source feature / evidence | Canonical UI / API | Canonical data / service | Verification | Status |
| --- | --- | --- | --- | --- |
| Dashboard `/dashboard`, invoice dashboard query | `TradeFlowKitOperations`, `GET /operations` | live aggregate queries across leads/jobs/tasks/invoices/payments | state-5 workflow test | complete |
| Lead list/detail/CRUD, stats, pipeline | Lead Center; `GET/POST/PATCH/DELETE /leads` | `tradeflowkit_leads`, activity | lead and workflow tests | complete |
| Lead conversion `/leads/:id/convert` | Convert action and job deep link; `POST /leads/:id/convert` | transaction creates/reuses Directory org/contact, customer, numbered job, conversion links | duplicate conversion + tenant test | complete |
| Public lead forms/source adapters | none | none | ADR-0011 consent/abuse decision | excluded by ADR |
| AI scoring/qualification | none | none | deterministic-scope decision | excluded by ADR |
| Customers CRUD/import/bulk, `/customers/:id` | revenue flow + shared Business Directory | Directory org/contact/site and linked `tradeflowkit_customers` | directory E2E + state-5 workflow | complete for approved non-destructive scope |
| Jobs CRUD, schedule, assignment, events | operations board; `POST /jobs`, `GET/PATCH /jobs/:id` | numbered/versioned `tradeflowkit_jobs`, activity | state-5 workflow and restart | complete |
| Recurring jobs and bulk destructive actions | none | none | ADR-0011 scheduling/retention decision | excluded by ADR |
| Job work steps (Phase 4 requirement; not a standalone table) | task board; `POST /jobs/:id/tasks`, `PATCH /tasks/:id`, dependency API | `tradeflowkit_tasks`, `tradeflowkit_task_dependencies` | dependencies, completion, stale version, restart | complete |
| Project endpoint requested by old acceptance probe | `/projects` intentionally absent | no project table | 404 acceptance probe | excluded by ADR-0010 |
| Job/record notes | comments UI-ready APIs | `tradeflowkit_comments` + activity | state-5 workflow | complete |
| Tags | `GET/POST /tags`, assignment API | `tradeflowkit_tags`, assignments | expanded state-5 workflow + full API suite | complete |
| Private attachments | shared job attachment routes | shared private attachment/blob/scan/job/usage/activity/outbox tables | Phase 3 24/24 | complete |
| Quotes CRUD, public view, acceptance, rejection, expiration | revenue flow; public quote page/API; controlled response | numbered/versioned quotes + normalized quote items + token hash | public decision and conversion test | complete |
| Quote-to-invoice and quote-to-job | quote-to-invoice is idempotent; lead conversion creates jobs | unique source quote + transaction | duplicate retry test | complete |
| Invoices CRUD/public view/payment link/email | revenue flow; public invoice page; public-link and messaging APIs | numbered/versioned invoices + normalized items + token hash + shared outbox | workflow + public projection | complete for approved provider boundary |
| Manual payments/bulk mark paid | partial/full payment API; revenue actions | first-class payments, integer cents, balance invariant, idempotency | manual partial + duplicate retry | complete |
| Stripe Connect/provider checkout | test-only provider session/complete API | explicit disabled/test adapter and provider references | test adapter workflow | production adapter excluded pending reviewed centralized contract |
| Customer portal `/portal/:token` | anonymous responsive portal page/API | hashed customer portal token; bounded jobs/quotes/invoices | workflow API proof; browser deployment pending | complete locally |
| Lead email/SMS, quote/invoice email, reminders | `POST /:entityType/:entityId/message` | shared notification/outbox/provider worker, idempotency, activity | Phase 3 provider/outbox tests | complete for operator-triggered communication |
| Autonomous reminder/recurrence loops | none | none | ADR-0011 durable scheduling decision | excluded by ADR |
| Settings, numbering, tax/rate/business defaults | responsive settings form; `GET/PATCH /settings` | settings + atomic document sequences | expanded state-5 workflow + release apply | complete |
| Analytics `/analytics/*` | live operations metrics | persisted aggregate queries | state-5 workflow financial assertion | complete |
| Search/filter | lead and operations search/status filters | bounded limit/offset and tenant predicates | validation/compiler; browser deployment pending | complete |
| Saved views | none; no source-owned durable saved-view table found | none | source audit | not source scope |
| QuickBooks/Xero/IIF exports | authenticated customer/invoice/payment CSV links | tenant-scoped canonical CSV projections | state-5 invoice CSV assertion + full API suite | complete for canonical export; vendor formats excluded by ADR-0011 |
| Standalone import routes | `import:tradeflowkit:dry-run` | deterministic plan, fingerprints, source mappings, reference and financial reconciliation | importer 2/2 | complete dry-run |
| Trash restore/permanent purge | archive semantics only | `deleted_at`/`archived_at`, retention policy | ADR-0011 | destructive purge excluded by ADR |
| Review requests | shared message/outbox + activity, no duplicate domain table | shared services | Phase 3 tests | dedicated legacy table excluded by ADR |
| Call Recovery subscription/missed-call AI | none in TradeFlowKit | reserved for CallCommand boundary | ADR-0011 | excluded by ADR |
| Local auth/org/subscription/admin | none executable | OperatorOS authority | auth/SSO/entitlement suites | excluded by ADR |
| PWA/mobile shell | responsive Next shell/public pages | unified web runtime | web typecheck/build; deployed viewport smoke pending | complete locally |

## Test inventory

Standalone evidence includes route/unit tests for auth, entitlements, leads,
messaging, deployment readiness, analytics, and public pages. The canonical
tests do not execute that quarantined server. Active coverage is provided by:

- `tradeflowkit-state5-workflow.test.ts`
- `tradeflowkit-revenue-flow.test.ts`
- `tradeflowkit-shared-runtime-leads.test.ts`
- `tradeflowkit-import-plan.test.ts`
- `business-directory.test.ts` and browser E2E
- `shared-service-routes.test.ts` and other Phase 3 shared-service tests
- `core-module-deep-link-routing.test.ts`
- `sso-v1.spec.ts` and `operatoros-final-acceptance.spec.ts`

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

The source/local implementation is a state 4 candidate because approved
workflows are implemented and the excluded legacy surfaces have accepted ADR
dispositions. It is not state 5. State 5 requires the cumulative revision to
be deployed, public 47/47 verification, authenticated deployed TradeFlowKit
browser workflow, public-document smoke, real production provider acceptance
for any provider enabled at launch, and cutover reconciliation on an approved
export.
