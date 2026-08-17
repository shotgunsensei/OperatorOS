---
name: Installs & preflight conventions
description: Package-install and production-preflight rules for this pnpm monorepo
---

# Installs
- Install ONLY via the pinned pnpm through npm exec with `--frozen-lockfile`. **Why:** the nix-provided pnpm is older than the `packageManager` pin, so bare `pnpm` self-installs the pinned version and hangs in a SIGABRT loop; plain `npm install` ignores the lockfile and once broke the API boot via dependency drift.
- **How to apply:** never run bare `pnpm` in this workspace; keep post-merge setup and the deployment build using the same pinned invocation.
- Web production builds require an API URL env value injected inline (dev workflow has it; a bare shell does not).

# Preflight
- Workspace shell does NOT carry production non-secret env values. Preflight runs (`node scripts/production-env-preflight.mjs --<profile>`) need the production values injected inline on the command line (module URLs, STRIPE_MODE, ports, TRUST_PROXY, TWILIO_PUBLIC_BASE_URL, …).
- Smoke-test pattern: write a `.mts` file to /tmp with absolute imports and run `npx tsx` from `apps/api` (top-level await fails in `.ts`/cjs mode).
