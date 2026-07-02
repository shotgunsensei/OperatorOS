import { describe, it, expect, beforeAll, vi } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";

vi.mock("../server/db", () => ({ db: {} }));
vi.mock("../server/auth/authService", async () => {
  return {
    getUser: vi.fn(async (id: string) => null),
    registerUser: vi.fn(),
    authenticateUser: vi.fn(),
    generateTOTPSecret: vi.fn(),
    verifyTOTPToken: vi.fn(),
    generateRecoveryCodes: vi.fn(),
    enableMfa: vi.fn(),
    disableMfa: vi.fn(),
    useRecoveryCode: vi.fn(),
    verifyPassword: vi.fn(),
    hashPassword: vi.fn(),
  };
});

import { isAuthenticated } from "../server/auth/middleware";
import { csrfProtection } from "../server/auth/csrf";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }),
  );
  // Protected route mirroring real /api/auth/user shape
  app.get("/api/auth/user", isAuthenticated, (_req, res) => {
    res.json({ id: "x" });
  });
  // CSRF-protected POST mirroring /api/auth/login shape
  app.post("/api/auth/login", csrfProtection, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("auth middleware content negotiation (real endpoints)", () => {
  it("isAuthenticated returns JSON when no session and no Accept header", async () => {
    const res = await request(buildApp()).get("/api/auth/user");
    expect(res.status).toBe(401);
    expect(res.type).toMatch(/json/);
    expect(res.body).toMatchObject({ message: "Unauthorized", code: "not_authenticated" });
  });

  it("isAuthenticated returns JSON for Accept: application/json", async () => {
    const res = await request(buildApp())
      .get("/api/auth/user")
      .set("Accept", "application/json");
    expect(res.status).toBe(401);
    expect(res.type).toMatch(/json/);
    expect(res.body.code).toBe("not_authenticated");
  });

  it("isAuthenticated renders a friendly HTML page for browsers (Accept: text/html)", async () => {
    const res = await request(buildApp())
      .get("/api/auth/user")
      .set("Accept", "text/html,application/xhtml+xml");
    expect(res.status).toBe(401);
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain("Please sign in first");
    expect(res.text).toContain('href="/login"');
    expect(res.text).toContain('data-testid="auth-error-card"');
  });

  it("CSRF protection returns JSON by default when token missing", async () => {
    const res = await request(buildApp()).post("/api/auth/login").send({});
    expect(res.status).toBe(403);
    expect(res.type).toMatch(/json/);
    expect(res.body).toMatchObject({ message: "Invalid CSRF token", code: "csrf_invalid" });
  });

  it("CSRF protection renders a friendly HTML page for browsers when token missing", async () => {
    const res = await request(buildApp())
      .post("/api/auth/login")
      .set("Accept", "text/html")
      .send({});
    expect(res.status).toBe(403);
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain("Your session has expired");
    expect(res.text).toContain('href="/login"');
  });
});
