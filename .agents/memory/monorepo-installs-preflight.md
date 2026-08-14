---
name: Installs & preflight conventions
description: Package-install and production-preflight rules for this monorepo
---

- **Install only via pinned pnpm**: `npm exec --yes --package=pnpm@<version-from-packageManager> -- pnpm install --frozen-lockfile`. Plain `npm install` resolves different dependency versions (once downgraded fastify and broke the API boot with a missing export). **Why:** the pnpm lockfile is authoritative; npm ignores it.
- Workspace shell does NOT carry production non-secret env values. Preflight runs (`node scripts/production-env-preflight.mjs --<profile>`) need the production values injected inline on the command line (module URLs, STRIPE_MODE, ports, TRUST_PROXY, TWILIO_PUBLIC_BASE_URL, …).
- Smoke-test pattern: write a `.mts` file to /tmp with absolute imports and run `npx tsx` from `apps/api` (top-level await fails in `.ts`/cjs mode).
