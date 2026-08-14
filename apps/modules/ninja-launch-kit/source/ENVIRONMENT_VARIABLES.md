# Environment Variables

NinjaLaunchKit is **demo-mode by default** — every secret in the "Stripe / billing" section below is optional. With no Stripe secrets set, the app runs end-to-end against an in-app demo billing flow that updates plans locally so you can validate the full UX without provisioning anything external.

---

## Required (auto-provisioned by Replit)

These are managed by Replit's environment automatically — you do **not** set them manually.

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | `@workspace/db`, `api-server` | PostgreSQL connection string. Connects Drizzle to the workspace database. |
| `SESSION_SECRET` | `api-server` (`lib/session.ts`) | HMAC-signing key for the session cookie. If absent, sessions cannot be issued. |
| `PORT` | every artifact | Auto-injected per-artifact port. The reverse proxy routes by path; never bind a hardcoded port. |
| `BASE_PATH` | `ninjalaunchkit` (Vite) | Vite `base` for the static build. Always `/` for the web artifact. |
| `NODE_ENV` | every artifact | `production` in published deployments, `development` in the workspace. |
| `REPL_ID` | dev tooling only | Enables Replit's Vite dev plugins (cartographer + dev banner) in development. |
| `REPLIT_DOMAINS` | (informational) | Comma-separated list of public hostnames the deployment is exposed on. |

---

## Stripe / billing (optional — demo mode if absent)

When **all** of these are set, NinjaLaunchKit runs real Stripe checkouts and webhooks. When **any** of them are missing, `/api/billing/checkout` returns `{ url: null, demo: true, plan }` and the user's plan is updated locally — no charges, no external calls.

| Variable | Required for live billing | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | ✅ | Server-side Stripe SDK auth. Used to create checkout sessions, billing-portal sessions, and look up subscriptions. **Never expose to the client.** |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Signing secret for `/api/webhooks/stripe`. The webhook rejects requests with an invalid signature. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ | Sent to the frontend in `/api/billing/subscription` so the UI can render Stripe-powered components if needed. (Currently the app uses Stripe-hosted Checkout, so this is informational, but it's surfaced to the client.) |
| `STRIPE_PRO_PRICE_ID` | ✅ | Stripe Price ID for the Pro plan ($19/mo). Used to create Pro checkout sessions. |
| `STRIPE_AGENCY_PRICE_ID` | ✅ | Stripe Price ID for the Agency plan ($59/mo). Used to create Agency checkout sessions. |

### Setting them in Replit

Open the workspace **Secrets** panel and add each key/value pair. They are automatically injected into both the development and production runtimes. **Do not** put them in a `.env` file or commit them anywhere.

### Where they're consumed

- `artifacts/api-server/src/lib/stripe.ts` — central Stripe SDK init and price-id lookup. Returns `null` when `STRIPE_SECRET_KEY` is absent, which downstream code uses to short-circuit into demo mode.
- `artifacts/api-server/src/routes/billing.ts` — checkout, portal, plan listing, subscription lookup, and the demo-mode fallback path.
- `artifacts/api-server/src/routes/webhooks.ts` — signature verification and event handler. Mounted with raw body **before** `express.json()`.

---

## Adding a new environment variable

1. Document it here, in the appropriate section.
2. If the secret should never be exposed to the frontend, only read it inside `artifacts/api-server/`.
3. If the value must reach the client, expose it via an existing API route (don't add a `VITE_*` env var unless absolutely necessary, because Vite inlines those at build time).
4. Add it to the workspace **Secrets** panel — never to source files.
5. Update [`DEPLOYMENT.md`](DEPLOYMENT.md) → Environment variables table if it's required for production.

---

## Checking what's set

In the Replit workspace, open the **Secrets** panel — every set secret is listed by name. Values are masked. You can also check programmatically from your code at runtime, but **never** log a secret's value.

For Stripe specifically, the API exposes a `stripeEnabled: boolean` field on `GET /api/billing/subscription`, so the frontend can render a "Demo mode" banner without needing to know any secret values.
