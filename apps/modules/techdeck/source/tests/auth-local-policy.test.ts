import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import request from "supertest";

const authMocks = vi.hoisted(() => ({
  registerUser: vi.fn(),
  authenticateUser: vi.fn(),
  getUser: vi.fn(),
  generateTOTPSecret: vi.fn(),
  verifyTOTPToken: vi.fn(),
  generateRecoveryCodes: vi.fn(),
  enableMfa: vi.fn(),
  disableMfa: vi.fn(),
  useRecoveryCode: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("../server/auth/authService", () => authMocks);

vi.mock("../server/auth/csrf", () => ({
  csrfProtection: (_req: Request, _res: Response, next: NextFunction) => next(),
  registerCsrfRoutes: vi.fn(),
}));

const { registerAuthRoutes } = await import("../server/auth/routes");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test-session-secret", resave: false, saveUninitialized: false }));
  registerAuthRoutes(app);
  return app;
}

const strongPassword = "ValidPass1!";
const originalNodeEnv = process.env.NODE_ENV;

describe("direct local auth policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("disables direct registration in production", async () => {
    const res = await request(buildApp())
      .post("/api/auth/register")
      .set("X-Forwarded-Proto", "https")
      .send({
        email: "tech@example.com",
        password: strongPassword,
        firstName: "Tech",
        lastName: "User",
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("local_register_disabled");
    expect(authMocks.registerUser).not.toHaveBeenCalled();
  });

  it("blocks production password login for non-system-admin users", async () => {
    authMocks.authenticateUser.mockResolvedValue({
      user: { id: "u-1", isSystemAdmin: false },
      requiresMfa: false,
    });

    const res = await request(buildApp())
      .post("/api/auth/login")
      .set("X-Forwarded-Proto", "https")
      .send({ email: "tech@example.com", password: strongPassword });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("local_login_disabled");
  });

  it("allows production password login for explicit system-admin users", async () => {
    authMocks.authenticateUser.mockResolvedValue({
      user: { id: "admin-1", isSystemAdmin: true },
      requiresMfa: false,
    });

    const res = await request(buildApp())
      .post("/api/auth/login")
      .set("X-Forwarded-Proto", "https")
      .send({ email: "admin@example.com", password: strongPassword });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("keeps local registration available outside production", async () => {
    process.env.NODE_ENV = "development";
    authMocks.registerUser.mockResolvedValue({ id: "dev-user-1", email: "dev@example.com" });

    const res = await request(buildApp())
      .post("/api/auth/register")
      .send({
        email: "dev@example.com",
        password: strongPassword,
        firstName: "Dev",
        lastName: "User",
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, userId: "dev-user-1" });
  });
});
