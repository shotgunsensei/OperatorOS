# PulseDesk Import Notes

Phase 12 imported PulseDesk into OperatorOS as the second consolidated module.
Phase 13 converts active PulseDesk-owned login, registration, and billing entry
points to OperatorOS-managed behavior while preserving major PulseDesk
functionality.

## Source Snapshot

- Imported from: `C:\Dev\PulseDesk`
- Imported to: `apps/modules/pulsedesk/source`
- Adapter: `apps/modules/pulsedesk/adapter.ts`
- OperatorOS shell: `apps/web/src/components/module-shells/PulseDeskShell.tsx`
- Command Center route: `/app/apps/pulsedesk`
- Local fallback route: `/modules/pulsedesk`
- Production host target: `pulsedesk.operatoros.net`
- Legacy standalone host: `pulsedesk.support`

The import copied source files, docs, scripts, server code, shared schema, and
client code. Runtime and local-only artifacts were excluded:

- `.git`
- `node_modules`
- `dist`
- `data`
- `coverage`
- `test-results`
- `playwright-report`
- `.next`
- `package-lock.json`

## Architecture Summary

PulseDesk is a Vite React client plus Express API backed by Drizzle/Postgres.
The imported package includes:

- Client shell and routes under `client/src`
- Express route registration under `server/routes`
- Auth, SSO, billing, admin, org, ticket, asset, vendor, and analytics routes
- Shared Drizzle schema under `shared/schema.ts`
- Role definitions under `shared/roles.ts`
- OperatorOS deployment and SSO documentation under `source/docs`

Core feature routes found in the imported client:

- `/dashboard`
- `/tickets`
- `/tickets/:id`
- `/submit`
- `/departments`
- `/assets`
- `/assets/:assetId/report-issue`
- `/supply-requests`
- `/facility-requests`
- `/vendors`
- `/analytics`
- `/email-settings`
- `/settings`
- `/admin`

## OperatorOS Wiring Added

Phase 12 adds a PulseDesk adapter that accepts OperatorOS context:

- `currentUser`
- `tenantId`
- `role`
- `entitlements`
- `platformAdmin`

The adapter returns a PulseDesk module context with:

- `moduleId: pulsedesk`
- `source: operatoros`
- local role mapping
- entitlement state
- production and legacy host metadata
- core route metadata
- `standaloneLoginMode: operatoros_managed`

The OperatorOS module route now maps the `pulsedesk` slug to
`PulseDeskShell`. The shell is tenant-aware through `TenantProvider`, uses
`hasPlatformAdminAuthority`, and displays Command Center return, tenant, role,
SSO, host, workflow, settings, loading, empty, and error states.

## Auth, Session, and SSO Findings

PulseDesk already contains OperatorOS-oriented SSO code:

- `server/routes/sso.ts`
- `server/auth/operatoros-sso.ts`
- `server/middleware.ts`
- `server/services/operatorosEntitlements.ts`

The imported source also still contains standalone auth behavior:

- `/api/auth/login`
- `/api/auth/register`
- `/api/auth/logout`
- `/api/auth/switch-org`
- local dev/reviewer fallback controls

Phase 13 disables duplicate login/register ownership. The `/login` page is now
an OperatorOS launch/relaunch screen, local client `login()` and `register()`
helpers throw managed-SSO errors, and protected APIs require
`req.session.authSource === "operatoros"` plus an active entitlement snapshot
unless the user is a server-side super-admin.

## Billing and Stripe Findings

PulseDesk documentation states that OperatorOS owns pricing, checkout,
subscriptions, seats, and entitlement state. However, the imported source still
contains legacy local billing code:

- `server/routes/billing.ts`
- `server/stripeClient.ts`
- `server/webhookHandlers.ts`
- `server/services/billingSync.ts`
- `shared/billingConfig.ts`
- `STRIPE_SETUP.md`

These files remain imported for audit and compatibility. `server/routes/billing.ts`
now returns OperatorOS-managed compatibility responses and no longer creates
Stripe checkout or portal sessions. OperatorOS should not route users to
PulseDesk-local checkout. Phase 16 should archive or remove unused legacy
billing code after central billing consolidation is verified.

## Tenant, Role, and Admin Findings

PulseDesk has its own org model:

- `orgs`
- `memberships`
- `operatoros_entitlement_snapshots`
- role enum values `owner`, `admin`, `supervisor`, `technician`, `staff`, and
  `readonly`

The OperatorOS adapter intentionally maps `owner` and `admin` to PulseDesk
`admin` instead of granting PulseDesk-local ownership. Root platform admin is
determined through OperatorOS server-verified platform admin helpers, not only
through UI logic.

The imported source contains master admin bootstrap behavior tied to
`john@shotgunninjas.com`. Phase 13 should replace module-local admin bypasses
with shared OperatorOS root super-admin enforcement wherever that logic is used
at runtime.

## Smoke and Manual Test Checklist

- PulseDesk source exists at `apps/modules/pulsedesk/source`.
- PulseDesk loads from `/app/apps/pulsedesk` for an entitled tenant.
- Loopback/preview development may use `/modules/pulsedesk`; production
  root/app path requests redirect to `https://pulsedesk.operatoros.net`.
- `pulsedesk.operatoros.net` resolves to the PulseDesk shell when host routing
  is enabled.
- Logged-out direct module visits redirect to OperatorOS login.
- Missing entitlement is blocked before module launch.
- `john@shotgunninjas.com` root platform super-admin is allowed server-side.
- Existing PulseDesk feature routes are still present in the imported source.
- PulseDesk-local checkout is not launched from the OperatorOS shell.
- PulseDesk-local login/register is not launched from the OperatorOS shell.
- `/login` shows OperatorOS launch/relaunch UI instead of credentials.
- `POST /api/auth/login` and `POST /api/auth/register` return
  managed-by-OperatorOS behavior.
- `/api/billing/checkout` returns managed-by-OperatorOS behavior if mounted.

## First Shared-Runtime Workflow

The department escalation queue is the first PulseDesk workflow promoted from
the retained source snapshot into the active shared runtime.

### Active API

- `GET/POST /v1/modules/pulsedesk/departments`
- `PATCH /v1/modules/pulsedesk/departments/:id`
- `GET /v1/modules/pulsedesk/assignees`
- `GET/POST /v1/modules/pulsedesk/requests`
- `GET/PATCH /v1/modules/pulsedesk/requests/:id`
- `POST /v1/modules/pulsedesk/requests/:id/transitions`

All routes require active tenant membership and PulseDesk module access. Read
responses expose only the server-derived
`capabilities.canManageWorkflow` flag needed by the shell. Write routes never
trust a client-supplied tenant, actor, role, status, number, version, or due
time.

### Additive Persistence

- `pulsedesk_departments`
- `pulsedesk_request_sequences`
- `pulsedesk_requests`
- `pulsedesk_request_events`

Startup DDL is idempotent. Department names are unique per tenant without case
sensitivity, request numbers use an atomic per-tenant sequence, updates use a
SQL version predicate, and the request-to-event foreign key restricts request
deletion so history cannot cascade away.

### Deliberate Boundary

This slice contains only bounded operational summary/location fields,
department routing, assignment, SLA state, and structured events. It adds no
notes, narrative descriptions, attachments, patient fields, email ingestion,
vendor workflows, local auth, billing, or new environment variables. The
standalone source remains retained for later reviewed slices.

## Exact Next-Step Recommendation

Run the staging database and browser checklist in
`docs/pulsedesk-manual-qa.md`, then review the next PulseDesk workflow as its
own tenant/security migration. Keep live subdomain SSO verification on the
release regression checklist.
