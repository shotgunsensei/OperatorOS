# Replit Subdomain Verification Checklist

Manual steps to verify each already-attached OperatorOS hostname on the single
Replit deployment. Code-side host routing and public-URL generation are handled
in source (see `docs/subdomain-runtime-audit.md`); this checklist covers release
configuration and live behavior. No DNS migration is pending.

## 1. Deployment & environment

Configure the values below in the published app's **Publishing → Edit Commands
and Secrets** pane. The checked-in `.replit` production block documents the
expected non-secret values, but it is not evidence that the published snapshot
received them. Replit editor secrets and development environment values must not
be assumed to carry into the deployment.

- [ ] The app is published as a single deployment (public HTTP/WebSocket
      gateway on the Replit port, Fastify on private `5001`, and Next on private
      `5002`). The shared API owns authenticated socket and runner routes; do
      not expose the legacy standalone runner-gateway port.
- [ ] Deployment logs show `Fastify ready; starting Next` followed by `Next
      ready; public HTTP/WebSocket gateway listening`. The launcher must receive
      `ready: true` from private `/readyz` before opening the public boundary.
      If either child exits, the deployment must exit and let Replit restart the
      complete unit.
- [ ] The build log uses the checked-in pnpm `10.34.5` pin through
      `npm exec`, then invokes Next directly from `apps/web`. It must not enter
      Replit's Corepack cache. This avoids the Node 20.20
      `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` failure before application code
      starts.
- [ ] The provider-owned pre-build security scan may use its bundled pnpm
      `10.26.1` under either observed exact Linux x64 runtime, Node `24.12.0`
      or Node `20.20.0`; it must finish the root `preinstall` without
      package-manager self-install recursion and then proceed to the checked-in
      `.replit` build. Adjacent versions and editor context remain rejected.
      The deployment build must still switch to the exact pnpm `10.34.5`
      frozen install above. Build `974c6e95-4124-4647-8010-16f4b2c09415`
      failed before this point with output inconsistent with the current guard,
      so retry only from a fresh snapshot whose source SHA is known.
- [ ] `APP_ENV=production` and `NODE_ENV=production` in the deployment
      environment.
- [ ] `DATABASE_URL` points to the production PostgreSQL authority.
- [ ] `SESSION_SECRET` is set.
- [ ] `SSO_CODE_ENCRYPTION_SECRET` is set to a high-entropy hub-only value.
- [ ] `MODULE_SSO_SECRET` is set only if the bounded legacy rollback path is
      still enabled; it is not distributed to a child deployment.
- [ ] `OPERATOROS_BASE_URL=https://operatoros.net` is set on the unified
      deployment.
- [ ] All thirteen canonical module URL variables in
      `docs/operatoros-env-vars.md` are present in the Publishing environment
      and exactly match their `*.operatoros.net` origins. This includes
      `OUTCALL_URL`; its live provider gate is validated separately.
- [ ] `INTERNAL_API_URL=http://localhost:5001` is server-only and never appears
      in a public redirect.
- [ ] `TRUST_PROXY=true` is set only because the deployment is behind Replit's
      trusted proxy boundary.
- [ ] Legacy `APP_URL` is unset; `OPERATOROS_BASE_URL` is the only supported
      production platform override.
- [ ] Run `npm run preflight:production -- --all` in the production
      environment. It reports `PASS` for `core`, `revenue`, `email`,
      `callcommand`, `outcall`, and `ai` without printing secret values. If a deliberately
      degraded provider is not part of the launch claim, run only its applicable
      readiness flags and record the excluded capability.
- [ ] Revenue-ready: `STRIPE_MODE=live`, the live Stripe secret and webhook
      signing secret, and all five shared stack Price IDs pass the preflight.
- [ ] Invite-ready: Resend and a verified OperatorOS sender pass the email
      profile; send and accept one non-production-recipient invite.
- [ ] CallCommand-ready: a bound Replit Twilio connector or the three canonical
      Twilio credential variables are present, and
      `TWILIO_PUBLIC_BASE_URL=https://callcommand-ai.operatoros.net`.
- [ ] OutCall-ready: independent encryption/HMAC keys, canonical public URL,
      Twilio auth/Verify configuration, the owned E.164 line, controlled
      country allowlist, and explicit post-acceptance activation pass the
      `--outcall-ready` profile. `OUTCALL_TEST_ADAPTER` is absent.
- [ ] AI-ready: `OPENAI_API_KEY` is present before any shared-runtime feature is
      marketed as live AI rather than fallback/mock behavior.
- [ ] Do not paste secret values into this checklist, deployment logs,
      screenshots, Git, or Codex. Record only PASS/FAIL and provider IDs safe
      for operational documentation.

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
- [ ] `operatorpoolhall.operatoros.net`
- [ ] `brandforgeos.operatoros.net`
- [ ] `snapproofos.operatoros.net`
- [ ] `studyforge-ai.operatoros.net`
- [ ] `deployops.operatoros.net`
- [ ] `callcommand-ai.operatoros.net`
- [ ] `scriptops.operatoros.net`
- [ ] `outcall.operatoros.net`
- [ ] Each shows **Verified** with a valid HTTPS certificate (no browser
      warning).
- [ ] `operator-os.replit.app` is treated only as a deployment alias and is not
      accepted as an SSO callback, CORS origin, or absolute auth return target.

## 3. Per-host behavior

After deployment, run the read-only public verifier first:

```powershell
npm run verify:production
```

It derives the host matrix from `config/operatoros-module-registry.json` and
checks 17-host diagnostics, platform health/readiness, all enabled anonymous
PKCE authorization requests, all enabled callback routes, security headers,
host-only transaction-cookie attributes, forbidden credential query names,
and OutCall's exact callback. It does not authenticate, mutate data, or
print authorization values. Continue with the authenticated browser checks
below after it passes.

Open each host in a fresh (logged-out) browser and confirm:

- [ ] `https://operatoros.net` — marketing/root loads over HTTPS.
- [ ] `https://app.operatoros.net` — anonymous protected request redirects to
      `https://auth.operatoros.net/login` with a sanitized same-origin return
      path. The `Location` has no `:5000` and uses `https://`.
- [ ] `https://auth.operatoros.net` — renders the login surface.
- [ ] Every enabled module host enters the same protected module lane. Its auth
      request carries the registered client/callback plus state, nonce, and
      S256 challenge; OutCall uses the same exact-host contract.
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

- [ ] Launch each of the thirteen enabled modules through OperatorOS and confirm
      an opaque, single-use `/sso?code=<opaque>&state=<binding>` establishes
      that module's host-only, module-and-tenant-bound session without leaving
      the code in browser history.
- [ ] Confirm OutCall can issue/exchange only for an entitled tenant and that
      its live provider remains fail closed until separately configured.
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

- **Publish security scan stops in Node `WorkerThreadsTaskRunner` with
  `uv_thread_create` and repeats `pnpm add pnpm@10.34.5`** — confirm
  `pnpm-workspace.yaml` retains `managePackageManagerVersions: false` and the
  deployment-scope gate passes. Replit's direct pre-build scan may use its
  provider pnpm only through the bounded provider-context exception; the
  checked-in deployment build must still reinstall explicit pnpm 10.34.5 with
  `--frozen-lockfile`. Do not remove the `packageManager`, `devEngines`,
  preinstall, sole-lock, or frozen-build controls to make the scan pass.
- **Build stops in `.cache/node/corepack/.../pnpm.cjs` with
  `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`** — confirm the deployed `.replit`
  build command matches source: it must install with
  `npm exec --yes --package=pnpm@10.34.5 -- pnpm install --frozen-lockfile`
  and build Next directly from `apps/web`. Do not add a bare `pnpm` or
  `corepack pnpm` command back to deployment build or runtime startup. A
  `COREPACK_ENABLE_STRICT=0` secret is not required by the checked-in fix.
- **Redirect still shows `:5000`** — a code path is building a URL from the
  inbound host:port. Use `getPublicOrigin` / `resolvePlatformBaseUrl` instead.
- **SSO callback rejected with host mismatch** — verify the request reaches the
  same hostname registered in the code's exact `redirect_uri`, and confirm the
  proxy forwards the original host.
- **Module returns to login** — inspect whether that exact host received a
  host-only `operatoros_session`; the auth-host cookie is intentionally not
  shared across subdomains.
