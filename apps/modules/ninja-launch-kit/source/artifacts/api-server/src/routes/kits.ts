import { sendValidationError } from "../lib/http-errors";
import { Router, type IRouter } from "express";
import { eq, and, desc, sql, gte, count, isNull } from "drizzle-orm";
import { db, launchKitsTable, exportsTable } from "@workspace/db";
import { planFor } from "../lib/features";
import {
  ListKitsResponse,
  ListKitsQueryParams,
  CreateKitBody,
  PreviewKitResponse,
  GetKitResponse,
  GetKitParams,
  UpdateKitBody,
  UpdateKitParams,
  DeleteKitParams,
  DuplicateKitParams,
  RegenerateKitParams,
  RegenerateKitResponse,
  ExportKitParams,
  ExportKitQueryParams,
  ExportKitResponse,
  ListExportsResponse,
} from "@workspace/api-zod";
import { requireUser } from "../lib/session";
import { generateKit, exportKitAsText, exportKitAsMarkdown, deriveTitle, type KitInput, type KitContent } from "../lib/generator";
import { generateKitWithAI } from "../lib/ai-generator";
import { generationLimiter, writeLimiter } from "../lib/rate-limit";

const router: IRouter = Router();

function rowToKit(row: typeof launchKitsTable.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    input: row.input,
    content: row.content,
    watermarked: row.watermarked,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.get("/kits", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  const parsed = ListKitsQueryParams.safeParse(req.query);
  const search = parsed.success ? parsed.data.search?.trim().toLowerCase() : undefined;
  const businessType = parsed.success ? parsed.data.businessType?.trim() : undefined;

  const conditions = [eq(launchKitsTable.userId, user.id), isNull(launchKitsTable.deletedAt)];
  if (businessType) conditions.push(eq(launchKitsTable.businessType, businessType));

  let rows = await db
    .select()
    .from(launchKitsTable)
    .where(and(...conditions))
    .orderBy(desc(launchKitsTable.createdAt));

  if (search) {
    rows = rows.filter((r) => r.title.toLowerCase().includes(search));
  }
  res.json(ListKitsResponse.parse(rows.map(rowToKit)));
});

router.post("/kits/preview", generationLimiter, async (req, res): Promise<void> => {
  const parsed = CreateKitBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const input = parsed.data.input as KitInput;
  const content = generateKit(input);
  const user = await requireUser(req, res);
  const watermarked = user.plan === "free";
  const data = {
    id: 0,
    userId: user.id,
    title: parsed.data.title?.trim() || deriveTitle(input),
    input,
    content,
    watermarked,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  res.json(PreviewKitResponse.parse(data));
});

router.post("/kits", generationLimiter, async (req, res): Promise<void> => {
  const parsed = CreateKitBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const user = await requireUser(req, res);

  // Plan gating: monthly kit limit
  const limits = planFor(user);
  if (limits.monthlyKits != null) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [{ value: kitsThisMonth }] = await db
      .select({ value: count() })
      .from(launchKitsTable)
      .where(and(eq(launchKitsTable.userId, user.id), gte(launchKitsTable.createdAt, monthStart), isNull(launchKitsTable.deletedAt)));
    if (Number(kitsThisMonth) >= limits.monthlyKits) {
      res.status(402).json({
        error: "PLAN_LIMIT_EXCEEDED",
        message: `Your ${user.plan} plan is capped at ${limits.monthlyKits} kits per month. Upgrade to Pro for unlimited kits.`,
        code: "monthly_kits_limit",
        currentPlan: user.plan,
      });
      return;
    }
  }

  const input = parsed.data.input as KitInput;
  // Pro/Agency get AI-refined copy via Replit AI Integrations (Anthropic).
  // Free plans get the deterministic template generator.
  const { content, aiUsed } = user.plan === "free"
    ? { content: generateKit(input), aiUsed: false }
    : await generateKitWithAI(input);
  if (aiUsed) req.log?.info({ userId: user.id, plan: user.plan }, "Kit generated with AI");
  const title = parsed.data.title?.trim() || deriveTitle(input);
  const [row] = await db
    .insert(launchKitsTable)
    .values({
      userId: user.id,
      title,
      businessType: input.businessType,
      input,
      content,
      watermarked: limits.watermarkExports,
    })
    .returning();
  res.status(201).json(GetKitResponse.parse(rowToKit(row)));
});

router.get("/kits/:id", async (req, res): Promise<void> => {
  const params = GetKitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = await requireUser(req, res);
  const [row] = await db
    .select()
    .from(launchKitsTable)
    .where(and(eq(launchKitsTable.id, params.data.id), eq(launchKitsTable.userId, user.id), isNull(launchKitsTable.deletedAt)));
  if (!row) {
    res.status(404).json({ error: "Kit not found" });
    return;
  }
  res.json(GetKitResponse.parse(rowToKit(row)));
});

router.patch("/kits/:id", async (req, res): Promise<void> => {
  const params = UpdateKitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateKitBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const user = await requireUser(req, res);
  const updates: Partial<typeof launchKitsTable.$inferInsert> = {};
  if (parsed.data.title != null) updates.title = parsed.data.title;
  if (parsed.data.content != null) updates.content = parsed.data.content as KitContent;
  if (Object.keys(updates).length === 0) {
    const [row] = await db
      .select()
      .from(launchKitsTable)
      .where(and(eq(launchKitsTable.id, params.data.id), eq(launchKitsTable.userId, user.id), isNull(launchKitsTable.deletedAt)));
    if (!row) {
      res.status(404).json({ error: "Kit not found" });
      return;
    }
    res.json(GetKitResponse.parse(rowToKit(row)));
    return;
  }
  const [row] = await db
    .update(launchKitsTable)
    .set(updates)
    .where(and(eq(launchKitsTable.id, params.data.id), eq(launchKitsTable.userId, user.id), isNull(launchKitsTable.deletedAt)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Kit not found" });
    return;
  }
  res.json(GetKitResponse.parse(rowToKit(row)));
});

router.delete("/kits/:id", writeLimiter, async (req, res): Promise<void> => {
  const params = DeleteKitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = await requireUser(req, res);
  // Soft delete: set deletedAt timestamp. A daily job (or admin) can purge old rows.
  await db
    .update(launchKitsTable)
    .set({ deletedAt: new Date() })
    .where(and(
      eq(launchKitsTable.id, params.data.id),
      eq(launchKitsTable.userId, user.id),
      isNull(launchKitsTable.deletedAt),
    ));
  res.status(204).send();
});

router.post("/kits/:id/restore", writeLimiter, async (req, res): Promise<void> => {
  const params = DeleteKitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = await requireUser(req, res);
  const [row] = await db
    .update(launchKitsTable)
    .set({ deletedAt: null })
    .where(and(eq(launchKitsTable.id, params.data.id), eq(launchKitsTable.userId, user.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Kit not found" });
    return;
  }
  res.json(GetKitResponse.parse(rowToKit(row)));
});

router.post("/kits/:id/duplicate", async (req, res): Promise<void> => {
  const params = DuplicateKitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = await requireUser(req, res);
  const [src] = await db
    .select()
    .from(launchKitsTable)
    .where(and(eq(launchKitsTable.id, params.data.id), eq(launchKitsTable.userId, user.id), isNull(launchKitsTable.deletedAt)));
  if (!src) {
    res.status(404).json({ error: "Kit not found" });
    return;
  }
  const [row] = await db
    .insert(launchKitsTable)
    .values({
      userId: user.id,
      title: `${src.title} (copy)`,
      businessType: src.businessType,
      input: src.input,
      content: src.content,
      watermarked: src.watermarked,
    })
    .returning();
  res.status(201).json(GetKitResponse.parse(rowToKit(row)));
});

router.post("/kits/:id/regenerate", async (req, res): Promise<void> => {
  const params = RegenerateKitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = await requireUser(req, res);
  const [src] = await db
    .select()
    .from(launchKitsTable)
    .where(and(eq(launchKitsTable.id, params.data.id), eq(launchKitsTable.userId, user.id), isNull(launchKitsTable.deletedAt)));
  if (!src) {
    res.status(404).json({ error: "Kit not found" });
    return;
  }
  const input = src.input as KitInput;
  // Deterministic regeneration: tweak the seed inputs slightly so output differs
  const tweaked: KitInput = {
    ...input,
    painPoint: `${input.painPoint} (v${(src.updatedAt.getTime() % 999) + 1})`,
  };
  const content = generateKit(tweaked);
  const [row] = await db
    .update(launchKitsTable)
    .set({ content })
    .where(and(eq(launchKitsTable.id, params.data.id), eq(launchKitsTable.userId, user.id), isNull(launchKitsTable.deletedAt)))
    .returning();
  res.json(RegenerateKitResponse.parse(rowToKit(row)));
});

router.get("/kits/:id/export", async (req, res): Promise<void> => {
  const params = ExportKitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const query = ExportKitQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = await requireUser(req, res);
  const limits = planFor(user);
  if (!limits.exportFormats.includes(query.data.format)) {
    res.status(402).json({
      error: "PLAN_LIMIT_EXCEEDED",
      message: `Exporting as ${query.data.format.toUpperCase()} requires a Pro or Agency plan. Free plans can export TXT only.`,
      code: "export_format_locked",
      currentPlan: user.plan,
    });
    return;
  }
  const [src] = await db
    .select()
    .from(launchKitsTable)
    .where(and(eq(launchKitsTable.id, params.data.id), eq(launchKitsTable.userId, user.id), isNull(launchKitsTable.deletedAt)));
  if (!src) {
    res.status(404).json({ error: "Kit not found" });
    return;
  }
  const content = src.content as KitContent;
  const safeName = src.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "launch-kit";
  let body: string;
  let mimeType: string;
  let filename: string;
  if (query.data.format === "json") {
    body = JSON.stringify({ title: src.title, input: src.input, content }, null, 2);
    mimeType = "application/json";
    filename = `${safeName}.json`;
  } else if (query.data.format === "markdown") {
    body = exportKitAsMarkdown(src.title, content);
    mimeType = "text/markdown";
    filename = `${safeName}.md`;
  } else {
    body = exportKitAsText(src.title, content);
    mimeType = "text/plain";
    filename = `${safeName}.txt`;
  }
  await db.insert(exportsTable).values({
    userId: user.id,
    kitId: src.id,
    kitTitle: src.title,
    format: query.data.format,
  });
  res.json(
    ExportKitResponse.parse({
      filename,
      mimeType,
      content: body,
      format: query.data.format,
    }),
  );
});

router.get("/exports", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  const rows = await db
    .select()
    .from(exportsTable)
    .where(eq(exportsTable.userId, user.id))
    .orderBy(desc(exportsTable.createdAt))
    .limit(50);
  res.json(ListExportsResponse.parse(rows));
});

export default router;
