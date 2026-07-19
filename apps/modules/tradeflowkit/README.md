# TradeFlowKit Module

## Consolidated Runtime Status

TradeFlowKit is an active module in the unified OperatorOS deployment. Its
source snapshot remains under `apps/modules/tradeflowkit/source`, but the
standalone server is not executed. The OperatorOS web shell is wired for the
registry-defined module route and local fallback:

- production host: `tradeflowkit.operatoros.net`
- local fallback: `/modules/tradeflowkit`
- command-center route: `/app/apps/tradeflowkit`

TradeFlowKit must preserve org/tenant-level shared workflow behavior and must
not collapse revenue-flow workflows into single-user-only logic.

## Boundary

OperatorOS owns login, sessions, SSO, tenant selection, roles, root
super-admin authority, billing, entitlements, and module launch. TradeFlowKit
owns field-service workflows, module UI, module settings, and tenant-scoped
module data.

The imported source still contains standalone local auth, local subscription
checkout, Stripe Connect, invoice payment links, org membership, and external
service integrations. Those paths are migration inputs and audit/rollback
references, not active production authorities. Revenue workflows must move
route-by-route into the shared API without reviving local auth or billing.

## Migrated product surface

The active shared runtime now includes:

- manual lead intake, pipeline, and idempotent conversion into a
  shared-directory customer and numbered job;
- jobs/work orders with first-class tasks, assignments, due dates,
  priorities, dependencies, comments, tags, attachments, audit, and deep links;
- normalized quote/invoice items, controlled public quote decisions,
  idempotent quote-to-invoice conversion, first-class partial/manual payment
  records, and persisted financial analytics;
- secure token-hash public quote, invoice, and customer portal pages;
- shared notification/outbox messaging, operating defaults/numbering, and
  tenant-scoped customer/invoice/payment CSV exports;
- repeatable standalone-export dry-run planning with source mappings, excluded
  authority counts, reference validation, and financial reconciliation.

See `docs/modules/tradeflowkit/PARITY_MATRIX.md`, `MIGRATION_PLAN.md`,
`CUTOVER.md`, ADR-0010, and ADR-0011 for the exact source disposition and
remaining deployed gate. The test payment adapter is test-only. Production
provider processing remains disabled until a reviewed centralized adapter is
configured; local login, child tenant/subscription authority, Call Recovery,
unsafe recurring generators, and destructive purge remain excluded.
