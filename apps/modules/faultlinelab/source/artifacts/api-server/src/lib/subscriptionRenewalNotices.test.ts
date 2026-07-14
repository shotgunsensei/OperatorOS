import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, pool } from "@workspace/db";
import { subscriptionRenewalNoticesTable, usersTable } from "@workspace/db/schema";
import { and, eq, like, sql } from "drizzle-orm";
import {
  claimNoticeSlot,
  decideNotices,
  listSubscriptionCandidates,
  releaseNoticeSlot,
  renderNoticeEmail,
  runRenewalNoticeScan,
  type SubscriptionCandidate,
} from "./subscriptionRenewalNotices";

const TEST_PREFIX = "sub_vitest_";

const STRIPE_PREFIX = "sub_proFilterTest_";
const USER_PREFIX = "u_proFilterTest_";

async function cleanup() {
  await db
    .delete(subscriptionRenewalNoticesTable)
    .where(like(subscriptionRenewalNoticesTable.subscriptionId, TEST_PREFIX + "%"));
  await db.execute(
    sql`DELETE FROM stripe.subscriptions WHERE id LIKE ${STRIPE_PREFIX + "%"}`,
  );
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${USER_PREFIX + "%"}`);
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await pool.end();
});

const DAY_S = 24 * 60 * 60;

function candidate(overrides: Partial<SubscriptionCandidate> = {}): SubscriptionCandidate {
  return {
    subscriptionId: TEST_PREFIX + randomUUID(),
    userId: "user_" + randomUUID(),
    email: "user@example.com",
    customerId: "cus_test",
    currentPeriodEnd: Math.floor(Date.now() / 1000) + 4 * DAY_S,
    cancelAtPeriodEnd: false,
    unitAmount: 899,
    currency: "usd",
    interval: "month",
    unsubscribeToken: "tok_" + randomUUID(),
    ...overrides,
  };
}

describe("decideNotices", () => {
  const now = Date.UTC(2026, 4, 1, 12, 0, 0);

  it("returns renewal-t5 when an auto-renewing sub is within 5 days", () => {
    const sub = candidate({
      cancelAtPeriodEnd: false,
      currentPeriodEnd: Math.floor(now / 1000) + 3 * DAY_S,
    });
    expect(decideNotices(sub, { now })).toEqual(["renewal-t5"]);
  });

  it("returns nothing for an auto-renewing sub more than 5 days out", () => {
    const sub = candidate({
      cancelAtPeriodEnd: false,
      currentPeriodEnd: Math.floor(now / 1000) + 10 * DAY_S,
    });
    expect(decideNotices(sub, { now })).toEqual([]);
  });

  it("returns only cancel-t3 in the 1–3 day window for cancel_at_period_end", () => {
    const sub = candidate({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: Math.floor(now / 1000) + 2 * DAY_S,
    });
    expect(decideNotices(sub, { now })).toEqual(["cancel-t3"]);
  });

  it("returns both cancel-t3 and cancel-t1 inside the final day", () => {
    const sub = candidate({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: Math.floor(now / 1000) + 12 * 60 * 60,
    });
    expect(decideNotices(sub, { now })).toEqual(["cancel-t3", "cancel-t1"]);
  });

  it("returns nothing once the period has already ended", () => {
    const sub = candidate({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: Math.floor(now / 1000) - 60,
    });
    expect(decideNotices(sub, { now })).toEqual([]);
  });

  it("does not send a renewal heads-up when cancel_at_period_end is set", () => {
    const sub = candidate({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: Math.floor(now / 1000) + 4 * DAY_S,
    });
    expect(decideNotices(sub, { now })).toEqual([]);
  });
});

describe("renderNoticeEmail", () => {
  const sub = candidate({
    currentPeriodEnd: Math.floor(Date.UTC(2026, 4, 20) / 1000),
    unitAmount: 7900,
    interval: "year",
  });

  it("includes the renewal date, amount, and manage link for renewal-t5", () => {
    const out = renderNoticeEmail("renewal-t5", sub, "https://portal.example/abc");
    expect(out.subject).toContain("May 20, 2026");
    expect(out.text).toContain("$79.00");
    expect(out.text).toContain("annually");
    expect(out.text).toContain("https://portal.example/abc");
    expect(out.html).toContain("Manage subscription");
  });

  it("includes the unsubscribe link in both html and text when provided", () => {
    const unsub = "https://example.test/api/email-preferences/unsubscribe?token=abc";
    const out = renderNoticeEmail("renewal-t5", sub, "https://portal.example/abc", unsub);
    expect(out.text).toContain(unsub);
    expect(out.html).toContain(unsub);
    expect(out.html).toContain("Unsubscribe");
    const cancel = renderNoticeEmail("cancel-t1", sub, "https://portal.example/abc", unsub);
    expect(cancel.text).toContain(unsub);
    expect(cancel.html).toContain(unsub);
  });

  it("omits the unsubscribe footer when no link is passed", () => {
    const out = renderNoticeEmail("renewal-t5", sub, "https://portal.example/abc");
    expect(out.html).not.toContain("Unsubscribe");
    expect(out.text).not.toContain("Unsubscribe");
  });

  it("phrases cancel-t1 as 'tomorrow' but also includes the explicit date, amount, and portal link", () => {
    const out = renderNoticeEmail("cancel-t1", sub, "https://portal.example/xyz");
    expect(out.subject).toContain("tomorrow");
    expect(out.subject).toContain("May 20, 2026");
    expect(out.text).toContain("tomorrow");
    expect(out.text).toContain("May 20, 2026");
    expect(out.text).toContain("$79.00");
    expect(out.text).toContain("annually");
    expect(out.html).toContain("Resume subscription");
    expect(out.html).toContain("https://portal.example/xyz");
    expect(out.html).toContain("$79.00");
  });

  it("includes the explicit period-end date and amount on cancel-t3", () => {
    const out = renderNoticeEmail("cancel-t3", sub, "https://portal.example/3day");
    expect(out.subject).toContain("May 20, 2026");
    expect(out.text).toContain("Access ends: May 20, 2026");
    expect(out.text).toContain("$79.00");
    expect(out.text).toContain("https://portal.example/3day");
    expect(out.html).toContain("Access ends:");
    expect(out.html).toContain("May 20, 2026");
  });
});

describe("claimNoticeSlot (real DB)", () => {
  it("inserts on first call and is idempotent on the second", async () => {
    const subscriptionId = TEST_PREFIX + randomUUID();
    const periodEnd = Math.floor(Date.now() / 1000) + DAY_S;

    const first = await claimNoticeSlot({
      subscriptionId,
      periodEnd,
      kind: "renewal-t5",
      userId: "u_1",
      email: "a@b.com",
    });
    const second = await claimNoticeSlot({
      subscriptionId,
      periodEnd,
      kind: "renewal-t5",
      userId: "u_1",
      email: "a@b.com",
    });

    expect(first).toBe(true);
    expect(second).toBe(false);

    const rows = await db
      .select()
      .from(subscriptionRenewalNoticesTable)
      .where(
        and(
          eq(subscriptionRenewalNoticesTable.subscriptionId, subscriptionId),
          eq(subscriptionRenewalNoticesTable.kind, "renewal-t5"),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("treats a new period_end as a fresh notice", async () => {
    const subscriptionId = TEST_PREFIX + randomUUID();
    const periodEndA = 1_700_000_000;
    const periodEndB = periodEndA + 30 * DAY_S;

    expect(
      await claimNoticeSlot({
        subscriptionId,
        periodEnd: periodEndA,
        kind: "renewal-t5",
        userId: "u",
        email: "x@y.com",
      }),
    ).toBe(true);
    expect(
      await claimNoticeSlot({
        subscriptionId,
        periodEnd: periodEndB,
        kind: "renewal-t5",
        userId: "u",
        email: "x@y.com",
      }),
    ).toBe(true);
  });

  it("releases the slot on demand so retries can re-send", async () => {
    const subscriptionId = TEST_PREFIX + randomUUID();
    const periodEnd = 1_700_000_000;
    await claimNoticeSlot({
      subscriptionId,
      periodEnd,
      kind: "cancel-t1",
      userId: "u",
      email: "x@y.com",
    });
    await releaseNoticeSlot({ subscriptionId, periodEnd, kind: "cancel-t1" });
    const claimedAgain = await claimNoticeSlot({
      subscriptionId,
      periodEnd,
      kind: "cancel-t1",
      userId: "u",
      email: "x@y.com",
    });
    expect(claimedAgain).toBe(true);
  });
});

describe("listSubscriptionCandidates (real DB, Pro filter)", () => {
  async function insertSubscriptionRow(opts: {
    id: string;
    status: "active" | "trialing" | "canceled";
    currentPeriodEnd: number;
    cancelAtPeriodEnd?: boolean;
    catalogProductId?: string;
  }) {
    const raw = {
      id: opts.id,
      object: "subscription",
      status: opts.status,
      current_period_end: opts.currentPeriodEnd,
      cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
      customer: "cus_x",
      items: {
        data: [
          { price: { id: "price_x", product: "prod_x" } },
        ],
      },
      metadata: opts.catalogProductId
        ? { catalogProductId: opts.catalogProductId }
        : {},
    };
    const accountRow = await db.execute(
      sql`SELECT id FROM stripe.accounts LIMIT 1`,
    );
    const accountId = String(accountRow.rows[0]?.id ?? "");
    if (!accountId) {
      throw new Error(
        "stripe.accounts is empty; api-server must boot at least once before this test can run.",
      );
    }
    await db.execute(sql`
      INSERT INTO stripe.subscriptions (_raw_data, _account_id)
      VALUES (${JSON.stringify(raw)}::jsonb, ${accountId})
    `);
  }

  it("excludes Pro subscriptions for users who have opted out of renewal emails", async () => {
    const optedOutId = USER_PREFIX + randomUUID();
    const optedInId = USER_PREFIX + randomUUID();
    const optedOutSubId = STRIPE_PREFIX + randomUUID();
    const optedInSubId = STRIPE_PREFIX + randomUUID();
    const periodEnd = Math.floor(Date.now() / 1000) + 4 * DAY_S;

    await db.insert(usersTable).values({
      id: optedOutId,
      email: "no-thanks@example.com",
      stripeSubscriptionId: optedOutSubId,
      renewalEmailsEnabled: false,
    });
    await db.insert(usersTable).values({
      id: optedInId,
      email: "yes-please@example.com",
      stripeSubscriptionId: optedInSubId,
      renewalEmailsEnabled: true,
    });

    await insertSubscriptionRow({
      id: optedOutSubId,
      status: "active",
      currentPeriodEnd: periodEnd,
      catalogProductId: "pro-subscription",
    });
    await insertSubscriptionRow({
      id: optedInSubId,
      status: "active",
      currentPeriodEnd: periodEnd,
      catalogProductId: "pro-subscription",
    });

    const candidates = await listSubscriptionCandidates();
    const ids = candidates.map((c) => c.subscriptionId);
    expect(ids).toContain(optedInSubId);
    expect(ids).not.toContain(optedOutSubId);
  });

  it("includes Pro subscriptions and excludes non-Pro subscriptions", async () => {
    const proUserId = USER_PREFIX + randomUUID();
    const otherUserId = USER_PREFIX + randomUUID();
    const proSubId = STRIPE_PREFIX + randomUUID();
    const packSubId = STRIPE_PREFIX + randomUUID();
    const canceledProId = STRIPE_PREFIX + randomUUID();
    const periodEnd = Math.floor(Date.now() / 1000) + 4 * DAY_S;

    await db.insert(usersTable).values({
      id: proUserId,
      email: "pro@example.com",
      stripeSubscriptionId: proSubId,
    });
    await db.insert(usersTable).values({
      id: otherUserId,
      email: "other@example.com",
      stripeSubscriptionId: packSubId,
    });

    await insertSubscriptionRow({
      id: proSubId,
      status: "active",
      currentPeriodEnd: periodEnd,
      catalogProductId: "pro-subscription",
    });
    await insertSubscriptionRow({
      id: packSubId,
      status: "active",
      currentPeriodEnd: periodEnd,
      catalogProductId: "pack-network-ops", // not Pro
    });
    await insertSubscriptionRow({
      id: canceledProId,
      status: "canceled",
      currentPeriodEnd: periodEnd,
      catalogProductId: "pro-subscription",
    });

    const candidates = await listSubscriptionCandidates();
    const ids = candidates.map((c) => c.subscriptionId);
    expect(ids).toContain(proSubId);
    expect(ids).not.toContain(packSubId);
    expect(ids).not.toContain(canceledProId);
  });
});

describe("runRenewalNoticeScan (with injected deps)", () => {
  it("sends each due notice exactly once across repeated runs", async () => {
    const sub = candidate({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    });
    const calls: Array<{ to: string; subject: string }> = [];
    const send = async (input: { to: string; subject: string }) => {
      calls.push({ to: input.to, subject: input.subject });
      return { delivered: true };
    };

    const r1 = await runRenewalNoticeScan({
      listCandidates: async () => [sub],
      buildManageUrl: async () => "https://portal.example/test",
      send,
    });
    expect(r1.sent).toBe(2); // cancel-t3 + cancel-t1
    expect(calls).toHaveLength(2);

    const r2 = await runRenewalNoticeScan({
      listCandidates: async () => [sub],
      buildManageUrl: async () => "https://portal.example/test",
      send,
    });
    expect(r2.sent).toBe(0);
    expect(r2.skippedDuplicate).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it("releases the slot when delivery fails so the next scan retries", async () => {
    const sub = candidate({
      cancelAtPeriodEnd: false,
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 2 * DAY_S,
    });
    let attempt = 0;
    const send = async () => {
      attempt += 1;
      if (attempt === 1) return { delivered: false, reason: "no-api-key" };
      return { delivered: true };
    };

    const r1 = await runRenewalNoticeScan({
      listCandidates: async () => [sub],
      buildManageUrl: async () => "https://portal.example/test",
      send,
    });
    expect(r1.sent).toBe(0);

    const r2 = await runRenewalNoticeScan({
      listCandidates: async () => [sub],
      buildManageUrl: async () => "https://portal.example/test",
      send,
    });
    expect(r2.sent).toBe(1);
  });
});
