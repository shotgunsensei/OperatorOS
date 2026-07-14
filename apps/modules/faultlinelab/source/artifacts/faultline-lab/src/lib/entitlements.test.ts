import { afterEach, describe, expect, it } from "vitest";
import {
  addOwnedProduct,
  caseExists,
  getCurrentPlanLabel,
  getEntitlements,
  getProductOwnershipStatus,
  getRequiredProductForCase,
  getRequiredProductForFeature,
  hasEntitlement,
  hasFeature,
  isCaseAccessible,
  removeOwnedProduct,
  resetEntitlements,
  setEntitlements,
} from "./entitlements";

const STARTER_CASE = "case-windows-ad-001";
const NETWORK_OPS_CASE = "case-network-ops-01";
const SERVER_GRAVEYARD_CASE = "case-server-graveyard-01";
const UNKNOWN_CASE = "case-does-not-exist-999";

afterEach(() => {
  resetEntitlements();
});

describe("free user (default state)", () => {
  it("only owns base-free", () => {
    expect(getEntitlements().ownedProductIds).toEqual(["base-free"]);
    expect(getEntitlements().isProUser).toBe(false);
    expect(getCurrentPlanLabel()).toBe("Free Tier");
  });

  it("base-free entitlement is always granted", () => {
    expect(hasEntitlement("base-free")).toBe(true);
  });

  it("does not grant paid product entitlements", () => {
    expect(hasEntitlement("pro-subscription")).toBe(false);
    expect(hasEntitlement("pack-network-ops")).toBe(false);
    expect(hasEntitlement("upgrade-chaos-mode")).toBe(false);
  });

  it("grants free features and not pro features", () => {
    expect(hasFeature("standard-tools")).toBe(true);
    expect(hasFeature("guest-mode")).toBe(true);
    expect(hasFeature("cloud-sync")).toBe(false);
    expect(hasFeature("chaos-mode")).toBe(false);
  });

  it("can play starter cases but not pack cases", () => {
    expect(isCaseAccessible(STARTER_CASE)).toBe(true);
    expect(isCaseAccessible(NETWORK_OPS_CASE)).toBe(false);
  });

  it("recommends the source pack for a locked pack case", () => {
    const required = getRequiredProductForCase(NETWORK_OPS_CASE);
    expect(required?.id).toBe("pack-network-ops");
  });
});

describe("pro subscriber", () => {
  it("setEntitlements with isProUser unlocks pro features", () => {
    setEntitlements({
      ownedProductIds: ["base-free", "pro-subscription"],
      activeSubscription: "pro-subscription",
      isProUser: true,
      subscriptionInterval: "month",
    });
    expect(hasFeature("cloud-sync")).toBe(true);
    expect(hasFeature("full-archive")).toBe(true);
    expect(hasEntitlement("pro-subscription")).toBe(true);
    expect(getCurrentPlanLabel()).toBe("Pro Investigator (Monthly)");
  });

  it("annual interval is reflected in the plan label", () => {
    setEntitlements({
      ownedProductIds: ["base-free", "pro-subscription"],
      activeSubscription: "pro-subscription",
      isProUser: true,
      subscriptionInterval: "year",
    });
    expect(getCurrentPlanLabel()).toBe("Pro Investigator (Annual)");
  });

  it("unlocks every registered case", () => {
    setEntitlements({
      ownedProductIds: ["base-free", "pro-subscription"],
      activeSubscription: "pro-subscription",
      isProUser: true,
    });
    expect(isCaseAccessible(NETWORK_OPS_CASE)).toBe(true);
    expect(isCaseAccessible(SERVER_GRAVEYARD_CASE)).toBe(true);
    expect(isCaseAccessible(STARTER_CASE)).toBe(true);
  });

  it("does not implicitly grant chaos-mode (separate upgrade)", () => {
    setEntitlements({
      ownedProductIds: ["base-free", "pro-subscription"],
      activeSubscription: "pro-subscription",
      isProUser: true,
    });
    expect(hasFeature("chaos-mode")).toBe(false);
    expect(getRequiredProductForFeature("chaos-mode")?.id).toBe(
      "upgrade-chaos-mode"
    );
  });
});

describe("expired subscription", () => {
  it("loses pro features when the subscription product is removed", () => {
    addOwnedProduct("pro-subscription");
    expect(hasFeature("cloud-sync")).toBe(true);
    expect(getEntitlements().isProUser).toBe(true);

    removeOwnedProduct("pro-subscription");
    expect(getEntitlements().isProUser).toBe(false);
    expect(getEntitlements().activeSubscription).toBeNull();
    expect(hasFeature("cloud-sync")).toBe(false);
    expect(isCaseAccessible(NETWORK_OPS_CASE)).toBe(false);
  });
});

describe("content pack ownership", () => {
  it("unlocks only the cases tied to the owned pack", () => {
    addOwnedProduct("pack-network-ops");
    expect(isCaseAccessible(NETWORK_OPS_CASE)).toBe(true);
    expect(isCaseAccessible(SERVER_GRAVEYARD_CASE)).toBe(false);
    expect(getRequiredProductForCase(NETWORK_OPS_CASE)).toBeNull();
  });

  it("does not grant pro features", () => {
    addOwnedProduct("pack-network-ops");
    expect(hasFeature("cloud-sync")).toBe(false);
  });
});

describe("bundle ownership", () => {
  it("master bundle grants entitlements to every bundled product", () => {
    addOwnedProduct("bundle-master-investigator");
    expect(hasEntitlement("bundle-master-investigator")).toBe(true);
    expect(hasEntitlement("pack-network-ops")).toBe(true);
    expect(hasEntitlement("upgrade-chaos-mode")).toBe(true);
    expect(hasFeature("chaos-mode")).toBe(true);
  });

  it("master bundle activates pro because it bundles the subscription", () => {
    addOwnedProduct("bundle-master-investigator");
    expect(getEntitlements().isProUser).toBe(true);
    expect(hasFeature("cloud-sync")).toBe(true);
    expect(isCaseAccessible(SERVER_GRAVEYARD_CASE)).toBe(true);
  });
});

describe("chaos-mode upgrade", () => {
  it("is gated for free users", () => {
    expect(hasFeature("chaos-mode")).toBe(false);
  });

  it("unlocks via the chaos-mode upgrade product", () => {
    addOwnedProduct("upgrade-chaos-mode");
    expect(hasFeature("chaos-mode")).toBe(true);
    expect(getRequiredProductForFeature("chaos-mode")).toBeNull();
  });

  it("is granted to staff via override", () => {
    setEntitlements({
      ownedProductIds: ["base-free"],
      activeSubscription: null,
      isProUser: false,
      isAdmin: true,
    });
    expect(hasFeature("chaos-mode")).toBe(true);
    expect(getCurrentPlanLabel()).toBe("Admin (Full Access)");
  });
});

describe("unknown product / case", () => {
  it("hasEntitlement returns false for unknown product ids", () => {
    expect(hasEntitlement("not-a-real-product")).toBe(false);
  });

  it("getProductOwnershipStatus reports coming-soon for unknown ids", () => {
    expect(getProductOwnershipStatus("not-a-real-product")).toBe("coming-soon");
  });

  it("caseExists distinguishes locked from missing", () => {
    expect(caseExists(STARTER_CASE)).toBe(true);
    expect(caseExists(UNKNOWN_CASE)).toBe(false);
  });

  it("isCaseAccessible fails closed for unknown case ids", () => {
    expect(isCaseAccessible(UNKNOWN_CASE)).toBe(false);
  });

  it("getRequiredProductForCase falls back to pro for unknown cases", () => {
    expect(getRequiredProductForCase(UNKNOWN_CASE)?.id).toBe("pro-subscription");
  });
});

describe("staff overrides", () => {
  it("super admin sees all cases and features", () => {
    setEntitlements({
      ownedProductIds: ["base-free"],
      activeSubscription: null,
      isProUser: false,
      isSuperAdmin: true,
    });
    expect(isCaseAccessible(NETWORK_OPS_CASE)).toBe(true);
    expect(hasEntitlement("pack-network-ops")).toBe(true);
    expect(hasFeature("cloud-sync")).toBe(true);
    expect(getCurrentPlanLabel()).toBe("Super Admin (Full Access)");
  });
});
