# OperatorOS SSO Contract

This compatibility path now points to the normative versioned contract:

- Human-readable protocol: `docs/auth/OPERATOROS_SSO_CONTRACT_V1.md`
- Machine-readable contract: `config/operatoros-sso-contract.json`
- Exact client registry: `config/operatoros-module-registry.json`
- Onboarding: `docs/auth/MODULE_ONBOARDING.md`
- Error catalog: `docs/auth/AUTH_ERROR_CATALOG.md`
- Environment names: `docs/auth/ENVIRONMENT_VARIABLES.md`
- Release gate: `docs/auth/VALIDATION_MATRIX.md`

SSO v1 is an exact-callback, state/nonce, PKCE S256, encrypted one-time-code
flow. The target host exchanges the code through the server, receives a
Secure/HttpOnly/SameSite=Lax host-only session bound to its tenant and module,
and removes the code from browser history. OperatorOS rechecks account,
tenant, module, role, and entitlement state before establishing that session.

JWT query-string handoffs, arbitrary return URLs, parent-domain cookies,
browser bearer storage, and module-local identity/billing authority are not
part of the current contract.
