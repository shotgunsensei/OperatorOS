# OperatorOS Module Entitlement Integration Prompt

OperatorOS is the only source of truth for users, tenant membership, roles,
subscriptions, and module access. This module may own product data and
workflows, but it must consume—not recreate—those decisions.

## Implementation rules

- Require the OperatorOS host session on every protected request.
- Resolve tenant identity from the authenticated session. A module session is
  sealed to the tenant returned by SSO exchange; reject a conflicting path or
  `X-Tenant-Id` with `SESSION_TENANT_MISMATCH`.
- Require `requireTenantMember` followed by
  `requireTenantModuleAccess('<module-slug>')` for module APIs.
- Derive user ID, tenant ID, role, and module ID on the server. Ignore or reject
  authority fields supplied in request bodies.
- Re-evaluate user/tenant/module status and entitlement at authorization-code
  redemption and on protected API requests.
- Keep every module table tenant-scoped and include the active tenant predicate
  in every resource lookup, update, and delete.
- Return 404 for cross-tenant resource IDs where existence must be masked; use
  controlled 403 codes for known role, entitlement, or sealed-session denial.
- Write non-secret audit records for grants, denials, admin mutations, billing
  changes, and security events.

## Billing boundary

OperatorOS owns Stripe checkout, webhooks, plans, add-ons, and entitlement
materialization. A module can display an upgrade path but cannot infer payment
state or enable itself from client data. Webhooks must be signature-verified
and idempotent.

## SSO boundary

Use `docs/auth/OPERATOROS_SSO_CONTRACT_V1.md`. Browser callbacks carry only an
opaque one-time `code` plus `state`; identity JWT query strings and shared child
signing secrets are retired. Production legacy consume routes remain unmounted
unless an operator explicitly enables the emergency rollback flag.
