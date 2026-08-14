# SnapProof AI by Shotgun Ninjas Productions

## Overview

Production-grade SaaS web application for field documentation and proof-of-work. Technicians, mechanics, contractors, and IT field engineers capture photos, notes, findings, and parts on a job, then generate polished client-ready reports and PDF exports. Dark graphite/black UI with crimson accent (#dc2626), mobile-first, tactical field operations console feel.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React 19 + Vite + Tailwind CSS v4 + wouter (routing) + TanStack React Query
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: JWT (jsonwebtoken) in httpOnly cookie, bcryptjs for password hashing, 7-day expiry
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- **Build**: esbuild (CJS bundle for API server)
- **UI Components**: shadcn/ui pattern with custom dark theme

## Architecture

### Artifacts
- `artifacts/api-server` — Express API server (port 8080)
- `artifacts/snapproof` — React + Vite frontend (previewPath `/`)
- `artifacts/mockup-sandbox` — Design mockup server

### Shared Libraries
- `lib/db` — Drizzle ORM schema and database connection
- `lib/api-spec` — OpenAPI specification + Orval codegen config
- `lib/api-client-react` — Generated React Query hooks from OpenAPI
- `lib/api-zod` — Generated Zod validation schemas from OpenAPI

### Database Schema (16 tables)
- `users` — User accounts with roles (owner/admin/tech/viewer)
- `organizations` — Multi-tenant organizations with plan billing
- `customers` — Customer records per organization
- `jobs` — Field jobs with status tracking (draft/in_progress/completed/archived)
- `findings` — Structured issue documentation (issue/cause/resolution/recommendation/severity)
- `notes` — Internal and customer-facing notes, voice note support
- `parts` — Parts used with quantities and pricing
- `labor` — Labor entries with hours and rates
- `files` — File attachments (photos, documents)
- `templates` — Job templates (system + custom)
- `reports` — Generated reports (draft/approved/exported)
- `exports` — PDF/DOCX export records
- `share_links` — Shareable report links with token auth
- `team_members` — Team membership and roles
- `branding` — Organization branding (logo, colors, contact info)
- `activity` — Activity audit log

### API Routes
- `/api/auth/*` — Register, login, logout, me, profile
- `/api/organizations/*` — CRUD organizations
- `/api/jobs/*` — CRUD jobs with search/filter
- `/api/customers/*` — CRUD customers
- `/api/jobs/:id/findings|notes|parts|labor|files` — Job sub-items
- `/api/templates/*` — System and custom templates
- `/api/jobs/:id/generate-report` — Report generation
- `/api/reports/*` — Report management
- `/api/reports/:id/export` — Export reports
- `/api/reports/:id/share` — Create share links
- `/api/share/:token` — Public shared report view
- `/api/team/*` — Team member management
- `/api/branding` — Organization branding
- `/api/activity` — Activity feed
- `/api/dashboard/*` — Dashboard summary and stats
- `/api/billing/*` — Billing plan management

### Frontend Pages
- Public: Landing (`/`), Features, Use Cases, Pricing, Login, Register
- App: Dashboard, Jobs, Job Detail, Customers, Customer Detail, Templates, Activity, Profile, Settings, Billing

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed` — seed system templates
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Theme

Dark graphite background (hsl 0 0% 7%), crimson primary accent (hsl 348 83% 47%), card backgrounds at 10% lightness, borders at 15%. Inter font family. Tight border radius (0.3rem).

## Billing Plans

free($0), solo($19), pro($49), team($99), whitelabel($199) — hardcoded in billing routes.

## Environment

- `DATABASE_URL` — PostgreSQL connection string (auto-provided)
- `SESSION_SECRET` — Used as JWT signing secret
