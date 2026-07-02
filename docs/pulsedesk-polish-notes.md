# PulseDesk Polish Notes

Phase 13 keeps PulseDesk positioned as a healthcare operations module, not a
generic helpdesk. The visual direction is clinical, calm, and operations-first
inside the broader OperatorOS ecosystem.

## OperatorOS Shell

The OperatorOS PulseDesk shell now provides:

- PulseDesk module header.
- Tenant context.
- Role context.
- OperatorOS SSO badge.
- Production host badge.
- Return to Command Center.
- Module settings link for authorized tenant admins.
- Platform Command link for server-verified platform admins.
- Loading state.
- No-tenant state.
- Empty state.
- Error state.
- Workflow shortcuts for tickets, departments, assets, supplies, facilities,
  vendors, analytics, and inboxes.

## Imported PulseDesk App

The imported app now avoids standalone auth confusion:

- `/login` is an OperatorOS launch/relaunch screen.
- local username/password fields are removed from the auth page.
- reviewer account creation is removed from the auth page.
- Microsoft 365 login button is removed from the auth page.
- public landing CTAs point to OperatorOS module launch.
- sidebar includes a return link to OperatorOS Command Center.
- sidebar shows tenant and role context together.
- profile security points to OperatorOS account settings.
- authentication settings show OperatorOS SSO status instead of local/M365
  login administration.

## Navigation

The main user paths remain reachable:

- Dashboard
- Tickets
- Report issue
- Supplies
- Facilities
- Departments
- Equipment
- Vendors
- Analytics where authorized
- Inboxes where authorized
- Settings where authorized
- System Admin where authorized

## State Handling

Polished states added or preserved:

- OperatorOS launch required.
- SSO relaunch required.
- missing/expired/bad token.
- tenant context loading.
- no active tenant context.
- access problem routed through Platform Command.
- no current operations blockers.

## Admin/User Separation

- Normal users do not see Platform Command in the OperatorOS shell.
- Tenant admin/module settings links are visible only to tenant owner/admin or
  platform admin.
- Imported PulseDesk workflow actions still use local role checks after the
  OperatorOS SSO and entitlement gate.

## Demo Readiness Checklist

- The direct `/login` page does not show local credentials.
- Public CTA text says OperatorOS or Command Center.
- Sidebar shows OperatorOS return link.
- Tenant and role context are visible in the shell.
- The shell remains readable on mobile breakpoints.
- Empty and error states explain the operational problem without exposing
  secrets or stack traces.
