import { Router, type IRouter } from "express";
import { requireUser } from "../lib/session";
import { planIdFor } from "../lib/features";
import {
  LAUNCH_TEMPLATES,
  TEMPLATE_CATEGORIES,
  findTemplate,
  userCanAccessTemplate,
} from "../lib/launch-templates";

const router: IRouter = Router();

router.get("/templates", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const currentPlan = planIdFor(user);

  const q = String(req.query["q"] ?? "").trim().toLowerCase();
  const category = String(req.query["category"] ?? "").trim();
  const tier = String(req.query["tier"] ?? "").trim();

  const filtered = LAUNCH_TEMPLATES.filter((t) => {
    if (category && t.category !== category) return false;
    if (tier && t.tier !== tier) return false;
    if (q) {
      const haystack = [t.name, t.description, t.category, t.recommendedOffer, t.suggestedAudience, t.adAngle]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  res.json({
    categories: [...TEMPLATE_CATEGORIES],
    currentPlan,
    templates: filtered.map((t) => ({
      slug: t.slug,
      name: t.name,
      category: t.category,
      tier: t.tier,
      description: t.description,
      recommendedOffer: t.recommendedOffer,
      suggestedAudience: t.suggestedAudience,
      tonePreset: t.tonePreset,
      suggestedCTA: t.suggestedCTA,
      adAngle: t.adAngle,
      locked: !userCanAccessTemplate(currentPlan, t.tier),
    })),
  });
});

router.get("/templates/:slug", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const currentPlan = planIdFor(user);
  const t = findTemplate(req.params.slug);
  if (!t) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  const locked = !userCanAccessTemplate(currentPlan, t.tier);
  res.json({
    slug: t.slug,
    name: t.name,
    category: t.category,
    tier: t.tier,
    description: t.description,
    recommendedOffer: t.recommendedOffer,
    suggestedAudience: t.suggestedAudience,
    tonePreset: t.tonePreset,
    landingPageStructure: t.landingPageStructure,
    adAngle: t.adAngle,
    suggestedCTA: t.suggestedCTA,
    launchChecklist: t.launchChecklist,
    socialHooks: t.socialHooks,
    // Withhold the prefill payload for tier-locked templates so a user must upgrade
    // (or just hand-type the inputs) — preview content is still visible.
    prefill: locked ? null : t.prefill,
    locked,
    currentPlan,
  });
});

export default router;
