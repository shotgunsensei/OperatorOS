# NinjaLaunchKit

> Generate a full marketing launch campaign in minutes — landing copy, ads, email/SMS sequences, social posts, FAQ, QR flyer copy, visual creative briefs, and a launch checklist. Built for solo operators, agencies, and local service businesses.

NinjaLaunchKit is a production-ready demo SaaS in a pnpm monorepo: a React + Vite tactical-themed frontend, an Express 5 + Drizzle + PostgreSQL backend, a deterministic content generator that needs no AI API keys, Stripe-powered billing with full demo-mode fallback, 20 niche launch templates, and a 9-brief Visual Promo Kit module for every saved kit.

---

## Project structure

```
artifacts/
  api-server/         Express 5 + Drizzle backend (REST API, billing, gating)
  ninjalaunchkit/     React + Vite + wouter + react-query + shadcn/ui frontend
  mockup-sandbox/     Internal component preview server (development only)

lib/
  api-spec/           OpenAPI 3.1 source of truth (orval generates the rest)
  api-client-react/   GENERATED React Query hooks
  api-zod/            GENERATED Zod schemas
  db/                 Drizzle schema + migrations (PostgreSQL)

scripts/              Shared utility scripts
```

Each `artifact` is an independently-deployed service routed by path through Replit's reverse proxy:

- `/`        → NinjaLaunchKit web app (Vite static build)
- `/api/*`   → API server (Express, Node)

## Quick start

### 1. Install

```bash
pnpm install
```

### 2. Provision the database

NinjaLaunchKit ships with PostgreSQL. The `DATABASE_URL` env var is auto-populated by Replit. Run migrations:

```bash
pnpm --filter @workspace/db run db:push
```

### 3. Run the workflows

The Replit workspace boots three workflows automatically:

- `artifacts/api-server: API Server`
- `artifacts/ninjalaunchkit: web`
- `artifacts/mockup-sandbox: Component Preview Server` (dev only)

To restart any of them after code/dependency changes, use the workspace's workflow controls — never `pnpm dev` from the repo root (artifacts need `PORT` and `BASE_PATH` injected by the workflow).

### 4. Open the preview

Click the artifact dropdown in the preview pane and select `NinjaLaunchKit`. Visitors get an anonymous Free-plan account on first request — no signup needed to try the full UX.

---

## Common commands

| Command | What it does |
|---|---|
| `pnpm install` | Install all workspace dependencies |
| `pnpm run typecheck` | Run TypeScript across libs + leaf artifacts |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate React Query hooks + Zod schemas from `lib/api-spec/openapi.yaml` |
| `pnpm --filter @workspace/ninjalaunchkit run build` | Production build of the web app |
| `pnpm --filter @workspace/api-server run build` | Production build of the API server |
| `pnpm --filter @workspace/db run db:push` | Push Drizzle schema → PostgreSQL |

---

## Feature highlights

- **20 niche launch templates** across 10 categories (auto, home services, tech, health, food, beauty, real estate, creative, digital, events) with one-click prefill into the builder.
- **Visual Promo Kit** — 9 paste-ready creative briefs per kit (FB ad, IG square, IG story, hero, flyer, QR poster, logo direction, brand colors, font styles) for Canva / Adobe Express / Figma / Midjourney.
- **Stripe-powered billing** with three plans (Free / Pro $19 / Agency $59), full demo-mode fallback when secrets are absent, idempotent webhook handling, and `/billing/portal` for self-service management.
- **Server-side plan gating** in `artifacts/api-server/src/lib/features.ts` — every gated route returns HTTP 402 with a structured `PLAN_LIMIT_EXCEEDED` payload that the frontend surfaces as an upgrade-prompt toast.
- **Anonymous demo mode** — every new visitor gets a private isolated account on first `/api/*` request, so no shared demo data.
- **Deterministic generator** — no per-token costs, no AI API key required from you. Same brief in → same kit out.
- **OpenAPI-first contract** — change `lib/api-spec/openapi.yaml`, regenerate hooks + zod, and both client + server stay in sync.

## Other docs

- [`DEPLOYMENT.md`](DEPLOYMENT.md) — How to publish to Replit Deployments
- [`ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md) — Every env var, where it's used, demo-mode behavior
- [`TESTING_CHECKLIST.md`](TESTING_CHECKLIST.md) — Manual smoke-test checklist for every feature surface
- [`PRODUCT_LAUNCH_PLAN.md`](PRODUCT_LAUNCH_PLAN.md) — Gumroad listing copy, Facebook + LinkedIn launch posts, 5 cold-outreach DMs, 5 ad copy variants
- [`replit.md`](replit.md) — Architecture deep-dive (kept up-to-date as the project evolves)
