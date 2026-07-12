# OutCall SSO Integration

OutCall must use the OperatorOS module handoff contract; it must not add local
passwords, Supabase Auth, Replit Auth, or a second user directory.

## Parent launch flow

1. The signed-in web client calls `POST /api/sso/issue` with module id
   `outcall`; the selected tenant is conveyed by the normal active-tenant
   context, not trusted from arbitrary browser data.
2. Fastify `authenticate` validates the `operatoros_session` cookie/bearer JWT,
   loads the current user, rejects inactive/suspended users, and compares the
   token's `tokenVersion` to `users.token_version`.
3. The SSO route resolves tenant membership/status and invokes the canonical
   entitlement resolver for the same tenant. A planned/disabled module or
   missing OutCall entitlement fails closed.
4. OperatorOS signs a short-lived HS256 handoff with the shared
   `MODULE_SSO_SECRET`. Required claims include issuer, audience/module id,
   subject/user id, tenant id, roles/context, `iat`, `exp`, and unique `jti`.
5. The `jti` is persisted in `sso_handoff_tokens`; the launch URL is
   `https://outcall.operatoros.net/sso?token=<handoff>`.

## Child consume flow

The OutCall `/sso` endpoint must submit the handoff server-to-server to the
repository's `POST /api/sso/consume` contract (or faithfully use the shared
verification helper where deployment topology requires it). Consumption must
validate HS256 only, normalized OperatorOS issuer, audience `outcall`, expiry,
one-time `jti`, current user status/token version, tenant status/membership, and
current entitlement. A replay, role change, suspension, or revoked entitlement
fails closed and is audited.

After successful consume, create only an OutCall session projection keyed by the
stable parent `user_id` and `tenant_id`. The cookie is Secure, HttpOnly,
SameSite=Lax (or stricter where compatible), host-only to
`outcall.operatoros.net`, rotated on privilege changes, and backed by
PostgreSQL. Do not copy passwords or treat handoff claims as permanently valid.

## Authorization contract

- Derive `user_id` and `tenant_id` from the active server session.
- Recheck sensitive/long-running operations against entitlement introspection or
  a signed, fresh entitlement projection before provider submission.
- Reuse owner/admin/member roles for tenant administration. Introduce narrowly
  scoped OutCall permissions only where the parent role model is insufficient.
- Platform super-admin/support access is server-authoritative, reasoned,
  time-bounded, masked, and audited; it never reveals raw triggers by default.
- Preserve the repository's 401, masked 404, and 403 semantics.
- Parent logout/session invalidation is enforced through token version and short
  child-session/entitlement refresh intervals; Prompt 2 must specify the final
  revocation latency and tests.

## Required parent configuration

- `MODULE_SSO_SECRET` shared through Replit Secrets, never browser code.
- Parent SSO issuer/base URL using the repository-defined production value.
- Module registry entry `outcall`, canonical URL, and active entitlement only
  after launch approval.
- Entitlement receiver/introspection access through
  `OPERATOROS_SERVICE_TOKEN` if the existing propagation contract is used.
