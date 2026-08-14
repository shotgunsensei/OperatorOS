import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

const storageMocks = vi.hoisted(() => ({
  getTenantSubscription: vi.fn(),
  updateTenantSubscription: vi.fn(),
  upsertTenantSubscription: vi.fn(),
  getAllTenants: vi.fn(),
  getAllUsers: vi.fn(),
  setSystemAdmin: vi.fn(),
  isUserSystemAdmin: vi.fn(),
  deleteTenant: vi.fn(),
  getOrCreateUsageCounter: vi.fn(),
}));

vi.mock("../server/storage", () => ({ storage: storageMocks }));

vi.mock("../server/auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = {
      claims: { sub: "user-1" },
      profile: {
        entitlementSnapshotJson: {
          schemaVersion: 1,
          planSlug: "pro",
          subscriptionStatus: "active",
          accessLevel: "pro",
          features: ["api", "portal", "status", "webhooks", "reports", "intake"],
          limits: {},
          moduleRole: "module_admin",
          enabled: true,
          syncedAt: new Date().toISOString(),
        },
        lastEntitlementSyncAt: new Date(),
      },
    };
    next();
  },
}));

vi.mock("../server/core/middleware/requireSystemAdmin", () => ({
  requireSystemAdmin: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [],
            }),
          }),
        }),
      }),
    }),
  },
}));

const { registerBillingRoutes } = await import("../server/modules/billing/routes");
const { registerAdminRoutes } = await import("../server/modules/admin/routes");

function makeApp() {
  const app = express();
  app.use(express.json());
  registerBillingRoutes(app);
  registerAdminRoutes(app);
  return app;
}

describe("OperatorOS billing decommission routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPERATOROS_BILLING_URL = "https://operatoros.example/billing";
  });

  it.each(["/api/billing/checkout-session", "/api/billing/customer-portal"])(
    "returns 410 for local billing write endpoint %s",
    async (path) => {
      const res = await request(makeApp()).post(path).send({ planCode: "msp" });

      expect(res.status).toBe(410);
      expect(res.body.error).toBe("managed_by_operatoros");
      expect(res.body.operatorosBillingUrl).toBe("https://operatoros.example/billing");
      expect(res.headers.location).toBe("https://operatoros.example/billing");
      expect(storageMocks.updateTenantSubscription).not.toHaveBeenCalled();
      expect(storageMocks.upsertTenantSubscription).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["patch", "/api/admin/tenants/t-1/subscription"],
    ["post", "/api/admin/tenants/t-1/pause"],
    ["post", "/api/admin/tenants/t-1/unpause"],
  ] as const)("returns 410 for admin subscription mutation %s %s", async (method, path) => {
    const res = await request(makeApp())[method](path).send({ planCode: "enterprise", status: "active" });

    expect(res.status).toBe(410);
    expect(res.body.code).toBe("managed_by_operatoros");
    expect(res.body.operatorosUrl).toBe("https://operatoros.example/billing");
    expect(storageMocks.updateTenantSubscription).not.toHaveBeenCalled();
    expect(storageMocks.upsertTenantSubscription).not.toHaveBeenCalled();
  });

  it("returns OperatorOS pointer for admin plans", async () => {
    const res = await request(makeApp()).get("/api/admin/plans");

    expect(res.status).toBe(200);
    expect(res.body.plans).toEqual([]);
    expect(res.body.managedBy).toBe("operatoros");
    expect(res.body.operatorosUrl).toBe("https://operatoros.example/billing");
  });
});
