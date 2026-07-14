import { Router, type IRouter, type Request } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, launchKitsTable, brandProfilesTable } from "@workspace/db";
import { requireUser } from "../lib/session";
import { planIdFor, planFor } from "../lib/features";
import {
  generateVisualPromoKit,
  exportVisualPromoAsText,
  exportVisualPromoAsMarkdown,
} from "../lib/visual-promo";
import {
  GetVisualPromoKitParams,
  RegenerateVisualPromoKitParams,
  ExportVisualPromoKitParams,
  ExportVisualPromoKitQueryParams,
  GetVisualPromoKitResponse,
  RegenerateVisualPromoKitResponse,
  ExportVisualPromoKitResponse,
} from "@workspace/api-zod";
import type { KitInput, KitContent } from "../lib/generator";

const router: IRouter = Router();

async function loadKitForUser(req: Request, userId: number, kitId: number) {
  const [kitRow] = await db
    .select()
    .from(launchKitsTable)
    .where(and(eq(launchKitsTable.id, kitId), eq(launchKitsTable.userId, userId), isNull(launchKitsTable.deletedAt)));
  if (!kitRow) return { kitRow: null, brand: null };
  const input = kitRow.input as KitInput;
  let brand = null;
  if (input.brandProfileId) {
    const [b] = await db
      .select()
      .from(brandProfilesTable)
      .where(and(eq(brandProfilesTable.id, input.brandProfileId), eq(brandProfilesTable.userId, userId), isNull(brandProfilesTable.deletedAt)));
    if (b) brand = b;
  }
  void req;
  return { kitRow, brand };
}

router.get("/kits/:id/visual-promo", async (req, res): Promise<void> => {
  const params = GetVisualPromoKitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = await requireUser(req, res);
  const { kitRow, brand } = await loadKitForUser(req, user.id, params.data.id);
  if (!kitRow) {
    res.status(404).json({ error: "Kit not found" });
    return;
  }
  const promo = generateVisualPromoKit(
    kitRow.input as KitInput,
    kitRow.content as KitContent,
    brand,
    planIdFor(user),
    kitRow.updatedAt,
  );
  res.json(GetVisualPromoKitResponse.parse(promo));
});

router.post("/kits/:id/visual-promo/regenerate", async (req, res): Promise<void> => {
  const params = RegenerateVisualPromoKitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = await requireUser(req, res);
  const { kitRow, brand } = await loadKitForUser(req, user.id, params.data.id);
  if (!kitRow) {
    res.status(404).json({ error: "Kit not found" });
    return;
  }
  const promo = generateVisualPromoKit(
    kitRow.input as KitInput,
    kitRow.content as KitContent,
    brand,
    planIdFor(user),
  );
  req.log.info({ kitId: kitRow.id }, "visual_promo_regenerated");
  res.json(RegenerateVisualPromoKitResponse.parse(promo));
});

router.get("/kits/:id/visual-promo/export", async (req, res): Promise<void> => {
  const params = ExportVisualPromoKitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const query = ExportVisualPromoKitQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const user = await requireUser(req, res);
  const limits = planFor(user);
  if (!limits.exportFormats.includes(query.data.format)) {
    res.status(402).json({
      error: "PLAN_LIMIT_EXCEEDED",
      message: `Exporting visual briefs as ${query.data.format.toUpperCase()} requires a Pro or Agency plan. Free plans can export TXT only.`,
      code: "export_format_locked",
      currentPlan: user.plan,
    });
    return;
  }
  const { kitRow, brand } = await loadKitForUser(req, user.id, params.data.id);
  if (!kitRow) {
    res.status(404).json({ error: "Kit not found" });
    return;
  }
  const promo = generateVisualPromoKit(
    kitRow.input as KitInput,
    kitRow.content as KitContent,
    brand,
    planIdFor(user),
  );
  const safeName =
    kitRow.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "launch-kit";
  let body: string;
  let mimeType: string;
  let filename: string;
  if (query.data.format === "json") {
    body = JSON.stringify({ title: kitRow.title, kit: promo }, null, 2);
    mimeType = "application/json";
    filename = `${safeName}-visual-promo.json`;
  } else if (query.data.format === "markdown") {
    body = exportVisualPromoAsMarkdown(kitRow.title, promo);
    mimeType = "text/markdown";
    filename = `${safeName}-visual-promo.md`;
  } else {
    body = exportVisualPromoAsText(kitRow.title, promo);
    mimeType = "text/plain";
    filename = `${safeName}-visual-promo.txt`;
  }
  res.json(
    ExportVisualPromoKitResponse.parse({
      filename,
      mimeType,
      content: body,
      format: query.data.format,
    }),
  );
});

export default router;
