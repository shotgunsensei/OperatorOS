import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, requireMinRole } from "../middleware";

const router = Router();

router.get("/api/supply-requests", requireAuth, requireOrg, async (req, res) => {
  try {
    const result = await storage.getSupplyRequests(req.session.orgId!);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/supply-requests/:id", requireAuth, requireOrg, async (req, res) => {
  try {
    const s = await storage.getSupplyRequest(req.session.orgId!, (req.params.id as string));
    if (!s) return res.status(404).json({ error: "Supply request not found" });
    res.json(s);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/supply-requests", requireAuth, requireOrg, requireMinRole("staff"), async (req, res) => {
  try {
    const data = { ...req.body };
    if (!data.itemName?.trim()) return res.status(400).json({ error: "Item name required" });
    data.departmentId = data.departmentId || null;
    const s = await storage.createSupplyRequest(req.session.orgId!, data, req.session.userId!);
    res.json(s);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/supply-requests/:id", requireAuth, requireOrg, requireMinRole("technician"), async (req, res) => {
  try {
    const data = { ...req.body };
    if ("departmentId" in data) data.departmentId = data.departmentId || null;
    const s = await storage.updateSupplyRequest(req.session.orgId!, (req.params.id as string), data);
    if (!s) return res.status(404).json({ error: "Supply request not found" });
    res.json(s);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/supply-requests/:id", requireAuth, requireOrg, requireMinRole("supervisor"), async (req, res) => {
  try {
    const deleted = await storage.deleteSupplyRequest(req.session.orgId!, (req.params.id as string));
    if (!deleted) return res.status(404).json({ error: "Supply request not found" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
