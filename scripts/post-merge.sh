#!/bin/bash
set -euo pipefail

# OperatorOS post-merge setup.
# - This is a pnpm monorepo (apps/api, apps/web, apps/runner-gateway, packages/*).
# - Database schema is created/updated at server boot by
#   apps/api/src/lib/saas-db-init.ts (idempotent CREATE TABLE IF NOT EXISTS
#   + ALTER TABLE ... ADD COLUMN IF NOT EXISTS), so there is no separate
#   db:push step to run here.
#
# Determinism notes:
# - The environment's nix pnpm (10.26.x) does not match the repository's
#   pinned packageManager (pnpm@10.34.5). Invoking bare `pnpm` triggers
#   pnpm's self-install of the pinned version, which fails repeatedly in
#   this environment and hangs past the post-merge timeout. Always invoke
#   the pinned version through npm exec (cached after first run), matching
#   the deployment build in .replit.
# - Install is frozen: a merge must never rewrite pnpm-lock.yaml as a side
#   effect. If the lockfile is out of sync with a manifest, fail loudly so
#   the merge is repaired intentionally rather than drifting silently.

cd "$(dirname "$0")/.."

export CI=true

npm exec --yes --package=pnpm@10.34.5 -- pnpm install --frozen-lockfile --prefer-offline
