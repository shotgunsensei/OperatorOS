import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const service = read("server/services/operatorosEntitlements.ts");
const serverIndex = read("server/index.ts");

const checks = [];
function check(name, condition) {
  checks.push({ name, condition: Boolean(condition) });
}

check("webhook route is registered", serverIndex.includes("/webhooks/operatoros/entitlements"));
check("webhook uses raw body parser", serverIndex.includes("express.raw"));
check("signature header is OperatorOS header", service.includes("x-operatoros-signature"));
check("HMAC uses MODULE_SSO_SECRET", service.includes("MODULE_SSO_SECRET") && service.includes("createHmac"));
check("signature prefix is sha256", service.includes("sha256="));
check("signature compare is constant-time", service.includes("timingSafeEqual"));
check("bad signature returns 401", service.includes("invalid_signature") && service.includes("res.status(401)"));
check("preferred introspection env alias is supported", service.includes("OPERATOROS_ENTITLEMENTS_INTROSPECT_URL"));

const baseUrl = process.env.PULSEDESK_SMOKE_BASE_URL?.replace(/\/+$/, "");
if (baseUrl) {
  const response = await fetch(`${baseUrl}/webhooks/operatoros/entitlements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Operatoros-Signature": "sha256=bad",
    },
    body: JSON.stringify({ smoke: true }),
  });
  check("live bad-signature webhook returns 401", response.status === 401);
  console.log(`INFO live webhook bad-signature status: ${response.status}`);
} else {
  console.log("INFO live bad-signature webhook check skipped: set PULSEDESK_SMOKE_BASE_URL to enable.");
}

const failed = checks.filter((item) => !item.condition);
for (const item of checks) {
  console.log(`${item.condition ? "PASS" : "FAIL"} ${item.name}`);
}

if (failed.length > 0) {
  console.error(`Entitlement webhook smoke failed: ${failed.length} check(s) failed.`);
  process.exit(1);
}
