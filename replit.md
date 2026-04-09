# OperatorOS

AI-native Cloud Development Environment and SaaS platform — the operating system for managing app workspaces, services, and deployments. Powered by Shotgun Ninjas.

## System Overview

OperatorOS has two layers:
1. **SaaS Platform** — Auth, billing, workspaces, projects, tasks, notes, activity tracking, admin panel
2. **CDE Operator Shell** — Terminal, processes, services, agent, publish, preview, automation (legacy)

## Project Structure

pnpm monorepo:

```
apps/
  api/              - Fastify control plane API (port 5001, Postgres-backed)
    src/index.ts    - Server entrypoint (registers plugins, all routes)
    src/routes/
      os-routes.ts  - OS primitives: processes, services, automation, system
      auth-routes.ts - Auth: register, login, logout, forgot/reset password
      saas-routes.ts - SaaS CRUD: workspaces, projects, tasks, notes, activity, dashboard
      admin-routes.ts - Admin panel: users, metrics, audit logs
      billing-routes.ts - Billing: subscriptions, plan switching, usage
    src/lib/
      auth.ts       - JWT/bcrypt auth helpers, authenticate middleware, plan limits
      saas-db-init.ts - SaaS table creation + plan/admin seeding
      db-init.ts    - Extended table creation (OS tables)
      exec.ts       - Safe workspace execution facade
      system-events.ts - Event/notification emission helpers
    src/publish/    - Publish assistant module
    src/agent.ts    - AI agent loop (GPT-4o)
    src/schema.ts   - Drizzle ORM schema (all tables)
  web/              - Next.js GUI (port 5000)
    src/app/page.tsx - Main SaaS app (state-based routing for all pages)
    src/components/
      SaasLayout.tsx - Collapsible sidebar nav with dark theme
      AuthProvider.tsx - Auth context (JWT in localStorage)
    src/lib/
      auth.ts       - API helpers (authApi, saasApi, billingApi, adminApi)
  runner-gateway/   - Runner execution providers (local, Docker, K8s) + safety module (port 5002)
packages/
  sdk/              - Shared TypeScript types, patch validation helpers
  agent-runtime/    - Deterministic verification-first task runner
  profiles/         - Runner profiles (node20, python311, go122, dotnet8, java21)
infra/
  k8s/              - Kubernetes deployment manifests
  docker/           - Dockerfiles and docker-compose
```

## Running

### Development (3 services)
The workflow starts all 3 services:
- **API** on port 5001: `PORT=5001 tsx apps/api/src/index.ts`
- **Runner Gateway** on port 5002: `PORT=5002 tsx apps/runner-gateway/src/index.ts`
- **Web (Next.js)** on port 5000: `NEXT_PUBLIC_API_URL=http://localhost:5001 npx next dev -p 5000` (webview)

The Next.js app proxies API calls via rewrites: `/api/*` -> `localhost:5001/v1/*`

### Port Map
| Service | Dev Port | Notes |
|---------|----------|-------|
| Web (Next.js) | 5000 | Replit webview, proxies /api/* to API |
| API | 5001 | Fastify control plane |
| Runner Gateway | 5002 | Standalone runner service |

## Authentication & Authorization

- **Method**: Email/password with bcrypt hashing (12 rounds) + JWT tokens (7-day expiry)
- **Token storage**: localStorage (frontend) + httpOnly cookie (backend)
- **JWT secret**: Uses SESSION_SECRET env var (fallback: 'operatoros-dev-secret')
- **Seeded admin**: admin@operatoros.com / Admin123! (overridable via ADMIN_EMAIL/ADMIN_PASSWORD env vars)
- **Cookie security**: `secure` flag enabled in production only
- **Account lockout**: 5 failed login attempts = 15-minute lockout
- **User statuses**: active, suspended, deleted, pending
- **Middleware suite**:
  - `authenticate` — JWT verification + user status checks (suspended/deleted/locked)
  - `requireAdmin` — Verifies admin role
  - `requireActiveSubscription` — Checks subscription status (blocks past_due/canceled/expired)
  - `requirePlanFeature(featureKey)` — Gates features by plan (exports, automation, templates, advancedAnalytics)
  - `requireUsageWithinLimit(resourceType)` — Enforces monthly usage limits (aiActions, etc.)
- **Audit trail**: All auth events logged to admin_audit_logs (login success/failure, password changes, email changes, account deletion, admin actions)

## Subscription & Feature Gating

**Centralized plan config**: `apps/api/src/lib/plans.ts` is the single source of truth (PLAN_CONFIGS). DB seeds from this config.

| Plan | Price | Workspaces | Projects | Tasks | Team | AI/mo | Features |
|------|-------|------------|----------|-------|------|-------|----------|
| Starter | Free | 1 | 3 | 50 | 0 | 10 | Basic |
| Pro | $29/mo | 5 | 25 | 500 | 10 | 200 | Exports, Automation, Templates, API |
| Elite | $99/mo | ∞ | ∞ | ∞ | ∞ | ∞ | All features + White Label, Priority Support |

**Backend enforcement**: Resource creation (workspaces/projects/tasks) checked via `checkResourceLimit()`. Feature access via `checkFeatureAccess()`. Middleware: `requirePlanFeature(key)`, `requireUsageWithinLimit(type)`.

**Downgrade flow**: `getDowngradeViolations()` checks if user exceeds target plan limits before downgrade. Existing data preserved but creation blocked until under limit.

**Frontend gating**: Workspaces/Projects/Tasks pages show lock icons + limit banners when at limit. UpgradeModal with plan comparison + downgrade pre-check. BillingPage has usage bars, plan grid, feature matrix, billing history.

Plans are auto-seeded on startup. Stripe-ready billing endpoints exist but no live Stripe integration yet.

## API Endpoints

### Auth (`/v1/auth/*`)
- `POST /v1/auth/register` - Create account (validates email/password/name)
- `POST /v1/auth/login` - Sign in (returns JWT, tracks failed attempts, lockout)
- `POST /v1/auth/logout` - Sign out (clears cookie, audit logged)
- `GET /v1/auth/me` - Get current user (requires auth)
- `PUT /v1/auth/profile` - Update name/avatar
- `PUT /v1/auth/change-password` - Change password (requires current password)
- `PUT /v1/auth/change-email` - Change email (requires password, issues new JWT)
- `POST /v1/auth/forgot-password` - Request password reset
- `POST /v1/auth/reset-password` - Reset password with token
- `POST /v1/auth/request-deletion` - Self-delete account (requires password, blocked for admins)

### SaaS CRUD (`/v1/saas/*`) — all require auth
- `GET/POST /v1/saas/workspaces` - List/create workspaces
- `GET/DELETE /v1/saas/workspaces/:id` - Get/delete workspace
- `GET/POST /v1/saas/workspaces/:wsId/projects` - List/create projects (workspace-scoped)
- `PUT/DELETE /v1/saas/projects/:id` - Update/delete project (ownership verified)
- `GET/POST /v1/saas/projects/:projectId/tasks` - List/create tasks (project-scoped)
- `PUT/DELETE /v1/saas/tasks/:id` - Update/delete task (ownership verified)
- `GET/POST /v1/saas/notes` - List/create notes
- `PUT/DELETE /v1/saas/notes/:id` - Update/delete note (ownership verified)
- `GET /v1/saas/activity` - Activity feed
- `GET /v1/saas/dashboard` - Dashboard stats + plan limits
- `GET /v1/saas/plans` - List subscription plans

### Admin (`/v1/admin/*`) — require admin role
- `GET /v1/admin/users` - List all users with subscriptions (search, filter by status)
- `GET /v1/admin/users/:id` - User detail with stats, activity, audit history
- `PUT /v1/admin/users/:id/status` - Suspend/reactivate/delete user (audit logged)
- `PUT /v1/admin/users/:id/role` - Change user role (audit logged)
- `PUT /v1/admin/users/:id/plan` - Change user plan (audit + billing event logged)
- `PUT /v1/admin/users/:id/unlock` - Unlock locked account
- `DELETE /v1/admin/users/:id` - Soft-delete user (audit logged)
- `GET /v1/admin/metrics` - Platform metrics (users, subscriptions, content counts)
- `GET /v1/admin/audit-log` - Audit log (filterable by action, userId)

### Billing (`/v1/billing/*`) — require auth
- `GET /v1/billing/subscription` - Current subscription
- `GET /v1/billing/usage` - Usage summary (workspaces/projects/tasks/team/AI counts vs limits)
- `GET /v1/billing/plans` - All plans from PLAN_CONFIGS with features
- `POST /v1/billing/subscribe` - Subscribe/upgrade/downgrade (returns downgradeWarnings)
- `POST /v1/billing/check-downgrade` - Pre-check downgrade violations before committing
- `POST /v1/billing/cancel` - Cancel subscription

### Core Workspace Endpoints
- `GET /healthz` - Health check
- `GET /readyz` - Readiness probe
- `POST /v1/workspaces` - Create workspace
- `GET /v1/workspaces` - List workspaces
- Various workspace management endpoints (start/stop/exec/tree/git)

### OS Primitives (`/v1/system/*`, `/v1/workspaces/:id/*`)
- System status, events, notifications
- Process management (start/stop/logs)
- Service management (start/stop/health)
- Automation rules (CRUD + toggle)

### Publish Assistant
- Analyze → Plan → Artifacts → Proof pipeline

## Frontend Architecture

- **Routing**: State-based (activePage state in page.tsx), not Next.js router
- **Styling**: Inline styles exclusively (no Tailwind/CSS modules), dark-first theme
- **Auth flow**: Login → Dashboard (default), Register, Forgot Password pages
- **SaaS pages**: Dashboard, Projects, Tasks, Notes, Activity, AI Tools, Workspaces, Billing, Settings, Admin
- **Layout**: Collapsible sidebar with user info, plan badge, and nav items

## Database

PostgreSQL via Drizzle ORM + raw SQL (auto-created on startup):

**SaaS tables (created by ensureSaasTables):**
- `users` - id, email, password_hash, name, role, status
- `subscription_plans` - id, name, slug, price, limits (JSON)
- `subscriptions` - user_id, plan_id, status, stripe fields
- `saas_workspaces` - id, owner_id, name, slug, description
- `workspace_memberships` - workspace_id, user_id, role
- `saas_projects` - id, workspace_id, user_id, name, status, color
- `saas_tasks` - id, project_id, user_id, title, status, priority
- `notes` - id, user_id, title, content, workspace_id, project_id
- `activity_feed` - id, user_id, action, entity_type, entity_id
- `usage_tracking` - id, user_id, action_type, count
- `admin_audit_logs` - id, admin_user_id, action, target
- `billing_events` - id, user_id, event_type, amount
- `password_reset_tokens` - id, user_id, token, expires_at

**Core tables:** workspaces, runners, tasks, task_events, tool_traces, workspace_ports, publish_runs

**OS tables:** workspace_processes, workspace_services, automation_rules, system_events, system_notifications, workspace_snapshots

## Security

- Multi-tenant authorization: workspace membership verified on all CRUD operations
- Ownership checks on project/task/note update/delete
- Admin role bypass for all resource access
- Input validation: enum validation for status/priority, length limits, type checks
- Cookie secure flag: dynamic based on NODE_ENV
- Command denylist for CDE shell (curl, wget, ssh, sudo, etc.)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 5001 (api), 5002 (gateway) | Service port |
| DATABASE_URL | (from Replit) | PostgreSQL connection string |
| SESSION_SECRET | operatoros-dev-secret | JWT signing secret |
| NEXT_PUBLIC_API_URL | http://localhost:5001 | API URL for Next.js |
| ADMIN_EMAIL | admin@operatoros.com | Seeded admin email |
| ADMIN_PASSWORD | Admin123! | Seeded admin password |
| RUNNER_MODE | local | Runner provider: local, docker, k8s |
| ALLOW_UNSAFE_COMMANDS | false | Override command denylist |
| OPENAI_API_KEY | (secret) | OpenAI API key for AI Agent |
| MOBILE_BUILD | 0 | Set to 1 for static export |

## Package Names

All packages use `@operatoros/*` namespace:
- `@operatoros/api`, `@operatoros/web`, `@operatoros/runner-gateway`
- `@operatoros/sdk`, `@operatoros/profiles`, `@operatoros/agent-runtime`
