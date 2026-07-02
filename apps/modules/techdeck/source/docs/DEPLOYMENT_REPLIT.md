# Tech Deck - Replit Deployment Guide

## Prerequisites

- Replit account with a PostgreSQL database provisioned
- Node.js 20+ (provided by Replit environment)

## Required Secrets

The following secrets must be configured in the Replit Secrets tab:

| Secret | Description | Auto-Provisioned |
|--------|-------------|------------------|
| `DATABASE_URL` | PostgreSQL connection string | Yes (Replit DB) |
| `PGHOST` | PostgreSQL host | Yes (Replit DB) |
| `PGPORT` | PostgreSQL port | Yes (Replit DB) |
| `PGUSER` | PostgreSQL user | Yes (Replit DB) |
| `PGPASSWORD` | PostgreSQL password | Yes (Replit DB) |
| `PGDATABASE` | PostgreSQL database name | Yes (Replit DB) |
| `SESSION_SECRET` | Express session signing key | Set manually |
| `REPLIT_DOMAINS` | Replit domain for OIDC callback | Yes (Replit) |
| `REPLIT_DEV_DOMAIN` | Replit dev domain for OIDC | Yes (Replit) |
| `REPL_ID` | Replit project ID | Yes (Replit) |

## Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_ONLY` | Set to `"true"` to run as headless API server | `undefined` (full SPA mode) |
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Runtime environment | `development` |

## Database Setup

Push the Drizzle schema to the PostgreSQL database:

```bash
npm run db:push
```

This uses `drizzle-kit push` to synchronize all tables defined in `shared/schema.ts` with the database. No manual migration files are needed.

If there are schema conflicts during iteration, you can force-push:

```bash
npm run db:push --force
```

## Starting the Application

### Full Mode (SPA + API)

```bash
npm run dev
```

This starts the Express backend and Vite dev server on port 5000. The frontend and backend are served from the same origin.

### API-Only Mode

Set the environment variable `API_ONLY=true` before starting:

```bash
API_ONLY=true npm run dev
```

In API-Only mode:
- Session auth and Replit OIDC are disabled
- The SPA frontend is not served
- Only `/api/v1/*` endpoints and `/health` are available
- Bearer token authentication is required for protected endpoints

### Production Build

```bash
npm run build
NODE_ENV=production npm run dev
```

The build step compiles the Vite frontend into `dist/public/`. In production mode, Express serves the compiled static files instead of running the Vite dev server.

## API Token Authentication

API tokens are managed via the admin UI at `/api-tokens` (requires OWNER or ADMIN role).

Tokens use Bearer authentication:

```bash
curl -H "Authorization: Bearer snv_<token>" https://your-app.replit.app/api/v1/evidence
```

Available scopes: `evidence:read`, `license:validate`, `status:read`

## Module Overview

| Module | Mount Path | Description |
|--------|-----------|-------------|
| Core | `/api` | Tenants, users, teams, audit, settings |
| Evidence | `/api/evidence` | File upload, search, preview |
| License | `/api/license` | License products, keys, validation |
| Webhooks | `/api/webhooks` | Outbound webhook delivery |
| Status | `/api/status` | Public status pages |
| Reports | `/api/reports` | Compliance report generation |
| Portal | `/api/portal` | Client portal (read-only) |
| API | `/api/v1` | Programmatic REST API |

## Health Check

```bash
curl https://your-app.replit.app/health
# Returns: { "status": "ok", "mode": "full", "version": "1.0.0", "database": "connected" }
```

The `/health` endpoint is available in both full and API-Only modes. It returns:

| Field | Description |
|-------|-------------|
| `status` | `"ok"` if healthy, `"degraded"` if DB unreachable (HTTP 503) |
| `mode` | `"full"` or `"api_only"` |
| `version` | Version from `package.json` |
| `database` | `"connected"` or `"unreachable"` |
