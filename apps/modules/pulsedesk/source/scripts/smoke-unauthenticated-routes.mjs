import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesDir = path.join(root, "server", "routes");

const publicRoutePatterns = [
  /^GET \/api\/health$/,
  /^GET \/api\/public\/sso-config$/,
  /^GET \/api\/auth\/tenant\/:slug$/,
  /^POST \/api\/auth\/register$/,
  /^POST \/api\/auth\/login$/,
  /^GET \/api\/auth\/m365\/login$/,
  /^GET \/api\/auth\/m365\/callback$/,
  /^POST \/api\/auth\/logout$/,
  /^POST \/api\/email\/inbound\/:provider$/,
  /^GET \/api\/connectors\/oauth\/callback$/,
];

function isPublicRoute(method, routePath) {
  const key = `${method.toUpperCase()} ${routePath}`;
  return publicRoutePatterns.some((pattern) => pattern.test(key));
}

function routeLines(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => /router\.(get|post|patch|delete|put)\(["']\/api/.test(line));
}

const failures = [];
const rows = [];

for (const entry of fs.readdirSync(routesDir)) {
  if (!entry.endsWith(".ts")) continue;
  const absolutePath = path.join(routesDir, entry);
  for (const { line, lineNumber } of routeLines(absolutePath)) {
    const match = line.match(/router\.(get|post|patch|delete|put)\(["']([^"']+)/);
    if (!match) continue;
    const method = match[1].toUpperCase();
    const routePath = match[2];
    const routeKey = `${method} ${routePath}`;
    const protectedByAuth =
      line.includes("requireAuth")
      || line.includes("requireSuperAdmin")
      || line.includes("requireOperatorOsModuleAccess");
    const publicAllowed = isPublicRoute(method, routePath);
    const ok = protectedByAuth || publicAllowed;
    rows.push({ ok, file: entry, lineNumber, routeKey, publicAllowed });
    if (!ok) {
      failures.push(`${entry}:${lineNumber} ${routeKey}`);
    }
  }
}

for (const row of rows) {
  const scope = row.publicAllowed ? "public allowlist" : "protected";
  console.log(`${row.ok ? "PASS" : "FAIL"} ${row.routeKey} (${scope}) ${row.file}:${row.lineNumber}`);
}

if (failures.length > 0) {
  console.error("Unauthenticated route smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
