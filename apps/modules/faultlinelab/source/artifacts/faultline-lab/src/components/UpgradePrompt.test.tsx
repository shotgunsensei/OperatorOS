import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import {
  UpgradePromptProvider,
  useUpgradePrompt,
  type UpgradePromptOptions,
} from "./UpgradePrompt";
import {
  resetEntitlements,
  setEntitlements,
} from "@/lib/entitlements";

afterEach(() => {
  resetEntitlements();
  cleanup();
});

function Trigger({ opts }: { opts: UpgradePromptOptions }) {
  const { prompt } = useUpgradePrompt();
  return (
    <button data-testid="trigger" onClick={() => prompt(opts)}>
      open
    </button>
  );
}

function renderPrompt(opts: UpgradePromptOptions) {
  return render(
    <UpgradePromptProvider>
      <Trigger opts={opts} />
    </UpgradePromptProvider>
  );
}

describe("<UpgradePrompt /> better-value bundle hint", () => {
  it("surfaces the master bundle hint when prompting on a bundled pack", () => {
    renderPrompt({
      productId: "pack-network-ops",
      reason: "Locked test",
      contextKey: "test:network-ops",
    });
    act(() => {
      screen.getByTestId("trigger").click();
    });
    expect(screen.getByText(/Network Ops Pack/i)).toBeDefined();
    expect(screen.getByText(/Better value/i)).toBeDefined();
    expect(screen.getByText(/Master Investigator Bundle/i)).toBeDefined();
    expect(screen.getByText(/\$49\.99/)).toBeDefined();
  });

  it("does not show the bundle hint when prompting on a product not in any bundle", () => {
    renderPrompt({
      // bundles themselves are never nested in another bundle
      productId: "bundle-clinical-systems",
      reason: "Locked test",
      contextKey: "test:clinical-bundle",
    });
    act(() => {
      screen.getByTestId("trigger").click();
    });
    expect(screen.queryByText(/Better value/i)).toBeNull();
  });

  it("suppresses the prompt entirely when the user already owns the product", () => {
    setEntitlements({
      ownedProductIds: ["base-free", "pack-network-ops"],
      activeSubscription: null,
      isProUser: false,
    });
    renderPrompt({
      productId: "pack-network-ops",
      reason: "should not appear",
      contextKey: "test:owned-skip",
    });
    act(() => {
      screen.getByTestId("trigger").click();
    });
    expect(screen.queryByText(/Locked content/i)).toBeNull();
    expect(screen.queryByText(/Better value/i)).toBeNull();
  });
});
