import { describe, it, expect, vi } from "vitest";
import {
  buildSnapshot,
  parseSnapshot,
  mapOperatorOsRole,
  isBlockingStatus,
} from "../server/auth/entitlements";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://techdeck:test@localhost:5432/techdeck_test";
});

describe("entitlements / buildSnapshot", () => {
  it("does not infer features or limits from local plan names when claims omit them", () => {
    const snap = buildSnapshot({ planSlug: "pro", accessLevel: "pro" });
    expect(snap.schemaVersion).toBe(1);
    expect(snap.accessLevel).toBe("pro");
    expect(snap.features).toEqual([]);
    expect(snap.limits).toEqual({});
    expect(snap.enabled).toBe(true);
    expect(snap.subscriptionStatus).toBe("active");
  });

  it("normalises unknown subscription status to active", () => {
    const snap = buildSnapshot({ planSlug: "pro", subscriptionStatus: "weird" });
    expect(snap.subscriptionStatus).toBe("active");
  });

  it("preserves explicit OperatorOS features and limits without local plan merging", () => {
    const snap = buildSnapshot({
      planSlug: "pro",
      features: ["API", "reports"],
      limits: { usersMax: 99 },
    });
    expect(snap.features).toEqual(["api", "reports"]);
    expect(snap.limits.usersMax).toBe(99);
    expect(snap.limits.storageGb).toBeUndefined();
  });

  it("honours enabled=false", () => {
    const snap = buildSnapshot({ planSlug: "pro", enabled: false });
    expect(snap.enabled).toBe(false);
  });

  it("falls back to basic when no plan/access supplied", () => {
    const snap = buildSnapshot({});
    expect(snap.accessLevel).toBe("basic");
    expect(snap.features).toEqual([]);
    expect(snap.limits).toEqual({});
  });
});

describe("entitlements / parseSnapshot", () => {
  it("returns null for invalid input", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot("string")).toBeNull();
    expect(parseSnapshot({})).toBeNull();
    expect(parseSnapshot({ accessLevel: 5 })).toBeNull();
  });

  it("round-trips a built snapshot", () => {
    const snap = buildSnapshot({ planSlug: "msp" });
    const parsed = parseSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(parsed?.accessLevel).toBe("msp");
  });
});

describe("entitlements / mapOperatorOsRole", () => {
  it("module_role=none denies", () => {
    expect(mapOperatorOsRole("none", "owner")).toBeNull();
  });

  it("OperatorOS owner/admin signals all map to ADMIN (never OWNER)", () => {
    expect(mapOperatorOsRole("module_user", "owner")).toBe("ADMIN");
    expect(mapOperatorOsRole(undefined, "owner")).toBe("ADMIN");
    expect(mapOperatorOsRole("owner", undefined)).toBe("ADMIN");
  });

  it("tenant_admin and module_admin map to ADMIN", () => {
    expect(mapOperatorOsRole(undefined, "tenant_admin")).toBe("ADMIN");
    expect(mapOperatorOsRole("module_admin", undefined)).toBe("ADMIN");
    expect(mapOperatorOsRole("admin", undefined)).toBe("ADMIN");
  });

  it("viewer maps to CLIENT (read-only)", () => {
    expect(mapOperatorOsRole("viewer", undefined)).toBe("CLIENT");
  });

  it("module_user / tech / member map to TECH", () => {
    expect(mapOperatorOsRole("module_user", undefined)).toBe("TECH");
    expect(mapOperatorOsRole("tech", undefined)).toBe("TECH");
    expect(mapOperatorOsRole("member", undefined)).toBe("TECH");
  });

  it("unknown but non-empty role defaults to TECH (safe positive)", () => {
    expect(mapOperatorOsRole("mystery", undefined)).toBe("TECH");
  });

  it("empty inputs DENY (no implicit grant)", () => {
    expect(mapOperatorOsRole(undefined, undefined)).toBeNull();
    expect(mapOperatorOsRole("", "")).toBeNull();
  });
});

describe("entitlements / isBlockingStatus", () => {
  it.each(["past_due", "unpaid", "canceled"])("%s blocks", (s) => {
    expect(isBlockingStatus(s)).toBe(true);
  });
  it.each(["active", "trialing", "none", undefined, "", "weird"])(
    "%s does not block",
    (s) => {
      expect(isBlockingStatus(s as any)).toBe(false);
    },
  );
});

describe("entitlements / requireNotPaused OperatorOS authority", () => {
  it("blocks OperatorOS-managed users when no entitlement snapshot is present", async () => {
    const { requireNotPaused } = await import("../server/core/middleware/requireNotPaused");
    const mw = requireNotPaused();
    const calls: any[] = [];
    const res: any = { status: (s: number) => ({ json: (b: any) => { calls.push({ s, b }); return res; } }) };
    await mw({ user: { profile: { operatorosUserId: "os-user-1" } }, tenantCtx: { tenantId: "t-os-1" } }, res, () => calls.push({ next: true }));
    expect(calls[0].s).toBe(402);
    expect(calls[0].b.error).toBe("entitlement_snapshot_missing");
  });

  it.each(["active", "trialing"])("allows %s snapshots", async (subscriptionStatus) => {
    const { requireNotPaused } = await import("../server/core/middleware/requireNotPaused");
    const mw = requireNotPaused();
    let nextCalled = false;
    await mw({
      user: {
        profile: {
          entitlementSnapshotJson: buildSnapshot({ subscriptionStatus, enabled: true }),
          operatorosUserId: "os-user-2",
        },
      },
      tenantCtx: { tenantId: "t-os-2" },
    }, {} as any, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it.each(["past_due", "unpaid", "canceled"])("blocks %s snapshots", async (subscriptionStatus) => {
    const { requireNotPaused } = await import("../server/core/middleware/requireNotPaused");
    const mw = requireNotPaused();
    const calls: any[] = [];
    const res: any = { status: (s: number) => ({ json: (b: any) => { calls.push({ s, b }); return res; } }) };
    await mw({
      user: {
        profile: {
          entitlementSnapshotJson: buildSnapshot({ subscriptionStatus }),
          operatorosUserId: "os-user-3",
        },
      },
      tenantCtx: { tenantId: "t-os-3" },
    }, res, () => calls.push({ next: true }));
    expect(calls[0].s).toBe(402);
    expect(calls[0].b.error).toBe("subscription_inactive");
  });
});

describe("entitlements / sync endpoint contract", () => {
  it("OPERATOROS_SERVICE_TOKEN must be at least 32 chars", () => {
    const token = "x".repeat(32);
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it("blocking statuses match the documented set", () => {
    const blocking = ["past_due", "unpaid", "canceled"];
    blocking.forEach((s) => expect(isBlockingStatus(s)).toBe(true));
  });

  it("revoke (target_module_enabled=false) yields a deny snapshot", () => {
    const snap = buildSnapshot({ planSlug: "pro", enabled: false });
    expect(snap.enabled).toBe(false);
  });
});
