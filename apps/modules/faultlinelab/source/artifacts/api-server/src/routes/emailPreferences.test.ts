import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { db, pool, usersTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";

// Mock requireAuth so we can plant a synthetic `appUser` per test without
// wiring up Clerk or the SSO cookie path. The unsubscribe handler doesn't
// use requireAuth, so the public routes still exercise the real handler.
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const stub = (globalThis as any).__testAppUser;
    if (stub) {
      (req as any).appUser = stub;
      (req as any).userId = stub.id;
    }
    next();
  },
  optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import emailPreferencesRouter from "./emailPreferences";

const USER_PREFIX = "u_emailPrefs_";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", emailPreferencesRouter);
  return app;
}

async function request(
  app: Express,
  method: "GET" | "POST" | "PUT",
  url: string,
  body?: unknown,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const http = await import("node:http");
  return await new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as any).port;
      const data = body !== undefined ? JSON.stringify(body) : undefined;
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path: url,
          method,
          headers: data
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data),
              }
            : undefined,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c as Buffer));
          res.on("end", () => {
            server.close();
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              headers[k] = Array.isArray(v) ? v.join(",") : (v as string);
            }
            resolve({
              status: res.statusCode || 0,
              headers,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        },
      );
      req.on("error", reject);
      if (data) req.write(data);
      req.end();
    });
  });
}

async function cleanup() {
  await db.delete(usersTable).where(like(usersTable.id, USER_PREFIX + "%"));
}

beforeEach(async () => {
  await cleanup();
  (globalThis as any).__testAppUser = null;
});
afterAll(async () => {
  await cleanup();
  await pool.end();
});

async function makeUser(overrides: Partial<typeof usersTable.$inferInsert> = {}) {
  const id = USER_PREFIX + randomUUID();
  const row = {
    id,
    email: `${id}@example.com`,
    renewalEmailsEnabled: true,
    ...overrides,
  };
  await db.insert(usersTable).values(row);
  const fresh = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  return fresh[0];
}

describe("GET /api/account/email-preferences", () => {
  it("returns the current toggle value for the signed-in user", async () => {
    const user = await makeUser({ renewalEmailsEnabled: false });
    (globalThis as any).__testAppUser = user;
    const app = buildApp();
    const res = await request(app, "GET", "/api/account/email-preferences");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ renewalEmailsEnabled: false });
  });
});

describe("PUT /api/account/email-preferences", () => {
  it("flips the toggle and persists", async () => {
    const user = await makeUser({ renewalEmailsEnabled: true });
    (globalThis as any).__testAppUser = user;
    const app = buildApp();
    const res = await request(app, "PUT", "/api/account/email-preferences", {
      renewalEmailsEnabled: false,
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ renewalEmailsEnabled: false });
    const fresh = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    expect(fresh[0].renewalEmailsEnabled).toBe(false);
  });

  it("rejects non-boolean payloads with 400", async () => {
    const user = await makeUser();
    (globalThis as any).__testAppUser = user;
    const app = buildApp();
    const res = await request(app, "PUT", "/api/account/email-preferences", {
      renewalEmailsEnabled: "off",
    });
    expect(res.status).toBe(400);
    const fresh = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    expect(fresh[0].renewalEmailsEnabled).toBe(true);
  });
});

describe("GET /api/email-preferences/unsubscribe", () => {
  it("returns 400 when the token is missing", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/api/email-preferences/unsubscribe");
    expect(res.status).toBe(400);
    expect(res.body).toContain("invalid");
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("returns 404 and does not mutate any row for an unknown token", async () => {
    const user = await makeUser({
      renewalEmailsEnabled: true,
      unsubscribeToken: "real-token-" + randomUUID(),
    });
    const app = buildApp();
    const res = await request(
      app,
      "GET",
      "/api/email-preferences/unsubscribe?token=does-not-exist",
    );
    expect(res.status).toBe(404);
    const fresh = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    expect(fresh[0].renewalEmailsEnabled).toBe(true);
  });

  it("flips the toggle for a valid token and is idempotent on re-hit", async () => {
    const token = "valid-tok-" + randomUUID();
    const user = await makeUser({
      renewalEmailsEnabled: true,
      unsubscribeToken: token,
    });
    const app = buildApp();
    const res1 = await request(
      app,
      "GET",
      `/api/email-preferences/unsubscribe?token=${encodeURIComponent(token)}`,
    );
    expect(res1.status).toBe(200);
    expect(res1.body).toContain("unsubscribed");
    const after1 = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    expect(after1[0].renewalEmailsEnabled).toBe(false);

    const res2 = await request(
      app,
      "GET",
      `/api/email-preferences/unsubscribe?token=${encodeURIComponent(token)}`,
    );
    expect(res2.status).toBe(200);
    const after2 = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    expect(after2[0].renewalEmailsEnabled).toBe(false);
  });

  it("accepts the same token via POST (RFC 8058 one-click shape)", async () => {
    const token = "valid-post-" + randomUUID();
    const user = await makeUser({
      renewalEmailsEnabled: true,
      unsubscribeToken: token,
    });
    const app = buildApp();
    const res = await request(app, "POST", "/api/email-preferences/unsubscribe", {
      token,
    });
    expect(res.status).toBe(200);
    const after = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    expect(after[0].renewalEmailsEnabled).toBe(false);
  });
});
