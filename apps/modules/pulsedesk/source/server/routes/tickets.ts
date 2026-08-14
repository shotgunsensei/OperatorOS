import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireOrg, requireMinRole } from "../middleware";
import {
  getCurrentEntitlementSnapshotForRequest,
  snapshotNumericLimit,
} from "../services/operatorosEntitlements";

const router = Router();

router.get("/api/tickets", requireAuth, requireOrg, async (req, res) => {
  try {
    const result = await storage.getTickets(req.session.orgId!);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/tickets/:id", requireAuth, requireOrg, async (req, res) => {
  try {
    const t = await storage.getTicket(req.session.orgId!, (req.params.id as string));
    if (!t) return res.status(404).json({ error: "Ticket not found" });
    res.json(t);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/tickets/:id/events", requireAuth, requireOrg, async (req, res) => {
  try {
    const events = await storage.getTicketEvents(req.session.orgId!, (req.params.id as string));
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/tickets", requireAuth, requireOrg, requireMinRole("staff"), async (req, res) => {
  try {
    const snapshot = await getCurrentEntitlementSnapshotForRequest(req, {
      refreshIfMissing: true,
      refreshIfStale: true,
    });
    const maxTickets = snapshotNumericLimit(snapshot, "maxTickets");
    if (maxTickets !== null) {
      const counts = await storage.getOrgCounts(req.session.orgId!);
      if (counts.tickets >= maxTickets) {
        return res.status(403).json({ error: `Ticket limit reached (${maxTickets}). Update the OperatorOS entitlement for more.` });
      }
    }

    const data = { ...req.body };
    if (!data.title?.trim() || data.title.trim().length < 3) {
      return res.status(400).json({ error: "Title is required (minimum 3 characters)" });
    }
    if (!data.category) {
      return res.status(400).json({ error: "Category is required" });
    }
    if (!data.priority) {
      return res.status(400).json({ error: "Priority is required" });
    }
    data.title = data.title.trim();
    data.description = data.description?.trim() || "";
    data.departmentId = data.departmentId || null;
    data.assetId = data.assetId || null;
    data.assignedTo = data.assignedTo || null;
    data.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    data.vendorContactedAt = data.vendorContactedAt ? new Date(data.vendorContactedAt) : null;
    data.vendorExpectedFollowUpAt = data.vendorExpectedFollowUpAt ? new Date(data.vendorExpectedFollowUpAt) : null;
    const t = await storage.createTicket(req.session.orgId!, data, req.session.userId!);

    storage.notifyOrgMembers(
      req.session.orgId!, req.session.userId!,
      "ticket_created",
      "New ticket created",
      `${t.ticketNumber} — ${t.title}`,
      t.id,
      data.assignedTo || null
    );

    res.json(t);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/tickets/:id", requireAuth, requireOrg, requireMinRole("technician"), async (req, res) => {
  try {
    const data = { ...req.body };
    if ("dueDate" in data) data.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if ("vendorContactedAt" in data) data.vendorContactedAt = data.vendorContactedAt ? new Date(data.vendorContactedAt) : null;
    if ("vendorExpectedFollowUpAt" in data) data.vendorExpectedFollowUpAt = data.vendorExpectedFollowUpAt ? new Date(data.vendorExpectedFollowUpAt) : null;
    if ("departmentId" in data) data.departmentId = data.departmentId || null;
    if ("assetId" in data) data.assetId = data.assetId || null;
    if ("assignedTo" in data) data.assignedTo = data.assignedTo || null;

    const oldTicket = await storage.getTicket(req.session.orgId!, (req.params.id as string));
    const t = await storage.updateTicket(req.session.orgId!, (req.params.id as string), data);
    if (!t) return res.status(404).json({ error: "Ticket not found" });

    if (data.status && oldTicket && data.status !== oldTicket.status) {
      await storage.createTicketEvent(req.session.orgId!, t.id, "status_change", `Status changed from ${oldTicket.status} to ${data.status}`, req.session.userId!);

      const notifType = data.status === "escalated" ? "ticket_escalated" : "ticket_status_changed";
      storage.notifyOrgMembers(
        req.session.orgId!, req.session.userId!,
        notifType,
        data.status === "escalated" ? "Ticket escalated" : "Ticket status updated",
        `${oldTicket.ticketNumber} — ${data.status === "escalated" ? "Requires review" : `Now ${data.status.replace(/_/g, " ")}`}`,
        t.id,
        oldTicket.assignedTo || null
      );
    }
    if (data.assignedTo && oldTicket && data.assignedTo !== oldTicket.assignedTo) {
      await storage.createTicketEvent(req.session.orgId!, t.id, "assignment", `Ticket reassigned`, req.session.userId!);

      storage.notifyOrgMembers(
        req.session.orgId!, req.session.userId!,
        "ticket_assigned",
        "Ticket assigned to you",
        `${oldTicket.ticketNumber} — ${oldTicket.title}`,
        t.id,
        data.assignedTo
      );
    }
    if (oldTicket && "vendorReference" in data && data.vendorReference !== oldTicket.vendorReference) {
      await storage.createTicketEvent(req.session.orgId!, t.id, "vendor_reference", `Vendor reference updated: ${data.vendorReference || "cleared"}`, req.session.userId!);
    }
    if (oldTicket && "vendorContactedAt" in data) {
      await storage.createTicketEvent(
        req.session.orgId!,
        t.id,
        "vendor_contacted",
        data.vendorContactedAt
          ? `Vendor contacted on ${new Date(data.vendorContactedAt).toLocaleDateString("en-US")}`
          : "Vendor contacted date cleared",
        req.session.userId!
      );
    }
    if (oldTicket && "vendorExpectedFollowUpAt" in data) {
      await storage.createTicketEvent(
        req.session.orgId!,
        t.id,
        "vendor_followup",
        data.vendorExpectedFollowUpAt
          ? `Vendor follow-up expected ${new Date(data.vendorExpectedFollowUpAt).toLocaleDateString("en-US")}`
          : "Vendor follow-up date cleared",
        req.session.userId!
      );
    }

    res.json(t);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/tickets/:id/notes", requireAuth, requireOrg, requireMinRole("staff"), async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "Note content required" });
    const ticket = await storage.getTicket(req.session.orgId!, (req.params.id as string));
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const event = await storage.createTicketEvent(req.session.orgId!, ticket.id, "note", content, req.session.userId!);

    storage.notifyOrgMembers(
      req.session.orgId!, req.session.userId!,
      "ticket_note_added",
      "Note added to ticket",
      `${ticket.ticketNumber} — New update`,
      ticket.id,
      ticket.assignedTo || null
    );

    res.json(event);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/tickets/:id", requireAuth, requireOrg, requireMinRole("supervisor"), async (req, res) => {
  try {
    const deleted = await storage.deleteTicket(req.session.orgId!, (req.params.id as string));
    if (!deleted) return res.status(404).json({ error: "Ticket not found" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/dashboard", requireAuth, requireOrg, async (req, res) => {
  try {
    const stats = await storage.getDashboardStats(req.session.orgId!);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
