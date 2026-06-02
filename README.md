# OperatorOS

AI-native Cloud Development Environment control plane. Powered by Shotgun Ninjas.

## Quick Start (Replit)

The API starts automatically on port 5000. Open the web preview to access the UI.

```bash
# API root
curl http://localhost:5000/

# Health check
curl http://localhost:5000/healthz

# Web UI
# Navigate to /ui in the web preview
```

## Quick Start (Local)

```bash
# Install dependencies
pnpm install

# Start Postgres (if not provided by platform)
docker compose -f infra/docker/docker-compose.yml up -d

# Optional: Create k3d cluster for K8s runner mode
./infra/k3d/create-cluster.sh
kubectl apply -f infra/k8s/base/namespace.yaml
kubectl apply -f infra/k8s/base/rbac.yaml

# Set environment
cp .env.example .env
# Edit .env with your DATABASE_URL, RUNNER_MODE, etc.

# Run database migrations (tables auto-created on startup)
# Start API
pnpm dev
```

## How to Test MVP

### 1. Create a workspace

```bash
curl -X POST http://localhost:5000/v1/workspaces \
  -H 'Content-Type: application/json' \
  -d '{"gitUrl":"https://github.com/expressjs/express","gitRef":"master","profileId":"node20"}'
```

### 2. Start the runner

```bash
# Replace <ID> with workspace id from step 1
curl -X POST http://localhost:5000/v1/workspaces/<ID>/start
```

### 3. Run a command

```bash
curl -X POST http://localhost:5000/v1/workspaces/<ID>/exec \
  -H 'Content-Type: application/json' \
  -d '{"cmd":"node -v"}'
```

### 4. Apply a patch

```bash
curl -X POST http://localhost:5000/v1/workspaces/<ID>/apply-patch \
  -H 'Content-Type: application/json' \
  -d '{"diff":"--- a/test.txt\n+++ b/test.txt\n@@ -0,0 +1 @@\n+hello world\n"}'
```

### 5. Git operations

```bash
# Check status
curl -X POST http://localhost:5000/v1/workspaces/<ID>/git-status

# Create branch
curl -X POST http://localhost:5000/v1/workspaces/<ID>/create-branch \
  -H 'Content-Type: application/json' \
  -d '{"name":"feature/test"}'

# Commit
curl -X POST http://localhost:5000/v1/workspaces/<ID>/commit \
  -H 'Content-Type: application/json' \
  -d '{"message":"test: add test file"}'
```

### 6. Run verification

```bash
curl -X POST http://localhost:5000/v1/workspaces/<ID>/verify
```

### 7. Create and run a task

```bash
# Create task
curl -X POST http://localhost:5000/v1/tasks \
  -H 'Content-Type: application/json' \
  -d '{"workspaceId":"<ID>","title":"Verify Express"}'

# Run task (returns immediately, runs async)
curl -X POST http://localhost:5000/v1/tasks/<TASK_ID>/run

# Check task status
curl http://localhost:5000/v1/tasks/<TASK_ID>

# View events
curl http://localhost:5000/v1/tasks/<TASK_ID>/events

# View tool traces
curl http://localhost:5000/v1/tasks/<TASK_ID>/traces
```

### 8. Web UI

- `/ui` — Workspace list + create form
- `/ui/workspace/<ID>` — Workspace detail (terminal, exec, patch, verify, tasks)
- `/ui/task/<TASK_ID>` — Task detail (results, event timeline, tool traces)
- `/ui/tasks` — All tasks
- `/ui/profiles` — Runner profile browser

### 9. WebSocket streaming

```bash
# Connect to terminal stream (use wscat or browser)
wscat -c ws://localhost:5000/v1/runner/stream/<WORKSPACE_ID>
```

## Runner Modes

Set `RUNNER_MODE` environment variable:

- **docker** (default): Uses Docker containers. Requires `docker` CLI. Best for local/Replit.
- **k8s**: Uses Kubernetes pods with PVCs. Requires `kubectl` + k3d cluster.

## Profiles

| ID | Name | Image | Description |
|----|------|-------|-------------|
| node20 | Node.js 20 | node:20-bookworm | JS/TS with npm/pnpm |
| python311 | Python 3.11 | python:3.11-bookworm | Python with pip |
| go122 | Go 1.22 | golang:1.22-bookworm | Go toolchain |
| dotnet8 | .NET 8 | mcr.microsoft.com/dotnet/sdk:8.0 | .NET SDK |
| java21 | Java 21 | eclipse-temurin:21-jdk | Java JDK |

## Project Structure

```
apps/
  api/              — Fastify control plane API (port 5000)
  runner-gateway/   — Fastify + WS; provisions pods/containers; exec + stream
  web/              — Next.js (standalone, optional)
packages/
  sdk/              — Shared TypeScript types, patch validation
  profiles/         — Runner profiles + verify commands (5 languages)
  agent-runtime/    — Deterministic verification-first task runner
infra/
  k3d/              — k3d cluster create/destroy scripts
  k8s/base/         — Namespace, RBAC manifests
  docker/           — Dockerfiles and docker-compose
```

## Safety

- **Command denylist**: curl, wget, ssh, scp, sudo, docker, kubectl (override: `ALLOW_UNSAFE_COMMANDS=true`)
- **Patch denylist**: .env*, *.pem, *.key, node_modules/, dist/, build/, .git/
- **Max patch size**: 20KB
- **Max timeout**: 300s
- **Max output**: 1MB (truncated with flag)

## OperatorOS Ecosystem Alignment

OperatorOS is the **central command layer** for the whole product ecosystem.
Every unlockable product is a **module** that launches from OperatorOS, while
the top-level system areas (app, api, admin, auth, docs, status) are
**platform components**. The public `/ecosystem` launcher page renders every
module from the shared registry — there is no separate module list to keep in
sync.

- **Hosting model:** Replit remains the current host for OperatorOS and its
  modules. Migrating a module to its ecosystem domain points a new subdomain at
  the existing Replit deployment; it does not move hosting.
- **Subdomain pattern:** modules live at `module.operatoros.net` (for example
  `techdeck.operatoros.net`, `tradeflowkit.operatoros.net`). The canonical URLs
  are declared in `ecosystem.registry.json`, derived from the module catalog.
- **First migration target:** Tech Deck moves from the legacy
  `techdeck.app` to `techdeck.operatoros.net`. The legacy domain is kept as a
  redirecting alias **only after** the new subdomain is verified and tested.
- **Manual DNS:** all DNS and domain-linking steps happen **outside the
  codebase** (Replit Publishing → Domains + the DNS provider for
  `operatoros.net`). This repo performs no DNS changes and forces no redirects.
- **Runbook:** see [`docs/DOMAIN-MIGRATION.md`](docs/DOMAIN-MIGRATION.md) for
  the full ordered migration flow, including the explicit
  do-not-redirect-early warning and rollback notes.

### Checking ecosystem domains

Two read-only scripts print a `Domain | DNS Status | Resolved Target |
HTTPS Status` table for every platform component and module domain (sourced
from `ecosystem.registry.json` where practical). They make no changes:

```bash
# macOS / Linux (uses dig/nslookup + curl)
bash scripts/check-ecosystem-domains.sh

# Windows / PowerShell (uses Resolve-DnsName + Invoke-WebRequest)
pwsh scripts/check-ecosystem-domains.ps1
```

## License

Apache-2.0
