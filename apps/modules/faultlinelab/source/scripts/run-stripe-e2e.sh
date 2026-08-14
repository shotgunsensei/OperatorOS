#!/usr/bin/env bash
# Runs the scripted Stripe purchase test (`scripts/src/test-stripe-flow.ts`)
# end-to-end. Invoked automatically from `scripts/post-merge.sh` after every
# task merge, and also runnable on demand from the workspace shell.
#
# Modes:
#   default       — fail loudly if anything is wrong (use locally / in CI).
#   POST_MERGE=1  — exit 0 with a warning when the api-server is down or the
#                   bypass token isn't on disk. This keeps merges from being
#                   blocked when the dev workspace is paused and the user
#                   hasn't started the API Server workflow yet, while still
#                   running the full test whenever the workflow IS up.
#
# Behaviour in either mode:
#   1. Refuses to run inside a production deployment.
#   2. Confirms the api-server is reachable on the shared proxy.
#   3. Confirms the test-only auth bypass token has been written by the
#      api-server bootstrap (proves ENABLE_E2E_AUTH_BYPASS=1 is in effect).
#   4. Re-runs the Stripe product seed (idempotent — existing products are
#      skipped) so a missing catalog row never silently fails the test.
#   5. Runs the actual E2E test. Failures surface as a non-zero exit.

set -euo pipefail

if [[ "${REPLIT_DEPLOYMENT:-}" == "1" && "${ALLOW_PROD_E2E:-}" != "1" ]]; then
  echo "[stripe-e2e] Refusing to run inside a production deployment." >&2
  echo "[stripe-e2e] This script is for the dev workspace + test-mode Stripe Connector only." >&2
  exit 1
fi

POST_MERGE_MODE="${POST_MERGE:-0}"

skip_or_fail() {
  local reason="$1"
  if [[ "$POST_MERGE_MODE" == "1" ]]; then
    echo "[stripe-e2e] SKIP (post-merge): $reason" >&2
    echo "[stripe-e2e] Re-run with \`bash scripts/run-stripe-e2e.sh\` once the API Server workflow is up." >&2
    exit 0
  fi
  echo "[stripe-e2e] $reason" >&2
  exit 1
}

API_BASE="${TEST_API_BASE:-}"
if [[ -z "$API_BASE" ]]; then
  if [[ -n "${REPLIT_DEV_DOMAIN:-}" ]]; then
    API_BASE="https://${REPLIT_DEV_DOMAIN}"
  else
    API_BASE="http://localhost:80"
  fi
fi

echo "[stripe-e2e] api base: $API_BASE (post-merge mode: $POST_MERGE_MODE)"

# 1. Probe the api-server. We can't restart workflows from a shell script,
#    so the API Server workflow is expected to already be running.
if ! curl -fsS --max-time 10 "$API_BASE/api/healthz" >/dev/null; then
  skip_or_fail "api-server not reachable at $API_BASE/api/healthz; start the 'API Server' workflow."
fi

# 2. Confirm the auth-bypass token file exists. The api-server only writes it
#    when ENABLE_E2E_AUTH_BYPASS=1 is set (now wired into the api-server
#    artifact's development env). Without this token the test would fail with
#    a confusing 401.
TOKEN_PATH=".local/.e2e-auth-token"
if [[ ! -s "$TOKEN_PATH" && -z "${E2E_AUTH_TOKEN:-}" ]]; then
  skip_or_fail "no $TOKEN_PATH and no E2E_AUTH_TOKEN env; restart the API Server workflow so it can write a token."
fi

# 3. Seed Stripe products. The seed script is idempotent — it skips any
#    product/price that already exists, so this is safe to run on every
#    invocation and guarantees the test never fails on a missing catalog row.
echo "[stripe-e2e] ensuring Stripe catalog is seeded ..."
pnpm --filter @workspace/scripts run --silent seed-products

# 4. Run the actual test.
echo "[stripe-e2e] running test-stripe-flow ..."
pnpm --filter @workspace/scripts run --silent test-stripe-flow
