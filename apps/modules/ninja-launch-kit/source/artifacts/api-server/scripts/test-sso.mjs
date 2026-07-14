#!/usr/bin/env node
// Standalone test for the OperatorOS SSO verifier. Bundles src/lib/sso.ts
// on the fly via esbuild, sets env vars, then exercises every documented
// reject path plus the happy path. No HTTP, no DB.

process.env.NODE_ENV = "development";
process.env.PORT = process.env.PORT || "8080";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://x:x@localhost/x";
process.env.SESSION_SECRET = "ninjalaunchkit-test-secret-32chars-min";
process.env.MODULE_SSO_SECRET = "operator-os-shared-secret-32chars-min";
process.env.OPERATOROS_BASE_URL = "https://app.operatoros.com";
process.env.OPERATOROS_SSO_AUDIENCE = "ninjalaunchkit";
process.env.OPERATOROS_SSO_ENV = "dev";
process.env.OPERATOROS_API_URL = "https://app.operatoros.com";

import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcEntry = path.resolve(__dirname, "../src/lib/sso.ts");

const tmp = await mkdtemp(path.join(os.tmpdir(), "sso-test-"));
const out = path.join(tmp, "sso.cjs");
// Stub the env+logger imports so we don't pull in pino/zod transitively.
const stubLoggerPath = path.join(tmp, "logger-stub.js");
const stubEnvPath = path.join(tmp, "env-stub.js");
await writeFile(
  stubLoggerPath,
  "module.exports = { logger: { info(){}, warn(){}, error(){}, fatal(){} } };",
);
await writeFile(
  stubEnvPath,
  `module.exports = { env: {
    MODULE_SSO_SECRET: process.env.MODULE_SSO_SECRET,
    OPERATOROS_BASE_URL: process.env.OPERATOROS_BASE_URL,
    OPERATOROS_SSO_AUDIENCE: process.env.OPERATOROS_SSO_AUDIENCE,
    OPERATOROS_SSO_ENV: process.env.OPERATOROS_SSO_ENV,
    OPERATOROS_API_URL: process.env.OPERATOROS_API_URL,
  } };`,
);
const stubPlugin = {
  name: "stub-env-logger",
  setup(build) {
    build.onResolve({ filter: /^\.\/env$/ }, () => ({ path: stubEnvPath }));
    build.onResolve({ filter: /^\.\/logger$/ }, () => ({ path: stubLoggerPath }));
  },
};
await esbuild.build({
  entryPoints: [srcEntry],
  bundle: true,
  format: "cjs",
  platform: "node",
  outfile: out,
  logLevel: "silent",
  plugins: [stubPlugin],
});

const mod = await import(pathToFileURL(out).href);
const { verifyOperatorOsToken, mapOperatorOsPlan } = mod.default ?? mod;

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function mintToken(claims, opts = {}) {
  const header = { alg: opts.alg ?? "HS256", typ: "JWT" };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(claims));
  const secret = opts.secret ?? process.env.MODULE_SSO_SECRET;
  const sig = b64url(crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

function baseClaims(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "https://app.operatoros.com",
    aud: "ninjalaunchkit",
    env: "dev",
    sub: "user-uuid-123",
    user_id: "user-uuid-123",
    email: "alice@example.com",
    role: "user",
    module_slug: "ninjalaunchkit",
    plan_slug: "pro",
    organization_id: "org-456",
    jti: crypto.randomBytes(16).toString("hex"),
    iat: now,
    exp: now + 90,
    ...overrides,
  };
}

let pass = 0;
let fail = 0;
function check(name, expectCode, result) {
  const got = "code" in result ? result.code : "OK";
  const ok = got === expectCode;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(28)} expected=${expectCode} got=${got}`);
  if (ok) pass++; else fail++;
}

// 1. Happy path
check("valid token", "OK", verifyOperatorOsToken(mintToken(baseClaims())));

// 2. Plan slug mapping sanity
for (const [in_, out] of [["starter","free"],["pro","pro"],["elite","agency"],[null,null]]) {
  const got = mapOperatorOsPlan(in_);
  const ok = got === out;
  console.log(`${ok ? "PASS" : "FAIL"}  plan map ${String(in_).padEnd(21)} expected=${out} got=${got}`);
  if (ok) pass++; else fail++;
}

// 3-13. Reject paths
const t = mintToken(baseClaims());
check("tampered signature", "signature_invalid", verifyOperatorOsToken(t.slice(0, -4) + "AAAA"));
check("alg=none rejected", "signature_invalid", verifyOperatorOsToken(mintToken(baseClaims(), { alg: "none" })));
check("wrong iss", "issuer_mismatch", verifyOperatorOsToken(mintToken(baseClaims({ iss: "https://evil.example" }))));
check("wrong aud", "audience_mismatch", verifyOperatorOsToken(mintToken(baseClaims({ aud: "other-app", module_slug: "other-app" }))));
check("module_slug != aud", "audience_mismatch", verifyOperatorOsToken(mintToken(baseClaims({ module_slug: "other-app" }))));
check("wrong env", "env_mismatch", verifyOperatorOsToken(mintToken(baseClaims({ env: "prod" }))));

const past = Math.floor(Date.now() / 1000) - 200;
check("expired exp", "expired", verifyOperatorOsToken(mintToken(baseClaims({ iat: past, exp: past + 90 }))));
const old = Math.floor(Date.now() / 1000) - 100;
check("iat too old (>90s)", "expired", verifyOperatorOsToken(mintToken(baseClaims({ iat: old, exp: old + 200 }))));
const future = Math.floor(Date.now() / 1000) + 30;
check("clock skew (iat future)", "clock_skew", verifyOperatorOsToken(mintToken(baseClaims({ iat: future, exp: future + 90 }))));
check("malformed token", "bad_request", verifyOperatorOsToken("not.a.jwt"));
check("not a token at all", "bad_request", verifyOperatorOsToken("garbage"));
check("wrong secret", "signature_invalid", verifyOperatorOsToken(mintToken(baseClaims(), { secret: "different-secret-32-characters-x" })));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
