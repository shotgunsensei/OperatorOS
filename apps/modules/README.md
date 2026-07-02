# OperatorOS Module Workspace

This directory holds imported module snapshots and module adapters for
OperatorOS consolidation work. The current production surfaces remain in
`apps/web`, `apps/api`, and the existing OperatorOS module shell routes.

## Intended Boundary

Modules placed here are child products of OperatorOS. They may own:

- module-specific UI and workflows
- module-local API routes
- module-local settings
- module-local tenant-scoped data

Modules must not own:

- login or account registration
- tenant membership
- platform roles or root super-admin policy
- Stripe checkout, billing webhooks, or subscription source of truth
- entitlement decisions
- cross-module registry state

OperatorOS remains the parent control plane for identity, tenants, billing,
entitlements, launch, SSO, and audit.

## Reserved Modules

- `techdeck` - imported as a source snapshot with an OperatorOS adapter.
- `pulsedesk` - imported as a source snapshot with an OperatorOS adapter.
- `tradeflowkit` - imported as a source snapshot with an OperatorOS adapter.

Do not import additional module source into this workspace until the matching
module-specific migration phase is approved.
