# OperatorOS

AI-native Cloud Development Environment control plane. Powered by Shotgun Ninjas.

## Project Structure

pnpm monorepo:

```
apps/
  api/              - Fastify control plane API (port 5000, Postgres-backed, serves web UI)
  web/              - Next.js standalone UI (optional, not used in workflow)
  runner-gateway/   - Fastify + WebSocket for runner execution (K8s + Docker fallback)
packages/
  sdk/              - Shared TypeScript types, patch validation helpers
  agent-runtime/    - Deterministic verification-first task runner
  profiles/         - Runner profiles (node20, python311, go122, dotnet8, java21)
infra/
  k3d/              - k3d cluster create/destroy scripts
  k8s/base/         - Namespace, RBAC manifests
  k8s/              - App deployment manifests
  docker/           - Dockerfiles and docker-compose
```

## Running

The primary workflow runs `tsx apps/api/src/index.ts` on port 5000.
The API serves both the REST endpoints and the web UI at `/ui`.

### API Endpoints (apps/api)
- `GET /` - API info
- `GET /healthz` - Health check
- `GET /readyz` - Readiness probe
- `GET /v1/profiles` - List runner profiles
- `POST /v1/workspaces` - Create workspace `{ gitUrl, gitRef, profileId }`
- `GET /v1/workspaces` - List workspaces
- `GET /v1/workspaces/:id` - Get workspace + runner status
- `POST /v1/workspaces/:id/start` - Start runner (proxies to runner-gateway)
- `POST /v1/workspaces/:id/stop` - Stop runner
- `POST /v1/workspaces/:id/exec` - Exec command `{ cmd, timeoutSec? }`
- `POST /v1/workspaces/:id/apply-patch` - Apply unified diff `{ diff }`
- `POST /v1/workspaces/:id/git-status` - Git status porcelain
- `POST /v1/workspaces/:id/create-branch` - Create branch `{ name }`
- `POST /v1/workspaces/:id/commit` - Git commit `{ message }`
- `POST /v1/workspaces/:id/verify` - Run verification pipeline
- `POST /v1/tasks` - Create task `{ workspaceId, title }`
- `POST /v1/tasks/:taskId/run` - Run task (async)
- `GET /v1/tasks/:taskId` - Get task
- `GET /v1/tasks/:taskId/events` - Task event timeline
- `GET /v1/tasks/:taskId/traces` - Tool traces
- `GET /v1/tasks` - List all tasks

### Web UI Routes
- `/ui` - Workspace list + create form
- `/ui/workspace/:id` - Workspace detail (terminal, exec, patch, git, verify, tasks)
- `/ui/task/:taskId` - Task detail (results, timeline, traces)
- `/ui/tasks` - All tasks
- `/ui/profiles` - Profile browser

### Runner Gateway Endpoints (apps/runner-gateway)
- `POST /v1/runner/create` - Create runner (K8s pod or Docker container)
- `POST /v1/runner/stop` - Stop runner
- `GET /v1/runner/status/:workspaceId` - Get runner status
- `POST /v1/runner/exec` - Execute command with safety checks
- `WS /v1/runner/stream/:workspaceId` - Stream stdout/stderr/exit events

## Database

PostgreSQL via Drizzle ORM. Tables auto-created on startup:
- `workspaces` - id, git_url, git_ref, profile_id, status, timestamps
- `runners` - workspace_id (FK), mode, pod_name/container_id, status, timestamps
- `tasks` - id, workspace_id (FK), title, status, required_checks, check_results, timestamps
- `task_events` - id, task_id (FK), ts, type, payload
- `tool_traces` - id, task_id (FK), ts, tool_name, input, output, success, duration_ms
- `workspace_ports` - id, workspace_id (FK), port, protocol, is_primary, health_path

## Runner Modes

Set `RUNNER_MODE` env var:
- `docker` (default) - Docker containers via docker CLI
- `k8s` - Kubernetes pods/PVCs via kubectl

## Profiles

5 language profiles: node20 (Node.js 20), python311 (Python 3.11), go122 (Go 1.22), dotnet8 (.NET 8), java21 (Java 21). Each has lint/typecheck/test verify commands.

## Safety

- Command denylist: curl, wget, ssh, scp, sudo, docker, kubectl (override: ALLOW_UNSAFE_COMMANDS=true)
- Patch denylist: .env*, *.pem, *.key, node_modules/, dist/, build/, .git/
- Max patch size: 20KB, max timeout: 300s, max output: 1MB

## Dependencies

- fastify, @fastify/cors, @fastify/websocket - HTTP/WS framework
- drizzle-orm, pg - Database
- pino-pretty - Logging
- tsx - TypeScript execution
