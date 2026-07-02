import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, requireMinRole } from "../middleware";

const router = Router();

router.get("/api/facility-requests", requireAuth, requireOrg, async (req, res) => {
  try {
    const result = await storage.getFacilityRequests(req.session.orgId!);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/facility-requests/:id", requireAuth, requireOrg, async (req, res) => {
  try {
    const f = await storage.getFacilityRequest(req.session.orgId!, (req.params.id as string));
    if (!f) return res.status(404).json({ error: "Facility request not found" });
    res.json(f);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/facility-requests", requireAuth, requireOrg, requireMinRole("staff"), async (req, res) => {
  try {
    const data = { ...req.body };
    if (!data.title?.trim()) return res.status(400).json({ error: "Title required" });
    data.assignedTo = data.assignedTo || null;
    const f = await storage.createFacilityRequest(req.session.orgId!, data, req.session.userId!);
    res.json(f);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/facility-requests/:id", requireAuth, requireOrg, requireMinRole("technician"), async (req, res) => {
  try {
    const data = { ...req.body };
    if ("assignedTo" in data) data.assignedTo = data.assignedTo || null;
    const f = await storage.updateFacilityRequest(req.session.orgId!, (req.params.id as string), data);
    if (!f) return res.status(404).json({ error: "Facility request not found" });
    res.json(f);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/facility-requests/:id", requireAuth, requireOrg, requireMinRole("supervisor"), async (req, res) => {
  try {
    const deleted = await storage.deleteFacilityRequest(req.session.orgId!, (req.params.id as string));
    if (!deleted) return res.status(404).json({ error: "Facility request not found" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
