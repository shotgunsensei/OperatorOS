import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CaseCard } from "./CaseCard";
import { CASE_CATALOG_ENTRIES } from "@/data/caseCatalog/entries";
import {
  resetEntitlements,
  setEntitlements,
} from "@/lib/entitlements";

const STARTER_ID = "case-windows-ad-001";
const NETWORK_OPS_ID = "case-network-ops-01";
const SERVER_GRAVEYARD_ID = "case-server-graveyard-01";

function entry(id: string) {
  const e = CASE_CATALOG_ENTRIES.find((x) => x.id === id);
  if (!e) throw new Error(`fixture missing case ${id}`);
  return e;
}

afterEach(() => {
  resetEntitlements();
  cleanup();
});

describe("<CaseCard /> entitlement-driven labels", () => {
  it("free user can play starter cases (no Lock badge, no upsell)", () => {
    render(<CaseCard entry={entry(STARTER_ID)} />);
    expect(screen.getByText(entry(STARTER_ID).title)).toBeDefined();
    // No required-product upsell text for accessible cases.
    expect(screen.queryByText(/Network Ops Pack/i)).toBeNull();
  });

  it("free user sees a locked pack case with the required pack name", () => {
    render(<CaseCard entry={entry(NETWORK_OPS_ID)} />);
    expect(screen.getByText(entry(NETWORK_OPS_ID).title)).toBeDefined();
    // The required-product line surfaces the pack name.
    expect(screen.getByText(/Network Ops Pack/i)).toBeDefined();
  });

  it("free user sees coming-soon pack case as locked with the upsell pack name", () => {
    // Server graveyard cases are 'playable' status but their owning pack is
    // 'coming-soon' AND not owned, so free users see the locked upsell
    // labelled with the pack name (no In Development copy because the
    // case itself is not status:'planned').
    render(<CaseCard entry={entry(SERVER_GRAVEYARD_ID)} />);
    expect(screen.getByText(/Server Graveyard Pack/i)).toBeDefined();
    // No "In Development" copy because the case status is 'playable'.
    expect(screen.queryByText(/In Development/i)).toBeNull();
    // No "Replay" affordance for an inaccessible case.
    expect(screen.queryByText(/Replay/i)).toBeNull();
  });

  it("renders 'In Development' copy for a status:'planned' case", () => {
    // No entries in the registry currently use status:'planned'; synthesize a
    // minimal entry so we still cover the planned UI branch.
    const plannedEntry = {
      ...entry(SERVER_GRAVEYARD_ID),
      id: "case-test-planned-001",
      status: "planned" as const,
    };
    render(<CaseCard entry={plannedEntry} />);
    expect(screen.getByText(/In Development/i)).toBeDefined();
  });

  it("pack owner sees the owned pack case unlocked with source pack tag", () => {
    setEntitlements({
      ownedProductIds: ["base-free", "pack-network-ops"],
      activeSubscription: null,
      isProUser: false,
    });
    render(<CaseCard entry={entry(NETWORK_OPS_ID)} />);
    // The "source pack" pill shows once accessible.
    expect(screen.getByText(/Network Ops Pack/i)).toBeDefined();
    // No "Requires upgrade" amber copy when accessible.
    expect(screen.queryByText(/Requires upgrade/i)).toBeNull();
  });

  it("pro subscriber unlocks pack cases (no required-product line)", () => {
    setEntitlements({
      ownedProductIds: ["base-free", "pro-subscription"],
      activeSubscription: "pro-subscription",
      isProUser: true,
    });
    render(<CaseCard entry={entry(NETWORK_OPS_ID)} />);
    // Source pack tag still shows because the pack exists, but the case
    // is accessible — so no upsell copy.
    expect(screen.queryByText(/Requires upgrade/i)).toBeNull();
  });

  it("master bundle owner unlocks pack cases bundled in the master bundle", () => {
    setEntitlements({
      ownedProductIds: ["base-free", "bundle-master-investigator"],
      activeSubscription: "pro-subscription",
      isProUser: true,
    });
    render(<CaseCard entry={entry(SERVER_GRAVEYARD_ID)} />);
    expect(screen.queryByText(/Requires upgrade/i)).toBeNull();
  });

  it("admin sees every case as accessible", () => {
    setEntitlements({
      ownedProductIds: ["base-free"],
      activeSubscription: null,
      isProUser: false,
      isAdmin: true,
    });
    render(<CaseCard entry={entry(NETWORK_OPS_ID)} />);
    expect(screen.queryByText(/Requires upgrade/i)).toBeNull();
  });
});
