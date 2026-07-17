import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";
import ssoRouter from "./sso";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../lib/sessionCookie";
import * as sso from "../lib/operatorOsSso";

/**
 * Vitest harness for the OperatorOS SSO endpoint. Network calls to the real
 * consume endpoint are stubbed; the JWT signing path uses the same secret as
 * the server so signature verification exercises the production code path.
 *
 * Each test creates its own JWT with a fresh `jti` and `sub` so we can assert
 * on persisted user rows without cross-test contamination. A test-prefixed
 * `operator_identity_id` namespace lets us clean up safely on teardown.
 */

const SECRET = "test-shared-secret-must-be-at-least-16-chars";
const ISSUER = "https://operator.test";
const AUDIENCE = "faultlinelab";
const ENV_CLAIM = "test";
const API_URL = "https://operator.test/api";
const TEST_PREFIX = "vitest-sso-";

function buildApp(): Express {
  const app = express();
  app.use(cookieParser());
  app.use("/", ssoRouter);
  return app;
}

function makeToken(overrides: Record<string, unknown> = {}, secret = SECRET): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: TEST_PREFIX + randomUUID(),
    iss: ISSUER,
    aud: AUDIENCE,
    module_slug: AUDIENCE,
    target_module_key: AUDIENCE,
    target_module_enabled: true,
    env: ENV_CLAIM,
    iat: now,
    exp: now + 60,
    jti: randomUUID(),
    email: "ops@test.local",
    name: "Test Operator",
    plan_slug: "ops-pro",
    role: "admin",
    module_role: "module_admin",
    tenant_role: "tenant_admin",
    tenant_id: "tenant-test",
    access_level: "pro",
    features: ["pro-analytics"],
    granted_product_ids: ["pack-network-ops"],
    subscription_status: "active",
    ...overrides,
  };
  return jwt.sign(payload, secret, { algorithm: "HS256" });
}

async function get(app: Express, url: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  // Use Express's built-in handle via a manual node http request for fewer deps.
  const http = await import("node:http");
  return await new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as any).port;
      http
        .get({ host: "127.0.0.1", port, path: url }, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c as Buffer));
          res.on("end", () => {
            server.close();
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              headers[k] = Array.isArray(v) ? v.join(",") : (v as string);
            }
            resolve({ status: res.statusCode || 0, headers, body: Buffer.concat(chunks).toString("utf8") });
          });
        })
        .on("error", reject);
    });
  });
}

beforeAll(() => {
  process.env.MODULE_SSO_SECRET = SECRET;
  process.env.OPERATOROS_BASE_URL = ISSUER;
  process.env.OPERATOROS_SSO_AUDIENCE = AUDIENCE;
  process.env.OPERATOROS_SSO_ENV = ENV_CLAIM;
  process.env.OPERATOROS_API_URL = API_URL;
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await db.delete(usersTable).where(like(usersTable.operatorIdentityId, TEST_PREFIX + "%"));
});

afterAll(async () => {
  await db.delete(usersTable).where(like(usersTable.operatorIdentityId, TEST_PREFIX + "%"));
});

describe("/sso", () => {
  it("redirects to /?sso=ok and sets a session cookie on a valid token", async () => {
    const consumeSpy = vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const token = makeToken();
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(302);
    expect(res.headers["location"]).toMatch(/^\/\?sso=ok/);
    expect(consumeSpy).toHaveBeenCalledOnce();

    const setCookie = res.headers["set-cookie"] || "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const match = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    const payload = match ? verifySessionToken(decodeURIComponent(match[1])) : null;
    expect(payload?.src).toBe("operatoros");

    const decoded = jwt.decode(token) as Record<string, unknown>;
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.operatorIdentityId, decoded.sub as string));
    expect(rows).toHaveLength(1);
    expect(rows[0].operatorPlanSlug).toBe("ops-pro");
    // module_role wins over legacy `role` per the new entitlement contract
    expect(rows[0].operatorRole).toBe("module_admin");
  });

  it("rejects tokens signed with the wrong secret as invalid_token", async () => {
    const consumeSpy = vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const token = makeToken({}, "a-totally-different-secret-1234567890");
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain("sso=error");
    expect(res.headers["location"]).toContain("reason=invalid_token");
    expect(consumeSpy).not.toHaveBeenCalled();
    expect(res.headers["set-cookie"]).toBeFalsy();
  });

  it("rejects alg=none tokens before any verification", async () => {
    const consumeSpy = vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "x",
        iss: ISSUER,
        aud: AUDIENCE,
        env: ENV_CLAIM,
        iat: now,
        exp: now + 60,
        jti: randomUUID(),
      }),
    ).toString("base64url");
    const token = `${header}.${payload}.`;
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=invalid_token");
    expect(consumeSpy).not.toHaveBeenCalled();
  });

  it("maps an expired token to reason=expired", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const now = Math.floor(Date.now() / 1000);
    const token = makeToken({ iat: now - 200, exp: now - 60 });
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=expired");
  });

  it("maps audience mismatch to reason=wrong_audience", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const token = makeToken({ aud: "some-other-app" });
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=wrong_audience");
  });

  it("maps env mismatch to reason=wrong_env", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const token = makeToken({ env: "production" });
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=wrong_env");
  });

  it("maps consume TOKEN_REPLAYED to reason=consume_failed", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockRejectedValue(
      new sso.SsoVerificationError("consume_failed", "replayed", "jti-x"),
    );
    const token = makeToken();
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=consume_failed");
    expect(res.headers["set-cookie"]).toBeFalsy();
  });

  it("returns 502 + reason=sso_consume_unavailable when the consume endpoint is down", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockRejectedValue(
      new sso.SsoVerificationError("sso_consume_unavailable", "5xx", "jti-y"),
    );
    const token = makeToken();
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(502);
    expect(res.headers["location"]).toContain("reason=sso_consume_unavailable");
  });

  it("rejects missing token with reason=missing_token", async () => {
    const consumeSpy = vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const res = await get(buildApp(), `/sso`);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain("reason=missing_token");
    expect(consumeSpy).not.toHaveBeenCalled();
  });

  it("rejects wrong issuer with reason=wrong_issuer", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const token = makeToken({ iss: "https://evil.example" });
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=wrong_issuer");
  });

  it("rejects mismatched module_slug with reason=wrong_module", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const token = makeToken({ module_slug: "some-other-module" });
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=wrong_module");
  });

  it("rejects missing module_slug with reason=wrong_module", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const token = makeToken({ module_slug: undefined });
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=wrong_module");
  });

  it("rejects iat far in the future with reason=invalid_token", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const now = Math.floor(Date.now() / 1000);
    const token = makeToken({ iat: now + 60, exp: now + 120 });
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=invalid_token");
  });

  it("maps consume TOKEN_UNKNOWN to reason=consume_failed", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockRejectedValue(
      new sso.SsoVerificationError("consume_failed", "unknown", "jti-u"),
    );
    const token = makeToken();
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=consume_failed");
  });

  it("maps consume TOKEN_EXPIRED to reason=expired", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockRejectedValue(
      new sso.SsoVerificationError("expired", "upstream-expired", "jti-e"),
    );
    const token = makeToken();
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=expired");
  });

  it("maps consume AUDIENCE_MISMATCH to reason=wrong_audience", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockRejectedValue(
      new sso.SsoVerificationError("aud_mismatch", "upstream-aud", "jti-a"),
    );
    const token = makeToken();
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=wrong_audience");
  });

  it("maps consume ENV_MISMATCH to reason=wrong_env", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockRejectedValue(
      new sso.SsoVerificationError("env_mismatch", "upstream-env", "jti-v"),
    );
    const token = makeToken();
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=wrong_env");
  });

  describe("returnTo open-redirect hardening", () => {
    async function getRedirectLocation(returnTo: string): Promise<string> {
      vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
      const token = makeToken();
      const res = await get(
        buildApp(),
        `/sso?token=${encodeURIComponent(token)}&returnTo=${encodeURIComponent(returnTo)}`,
      );
      expect(res.status).toBe(302);
      return res.headers["location"] || "";
    }

    it("rejects protocol-relative //evil.com and falls back to /", async () => {
      expect(await getRedirectLocation("//evil.com")).toBe("/?sso=ok");
    });

    it("rejects percent-encoded protocol-relative %2F%2Fevil.com", async () => {
      // Send the encoded form RAW in the URL (do not re-encode) so Express's
      // query parser is the one decoding "%2F%2Fevil.com" -> "//evil.com".
      // The runtime guard must still reject it.
      vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
      const token = makeToken();
      const res = await get(
        buildApp(),
        `/sso?token=${encodeURIComponent(token)}&returnTo=%2F%2Fevil.com`,
      );
      expect(res.status).toBe(302);
      expect(res.headers["location"]).toBe("/?sso=ok");
    });

    it("rejects backslash-prefix /\\evil.com that browsers normalize to //evil.com", async () => {
      expect(await getRedirectLocation("/\\evil.com")).toBe("/?sso=ok");
    });

    it("rejects absolute URLs like https://evil.com", async () => {
      expect(await getRedirectLocation("https://evil.com/path")).toBe("/?sso=ok");
    });

    it("rejects bare \\evil.com (no leading slash)", async () => {
      expect(await getRedirectLocation("\\\\evil.com")).toBe("/?sso=ok");
    });

    it("preserves a valid same-origin path and merges sso=ok with existing query", async () => {
      expect(await getRedirectLocation("/cases/foo?ref=launch")).toBe(
        "/cases/foo?ref=launch&sso=ok",
      );
    });
  });

  it("rejects target_module_key mismatch with reason=wrong_module", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const token = makeToken({ target_module_key: "different-child-app" });
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=wrong_module");
  });

  it("rejects tokens that omit target_module_key entirely", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const token = makeToken({ target_module_key: undefined });
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=wrong_module");
    expect(res.headers["set-cookie"]).toBeFalsy();
  });

  it("rejects tokens that omit target_module_enabled entirely", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const token = makeToken({ target_module_enabled: undefined });
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=module_disabled");
    expect(res.headers["set-cookie"]).toBeFalsy();
  });

  it("rejects target_module_enabled=false with reason=module_disabled", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const token = makeToken({ target_module_enabled: false });
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.headers["location"]).toContain("reason=module_disabled");
    expect(res.headers["set-cookie"]).toBeFalsy();
  });

  it("persists the entitlement snapshot + local role from the SSO token", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const token = makeToken({ access_level: "pro", module_role: "module_admin" });
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(302);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.operatorIdentityId, decoded.sub as string));
    expect(rows).toHaveLength(1);
    expect(rows[0].localRole).toBe("admin");
    expect(rows[0].operatorosTenantId).toBe("tenant-test");
    expect(rows[0].entitlementSnapshotJson?.accessLevel).toBe("pro");
    expect(rows[0].entitlementSnapshotJson?.grantedProductIds).toContain(
      "pack-network-ops",
    );
    expect(rows[0].lastEntitlementSyncAt).toBeTruthy();
  });

  it("derives localRole=deny when module_role is none", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const token = makeToken({ module_role: "none", access_level: "denied" });
    const res = await get(buildApp(), `/sso?token=${encodeURIComponent(token)}`);
    // Verifier rejects access_level=denied not before — token still verifies
    // but the snapshot persisted should make localRole=deny so any
    // subsequent requireAuth call returns 403. /sso itself does NOT enforce
    // localRole — that's requireAuth's job. We just assert persistence here.
    expect(res.status).toBe(302);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.operatorIdentityId, decoded.sub as string));
    expect(rows[0].localRole).toBe("deny");
  });

  it("upserts on relaunch (same operator_identity_id => same row, refreshed plan)", async () => {
    vi.spyOn(sso, "consumeSsoToken").mockResolvedValue(undefined);
    const sub = TEST_PREFIX + randomUUID();
    const t1 = makeToken({ sub, plan_slug: "ops-free" });
    const t2 = makeToken({ sub, plan_slug: "ops-pro" });

    await get(buildApp(), `/sso?token=${encodeURIComponent(t1)}`);
    await get(buildApp(), `/sso?token=${encodeURIComponent(t2)}`);

    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.operatorIdentityId, sub));
    expect(rows).toHaveLength(1);
    expect(rows[0].operatorPlanSlug).toBe("ops-pro");
  });
});
