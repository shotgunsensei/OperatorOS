# Replit Subdomain Verification Checklist

Manual steps to add and verify each OperatorOS subdomain on the single Replit
deployment. Code-side host routing and public-URL generation are already handled
(see `docs/subdomain-runtime-audit.md`); this checklist covers the parts that
live in the Replit dashboard and DNS.

## 1. Deployment & environment

- [ ] The app is published as a single deployment (web on the public port, API
      and runner-gateway alongside it).
- [ ] `NODE_ENV=production` in the deployment environment.
- [ ] `SESSION_SECRET` is set.
- [ ] `MODULE_SSO_SECRET` is set (≥16 chars) and **identical** on the hub and
      every child module app.
- [ ] `OPERATOROS_BASE_URL=https://operatoros.net` is set on the hub **and** on
      every child module app (must match byte-for-byte — modules compare it
      against the SSO token `iss`).
- [ ] Optional: `APP_URL=https://app.operatoros.net` if billing return URLs
      should land on the console explicitly.

## 2. DNS / custom domains

For the apex and each subdomain, add the domain in the Replit deployment's
domain settings and create the DNS record it asks for (A/AAAA or CNAME), then
wait for it to verify and for TLS to be issued.

- [ ] `operatoros.net` (apex)
- [ ] `www.operatoros.net`
- [ ] `app.operatoros.net`
- [ ] `auth.operatoros.net`
- [ ] `api.operatoros.net`
- [ ] `techdeck.operatoros.net`
- [ ] `pulsedesk.operatoros.net`
- [ ] `tradeflowkit.operatoros.net`
- [ ] Each shows **Verified** with a valid HTTPS certificate (no browser
      warning).

## 3. Per-host behavior

Open each host in a fresh (logged-out) browser and confirm:

- [ ] `https://operatoros.net` — marketing/root loads over HTTPS.
- [ ] `https://app.operatoros.net` — anonymous visit **307-redirects** to
      `https://auth.operatoros.net/login?next=…`. The `Location` has **no
      `:5000`** and uses `https://`.
- [ ] `https://auth.operatoros.net` — renders the login surface.
- [ ] `https://techdeck.operatoros.net` (and `pulsedesk`, `tradeflowkit`) —
      anonymous visit redirects to the auth host login with a clean HTTPS
      `next` pointing back at the module host.
- [ ] After signing in on the auth host, you are returned to the **original**
      subdomain you started from (module/app), not stranded on auth.
- [ ] An unknown subdomain (e.g. `https://nope.operatoros.net`) shows the
      controlled unknown-host page, not a crash.

## 4. Diagnostics

- [ ] `GET https://<any-subdomain>/api/diagnostics/public-url` returns JSON with
      the correct `hostRole`, `normalized` host, `publicOrigin`
      (`https://<host>`, no port), and `cookieDomainMode: "parent-domain"`.
- [ ] `environment` reads `production`.

## 5. Cross-subdomain session

- [ ] Sign in once, then visit another subdomain — the session carries over
      (cookie `Domain=.operatoros.net`).
- [ ] Log out — the session is cleared across subdomains and you land on a safe
      public URL (no `:5000`).

## 6. CORS sanity

- [ ] A browser request from one `*.operatoros.net` subdomain to
      `api.operatoros.net` succeeds with credentials.
- [ ] A request from an unrelated origin is rejected (no
      `Access-Control-Allow-Origin: *`).

## Troubleshooting

- **Redirect still shows `:5000`** — a code path is building a URL from the
  inbound host:port. Use `getPublicOrigin` / `resolvePlatformBaseUrl` instead.
- **SSO handoff rejected with issuer mismatch** — the child module's
  `OPERATOROS_BASE_URL` does not match the hub's. Make them identical.
- **Session doesn't cross subdomains** — confirm `NODE_ENV=production` so the
  cookie domain is `.operatoros.net`.
