# October 23 launch candidate: billing integrity and truthful reads

Baseline: main `2db76299da96cdae82ddd0f596c16c1c81f73c57`, tree `b5acd3c98c451be322a2784484696bfbe08389fc`. Both isolated source candidates start at that baseline; their owned implementation/test files are copied or cherry-picked without overlap. Imported module trees, dependencies, schema67, pricing, provider settings and launch policy are unchanged.

## Customer-visible correction

A current-shaped Stripe invoice event now resolves its subscription from the discriminated invoice parent, including expanded references. Both canonical paid/failed handlers and exact-tenant propagation use the same normalizer. Matching legacy references remain compatible; conflicting valid references are rejected. The invoice is not lifecycle authority: existing provider retrieval, tenant/customer/current-generation binding, item checks, quarantine, entitlements, signatures and receipt leases/idempotency stay in place. Six modern dispatch cases failed on the immutable baseline; all pass on the candidate. [API scope and exact commands](STRIPE_INVOICE_COMPATIBILITY.md).

Account and organization billing now require a successful non-null Application Stack response. A failed required read renders unavailable with a read-only reload action, suppressing false-free/contract claims and new checkout/portal/companion controls. Optional usage failure does not erase a verified subscription. Existing free/active/pending/ended/legacy and role rules remain. [UI source, browser fixtures, commands and limits](BILLING_READ_TRUTH.md).

## Review and verification

The API reviewer independently passed 121 selected regressions plus 30 additional helper edge cases and attested all five committed blobs against `d89cbe1c0ac6cf55fe494d51097be3618d2c3ba4`. Fourteen authority/receipt/lifecycle function bodies and eight route/config/dependency paths were unchanged from baseline. The UI reviewer approved all six frozen files and independently passed 52 desktop/phone browser cases, strict spec/config typing and diff checks, including durable legacy plan/add-on controls. Local fixture screenshots use actual components with synthetic API/session boundaries and without full global CSS; they are presentation regressions, not authenticated/provider acceptance.

Combined root verification passed: 124 focused native tests (76 new invoice, 45 existing webhook binding and three cart controls), zero failures/skips; zero-warning root lint; read-only schema67/67 plan; and the production build including four workspace typechecks, API/runner/SDK compilation and 38/38 Next pages. Existing installed dependencies were reused through task-local junctions; no package acquisition occurred. API and UI source/test blobs match their independently reviewed candidates. Required full exact-head hosted release CI, including actual Fastify/disposable PostgreSQL commerce regressions, remains a source-merge gate. There is no confirmed existing disposable PostgreSQL fixture on this host, so no local SQL test or schema apply was attempted. The existing hosted workflow provisions its own isolated database. No failure is converted to a skip. Ordinary independent review is documented; no formal Codex Security scan completion is claimed.

## Current production truth

Read-only browser inspection followed by unauthenticated GETs at **2026-10-19T19:49:49Z** observed root `/api/health` and `https://api.operatoros.net/readyz` HTTP200, healthy/ready, serving SHA `2db76299da96cdae82ddd0f596c16c1c81f73c57`, build `91d5781465409e30c77448a5`, expected release67/67 ending `outcall_resource_tables`. Replit Publishing showed Live deployment `0b8abf19`; monitoring graphs rendered. Public pricing, terms and canonical login rendered; no form was submitted. Database overview 65.14MB is storage usage, not schema65. The historical live65 observation is superseded and must not trigger a migration.

The public database release number comes from the app manifest. Under the checked normal supervisor startup, the compiled verifier checks actual required structures before API traffic; readiness also probes database/worker/queues. This supports successful normal-start structural verification but does not independently attest the protected database identity or a recoverable current backup. Provider “configured” is not settlement/delivery acceptance. This new billing candidate has not been published or production-accepted.

## Smallest proposed launch and gates

Prioritize OperatorOS account/organization/role access and TradeFlowKit's customer → quote → linked job/invoice → recorded offline payment workflow. Existing exact-host desktop/mobile tests use pregranted disposable entitlements and synthetic accounts. A recorded “sent” status does not deliver a quote/invoice; offline payment recording does not charge a customer. Platform Stack billing is separate. No all-module production certification or OutCall activation is implied.

| Gate for Friday October 23 GO/NO-GO | Remaining qualifying evidence |
| --- | --- |
| Source | Independent final API/UI/integration review and green exact-tree required release checks |
| Auth/tenant/customer | Controlled owned-account login/deep links/logout, two-tenant isolation, roles and persisted first outcome on final deployed artifact |
| Paid Stack | Exact account/catalog/dedicated webhook binding and event version; approved test-mode checkout, failed/expired checkout, retry/duplicate/out-of-order and entitlement/seat reconciliation |
| Cancel/refund | Explicit owner-approved timing/refund/support policy consistent with cancel-at-period-end grace; public terms currently defer purchase details to checkout |
| Protected DB/recovery | Non-secret target attestation, current retained recoverable whole-platform backup and verified restore evidence, release67-compatible recovery and named operator |
| Monitoring/support | Probe/alert delivery, primary and backup owners, support access/coverage and escalation |
| Release | Separately authorized target/artifact publication and exact deployed identity/readiness/customer acceptance |

Any future database apply still requires exact target confirmation, recoverable backup, write pause and explicit approval. No new migration is selected. No live payment, event replay, customer creation, provider activation, credential/security setting change, recipient contact, spending or production database mutation occurred. Friday is a decision target, not unconditional launch approval. Until critical receipts close, the paid launch decision remains NO-GO while independent source work continues.
