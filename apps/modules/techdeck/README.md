# TechDeck Module Import

TechDeck is an active module in the unified OperatorOS deployment.

## Active OperatorOS Integration

- `adapter.ts` defines the OperatorOS-to-TechDeck context mapping.
- `apps/web/src/components/module-shells/TechDeckShell.tsx` is the active OperatorOS shell for `/modules/techdeck` and `techdeck.operatoros.net`.
- `apps/web/src/components/module-shells/TechDeckTicketQueue.tsx` is the first live shared-runtime workflow: a responsive, tenant-scoped technician queue.
- the shared middleware and Fastify API perform authentication, callback,
  tenant, and entitlement enforcement before rendering the shell.

## Active Shared-Runtime Workflow

The technician ticket queue persists in the namespaced `techdeck_tickets` table. Ticket numbers are allocated atomically per tenant through `techdeck_ticket_sequences`; reads and writes are constrained by the active tenant and ignore soft-deleted rows.

The API surface is:

- `GET /v1/modules/techdeck/tickets`
- `GET /v1/modules/techdeck/tickets/:id`
- `POST /v1/modules/techdeck/tickets`
- `PATCH /v1/modules/techdeck/tickets/:id`
- `PATCH /v1/modules/techdeck/tickets/:id/status`
- `DELETE /v1/modules/techdeck/tickets/:id` (tenant admin or owner)

Every route requires both OperatorOS tenant membership and TechDeck module access. Tenant and actor identifiers are server-derived. Assignees must be active members of the same tenant with TechDeck access, and lifecycle changes write tenant-scoped activity events.

This slice intentionally excludes standalone TechDeck clients, sites, assets, comments, SLA profiles, client-portal access, local identity, and billing. Those workflows remain source references until migrated behind the same OperatorOS authority boundary.

## Imported Legacy Source

The TechDeck source snapshot lives under `source/`.

Imported:

- `client/`
- `server/`
- `shared/`
- `tests/`
- `docs/`
- build/config files required to understand the standalone app
- image assets referenced by the TechDeck client

Excluded:

- `node_modules/`
- `dist/`
- `.git/`
- local runtime uploads under `data/`
- `package-lock.json`
- pasted prompt text artifacts from `attached_assets/`

## Boundary

OperatorOS owns identity, sessions, tenants, roles, billing, entitlements,
module registry, and platform admin authority. The imported TechDeck source is
not executed as an independent app. It is preserved for workflow migration,
audit, and rollback; `techdeck.operatoros.net` is host-routed into the shared
Next/Fastify runtime.

Do not re-enable standalone TechDeck billing, checkout, registration, or module entitlement authority from this directory.
