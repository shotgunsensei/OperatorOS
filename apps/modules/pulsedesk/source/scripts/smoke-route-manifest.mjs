import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const checks = [];
function check(name, condition) {
  checks.push({ name, condition: Boolean(condition) });
}

const routesIndex = read("server/routes/index.ts");
const serverIndex = read("server/index.ts");
const appTsx = read("client/src/App.tsx");
const sidebar = read("client/src/components/app-sidebar.tsx");
const health = read("server/routes/health.ts");
const seed = read("server/seed.ts");
const roles = read("shared/roles.ts");

check("health endpoint exists", health.includes('"/api/health"'));
check("health router is registered", routesIndex.includes("healthRouter") && routesIndex.includes("app.use(healthRouter)"));
check("SSO receiver route exists", read("server/routes/sso.ts").includes('"/sso"'));
check("public SSO config route exists", read("server/routes/sso.ts").includes('"/api/public/sso-config"'));

for (const [label, file, route] of [
  ["dashboard", "server/routes/tickets.ts", '"/api/dashboard"'],
  ["tickets", "server/routes/tickets.ts", '"/api/tickets"'],
  ["departments", "server/routes/departments.ts", '"/api/departments"'],
  ["assets", "server/routes/assets.ts", '"/api/assets"'],
  ["supply requests", "server/routes/supplyRequests.ts", '"/api/supply-requests"'],
  ["facility requests", "server/routes/facilityRequests.ts", '"/api/facility-requests"'],
  ["vendors", "server/routes/vendors.ts", '"/api/vendors"'],
  ["notifications", "server/routes/notifications.ts", '"/api/notifications"'],
  ["email settings", "server/routes/email.ts", '"/api/email/settings"'],
  ["connectors", "server/routes/connectors.ts", '"/api/connectors"'],
  ["admin orgs", "server/routes/admin.ts", '"/api/admin/orgs"'],
]) {
  check(`${label} route manifest`, read(file).includes(route));
}

const webhookPathIndex = serverIndex.indexOf("/webhooks/operatoros/entitlements");
const rawParserIndex = serverIndex.indexOf("express.raw");
const jsonParserIndex = serverIndex.indexOf("express.json");
check("OperatorOS webhook route exists", webhookPathIndex >= 0);
check("OperatorOS webhook uses raw body before JSON parser", rawParserIndex >= 0 && webhookPathIndex < jsonParserIndex);

check("billing router is not mounted", !routesIndex.includes("billingRouter"));
check("client billing route removed", !appTsx.includes('path="/billing"') && !appTsx.includes('href="/billing"'));
check("sidebar billing nav removed", !sidebar.includes('href="/billing"') && !sidebar.includes("Billing"));

check("shared canonical roles exist", roles.includes("CANONICAL_ROLES") && roles.includes("tech") && roles.includes("viewer"));
check("demo seeds are env-gated", seed.includes("isDemoSeedsEnabled()") && seed.includes("PULSEDESK_DEMO_PASSWORD"));
check("reviewer seeds are env-gated", seed.includes("isLocalReviewerEnabled()") && seed.includes("PULSEDESK_REVIEWER_PASSWORD"));

const failed = checks.filter((item) => !item.condition);
for (const item of checks) {
  console.log(`${item.condition ? "PASS" : "FAIL"} ${item.name}`);
}

if (failed.length > 0) {
  console.error(`Route manifest smoke failed: ${failed.length} check(s) failed.`);
  process.exit(1);
}
