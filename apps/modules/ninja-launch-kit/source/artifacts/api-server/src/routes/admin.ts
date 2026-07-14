import { sendValidationError } from "../lib/http-errors";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, usersTable, launchKitsTable, exportsTable, adminSettingsTable, featuredTemplatesTable } from "@workspace/db";
import {
  GetAdminStatsResponse,
  ListAdminUsersResponse,
  GetAdminSettingsResponse,
  UpdateAdminSettingsBody,
  UpdateAdminSettingsResponse,
  ListFeaturedTemplatesResponse,
  CreateFeaturedTemplateBody,
  DeleteFeaturedTemplateParams,
} from "@workspace/api-zod";
import { requireAuthenticatedUser } from "../lib/session";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

router.use("/admin", requireAuthenticatedUser, requireAdmin);

router.get("/admin/stats", async (_req, res): Promise<void> => {
  // Use COUNT(*) aggregates instead of selecting whole tables — scales O(1) regardless of row count.
  const planCounts = await db
    .select({ plan: usersTable.plan, count: sql<number>`count(*)::int` })
    .from(usersTable)
    .groupBy(usersTable.plan);
  const userCount = planCounts.reduce((acc, r) => acc + r.count, 0);
  const planMap = new Map(planCounts.map((r) => [r.plan, r.count]));
  const [{ kitCount }] = await db.select({ kitCount: sql<number>`count(*)::int` }).from(launchKitsTable);
  const [{ exportCount }] = await db.select({ exportCount: sql<number>`count(*)::int` }).from(exportsTable);
  res.json(
    GetAdminStatsResponse.parse({
      userCount,
      kitCount,
      exportCount,
      proCount: planMap.get("pro") ?? 0,
      agencyCount: planMap.get("agency") ?? 0,
      freeCount: planMap.get("free") ?? 0,
    }),
  );
});

router.get("/admin/users", async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
  const counts = await db
    .select({ userId: launchKitsTable.userId, count: sql<number>`count(*)::int` })
    .from(launchKitsTable)
    .groupBy(launchKitsTable.userId);
  const countMap = new Map(counts.map((c) => [c.userId, c.count]));
  const data = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    plan: u.plan,
    kitCount: countMap.get(u.id) ?? 0,
    createdAt: u.createdAt,
  }));
  res.json(ListAdminUsersResponse.parse(data));
});

async function getOrCreateSettings() {
  const [existing] = await db.select().from(adminSettingsTable).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(adminSettingsTable).values({}).returning();
  return created;
}

router.get("/admin/settings", async (_req, res): Promise<void> => {
  const s = await getOrCreateSettings();
  res.json(GetAdminSettingsResponse.parse(s));
});

router.patch("/admin/settings", async (req, res): Promise<void> => {
  const parsed = UpdateAdminSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const current = await getOrCreateSettings();
  const [updated] = await db
    .update(adminSettingsTable)
    .set(parsed.data)
    .where(eq(adminSettingsTable.id, current.id))
    .returning();
  res.json(UpdateAdminSettingsResponse.parse(updated));
});

router.get("/admin/templates", async (_req, res): Promise<void> => {
  const rows = await db.select().from(featuredTemplatesTable).orderBy(desc(featuredTemplatesTable.createdAt));
  res.json(ListFeaturedTemplatesResponse.parse(rows));
});

router.post("/admin/templates", async (req, res): Promise<void> => {
  const parsed = CreateFeaturedTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const [row] = await db.insert(featuredTemplatesTable).values(parsed.data).returning();
  // Featured templates use the same shape in list and item responses; reuse the list-item zod
  res.status(201).json(ListFeaturedTemplatesResponse.element.parse(row));
});

router.delete("/admin/templates/:id", async (req, res): Promise<void> => {
  const params = DeleteFeaturedTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(featuredTemplatesTable).where(eq(featuredTemplatesTable.id, params.data.id));
  res.status(204).send();
});

export default router;
