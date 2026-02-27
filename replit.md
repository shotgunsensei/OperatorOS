# VeridianCDE

AI-native Cloud Development Environment platform.

## Project Structure

pnpm monorepo with the following layout:

```
apps/
  api/           - Fastify control plane API (port 5000)
  web/           - Next.js IDE UI (minimal layout)
  runner-gateway/ - Fastify + WebSocket for runner execution
packages/
  sdk/           - Shared TypeScript types and tool schemas
  agent-runtime/ - Verification-first task loop skeleton
infra/
  k8s/           - Kubernetes manifests
  docker/        - Dockerfiles and docker-compose
```

## Key Files

- `pnpm-workspace.yaml` - Workspace configuration
- `tsconfig.base.json` - Shared TypeScript config
- `.eslintrc.json` - ESLint configuration
- `.prettierrc` - Prettier configuration
- `LICENSE` - Apache-2.0

## Running

The primary workflow runs `tsx apps/api/src/index.ts` which starts the Fastify API on port 5000.

### Endpoints
- `GET /` - API info and available endpoints
- `GET /healthz` - Health check
- `GET /readyz` - Readiness probe
- `GET /api/v1/workspaces` - List workspaces (stub)
- `GET /api/v1/sessions` - List sessions (stub)

## Dependencies

- **fastify** - HTTP framework for api and runner-gateway
- **@fastify/cors** - CORS support
- **@fastify/websocket** - WebSocket support for runner-gateway
- **pino-pretty** - Log formatting
- **tsx** - TypeScript execution
- **zod** - Schema validation

## Architecture Notes

- The SDK package exports shared types (HealthResponse, Workspace, User, ToolDefinition, AgentTask, etc.) and WebSocket event types
- The agent-runtime package implements a verification-first task loop (plan -> execute -> verify cycle with retry)
- Apps import from SDK via relative paths for dev; workspace protocol (`workspace:*`) for pnpm builds
- K8s manifests include liveness/readiness probes pointing to `/healthz` and `/readyz`
