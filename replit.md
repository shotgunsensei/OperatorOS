# OperatorOS

AI-native Cloud Development Environment — the operating system for managing app workspaces, services, and deployments. Powered by Shotgun Ninjas.

## System Domains

OperatorOS presents these system domains:

- **Workspaces** — project environments (git-backed)
- **Processes** — managed commands and running jobs
- **Services** — preview servers, background agents, databases, watchers
- **Automation** — event-driven rules (trigger → action)
- **System** — status, events, notifications
- **Publish** — deployment assistant (analyze → plan → artifacts → proof)

## Project Structure

pnpm monorepo:

```
apps/
  api/              - Fastify control plane API (port 5001, Postgres-backed)
    src/index.ts    - Kernel entrypoint (registers plugins, existing routes)
    src/routes/     - Modular route files
      os-routes.ts  - OS primitives: processes, services, automation, system
    src/lib/        - Shared utilities
      db-init.ts    - Extended table creation
      exec.ts       - Safe workspace execution facade
      system-events.ts - Event/notification emission helpers
    src/publish/    - Publish assistant module
    src/agent.ts    - AI agent loop (GPT-4o)
    src/schema.ts   - Drizzle ORM schema (all tables)
  web/              - Next.js GUI (port 5000, operator shell layout)
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

## API Endpoints

### Core Workspace Endpoints (apps/api/src/index.ts)
- `GET /healthz` - Health check
- `GET /readyz` - Readiness probe
- `GET /v1/profiles` - List runner profiles
- `POST /v1/workspaces` - Create workspace
- `GET /v1/workspaces` - List workspaces
- `GET /v1/workspaces/:id` - Get workspace + runner status
- `POST /v1/workspaces/:id/start` - Start runner
- `POST /v1/workspaces/:id/stop` - Stop runner
- `POST /v1/workspaces/:id/exec` - Execute command
- `GET /v1/workspaces/:id/tree` - File tree
- `POST /v1/workspaces/:id/read-file` - Read file
- `POST /v1/workspaces/:id/apply-patch` - Apply unified diff
- `POST /v1/workspaces/:id/git-status` - Git status
- `POST /v1/workspaces/:id/verify` - Run verification pipeline

### Task/Agent Endpoints
- `POST /v1/tasks` - Create task
- `POST /v1/tasks/:taskId/run` - Run agent task
- `GET /v1/tasks/:taskId` - Get task
- `GET /v1/tasks/:taskId/events` - Task events
- `GET /v1/tasks/:taskId/events/stream` - SSE stream
- `GET /v1/tasks/:taskId/traces` - Tool traces

### OS Primitives (apps/api/src/routes/os-routes.ts)

**System:**
- `GET /v1/system/status` - System-wide counts (workspaces, processes, services, notifications)
- `GET /v1/system/events` - System event feed
- `GET /v1/system/notifications` - User-facing notifications
- `POST /v1/system/notifications/:id/read` - Mark notification read

**Processes:**
- `GET /v1/workspaces/:id/processes` - List managed processes
- `POST /v1/workspaces/:id/processes` - Start process (foreground or background)
- `POST /v1/workspaces/:id/processes/:processId/stop` - Stop process
- `GET /v1/workspaces/:id/processes/:processId/logs` - View process logs

**Services:**
- `GET /v1/workspaces/:id/services` - List services
- `POST /v1/workspaces/:id/services/start` - Start named service
- `POST /v1/workspaces/:id/services/:serviceId/stop` - Stop service
- `GET /v1/workspaces/:id/services/:serviceId/status` - Service health

**Automation:**
- `GET /v1/workspaces/:id/automations` - List automation rules
- `POST /v1/workspaces/:id/automations` - Create rule
- `POST /v1/workspaces/:id/automations/:ruleId/toggle` - Toggle enabled/disabled

### Publish Assistant
- `POST /v1/publish/analyze` - Detect framework/platform
- `POST /v1/publish/plan` - Generate deployment plan
- `POST /v1/publish/artifacts` - Generate deployment configs
- `POST /v1/publish/proof` - Run pre-deployment checks
- `POST /v1/publish/explain` - LLM-powered explanation
- `GET /v1/publish/runs/:workspaceId` - Past publish runs

### WebSocket
- `WS /v1/runner/stream/:workspaceId` - Stream stdout/stderr/exit events

## Web GUI (apps/web on port 5000)

Operator shell layout with:
- Left sidebar: WorkspacePanel (create, select, start/stop, process/service counts)
- Top bar: SystemStatusBar (workspace state, runner mode, process/service counts)
- Top right: SystemNotifications (dropdown drawer)
- Main area: FileExplorer + Editor
- Bottom panel (7 tabs): Terminal | Processes | Services | Agent | Publish | Preview | Automation

Components:
- `SystemStatusBar.tsx` - Live system status chips
- `SystemNotifications.tsx` - Notification bell with drawer
- `ProcessesPanel.tsx` - Task manager (start bg/fg, stop, view logs)
- `ServicesPanel.tsx` - Service console (start/stop named services)
- `AutomationPanel.tsx` - Rule CRUD (trigger → action, toggle)
- `PreviewPanel.tsx` - Service-aware preview with auto-detection
- `WorkspacePanel.tsx` - Enhanced with process/service counts
- `AgentPanel.tsx` - AI agent with goal input and event stream
- `PublishPanel.tsx` - Deployment wizard

## Database

PostgreSQL via Drizzle ORM + raw SQL (auto-created on startup):

**Core tables:**
- `workspaces` - id, git_url, git_ref, profile_id, status, timestamps
- `runners` - workspace_id (FK), mode, pod_name/container_id, status
- `tasks` - id, workspace_id (FK), title, status, required_checks, check_results
- `task_events` - id, task_id (FK), ts, type, payload
- `tool_traces` - id, task_id (FK), ts, tool_name, input, output, success
- `workspace_ports` - id, workspace_id (FK), port, protocol, is_primary
- `publish_runs` - id, workspace_id (FK), status, detectedJson, planJson, proofJson

**OS tables (created by ensureExtendedTables):**
- `workspace_processes` - id, workspace_id, name, command, status, provider_process_id, exit_code, log_path
- `workspace_services` - id, workspace_id, name, type, command, status, port, protocol, health_path, process_id
- `automation_rules` - id, workspace_id, name, trigger_type, trigger_json, action_type, action_json, enabled
- `system_events` - id, workspace_id, task_id, source, type, severity, payload, ts
- `system_notifications` - id, workspace_id, title, message, level, read
- `workspace_snapshots` - id, workspace_id, label, git_ref, metadata_json

## Runner Modes

Set `RUNNER_MODE` env var:
- `local` (default) - Direct filesystem execution, clones to /tmp/operatoros-workspaces/<id>
- `docker` - Docker containers via docker CLI
- `k8s` - Kubernetes pods/PVCs via kubectl

## Safety

- Command denylist: curl, wget, ssh, scp, sudo, docker, kubectl (override: ALLOW_UNSAFE_COMMANDS=true)
- Patch denylist: .env*, *.pem, *.key, node_modules/, dist/, build/, .git/
- Max patch size: 20KB, max timeout: 300s, max output: 1MB

## Mobile (Android / Capacitor)

- Config: `apps/web/capacitor.config.ts` (app ID: `com.shotgunninjas.operatoros`)
- Build: `pnpm build:android` → static export → cap sync → gradle build
- Store guide: `apps/web/PLAY_STORE_GUIDE.md`

## AI Agent

GPT-4o agent with function calling (read_file, apply_patch, run_verify, exec). Budget: 12 iterations, 200K tokens.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 5001 (api), 5002 (gateway) | Service port |
| RUNNER_MODE | local | Runner provider: local, docker, k8s |
| DATABASE_URL | (from Replit) | PostgreSQL connection string |
| NEXT_PUBLIC_API_URL | http://localhost:5001 | API URL for Next.js |
| ALLOW_UNSAFE_COMMANDS | false | Override command denylist |
| OPENAI_API_KEY | (secret) | OpenAI API key for AI Agent |

## Package Names

All packages use `@operatoros/*` namespace:
- `@operatoros/api`, `@operatoros/web`, `@operatoros/runner-gateway`
- `@operatoros/sdk`, `@operatoros/profiles`, `@operatoros/agent-runtime`
