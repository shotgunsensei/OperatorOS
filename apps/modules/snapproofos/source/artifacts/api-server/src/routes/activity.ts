import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, activityTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/activity", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  if (!orgId) { res.json([]); return; }

  const limit = parseInt((req.query.limit as string) || "50", 10);
  const offset = parseInt((req.query.offset as string) || "0", 10);

  const entries = await db.select().from(activityTable)
    .where(eq(activityTable.organizationId, orgId))
    .orderBy(desc(activityTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(entries);
});

export default router;
