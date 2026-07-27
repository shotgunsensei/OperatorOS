import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { storage } from "../storage";
import { syncFromGithub } from "../githubSync";
import {
  ListScriptsResponse,
  GetScriptResponse,
  GetScriptFormatsResponse,
  SyncScriptsFromGithubResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const VALID_TIERS = new Set(['starter', 'pro', 'enterprise']);

async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await storage.getUser(req.user.id);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  if (!user.subscriptionTier || !VALID_TIERS.has(user.subscriptionTier)) {
    res.status(403).json({ error: "Active subscription required" });
    return;
  }

  if (user.stripeSubscriptionId) {
    try {
      const subscription = await storage.getSubscription(user.stripeSubscriptionId);
      const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
      if (!isActive) {
        res.status(403).json({ error: "Active subscription required" });
        return;
      }
    } catch {
    }
  }

  next();
}

router.get("/scripts/formats", async (_req, res) => {
  try {
    const data = await storage.getFormatsAndCategories();
    const response = GetScriptFormatsResponse.parse(data);
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: "Failed to get formats" });
  }
});

router.get("/scripts", requireActiveSubscription, async (req, res) => {
  try {
    const { format, category, search, page, limit } = req.query;
    const result = await storage.listScripts({
      format: format as string | undefined,
      category: category as string | undefined,
      search: search as string | undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });

    const response = ListScriptsResponse.parse({
      scripts: result.scripts.map(s => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
      })),
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
    res.json(response);
  } catch (err) {
    req.log.error({ error: err }, "Failed to list scripts");
    res.status(500).json({ error: "Failed to list scripts" });
  }
});

router.get("/scripts/:id", requireActiveSubscription, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const script = await storage.getScript(id);

    if (!script) {
      res.status(404).json({ error: "Script not found" });
      return;
    }

    const response = GetScriptResponse.parse({
      ...script,
      createdAt: script.createdAt.toISOString(),
    });
    res.json(response);
  } catch (err) {
    req.log.error({ error: err }, "Failed to get script");
    res.status(500).json({ error: "Failed to get script" });
  }
});

router.get("/scripts/:id/download", requireActiveSubscription, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const script = await storage.getScript(id);

    if (!script) {
      res.status(404).json({ error: "Script not found" });
      return;
    }

    await storage.incrementDownloadCount(id);

    res.setHeader('Content-Disposition', `attachment; filename="${script.fileName}"`);
    res.setHeader('Content-Type', 'text/plain');
    res.send(script.content);
  } catch (err) {
    req.log.error({ error: err }, "Failed to download script");
    res.status(500).json({ error: "Failed to download script" });
  }
});

router.post("/scripts/sync", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await storage.getUser(req.user.id);
  if (!user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  try {
    const result = await syncFromGithub();
    const response = SyncScriptsFromGithubResponse.parse(result);
    res.json(response);
  } catch (err) {
    req.log.error({ error: err }, "Failed to sync scripts");
    res.status(500).json({ error: "Failed to sync scripts" });
  }
});

export default router;
