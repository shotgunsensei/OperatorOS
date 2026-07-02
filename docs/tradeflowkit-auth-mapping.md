# TradeFlowKit Auth Mapping

## Ownership Rule

OperatorOS owns identity, login, sessions, SSO handoff, selected tenant, tenant
membership, platform roles, billing entitlements, module registry state, and
root super-admin authority. TradeFlowKit must not become a second source of
truth for these concerns after consolidation.

TradeFlowKit owns field-service workflows, module-local UI, settings, and
tenant-scoped module data.

## Current Source Behavior

The imported source still contains standalone auth and org behavior:

- Client auth helper calls `/api/auth/login`, `/api/auth/login/2fa`,
  `/api/auth/register`, `/api/auth/me`, `/api/auth/logout`, and
  `/api/auth/switch-org`.
- Server auth routes allow local registration, login, profile updates,
  password changes, and account deletion.
- `requireAuth` checks the local session user id.
- `requireOrg` checks the local session org id and then enforces
  OperatorOS-linked entitlement state for linked orgs.
- `requireOrgRole` and `requireFeature` use entitlement-aware access context.
- Org membership is stored locally in `memberships`.

This local behavior is preserved in Phase 14 for audit and compatibility only.
User-facing consolidated module launches should enter through OperatorOS SSO.

## OperatorOS SSO Mapping

The source contains `server/routes/sso.ts`, which consumes OperatorOS launch
payloads and maps them into local user/org/session state. The route references:

- OperatorOS user id and email.
- OperatorOS user role.
- OperatorOS organization or tenant id.
- OperatorOS plan/subscription fields.
- Tenant and user entitlement snapshots.
- Local org auto-provisioning for OperatorOS-linked organizations.

Phase 15 should align this route with the centralized OperatorOS SSO handoff
contract and remove any remaining direct local-login path from the normal
module user journey.

## Role Mapping

The Phase 14 adapter maps roles conservatively:

| OperatorOS role | TradeFlowKit adapter role |
| --- | --- |
| root platform admin | `admin` |
| `owner` | `admin` |
| `admin` | `admin` |
| `viewer`, `readonly`, `read` | `viewer` |
| other tenant member roles | `tech` |

TradeFlowKit local owner authority is not minted by the adapter. Root
super-admin access must come from OperatorOS server-side platform admin checks,
including the configured `john@shotgunninjas.com` root account policy.

## Entitlement Mapping

The adapter treats a user as entitled only when:

- the user is a platform admin, or
- OperatorOS entitlements include the `tradeflowkit` module by id, slug, or
  entitlement key with `enabled: true`, or
- a direct `tradeflowkit: true` style entitlement is supplied.

The imported source also contains `/api/operatoros/entitlements/sync` support
for OperatorOS-driven entitlement snapshots. Linked orgs are identified through
`operatorosTenantId` or `operatorosOrganizationId`.

## Billing Mapping

TradeFlowKit currently has local Stripe subscription and add-on surfaces such
as `/api/stripe/create-checkout`, `/api/stripe/create-portal`, Stripe Connect
routes, invoice payment links, and Call Recovery checkout behavior.

After consolidation:

- OperatorOS must own platform subscriptions, module purchases, add-ons, and
  entitlement changes.
- TradeFlowKit module subscription UI must route to OperatorOS billing.
- TradeFlowKit must not grant module access based only on local Stripe state.
- Stripe Connect and invoice customer-payment behavior require a separate
  Phase 15 review because those workflows may be tenant operational payments
  rather than OperatorOS subscription billing.

## Phase 15 Auth Tasks

- Redirect or remove standalone login/register screens.
- Replace direct local login calls with OperatorOS SSO launch/relaunch states.
- Keep `/api/auth/me` behavior compatible only as a module context endpoint if
  needed.
- Protect every TradeFlowKit API route with authenticated user, tenant/org
  membership, TradeFlowKit entitlement, and role authorization.
- Replace hardcoded admin bypasses with shared OperatorOS platform admin
  helpers.
- Verify missing entitlement is blocked by the server, not only hidden in UI.
