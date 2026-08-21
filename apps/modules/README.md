# OperatorOS Module Workspace

This directory holds imported module snapshots and typed adapters for the
unified OperatorOS runtime. Production execution is owned by `apps/web` and
`apps/api`; module subdomains are host-routed into the shared Next/Fastify
deployment and render the module shells under `apps/web`.

The `source/` trees are migration inputs and rollback/audit references. Their
standalone web servers, login routes, sessions, billing endpoints, and deploy
configuration are not started by the OperatorOS workspace.

## Historical retention and deployment scope

The source trees deliberately retain useful product code, screenshots, schemas,
and provenance manifests, but they are non-installable archives. The root
`pnpm-lock.yaml` is the only dependency graph allowed to influence GitHub,
Replit, CI, or a production build. Imported npm, Yarn, Bun, and pnpm lockfiles
are omitted because their standalone dependency graphs are stale, unreviewed,
and outside OperatorOS release authority. The root `preinstall` hook rejects
npm/Yarn installs and requires the pinned pnpm lifecycle; npm `devEngines`
rejects supported npm CLIs before installation. `.gitignore` and the bounded
filesystem scan in the deployment-scope gate catch any alternate lock that is
nevertheless created, including ignored locks.

`.replit` hides `apps/modules` from the default Replit file tree and excludes it
from Replit package guessing. Hiding is workspace organization, not an access
control or a claim that Replit's security scanner honors the same setting. The
executable deployment boundary is enforced separately by
`scripts/verify-deployment-scope.mjs`, the root workspace definition, the
frozen deployment build, and the Phase 39 security gate.

Removed dependency locks remain recoverable from Git history without keeping
them in the current deployment snapshot. To inspect one without restoring or
installing it:

```powershell
git log --all -- apps/modules/<slug>/source/pnpm-lock.yaml
git show <commit>:apps/modules/<slug>/source/pnpm-lock.yaml
```

Do not install or execute a historical source tree. Restore a historical file
only on a scoped research branch, and remove it again before merging into a
deployable branch. `scripts/import-module-snapshot.ps1` applies this retention
policy to all future imports.

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
- `outcall` - active shared-runtime verified-self exit-assistance workflow plus
  a read-only migration snapshot. Live Twilio activation remains an explicit
  deployment/provider gate.

`scripts/import-module-snapshot.ps1` is the required import path for any later
snapshot. A copied tree is never a production activation: each module still
needs its own authority-conformance and tenant-scoped workflow slices.
