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

## Migrated Workflow: Manual Lead Center

The first production workflow now runs inside the shared OperatorOS runtime:

- UI: `apps/web/src/components/module-shells/TradeFlowKitLeadCenter.tsx`
- API: `GET|POST /v1/modules/tradeflowkit/leads`
- API: `GET|PATCH|DELETE /v1/modules/tradeflowkit/leads/:id`
- data: additive `tradeflowkit_leads` table, scoped by `tenant_id`
- access: authenticated tenant membership plus the tenant's TradeFlowKit grant
- audit: create, update/status, and delete events enter the tenant activity feed

This slice is manual lead CRUD and status tracking only. It does not activate
public capture forms, scoring, messaging, provider webhooks, lead-to-customer
or lead-to-job conversion, local login, or child subscription billing. Those
remain separate review and migration boundaries.
