# OperatorOS Module Workspace

This directory holds imported module snapshots and typed adapters for the
unified OperatorOS runtime. Production execution is owned by `apps/web` and
`apps/api`; module subdomains are host-routed into the shared Next/Fastify
deployment and render the module shells under `apps/web`.

The `source/` trees are migration inputs and rollback/audit references. Their
standalone web servers, login routes, sessions, billing endpoints, and deploy
configuration are not started by the OperatorOS workspace.

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

## Imported Modules

- `techdeck` - active shared-runtime shell plus imported source snapshot.
- `pulsedesk` - active shared-runtime shell plus imported source snapshot.
- `tradeflowkit` - active shared-runtime shell plus imported source snapshot.
- `torqueshed` - active shared-runtime Phase 7 automotive foundation plus a
  read-only source snapshot; database/runtime verification is still pending.
- `faultlinelab` and `ninja-pool-hall` - free-module source snapshots with
  partial native workflows; deeper product migration pending.
- `brandforgeos` and `snapproofos` - add-on source snapshots; runtime product
  APIs pending.
- `studyforge-ai`, `ninja-launch-kit`, and `callcommand-ai` - add-on source
  snapshots alongside partial native shared-runtime MVPs.
- `outcall` - planned/disabled architecture placeholder; no product workload.

`scripts/import-module-snapshot.ps1` is the required import path for any later
snapshot. A copied tree is never a production activation: each module still
needs its own authority-conformance and tenant-scoped workflow slices.
