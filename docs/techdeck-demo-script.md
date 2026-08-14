# TechDeck Demo Script

## Setup

1. Sign in through OperatorOS.
2. Select a tenant that has the TechDeck entitlement.
3. Open Command Center.
4. Launch TechDeck.

## Demo Flow

1. Show the TechDeck header.
   - Confirm tenant context is visible.
   - Confirm role context is visible.
   - Confirm OperatorOS SSO is visible.
   - Confirm the production host badge reads `techdeck.operatoros.net`.

2. Show navigation.
   - Use the sidebar to jump to Tickets.
   - Jump to Assets.
   - Jump to Evidence.
   - Jump to IT Ops.
   - Jump to Reports.

3. Show authorization separation.
   - As root platform admin, confirm Platform Command appears.
   - As tenant admin or owner, confirm Module Settings appears.
   - As normal user, confirm Platform Command does not appear.

4. Show shell states.
   - Confirm loading state appears during tenant/module context resolution.
   - Confirm the ready empty state is polished and demo-safe.
   - Confirm the no-tenant state directs the user back to OperatorOS tenant selection.

5. Show return path.
   - Click Command Center.
   - Confirm the user returns to `/app`.

## Manual QA Matrix

| Scenario | Expected result |
| --- | --- |
| Launch from Command Center | TechDeck shell opens after OperatorOS entitlement check. |
| Direct `/modules/techdeck` visit | Same shell renders through local fallback route. |
| Direct `techdeck.operatoros.net` visit | Host router resolves to TechDeck shell. |
| Logged-out direct visit | User is redirected or shown OperatorOS login. |
| Missing TechDeck entitlement | Access denied is shown before shell render. |
| Root platform admin | Platform Command link is visible. |
| Tenant admin or owner | Module Settings link is visible. |
| Normal user | Admin-only controls are hidden. |
| Mobile viewport | Header actions and sidebar stack without overlap. |
| Browser refresh | Tenant and role context rehydrate through OperatorOS. |

## Notes For Live Demo

- Do not claim the imported standalone TechDeck route tree is fully native until the later route-mounting work is complete.
- Keep the product story focused on OperatorOS-controlled identity, tenant context, entitlement gating, and MSP workflow readiness.
- If a feature route is not yet mounted, use the shell section as the demo stop and state that full feature wiring is part of the next consolidation pass.

