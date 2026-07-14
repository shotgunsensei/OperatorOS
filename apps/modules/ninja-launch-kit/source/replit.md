# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### NinjaLaunchKit (`artifacts/ninjalaunchkit`)
Production-ready demo SaaS for "Shotgun Ninjas Productions" — generates marketing launch kits (landing copy, ad copy, email/SMS sequences, social posts, FAQ, CTAs, QR flyer copy, checklist) from a short business brief.

- **Frontend**: React + Vite + wouter + react-query (Orval-generated hooks) + shadcn/ui + framer-motion + sonner. Dark crimson tactical theme.
- **15 pages**: landing, pricing, login, signup, dashboard, builder, templates, template-detail, kits, kit-detail, exports, brands, account, admin, terms, privacy, contact, 404.
- **Visual Promo Kit**: every saved kit gets a "Visual Promo" tab generating 9 paste-ready creative briefs — Facebook/Meta ad image, Instagram square post, Instagram/TikTok story, website hero image, print flyer, QR poster, logo direction, brand color suggestions, and font style suggestions. Briefs are deterministic per kit (timestamped to `kitRow.updatedAt`), include format/dimensions/composition/palette/tools sections, and pull industry-aware palettes (or the kit's linked brand profile colors when present). Endpoints: `GET /api/kits/:id/visual-promo`, `POST /api/kits/:id/visual-promo/regenerate`, `GET /api/kits/:id/visual-promo/export?format=txt|markdown|json`. Tier gating: Free unlocks 1 brief (Facebook ad), Pro/Agency unlock all 9, Agency adds a white-label delivery footer to every brief. Server omits brief content (`brief: ""`, `locked: true`) for tiers above the user's plan, and the export endpoint reuses the existing plan export-format gate (Free → TXT only). UI source: `artifacts/ninjalaunchkit/src/components/VisualPromoTab.tsx`.
- **Niche launch templates**: 20 prebuilt templates (auto repair, mobile mechanic, IT/MSP, pressure washing, lawn care, fitness coach, music artist, podcast, restaurant special, barber/beauty, real estate, cleaning, roofing, handyman, online course, digital product, local event, nonprofit, pool/arcade, cybersecurity) seeded statically in `artifacts/api-server/src/lib/launch-templates.ts`. Each template carries: recommendedOffer, suggestedAudience, tonePreset, landingPageStructure[], adAngle, suggestedCTA, launchChecklist[], socialHooks[], and a builder prefill payload that maps directly to KitFormInput. Served via `/api/templates` (filter by `q`/`category`/`tier`) and `/api/templates/:slug`. Tier-locked templates (Pro/Agency on a Free plan) keep all preview fields visible but the server omits `prefill` and sets `locked: true`; the frontend routes "USE THIS TEMPLATE" to `/pricing` for locked tiers. Builder reads `?template=<slug>` and auto-fills the form via `form.reset()`.
- **Backend** (`artifacts/api-server`): Express 5 + Drizzle + Postgres. Cookie session (HMAC-signed). Deterministic local content generator (no API keys required). Routes: session, contact, kits (CRUD + preview + duplicate + regenerate + export TXT/MD/JSON), brands, dashboard, billing (Stripe checkout + portal + plans + subscription + demo subscribe), admin, webhooks (Stripe).
- **Stripe monetization**: Three plans (Free / Pro $19 / Agency $59). Server-side gating in `lib/features.ts` (PLAN_LIMITS) enforces monthly kit caps, export-format gating, brand-profile caps, watermarking, and per-plan capabilities — gated routes return HTTP 402 `{error:"PLAN_LIMIT_EXCEEDED", code, message, currentPlan}`. Frontend surfaces these via `lib/plan-error.ts` → sonner toast with "Upgrade" action that routes to `/pricing`. Stripe webhook is mounted with raw body BEFORE `express.json()` at `/api/webhooks/stripe`, verifies signatures, and uses a `stripe_events` table for idempotent event dedup (failed handlers roll back the dedup row + return 500 so Stripe retries). Checkout reuses existing active subscriptions via the billing portal to prevent double subscriptions. **Demo mode**: when Stripe secrets are absent, `/billing/checkout` returns `{url:null, demo:true, plan}` and updates the user's plan locally so the full UX is still testable.
- **Stripe env vars** (all optional — absent = demo mode): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_AGENCY_PRICE_ID`.
- **Demo mode**: every visitor is auto-provisioned a fresh anonymous user on first request and gets a session cookie — data is fully isolated per visitor (no shared demo account). Auth signup is also available for persistent accounts.
- **Production safety**: Boot-time env validation in `lib/env.ts` (Zod) — `SESSION_SECRET` required in prod, fail-fast on bad config. Graceful shutdown on SIGTERM/SIGINT (10s drain). Cookie `Secure` flag enabled in prod; CORS restricted to `REPLIT_DOMAINS` / `REPLIT_DEV_DOMAIN` / `ALLOWED_ORIGINS` (localhost allowed in dev); seed only runs when `NODE_ENV !== "production"` or `RUN_SEED=1`. Centralized error handler in `app.ts` never leaks stacks to clients.
- **Rate limiting** (`lib/rate-limit.ts`): four tiers via express-rate-limit — `readLimiter` 300/min global on `/api`, `writeLimiter` 60/min on mutating routes (delete/restore/contact), `generationLimiter` 20/min on `/kits` + `/kits/preview`, `authLimiter` 10/15min on login/signup. Body limits tightened to 64kb JSON.
- **Deeper health checks**: `/api/healthz` (cheap) + `/api/healthz/ready` (DB SELECT 1 + Stripe status).
- **Soft delete with 30-day undo**: kits + brand profiles use `deletedAt` timestamp instead of hard delete. All SELECT/UPDATE/DELETE queries across kits.ts, brands.ts, dashboard.ts, visual-promo.ts filter `isNull(deletedAt)`. Restore endpoints `POST /api/kits/:id/restore` and `POST /api/brands/:id/restore` clear the timestamp. Frontend shows a sonner toast with an "Undo" action that calls the restore endpoint via fetch.
- **AI-refined kit generation** (`lib/ai-generator.ts`): Pro and Agency users get LLM-generated copy via `@workspace/integrations-anthropic-ai` (uses Replit AI Integrations for Anthropic access, no API key required, charges to Replit credits). Model: `claude-haiku-4-5`. Strict JSON output + schema validation, falls back to the deterministic generator on any AI failure (logged) so kit creation never blocks. Free plan stays on the deterministic template generator.
- **Frontend perf**: React.lazy bundle splitting in `App.tsx` (only Landing + 404 eager; 14 other pages lazy-loaded with Suspense fallback). Query client defaults: 30s staleTime, no refetch on focus, retry: 1.
- **Indexes**: composite `(user_id, created_at)` indexes on launch_kits, brand_profiles, exports.
- **SEO**: `public/_templates/{sitemap.xml,robots.txt}` rendered at build/dev time by `scripts/render-public-assets.mjs` using `PUBLIC_BASE_URL` (or auto-detected Replit domain).
- **Admin gating**: `/api/admin/*` requires `role=admin`; the frontend `/admin` page renders an ACCESS_DENIED panel for non-admins.
- **OperatorOS SSO** (`lib/sso.ts` + `routes/sso.ts`): NinjaLaunchKit acts as an OperatorOS child app. Parent platform redirects to `{MODULE_BASE_URL}/sso?token=<HS256 JWT>`; the child verifier checks `alg=HS256` only (rejects `alg=none`/RS256), enforces `iss`/`aud`/`module_slug`/`env`/`exp` and `iat` ≤90s old with ±5s clock skew, then POSTs `{jti, aud, env}` to `${OPERATOROS_API_URL}/v1/modules/sso/consume` to enforce single-use. On success it upserts the local user (lookup by `operator_os_user_id`, else by email), maps OperatorOS `plan_slug` (`starter`→`free`, `pro`→`pro`, `elite`→`agency`), drops our existing signed session cookie, and 302-redirects to `/dashboard`. On any reject returns the documented `{error, code}` JSON with the matching HTTP status (`missing_token`/`bad_request`/`signature_invalid`/`issuer_mismatch`/`audience_mismatch`/`env_mismatch`/`expired`/`clock_skew`/`consume_failed`/`sso_consume_unavailable`) and never sets a cookie. Mounted as `/api/sso` (configure OperatorOS `MODULE_BASE_URL` to include `/api`). Dedicated 30/min/IP rate limiter. Required env vars (production-mandatory, all-or-nothing in prod): `MODULE_SSO_SECRET` (≥16 chars), `OPERATOROS_BASE_URL`, `OPERATOROS_SSO_AUDIENCE` (lowercase slug), `OPERATOROS_SSO_ENV` (`prod`|`staging`|`dev`), `OPERATOROS_API_URL`. Verifier coverage: `artifacts/api-server/scripts/test-sso.mjs` (17 cases — happy path, plan map, all 11 reject paths). Existing email/password and anonymous demo flows are unchanged.
