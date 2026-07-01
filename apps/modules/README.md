# OperatorOS Module Workspace

This directory is reserved for future module consolidation work.

No module implementation has been imported in Phase 1. The current production
surfaces remain in `apps/web`, `apps/api`, and the existing module shell routes.

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

- `techdeck`
- `pulsedesk`
- `tradeflowkit`

These folders are placeholders only. Do not import code into them until a
module-specific migration phase is approved.
