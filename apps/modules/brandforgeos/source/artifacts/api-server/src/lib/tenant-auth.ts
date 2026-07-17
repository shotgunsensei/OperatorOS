import type { Request, Response } from "express";
import { db, membershipsTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const SUPER_ADMIN_EMAILS = ["johntwms355@gmail.com"];

export function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export async function requireTenantAccess(req: Request, res: Response, tenantId: number): Promise<boolean> {
  if (!requireAuth(req, res)) return false;

  if (await isSuperAdmin(req.user!.id)) return true;
  
  const [membership] = await db
    .select()
    .from(membershipsTable)
    .where(and(eq(membershipsTable.userId, req.user!.id), eq(membershipsTable.tenantId, tenantId)));
  
  if (!membership) {
    res.status(403).json({ error: "Access denied" });
    return false;
  }
  return true;
}

export function parseTenantId(req: Request): number {
  const raw = Array.isArray(req.params.tenantId) ? req.params.tenantId[0] : req.params.tenantId;
  return parseInt(raw, 10);
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return false;
  if (user.role === "super_admin") return true;
  if (user.email && SUPER_ADMIN_EMAILS.includes(user.email)) {
    await db.update(usersTable).set({ role: "super_admin" }).where(eq(usersTable.id, userId));
    return true;
  }
  return false;
}

export async function requirePlatformAdmin(req: Request, res: Response): Promise<boolean> {
  if (!requireAuth(req, res)) return false;
  if (await isSuperAdmin(req.user!.id)) return true;
  res.status(403).json({ error: "Super admin access required" });
  return false;
}
