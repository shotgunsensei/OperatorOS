import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, requireMinRole } from "../middleware";

const router = Router();

router.get("/api/vendors", requireAuth, requireOrg, async (req, res) => {
  try {
    const result = await storage.getVendors(req.session.orgId!);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/vendors/:id", requireAuth, requireOrg, async (req, res) => {
  try {
    const v = await storage.getVendor(req.session.orgId!, (req.params.id as string));
    if (!v) return res.status(404).json({ error: "Vendor not found" });
    res.json(v);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/vendors", requireAuth, requireOrg, requireMinRole("supervisor"), async (req, res) => {
  try {
    if (!req.body.name?.trim()) return res.status(400).json({ error: "Vendor name required" });
    const v = await storage.createVendor(req.session.orgId!, req.body);
    res.json(v);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/vendors/:id", requireAuth, requireOrg, requireMinRole("supervisor"), async (req, res) => {
  try {
    const v = await storage.updateVendor(req.session.orgId!, (req.params.id as string), req.body);
    if (!v) return res.status(404).json({ error: "Vendor not found" });
    res.json(v);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/vendors/:id", requireAuth, requireOrg, requireMinRole("admin"), async (req, res) => {
  try {
    const deleted = await storage.deleteVendor(req.session.orgId!, (req.params.id as string));
    if (!deleted) return res.status(404).json({ error: "Vendor not found" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
