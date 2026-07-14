# OperatorOS

OperatorOS is the central login, tenant, entitlement, billing, and module runtime for the Shotgun Ninjas software ecosystem. The public application and every registered module run from one OperatorOS deployment, with host-aware routing across the attached `operatoros.net` subdomains.

## Runtime topology

- `operatoros.net` and `app.operatoros.net` serve the primary OperatorOS experience.
- `auth.operatoros.net` serves authentication flows.
- `api.operatoros.net` is the canonical API hostname.
- The Next.js web runtime is public on port `5000` in Replit.
- The Fastify API is private on port `5001`; browsers use same-origin `/api/*` routes and the server-only `INTERNAL_API_URL` proxy.
- The API owns authenticated runner routes in production. The standalone runner gateway on port `5002` is a local-development and legacy service, not a public Replit deployment surface.
- Only exact registered hosts are trusted. OperatorOS does not trust arbitrary `*.operatoros.net` or Replit preview hosts.

## Canonical modules

| Class | Module | Canonical host | Runtime state |
| --- | --- | --- | --- |
| Core | TradeFlowKit | `tradeflowkit.operatoros.net` | Enabled |
| Core | TechDeck | `techdeck.operatoros.net` | Enabled |
| Core | PulseDesk | `pulsedesk.operatoros.net` | Enabled |
| Free | TorqueShed | `torqueshed.operatoros.net` | Enabled |
| Free | FaultlineLab | `faultlinelab.operatoros.net` | Enabled |
| Free | Ninja Pool Hall | `ninja-pool-hall.operatoros.net` | Enabled |
| Add-on | BrandForgeOS | `brandforgeos.operatoros.net` | Enabled |
| Add-on | SnapProofOS | `snapproofos.operatoros.net` | Enabled |
| Add-on | StudyForge AI | `studyforge-ai.operatoros.net` | Enabled |
| Add-on | Ninja Launch Kit | `ninjalaunchkit.operatoros.net` | Enabled |
| Add-on | CallCommand AI | `callcommand-ai.operatoros.net` | Enabled |
| Add-on | Ninjamation | `ninjamation.operatoros.net` | Enabled |
| Add-on | OutCall | `outcall.operatoros.net` | Planned and disabled |

The attached Replit domains are the canonical application paths. Historical standalone product domains are not active launch, SSO callback, logout, CORS, or return-to destinations.

## Quick start: Replit

The Replit **Run** workflow starts the private API and optional development runner, then exposes the Next.js application on port `5000`. Autoscale deployment starts the private API on `5001` and the public web runtime on `5000`.

Configure the required secrets before starting:

- `DATABASE_URL`
- `SESSION_SECRET`
- `SSO_CODE_ENCRYPTION_SECRET`
- `APP_ENV=production`
- `NODE_ENV=production`
- `OPERATOROS_BASE_URL=https://operatoros.net`
- `INTERNAL_API_URL=http://localhost:5001`
- `TRUST_PROXY=true`

Keep `ALLOW_LEGACY_SSO_ROLLBACK` absent or false. Do not distribute the shared SSO encryption key, copy child authentication databases, or copy child billing credentials into modules. See [`docs/auth/ENVIRONMENT_VARIABLES.md`](docs/auth/ENVIRONMENT_VARIABLES.md) and [`docs/MODULE_ENV_MIGRATION.md`](docs/MODULE_ENV_MIGRATION.md) for the complete boundary.

## Quick start: local

```bash
corepack pnpm install
cp .env.example .env
# Configure DATABASE_URL, SESSION_SECRET, SSO_CODE_ENCRYPTION_SECRET,
# INTERNAL_API_URL=http://localhost:5001, and the remaining required values.

# Optional local PostgreSQL when the platform does not provide one.
docker compose -f infra/docker/docker-compose.yml up -d

corepack pnpm dev
```

Local defaults:

- Web: `http://localhost:3001`
- API and health: `http://localhost:5001` and `http://localhost:5001/healthz`
- Standalone development runner gateway: `http://localhost:5002`

Database tables and idempotent seed/backfill operations run during API startup.

## Verification

```bash
corepack pnpm typecheck
INTERNAL_API_URL=http://localhost:5001 corepack pnpm build
corepack pnpm --dir apps/api test
```

The API test command requires an isolated PostgreSQL test database for the DB-backed suites. Do not point tests at production. Authenticated workspace and runner operations should be exercised through the OperatorOS application; their API routes are not anonymous curl endpoints.

See the current [`validation matrix`](docs/auth/VALIDATION_MATRIX.md), [`module consolidation status`](docs/MODULE_CONSOLIDATION_STATUS.md), and [`Replit subdomain checklist`](docs/replit-subdomain-checklist.md) before deployment.

## SSO and authorization boundary

OperatorOS is the only identity, subscription, and entitlement authority. Module entry uses a one-time opaque authorization code with exact-host validation, state, nonce, PKCE, a short expiration, and host-only cookies. JWTs are never placed in URLs. Platform sessions are distinct from tenant- and module-scoped child sessions, and a disabled module remains unavailable even to a super-admin.

The contract and rollout controls are documented in [`docs/auth/OPERATOROS_SSO_CONTRACT_V1.md`](docs/auth/OPERATOROS_SSO_CONTRACT_V1.md).

## Runner modes

Set `RUNNER_MODE`:

- **docker** (default): uses Docker containers and requires the `docker` CLI.
- **k8s**: uses Kubernetes pods with persistent volumes and requires `kubectl` plus a configured cluster.

## Profiles

| ID | Name | Image | Description |
| --- | --- | --- | --- |
| node20 | Node.js 20 | `node:20-bookworm` | JavaScript/TypeScript with npm and pnpm |
| python311 | Python 3.11 | `python:3.11-bookworm` | Python with pip |
| go122 | Go 1.22 | `golang:1.22-bookworm` | Go toolchain |
| dotnet8 | .NET 8 | `mcr.microsoft.com/dotnet/sdk:8.0` | .NET SDK |
| java21 | Java 21 | `eclipse-temurin:21-jdk` | Java JDK |

## Project structure

```text
apps/
  api/              - Fastify API, auth authority, module APIs, and production runner routes (port 5001)
  modules/          - Consolidated module adapters, native slices, and quarantined source snapshots
  runner-gateway/   - Development/legacy runner service (port 5002)
  web/              - Primary public Next.js runtime (port 3001 local, 5000 Replit)
packages/
  modules/          - Canonical module registry and runtime policy
  sdk/              - Shared TypeScript types and patch validation
  profiles/         - Runner profiles and verification commands
  sso/              - Shared SSO v1 primitives
  agent-runtime/    - Deterministic verification-first task runner
infra/
  k3d/              - Local k3d cluster scripts
  k8s/base/         - Kubernetes namespace and RBAC manifests
  docker/           - Local Docker support
```

Imported source snapshots remain outside the executable workspace until their workflows are deliberately ported. This prevents child auth, billing, schema, and dependency systems from becoming a second runtime authority.

## Safety

- Command denylist: curl, wget, ssh, scp, sudo, docker, and kubectl unless `ALLOW_UNSAFE_COMMANDS=true` is explicitly set.
- Patch denylist: `.env*`, `*.pem`, `*.key`, `node_modules/`, `dist/`, `build/`, and `.git/`.
- Maximum patch size: 20 KB.
- Maximum command timeout: 300 seconds.
- Maximum captured output: 1 MB, with truncation reported.

## Domain checks

The following scripts perform read-only DNS and HTTPS checks from the canonical registry:

```bash
# macOS/Linux
bash scripts/check-ecosystem-domains.sh

# Windows/PowerShell
pwsh scripts/check-ecosystem-domains.ps1
```

No DNS changes are required for the currently attached Replit subdomains. Deployment is an application release and environment-configuration operation.

## License

Apache-2.0
