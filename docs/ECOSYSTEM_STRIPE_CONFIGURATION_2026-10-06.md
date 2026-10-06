# OperatorOS live Stripe configuration - 2026-10-06

Status: **LIVE STRIPE CONFIGURATION VALIDATED / PRODUCTION CREDIT CATALOG BOUND / RELEASE AND TRANSACTION ACCEPTANCE OPEN**.

The owner authorized adding missing Stripe configuration on October 6. This
continuation supersedes the October 5 lack of authenticated provider access.
It does not supersede the recorded source/local test results or imply that all
modules and customer payment workflows have passed production acceptance.

## Account and price evidence

The signed-in Stripe account is **OpOS**, `acct_1TU5WeLb6JkgBESX`. The existing
Replit server credential resolves to that exact account. Stripe reports live
charges and payouts enabled. Account identity was checked before provider
inspection or mutation. No secret value was printed, copied into this report,
or committed. Existing Products, Prices, subscriptions and customers were
preserved.

| Forward-sales item | USD amount | Live Price ID | October 6 action |
| --- | --- | --- | --- |
| TradeFlowKit | $149/month | `price_1U1ur1Lb6JkgBESXhGexJoSZ` | Existing; validated |
| PulseDesk | $149/month | `price_1U1ur1Lb6JkgBESXB7rWCTPj` | Existing; validated |
| TechDeck | $99/month | `price_1U1ur2Lb6JkgBESXQoZAKtj7` | Existing; validated |
| Additional eligible companion | $29/month each | `price_1U1ur2Lb6JkgBESXix4w0nFg` | Existing; validated |
| Additional operator seat | $15/month each | `price_1U1ur3Lb6JkgBESXeCTVX6gb` | Existing; validated |
| CallCommand additional concurrent lane | $49/month each | `price_1UNaZlLb6JkgBESXencjlAvs` | Product and Price created |
| CallCommand additional local number | $5/month each | `price_1UNaZlLb6JkgBESXuMONaXu1` | Product and Price created |
| CallCommand toll-free number | $8/month each | `price_1UNaZlLb6JkgBESXshS1TKYu` | Product and Price created |
| Torque Assist Roadside, 25,000 credits | $5 once | `price_1UNaZmLb6JkgBESX7vL06Gkc` | Product and Price created; production mapping validated |
| Torque Assist Workshop, 100,000 credits | $15 once | `price_1UNaZmLb6JkgBESXoL1SlSBX` | Product and Price created; production mapping validated |
| Torque Assist Fleet, 500,000 credits | $50 once | `price_1UNaZmLb6JkgBESXYlhN4TQN` | Product and Price created; production mapping validated |

Six eligible paid companions share the authoritative $29 additional-companion
Price: SnapProofOS, BrandForgeOS, StudyForge AI, Deploy Ops, CallCommand AI and
Script Ops. Old module add-on Prices are not the forward-sales authority.
Free TorqueShed, FaultlineLab and Operator Pool Hall access requires no paid
Price. Legacy catalog objects remain intact; OutCall sales remain closed.
The backend payment paths and inclusions are recorded in
[the commercial launch price matrix](ECOSYSTEM_COMMERCIAL_LAUNCH_2026-10-05.md).

The six new Products/Prices were created from the canonical amount/lookup-key
contracts after a complete missing-object plan. Creation used bounded amount
validation, matching live account/mode, duplicate/drift rejection and stable
idempotency keys. Torque Assist Product and Price metadata match the exact
`torqueshed-credit-v1` package, units, SKU, currency and environment contract.

## Portal and central webhook

- Live portal configuration: `bpc_1UNaVGLb6JkgBESXZ6yTKJdn`, active. Invoice
  history and payment-method updates are enabled. Subscription cancellation
  occurs at period end. Direct subscription-plan/quantity changes and pause
  are disabled. The headline is `Manage your OperatorOS billing`; the default
  return is `https://app.operatoros.net/?page=tenant-billing`. These fields
  were confirmed by Stripe API readback after saving.
- Existing webhook `we_1TU7rBLb6JkgBESXhqg9OGZz` was updated in place to
  `https://api.operatoros.net/v1/billing/webhook`. It is enabled/live and has
  all fourteen canonical settlement events plus the pre-existing
  `invoice.created` event. No endpoint or signing-secret rotation occurred.
  The existing `2026-04-22.dahlia` endpoint API version was preserved.
- Endpoint configuration validates. A hosted successful signed delivery,
  exact deployed signing-secret match and real settlement are still open
  acceptance checks. Configuration validation does not prove them.

## Replit configuration and production catalog

Seven non-secret settings were saved through Replit Configurations, read back
from the saved UI and mirrored in the canonical `.replit` shared environment:

| Setting | Binding |
| --- | --- |
| `STRIPE_EXPECTED_ACCOUNT_ID` | `acct_1TU5WeLb6JkgBESX` |
| `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` | `bpc_1UNaVGLb6JkgBESXZ6yTKJdn` |
| `STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY` | `price_1UNaZlLb6JkgBESXencjlAvs` |
| `STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY` | `price_1UNaZlLb6JkgBESXuMONaXu1` |
| `STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY` | `price_1UNaZlLb6JkgBESXshS1TKYu` |
| `STRIPE_WEBHOOK_ENDPOINT_URL` | Canonical API webhook above |
| `STRIPE_WEBHOOK_EVENTS` | Exact fourteen-event source contract |

The editor shell inherited older core Price IDs belonging to a different
catalog. The published production configuration contains the correct five
existing Price IDs, independently validated by Platform Health and Stripe.
The provider audit therefore used explicit, UI-verified non-secret bindings;
it is not a claim that the editor's inherited environment or the running
published process automatically changed. Account-level secrets were not
changed globally.

Production database access was selected explicitly in Replit's **Production
Database** UI. Its existing connection was supplied as hidden shell input,
used only in a scoped process, then unset and removed from temporary browser
memory/clipboard. No connection string was printed or saved to a file. A
read-only transaction confirmed a non-local primary database with 11 tenants,
13 registered modules and no live credit catalog mappings. The editor's
separate local database was not substituted for production.

The candidate's account-bound `provisionTorqueShedStripeCatalog` function was
executed from a temporary source copy against the existing catalog service.
The dry-run validated all three existing new Stripe pairs with zero creation.
For apply, provider Product/Price creation was explicitly forbidden; all three
validated mappings were collected and checked before calling the canonical
`persistTorqueShedCatalogMapping` service. The empty prior catalog was saved
privately before the three additive mapping writes. Readback confirms the
exact account, Products, Prices, active/validated state and no drift. Validation
times are October 6, 15:56:10-11 UTC. The published Platform Command Credit
Catalog independently shows all three rows as **validated**.

This changes three commercial configuration rows only. No schema migration,
tenant/customer record, subscription, purchase intent, credit balance or
financial ledger was changed. Credit-purchase activation remains off pending
the approved exact release and transaction acceptance. The database release
remains v65/65.

## Verification executed

| Scope and command | Environment | Result |
| --- | --- | --- |
| `corepack pnpm --dir apps/api exec esbuild src/lib/ecosystem-stripe-audit.ts --bundle --platform=node --format=cjs --tree-shaking=true --minify --outfile=../../build/launch/ecosystem-stripe-audit-provider.cjs` | Local candidate `6d3f60ae` | Compiled canonical read-only audit |
| Compiled `auditEcosystemStripe(client, env)` | Existing Replit live Stripe credential; explicit saved non-secret bindings | **11/11 prices validated; portal and webhook validated; zero issues** |
| Canonical catalog provisioner dry-run | Live Stripe account; provider creation forbidden | **3/3 validated; zero provider/database writes** |
| Canonical mapping service apply and readback | Explicit production database; live Stripe; provider creation forbidden | **3/3 exact mappings; zero new Stripe objects, charges or customer writes** |
| Published `/app/platform/credit-catalog` | Authenticated production administrator | **Three validated live mappings visible** |
| `corepack pnpm typecheck` | Local workspace | **Four workspace projects passed** |
| `corepack pnpm --dir apps/api exec tsx --test test/production-env-preflight.test.ts test/phase15-release-identity.test.ts test/database-release-contract.test.ts` | `APP_ENV=test`, `NODE_ENV=test`; invalid non-routable DB URL; static/mocked checks only | **22/22 passed; zero fail/cancel/skip/todo**, 5,904.5401 ms |

No tests used production or the developer's persistent database. Previous
full build, API, compiled browser and security evidence remains in the October
5 launch record; those large suites were not rerun for this configuration-only
continuation. Provider and mapping reports are retained in
`build/launch/stripe-provider-audit-2026-10-06.json` and
`build/launch/torqueshed-production-catalog-2026-10-06.json`. Screenshots are in
`build/launch/browser-captures/`.

## Release and remaining acceptance

The running public release remains `62fb640c64bd5477a8e5752301c17cb108ab6d2e`,
build `dbca1e6f06bbb7aa9bb2de15`. October 6 readiness reported ready/v65, with
deployment start `2026-10-06T08:31:11.606Z`. Source candidate `6d3f60ae` remains
unpublished. Replit editor HEAD `be62481a506c768c51d1669978c9c9e09d3c437d`
is an empty publication commit above `62fb640c`; its only inspected dirty
tracked file is the `.replit` configuration added during this continuation.
Preserve that hosted state when synchronizing the candidate.

1. Approve pushing the reviewed release branch, require fresh exact-commit
   release CI, preserve Replit's configuration, synchronize the tested source
   and approve publication. Keep production startup verify-only and database
   copy off. No new schema release is needed.
2. Verify the serving commit/build/v65 and effective production billing
   configuration. Enable Torque Assist only with live mode, its exact final
   release pin, validated durable mapping and all composite readiness checks.
3. Complete a specifically authorized low-value payment through the hosted
   checkout, signed webhook settlement, tenant entitlement/seat activation,
   credit grant where applicable, and cancellation/refund reconciliation.
   No actual customer charge or subscription was created in this continuation.
4. Prove non-admin new-tenant onboarding, module SSO/return/logout, persistent
   workflows and tenant isolation on the target release. Administrator access
   to twelve tools is not that evidence.
5. CallCommand still needs tenant voice setup, a published route and controlled
   Twilio call/recording/transfer acceptance. Its inspected runtime lacks the
   OpenAI Realtime SIP project/signature/SIP/model configuration. OutCall
   remains the thirteenth registered module, **coming soon**, until its own
   commercial/provider/controlled verified-self call acceptance passes.
   Shared provider-control-plane readiness and tenant-owned TradeFlowKit
   business-payment connections remain separate workflow requirements.

## Recovery

Keep `TORQUESHED_CREDIT_PURCHASES_ENABLED=0` to contain credit sales. Preserve
the new Stripe objects and signed payment/audit history; do not delete catalog
objects or reprice existing subscriptions. If a mapping drifts, use the
reviewed catalog service to mark it inactive/stale and revalidate before
reopening. Publication rollback restores the matching source/lockfile and
maintains validated provider settings. This continuation requires no schema
rollback; destructive restore or configuration removal is a separate approved
operation under `docs/DATABASE_BACKUP_RESTORE.md`.
