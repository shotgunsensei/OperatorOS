import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg } from "../middleware";

const router = Router();

router.get("/api/notifications", requireAuth, requireOrg, async (req, res) => {
  try {
    const notifs = await storage.getUserNotifications(req.session.orgId!, req.session.userId!);
    res.json(notifs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/notifications/unread-count", requireAuth, requireOrg, async (req, res) => {
  try {
    const count = await storage.getUnreadNotificationCount(req.session.orgId!, req.session.userId!);
    res.json({ count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/notifications/:id/read", requireAuth, requireOrg, async (req, res) => {
  try {
    await storage.markNotificationRead(req.session.orgId!, req.session.userId!, (req.params.id as string));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/notifications/read-all", requireAuth, requireOrg, async (req, res) => {
  try {
    await storage.markAllNotificationsRead(req.session.orgId!, req.session.userId!);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
