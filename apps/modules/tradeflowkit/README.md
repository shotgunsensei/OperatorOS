# TradeFlowKit Module

## Phase 14 Status

TradeFlowKit has been imported as a source snapshot under
`apps/modules/tradeflowkit/source` with an OperatorOS adapter in
`apps/modules/tradeflowkit/adapter.ts`. The OperatorOS web shell is wired for
the registry-defined module route and local fallback:

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
service integrations. Those paths are intentionally preserved for audit and
Phase 15 conversion. They must not become new OperatorOS sources of truth.
