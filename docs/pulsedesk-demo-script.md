# PulseDesk Demo Script

Use this script for a short OperatorOS ecosystem demo after Phase 13.

## Setup

- Use an OperatorOS account with a selected tenant.
- Confirm the tenant has the PulseDesk entitlement.
- Keep a second normal user or missing-entitlement tenant available if possible.
- Do not use PulseDesk-local credentials or local checkout during the demo.

## Flow

1. Open OperatorOS Command Center.
2. Select the target tenant.
3. Show the PulseDesk card with entitlement and status visible.
4. Launch PulseDesk through OperatorOS.
5. Confirm PulseDesk opens with tenant, role, and OperatorOS context.
6. Point out the return link to OperatorOS Command Center.
7. Open Tickets and show the clinical operations queue.
8. Open Departments or Assets to show operational visibility.
9. Open Supply Requests or Facility Requests to show support workflows.
10. Open Analytics or Settings only with an authorized tenant admin.
11. In Settings, show that account security and SSO controls point back to
    OperatorOS.
12. Visit `/login` directly and confirm it shows OperatorOS launch/relaunch UI,
    not a local password form.
13. Confirm no PulseDesk pricing or checkout path is presented as active.

## Talking Points

- OperatorOS owns identity, SSO, tenant context, module entitlement, and billing.
- PulseDesk owns healthcare operations workflows and module-specific UI.
- Protected PulseDesk APIs require OperatorOS SSO and entitlement state before
  workflow role checks run.
- Root/admin controls come from OperatorOS authority, not frontend-only hiding.

## Negative Checks

- Logged-out direct PulseDesk visit should not expose workflow data.
- Missing-entitlement launch should stop before the module opens.
- Normal users should not see Platform Command or tenant-admin controls.
- Local PulseDesk login/register and checkout should not be available.

## Demo Reset

- Return to OperatorOS Command Center.
- Confirm the selected tenant remains visible.
- Leave any live infrastructure failures documented as environment gaps rather
  than local PulseDesk feature failures.
