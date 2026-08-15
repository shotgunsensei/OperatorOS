# Phase 42 TorqueShed durable Stripe catalog report

Status: **source/local implementation accepted; real Stripe test catalog and live mutation remain operator-gated**

Assessment date: 2026-08-15 (America/New_York)

## Outcome

OperatorOS now owns one typed, versioned TorqueShed credit catalog,
`torqueshed-credit-v1`. Provisioning, checkout validation, authenticated API
responses, tests, and the Platform Command display all consume this manifest:

| Package key | Name | Units | One-time amount | SKU | Stripe lookup key |
| --- | --- | ---: | ---: | --- | --- |
| `roadside-25000` | Roadside | 25,000 | USD 5.00 | `TORQUESHED-ROADSIDE-25000-V1` | `operatoros_torqueshed_roadside_25000_v1` |
| `workshop-100000` | Workshop | 100,000 | USD 15.00 | `TORQUESHED-WORKSHOP-100000-V1` | `operatoros_torqueshed_workshop_100000_v1` |
| `fleet-500000` | Fleet | 500,000 | USD 50.00 | `TORQUESHED-FLEET-500000-V1` | `operatoros_torqueshed_fleet_500000_v1` |

No package name, amount, unit quantity, or currency changed. Product and Price
metadata includes `operatoros_product`, `module_slug`, `package_key`, `units`,
`currency`, `catalog_version`, `environment`, and `sku`.

## Durable mapping and checkout authority

Cumulative additive database release v49 adds
`torqueshed_stripe_credit_catalog`. The platform-owned table is unique by
account/environment/lookup key and by account/environment/Price ID. A mapping
cannot be classified `validated` unless it is active, has a validation
timestamp, and has no drift code.

Outside deterministic disposable tests, TorqueShed checkout now:

1. resolves the client package key against the canonical manifest;
2. requires the Phase 41 composite readiness gate;
3. resolves exactly one active, validated mapping for the runtime Stripe mode;
4. passes that persistent Price ID to Stripe Checkout;
5. never constructs inline TorqueShed `price_data`;
6. snapshots server-owned units, amount, and currency in the purchase intent;
7. still grants nothing until the signed webhook settlement path appends the
   purchase credit.

Missing, inactive, stale, drifted, wrong-mode, duplicate, or pre-v49 mappings
keep `TORQUE_CATALOG_UNAVAILABLE` red before a purchase intent or Checkout
Session can be created.

## Provisioning command

The command emits JSON and never prints the Stripe secret or webhook secret:

```powershell
# Read-only test-mode plan. Reports missing objects and drift without mutation.
$env:STRIPE_MODE='test'
$env:STRIPE_SECRET_KEY='<operator-supplied Stripe test secret>'
corepack pnpm stripe:provision:torqueshed -- --mode test --dry-run

# Explicit test-mode apply. Requires the supported OperatorOS database URL.
$env:DATABASE_URL='<approved OperatorOS test database URL>'
corepack pnpm stripe:provision:torqueshed -- --mode test --apply

# Read-only provider plus persisted-mapping validation.
corepack pnpm stripe:provision:torqueshed -- --mode test --validate

# Production revenue preflight includes live object and database validation.
corepack pnpm preflight:revenue:torqueshed
```

An apply resolves existing objects before creating anything. First apply
creates only missing Product/Price pairs. A second apply resolves the same
lookup keys and creates zero objects. The command rejects duplicate active
lookup keys, wrong-mode objects, inactive objects, recurring Prices, Product
or Price metadata drift, amount/currency drift, and Product mismatch. It
reports legacy `operatoros_torqueshed_*` lookup keys but never archives them.
An approved commercial change requires a new versioned manifest/lookup key and
a new immutable Price; it is not silently applied to v1.

Live apply requires all ordinary inputs plus two separate acknowledgements:

```powershell
# HUMAN GATE: run only after explicit live-mutation authorization in the same execution context.
$env:STRIPE_MODE='live'
$env:STRIPE_SECRET_KEY='<operator-supplied Stripe live secret>'
$env:STRIPE_EXPECTED_ACCOUNT_ID='<approved live account ID>'
$env:DATABASE_URL='<approved OperatorOS production database URL>'
$env:TORQUESHED_STRIPE_LIVE_APPLY_CONFIRM='CREATE_LIVE_TORQUESHED_CATALOG'
corepack pnpm stripe:provision:torqueshed -- --mode live --apply --confirm-live
```

This phase did not run that command and did not create, update, deactivate, or
archive any live Stripe object.

## Platform Command

Super administrators have a read-only **Credit Catalog** route at
`/app/platform/credit-catalog`. It displays package/name, amount, units,
lookup key, runtime mode, Product ID, Price ID, active/validation state, drift
code, and last validation time. The backing
`GET /v1/platform/torqueshed/credit-catalog` route uses the existing central
`requireSuperAdmin` gate. Object IDs are operational identifiers; no secret
is returned.

## Executed evidence

| Command | Result |
| --- | --- |
| focused manifest/provisioner/readiness/release/preflight tests | PASS: 20/20 |
| `corepack pnpm typecheck` | PASS: API, runner gateway, web, and TorqueShed native |
| cumulative v49 `corepack pnpm db:apply` against a fresh disposable PostgreSQL 16 database | PASS: clean 49/49 in 16.931s |
| immediate v49 reapply | PASS: idempotent 49/49 in 1.565s |
| database-backed catalog mapping/readiness plus Torque Assist settlement workflow | PASS: 2/2 |
| focused Platform Command/static/catalog/release tests | PASS: 16/16 |
| `corepack pnpm build:production` | PASS: Faultline 4/4, release metadata, typecheck, API, runner, web, and native builds |
| `corepack pnpm test:hotfix:torque-exact-host` | PASS: 1/1 compiled exact-host deterministic purchase, signed settlement, replay, reload, and persisted balance |
| real CLI `--mode test --dry-run` without a Stripe key | Expected fail-closed: `STRIPE_SECRET_KEY is required`; no mutation |

The redacted fixture at
`docs/phase-42/fixtures/torqueshed-test-provisioning-report.redacted.json`
documents the stable report contract. It is explicitly marked `fixtureOnly`
and is not evidence that Stripe test objects exist.

## Acceptance gate

| Criterion | Result |
| --- | --- |
| One canonical typed manifest | PASS |
| Durable v49 environment/account-specific mappings | PASS locally; clean apply/reapply verified |
| Checkout cannot use inline, stale, inactive, wrong-mode, or unvalidated Price | PASS in source and focused tests |
| Dry-run is read-only; test apply is idempotent; drift fails closed | PASS with deterministic Stripe adapter, including second apply and drift matrix |
| Platform Command read-only visibility | PASS in source/typecheck; deployment acceptance pending |
| Stripe test dashboard visibly contains the three intended pairs | BLOCKED: no Stripe test credential/account was available, so no provider mutation is claimed |
| Authorized live objects | NOT ATTEMPTED: explicit human gate |

The Phase 41 purchase kill switch must remain closed in every non-disposable
environment until the real test-mode apply and validate commands return
`safeToEnablePurchases=true`, the intended account is confirmed, and Phase 43
checkout acceptance is complete.

## Rollback and recovery

- Set `TORQUESHED_CREDIT_PURCHASES_ENABLED=0` first.
- Do not delete or archive provider objects automatically.
- Mark an invalid mapping inactive/stale through a reviewed additive repair;
  checkout will fail closed.
- Restore database state only through the approved restore-to-new-database
  procedure in `docs/DATABASE_BACKUP_RESTORE.md`.
- Revalidate Product/Price objects and database mappings before reopening.

No production database, provider, deployment, tag, merge, or release was
mutated by Phase 42.
