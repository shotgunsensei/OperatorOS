import { sendValidationError } from "../lib/http-errors";
import { Router, type IRouter } from "express";
import { eq, and, desc, count, isNull } from "drizzle-orm";
import { db, brandProfilesTable } from "@workspace/db";
import { planFor } from "../lib/features";
import {
  ListBrandProfilesResponse,
  CreateBrandProfileBody,
  UpdateBrandProfileBody,
  UpdateBrandProfileParams,
  UpdateBrandProfileResponse,
  DeleteBrandProfileParams,
} from "@workspace/api-zod";
import { requireUser } from "../lib/session";
import { writeLimiter } from "../lib/rate-limit";

const router: IRouter = Router();

router.get("/brands", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  const rows = await db
    .select()
    .from(brandProfilesTable)
    .where(and(eq(brandProfilesTable.userId, user.id), isNull(brandProfilesTable.deletedAt)))
    .orderBy(desc(brandProfilesTable.createdAt));
  res.json(ListBrandProfilesResponse.parse(rows));
});

router.post("/brands", async (req, res): Promise<void> => {
  const parsed = CreateBrandProfileBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const user = await requireUser(req, res);
  const limits = planFor(user);
  if (limits.brandProfiles != null) {
    if (limits.brandProfiles === 0) {
      res.status(402).json({
        error: "PLAN_LIMIT_EXCEEDED",
        message: "Brand profiles are a Pro feature. Upgrade to create reusable brand identities.",
        code: "brand_profiles_locked",
        currentPlan: user.plan,
      });
      return;
    }
    const [{ value: existing }] = await db
      .select({ value: count() })
      .from(brandProfilesTable)
      .where(and(eq(brandProfilesTable.userId, user.id), isNull(brandProfilesTable.deletedAt)));
    if (Number(existing) >= limits.brandProfiles) {
      res.status(402).json({
        error: "PLAN_LIMIT_EXCEEDED",
        message: `Your ${user.plan} plan is capped at ${limits.brandProfiles} brand profiles. Upgrade to Agency for unlimited.`,
        code: "brand_profiles_limit",
        currentPlan: user.plan,
      });
      return;
    }
  }
  const [row] = await db
    .insert(brandProfilesTable)
    .values({ ...parsed.data, userId: user.id })
    .returning();
  res.status(201).json(UpdateBrandProfileResponse.parse(row));
});

router.patch("/brands/:id", async (req, res): Promise<void> => {
  const params = UpdateBrandProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBrandProfileBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const user = await requireUser(req, res);
  const [row] = await db
    .update(brandProfilesTable)
    .set(parsed.data)
    .where(and(eq(brandProfilesTable.id, params.data.id), eq(brandProfilesTable.userId, user.id), isNull(brandProfilesTable.deletedAt)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Brand profile not found" });
    return;
  }
  res.json(UpdateBrandProfileResponse.parse(row));
});

router.delete("/brands/:id", writeLimiter, async (req, res): Promise<void> => {
  const params = DeleteBrandProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = await requireUser(req, res);
  // Soft delete
  await db
    .update(brandProfilesTable)
    .set({ deletedAt: new Date() })
    .where(and(
      eq(brandProfilesTable.id, params.data.id),
      eq(brandProfilesTable.userId, user.id),
      isNull(brandProfilesTable.deletedAt),
    ));
  res.status(204).send();
});

router.post("/brands/:id/restore", writeLimiter, async (req, res): Promise<void> => {
  const params = DeleteBrandProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = await requireUser(req, res);
  const [row] = await db
    .update(brandProfilesTable)
    .set({ deletedAt: null })
    .where(and(eq(brandProfilesTable.id, params.data.id), eq(brandProfilesTable.userId, user.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Brand profile not found" });
    return;
  }
  res.json(UpdateBrandProfileResponse.parse(row));
});

export default router;
