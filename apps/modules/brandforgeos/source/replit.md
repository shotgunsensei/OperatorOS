# BrandForge OS

## Overview

BrandForge OS is a multi-tenant AI-powered marketing SaaS platform. It provides brand management, campaign planning, AI copy generation, content calendar, analytics, AI workflows, strategy workspace, integrations hub, template marketplace, admin console, and white-label reports.

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Replit Auth (OIDC with PKCE)
- **AI**: OpenAI via Replit AI Integrations
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (API), Vite (frontend)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   ├── brandforge/         # React+Vite frontend
│   └── mockup-sandbox/     # Component preview sandbox
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   ├── replit-auth/        # Auth routes + middleware
│   ├── replit-auth-web/    # Frontend auth hook (useAuth)
│   └── integrations/       # OpenAI AI integration
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Database Schema

Core tables:
- **users** - Replit Auth users (id, username, email, image)
- **sessions** - Auth sessions
- **tenants** - Workspaces (name, slug, plan, industry, onboardingCompleted, aiCreditsUsed/Limit, billing fields, activation score)
- **memberships** - User-tenant association with roles (owner/admin/member)
- **brands** - Brand identities (colors, fonts, voiceTone, guidelines)
- **personas** - Customer personas
- **campaigns** - Marketing campaigns (status: draft/active/paused/completed)
- **copy_assets** - Marketing copy (copyType, channel, tone, status)
- **calendar_items** - Content calendar items (scheduledDate, itemType, status)
- **audit_logs** - Activity tracking
- **usage_records** - AI credit usage tracking

Phase 2 tables:
- **offers** - Campaign offers/promotions
- **templates** - Campaign/content templates (expanded with isPremium, isFeatured, usageCount, tags)
- **comments** - Collaboration comments on entities
- **notifications** - User notifications
- **landing_pages** - Landing page content
- **campaign_tasks** - Campaign checklist/task items
- **ai_workflows** - Saved AI workflow definitions
- **integrations** - Third-party integration configs (expanded with accountName, accountId, connectedAt, errorMessage)

Phase 3 tables:
- **subscriptions** - Billing subscriptions (plan, billingCycle, status, pricing, trial dates)
- **billing_profiles** - Company billing info (email, address, tax ID, payment method)
- **invoices** - Billing invoices (amount, status, period, PDF URL)
- **add_on_purchases** - Add-on purchases (type, name, pricing, recurring)
- **credit_packs** - AI credit packs (credits, remaining, expiry)
- **campaign_metrics** - Campaign performance metrics (impressions, clicks, conversions, spend)
- **sync_jobs** - Integration sync job tracking (status, progress, items)
- **lead_submissions** - Lead capture form submissions
- **reports** - Report definitions (type, date range, white-label branding)
- **export_jobs** - Export job tracking (format, status, file)
- **feature_flags** - Platform feature flags (key, enabled, target plans)
- **recommendations** - AI recommendations for tenants

Push schema: `pnpm --filter @workspace/db run push`

## API Routes (all under /api)

- **Auth**: `/api/login`, `/api/logout`, `/api/auth/user`
- **Tenants**: CRUD at `/api/tenants`, `/api/tenants/:id`
- **Onboarding**: `/api/tenants/:id/onboarding` (GET/POST)
- **Brands**: CRUD at `/api/tenants/:id/brands`
- **Personas**: CRUD at `/api/tenants/:id/personas`
- **Campaigns**: CRUD at `/api/tenants/:id/campaigns`
- **Copy Assets**: CRUD at `/api/tenants/:id/copy-assets`
- **Calendar Items**: CRUD at `/api/tenants/:id/calendar-items`
- **Dashboard**: `/api/tenants/:id/dashboard`
- **Activity**: `/api/tenants/:id/activity`
- **Analytics**: `/api/tenants/:id/analytics`
- **Members**: `/api/tenants/:id/members`
- **Usage**: `/api/tenants/:id/usage`
- **AI**: `/api/tenants/:id/ai/generate-copy`, `generate-strategy`, `generate-campaign-ideas`

Phase 3 routes:
- **Billing**: `/api/tenants/:id/subscription` (GET), `/api/tenants/:id/subscription/change` (POST), `/cancel`, `/reactivate`
- **Billing Profile**: `/api/tenants/:id/billing-profile` (GET/PUT)
- **Invoices**: `/api/tenants/:id/invoices` (GET)
- **Add-ons**: `/api/tenants/:id/add-ons` (GET), `/api/tenants/:id/add-ons/purchase` (POST)
- **Credit Packs**: `/api/tenants/:id/credit-packs` (GET)
- **Usage Summary**: `/api/tenants/:id/usage-summary` (GET)
- **Integrations Hub**: `/api/tenants/:id/integrations` (GET), `/connect`, `/disconnect`, `/sync`, `/sync-history`
- **Templates**: `/api/templates` (GET global), `/api/tenants/:id/templates` (GET/POST), `/:templateId/use` (POST)
- **Admin**: `/api/admin/overview`, `/tenants` (GET), `/tenants/:id` (GET/PUT/DELETE), `/tenants/:id/plan` (PUT), `/tenants/:id/credits` (PUT), `/feature-flags` (GET/PUT), `/integrations-health`
- **Reports**: `/api/tenants/:id/reports` (GET/POST), `/:reportId/generate` (POST)
- **Exports**: `/api/tenants/:id/exports` (GET/POST)
- **Notifications**: `/api/tenants/:id/notifications` (GET), `/:id/read`, `/read-all`
- **Recommendations**: `/api/tenants/:id/recommendations` (GET), `/:id/dismiss`
- **Leads**: `/api/tenants/:id/lead-submissions` (GET)

All tenant routes require authentication + membership verification.

## Frontend Pages

Public pages:
- `/` - Premium marketing landing page (hero, features, how-it-works, testimonials, pricing preview, FAQ, footer)
- `/pricing` - Pricing tiers with monthly/annual toggle, plan comparison table, FAQ
- `/privacy` - Privacy Policy page
- `/terms` - Terms of Service page
- `/login` - Replit Auth login

Authenticated pages (all use AppLayout with sidebar):
- `/onboarding` - 6-step onboarding wizard (business info, type/industry, audience, brand voice, goals/channels, finish)
- `/dashboard` - Stats cards, AI credits usage, campaign status, recent copy, AI recommendations, activity feed, upcoming calendar
- `/brands` - Brand HQ (list/create/detail with colors, typography, guidelines)
- `/campaigns` - Campaign management with templates, grid/list view, status filters
- `/campaigns/:id` - Tabbed campaign detail (overview, strategy, copy, checklist, analytics)
- `/copy-studio` - AI copy generation with 10 channel modes, content scoring, compare mode, favorites, grid/list view
- `/calendar` - Content calendar (month/list view, filters by type/status, overdue alerts, day selection detail)
- `/analytics` - Charts, metrics, channel breakdown, AI recommendations panel
- `/strategy` - AI strategy generation + campaign ideas
- `/ai-workflows` - 6 guided AI workflows (product launch, content plan, ad campaign, lead gen, email sequence, refresh messaging)
- `/settings` - Tabbed settings (workspace, billing with plan management, usage meters, add-on store, team with invite, security)
- `/integrations` - Integrations hub with 12 providers, search/filter by category, connect/disconnect/sync
- `/templates` - Template marketplace with featured templates, categories, premium badges, preview modal
- `/admin` - Super admin console with overview KPIs, tenant management (change plan, rename, suspend, delete, adjust credits), feature flags, integration health
- `/reports` - Report builder with 6 report types, white-label branding, create/generate/export, KPI preview

## Launch Readiness

- All fake/placeholder data removed from charts and metrics — everything derived from real API or shows proper empty states
- Contextual empty states on every page with specific guidance and clear CTAs
- Filtered empty states in Templates and Integrations with "Clear Filters" action
- Report preview chart uses deterministic data (not Math.random)
- Plan feature lists fully aligned between home page and pricing page (identical features per tier)
- Security/compliance claims verified and softened where unverifiable (e.g. "Enterprise Security" not "SOC 2 Compliant")
- Negative remaining credits edge case handled with Math.max(0, ...)
- Upgrade CTAs use Crown icon with contextual per-feature text
- Dashboard contextual actions derived from actual user state (hasBrands, hasCopy, hasCampaigns, creditPercent)
- Super admin role: `users.role = "super_admin"` checked by `requirePlatformAdmin` middleware; auto-promoted from `SUPER_ADMIN_EMAILS` config in `tenant-auth.ts`
- Footer legal links route to real Privacy Policy and Terms of Service pages (not placeholder destinations)
- Template usage counts only render when > 0 (no "undefined uses" display)
- Templates page hides search/filter UI when no templates exist, shows clean empty state with CTA

## Design System

- Premium gradient brand palette (`gradient-brand`, `gradient-brand-text` CSS utilities)
- Glass morphism effect (`glass` utility)
- Dark mode support via `.dark` class toggle
- Semantic colors: success, warning, info, destructive
- Consistent rounded-full buttons, rounded-xl cards
- Collapsible sidebar with workspace switcher and dark mode toggle

## Auth Flow

1. User clicks "Continue with Replit" -> redirects to `/api/login`
2. Replit OIDC flow completes -> user record created in DB
3. Session cookie set, frontend `useAuth()` detects authentication
4. `TenantProvider` loads user's tenants via `useListTenants()`
5. If no tenants, redirects to `/onboarding` to create workspace
6. Active `tenantId` stored in React context, passed to all API calls

## AI Integration

Uses OpenAI via Replit AI Integrations proxy. Environment variables:
- `AI_INTEGRATIONS_OPENAI_BASE_URL`
- `AI_INTEGRATIONS_OPENAI_API_KEY`

AI credit enforcement: checks `aiCreditsUsed < aiCreditsLimit` before each generation call. Returns 429 when limit exceeded.

## Plan Tiers & Monetization

- **Free**: 50 credits, 1 brand, 3 campaigns, $0
- **Starter**: 200 credits, 3 brands, 10 campaigns, $19/mo
- **Growth**: 1,000 credits, 10 brands, unlimited campaigns, $59/mo
- **Agency**: 5,000 credits, 25 brands, unlimited campaigns, $149/mo
- **Enterprise**: Unlimited credits, 999 brands, $399/mo

Add-on catalog: credit packs (100/500/2000), storage (1GB/5GB), extra seats, premium templates, white-label reports, extra pages, advanced exports

Plan config: `artifacts/api-server/src/lib/plan-limits.ts`

## Frontend Data Hooks

Phase 2 hooks: codegen from OpenAPI spec (`@workspace/api-client-react`, `@workspace/api-zod`)
Phase 3 hooks: custom React Query hooks in `artifacts/brandforge/src/lib/api-hooks.ts` (30+ hooks for billing, integrations, templates, admin, reports, notifications, recommendations)

## Key Commands

- `pnpm run typecheck` - TypeScript checking
- `pnpm --filter @workspace/db run push` - Push DB schema
- `pnpm --filter @workspace/api-spec run codegen` - Regenerate API client
- `pnpm --filter @workspace/api-server run dev` - Run API server
- `pnpm --filter @workspace/brandforge run dev` - Run frontend

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server with auth middleware, tenant isolation, AI generation routes, billing, integrations hub, templates, admin, reports, and notifications routes.

### `artifacts/brandforge` (`@workspace/brandforge`)

React+Vite frontend with shadcn/ui components, wouter routing, TanStack Query data fetching.

### `lib/db` (`@workspace/db`)

Drizzle ORM schema and connection. Push schema with `pnpm --filter @workspace/db run push`.

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec and Orval codegen config. Run: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas for request/response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client.
