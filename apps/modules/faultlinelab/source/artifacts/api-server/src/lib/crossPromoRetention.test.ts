import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, pool, crossPromoClicksTable } from "@workspace/db";
import { eq, inArray, like } from "drizzle-orm";
import {
  CROSS_PROMO_RETENTION_DAYS,
  pruneCrossPromoClicks,
} from "./crossPromoRetention";

const TEST_PLACEMENT_PREFIX = "vitest-prune-";

async function insertClick(opts: {
  placementId: string;
  createdAt: Date;
}): Promise<string> {
  const id = randomUUID();
  await db.insert(crossPromoClicksTable).values({
    id,
    placementId: opts.placementId,
    targetProduct: "test-product",
    targetUrl: "https://example.com/test",
    route: "/test",
    userTier: "anonymous",
    userId: null,
    clerkId: null,
    createdAt: opts.createdAt,
  });
  return id;
}

async function cleanupTestClicks() {
  await db
    .delete(crossPromoClicksTable)
    .where(like(crossPromoClicksTable.placementId, TEST_PLACEMENT_PREFIX + "%"));
}

beforeEach(async () => {
  await cleanupTestClicks();
});

afterAll(async () => {
  await cleanupTestClicks();
  await pool.end();
});

const DAY_MS = 24 * 60 * 60 * 1000;

describe("pruneCrossPromoClicks (real DB)", () => {
  it("deletes only rows older than the retention window", async () => {
    const placementId = TEST_PLACEMENT_PREFIX + randomUUID();
    const now = Date.now();

    const veryOldId = await insertClick({
      placementId,
      createdAt: new Date(now - (CROSS_PROMO_RETENTION_DAYS + 30) * DAY_MS),
    });
    const justOverId = await insertClick({
      placementId,
      createdAt: new Date(now - (CROSS_PROMO_RETENTION_DAYS + 1) * DAY_MS),
    });
    const justUnderId = await insertClick({
      placementId,
      createdAt: new Date(now - (CROSS_PROMO_RETENTION_DAYS - 1) * DAY_MS),
    });
    const recentId = await insertClick({
      placementId,
      createdAt: new Date(now - 1 * DAY_MS),
    });

    // We assert on our own per-test inserted IDs (not the global deleted
    // count) because the real DB may contain unrelated rows from other
    // sources or prior runs that also fall outside the retention window.
    const deleted = await pruneCrossPromoClicks();
    expect(deleted).toBeGreaterThanOrEqual(2);

    const surviving = await db
      .select({ id: crossPromoClicksTable.id })
      .from(crossPromoClicksTable)
      .where(eq(crossPromoClicksTable.placementId, placementId));
    const survivingIds = surviving.map((r) => r.id).sort();
    expect(survivingIds).toEqual([justUnderId, recentId].sort());

    const stillPresentOld = await db
      .select({ id: crossPromoClicksTable.id })
      .from(crossPromoClicksTable)
      .where(inArray(crossPromoClicksTable.id, [veryOldId, justOverId]));
    expect(stillPresentOld).toHaveLength(0);
  });

  it("returns 0 and deletes nothing when all rows are within the retention window", async () => {
    const placementId = TEST_PLACEMENT_PREFIX + randomUUID();
    const now = Date.now();

    await insertClick({
      placementId,
      createdAt: new Date(now - 5 * DAY_MS),
    });
    await insertClick({
      placementId,
      createdAt: new Date(now - 60 * DAY_MS),
    });

    // Don't assert on the global deleted count — unrelated stale rows in
    // the shared test DB could be pruned too. Just assert our own
    // within-window rows survived.
    await pruneCrossPromoClicks();

    const remaining = await db
      .select()
      .from(crossPromoClicksTable)
      .where(eq(crossPromoClicksTable.placementId, placementId));
    expect(remaining).toHaveLength(2);
  });

  it("respects a custom retentionDays argument", async () => {
    const placementId = TEST_PLACEMENT_PREFIX + randomUUID();
    const now = Date.now();

    const tenDayId = await insertClick({
      placementId,
      createdAt: new Date(now - 10 * DAY_MS),
    });
    const oneDayId = await insertClick({
      placementId,
      createdAt: new Date(now - 1 * DAY_MS),
    });

    const deleted = await pruneCrossPromoClicks(7);
    expect(deleted).toBeGreaterThanOrEqual(1);

    const surviving = await db
      .select({ id: crossPromoClicksTable.id })
      .from(crossPromoClicksTable)
      .where(eq(crossPromoClicksTable.placementId, placementId));
    expect(surviving.map((r) => r.id)).toEqual([oneDayId]);
    expect(surviving.map((r) => r.id)).not.toContain(tenDayId);
  });
});
