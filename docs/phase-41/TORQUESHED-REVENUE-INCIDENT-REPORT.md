# Phase 41 TorqueShed revenue incident report

Status: **source containment implemented; deployed transaction classification blocked on missing authenticated production and Stripe evidence**

Assessment date: 2026-08-15 (America/New_York)

## Decision

TorqueShed credit checkout is now governed by a server-authoritative composite
readiness contract. Outside explicitly disposable deterministic tests, the
checkout route fails before it creates a purchase intent or calls Stripe unless
all of these checks are green:

- `TORQUESHED_CREDIT_PURCHASES_ENABLED=1`;
- the shared Stripe adapter is configured;
- `TORQUESHED_CREDIT_PURCHASES_MODE` exactly matches `STRIPE_MODE`;
- the environment-specific TorqueShed catalog is validated;
- the canonical `/v1/billing/webhook` URL and every settlement event are configured;
- the purchase, append-only ledger, and shared webhook-receipt tables exist;
- the registered TorqueShed base URL yields a safe HTTPS diagnostic return route;
- the build has a valid release identity and, when configured, matches
  `TORQUESHED_CREDIT_PURCHASES_EXPECTED_RELEASE_COMMIT`.

The existing inline `price_data` implementation is deliberately classified as
`TORQUE_CATALOG_UNAVAILABLE` outside deterministic tests. Therefore the new
kill switch cannot be made green until Phase 42 provisions and validates the
durable Stripe catalog. Blocked attempts are tenant/user scoped and write a
redacted `token_purchase_readiness_blocked` audit event. They do not insert a
purchase-intent row and cannot grant credits.

## Preserved source state

| Field | Evidence |
| --- | --- |
| Starting branch | `main` |
| Preserved source commit | `973885f594f7e66c1ab5c1048d2da7360ad6b825` |
| Starting commit subject | `docs(phase40): record blocked certification evidence` |
| Working-tree state before Phase 41 | clean; no staged, modified, or untracked files |
| Worktrees before Phase 41 | one worktree at `C:/Dev/OperatorOS` |
| Phase 41 branch | `codex/phases-41-52-revenue-routes` |
| Source database release | v48 / 48 additive steps |

Phase 40 was safely preserved before this phase began. Its exact candidate
`4c24d818f5108aa0d049241c7ae386ae7787a211` was not deployed or certified. It
passed 11/14 clean-environment stages and remained blocked by 2,458 strict
parity issues, a TorqueShed source snapshot mismatch, and 118 static
route/control defects.

## Deployed truth captured read-only

Read-only HTTPS requests to the public health and readiness endpoints on
2026-08-15 returned one matching deployed identity:

| Field | Deployed value |
| --- | --- |
| Environment | public OperatorOS production surface |
| Commit | `6de0648da6d05423ab3bce8cc19460d6ff920d30` |
| Build ID | `31d4258255b052bf32692d89` |
| Built at | `2026-08-13T13:05:07.311Z` |
| Deployed at | `2026-08-14T22:55:03.889Z` |
| Database release | v44 / 44 steps |
| Last database step | `callcommand_complete_product_tables` |
| Stripe readiness projection | `configured` |
| OpenAI readiness projection | `configured` |

The public build is an ancestor of current source and contains the earlier
canonical TorqueShed webhook hotfix `b03ab43`. It is not the Phase 40 candidate
and does not match the Phase 41 source baseline. The executable read-only
command `corepack pnpm audit:revenue:torqueshed` reports
`TORQUE_RELEASE_IDENTITY_MISMATCH`, while also confirming that `/api/health`
and `/readyz` agree with each other.

The public readiness projection proves only that general provider variables
are present. It does not prove the Stripe account, test/live mode, durable
catalog, active Prices, webhook event subscription/delivery, a particular
purchase, or ledger settlement.

## Executed source route and contract

The deployed commit and current source use the following browser-to-provider
path:

1. `TorqueShedWorkspace.tsx` renders packages returned by
   `GET /api/modules/torqueshed/torque-assist/status`.
2. Roadside renders package key `roadside-25000`, 25,000 units, USD 500 minor
   units. The other server packages are Workshop (`workshop-100000`, 100,000,
   USD 1,500) and Fleet (`fleet-500000`, 500,000, USD 5,000).
3. The browser submits
   `POST /api/modules/torqueshed/token-purchases/checkout` with JSON
   `{ diagnosticSessionId, packageKey }` and an `Idempotency-Key`. It does not
   submit amount, currency, units, tenant, user, or payment state.
4. Next rewrites the same-origin `/api` path to Fastify
   `POST /v1/modules/torqueshed/token-purchases/checkout`.
5. The server revalidates the authenticated session, selected tenant,
   TorqueShed entitlement/write access, owned diagnostic, package manifest,
   module registry base URL, and idempotency key.
6. In deployed commit `6de0648…`, non-deterministic checkout calls
   `createUsageCreditCheckoutSession`. It creates one Stripe payment-mode
   Checkout Session using inline `price_data`; no durable TorqueShed
   `price_...` ID is selected.
7. The intended Stripe URL is the HTTPS URL returned by the Stripe SDK
   (normally hosted by Stripe). No authenticated capture was available in this
   execution context, so the exact returned host and Checkout Session ID for
   the reported attempt are not asserted.
8. The canonical signed settlement route is
   `POST /v1/billing/webhook`. TorqueShed metadata is classified before generic
   plan/add-on processing and settlement is purchase-scoped and idempotent.
9. Browser return parameters `tokenPurchase` and `purchase` are observation
   hints only. The authenticated status endpoint reads the server purchase and
   append-only ledger; query strings cannot settle a payment or grant credits.

## Reported attempt classification

The phase prompt describes a new $5 attempt for which the owner observed no
completed Stripe charge. It does not provide a Checkout Session, PaymentIntent,
Charge, Stripe event, OperatorOS purchase-intent ID, correlation ID, timestamp,
tenant, or user reference. This attempt must not be conflated with the older
paid-not-credited incident documented under `docs/hotfix/`, which named a
specific successful PaymentIntent and led to hotfix `b03ab43`.

For the new attempt:

- no credit has been granted by this work;
- no charge, refund, Stripe mutation, webhook replay, reconciliation apply, or
  production database mutation was performed;
- source evidence proves that deployed checkout uses inline `price_data`, not
  a stale durable TorqueShed Price ID;
- source evidence does not prove whether the user reached Stripe Checkout,
  canceled, encountered session-creation failure, used a stale browser asset,
  used another deployed account/mode, or has an unpaid local intent;
- the attempt therefore remains **unverified / reportedly unpaid**, not
  `paid`, `credited`, or `settled`.

Exact classification requires a guarded read-only lookup in the same Stripe
account/mode and production database. The required values are absent from this
workstation: production `DATABASE_URL`, Stripe read credentials, and deployed
test-user credentials are not configured. The safe next evidence is the
reported attempt's opaque purchase ID or Stripe reference plus a read-only
purchase/receipt/ledger and Stripe lookup. Do not create another Checkout
Session to investigate it.

## Containment and error truth

The authenticated status response now contains `purchaseReadiness` with:

- `ready`;
- stable `code`;
- safe `userMessage`;
- `retryable`;
- `administratorAction`;
- safe provider mode and catalog version;
- per-check booleans without secrets.

Checkout errors preserve the known machine code and add the Fastify request
ID, retryability, and administrator action. Unknown failures return
`TORQUESHED_ACTION_FAILED` (or preserve a safe existing machine code) and a
request reference. The customer UI distinguishes:

- purchase gate disabled;
- payment provider disabled or wrong mode;
- catalog unavailable;
- webhook confirmation unavailable;
- database release pending;
- invalid safe return route;
- release identity mismatch;
- insufficient credits;
- AI provider disabled/circuit open/rate limited;
- payment verifying, paid pending credit, credited, failed/expired, refunded,
  and disputed states.

The UI never treats the browser return as settlement. It says `Credits added`
only when the status endpoint confirms `state=credited`, exactly one purchase
credit exists, and the OperatorOS ledger reports the authoritative balance.

## Verification evidence

| Command | Result |
| --- | --- |
| `corepack pnpm --dir apps/api exec tsx --test test/production-env-preflight.test.ts test/torqueshed-revenue-readiness.test.ts test/torque-assist-static.test.ts` | PASS: 16/16, 0 failed, 0 skipped |
| `node --test scripts/phase41/audit-torqueshed-revenue.test.mjs` | PASS: 2/2 |
| `corepack pnpm typecheck` | PASS: API, runner gateway, web, and TorqueShed native |
| v48 `corepack pnpm db:apply` against disposable PostgreSQL 16 | PASS: clean apply of 48/48 additive steps in 17.496s |
| immediate v48 `corepack pnpm db:apply` reapply against the same disposable database | PASS: idempotent 48/48 reapply in 1.628s |
| `corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/torque-assist-workflow.test.ts` | PASS: 1/1 database-backed workflow |
| `corepack pnpm build:production` with `INTERNAL_API_URL=http://127.0.0.1:5001` | PASS: release metadata, Faultline compiler 4/4, typecheck, API, runner, web, and TorqueShed native builds |
| `corepack pnpm test:hotfix:torque-exact-host` against disposable PostgreSQL 16 | PASS: 1/1 compiled exact-host browser journey, including deterministic checkout, signed webhook, replay, reload, and persisted credited balance |
| `corepack pnpm audit:revenue:torqueshed` | Expected fail-closed result: release mismatch; public endpoints agree on deployed `6de0648…`, source is `973885f…` |
| `git diff --check` | PASS |

Database-backed and exact-host browser verification used only a disposable
loopback PostgreSQL 16 container and synthetic test secrets. The browser test
used the repository's explicit deterministic provider contract; it is valid
source/local proof, not live Stripe or deployment proof. Production/authenticated
browser capture, Stripe lookup, and production purchase/ledger inspection are
blocked by absent credentials and are not replaced with local deterministic
evidence.

## Acceptance gate

| Criterion | Result |
| --- | --- |
| No ambiguous purchase can start while readiness is not fully green | PASS in source contract; non-test catalog remains fail-closed until Phase 42 |
| No credit is granted for the reported no-charge attempt | PASS for this work; no live or local credit mutation performed |
| Root cause stated with executable evidence | PARTIAL: source/deployed contract and missing composite readiness are proven; exact transaction classification is blocked without its reference and production/Stripe read access |
| UI cannot imply purchased before paid-and-credited | PASS in source contract; terminal copy is driven by the authenticated server status |
| Focused API and browser tests | PASS locally: pure/static 16/16, workflow 1/1, exact-host browser 1/1; authenticated production and live Stripe evidence remain blocked |

Phase 41 source containment is safe to carry forward. Production purchases
remain closed. No production-ready, resolved-incident, or deployed claim is
made.

## Assigned corrective track

- Phase 42: create the versioned typed manifest, database mappings, idempotent
  Stripe Product/Price provisioning, validation, and Platform Command view.
- Phase 43: use only a validated persistent Price mapping at checkout and
  finish terminal-state purchase UX.
- Phase 44: execute signed test-mode settlement, replay, refund/dispute,
  reconciliation, and mathematical ledger proof.
- Phase 45: finish reservation/release/final-debit semantics and actionable
  provider/balance diagnostics.

## Operator action for the reported attempt

Do not mark it paid, grant a purchase credit, or initiate another live charge.
Obtain the original purchase reference or Stripe reference, identify the exact
account/mode, and run read-only reconciliation. If provider evidence proves no
successful payment, retain the unpaid/failed/abandoned classification. Any
courtesy credit must use a separately audited administrator adjustment with a
reason and must never fabricate payment settlement.
