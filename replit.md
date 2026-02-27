# VeridianCDE

AI-native Cloud Development Environment platform.

## Project Structure

pnpm monorepo:

```
apps/
  api/              - Fastify control plane API (port 5000, Postgres-backed)
  web/              - Next.js IDE UI (minimal layout)
  runner-gateway/   - Fastify + WebSocket for runner execution
packages/
  sdk/              - Shared TypeScript types, tool schemas, WS events
  agent-runtime/    - Verification-first task loop skeleton
  profiles/         - Runner profiles (node20 etc.) with verify commands
infra/
  k3d/              - k3d cluster creation script
  k8s/base/         - Namespace, RBAC, storage, runner-template manifests
  k8s/              - App deployment manifests (api, runner-gateway, web)
  docker/           - Dockerfiles and docker-compose
```

## Running

The primary workflow runs `tsx apps/api/src/index.ts` on port 5000.

### API Endpoints (apps/api)
- `GET /` - API info
- `GET /healthz` - Health check
- `GET /readyz` - Readiness probe
- `POST /v1/workspaces` - Create workspace `{ gitUrl, gitRef, profileId }`
- `GET /v1/workspaces` - List workspaces
- `GET /v1/workspaces/:id` - Get workspace
- `POST /v1/workspaces/:id/start` - Start runner (proxies to runner-gateway)
- `POST /v1/workspaces/:id/exec` - Exec command (proxies to runner-gateway)

### Runner Gateway Endpoints (apps/runner-gateway)
- `GET /healthz`, `GET /readyz` - Health/readiness
- `POST /v1/runner/create` - Create K8s runner pod + PVC
- `POST /v1/runner/stop` - Stop runner pod
- `GET /v1/runner/status/:workspaceId` - Get runner status
- `POST /v1/runner/exec` - Execute command in runner
- `WS /v1/runner/stream/:workspaceId` - Stream stdout/stderr events

## Database

PostgreSQL via Drizzle ORM. Table: `workspaces` (id, git_url, git_ref, profile_id, status, created_at, updated_at).

## K8s / k3d

- `infra/k3d/create-cluster.sh` creates a k3d cluster with 1 server, 1 agent, local registry
- `infra/k8s/base/` has namespace (veridian-control, veridian-runners), RBAC, storage config, runner-template
- Runner pods are created dynamically by the provisioner module with PVC-per-workspace

## Profiles

- `packages/profiles` defines runner profiles with image + verify commands
- node20 profile: `node:20-bookworm` with lint/typecheck/test commands

## Safety

- Command denylist: curl, wget, ssh, scp, sudo, docker, kubectl (override with ALLOW_UNSAFE_COMMANDS=true)
- Max timeout: 300s
- Max output: 1MB (truncated with flag)

## Dependencies

- fastify, @fastify/cors, @fastify/websocket - HTTP/WS framework
- drizzle-orm, pg - Database
- pino-pretty - Logging
- tsx - TypeScript execution
