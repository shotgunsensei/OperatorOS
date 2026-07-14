# PulseDesk Module

PulseDesk is an active module in the unified OperatorOS deployment. The
`source/` tree is an imported snapshot retained for route-by-route workflow
migration, audit, and rollback; its standalone server is not a production
runtime.

## Imported Source

- Source snapshot: `apps/modules/pulsedesk/source`
- Adapter: `apps/modules/pulsedesk/adapter.ts`
- OperatorOS shell: `apps/web/src/components/module-shells/PulseDeskShell.tsx`
- Local fallback route: `/modules/pulsedesk`
- Command Center route: `/app/apps/pulsedesk`
- Production module host: `pulsedesk.operatoros.net`
- Legacy standalone host: `pulsedesk.support`

## Boundary

PulseDesk may own healthcare operations workflows, module UI, module-specific
settings, and module-local tenant data.

PulseDesk must not own login, registration, Stripe checkout, subscription
state, tenant membership, entitlement decisions, or root platform super-admin
policy inside OperatorOS.

## Phase 13 Status — Consolidated Runtime

The active `pulsedesk.operatoros.net` surface is served by the shared Next
module shell and Fastify API. OperatorOS owns login, the `/sso` browser
callback, host-only sessions, tenant/role resolution, entitlement checks,
billing, and audit. The imported source's hardened SSO/billing code is retained
as rollback evidence only and is not deployed as a second authority.

Within the imported snapshot:

- `/login` renders an OperatorOS launch/relaunch page, not a local credential
  form.
- client auth helpers no longer post local login/register credentials.
- protected PulseDesk APIs require an OperatorOS SSO session.
- normal users require an active PulseDesk entitlement snapshot.
- PulseDesk-local billing endpoints return managed-by-OperatorOS responses and
  no longer create Stripe checkout or portal sessions.

Some legacy billing/service files remain in the imported snapshot for audit and
rollback context, but they are not the active production authority.

## First Shared Workflow — Department Escalation Queue

The active shell now includes the first PulseDesk-owned workflow implemented
directly in the shared OperatorOS runtime. It provides tenant-scoped department
routing and PHI-minimized operational requests under
`/v1/modules/pulsedesk/*`.

- Any entitled tenant user may read the queue and create intake.
- PulseDesk module managers, tenant admins/owners, and platform admins may
  manage departments, routing, assignment, request fields, and controlled
  status transitions.
- The API derives tenant, actor, request number, initial status, version, and
  SLA due time. `dueAt` is recalculated from the immutable creation time when
  priority or patient-impact state changes.
- Assignees must be active users in the same tenant with current PulseDesk
  access. Missing and cross-tenant resources use the same not-found response.
- Structured request events are append-only. There are no notes, descriptions,
  attachments, patient fields, email, vendor, delete, local auth, or local
  billing endpoints in this slice.

The intake UI requires an explicit acknowledgement of this exact boundary:

> Operational information only. Do not enter patient names, MRNs, dates of birth, diagnoses, or clinical notes.

No new environment variables are required. The existing OperatorOS database,
session, tenant, module entitlement, and billing configuration remains the
authority.
