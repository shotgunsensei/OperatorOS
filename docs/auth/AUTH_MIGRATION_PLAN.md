# SSO contract v1 migration and rollback

## Ordered rollout

1. Rotate the credential removed from `.replit` and purge it from deployment configuration/history as appropriate.
   For admin/demo rows created by an older release, set new deployment-secret
   values and run `pnpm --dir apps/api security:rotate-seed-credentials` once;
   the command also increments `token_version`. Unset the plaintext rotation
   values when operational policy permits and verify the former credentials fail.
2. Configure `SESSION_SECRET`, the hub-only code-sealing secret, trusted proxy handling, database access, and internal API routing on the single OperatorOS deployment.
3. Deploy the shared Next/Fastify runtime containing `/sso` and `POST /v1/sso/browser-exchange`.
4. Verify the already-attached apex, `app`, `auth`, `api`, and all 13 module
   subdomains route to that same deployment and match the exact-host registry
   callbacks. This is an application-release check; no DNS migration is
   required for the domains shown in the Replit deployment. The default
   `operator-os.replit.app` alias is not a callback or trusted auth origin.
5. Run DB-backed replay/expiry/entitlement tests and authenticated browser smoke one module at a time before opening production traffic.
6. After the rollback window, remove dormant standalone receiver deployment instructions, per-client exchange secrets, legacy `/consume`, and JWT query handoff helpers.

## Rollback

Rollback is deployment-version based. Disable the affected module registry entry
and restore the prior OperatorOS release plus its prior environment set from
the secret manager. Do not route a single module host to a standalone server as
a partial rollback; that would recreate split identity/session authority. Do
not re-enable JWT query-string handoff. Existing v1 codes expire after 60
seconds and may be left to expire. Host-only sessions can be invalidated by
clearing the host cookie and incrementing OperatorOS token versions for global
revocation.

## Known migration boundary

The repository retains legacy verification helpers, consume aliases, and
imported standalone adapters for a bounded rollback window. Production leaves
legacy consume routes unmounted unless `ALLOW_LEGACY_SSO_ROLLBACK=true` is set
for a time-boxed emergency rollback. They are not active runtime authorities.
The platform browser client and all thirteen enabled module clients use one
shared `/sso` page and a same-origin server exchange. Every exchange validates
exact host, state, nonce, PKCE, single-use persistence, and user status. Module
exchanges additionally validate tenant status/membership, global module state,
and entitlement before setting a module-and-tenant-bound host-only
`operatoros_session`; the platform client receives a host-only platform
session without tenant or module claims. OutCall uses the same contract for its
bounded Phase 12B workload.

The previously documented source blocker is resolved: the unified deployment
now contains the callback and server-side exchange. The 2026-07-13 live probes
still describe the currently deployed older release and remain red until this
source is deployed and re-probed. No browser client secret is used.
