# Module onboarding for SSO contract v1

1. Add the client to both registry sources with its exact HTTPS callback,
   logout URI, origin, entitlement key, launch path, and contract version.
2. Add a module shell and adapter to the shared Next runtime. A separate
   workload requires an approved architecture decision based on runtime or
   scaling needs. It must still use OperatorOS identity, SSO, entitlement, and
   billing authority; never add a standalone login, platform billing authority,
   or competing session source.
3. Ensure host routing maps the exact module hostname to that registry entry;
   the shared middleware and `/sso` callback own state, nonce, S256 PKCE, and
   host-only session creation.
4. Add module API routes behind shared authentication plus server-resolved
   tenant and entitlement checks. Map roles only to narrower workflow
   permissions; never widen OperatorOS authority.
5. Keep deep links as validated local relative paths and reject `token`,
   `access_token`, `id_token`, and `refresh_token` query parameters.
6. Add tests for exact callback/host, expiry, replay, state, nonce, PKCE, missing
   entitlement, tenant mismatch, final URL cleanliness, and bounded errors.
7. Verify HTTPS/proxy handling, shared health/readiness, exact-origin CORS, CSP,
   no-store auth responses, local/global logout, and mobile shell behavior
   before enabling the registry entry.
