import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("OperatorOS UI copy and controls", () => {
  it("admin panel does not render local subscription mutation controls", () => {
    const source = readRepoFile("client/src/modules/admin/pages/admin-panel.tsx");

    expect(source).not.toContain("ChangeSubscriptionDialog");
    expect(source).not.toContain("Change Plan");
    expect(source).not.toContain("/pause");
    expect(source).not.toContain("/unpause");
    expect(source).not.toContain("PATCH\", `/api/admin/tenants/${tenant.id}/subscription`");
    expect(source).toContain("Manage in OperatorOS");
    expect(source).toContain("OperatorOS Tenant ID");
  });

  it("landing page no longer uses the local checkout/register funnel", () => {
    const source = readRepoFile("client/src/modules/core/pages/landing.tsx");

    expect(source).not.toContain('href="/register"');
    expect(source).not.toContain("Get Started Free");
    expect(source).not.toContain("Start Free");
    expect(source).not.toContain("No credit card required");
    expect(source).not.toContain("Stripe-powered subscriptions");
    expect(source).toContain("Launch from OperatorOS");
    expect(source).toContain("OperatorOS-managed access");
  });
});
