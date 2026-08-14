#!/usr/bin/env node
// E2E test for the OperatorOS SSO route.
// - Starts a mock OperatorOS consume server on a random port
// - Spawns the built api-server child process on a random port with full SSO env
// - Mints a real HS256 token, hits GET /api/sso?token=..., asserts 302 + Set-Cookie
// - Replays the same token, mock returns 409 TOKEN_REPLAYED, asserts 401 consume_failed and NO Set-Cookie
// - Mints an expired token, asserts 401 expired and NO Set-Cookie

import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const distEntry = path.resolve(__dirname, "../dist/index.mjs");

const SECRET = "operator-os-shared-secret-32chars-min";
const AUDIENCE = "ninjalaunchkit";
const ENV_NAME = "dev";
const ISSUER = "https://app.operatoros.com";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function mintToken(claims, opts = {}) {
  const header = { alg: opts.alg ?? "HS256", typ: "JWT" };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(claims));
  const sig = b64url(crypto.createHmac("sha256", opts.secret ?? SECRET).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

function baseClaims(jti, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    env: ENV_NAME,
    sub: `e2e-user-${jti}`,
    user_id: `e2e-user-${jti}`,
    email: `e2e-${jti}@example.com`,
    role: "user",
    module_slug: AUDIENCE,
    plan_slug: "pro",
    organization_id: "org-e2e",
    jti,
    iat: now,
    exp: now + 90,
    ...overrides,
  };
}

async function pickPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
    srv.on("error", reject);
  });
}

// ---------- mock OperatorOS consume server ----------
const seenJtis = new Map(); // jti -> count
let consumePort;
const mockServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/v1/modules/sso/consume") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const { jti, aud, env } = payload;
        if (!jti || !aud || !env) {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: "Missing fields", code: "TOKEN_INVALID" }));
        }
        if (aud === "wrong-aud") {
          res.writeHead(409, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: "Audience mismatch", code: "AUDIENCE_MISMATCH" }));
        }
        const prior = seenJtis.get(jti) || 0;
        seenJtis.set(jti, prior + 1);
        if (prior > 0) {
          res.writeHead(409, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: "Token already used", code: "TOKEN_REPLAYED" }));
        }
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "Bad JSON", code: "TOKEN_INVALID" }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

// ---------- main ----------
let child;
let pass = 0;
let fail = 0;
function assert(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (cond) pass++; else fail++;
}

async function waitForReady(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/healthz`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function get(url) {
  const r = await fetch(url, { redirect: "manual" });
  const setCookie = r.headers.get("set-cookie") || "";
  let bodyJson = null;
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { bodyJson = await r.json(); } catch {}
  } else {
    await r.text();
  }
  return { status: r.status, location: r.headers.get("location"), setCookie, body: bodyJson };
}

try {
  await new Promise((resolve) => mockServer.listen(0, () => resolve()));
  consumePort = mockServer.address().port;
  const apiPort = await pickPort();

  child = spawn(process.execPath, ["--enable-source-maps", distEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(apiPort),
      SESSION_SECRET: "ninjalaunchkit-test-secret-32chars-min",
      MODULE_SSO_SECRET: SECRET,
      OPERATOROS_BASE_URL: ISSUER,
      OPERATOROS_SSO_AUDIENCE: AUDIENCE,
      OPERATOROS_SSO_ENV: ENV_NAME,
      OPERATOROS_API_URL: `http://127.0.0.1:${consumePort}`,
      RUN_SEED: "0",
      LOG_LEVEL: "warn",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let childErrLog = "";
  child.stderr.on("data", (c) => (childErrLog += c.toString()));
  child.stdout.on("data", () => {}); // drain

  const ready = await waitForReady(apiPort);
  if (!ready) {
    console.error("api-server child never became ready. Stderr tail:\n" + childErrLog.slice(-2000));
    process.exit(1);
  }

  const base = `http://127.0.0.1:${apiPort}`;

  // ---- Test 1: happy path ----
  const jti1 = crypto.randomBytes(12).toString("hex");
  const t1 = mintToken(baseClaims(jti1));
  const r1 = await get(`${base}/api/sso?token=${encodeURIComponent(t1)}`);
  assert("happy path -> 302", r1.status === 302, `status=${r1.status}`);
  assert("happy path -> Location /dashboard", r1.location === "/dashboard", `loc=${r1.location}`);
  assert("happy path -> Set-Cookie present", /session=/.test(r1.setCookie), `cookie=${r1.setCookie.slice(0, 60)}`);

  // ---- Test 2: replay same jti -> consume_failed, no cookie ----
  const r2 = await get(`${base}/api/sso?token=${encodeURIComponent(t1)}`);
  assert("replay -> 401", r2.status === 401, `status=${r2.status}`);
  assert("replay -> code=consume_failed", r2.body?.code === "consume_failed", `body=${JSON.stringify(r2.body)}`);
  assert("replay -> NO Set-Cookie", !/session=/.test(r2.setCookie || ""));

  // ---- Test 3: expired token -> 401 expired, no cookie ----
  const past = Math.floor(Date.now() / 1000) - 200;
  const tExp = mintToken(baseClaims("expired-jti", { iat: past, exp: past + 60 }));
  const r3 = await get(`${base}/api/sso?token=${encodeURIComponent(tExp)}`);
  assert("expired -> 401", r3.status === 401, `status=${r3.status}`);
  assert("expired -> code=expired", r3.body?.code === "expired", `body=${JSON.stringify(r3.body)}`);
  assert("expired -> NO Set-Cookie", !/session=/.test(r3.setCookie || ""));

  // ---- Test 4: tampered signature -> 401 signature_invalid, no cookie ----
  const tBad = mintToken(baseClaims("bad-sig-jti")).slice(0, -4) + "AAAA";
  const r4 = await get(`${base}/api/sso?token=${encodeURIComponent(tBad)}`);
  assert("bad sig -> 401", r4.status === 401);
  assert("bad sig -> code=signature_invalid", r4.body?.code === "signature_invalid", `body=${JSON.stringify(r4.body)}`);
  assert("bad sig -> NO Set-Cookie", !/session=/.test(r4.setCookie || ""));

  // ---- Test 5: missing token -> 400 missing_token ----
  const r5 = await get(`${base}/api/sso`);
  assert("missing token -> 400", r5.status === 400);
  assert("missing token -> code=missing_token", r5.body?.code === "missing_token");

  // ---- Test 6: wrong audience -> consume returns AUDIENCE_MISMATCH ----
  // (verifier rejects first because aud != configured AUDIENCE; that itself
  // exercises the audience reject path before consume is even called.)
  const tWrongAud = mintToken(baseClaims("aud-jti", { aud: "other-app", module_slug: "other-app" }));
  const r6 = await get(`${base}/api/sso?token=${encodeURIComponent(tWrongAud)}`);
  assert("wrong aud -> 401", r6.status === 401);
  assert("wrong aud -> code=audience_mismatch", r6.body?.code === "audience_mismatch", `body=${JSON.stringify(r6.body)}`);
  assert("wrong aud -> NO Set-Cookie", !/session=/.test(r6.setCookie || ""));
} catch (err) {
  console.error("E2E test crashed:", err);
  fail++;
} finally {
  if (child && !child.killed) child.kill("SIGTERM");
  mockServer.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
