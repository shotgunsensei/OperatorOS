# OutCall SSO Integration

OutCall is an active source/local add-on at `https://outcall.operatoros.net`.
Its workload, tenant-scoped persistence, entitlement guards, and test-adapter
verification suite exist. This is not deployed or live-provider readiness.

OutCall uses OperatorOS SSO contract v1:

1. Register `operatoros:outcall` with the exact `/sso` callback and `/logout`
   URI already present in the central registry.
2. Use the target-host state/nonce/PKCE transaction created by shared
   middleware.
3. Accept only an opaque one-time `code` plus `state` at `/sso`.
4. Exchange on the server, atomically consume the code, revalidate user,
   tenant, module status, and entitlement, and create a host-only session bound
   to OutCall and the returned tenant.
5. Protect OutCall APIs with `requireTenantMember` and
   `requireTenantModuleAccess('outcall')`; scope every record query by tenant.
6. Keep OperatorOS as the only identity, tenant, billing, and entitlement
   authority.

Do not add local passwords, Supabase/Replit Auth, shared HS256 browser
handoffs, token query strings, or a second Stripe subscription lane. See
`docs/auth/OPERATOROS_SSO_CONTRACT_V1.md` and
`docs/auth/MODULE_ONBOARDING.md` before enabling the registry entry.
