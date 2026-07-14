#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Run the scripted Stripe purchase E2E on every merge so regressions in the
# Stripe webhook / entitlement / stripe-replit-sync path are caught at merge
# time instead of at launch. POST_MERGE=1 makes the wrapper skip gracefully
# (exit 0) when the API Server workflow isn't running, so the test never
# blocks a merge — it only blocks if the api-server IS up and the test
# actually fails.
POST_MERGE=1 bash scripts/run-stripe-e2e.sh
