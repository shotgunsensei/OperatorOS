import { describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireAdmin } from "./admin";

function mkRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: any; json: any };
}

async function run(appUser: any): Promise<{ status: number | null; next: boolean }> {
  const req = { appUser } as unknown as Request;
  const res = mkRes();
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };
  await requireAdmin(req, res, next);
  return {
    status: res.status.mock.calls[0]?.[0] ?? null,
    next: nextCalled,
  };
}

describe("requireAdmin role-driven gating", () => {
  it("403s an OperatorOS user with local_role=standard even if legacy is_admin=true", async () => {
    const r = await run({
      id: "u1",
      operatorIdentityId: "op-1",
      isAdmin: true,
      isSuperAdmin: false,
      localRole: "standard",
    });
    expect(r.status).toBe(403);
    expect(r.next).toBe(false);
  });

  it("allows an OperatorOS user with local_role=admin even when legacy is_admin=false", async () => {
    const r = await run({
      id: "u2",
      operatorIdentityId: "op-2",
      isAdmin: false,
      isSuperAdmin: false,
      localRole: "admin",
    });
    expect(r.status).toBeNull();
    expect(r.next).toBe(true);
  });

  it("still allows Clerk users with legacy is_admin=true and no localRole", async () => {
    const r = await run({
      id: "u3",
      operatorIdentityId: null,
      isAdmin: true,
      isSuperAdmin: false,
      localRole: null,
    });
    expect(r.status).toBeNull();
    expect(r.next).toBe(true);
  });

  it("403s a Clerk user without is_admin even if some other localRole-like field is set", async () => {
    const r = await run({
      id: "u4",
      operatorIdentityId: null,
      isAdmin: false,
      isSuperAdmin: false,
      localRole: "admin",
    });
    expect(r.status).toBe(403);
  });

  it("allows bootstrap super admins regardless of localRole", async () => {
    const r = await run({
      id: "u5",
      operatorIdentityId: "op-5",
      isAdmin: false,
      isSuperAdmin: true,
      localRole: "standard",
    });
    expect(r.status).toBeNull();
    expect(r.next).toBe(true);
  });

  it("403s when no appUser is present", async () => {
    const r = await run(undefined);
    expect(r.status).toBe(403);
  });
});
