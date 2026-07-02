import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const sso = read("server/auth/operatoros-sso.ts");
const middleware = read("server/middleware.ts");
const health = read("server/routes/health.ts");
const masterAdmin = read("server/config/masterAdmin.ts");

const checks = [];
function check(name, condition) {
  checks.push({ name, condition: Boolean(condition) });
}

for (const envName of [
  "MODULE_SSO_SECRET",
  "OPERATOROS_BASE_URL",
  "OPERATOROS_SSO_AUDIENCE",
  "OPERATOROS_SSO_ENV",
  "OPERATOROS_SSO_CONSUME_URL",
  "OPERATOROS_API_URL",
]) {
  check(`SSO source references ${envName}`, sso.includes(envName) || health.includes(envName));
}

check("consume URL resolver is explicit", sso.includes("resolveConsumeUrl") && sso.includes("isConsumePath"));
check("HS256 is enforced", sso.includes('header.alg !== "HS256"') && sso.includes('algorithms: ["HS256"]'));
check("token max age is capped", sso.includes("MAX_TOKEN_AGE_S = 90"));
check("OperatorOS JWT is not persisted in session", !read("server/routes/sso.ts").includes("req.session.token"));
check("module access revoked code is stable", middleware.includes('"MODULE_ACCESS_REVOKED"'));
check("missing org code is stable", middleware.includes('"NO_ORG_SELECTED"'));
check("insufficient role code is stable", middleware.includes('"INSUFFICIENT_ROLE"'));
check("master admin defaults to John", masterAdmin.includes("john@shotgunninjas.com"));

const runtimeRequired = [
  "MODULE_SSO_SECRET",
  "OPERATOROS_BASE_URL",
  "OPERATOROS_SSO_AUDIENCE",
  "OPERATOROS_SSO_ENV",
];
const runtimeMissing = runtimeRequired.filter((name) => !process.env[name]?.trim());
console.log(`INFO runtime SSO env present: ${runtimeRequired.length - runtimeMissing.length}/${runtimeRequired.length}`);
if (runtimeMissing.length > 0) {
  console.log(`INFO runtime SSO env missing: ${runtimeMissing.join(", ")}`);
}

if (process.env.PULSEDESK_SMOKE_REQUIRE_ENV === "true" && runtimeMissing.length > 0) {
  check("runtime SSO env is complete", false);
}

const failed = checks.filter((item) => !item.condition);
for (const item of checks) {
  console.log(`${item.condition ? "PASS" : "FAIL"} ${item.name}`);
}

if (failed.length > 0) {
  console.error(`SSO config smoke failed: ${failed.length} check(s) failed.`);
  process.exit(1);
}
