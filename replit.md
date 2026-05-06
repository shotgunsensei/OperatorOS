# OperatorOS

## Overview

OperatorOS is an AI-native Cloud Development Environment (CDE) and SaaS platform designed to manage application workspaces, services, and deployments. It provides a comprehensive ecosystem for developers, offering tools for project management, task tracking, note-taking, and activity monitoring, alongside a powerful CDE Operator Shell for terminal access, process management, and automation. The platform aims to streamline the development lifecycle, enhance collaboration, and integrate AI-powered capabilities to boost productivity for individual developers and teams.

## User Preferences

I want iterative development.
Ask before making major changes.
I prefer to be given all the information before you make any changes.
I prefer detailed explanations.
I prefer simple language.
I like functional programming.

## System Architecture

OperatorOS is built as a pnpm monorepo with a clear separation of concerns, comprising a SaaS Platform and a CDE Operator Shell.

**UI/UX Decisions:**
The web interface (Next.js) uses state-based routing and inline styles with a dark-first theme for a consistent and modern user experience. The layout features a collapsible sidebar navigation, user info, and plan badges, providing intuitive access to different sections.

**Technical Implementations:**
- **API (Fastify):** The control plane API handles all backend logic, including authentication, SaaS CRUD operations (workspaces, projects, tasks, notes, activity), admin functionalities, billing, and AI operations. It uses Drizzle ORM for database interactions.
- **Web (Next.js):** The frontend provides a rich GUI for the SaaS platform, consuming data from the API. It manages user authentication via JWT stored in localStorage.
- **Runner Gateway:** A standalone service responsible for executing code and managing runners, supporting local, Docker, and Kubernetes environments. It includes a safety module to prevent unsafe command execution.
- **AI Agent:** An integrated AI agent loop, powered by GPT-4o, assists with development tasks and automation.
- **AI Operations Assistant:** A modular AI tool system with provider abstraction, plan-gated tools, prompt templates, usage metering, and execution history.
- **Publish Assistant:** A module facilitating a structured pipeline for analyzing, planning, generating artifacts, and proofing.

**Feature Specifications:**
- **Authentication & Authorization:** Implements email/password authentication with bcrypt and JWTs. It includes comprehensive authorization middleware for role-based access control, subscription plan gating, and usage limit enforcement.
- **Subscription & Feature Gating:** A flexible subscription system with Starter, Pro, and Elite plans, defined by a centralized configuration. Features and resource limits are enforced on both backend and frontend, with a sophisticated downgrade flow to prevent data loss.
- **Admin Control Center:** A dedicated administrative interface for managing users, monitoring metrics, auditing actions, and handling billing events.
- **Core Workspace Management:** Provides endpoints for creating, listing, and managing workspaces, including process, service, and automation rule management.

**System Design Choices:**
- **Monorepo Structure:** Facilitates shared code (SDK) and consistent development across different services.
- **Database (PostgreSQL):** Utilizes PostgreSQL with Drizzle ORM for structured data storage, including SaaS-specific tables (users, subscriptions, workspaces, projects, tasks, notes) and CDE-specific tables (workspace processes, services, automation rules).
- **Environment Variables:** Extensive use of environment variables for configuration, including database connections, session secrets, API URLs, admin credentials, and Stripe integration keys.
- **Security:** Employs multi-tenant authorization, ownership checks, input validation, and a command denylist for CDE shell to ensure a secure environment.

## External Dependencies

- **PostgreSQL:** Primary database for all application data.
- **Stripe:** Integrated for subscription management, billing, and payment processing (optional, activated via environment variables).
- **OpenAI API:** Used by the AI Operations Assistant and AI Agent for AI-powered functionalities (requires `OPENAI_API_KEY`). Falls back to mock provider if quota is exhausted.
- **Fastify:** Web framework for the API service.
- **Next.js:** React framework for the web frontend.
- **Drizzle ORM:** TypeScript ORM for interacting with PostgreSQL.
- **pnpm:** Monorepo package manager.
- **bcrypt:** For password hashing.
- **jsonwebtoken (JWT):** For user authentication tokens.

## AI Operations Assistant Module

The AI module provides plan-gated AI tools with a swappable provider architecture.

**Provider Abstraction** (`apps/api/src/lib/ai-provider.ts`):
- `AiProvider` interface with `complete()` method
- `OpenAiProvider` — calls OpenAI GPT-4o Mini with automatic fallback to mock on quota errors
- `MockAiProvider` — generates realistic mock responses for demo/testing
- Provider selection is automatic: uses OpenAI if `OPENAI_API_KEY` is set, otherwise mock

**AI Tools** (`apps/api/src/lib/ai-service.ts`):
| Tool | Min Plan | Credits | Description |
|------|----------|---------|-------------|
| Quick Action Assistant | Starter | 1 | General operational Q&A |
| Notes Summarizer | Starter | 1 | Summarize notes/docs into key points |
| Task Breakdown Generator | Pro | 2 | Break goals into sub-tasks with priorities |
| Project Action Planner | Pro | 3 | Full project plan with phases and risks |
| Bulk Operations Assistant | Elite | 3 | Batch-process tasks/notes/projects |
| Automation Suggestions | Elite | 2 | AI workflow automation recommendations |

**Plan Limits:**
- Starter: 10 AI credits/month, basic tools only
- Pro: 200 AI credits/month, + task/project generation, saved templates
- Elite: 9,999 AI credits/month (unlimited), + bulk ops, automation

**API Routes** (`apps/api/src/routes/ai-routes.ts`):
- `GET /v1/ai/tools` — list tools with plan availability
- `POST /v1/ai/execute` — run an AI tool (body: `{toolType, input, templateId?}`)
- `GET /v1/ai/usage` — monthly usage stats and provider info
- `GET /v1/ai/history` — action history with output previews
- `POST /v1/ai/check-access` — check tool access before execution
- `GET/POST/PUT/DELETE /v1/ai/templates` — prompt template CRUD (Pro+)

**Frontend** (`apps/web/src/components/pages/AiToolsPage.tsx`):
- Tool grid with plan gating badges and category grouping
- Tool executor with textarea, template selection, and markdown result rendering
- Prompt templates manager (Pro+) with `{{input}}` placeholder support
- Action history with expandable output previews
- Usage dashboard with credit gauge, per-tool breakdown, and provider info

## Project Structure

```
apps/
  api/src/
    index.ts              — Fastify server, route registration
    schema.ts             — Drizzle ORM schema (all tables)
    db.ts                 — Database connection
    lib/
      auth.ts             — JWT auth, authenticate middleware
      plans.ts            — Plan configs, usage limits, feature checks
      billing-service.ts  — Stripe integration + local billing
      ai-provider.ts      — AI provider abstraction (OpenAI/Mock)
      ai-service.ts       — AI tool definitions, execution, templates
      saas-db-init.ts     — Table creation, plan seeding, demo account
    routes/
      auth-routes.ts      — Login, register, profile
      saas-routes.ts      — Workspaces, projects, tasks, notes
      billing-routes.ts   — Subscription management
      admin-routes.ts     — User management, audit logs
      ai-routes.ts        — AI tools, templates, usage, history
      os-routes.ts        — CDE workspace operations
  web/src/
    app/page.tsx          — App shell, auth provider, router
    lib/auth.ts           — API client (authApi, saasApi, billingApi, aiApi, adminApi)
    components/
      SaasLayout.tsx      — Responsive sidebar layout, theme colors
      Toast.tsx            — Toast notification provider
      UpgradeModal.tsx     — Plan upgrade modal
      pages/
        DashboardPage.tsx  — Stats, activity, usage gauges
        WorkspacesPage.tsx — Workspace management
        ProjectsPage.tsx   — Project cards
        TasksPage.tsx      — Task board with filters
        NotesPage.tsx      — Notes with pinning
        AiToolsPage.tsx    — AI Operations Assistant
        BillingPage.tsx    — Subscription management
        SettingsPage.tsx   — Profile, password, email
        AdminPage.tsx      — Admin control center
  runner-gateway/src/     — Runner provisioner, safety module
```

## Database Schema

**SaaS tables:** users, subscription_plans, subscriptions, saas_workspaces, workspace_memberships, saas_projects, saas_tasks, notes, activity_feed, usage_tracking, admin_audit_logs, billing_events, password_reset_tokens, admin_notes

**AI tables:** ai_prompt_templates, ai_actions_log

**Core tables:** workspaces, runners, tasks, task_events, tool_traces, workspace_ports, publish_runs

**OS tables:** workspace_processes, workspace_services, automation_rules, system_events, system_notifications, workspace_snapshots

## Security

- Multi-tenant authorization: workspace membership verified on all CRUD operations
- Ownership checks on project/task/note update/delete
- Template ownership enforced on CRUD and execution
- Admin role bypass for all resource access
- Input validation: enum validation for status/priority, length limits, type checks
- AI input length capped at 10,000 characters
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
| DEMO_EMAIL | demo@operatoros.com | Seeded demo user email |
| DEMO_PASSWORD | Demo1234! | Seeded demo user password |
| RUNNER_MODE | local | Runner provider: local, docker, k8s |
| ALLOW_UNSAFE_COMMANDS | false | Override command denylist |
| OPENAI_API_KEY | (secret) | OpenAI API key for AI Agent & AI Tools |
| STRIPE_SECRET_KEY | — | Stripe secret key (enables Stripe billing) |
| STRIPE_WEBHOOK_SECRET | — | Stripe webhook signing secret |
| STRIPE_MODE | local | Set to `live` to enable Stripe billing |
| STRIPE_PRICE_STARTER | — | Stripe Price ID for Starter plan |
| STRIPE_PRICE_PRO | — | Stripe Price ID for Pro plan |
| STRIPE_PRICE_ELITE | — | Stripe Price ID for Elite plan |
| STRIPE_PRICE_ADDON_&lt;SLUG&gt; | — | Stripe Price ID per add-on module (e.g. `STRIPE_PRICE_ADDON_TRADEFLOWKIT`). Required for that module's Apps-page "Buy add-on" CTA to work in `STRIPE_MODE=live`. Slug is uppercased with `-` replaced by `_`. Default seeded prices: starter-tier $19/mo, pro-tier $29/mo, elite-tier $49/mo. |
| APP_URL | http://localhost:5000 | Base URL for Stripe callback redirects |

## Seeded Accounts

| Account | Email | Password | Plan | Role |
|---------|-------|----------|------|------|
| Admin | john@shotgunninjas.com | Dr0p$0fJup1t3r | Elite | admin |
| Demo | demo@operatoros.com | Demo1234! | Pro | user |

The demo account comes pre-loaded with a workspace, project, tasks, notes, and activity for evaluation.

## Package Names

All packages use `@operatoros/*` namespace:
- `@operatoros/api`, `@operatoros/web`, `@operatoros/runner-gateway`
- `@operatoros/sdk`, `@operatoros/profiles`, `@operatoros/agent-runtime`
