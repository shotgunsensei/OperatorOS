import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

const SERVICE_TOKEN = "z".repeat(48);
process.env.OPERATOROS_SERVICE_TOKEN = SERVICE_TOKEN;
process.env.CHILD_APP_MODULE_KEY = "techdeck";

// --- DB mock state ------------------------------------------------------
const state: {
  user: any | null;
  memberUpsertCalls: number;
  sessionDeleteCalls: number;
  updateCalls: Array<Record<string, unknown>>;
  tenant: any | null;
} = {
  user: null,
  memberUpsertCalls: 0,
  sessionDeleteCalls: 0,
  updateCalls: [],
  tenant: null,
};

function makeChainSelect(rows: any[]) {
  return {
    from: () => ({ where: () => Promise.resolve(rows) }),
  };
}

const txMock = {
  select: () => makeChainSelect(state.user ? [state.user] : []),
  update: () => ({
    set: (vals: any) => {
      state.updateCalls.push(vals);
      if (state.user) Object.assign(state.user, vals);
      return { where: () => Promise.resolve([]) };
    },
  }),
  insert: (_table: any) => ({
    values: (_v: any) => ({
      onConflictDoUpdate: (_o: any) => {
        state.memberUpsertCalls += 1;
        return Promise.resolve([]);
      },
    }),
  }),
};

vi.mock("../server/db", () => ({
  db: {
    transaction: async (fn: (tx: typeof txMock) => Promise<any>) => fn(txMock),
    execute: async () => {
      state.sessionDeleteCalls += 1;
      return { rowCount: 2 };
    },
  },
}));

vi.mock("../server/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

vi.mock("../server/core/events/helpers", () => ({
  emitEvent: async () => {},
}));

// Now import the route registrar (after mocks are in place).
const { registerOperatorOsRoutes } = await import("../server/modules/operatoros/routes");

function makeApp() {
  const app = express();
  app.use(express.json());
  registerOperatorOsRoutes(app);
  return app;
}

const validBody = {
  operatoros_user_id: "os-user-1",
  email: "alice@example.com",
  organization_id: "acme",
  target_module_key: "techdeck",
  target_module_enabled: true,
  target_module_access_level: "pro",
  target_module_features: ["api", "reports", "status"],
  target_module_limits: { usersMax: 5, reportsPerMonth: 50 },
  plan_slug: "pro",
  subscription_status: "active",
  module_role: "module_admin",
  tenant_role: "tenant_admin",
};

describe("POST /api/operatoros/entitlements/sync", () => {
  beforeEach(() => {
    state.user = { id: "u-1", email: "alice@example.com", ssoSubject: null, operatorosUserId: null, operatorosTenantId: null };
    state.memberUpsertCalls = 0;
    state.sessionDeleteCalls = 0;
    state.updateCalls = [];
  });

  it("rejects missing bearer token (401)", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/operatoros/entitlements/sync").send(validBody);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("unauthorized");
  });

  it("rejects wrong bearer token (401)", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", "Bearer " + "x".repeat(48))
      .send(validBody);
    expect(res.status).toBe(401);
  });

  it("rejects different-length bearer tokens without leaking timing details", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", "Bearer short")
      .send(validBody);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("unauthorized");
  });

  it("rejects payload for a different module (400)", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", `Bearer ${SERVICE_TOKEN}`)
      .send({ ...validBody, target_module_key: "statuspage" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("module_mismatch");
  });

  it("rejects bad payload shape (400)", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", `Bearer ${SERVICE_TOKEN}`)
      .send({ operatoros_user_id: "x" }); // missing email
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("bad_request");
  });

  it("rejects missing target_module_enabled (400)", async () => {
    const app = makeApp();
    const { target_module_enabled, ...body } = validBody;
    const res = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", `Bearer ${SERVICE_TOKEN}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("bad_request");
    void target_module_enabled;
  });

  it("happy path: persists snapshot, reflects role, no sessions killed", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe("ok");
    expect(res.body.snapshot.accessLevel).toBe("pro");
    expect(res.body.snapshot.features).toEqual(["api", "reports", "status"]);
    expect(res.body.snapshot.limits.usersMax).toBe(5);
    expect(res.body.snapshot.enabled).toBe(true);
    expect(res.body.sessionsKilled).toBe(0);
    expect(state.updateCalls[0].localRole).toBe("ADMIN");
    expect(state.updateCalls[0].ssoRole).toBe("ADMIN");
    expect(state.updateCalls[0].revokedAt).toBeNull();
  });

  it("revoke path: target_module_enabled=false sets revokedAt and kills sessions", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", `Bearer ${SERVICE_TOKEN}`)
      .send({ ...validBody, target_module_enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.snapshot.enabled).toBe(false);
    expect(state.updateCalls[0].revokedAt).toBeInstanceOf(Date);
    expect(state.sessionDeleteCalls).toBe(1);
    expect(res.body.sessionsKilled).toBe(2);
  });

  it("module_role=none also revokes + kills sessions", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", `Bearer ${SERVICE_TOKEN}`)
      .send({ ...validBody, module_role: "none" });
    expect(res.status).toBe(200);
    expect(state.sessionDeleteCalls).toBe(1);
  });

  it("returns 202 when user is unknown to Tech Deck", async () => {
    state.user = null;
    const app = makeApp();
    const res = await request(app)
      .post("/api/operatoros/entitlements/sync")
      .set("Authorization", `Bearer ${SERVICE_TOKEN}`)
      .send(validBody);
    expect(res.status).toBe(202);
    expect(res.body.code).toBe("user_unknown");
  });

  it("idempotent: two identical calls both succeed without throwing", async () => {
    const app = makeApp();
    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post("/api/operatoros/entitlements/sync")
        .set("Authorization", `Bearer ${SERVICE_TOKEN}`)
        .send(validBody);
      expect(res.status).toBe(200);
    }
  });
});
