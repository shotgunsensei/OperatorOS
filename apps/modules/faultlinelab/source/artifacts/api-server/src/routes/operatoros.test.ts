import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express, { type Express } from "express";
import { randomUUID } from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";
import operatorOsRouter from "./operatoros";

const SERVICE_TOKEN = "test-service-token-1234567890-abcd";
const PREFIX = "vitest-osync-";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", operatorOsRouter);
  return app;
}

async function post(
  app: Express,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const http = await import("node:http");
  const data = Buffer.from(JSON.stringify(body));
  return await new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as any).port;
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path: url,
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": String(data.length),
            ...headers,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c as Buffer));
          res.on("end", () => {
            server.close();
            const text = Buffer.concat(chunks).toString("utf8");
            let parsed: any = null;
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = text;
            }
            resolve({ status: res.statusCode || 0, body: parsed });
          });
        },
      );
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  });
}

beforeAll(() => {
  process.env.OPERATOROS_SERVICE_TOKEN = SERVICE_TOKEN;
  process.env.MODULE_SSO_SECRET = "x".repeat(32);
  process.env.OPERATOROS_BASE_URL = "https://operator.test";
  process.env.OPERATOROS_SSO_AUDIENCE = "faultlinelab";
  process.env.OPERATOROS_SSO_ENV = "test";
  process.env.OPERATOROS_API_URL = "https://operator.test/api";
});

beforeEach(async () => {
  await db.delete(usersTable).where(like(usersTable.operatorIdentityId, PREFIX + "%"));
});

afterAll(async () => {
  await db.delete(usersTable).where(like(usersTable.operatorIdentityId, PREFIX + "%"));
});

async function seedUser(opts: { id?: string; snapshot?: any } = {}) {
  const operatorIdentityId = PREFIX + randomUUID();
  const id = opts.id ?? randomUUID();
  await db.insert(usersTable).values({
    id,
    operatorIdentityId,
    email: `${operatorIdentityId}@test.local`,
    displayName: "Sync Test User",
    entitlementSnapshotJson: opts.snapshot ?? {
      accessLevel: "standard",
      moduleEnabled: true,
      moduleRole: "module_user",
      tenantRole: "member",
      planSlug: "free",
      subscriptionStatus: null,
      features: [],
      grantedProductIds: [],
      syncedAt: Date.now(),
    },
    localRole: "standard",
  });
  return { id, operatorIdentityId };
}

describe("POST /api/operatoros/entitlements/sync", () => {
  it("rejects when bearer token is missing", async () => {
    const res = await post(buildApp(), "/api/operatoros/entitlements/sync", {});
    expect(res.status).toBe(401);
  });

  it("rejects when bearer token is wrong", async () => {
    const res = await post(
      buildApp(),
      "/api/operatoros/entitlements/sync",
      { operatoros_user_id: "anything" },
      { authorization: "Bearer wrong-token-value-123456789" },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when operatoros_user_id is missing", async () => {
    const res = await post(
      buildApp(),
      "/api/operatoros/entitlements/sync",
      {},
      { authorization: `Bearer ${SERVICE_TOKEN}` },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown operatoros_user_id", async () => {
    const res = await post(
      buildApp(),
      "/api/operatoros/entitlements/sync",
      { operatoros_user_id: "no-such-user", access_level: "pro" },
      { authorization: `Bearer ${SERVICE_TOKEN}` },
    );
    expect(res.status).toBe(404);
  });

  it("upgrades a user to pro and recomputes localRole=admin", async () => {
    const { operatorIdentityId, id } = await seedUser();
    const res = await post(
      buildApp(),
      "/api/operatoros/entitlements/sync",
      {
        operatoros_user_id: operatorIdentityId,
        access_level: "pro",
        module_enabled: true,
        module_role: "module_admin",
        plan_slug: "pro-tenant",
        subscription_status: "active",
        granted_product_ids: ["pack-network-ops"],
        features: ["pro-analytics"],
      },
      { authorization: `Bearer ${SERVICE_TOKEN}` },
    );
    expect(res.status).toBe(200);
    expect(res.body.localRole).toBe("admin");
    expect(res.body.snapshot.accessLevel).toBe("pro");

    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    expect(row.localRole).toBe("admin");
    expect(row.operatorPlanSlug).toBe("pro-tenant");
    expect(row.entitlementSnapshotJson?.grantedProductIds).toContain(
      "pack-network-ops",
    );
    expect(row.lastEntitlementSyncAt).toBeTruthy();
  });

  it("disabling the module flips localRole to deny", async () => {
    const { operatorIdentityId, id } = await seedUser();
    const res = await post(
      buildApp(),
      "/api/operatoros/entitlements/sync",
      {
        operatoros_user_id: operatorIdentityId,
        module_enabled: false,
      },
      { authorization: `Bearer ${SERVICE_TOKEN}` },
    );
    expect(res.status).toBe(200);
    expect(res.body.localRole).toBe("deny");
    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    expect(row.localRole).toBe("deny");
    expect(row.entitlementSnapshotJson?.moduleEnabled).toBe(false);
  });
});
