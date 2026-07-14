# Deployment Guide

NinjaLaunchKit is designed to publish in one click via Replit Deployments. This guide covers the full launch sequence — pre-flight checks, environment configuration, the deploy itself, and post-deploy verification.

---

## 1. Pre-flight checklist

Run these locally (in the workspace) before deploying:

```bash
# 1. Dependencies
pnpm install

# 2. Type safety across all libs + artifacts
pnpm run typecheck

# 3. Production build of every artifact
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/ninjalaunchkit run build

# 4. Database is up to date
pnpm --filter @workspace/db run db:push
```

All four commands must succeed with no errors. If `typecheck` fails after editing `lib/api-spec/openapi.yaml`, regenerate the client + zod first:

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## 2. Environment variables

NinjaLaunchKit runs in **demo mode** out of the box — every Stripe-related secret is optional. Plan changes apply locally, no real charges happen, and the full UX is testable end-to-end.

To go live, set the secrets listed in [`ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md). At minimum for production billing:

| Required | Variable |
|---|---|
| ✅ Always | `DATABASE_URL` (auto-provisioned by Replit) |
| ✅ Always | `SESSION_SECRET` (auto-provisioned) |
| 🚀 Live billing | `STRIPE_SECRET_KEY` |
| 🚀 Live billing | `STRIPE_WEBHOOK_SECRET` |
| 🚀 Live billing | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| 🚀 Live billing | `STRIPE_PRO_PRICE_ID` |
| 🚀 Live billing | `STRIPE_AGENCY_PRICE_ID` |

Set them via the **Secrets** panel in the Replit workspace (not in code, not in `.env`). They are injected into both development and production runtimes automatically.

---

## 3. Deploy

In the Replit workspace, open **Publishing** → **Deploy**. Replit will:

1. Build every artifact (`pnpm --filter <artifact> run build`) per its `artifact.toml`.
2. Run health checks on the API server at `/api/healthz`.
3. Configure the global reverse proxy for path-based routing.
4. Provision a `*.replit.app` domain (or your custom domain).
5. Issue a TLS certificate.

Total deploy time is typically 1-3 minutes. Watch the Publishing pane for build output.

### Path routing in production

The same shared proxy runs in production:

- `/`         → `ninjalaunchkit` (Vite static build, served from `artifacts/ninjalaunchkit/dist/public`)
- `/api/*`    → `api-server` (Node.js, port 8080)

Frontend code uses relative URLs (`fetch("/api/...")`), so you don't need to configure cross-origin or absolute URLs.

---

## 4. Post-deploy verification

Once the deploy is live, walk this checklist:

- [ ] Open the live URL — landing page renders, hero headline is visible.
- [ ] `GET /api/healthz` returns `{ ok: true }` (or similar).
- [ ] Sign up (or open in an incognito window for a fresh anonymous account).
- [ ] Create a launch kit via `/builder` — generation completes in under 5s.
- [ ] Visit the kit detail page — all six tabs render, "Visual Promo" tab loads briefs.
- [ ] Visit `/templates` — all 20 templates load with correct tier badges.
- [ ] Visit `/pricing` — plan cards render. If Stripe is live, click Pro → completes a real Stripe checkout in a test card.
- [ ] If Stripe is live, complete one test purchase and verify the webhook (`/api/webhooks/stripe`) updates the user's plan in the DB.
- [ ] `/sitemap.xml` and `/robots.txt` resolve correctly from the public root.
- [ ] Check OG card preview by pasting the production URL into [https://www.opengraph.xyz](https://www.opengraph.xyz) — title, description, and `/opengraph.jpg` should all render.

For a complete verification matrix, follow [`TESTING_CHECKLIST.md`](TESTING_CHECKLIST.md).

---

## 5. Stripe webhook configuration (live billing only)

If you set the Stripe secrets:

1. In the [Stripe Dashboard](https://dashboard.stripe.com/webhooks), add an endpoint pointing to `https://<your-domain>/api/webhooks/stripe`.
2. Subscribe to at minimum: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.
3. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Test by completing a checkout with `4242 4242 4242 4242` and watching the Stripe dashboard's webhook attempt logs — you should see `200 OK` from your endpoint.

The webhook handler is mounted with raw body **before** `express.json()` and de-duplicates events via the `stripe_events` table, so Stripe's automatic retries won't double-apply state.

---

## 6. Database in production

The production database is a separate, always-on PostgreSQL instance (different from your dev DB). To inspect it:

- Open the workspace's database panel and switch the environment selector to **Production**.
- Run read-only SQL there. **Never** run schema-altering SQL by hand — always use Drizzle migrations:

```bash
pnpm --filter @workspace/db run db:push
```

If you change schema in `lib/db/src/schema/*.ts`, redeploy. The build step does not auto-migrate; production migrations are applied via the database panel's "Push schema" action.

---

## 7. Rolling back

If a deploy is bad:

1. Go to **Publishing** → **History**.
2. Pick the last known good deployment.
3. Click **Rollback**. The previous build artifacts and config are re-promoted; new traffic switches over within ~30 seconds.

Database state does NOT roll back — if a release shipped a destructive migration, you'll need to restore from a database backup separately.

---

## 8. Custom domain

Once deployed, attach a domain via **Publishing** → **Domains**:

1. Add the domain (e.g. `app.yourdomain.com`).
2. Add the displayed CNAME / TXT records to your DNS provider.
3. Wait 1-15 minutes for verification + cert issuance.
4. Update `<link rel="canonical">` in `artifacts/ninjalaunchkit/index.html`, `public/sitemap.xml`, and `public/robots.txt` to use the new domain.
