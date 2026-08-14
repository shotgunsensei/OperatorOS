import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, requireMinRole } from "../middleware";

const router = Router();

router.get("/api/onboarding", requireAuth, requireOrg, async (req, res) => {
  try {
    const orgId = req.session.orgId!;
    await storage.seedOnboardingItems(orgId);

    const items = await storage.getOnboardingItems(orgId);
    const counts = await storage.getOrgCounts(orgId);
    const vendors = await storage.getVendors(orgId);

    const autoCompleteMap: Record<string, boolean> = {
      assets: counts.assets > 0,
      vendors: vendors.length > 0,
      members: counts.members > 1,
      tickets: counts.tickets > 0,
    };

    const enriched = items.map((item) => {
      const autoKey = item.autoCompleteKey;
      const systemComplete = autoKey ? autoCompleteMap[autoKey] === true : false;

      if (systemComplete && item.status === "pending") {
        storage.updateOnboardingItem(orgId, item.id, {
          status: "complete" as any,
          completionSource: "auto",
          completedAt: new Date(),
        }).catch(() => {});

        return {
          ...item,
          status: "complete",
          completionSource: "auto",
          completedAt: new Date().toISOString(),
          systemComplete,
        };
      }

      return { ...item, systemComplete };
    });

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/onboarding", requireAuth, requireOrg, requireMinRole("admin"), async (req, res) => {
  try {
    const orgId = req.session.orgId!;
    const { title, description, route, sortOrder } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Title is required" });

    const item = await storage.createOnboardingItem(orgId, {
      title: title.trim(),
      description: description || "",
      route: route || "",
      sortOrder: sortOrder || 99,
    });
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/onboarding/:id", requireAuth, requireOrg, requireMinRole("admin"), async (req, res) => {
  try {
    const orgId = req.session.orgId!;
    const id = req.params.id as string;
    const updates: any = {};

    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.route !== undefined) updates.route = req.body.route;
    if (req.body.sortOrder !== undefined) updates.sortOrder = req.body.sortOrder;
    if (req.body.status !== undefined) updates.status = req.body.status;

    const item = await storage.updateOnboardingItem(orgId, id, updates);
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/onboarding/:id/complete", requireAuth, requireOrg, requireMinRole("admin"), async (req, res) => {
  try {
    const orgId = req.session.orgId!;
    const id = req.params.id as string;
    const item = await storage.updateOnboardingItem(orgId, id, {
      status: "complete" as any,
      completionSource: "manual",
      completedBy: req.session.userId,
      completedAt: new Date(),
    });
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/onboarding/:id/skip", requireAuth, requireOrg, requireMinRole("admin"), async (req, res) => {
  try {
    const orgId = req.session.orgId!;
    const id = req.params.id as string;
    const item = await storage.updateOnboardingItem(orgId, id, {
      status: "skipped" as any,
      dismissedAt: new Date(),
    });
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/onboarding/reorder", requireAuth, requireOrg, requireMinRole("admin"), async (req, res) => {
  try {
    const orgId = req.session.orgId!;
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: "Order array required" });

    for (let i = 0; i < order.length; i++) {
      await storage.updateOnboardingItem(orgId, order[i], { sortOrder: i + 1 });
    }
    const items = await storage.getOnboardingItems(orgId);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
