#!/bin/bash
set -e

# OperatorOS post-merge setup.
# - This is a pnpm monorepo (apps/api, apps/web, apps/runner-gateway, packages/*).
# - Database schema is created/updated at server boot by
#   apps/api/src/lib/saas-db-init.ts (idempotent CREATE TABLE IF NOT EXISTS
#   + ALTER TABLE ... ADD COLUMN IF NOT EXISTS), so there is no separate
#   db:push step to run here.

pnpm install --frozen-lockfile=false
