# TechDeck Auth Mapping

OperatorOS owns login, host sessions, tenants, billing, entitlements, module
launch, and platform-admin authority. The active TechDeck surface is the shared
runtime at `techdeck.operatoros.net`; the imported standalone server is a
source/rollback reference, not a second production authority.

## Active mapping

- The target host starts the exact OperatorOS SSO v1 state/nonce/PKCE flow.
- `/sso` accepts an opaque one-time code, never an identity JWT.
- Exchange creates a host-only session sealed to TechDeck and the selected
  tenant.
- `GET /api/modules/techdeck` and all TechDeck workflow APIs enforce tenant
  membership plus the TechDeck entitlement on the server.
- TechDeck `OWNER` is intentionally not granted from a client claim. Tenant and
  platform roles are resolved by OperatorOS; TechDeck maps only the minimum
  product permission needed after those checks.

## Retired standalone authority

The imported source may retain audited compatibility files, but the active
shell does not call local `/api/auth/login`, registration, reviewer-login, or
`/api/billing/checkout-session` and `/api/billing/customer-portal`. Those paths
must remain disabled/managed by OperatorOS if the snapshot is run for migration
testing.

No module code may create platform subscriptions, trust frontend tenant/role
fields, or restore the retired token-in-URL login lane.
