import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import jwt, { type Algorithm } from "jsonwebtoken";
import { verifyToken, consumeToken, registerSsoRoutes, MODULE_SLUG, type SsoConfig } from "../server/auth/sso";
import { renderSsoErrorPage, pickLanguage } from "../server/auth/ssoErrorPage";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://techdeck:test@localhost:5432/techdeck_test";
});

const SECRET = "x".repeat(32);
const cfg: SsoConfig = {
  secret: SECRET,
  baseUrl: "https://operatoros.example",
  apiUrl: "https://operatoros.example/api",
  expectedIssuer: "https://operatoros.example",
  audience: MODULE_SLUG,
  env: "test",
  moduleKey: MODULE_SLUG,
  allowLegacyIssuer: false,
};

function makeToken(overrides: Record<string, unknown> = {}, signSecret = SECRET, alg: Algorithm = "HS256") {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: cfg.expectedIssuer,
    aud: MODULE_SLUG,
    env: "test",
    sub: "user-123",
    user_id: "user-123",
    email: "alice@example.com",
    name: "Alice Admin",
    role: "admin",
    module_slug: MODULE_SLUG,
    plan_slug: "pro",
    organization_id: "acme",
    // Task #12 entitlement claims.
    target_module_key: MODULE_SLUG,
    target_module_enabled: true,
    target_module_access_level: "pro",
    target_module_features: ["api", "reports", "status"],
    target_module_limits: { usersMax: 5, reportsPerMonth: 50 },
    module_role: "module_admin",
    tenant_role: "tenant_admin",
    subscription_status: "active",
    jti: "jti-" + Math.random().toString(36).slice(2),
    iat: now,
    exp: now + 60,
    ...overrides,
  };
  return jwt.sign(payload, signSecret, { algorithm: alg });
}

describe("SSO verifyToken", () => {
  it("accepts a valid token", () => {
    const r = verifyToken(makeToken(), cfg);
    expect(r.ok).toBe(true);
  });

  it("accepts the canonical OperatorOS URL issuer", () => {
    const r = verifyToken(makeToken({ iss: "https://operatoros.example" }), cfg);
    expect(r.ok).toBe(true);
  });

  it("rejects bad signature", () => {
    const r = verifyToken(makeToken({}, "wrong-secret-wrong-secret"), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("signature_invalid");
  });

  it("rejects alg=none before trusting claims", () => {
    const [, payload] = makeToken().split(".");
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const r = verifyToken(`${header}.${payload}.`, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("signature_invalid");
  });

  it("rejects non-HS256 algorithms", () => {
    const [, payload, signature] = makeToken().split(".");
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const r = verifyToken(`${header}.${payload}.${signature}`, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("signature_invalid");
  });

  it("rejects wrong audience", () => {
    const r = verifyToken(makeToken({ aud: "other" }), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("audience_mismatch");
  });

  it("rejects wrong issuer", () => {
    const r = verifyToken(makeToken({ iss: "evil" }), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("issuer_mismatch");
  });

  it("rejects legacy operatoros issuer by default", () => {
    const r = verifyToken(makeToken({ iss: "operatoros" }), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("issuer_mismatch");
  });

  it("accepts legacy operatoros issuer only when compatibility is explicit", () => {
    const r = verifyToken(makeToken({ iss: "operatoros" }), { ...cfg, allowLegacyIssuer: true });
    expect(r.ok).toBe(true);
  });

  it("rejects wrong env", () => {
    const r = verifyToken(makeToken({ env: "prod" }), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("env_mismatch");
  });

  it("rejects expired token", () => {
    const now = Math.floor(Date.now() / 1000);
    const r = verifyToken(makeToken({ iat: now - 200, exp: now - 100 }), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("expired");
  });

  it("rejects token older than 90s by iat", () => {
    const now = Math.floor(Date.now() / 1000);
    const r = verifyToken(makeToken({ iat: now - 200, exp: now + 600 }), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("expired");
  });

  it("rejects future iat beyond skew", () => {
    const now = Math.floor(Date.now() / 1000);
    const r = verifyToken(makeToken({ iat: now + 60, exp: now + 600 }), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("clock_skew");
  });

  it("rejects mismatched module_slug", () => {
    const r = verifyToken(makeToken({ module_slug: "other" }), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("audience_mismatch");
  });

  it("rejects missing module_slug", () => {
    const r = verifyToken(makeToken({ module_slug: undefined }), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("audience_mismatch");
  });

  it("rejects missing target_module_key", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        iss: cfg.expectedIssuer, aud: MODULE_SLUG, env: "test",
        sub: "u", email: "a@b.com", module_slug: MODULE_SLUG, jti: "j", iat: now, exp: now + 60,
      },
      SECRET, { algorithm: "HS256" },
    );
    const r = verifyToken(token, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("module_access_denied");
  });

  it("rejects wrong target_module_key", () => {
    const r = verifyToken(makeToken({ target_module_key: "other" }), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("module_access_denied");
  });

  it("rejects target_module_enabled=false", () => {
    const r = verifyToken(makeToken({ target_module_enabled: false }), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("module_access_denied");
  });

  it("rejects module_role=none", () => {
    const r = verifyToken(makeToken({ module_role: "none" }), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("module_access_denied");
  });

  it("rejects missing module_role", () => {
    const r = verifyToken(makeToken({ module_role: undefined }), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("module_access_denied");
  });

  it("rejects missing jti", () => {
    const r = verifyToken(makeToken({ jti: undefined }), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("signature_invalid");
  });
});

describe("SSO consumeToken", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("sends {jti, aud, env} payload and OperatorOS headers to consume endpoint", async () => {
    const fetchSpy = vi.fn(async () => ({ status: 200, json: async () => ({}) } as unknown as Response));
    vi.stubGlobal("fetch", fetchSpy);
    await consumeToken(cfg, "jti-abc", "req-123");
    const callArgs = fetchSpy.mock.calls[0];
    expect(callArgs[0]).toBe("https://operatoros.example/api/v1/modules/sso/consume");
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body).toEqual({ jti: "jti-abc", aud: MODULE_SLUG, env: "test" });
    const headers = (callArgs[1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-Module-Slug"]).toBe(MODULE_SLUG);
    expect(headers["X-Request-Id"]).toBe("req-123");
  });

  it("returns ok on 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, json: async () => ({}) } as unknown as Response)));
    const r = await consumeToken(cfg, "jti-1");
    expect(r.ok).toBe(true);
  });

  it("maps TOKEN_REPLAYED to consume_failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 409, json: async () => ({ error: "TOKEN_REPLAYED" }) } as unknown as Response)));
    const r = await consumeToken(cfg, "jti-2");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("consume_failed");
  });

  it("maps TOKEN_UNKNOWN to consume_failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 404, json: async () => ({ code: "TOKEN_UNKNOWN" }) } as unknown as Response)));
    const r = await consumeToken(cfg, "jti-unknown");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("consume_failed");
  });

  it("maps TOKEN_EXPIRED to expired", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 410, json: async () => ({ error: "TOKEN_EXPIRED" }) } as unknown as Response)));
    const r = await consumeToken(cfg, "jti-3");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("expired");
  });

  it("maps consume audience and env mismatches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 400, json: async () => ({ code: "AUDIENCE_MISMATCH" }) } as unknown as Response)));
    const audience = await consumeToken(cfg, "jti-aud");
    expect(audience.ok).toBe(false);
    if (!audience.ok) expect(audience.code).toBe("audience_mismatch");

    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 400, json: async () => ({ code: "ENV_MISMATCH" }) } as unknown as Response)));
    const env = await consumeToken(cfg, "jti-env");
    expect(env.ok).toBe(false);
    if (!env.ok) expect(env.code).toBe("env_mismatch");
  });

  it("maps 5xx to sso_consume_unavailable (fail-closed)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 503, json: async () => ({}) } as unknown as Response)));
    const r = await consumeToken(cfg, "jti-4");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("sso_consume_unavailable");
  });

  it("maps network failure to sso_consume_unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const r = await consumeToken(cfg, "jti-5");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("sso_consume_unavailable");
  });
});

describe("/sso route", () => {
  function buildApp(routeCfg: SsoConfig | null) {
    const app = express();
    app.use(session({ secret: "test-session-secret", resave: false, saveUninitialized: false }));
    const provisioner = async () => ({ userId: "u1", tenantId: "t1" });
    registerSsoRoutes(app, routeCfg, provisioner);
    return app;
  }

  beforeEach(() => { vi.restoreAllMocks(); });

  it("returns 503 sso_not_configured when MODULE_SSO_SECRET is unset", async () => {
    const app = buildApp(null);
    const res = await request(app).get("/sso?token=anything");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("sso_not_configured");
  });

  it("returns 400 missing_token when token is absent", async () => {
    const app = buildApp(cfg);
    const res = await request(app).get("/sso");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("missing_token");
  });

  it("returns 400 bad_request when token is too large", async () => {
    const app = buildApp(cfg);
    const res = await request(app).get(`/sso?token=${"a".repeat(5000)}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("bad_request");
  });

  it("returns 401 expired for an old token (no consume call)", async () => {
    const app = buildApp(cfg);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const now = Math.floor(Date.now() / 1000);
    const tok = makeToken({ iat: now - 1000, exp: now - 500 });
    const res = await request(app).get(`/sso?token=${tok}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("expired");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 401 signature_invalid for tampered token (no consume call)", async () => {
    const app = buildApp(cfg);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const tok = makeToken({}, "different-secret-different");
    const res = await request(app).get(`/sso?token=${tok}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("signature_invalid");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 401 consume_failed when upstream replays the jti", async () => {
    const app = buildApp(cfg);
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 409, json: async () => ({ error: "TOKEN_REPLAYED" }) } as unknown as Response)));
    const res = await request(app).get(`/sso?token=${makeToken()}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("consume_failed");
  });

  it("returns 502 sso_consume_unavailable when consume endpoint is down", async () => {
    const app = buildApp(cfg);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const res = await request(app).get(`/sso?token=${makeToken()}`);
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("sso_consume_unavailable");
  });

  it("happy path: verifies, consumes, mints session, redirects to /", async () => {
    const provisionSpy = vi.fn(async () => ({ userId: "user-uuid-1", tenantId: "tenant-uuid-1" }));
    const fetchSpy = vi.fn(async () => ({ status: 200, json: async () => ({}) } as unknown as Response));
    vi.stubGlobal("fetch", fetchSpy);

    const app = express();
    app.use(session({ secret: "test-session-secret", resave: false, saveUninitialized: false }));
    const { registerSsoRoutes: register } = await import("../server/auth/sso");
    register(app, cfg, provisionSpy);

    const tok = makeToken({ jti: "happy-path-jti" });
    const res = await request(app).get(`/sso?token=${tok}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
    const cookies = res.headers["set-cookie"] as unknown as string[] | undefined;
    expect(cookies).toBeDefined();
    expect(cookies!.some((c) => c.startsWith("connect.sid="))).toBe(true);
    expect(provisionSpy).toHaveBeenCalledWith(expect.objectContaining({
      ssoSubject: "user-123",
      email: "alice@example.com",
      name: "Alice Admin",
      role: "ADMIN",
      organizationId: "acme",
      planSlug: "pro",
    }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const consumeBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(consumeBody).toEqual({ jti: "happy-path-jti", aud: MODULE_SLUG, env: "test" });
  });

  it("never echoes the JWT secret in any response body", async () => {
    const app = buildApp(cfg);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("net"); }));
    const res = await request(app).get(`/sso?token=${makeToken()}`);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it("renders an HTML error page when the browser sends Accept: text/html", async () => {
    const app = buildApp(cfg);
    const now = Math.floor(Date.now() / 1000);
    const tok = makeToken({ iat: now - 1000, exp: now - 500 });
    const res = await request(app)
      .get(`/sso?token=${tok}`)
      .set("Accept", "text/html,application/xhtml+xml");
    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain("expired");
    expect(res.text).toContain("Your sign-in link has expired");
    expect(res.text).toContain(`href="${cfg.baseUrl}"`);
  });

  it("still returns JSON when Accept includes application/json", async () => {
    const app = buildApp(cfg);
    const res = await request(app)
      .get("/sso")
      .set("Accept", "application/json");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.code).toBe("missing_token");
  });

  it("returns JSON when no Accept header is present (API client default)", async () => {
    const app = buildApp(cfg);
    const res = await request(app).get("/sso");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("missing_token");
  });

  it("HTML error page omits the back link when SSO is not configured", async () => {
    const app = buildApp(null);
    const res = await request(app)
      .get("/sso?token=anything")
      .set("Accept", "text/html");
    expect(res.status).toBe(503);
    expect(res.text).toContain("OperatorOS sign-in isn");
    expect(res.text).toContain("sso_not_configured");
    expect(res.text).not.toContain("Return to OperatorOS");
  });
});

describe("findOrCreateSsoUser concurrent provisioning", () => {
  beforeEach(() => { vi.resetModules(); });

  it("does not bind an SSO user by email alone", async () => {
    let selectCalls = 0;
    let insertedEmail: string | undefined;

    function makeTx() {
      return {
        select: () => ({
          from: () => ({
            where: async () => {
              selectCalls += 1;
              return [];
            },
          }),
        }),
        insert: (table: unknown) => {
          const tableName = (table as { [k: string]: unknown })[
            Object.getOwnPropertySymbols(table as object).find(
              (s) => s.description === "drizzle:Name",
            ) as symbol
          ] as string | undefined;
          return {
            values: (v: any) => {
              if (tableName === "users") insertedEmail = v.email;
              return {
                onConflictDoUpdate: () => ({
                  returning: async () => [{ id: "new-user-id", email: insertedEmail }],
                }),
                onConflictDoNothing: () => ({
                  returning: async () => [{ id: "tenant-id", slug: "os-acme" }],
                }),
              };
            },
          };
        },
        update: () => ({
          set: () => ({
            where: async () => [],
          }),
        }),
      };
    }

    vi.doMock("../server/db", () => ({
      db: {
        transaction: async <T,>(fn: (tx: ReturnType<typeof makeTx>) => Promise<T>) => fn(makeTx()),
      },
    }));

    const { findOrCreateSsoUser } = await import("../server/auth/sso");
    const result = await findOrCreateSsoUser({
      ssoSubject: "sub-new",
      email: "shared@example.com",
      name: "Shared Email",
      role: "TECH",
      planSlug: "pro",
      organizationId: "acme",
      operatorosUserId: "os-user-new",
      snapshot: {
        schemaVersion: 1,
        planSlug: "pro",
        subscriptionStatus: "active",
        accessLevel: "pro",
        features: [],
        limits: {},
        moduleRole: "tech",
        tenantRole: undefined,
        organizationId: "acme",
        operatorosUserId: "os-user-new",
        enabled: true,
        syncedAt: new Date().toISOString(),
      },
    });

    expect(result).toEqual({ userId: "new-user-id", tenantId: "tenant-id" });
    expect(insertedEmail).toBe("shared@example.com");
    expect(selectCalls).toBe(2);
  });

  it("two simultaneous calls for the same new user both succeed, no duplicate member rows", async () => {
    // Simulate two concurrent transactions racing to provision the same brand-new SSO user.
    // Caller A "wins" every insert; caller B sees ON CONFLICT DO NOTHING return empty
    // and falls back to a follow-up SELECT — exactly the race the production code now handles.
    const TENANT_ID = "tenant-shared-uuid";
    const USER_ID = "user-shared-uuid";

    let tenantExists = false;
    let memberExists = false;
    const memberInsertAttempts: number[] = [];

    function makeTx() {
      const tx = {
        insert: (table: { _: { name?: string } } | unknown) => {
          const tableName = (table as { [k: string]: unknown })[
            Object.getOwnPropertySymbols(table as object).find(
              (s) => s.description === "drizzle:Name",
            ) as symbol
          ] as string | undefined;
          return {
            values: (_v: unknown) => ({
              onConflictDoUpdate: (_o: unknown) => {
                if (tableName === "tenant_members") {
                  memberInsertAttempts.push(Date.now());
                  if (memberExists) return Promise.resolve([]);
                  memberExists = true;
                  return Promise.resolve([{ id: "member-1" }]);
                }
                return {
                  returning: async () => [{ id: USER_ID, email: "alice@example.com" }],
                };
              },
              onConflictDoNothing: (_o?: unknown) => {
                if (tableName === "tenants") {
                  if (tenantExists) {
                    return { returning: async () => [] };
                  }
                  tenantExists = true;
                  return { returning: async () => [{ id: TENANT_ID, slug: "os-acme" }] };
                }
                return { returning: async () => [] };
              },
            }),
          };
        },
        select: () => ({
          from: (_t: unknown) => ({
            where: async () => (tenantExists ? [{ id: TENANT_ID, slug: "os-acme" }] : []),
          }),
        }),
        update: (_t: unknown) => ({
          set: (_v: unknown) => ({
            where: async () => [],
          }),
        }),
      };
      return tx;
    }

    vi.doMock("../server/db", () => ({
      db: {
        transaction: async <T,>(fn: (tx: ReturnType<typeof makeTx>) => Promise<T>) => fn(makeTx()),
      },
    }));

    const { findOrCreateSsoUser } = await import("../server/auth/sso");

    const input = {
      ssoSubject: "sub-race",
      email: "alice@example.com",
      role: "ADMIN" as const,
      planSlug: "pro",
      organizationId: "acme",
      operatorosUserId: "os-user-1",
      snapshot: {
        schemaVersion: 1 as const,
        planSlug: "pro",
        subscriptionStatus: "active",
        accessLevel: "pro",
        features: [],
        limits: {},
        moduleRole: "module_admin",
        tenantRole: "tenant_admin",
        organizationId: "acme",
        operatorosUserId: "os-user-1",
        enabled: true,
        syncedAt: new Date().toISOString(),
      },
    };

    const [a, b] = await Promise.all([
      findOrCreateSsoUser(input),
      findOrCreateSsoUser(input),
    ]);

    expect(a).toEqual({ userId: USER_ID, tenantId: TENANT_ID });
    expect(b).toEqual({ userId: USER_ID, tenantId: TENANT_ID });
    // Both transactions attempted the membership insert, but only one row was created
    // (the second hits ON CONFLICT DO NOTHING and returns silently).
    expect(memberInsertAttempts.length).toBe(2);
    expect(memberExists).toBe(true);
  });
});

describe("ssoErrorPage localization", () => {
  describe("pickLanguage", () => {
    it("defaults to English when no signals are provided", () => {
      expect(pickLanguage(undefined)).toBe("en");
      expect(pickLanguage("")).toBe("en");
    });

    it("honors an explicit override over Accept-Language", () => {
      expect(pickLanguage("en-US,en;q=0.9", "es")).toBe("es");
    });

    it("falls back to English for an unsupported override", () => {
      expect(pickLanguage("en-US", "zz")).toBe("en");
    });

    it("matches a region-tagged Accept-Language to its primary subtag", () => {
      expect(pickLanguage("es-MX,es;q=0.9")).toBe("es");
    });

    it("respects q-values when picking from Accept-Language", () => {
      // Spanish has higher q than English, so es wins.
      expect(pickLanguage("en;q=0.2, es;q=0.9")).toBe("es");
    });

    it("falls back to English when no Accept-Language entry is supported", () => {
      expect(pickLanguage("zh-CN,zh;q=0.9,ja;q=0.5")).toBe("en");
    });
  });

  describe("renderSsoErrorPage", () => {
    it("renders English copy by default", () => {
      const html = renderSsoErrorPage("expired", "Token expired", "https://operatoros.example");
      expect(html).toContain('<html lang="en">');
      expect(html).toContain("Your sign-in link has expired");
      expect(html).toContain("Return to OperatorOS");
      expect(html).toContain("Error code: expired");
    });

    it("renders Spanish copy when Accept-Language prefers es", () => {
      const html = renderSsoErrorPage(
        "expired",
        "Token expired",
        "https://operatoros.example",
        { acceptLanguage: "es-MX,es;q=0.9,en;q=0.5" },
      );
      expect(html).toContain('<html lang="es">');
      expect(html).toContain("Tu enlace de inicio de sesión ha caducado");
      expect(html).toContain("Volver a OperatorOS");
      expect(html).toContain("Código de error: expired");
    });

    it("renders the localized fallback when the code is unknown", () => {
      const html = renderSsoErrorPage(
        "totally_unknown_code",
        "boom",
        "https://operatoros.example",
        { acceptLanguage: "es" },
      );
      expect(html).toContain("No pudimos completar tu inicio de sesión");
    });

    it("translates every reject code in Spanish (no English bleed-through)", () => {
      const codes = [
        "missing_token",
        "bad_request",
        "signature_invalid",
        "issuer_mismatch",
        "audience_mismatch",
        "env_mismatch",
        "expired",
        "clock_skew",
        "consume_failed",
        "sso_consume_unavailable",
        "sso_not_configured",
        "server_error",
      ];
      for (const code of codes) {
        const en = renderSsoErrorPage(code, "msg", "https://o.example", { acceptLanguage: "en" });
        const es = renderSsoErrorPage(code, "msg", "https://o.example", { acceptLanguage: "es" });
        // Title and body for each code should differ between locales.
        const enTitle = /<h1[^>]*>([^<]+)<\/h1>/.exec(en)?.[1];
        const esTitle = /<h1[^>]*>([^<]+)<\/h1>/.exec(es)?.[1];
        expect(enTitle, `EN title for ${code}`).toBeTruthy();
        expect(esTitle, `ES title for ${code}`).toBeTruthy();
        expect(esTitle, `${code} should be translated`).not.toBe(enTitle);
      }
    });

    it("prefers the lang override over Accept-Language", () => {
      const html = renderSsoErrorPage(
        "expired",
        "Token expired",
        "https://operatoros.example",
        { acceptLanguage: "en-US,en;q=0.9", langOverride: "es" },
      );
      expect(html).toContain('<html lang="es">');
      expect(html).toContain("Volver a OperatorOS");
    });
  });

  describe("/sso route locale negotiation", () => {
    it("returns a Spanish HTML error page when Accept-Language prefers es", async () => {
      const app = express();
      registerSsoRoutes(app, cfg);
      const res = await request(app)
        .get("/sso")
        .set("Accept", "text/html")
        .set("Accept-Language", "es-MX,es;q=0.9,en;q=0.5");
      expect(res.status).toBe(400);
      expect(res.text).toContain('<html lang="es">');
      expect(res.text).toContain("Volver a OperatorOS");
    });

    it("honors a ?lang= query override on the HTML error page", async () => {
      const app = express();
      registerSsoRoutes(app, cfg);
      const res = await request(app)
        .get("/sso?lang=es")
        .set("Accept", "text/html")
        .set("Accept-Language", "en-US,en;q=0.9");
      expect(res.status).toBe(400);
      expect(res.text).toContain('<html lang="es">');
    });

    it("prefers the JWT `lang` claim over Accept-Language and ?lang=", async () => {
      // The verified JWT lang claim is the most reliable signal of the user's
      // preferred language (it reflects what they picked in OperatorOS), so
      // it must win over both Accept-Language and the ?lang= query override.
      const app = express();
      app.use(session({ secret: "test-session-secret", resave: false, saveUninitialized: false }));
      registerSsoRoutes(app, cfg, async () => ({ userId: "u1", tenantId: "t1" }));
      // Upstream consume replays the jti → we render an error page AFTER verifyToken,
      // which is exactly where the claim's lang becomes available.
      vi.stubGlobal("fetch", vi.fn(async () => ({ status: 409, json: async () => ({ error: "TOKEN_REPLAYED" }) } as unknown as Response)));
      const tok = makeToken({ lang: "es" });
      const res = await request(app)
        .get(`/sso?token=${tok}&lang=en`)
        .set("Accept", "text/html")
        .set("Accept-Language", "en-US,en;q=0.9");
      expect(res.status).toBe(401);
      expect(res.text).toContain('<html lang="es">');
      expect(res.text).toContain("El enlace de inicio de sesión ya se ha usado");
    });
  });
});
