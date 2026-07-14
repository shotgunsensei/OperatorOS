import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { like } from "drizzle-orm";

/**
 * Auth precedence harness for requireAuth.
 *
 * The middleware supports two auth modes — an HMAC-signed OperatorOS session
 * cookie set by /sso, and a Clerk session resolved via `getAuth`. When BOTH
 * are present we must deterministically pick the cookie identity. These tests
 * lock that contract in so future refactors of `resolveUser` can't silently
 * swap which side wins (which would be a session-confusion bug).
 */

const FAKE_CLERK_ID = "vitest-clerk-precedence-fake";

vi.mock("@clerk/express", () => ({
  getAuth: (req: Request) => {
    const cid = (req.headers["x-fake-clerk-id"] as string | undefined) ?? null;
    return cid ? { userId: cid, sessionClaims: { userId: cid } } : {};
  },
  clerkClient: {
    users: {
      getUser: async () => ({
        primaryEmailAddressId: null,
        emailAddresses: [],
        firstName: null,
        lastName: null,
        username: null,
        imageUrl: null,
      }),
    },
  },
}));

const TEST_PREFIX = "vitest-reqauth-";

async function importDeps() {
  const reqAuth = await import("./requireAuth");
  const sess = await import("../lib/sessionCookie");
  return { reqAuth, sess };
}

function buildApp(
  middleware: (req: Request, res: Response, next: NextFunction) => Promise<void> | void,
): Express {
  const app = express();
  app.use(cookieParser());
  app.get("/whoami", middleware, (req, res) => {
    const u = (req as any).appUser;
    res.json({ id: u?.id ?? null, clerkId: u?.clerkId ?? null, operatorIdentityId: u?.operatorIdentityId ?? null });
  });
  return app;
}

async function getJson(
  app: Express,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const http = await import("node:http");
  return await new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as any).port;
      http
        .get({ host: "127.0.0.1", port, path, headers }, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c as Buffer));
          res.on("end", () => {
            server.close();
            const raw = Buffer.concat(chunks).toString("utf8");
            let body: any = null;
            try {
              body = raw ? JSON.parse(raw) : null;
            } catch {
              body = raw;
            }
            resolve({ status: res.statusCode || 0, body });
          });
        })
        .on("error", reject);
    });
  });
}

beforeAll(() => {
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = "vitest-session-secret-must-be-long-enough-1234567890";
  }
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(usersTable).where(like(usersTable.operatorIdentityId, TEST_PREFIX + "%"));
  await db.delete(usersTable).where(like(usersTable.clerkId, TEST_PREFIX + "%"));
});

afterAll(async () => {
  await db.delete(usersTable).where(like(usersTable.operatorIdentityId, TEST_PREFIX + "%"));
  await db.delete(usersTable).where(like(usersTable.clerkId, TEST_PREFIX + "%"));
});

describe("requireAuth identity precedence", () => {
  it("prefers the OperatorOS cookie identity when a Clerk session is also present", async () => {
    const { reqAuth, sess } = await importDeps();

    const operatorUserId = randomUUID();
    const operatorIdentityId = TEST_PREFIX + randomUUID();
    await db.insert(usersTable).values({
      id: operatorUserId,
      operatorIdentityId,
      displayName: "Operator User",
    });

    const clerkId = TEST_PREFIX + "clerk-" + randomUUID();
    const cookieToken = sess.mintSessionToken(operatorUserId, "operatoros");

    const app = buildApp(reqAuth.requireAuth);
    const res = await getJson(app, "/whoami", {
      cookie: `${sess.SESSION_COOKIE_NAME}=${cookieToken}`,
      "x-fake-clerk-id": clerkId,
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(operatorUserId);
    expect(res.body.operatorIdentityId).toBe(operatorIdentityId);
    expect(res.body.clerkId).toBeNull();

    // The Clerk-side user row must NOT have been created — the cookie short-
    // circuits the resolver before ensureUserRow runs.
    const rows = await db.select().from(usersTable).where(like(usersTable.clerkId, TEST_PREFIX + "%"));
    expect(rows).toHaveLength(0);
  });

  it("falls back to Clerk when the cookie is forged / has a bad signature", async () => {
    const { reqAuth } = await importDeps();
    const { SESSION_COOKIE_NAME } = await import("../lib/sessionCookie");

    const clerkId = TEST_PREFIX + "clerk-" + randomUUID();
    const forgedCookie = "tampered-payload.not-a-real-signature";

    const app = buildApp(reqAuth.requireAuth);
    const res = await getJson(app, "/whoami", {
      cookie: `${SESSION_COOKIE_NAME}=${forgedCookie}`,
      "x-fake-clerk-id": clerkId,
    });

    expect(res.status).toBe(200);
    expect(res.body.clerkId).toBe(clerkId);
    expect(res.body.operatorIdentityId).toBeNull();
  });

  it("falls back to Clerk when the cookie is valid but points at a deleted user", async () => {
    const { reqAuth, sess } = await importDeps();

    const ghostUserId = randomUUID(); // never inserted
    const cookieToken = sess.mintSessionToken(ghostUserId, "operatoros");
    const clerkId = TEST_PREFIX + "clerk-" + randomUUID();

    const app = buildApp(reqAuth.requireAuth);
    const res = await getJson(app, "/whoami", {
      cookie: `${sess.SESSION_COOKIE_NAME}=${cookieToken}`,
      "x-fake-clerk-id": clerkId,
    });

    expect(res.status).toBe(200);
    expect(res.body.clerkId).toBe(clerkId);
    expect(res.body.operatorIdentityId).toBeNull();
  });
});
