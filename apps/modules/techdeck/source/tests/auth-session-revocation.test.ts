import { describe, it, expect, vi } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock("../server/auth/authService", () => authMocks);

const { isAuthenticated } = await import("../server/auth/middleware");

function buildApp() {
  const app = express();
  app.use(session({ secret: "test-session-secret", resave: false, saveUninitialized: false }));
  app.get("/test/session", (req, res) => {
    req.session.userId = "revoked-user";
    req.session.mfaPending = false;
    req.session.save(() => res.json({ ok: true }));
  });
  app.get("/protected", isAuthenticated, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("session revocation gate", () => {
  it("blocks an existing session when the local user has revokedAt", async () => {
    authMocks.getUser.mockResolvedValue({
      id: "revoked-user",
      revokedAt: new Date(),
      entitlementSnapshotJson: null,
    });
    const agent = request.agent(buildApp());

    await agent.get("/test/session").expect(200);
    const res = await agent.get("/protected");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("module_access_denied");
  });

  it("blocks an existing session when the entitlement snapshot is disabled", async () => {
    authMocks.getUser.mockResolvedValue({
      id: "disabled-user",
      revokedAt: null,
      entitlementSnapshotJson: {
        schemaVersion: 1,
        planSlug: "pro",
        subscriptionStatus: "active",
        accessLevel: "pro",
        features: [],
        limits: {},
        moduleRole: "tech",
        enabled: false,
        syncedAt: new Date().toISOString(),
      },
    });
    const agent = request.agent(buildApp());

    await agent.get("/test/session").expect(200);
    const res = await agent.get("/protected");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("module_access_denied");
  });

  it("blocks an OperatorOS-managed session when the entitlement snapshot is missing", async () => {
    authMocks.getUser.mockResolvedValue({
      id: "missing-snapshot-user",
      revokedAt: null,
      operatorosUserId: "os-user-missing",
      ssoSubject: "sub-missing",
      operatorosTenantId: "os-tenant-missing",
      entitlementSnapshotJson: null,
    });
    const agent = request.agent(buildApp());

    await agent.get("/test/session").expect(200);
    const res = await agent.get("/protected");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("module_access_denied");
  });
});
