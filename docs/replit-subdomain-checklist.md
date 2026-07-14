# Replit Subdomain Verification Checklist

Manual steps to verify each already-attached OperatorOS hostname on the single
Replit deployment. Code-side host routing and public-URL generation are handled
in source (see `docs/subdomain-runtime-audit.md`); this checklist covers release
configuration and live behavior. No DNS migration is pending.

## 1. Deployment & environment

- [ ] The app is published as a single deployment (Next on the public port and
      Fastify on the private `5001` port). The shared API owns the authenticated
      runner routes; do not expose the legacy standalone runner-gateway port.
- [ ] `APP_ENV=production` and `NODE_ENV=production` in the deployment
      environment.
- [ ] `DATABASE_URL` points to the production PostgreSQL authority.
- [ ] `SESSION_SECRET` is set.
- [ ] `SSO_CODE_ENCRYPTION_SECRET` is set to a high-entropy hub-only value.
- [ ] `MODULE_SSO_SECRET` is set only if the bounded legacy rollback path is
      still enabled; it is not distributed to a child deployment.
- [ ] `OPERATOROS_BASE_URL=https://operatoros.net` is set on the unified
      deployment.
- [ ] `INTERNAL_API_URL=http://localhost:5001` is server-only and never appears
      in a public redirect.
- [ ] `TRUST_PROXY=true` is set only because the deployment is behind Replit's
      trusted proxy boundary.
- [ ] Legacy `APP_URL` is unset; `OPERATOROS_BASE_URL` is the only supported
      production platform override.

## 2. Attached custom domains and TLS

Confirm the already-attached apex, app/auth/api, and thirteen module hostnames
remain verified with valid TLS. The 2026-07-13 Replit screenshot confirms their
attachment; attachment alone does not prove the current source is deployed.

- [ ] `operatoros.net` (apex)
- [ ] `app.operatoros.net`
- [ ] `auth.operatoros.net`
- [ ] `api.operatoros.net`
- [ ] `techdeck.operatoros.net`
- [ ] `pulsedesk.operatoros.net`
- [ ] `tradeflowkit.operatoros.net`
- [ ] `torqueshed.operatoros.net`
- [ ] `faultlinelab.operatoros.net`
- [ ] `ninja-pool-hall.operatoros.net`
- [ ] `brandforgeos.operatoros.net`
- [ ] `snapproofos.operatoros.net`
- [ ] `studyforge-ai.operatoros.net`
- [ ] `ninjalaunchkit.operatoros.net`
- [ ] `callcommand-ai.operatoros.net`
- [ ] `ninjamation.operatoros.net`
- [ ] `outcall.operatoros.net`
- [ ] Each shows **Verified** with a valid HTTPS certificate (no browser
      warning).
- [ ] `operator-os.replit.app` is treated only as a deployment alias and is not
      accepted as an SSO callback, CORS origin, or absolute auth return target.

## 3. Per-host behavior

Open each host in a fresh (logged-out) browser and confirm:

- [ ] `https://operatoros.net` — marketing/root loads over HTTPS.
- [ ] `https://app.operatoros.net` — anonymous protected request redirects to
      `https://auth.operatoros.net/login` with a sanitized same-origin return
      path. The `Location` has no `:5000` and uses `https://`.
- [ ] `https://auth.operatoros.net` — renders the login surface.
- [ ] Every enabled module host enters the same protected module lane. Its auth
      request carries the registered client/callback plus state, nonce, and
      S256 challenge; OutCall remains a controlled planned/disabled surface.
- [ ] After signing in on the auth host, you are returned to the **original**
      subdomain you started from (module/app), not stranded on auth.
- [ ] A controlled Host-header integration test confirms an unknown
      `*.operatoros.net` request reaches the unknown-host state without being
      trusted. Do not require public wildcard DNS for this test.

## 4. Diagnostics

- [ ] `GET https://<each-exact-canonical-host>/api/diagnostics/public-url`
      returns JSON with
      the correct `hostRole`, `normalized` host, `publicOrigin`
      (`https://<host>`, no port), and `cookieDomainMode: "host-only"`.
- [ ] `environment` reads `production`.

## 5. Cross-subdomain SSO

- [ ] Launch each of the twelve enabled modules through OperatorOS and confirm
      an opaque, single-use `/sso?code=<opaque>&state=<binding>` establishes
      that module's host-only, module-and-tenant-bound session without leaving
      the code in browser history.
- [ ] Confirm OutCall remains a controlled planned/disabled surface and cannot
      issue or exchange a code or create a session.
- [ ] Confirm the auth request contains state, nonce, and
      `code_challenge_method=S256`, while the PKCE verifier remains HttpOnly on
      the originating host.
- [ ] Confirm replaying the callback code returns a bounded 409 error and does
      not create another session.
- [ ] Confirm no session cookie sets a `Domain` attribute and no JWT appears in
      URLs or browser storage.

## 6. Origin and CORS sanity

- [ ] Browser module traffic uses that module host's same-origin `/api/*`
      proxy and succeeds with the host-only session.
- [ ] A credentialed mutation whose `Origin` is a sibling
      `*.operatoros.net` host is rejected with `ORIGIN_HOST_MISMATCH` before
      the mutation runs.
- [ ] A request from an unrelated origin is rejected (no
      `Access-Control-Allow-Origin: *`).

## Troubleshooting

- **Redirect still shows `:5000`** — a code path is building a URL from the
  inbound host:port. Use `getPublicOrigin` / `resolvePlatformBaseUrl` instead.
- **SSO callback rejected with host mismatch** — verify the request reaches the
  same hostname registered in the code's exact `redirect_uri`, and confirm the
  proxy forwards the original host.
- **Module returns to login** — inspect whether that exact host received a
  host-only `operatoros_session`; the auth-host cookie is intentionally not
  shared across subdomains.
