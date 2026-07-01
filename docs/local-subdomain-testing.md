# OperatorOS Local Subdomain Testing

Status: Phase 5 local testing guide. This verifies host resolution and local
module fallback routing without importing real module source.

## Prerequisites

- API and web dependencies installed.
- API reachable through the existing web rewrite:
  `/api/:path* -> {INTERNAL_API_URL or NEXT_PUBLIC_API_URL}/v1/:path*`.
- A valid OperatorOS session cookie named `token` for protected browser checks.

## Path-Based Local Fallback

Use these paths when no wildcard DNS or reverse proxy is configured:

| Local path | Expected behavior |
| --- | --- |
| `/modules/techdeck` | Auth-gated TechDeck shell fallback. |
| `/modules/pulsedesk` | Auth-gated PulseDesk shell fallback. |
| `/modules/tradeflowkit` | Auth-gated TradeFlowKit shell fallback. |
| `/modules/unknown-slug` | Controlled unknown-module page. |

Active module paths are rewritten to the same module shell used by
`/app/apps/<slug>`. The shell still calls `GET /api/modules/:slug`, so missing
tenant entitlement renders access denied instead of loading module UI.

## Host-Header Simulation

Unit tests should prefer `resolveModuleContext` directly. Manual HTTP checks can
simulate a production host with a `Host` header:

```text
Host: techdeck.operatoros.net
```

Expected outcomes:

- `techdeck.operatoros.net` resolves to `techdeck`.
- `pulsedesk.operatoros.net` resolves to `pulsedesk`.
- `tradeflowkit.operatoros.net` resolves to `tradeflowkit`.
- `unknown.operatoros.net` renders the controlled unknown-module page.
- Anonymous module requests redirect to login.

## Optional Browser Host Testing

Browser subdomain testing can use a local reverse proxy or hosts-file entries
only if needed for a deployment rehearsal. This is optional for Phase 5 because
the supported development path is `/modules/<slug>`.

Do not configure `.operatoros.net` as a local cookie domain. Local development
uses host-only cookies.

## Verification Commands

Run the pure resolver tests:

```powershell
& '.\node_modules\.bin\tsx.CMD' --test apps/api/test/operatoros-module-registry.test.ts
```

Run the broader typecheck when implementation changes touch runtime imports:

```powershell
pnpm typecheck
```

## Known Limits

- The middleware only checks that the session cookie exists. The API remains the
  authority for JWT validity and tenant entitlement.
- The module shell is still the existing OperatorOS shell; TechDeck, PulseDesk,
  and TradeFlowKit source has not been imported.
- SSO consume screens on real module hosts are not wired to module code yet.
