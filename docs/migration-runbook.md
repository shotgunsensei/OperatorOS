# OperatorOS Module Migration Runbook

Status: Phase 1 preparation runbook. Do not use this as approval to import a
module. Each module migration still needs its own implementation phase.

## Pre-Migration Gate

Before migrating any module:

1. Confirm OperatorOS typecheck passes.
2. Confirm registry and route-contract tests pass.
3. Confirm root super-admin behavior is server-side and tested.
4. Confirm shared session and host-routing behavior for the target host.
5. Confirm module catalog slug and subdomain mapping.
6. Confirm entitlement source and tier/add-on ownership.
7. Confirm rollback plan.

## Migration Steps

1. Create a module-specific branch.
2. Snapshot current module behavior and deployment assumptions.
3. Add module-local folder structure only.
4. Add module config with slug and display metadata.
5. Add server-side entitlement guard.
6. Add module UI behind the guard.
7. Add module-local data with tenant id on every tenant-owned row.
8. Add tests for unauthenticated, unentitled, wrong-tenant, and valid access.
9. Run typecheck and targeted tests.
10. Run module smoke through both command-center launch and direct host routing.

## Hard Stops

Stop migration if any step requires:

- Duplicating login.
- Duplicating billing.
- Processing Stripe webhooks inside the module.
- Trusting browser-provided tenant ids.
- Exposing private env values.
- Weakening `requireSuperAdmin`, tenant checks, or entitlement checks.
- Removing existing working OperatorOS routes.

## Rollback

Rollback should be possible by:

- Removing the module-local mounted route or feature flag.
- Leaving OperatorOS auth, billing, tenant, and entitlement systems untouched.
- Keeping legacy external module deployment available until the new subdomain is
  verified.

Never redirect a live legacy module domain to a new OperatorOS subdomain before
DNS, HTTPS, auth, launch, and entitlement checks pass.
