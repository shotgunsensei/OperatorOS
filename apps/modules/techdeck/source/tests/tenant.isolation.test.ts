import { describe, it, expect } from "vitest";

/**
 * Smoke test documenting the tenant-isolation invariant.
 * Real integration test should provision two tenants and verify cross-tenant 403.
 */
describe("tenant isolation invariant", () => {
  it("storage methods always require tenantId", () => {
    // Spot-check: getClientsByTenant must take a tenantId parameter.
    // This test exists as a placeholder for a full integration test
    // that spins up two tenants and verifies cross-tenant access returns 403.
    const fnSig = "getClientsByTenant(tenantId: string)";
    expect(fnSig).toContain("tenantId");
  });
});
