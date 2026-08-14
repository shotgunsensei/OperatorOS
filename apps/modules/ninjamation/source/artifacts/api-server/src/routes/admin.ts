import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { storage } from "../storage";
import { syncFromGithub } from "../githubSync";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await storage.getUser(req.user.id);
  if (!user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  next();
}

router.get("/admin/stats", requireAdmin, async (_req, res) => {
  try {
    const stats = await storage.getStats();
    res.json(stats);
  } catch (err) {
    logger.error({ error: err }, "Failed to get admin stats");
    res.status(500).json({ error: "Failed to get stats" });
  }
});

router.get("/admin/users", requireAdmin, async (req, res) => {
  try {
    const { search, page, limit } = req.query;
    const pageNum = Math.max(1, Math.min(1000, Number(page) || 1));
    const limitNum = Math.max(1, Math.min(100, Number(limit) || 20));
    const result = await storage.listUsers({
      search: typeof search === "string" ? search : undefined,
      page: pageNum,
      limit: limitNum,
    });
    res.json(result);
  } catch (err) {
    logger.error({ error: err }, "Failed to list users");
    res.status(500).json({ error: "Failed to list users" });
  }
});

router.get("/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const user = await storage.getUser(String(req.params.id));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (err) {
    logger.error({ error: err }, "Failed to get user");
    res.status(500).json({ error: "Failed to get user" });
  }
});

router.patch("/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const { email, firstName, lastName, subscriptionTier, stripeSubscriptionId, stripeCustomerId, isAdmin } = req.body;
    const user = await storage.updateUser(String(req.params.id), {
      email,
      firstName,
      lastName,
      subscriptionTier: subscriptionTier ?? undefined,
      stripeSubscriptionId: stripeSubscriptionId ?? undefined,
      stripeCustomerId: stripeCustomerId ?? undefined,
      isAdmin: isAdmin ?? undefined,
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (err) {
    logger.error({ error: err }, "Failed to update user");
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const targetUser = await storage.getUser(String(req.params.id));
    if (!targetUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (targetUser.id === req.user!.id) {
      res.status(400).json({ error: "Cannot delete your own account" });
      return;
    }
    await storage.deleteUser(String(req.params.id));
    res.json({ success: true });
  } catch (err) {
    logger.error({ error: err }, "Failed to delete user");
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.get("/admin/scripts", requireAdmin, async (req, res) => {
  try {
    const { search, format, category, page, limit } = req.query;
    const pageNum = Math.max(1, Math.min(1000, Number(page) || 1));
    const limitNum = Math.max(1, Math.min(100, Number(limit) || 50));
    const result = await storage.listScripts({
      search: typeof search === "string" ? search : undefined,
      format: typeof format === "string" ? format : undefined,
      category: typeof category === "string" ? category : undefined,
      page: pageNum,
      limit: limitNum,
    });
    res.json(result);
  } catch (err) {
    logger.error({ error: err }, "Failed to list scripts (admin)");
    res.status(500).json({ error: "Failed to list scripts" });
  }
});

router.patch("/admin/scripts/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description, content, fileName, format, category } = req.body;
    const script = await storage.updateScript(id, {
      name,
      description,
      content,
      fileName,
      format,
      category,
    });
    if (!script) {
      res.status(404).json({ error: "Script not found" });
      return;
    }
    res.json(script);
  } catch (err) {
    logger.error({ error: err }, "Failed to update script");
    res.status(500).json({ error: "Failed to update script" });
  }
});

router.delete("/admin/scripts/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const script = await storage.getScript(id);
    if (!script) {
      res.status(404).json({ error: "Script not found" });
      return;
    }
    await storage.deleteScript(id);
    res.json({ success: true });
  } catch (err) {
    logger.error({ error: err }, "Failed to delete script");
    res.status(500).json({ error: "Failed to delete script" });
  }
});

router.post("/admin/scripts", requireAdmin, async (req, res) => {
  try {
    const { name, description, content, fileName, format, category } = req.body;
    if (!name || !content || !fileName || !format) {
      res.status(400).json({ error: "name, content, fileName, and format are required" });
      return;
    }
    const script = await storage.createScript({
      name,
      description: description || "",
      content,
      fileName,
      format,
      category: category || "general",
      source: "admin",
    });
    res.status(201).json(script);
  } catch (err) {
    logger.error({ error: err }, "Failed to create script");
    res.status(500).json({ error: "Failed to create script" });
  }
});

router.post("/admin/sync-github", requireAdmin, async (_req, res) => {
  try {
    const result = await syncFromGithub();
    res.json(result);
  } catch (err) {
    logger.error({ error: err }, "Failed to sync GitHub");
    res.status(500).json({ error: "Failed to sync GitHub" });
  }
});

router.get("/admin/check", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.json({ isAdmin: false });
    return;
  }
  const user = await storage.getUser(req.user.id);
  res.json({ isAdmin: user?.isAdmin ?? false });
});

export default router;
