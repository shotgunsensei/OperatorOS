---
name: Monorepo installs & preflight
description: How to run installs safely in this pnpm monorepo and inject production values for preflight.
---
# Installs
- Install ONLY via the pinned package manager through npm exec: `CI=true npm exec --yes --package=pnpm@10.34.5 -- pnpm install --frozen-lockfile`. (npm install once caused dependency drift that broke fastify boot.)
- **Why:** the nix-provided pnpm (10.26.x) does not match `packageManager: pnpm@10.34.5`; invoking bare `pnpm` triggers pnpm's self-install of the pinned version, which fails in a tight SIGABRT loop and hangs indefinitely. npm exec bypasses that and is cached after the first run (~20s cold, ~3s warm).
- **How to apply:** post-merge setup (`scripts/post-merge.sh`) and the deployment build both use this exact invocation; keep them in lockstep. Never run bare `pnpm` commands in this workspace unless the version mismatch is fixed.
# Preflight
- Production env preflight needs production values injected inline (dev env lacks them).
