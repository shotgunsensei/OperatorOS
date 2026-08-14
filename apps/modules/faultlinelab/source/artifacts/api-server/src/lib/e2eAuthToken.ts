import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { logger } from "./logger";

// Walk up from the current cwd looking for the pnpm workspace root marker
// so we always land on the same `.local/` directory regardless of which
// artifact subdir the api-server happens to be launched from.
function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

// Shared on-disk location for the dev-only E2E auth bypass token. Both the
// api-server (this file, called from src/index.ts at startup) and the
// scripted Stripe E2E test (`scripts/src/test-stripe-flow.ts`) read from
// here. .local/ is gitignored.
export const E2E_TOKEN_PATH = resolve(
  findWorkspaceRoot(),
  ".local/.e2e-auth-token",
);

/**
 * In dev workspaces (REPLIT_DEPLOYMENT !== "1") with
 * ENABLE_E2E_AUTH_BYPASS === "1", make sure E2E_AUTH_TOKEN is set in
 * process.env. If it isn't, generate a fresh 32-byte hex token, persist it
 * to E2E_TOKEN_PATH, and put it on process.env so requireAuth picks it up.
 *
 * Hard no-op in production deployments and when the bypass isn't enabled.
 */
export function ensureE2EAuthTokenInDev(): void {
  if (process.env.REPLIT_DEPLOYMENT === "1") return;
  if (process.env.ENABLE_E2E_AUTH_BYPASS !== "1") return;

  if (process.env.E2E_AUTH_TOKEN) {
    return;
  }

  let token: string | null = null;
  if (existsSync(E2E_TOKEN_PATH)) {
    const onDisk = readFileSync(E2E_TOKEN_PATH, "utf8").trim();
    if (onDisk) token = onDisk;
  }
  if (!token) {
    token = randomBytes(32).toString("hex");
    mkdirSync(dirname(E2E_TOKEN_PATH), { recursive: true });
    writeFileSync(E2E_TOKEN_PATH, token + "\n", { mode: 0o600 });
  }
  process.env.E2E_AUTH_TOKEN = token;
  logger.warn(
    { tokenPath: E2E_TOKEN_PATH },
    "E2E auth bypass enabled (dev only) — token loaded",
  );
}
