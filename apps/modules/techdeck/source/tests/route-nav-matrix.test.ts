import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  frontendRouteMatrix,
  getSidebarSections,
  routeMatches,
  sidebarNavItems,
} from "../client/src/lib/route-manifest";

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("frontend route and sidebar matrix", () => {
  const appSource = readRepoFile("client/src/App.tsx");

  it("documents every concrete App route in the frontend route matrix", () => {
    const appRoutePaths = Array.from(appSource.matchAll(/<Route path="([^"]+)"/g)).map((match) => match[1]);
    const matrixPaths = new Set(frontendRouteMatrix.map((route) => route.path));

    for (const routePath of appRoutePaths) {
      expect(matrixPaths.has(routePath), `Missing route matrix entry for ${routePath}`).toBe(true);
    }
  });

  it("keeps every sidebar item attached to a documented route", () => {
    const matrixPaths = new Set(frontendRouteMatrix.map((route) => route.path));

    for (const item of sidebarNavItems) {
      expect(matrixPaths.has(item.href), `Missing frontend route for sidebar item ${item.title}`).toBe(true);
    }
  });

  it("renders role-appropriate sidebar groups", () => {
    const adminGroups = getSidebarSections({ role: "ADMIN", features: ["api", "status", "webhooks", "reports", "intake"] });
    const techGroups = getSidebarSections({ role: "TECH", features: ["reports", "intake"] });
    const clientGroups = getSidebarSections({ role: "CLIENT", features: ["portal"] });

    expect(adminGroups.map((group) => group.label)).toContain("Administration");
    expect(adminGroups.flatMap((group) => group.items.map((item) => item.title))).toContain("Billing");
    expect(techGroups.flatMap((group) => group.items.map((item) => item.title))).toContain("IT Ops Console");
    expect(techGroups.flatMap((group) => group.items.map((item) => item.title))).not.toContain("Billing");
    expect(clientGroups.map((group) => group.label)).toEqual(["Client Portal"]);
  });

  it("shows OperatorOS-managed locks for missing feature entitlements", () => {
    const groups = getSidebarSections({ role: "ADMIN", features: [] });
    const lockedTitles = groups
      .flatMap((group) => group.items)
      .filter((item) => item.locked)
      .map((item) => item.title);

    expect(lockedTitles).toEqual(expect.arrayContaining(["Reports", "Secure Intake", "Status", "Webhooks", "API Tokens"]));
  });

  it("uses boundary-aware active route matching for mobile routes", () => {
    expect(routeMatches("/m", "/m", true)).toBe(true);
    expect(routeMatches("/m/tickets", "/m")).toBe(true);
    expect(routeMatches("/mfa-setup", "/m")).toBe(false);
    expect(routeMatches("/licenses/developer", "/licenses", true)).toBe(false);
  });

  it("documents server gates for authenticated production routes", () => {
    for (const route of frontendRouteMatrix) {
      if (route.authRequired && route.path !== "*") {
        expect(route.serverGate, `Missing serverGate for ${route.path}`).toBeTruthy();
      }
    }
  });
});

describe("server-side feature gate coverage", () => {
  it.each([
    ["reports", "server/modules/reports/routes.ts", 'requireFeature("reports")'],
    ["webhooks", "server/modules/webhooks/routes.ts", 'requireFeature("webhooks")'],
    ["status", "server/modules/status/routes.ts", 'requireFeature("status")'],
    ["api", "server/modules/api/adminRoutes.ts", 'requireFeature("api")'],
    ["intake", "server/modules/secure-intake/routes.ts", 'requireFeature("intake")'],
    ["portal", "server/modules/portal/routes.ts", 'requireFeature("portal")'],
  ])("keeps %s routes protected by OperatorOS feature middleware", (_feature, file, expected) => {
    expect(readRepoFile(file)).toContain(expected);
  });
});
