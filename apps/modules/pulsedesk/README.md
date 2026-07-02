# PulseDesk Module

Phase 12 imports PulseDesk as a source snapshot under `source/` and adds a
thin OperatorOS adapter in `adapter.ts`. The imported source is intentionally
left intact so the first consolidation step is auditable and reversible.

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

## Phase 13 Status

The PulseDesk source is now converted toward OperatorOS-managed SSO:

- `/login` renders an OperatorOS launch/relaunch page, not a local credential
  form.
- client auth helpers no longer post local login/register credentials.
- protected PulseDesk APIs require an OperatorOS SSO session.
- normal users require an active PulseDesk entitlement snapshot.
- PulseDesk-local billing endpoints return managed-by-OperatorOS responses and
  no longer create Stripe checkout or portal sessions.

Some legacy billing/service files remain in the imported snapshot for audit and
rollback context, but they are not the active production authority.
