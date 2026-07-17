import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProductCard } from "./ProductCard";
import { CATALOG } from "@/data/catalog";
import {
  resetEntitlements,
  setEntitlements,
} from "@/lib/entitlements";

const proSubscription = CATALOG.find((p) => p.id === "pro-subscription")!;
const networkOpsPack = CATALOG.find((p) => p.id === "pack-network-ops")!;
const serverGraveyardPack = CATALOG.find((p) => p.id === "pack-server-graveyard")!;
const masterBundle = CATALOG.find((p) => p.id === "bundle-master-investigator")!;
const chaosUpgrade = CATALOG.find((p) => p.id === "upgrade-chaos-mode")!;

afterEach(() => {
  resetEntitlements();
  cleanup();
});

describe("<ProductCard /> entitlement-driven labels", () => {
  it("free user sees an available pack with its price and CTA", () => {
    render(<ProductCard product={networkOpsPack} onSelect={vi.fn()} />);
    expect(screen.getByText(networkOpsPack.name)).toBeDefined();
    expect(screen.getByText("$9.99")).toBeDefined();
    expect(screen.getByText(/Buy/i)).toBeDefined();
    expect(screen.queryByText(/Owned/i)).toBeNull();
  });

  it("free user sees coming-soon packs labelled 'Coming soon'", () => {
    render(
      <ProductCard product={serverGraveyardPack} onSelect={vi.fn()} />
    );
    expect(screen.getAllByText(/Coming soon/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("$9.99")).toBeNull();
  });

  it("free user sees subscription product with monthly + yearly hint", () => {
    render(<ProductCard product={proSubscription} onSelect={vi.fn()} />);
    expect(screen.getByText(/Subscribe/i)).toBeDefined();
    // Yearly hint line "$8.99/mo or $79.00/yr"
    expect(screen.getByText(/\$8\.99\/mo or \$79\.00\/yr/)).toBeDefined();
  });

  it("pack owner sees 'Owned' on the owned pack", () => {
    setEntitlements({
      ownedProductIds: ["base-free", "pack-network-ops"],
      activeSubscription: null,
      isProUser: false,
    });
    render(<ProductCard product={networkOpsPack} onSelect={vi.fn()} />);
    expect(screen.getAllByText(/Owned/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("$9.99")).toBeNull();
  });

  it("pro subscriber sees 'Owned' on the pro tier itself", () => {
    setEntitlements({
      ownedProductIds: ["base-free", "pro-subscription"],
      activeSubscription: "pro-subscription",
      isProUser: true,
      subscriptionInterval: "month",
    });
    render(<ProductCard product={proSubscription} onSelect={vi.fn()} />);
    expect(screen.getAllByText(/Owned/i).length).toBeGreaterThan(0);
  });

  it("pro subscriber does NOT see à-la-carte pack as 'Owned'", () => {
    // Pro unlocks pro features and case access, but pack content-pack
    // entitlements are still discrete purchases.
    setEntitlements({
      ownedProductIds: ["base-free", "pro-subscription"],
      activeSubscription: "pro-subscription",
      isProUser: true,
    });
    render(<ProductCard product={networkOpsPack} onSelect={vi.fn()} />);
    expect(screen.queryByText(/^Owned$/i)).toBeNull();
    expect(screen.getByText("$9.99")).toBeDefined();
  });

  it("master bundle owner sees bundled products as 'Owned'", () => {
    setEntitlements({
      ownedProductIds: ["base-free", "bundle-master-investigator"],
      activeSubscription: "pro-subscription",
      isProUser: true,
    });
    render(<ProductCard product={chaosUpgrade} onSelect={vi.fn()} />);
    expect(screen.getAllByText(/Owned/i).length).toBeGreaterThan(0);
  });

  it("admin override marks every available product as 'Owned'", () => {
    setEntitlements({
      ownedProductIds: ["base-free"],
      activeSubscription: null,
      isProUser: false,
      isAdmin: true,
    });
    render(<ProductCard product={networkOpsPack} onSelect={vi.fn()} />);
    expect(screen.getAllByText(/Owned/i).length).toBeGreaterThan(0);
  });

  it("admin staff see coming-soon bundles as 'Owned' (override beats coming-soon)", () => {
    // Master bundle is coming-soon. Admin override grants access to non-disabled
    // products via hasEntitlement, so the card shows 'Owned'. This pins the
    // documented precedence (admin override > coming-soon) and guards against
    // silently flipping the card to a buyable "Buy" CTA.
    setEntitlements({
      ownedProductIds: ["base-free"],
      activeSubscription: null,
      isProUser: false,
      isAdmin: true,
    });
    render(<ProductCard product={masterBundle} onSelect={vi.fn()} />);
    // hasEntitlement returns true for admins, so 'Owned' wins. Asserts the
    // documented behaviour rather than a silent regression to "Buy".
    expect(screen.getAllByText(/Owned/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Buy$/i)).toBeNull();
  });

  it("renders the optional reason hint when provided", () => {
    render(
      <ProductCard
        product={networkOpsPack}
        onSelect={vi.fn()}
        reason="Recommended after your last network case"
      />
    );
    expect(
      screen.getByText(/Recommended after your last network case/i)
    ).toBeDefined();
  });
});
