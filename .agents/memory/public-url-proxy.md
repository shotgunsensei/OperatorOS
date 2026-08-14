---
name: Public URL generation behind Replit proxy
description: Why browser-facing URLs must never be built from the inbound request host, and where the single source of truth lives.
---

# Public URLs behind Replit's proxy

OperatorOS serves every subdomain (`operatoros.net`, `app`/`auth`/`api`, and each
module host like `techdeck`/`pulsedesk`/`tradeflowkit`) from ONE Replit
deployment via host-based routing. Internally the web app binds to Replit's
port (e.g. `5000`); the proxy terminates TLS and forwards the real public host
in `x-forwarded-host` / `x-forwarded-proto`.

**Rule:** never build a browser-facing URL from the inbound request URL/host.
Behind the proxy it still carries the internal `:5000` and `http`, producing
broken public links like `http://auth.operatoros.net:5000/login`.

**Why:** this exact leak was the production subdomain-routing bug — cross-host
login redirects and several API fallbacks (`|| 'http://localhost:5000'`) emitted
unreachable URLs on the public hosts.

**How to apply:**
- Single source of truth: `packages/modules/public-url.ts` (pure) — `getPublicOrigin`,
  `resolveHostRole`, `buildPublicUrl`, `sanitizeReturnTo`, host classifiers.
  Recognized `*.operatoros.net` hosts collapse to clean `https://<host>` (no
  port); local/dev/preview hosts keep protocol + port so `pnpm dev` works.
- API-side env-aware wrappers: `apps/api/src/lib/public-url.ts`
  (`resolvePlatformBaseUrl`, `resolveAppBaseUrl`, `getRequestPublicOrigin`,
  `isProductionEnv`). Explicit env overrides (`OPERATOROS_BASE_URL`, `APP_URL`)
  are trusted as-is — a misconfigured `http://` value can still reintroduce the
  bug, so those envs must be HTTPS in prod.
- Edge middleware + login page import the shared helper directly via relative
  `../../.../packages/modules/public-url.js` (resolves through next.config.js
  extensionAlias). Reuse `sanitizeReturnTo` for open-redirect guarding rather
  than re-implementing same-site checks.
- SSO issuer contract: child modules verify token `iss` byte-for-byte against
  their `OPERATOROS_BASE_URL`; the prod default is `https://operatoros.net`.
  Keep hub and child module envs identical.
- Runtime check: `GET /api/diagnostics/public-url` returns a non-secret snapshot
  (host role, normalized host, forwarded host/proto, resolved public origin,
  cookie-domain mode).
