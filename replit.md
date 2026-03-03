# OperatorOS

AI-native Cloud Development Environment control plane. Powered by Shotgun Ninjas.

## Project Structure

pnpm monorepo:

```
apps/
  api/              - Fastify control plane API (port 5001, Postgres-backed, serves legacy web UI at /ui)
  web/              - Next.js GUI (port 5000, 4-panel layout: workspace, file explorer, editor, terminal/preview)
  runner-gateway/   - Runner execution providers (local, Docker, K8s) + safety module (port 5002)
packages/
  sdk/              - Shared TypeScript types, patch validation helpers
  agent-runtime/    - Deterministic verification-first task runner
  profiles/         - Runner profiles (node20, python311, go122, dotnet8, java21)
infra/
  k3d/              - k3d cluster create/destroy scripts
  k8s/base/         - Namespace, RBAC manifests
  k8s/              - App deployment manifests
  docker/           - Dockerfiles and docker-compose
scripts/
  dev.mjs           - Dev orchestrator: spawns all 3 services with correct ports
```

## Running

### Development (3 services)
The workflow starts all 3 services:
- **API** on port 5001: `PORT=5001 tsx apps/api/src/index.ts`
- **Runner Gateway** on port 5002: `PORT=5002 tsx apps/runner-gateway/src/index.ts`
- **Web (Next.js)** on port 5000: `NEXT_PUBLIC_API_URL=http://localhost:5001 npx next dev -p 5000` (webview)

Alternative: `node scripts/dev.mjs` (starts all 3 with correct PORT env vars and colored output)

The Next.js app proxies API calls via rewrites: `/api/*` -> `localhost:5001/v1/*`

### Production (deployment)
Only the API runs on port 5000 with its built-in UI at `/ui`. Browser visitors to `/` are redirected to `/ui`.

### Port Map
| Service | Dev Port | Notes |
|---------|----------|-------|
| Web (Next.js) | 5000 | Replit webview, proxies /api/* to API |
| API | 5001 | Fastify control plane |
| Runner Gateway | 5002 | Standalone runner service |

### API Endpoints (apps/api on port 5001)
- `GET /` - API info (redirects browsers to /ui)
- `GET /healthz` - Health check
- `GET /readyz` - Readiness probe
- `GET /v1/profiles` - List runner profiles
- `POST /v1/workspaces` - Create workspace `{ gitUrl, gitRef, profileId }`
- `GET /v1/workspaces` - List workspaces
- `GET /v1/workspaces/:id` - Get workspace + runner status
- `POST /v1/workspaces/:id/start` - Start runner
- `POST /v1/workspaces/:id/stop` - Stop runner
- `POST /v1/workspaces/:id/exec` - Exec command `{ cmd, timeoutSec? }`
- `GET /v1/workspaces/:id/tree` - File tree (query: path, depth; validated against traversal)
- `POST /v1/workspaces/:id/read-file` - Read file `{ path }` (validated against traversal)
- `POST /v1/workspaces/:id/apply-patch` - Apply unified diff `{ diff }`
- `POST /v1/workspaces/:id/git-status` - Git status porcelain
- `POST /v1/workspaces/:id/create-branch` - Create branch `{ name }`
- `POST /v1/workspaces/:id/commit` - Git commit `{ message }`
- `POST /v1/workspaces/:id/verify` - Run verification pipeline
- `POST /v1/verify/run` - Run verify pipeline `{ workspaceId, profileId? }` -> `{ ok, steps[] }`
- `POST /v1/tasks` - Create task `{ workspaceId, goal?, title?, profileId? }` -> `{ taskId }`
- `POST /v1/tasks/:taskId/run` - Run task (async; uses AI agent if goal is set)
- `GET /v1/tasks/:taskId` - Get task
- `GET /v1/tasks/:taskId/events` - Task event timeline (JSON)
- `GET /v1/tasks/:taskId/events/stream` - SSE stream of task events (real-time)
- `GET /v1/tasks/:taskId/traces` - Tool traces
- `GET /v1/tasks` - List all tasks

### Web GUI (apps/web on port 5000)
4-panel layout:
- Left sidebar: WorkspacePanel (list, create, start/stop)
- Top-left: FileExplorer (tree navigation)
- Top-right: Editor (file viewer + apply patch)
- Bottom (tabs): TerminalStream (exec commands) / PreviewPanel (iframe for dev server)

Components:
- `apps/web/src/app/page.tsx` - Main 4-panel layout
- `apps/web/src/lib/api.ts` - Typed API client with proxy support (includes agentApi)
- `apps/web/src/components/WorkspacePanel.tsx` - Workspace CRUD sidebar
- `apps/web/src/components/FileExplorer.tsx` - File tree browser
- `apps/web/src/components/Editor.tsx` - File viewer + patch application
- `apps/web/src/components/TerminalStream.tsx` - Command execution terminal
- `apps/web/src/components/PreviewPanel.tsx` - Dev server preview iframe
- `apps/web/src/components/AgentPanel.tsx` - AI Agent: goal input, run agent, event timeline, past runs

### Legacy Web UI Routes (served by API)
- `/ui` - Workspace list + create form
- `/ui/workspace/:id` - Workspace detail
- `/ui/task/:taskId` - Task detail
- `/ui/tasks` - All tasks
- `/ui/profiles` - Profile browser

### WebSocket
- `WS /v1/runner/stream/:workspaceId` - Stream stdout/stderr/exit events

## Database

PostgreSQL via raw SQL (auto-created on startup):
- `workspaces` - id, git_url, git_ref, profile_id, status, timestamps
- `runners` - workspace_id (FK), mode, pod_name/container_id, status, timestamps
- `tasks` - id, workspace_id (FK), title, status, required_checks, check_results, timestamps
- `task_events` - id, task_id (FK), ts, type, payload
- `tool_traces` - id, task_id (FK), ts, tool_name, input, output, success, duration_ms
- `workspace_ports` - id, workspace_id (FK), port, protocol, is_primary, health_path

## Runner Modes

Set `RUNNER_MODE` env var:
- `local` (default) - Direct filesystem execution, no container runtime needed. Clones repos to `/tmp/operatoros-workspaces/<id>`, runs commands via bash in workspace directory. `/workspace` references in commands are auto-rewritten to the actual workspace path.
- `docker` - Docker containers via docker CLI (requires docker)
- `k8s` - Kubernetes pods/PVCs via kubectl (requires kubectl/k3d)

## Architecture

The API (apps/api) directly imports provisioner and safety modules from apps/runner-gateway (no HTTP proxy between them). The runner-gateway also runs as a standalone Fastify service on port 5002 for potential distributed deployments. The provisioner dispatches to the appropriate provider (local, docker, or k8s) based on RUNNER_MODE. The Next.js GUI communicates with the API through Next.js rewrites proxy (/api/* -> localhost:5001/v1/*).

## Profiles

5 language profiles: node20 (Node.js 20), python311 (Python 3.11), go122 (Go 1.22), dotnet8 (.NET 8), java21 (Java 21). Each has lint/typecheck/test verify commands with fallback alternatives.

## Safety

- Command denylist: curl, wget, ssh, scp, sudo, docker, kubectl (override: ALLOW_UNSAFE_COMMANDS=true)
- Patch denylist: .env*, *.pem, *.key, node_modules/, dist/, build/, .git/
- Max patch size: 20KB, max timeout: 300s, max output: 1MB
- Tree/read-file endpoints validate paths against traversal (no .., no absolute paths)

## AI Agent

The agent system (`apps/api/src/agent.ts`) implements a "Junior Developer Agent" that can fix issues in a workspace:

- Uses OpenAI GPT-4o with function calling
- Tools: read_file, apply_patch (unified diff), run_verify (pipeline), exec (safe commands only)
- Budgets: maxIterations=12, maxPatchKB=20, maxTotalTokens=200,000
- Agent loop: verify -> read errors -> propose patch -> apply -> re-verify -> repeat until green or budget exhausted
- Events persisted to task_events table: LLM_THOUGHT_SUMMARY, TOOL_CALL, TOOL_RESULT, VERIFY_RESULT, PATCH_APPLIED, DONE, ERROR
- SSE streaming at `/v1/tasks/:taskId/events/stream` for real-time UI updates
- Security: paths validated (no .., no absolute, no .env/.pem/.key/.git), patches validated via validatePatchPaths, commands filtered via isCommandAllowed

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 5001 (api), 5002 (gateway) | Service port |
| RUNNER_MODE | local | Runner provider: local, docker, k8s |
| DATABASE_URL | (from Replit) | PostgreSQL connection string |
| NEXT_PUBLIC_API_URL | http://localhost:5001 | API URL for Next.js server-side + rewrites |
| ALLOW_UNSAFE_COMMANDS | false | Override command denylist |
| OPENAI_API_KEY | (secret) | OpenAI API key for AI Agent |

## Dependencies

- fastify, @fastify/cors, @fastify/websocket - HTTP/WS framework
- drizzle-orm, pg - Database
- pino-pretty - Logging
- tsx - TypeScript execution
- next, react, react-dom - Web GUI
- openai - OpenAI SDK for AI Agent
