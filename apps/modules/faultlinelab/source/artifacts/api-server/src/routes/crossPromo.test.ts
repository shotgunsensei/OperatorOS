import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import { db, pool, usersTable, crossPromoClicksTable } from "@workspace/db";
import { like, sql } from "drizzle-orm";
import crossPromoRouter from "./crossPromo";
import { SESSION_COOKIE_NAME, mintSessionToken } from "../lib/sessionCookie";

/**
 * Vitest harness for the admin CSV export endpoint
 * (`GET /admin/cross-promo/clicks.csv`). Auth is exercised via the real
 * `fl_session` cookie path: we insert a test admin user and a test
 * non-admin user, mint signed cookies for each, and let `requireAuth` +
 * `requireAdmin` run unchanged.
 *
 * Rows are tagged with per-test `placementId` prefixes so we can assert on
 * just our inserts without being affected by unrelated DB contents, and we
 * clean up by prefix on teardown.
 */

const TEST_USER_PREFIX = "vitest-csv-user-";
const TEST_ROW_PREFIX = "vitest-csv-row-";
const TEST_CAP_PREFIX = "vitest-csv-cap-";

let ADMIN_ID: string;
let ADMIN_COOKIE: string;
let USER_ID: string;
let USER_COOKIE: string;

function buildApp(): Express {
  const app = express();
  app.use(cookieParser());
  app.use("/", crossPromoRouter);
  return app;
}

async function httpGet(
  app: Express,
  url: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const http = await import("node:http");
  return await new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = (server.address() as any).port;
      http
        .get({ host: "127.0.0.1", port, path: url, headers }, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c as Buffer));
          res.on("end", () => {
            server.close();
            const hdrs: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              hdrs[k] = Array.isArray(v) ? v.join(",") : (v as string);
            }
            resolve({
              status: res.statusCode || 0,
              headers: hdrs,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        })
        .on("error", reject);
    });
  });
}

function cookieHeader(token: string): Record<string, string> {
  return { Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` };
}

async function cleanupTestRows(): Promise<void> {
  await db
    .delete(crossPromoClicksTable)
    .where(like(crossPromoClicksTable.placementId, "vitest-csv-%"));
}

async function cleanupTestUsers(): Promise<void> {
  await db.delete(usersTable).where(like(usersTable.id, TEST_USER_PREFIX + "%"));
}

beforeAll(async () => {
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = "vitest-cross-promo-csv-secret-1234567890";
  }

  await cleanupTestRows();
  await cleanupTestUsers();

  ADMIN_ID = TEST_USER_PREFIX + randomUUID();
  USER_ID = TEST_USER_PREFIX + randomUUID();

  await db.insert(usersTable).values({
    id: ADMIN_ID,
    clerkId: ADMIN_ID,
    isAdmin: true,
    isSuperAdmin: false,
  });
  await db.insert(usersTable).values({
    id: USER_ID,
    clerkId: USER_ID,
    isAdmin: false,
    isSuperAdmin: false,
  });

  ADMIN_COOKIE = mintSessionToken(ADMIN_ID);
  USER_COOKIE = mintSessionToken(USER_ID);
});

beforeEach(async () => {
  await cleanupTestRows();
});

afterAll(async () => {
  await cleanupTestRows();
  await cleanupTestUsers();
  await pool.end();
});

const DAY_MS = 24 * 60 * 60 * 1000;

async function insertRow(opts: {
  placementId: string;
  createdAt: Date;
  targetProduct?: string;
  targetUrl?: string;
  route?: string | null;
  userTier?: "anonymous" | "free" | "pro";
}): Promise<void> {
  await db.insert(crossPromoClicksTable).values({
    id: randomUUID(),
    placementId: opts.placementId,
    targetProduct: opts.targetProduct ?? "test-product",
    targetUrl: opts.targetUrl ?? "https://example.com/test",
    route: opts.route ?? "/test",
    userTier: opts.userTier ?? "anonymous",
    userId: null,
    clerkId: null,
    createdAt: opts.createdAt,
  });
}

function parseCsv(body: string): { header: string; rows: string[] } {
  const lines = body.split("\n");
  // The endpoint always emits a trailing newline; drop the empty final entry.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return { header: lines[0] ?? "", rows: lines.slice(1) };
}

function rowsForPrefix(rows: string[], prefix: string): string[] {
  // placement_id is the 2nd CSV column; a prefix match on the line is
  // sufficient because our prefixes never contain commas or quotes.
  return rows.filter((line) => line.includes(`,${prefix}`));
}

describe("GET /admin/cross-promo/clicks.csv", () => {
  it("returns 403 for non-admin users", async () => {
    const res = await httpGet(
      buildApp(),
      "/admin/cross-promo/clicks.csv?window=7d",
      cookieHeader(USER_COOKIE),
    );
    expect(res.status).toBe(403);
    expect(res.body).toContain("Forbidden");
  });

  it("returns 400 for invalid window param", async () => {
    const res = await httpGet(
      buildApp(),
      "/admin/cross-promo/clicks.csv?window=42d",
      cookieHeader(ADMIN_COOKIE),
    );
    expect(res.status).toBe(400);
    expect(res.body).toContain("Invalid window");
  });

  it("returns CSV with correct headers and matching MIME type", async () => {
    const prefix = TEST_ROW_PREFIX + randomUUID();
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 1 * DAY_MS) });

    const res = await httpGet(
      buildApp(),
      "/admin/cross-promo/clicks.csv?window=7d",
      cookieHeader(ADMIN_COOKIE),
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(res.headers["content-disposition"]).toMatch(/cross-promo-clicks-7d-.*\.csv/);

    const { header } = parseCsv(res.body);
    expect(header).toBe("created_at,placement_id,target_product,target_url,route,user_tier");
  });

  it("defaults to a 7d window when window param is omitted", async () => {
    const prefix = TEST_ROW_PREFIX + randomUUID();
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 1 * DAY_MS) });
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 10 * DAY_MS) });

    const res = await httpGet(
      buildApp(),
      "/admin/cross-promo/clicks.csv",
      cookieHeader(ADMIN_COOKIE),
    );
    expect(res.status).toBe(200);
    const { rows } = parseCsv(res.body);
    expect(rowsForPrefix(rows, prefix)).toHaveLength(1);
  });

  it("7d window excludes rows older than 7 days", async () => {
    const prefix = TEST_ROW_PREFIX + randomUUID();
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 1 * DAY_MS) });
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 8 * DAY_MS) });
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 35 * DAY_MS) });
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 100 * DAY_MS) });

    const res = await httpGet(
      buildApp(),
      "/admin/cross-promo/clicks.csv?window=7d",
      cookieHeader(ADMIN_COOKIE),
    );
    expect(res.status).toBe(200);
    const { rows } = parseCsv(res.body);
    const ours = rowsForPrefix(rows, prefix);
    expect(ours).toHaveLength(1);
  });

  it("30d window includes rows up to 30 days old but not older", async () => {
    const prefix = TEST_ROW_PREFIX + randomUUID();
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 1 * DAY_MS) });
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 8 * DAY_MS) });
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 35 * DAY_MS) });
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 100 * DAY_MS) });

    const res = await httpGet(
      buildApp(),
      "/admin/cross-promo/clicks.csv?window=30d",
      cookieHeader(ADMIN_COOKIE),
    );
    expect(res.status).toBe(200);
    const { rows } = parseCsv(res.body);
    const ours = rowsForPrefix(rows, prefix);
    expect(ours).toHaveLength(2);
  });

  it("90d window includes rows up to 90 days old but not older", async () => {
    const prefix = TEST_ROW_PREFIX + randomUUID();
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 1 * DAY_MS) });
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 8 * DAY_MS) });
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 35 * DAY_MS) });
    await insertRow({ placementId: prefix, createdAt: new Date(Date.now() - 100 * DAY_MS) });

    const res = await httpGet(
      buildApp(),
      "/admin/cross-promo/clicks.csv?window=90d",
      cookieHeader(ADMIN_COOKIE),
    );
    expect(res.status).toBe(200);
    const { rows } = parseCsv(res.body);
    const ours = rowsForPrefix(rows, prefix);
    expect(ours).toHaveLength(3);
  });

  it("escapes values containing commas, quotes, and newlines", async () => {
    const prefix = TEST_ROW_PREFIX + randomUUID();
    await insertRow({
      placementId: prefix,
      createdAt: new Date(Date.now() - 1 * DAY_MS),
      targetProduct: 'has,comma',
      targetUrl: 'has"quote',
      route: "has\nnewline",
    });

    const res = await httpGet(
      buildApp(),
      "/admin/cross-promo/clicks.csv?window=7d",
      cookieHeader(ADMIN_COOKIE),
    );
    expect(res.status).toBe(200);
    // Comma: wrapped in quotes.
    expect(res.body).toContain('"has,comma"');
    // Quote: wrapped in quotes with internal quote doubled.
    expect(res.body).toContain('"has""quote"');
    // Newline: wrapped in quotes preserving the literal newline.
    expect(res.body).toContain('"has\nnewline"');
  });

  it.each([
    { label: "equals", char: "=" },
    { label: "plus", char: "+" },
    { label: "minus", char: "-" },
    { label: "at-sign", char: "@" },
    { label: "tab", char: "\t" },
    { label: "carriage return", char: "\r" },
  ])(
    "prefixes formula-trigger value starting with $label with a single quote",
    async ({ char }) => {
      const prefix = TEST_ROW_PREFIX + randomUUID();
      await insertRow({
        placementId: prefix,
        createdAt: new Date(Date.now() - 1 * DAY_MS),
        targetProduct: `${char}cmd|'/c calc'!A1`,
        targetUrl: `${char}https://evil.example.com`,
        route: `${char}/pwned`,
      });

      const res = await httpGet(
        buildApp(),
        "/admin/cross-promo/clicks.csv?window=7d",
        cookieHeader(ADMIN_COOKIE),
      );
      expect(res.status).toBe(200);

      // Each neutralized value begins with a single-quote prefix. We don't
      // care whether csvEscape additionally wraps the cell in double quotes
      // (which happens for CR but not for =/+/-/@/tab here, since those
      // values don't contain comma/quote/newline/CR after the prefix). What
      // matters is that the literal `'<trigger>` sequence appears, which is
      // what makes Excel/Sheets treat the cell as plain text.
      expect(res.body).toContain(`'${char}cmd|`);
      expect(res.body).toContain(`'${char}https://evil.example.com`);
      expect(res.body).toContain(`'${char}/pwned`);
    },
  );

  it("leaves benign values starting with a letter untouched", async () => {
    const prefix = TEST_ROW_PREFIX + randomUUID();
    await insertRow({
      placementId: prefix,
      createdAt: new Date(Date.now() - 1 * DAY_MS),
      targetProduct: "safe-product",
      targetUrl: "https://example.com/safe",
      route: "/safe",
    });

    const res = await httpGet(
      buildApp(),
      "/admin/cross-promo/clicks.csv?window=7d",
      cookieHeader(ADMIN_COOKIE),
    );
    expect(res.status).toBe(200);
    const { rows } = parseCsv(res.body);
    const ours = rowsForPrefix(rows, prefix);
    expect(ours).toHaveLength(1);
    const line = ours[0]!;
    // No single-quote neutralization should appear around our values.
    expect(line).toContain(",safe-product,");
    expect(line).toContain(",https://example.com/safe,");
    expect(line).toContain(",/safe,");
    expect(line).not.toContain("'safe-product");
    expect(line).not.toContain("'https://example.com/safe");
    expect(line).not.toContain("'/safe");
  });

  it("returns 413 with a friendly message when row count exceeds the 10k cap", async () => {
    const prefix = TEST_CAP_PREFIX + randomUUID();
    // Use a single SQL statement so we don't pay 10k round trips. Times
    // are staggered into the past so they all fall within a 7d window
    // (one row per second going back ~3 hours covers 10_001 rows easily).
    await db.execute(sql`
      INSERT INTO cross_promo_clicks
        (id, placement_id, target_product, target_url, route, user_tier, created_at)
      SELECT
        gen_random_uuid()::text,
        ${prefix},
        'cap-product',
        'https://example.com/cap',
        '/cap',
        'anonymous',
        NOW() - (gs * interval '1 second')
      FROM generate_series(1, 10001) gs
    `);

    const res = await httpGet(
      buildApp(),
      "/admin/cross-promo/clicks.csv?window=7d",
      cookieHeader(ADMIN_COOKIE),
    );
    expect(res.status).toBe(413);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    const payload = JSON.parse(res.body);
    expect(payload.cap).toBe(10000);
    expect(payload.error).toMatch(/Too many rows/);
    expect(payload.error).toMatch(/Narrow the time window/);
  });
});
