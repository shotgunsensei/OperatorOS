# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

**Ninjamation** — A subscription-based web app for PC automation scripts (rebranded from "Automation Station"). Users sign in via Replit Auth, subscribe via Stripe (Starter $10/mo, Pro $20/mo for AI script generation, Enterprise $100/mo), and access scripts synced from GitHub. Design theme: deep blue/black backgrounds, electric blue primary, ninja-red accents, glass UI, glow effects, bold condensed fonts (Outfit), Framer Motion animations.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Frontend**: React + Vite (wouter routing, TanStack Query, Tailwind CSS, Framer Motion)
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Replit Auth (OIDC with PKCE) via `@workspace/replit-auth-web`
- **Payments**: Stripe via Replit integration + `stripe-replit-sync`
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle → `dist/index.mjs` + CJS shim `dist/index.cjs`)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (auth, scripts, subscription, Stripe webhooks, GitHub sync)
│   └── automation-station/ # React+Vite frontend (home, pricing, library, AI generator, account)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── replit-auth-web/    # Replit Auth React hook
├── scripts/                # Utility scripts
│   └── src/
│       ├── hello.ts
│       └── seed-products.ts  # Seeds Stripe products (Starter $10, Pro $20, Enterprise $100)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Key Architecture

### Authentication
- Replit Auth via OIDC/PKCE — no custom login forms
- Frontend uses `useAuth()` from `@workspace/replit-auth-web`
- Backend auth middleware in `api-server/src/middlewares/authMiddleware.ts`
- Sessions stored in `sessions` table, users in `users` table

### Stripe Payments
- Integration via Replit connector (no manual API keys)
- `stripeClient.ts` fetches credentials from Replit connectors API
- `stripe-replit-sync` manages webhook + data sync to `stripe.*` schema
- Webhook route registered BEFORE `express.json()` middleware in `app.ts`
- Products: Starter ($10/mo), Pro ($20/mo), Enterprise ($100/mo) — seeded via `scripts/src/seed-products.ts` with `tier` metadata on each product
- `webhookHandlers.ts` uses `resolveTier()` — resolves from Stripe product `metadata.tier` (starter/pro/enterprise), falls back to amount-based mapping (≥10000→enterprise, ≥2000→pro, else→starter) if metadata missing
- `/subscription/plans` endpoint filters to only products with valid `metadata.tier` (starter/pro/enterprise), sorted by price ascending; has hardcoded fallback if Stripe API returns empty
- Seed script deactivates legacy products without matching tier metadata before creating new ones

### Production Notes
- Production DB does NOT have `stripe.*` schema tables — all queries to `stripe.subscriptions`, `stripe.products` etc. are wrapped in try/catch with fallbacks
- Subscription access is tier-based: if `users.subscription_tier` is set, access is granted regardless of Stripe subscription status
- Admin-assigned tiers (via admin panel) work without Stripe — no `stripe_subscription_id` needed
- All middleware (`requireActiveSubscription`, `requireProSubscription`) checks `subscriptionTier` field first, then falls back to Stripe verification

### GitHub Script Sync
- `githubSync.ts` syncs scripts from `shotgunsensei/AutomationPacks` on server startup
- Detects format from file extension (.ps1→PowerShell, .bat/.cmd→Batch, .py→Python)
- Scripts stored in `scripts` table with name, description, content, format, category, source

### Frontend Routes
- `/` — Home (public, 7-section landing page)
- `/pricing` — 3-tier subscription plans (public)
- `/library` — Script browsing/download (requires auth + subscription)
- `/scripts/:id` — Script detail/download (requires auth + subscription)
- `/generate` — AI script generator (requires auth + Pro or Enterprise subscription)
- `/account` — Profile + billing management (requires auth)
- `/checkout/success`, `/checkout/cancel` — Stripe checkout redirects
- `/admin` — Admin dashboard (requires auth + isAdmin flag)

### AI Script Generation
- Pro/Enterprise-only feature at `/generate` — uses OpenAI (gpt-5.2)
- Backend: `POST /api/scripts/generate` in `generate.ts` — gated by `requireProSubscription` middleware (allows pro + enterprise)
- Accepts `prompt` (string, min 10 chars, max 2000) and `format` (powershell/python/batch/bash)
- Generated scripts auto-saved to `scripts` table with `source: "ai_generated"`
- Uses `@workspace/integrations-openai-ai-server` — billed to Replit credits

### Admin Panel
- Admin dashboard at `/admin` — manages users, subscriptions, and scripts
- Admin access controlled by `isAdmin` boolean column on `users` table
- Auto-admin detection via `ADMIN_USERNAMES` env var (comma-separated Replit usernames; `johntwms355` is master admin)
- Backend: `src/routes/admin.ts` — all routes guarded by `requireAdmin` middleware
- Tier dropdown in user edit modal: None / Starter / Pro / Enterprise

### Database Schema
- `users` — id, email, firstName, lastName, profileImageUrl, stripeCustomerId, stripeSubscriptionId, subscriptionTier, isAdmin
- `sessions` — sid, sess, expire
- `scripts` — id, name, description, content, format, category, source, githubPath, downloadCount, timestamps
- `stripe.*` — managed by stripe-replit-sync (products, prices, customers, subscriptions, etc.)

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — `pnpm run typecheck`
- **`emitDeclarationOnly`** — only `.d.ts` files emitted during typecheck
- **Project references** — when package A depends on B, A's `tsconfig.json` must list B in `references`

## Root Scripts

- `pnpm run build` — typecheck + build all packages
- `pnpm run typecheck` — `tsc --build --emitDeclarationOnly`

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server with auth, Stripe payments, GitHub sync, and script management.

- Entry: `src/index.ts` — initializes Stripe, starts server, triggers GitHub sync
- App: `src/app.ts` — webhook route (raw body), CORS, auth middleware, routes at `/api`
- Routes: `src/routes/` — auth.ts, scripts.ts, subscription.ts, admin.ts, generate.ts, health.ts
- Services: `stripeClient.ts`, `stripeService.ts`, `webhookHandlers.ts`, `githubSync.ts`, `storage.ts`
- AI: OpenAI integration via Replit AI Integrations (gpt-5.2 for script generation)

### `artifacts/automation-station` (`@workspace/automation-station`)

React+Vite frontend with Ninjamation branding — deep blue/black backgrounds, electric blue accents, ninja-red highlights, glass UI.

- Uses `@workspace/replit-auth-web` for auth, `@workspace/api-client-react` for API hooks
- Protected routes via `ProtectedRoute` component (supports `requireSubscription` and `requirePro`)
- Styling: Tailwind CSS + custom glass effects + Framer Motion animations
- Fonts: Outfit (display), Inter (body), Fira Code (mono)

### `lib/db` (`@workspace/db`)

Database layer with Drizzle ORM. Schema in `src/schema/auth.ts` (users, sessions, scripts tables).

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec + Orval codegen config. Run: `pnpm --filter @workspace/api-spec run codegen`

### `lib/replit-auth-web` (`@workspace/replit-auth-web`)

React hook for Replit Auth (OIDC). Provides `useAuth()` with `user`, `isAuthenticated`, `login`, `logout`.

### `scripts` (`@workspace/scripts`)

Utility scripts. Run via `pnpm --filter @workspace/scripts run <script>`.
- `seed-products` — Creates Starter/Pro/Enterprise Stripe products and prices
