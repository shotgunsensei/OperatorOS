import type { Express } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { requireTenant, requireRole } from "../../authz";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";
import { emitEvent } from "../../core/events/helpers";
import { z } from "zod";
import { insertTicketSchema, insertTicketCommentSchema } from "@shared/schema";

export function registerTicketRoutes(app: Express) {
  app.get(
    "/api/tickets",
    isAuthenticated,
    requireTenant(),
    async (req: any, res) => {
      try {
        const { tenantId, role } = req.tenantCtx;
        if (role === "CLIENT") {
          return res.status(403).json({ message: "Forbidden" });
        }
        const filters = {
          status: req.query.status as string | undefined,
          priority: req.query.priority as string | undefined,
          assignedToId: req.query.assignedToId as string | undefined,
          clientId: req.query.clientId as string | undefined,
          query: req.query.q as string | undefined,
        };
        const tickets = await storage.getTicketsByTenant(tenantId, filters);
        res.json(tickets);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.get(
    "/api/tickets/:id",
    isAuthenticated,
    requireTenant(),
    async (req: any, res) => {
      try {
        const { tenantId, role } = req.tenantCtx;
        if (role === "CLIENT") {
          return res.status(403).json({ message: "Forbidden" });
        }
        const ticket = await storage.getTicketById(tenantId, req.params.id);
        if (!ticket) {
          return res.status(404).json({ message: "Ticket not found" });
        }
        res.json(ticket);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.post(
    "/api/tickets",
    isAuthenticated,
    requireTenant(),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId, role } = req.tenantCtx;
        if (role === "CLIENT") {
          return res.status(403).json({ message: "Forbidden" });
        }

        const schema = z.object({
          title: z.string().min(1, "Title is required"),
          description: z.string().optional(),
          priority: z.enum(["critical", "high", "medium", "low"]).optional(),
          status: z.enum(["open", "in_progress", "waiting_on_client", "resolved", "closed"]).optional(),
          clientId: z.string().nullable().optional(),
          siteId: z.string().nullable().optional(),
          assetId: z.string().nullable().optional(),
          assignedToId: z.string().nullable().optional(),
          slaProfileId: z.string().nullable().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const number = await storage.getNextTicketNumber(tenantId);

        let responseDeadline: Date | undefined;
        let resolutionDeadline: Date | undefined;

        if (parsed.data.slaProfileId) {
          const sla = await storage.getSlaProfileById(tenantId, parsed.data.slaProfileId);
          if (sla) {
            const priority = parsed.data.priority || "medium";
            const now = new Date();
            const responseMinutes = sla[`${priority}ResponseMinutes` as keyof typeof sla] as number;
            const resolutionMinutes = sla[`${priority}ResolutionMinutes` as keyof typeof sla] as number;
            responseDeadline = new Date(now.getTime() + responseMinutes * 60000);
            resolutionDeadline = new Date(now.getTime() + resolutionMinutes * 60000);
          }
        }

        const ticket = await storage.createTicket({
          tenantId,
          number,
          title: parsed.data.title,
          description: parsed.data.description || null,
          priority: parsed.data.priority || "medium",
          status: parsed.data.status || "open",
          clientId: parsed.data.clientId || null,
          siteId: parsed.data.siteId || null,
          assetId: parsed.data.assetId || null,
          assignedToId: parsed.data.assignedToId || null,
          createdById: userId,
          slaProfileId: parsed.data.slaProfileId || null,
          responseDeadline: responseDeadline || null,
          resolutionDeadline: resolutionDeadline || null,
          respondedAt: null,
          resolvedAt: null,
          closedAt: null,
        });

        emitEvent("ticket.created", tenantId, userId, "ticket", ticket.id, { number: ticket.number, title: ticket.title, priority: ticket.priority });

        res.status(201).json(ticket);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.patch(
    "/api/tickets/:id",
    isAuthenticated,
    requireTenant(),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId, role } = req.tenantCtx;
        if (role === "CLIENT") {
          return res.status(403).json({ message: "Forbidden" });
        }

        const existing = await storage.getTicketById(tenantId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Ticket not found" });
        }

        const schema = z.object({
          title: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          priority: z.enum(["critical", "high", "medium", "low"]).optional(),
          status: z.enum(["open", "in_progress", "waiting_on_client", "resolved", "closed"]).optional(),
          clientId: z.string().nullable().optional(),
          siteId: z.string().nullable().optional(),
          assetId: z.string().nullable().optional(),
          assignedToId: z.string().nullable().optional(),
          slaProfileId: z.string().nullable().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const updates: any = { ...parsed.data };

        if (parsed.data.status === "resolved" && existing.status !== "resolved") {
          updates.resolvedAt = new Date();
        }
        if (parsed.data.status === "closed" && existing.status !== "closed") {
          updates.closedAt = new Date();
        }
        if (parsed.data.status === "in_progress" && !existing.respondedAt) {
          updates.respondedAt = new Date();
        }

        const updated = await storage.updateTicket(tenantId, req.params.id, updates);

        emitEvent("ticket.updated", tenantId, userId, "ticket", req.params.id, { changes: Object.keys(parsed.data) });

        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.delete(
    "/api/tickets/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        await storage.deleteTicket(tenantId, req.params.id);

        emitEvent("ticket.deleted", tenantId, userId, "ticket", req.params.id);

        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.post(
    "/api/tickets/bulk-delete",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
          return res.status(400).json({ message: "ids array required" });
        }
        const count = await storage.deleteTickets(tenantId, ids);

        emitEvent("ticket.bulk_deleted", tenantId, userId, "ticket", undefined, { count, ids });

        res.json({ deleted: count });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.get(
    "/api/tickets/:ticketId/comments",
    isAuthenticated,
    requireTenant(),
    async (req: any, res) => {
      try {
        const { tenantId, role } = req.tenantCtx;
        const comments = await storage.getCommentsByTicket(tenantId, req.params.ticketId);
        if (role === "CLIENT") {
          return res.json(comments.filter((c: any) => !c.isInternal));
        }
        res.json(comments);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.post(
    "/api/tickets/:ticketId/comments",
    isAuthenticated,
    requireTenant(),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId, role } = req.tenantCtx;

        const schema = z.object({
          content: z.string().min(1, "Comment cannot be empty"),
          isInternal: z.boolean().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        if (role === "CLIENT" && parsed.data.isInternal) {
          return res.status(403).json({ message: "Clients cannot create internal notes" });
        }

        const comment = await storage.createTicketComment({
          tenantId,
          ticketId: req.params.ticketId,
          userId,
          content: parsed.data.content,
          isInternal: parsed.data.isInternal || false,
        });

        emitEvent("ticket.comment_added", tenantId, userId, "ticket_comment", comment.id, { ticketId: req.params.ticketId, isInternal: comment.isInternal });

        res.status(201).json(comment);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.patch(
    "/api/tickets/:ticketId/comments/:commentId",
    isAuthenticated,
    requireTenant(),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const schema = z.object({
          content: z.string().min(1).optional(),
          isInternal: z.boolean().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }
        const updated = await storage.updateTicketComment(tenantId, req.params.commentId, parsed.data);
        if (!updated) {
          return res.status(404).json({ message: "Comment not found" });
        }

        emitEvent("ticket.comment_updated", tenantId, userId, "ticket_comment", req.params.commentId);

        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.delete(
    "/api/tickets/:ticketId/comments/:commentId",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        await storage.deleteTicketComment(tenantId, req.params.commentId);

        emitEvent("ticket.comment_deleted", tenantId, userId, "ticket_comment", req.params.commentId);

        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.get(
    "/api/sla-profiles",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    async (req: any, res) => {
      try {
        const { tenantId } = req.tenantCtx;
        const profiles = await storage.getSlaProfilesByTenant(tenantId);
        res.json(profiles);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.post(
    "/api/sla-profiles",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const schema = z.object({
          name: z.string().min(1, "Name is required"),
          description: z.string().optional(),
          criticalResponseMinutes: z.number().int().positive().optional(),
          criticalResolutionMinutes: z.number().int().positive().optional(),
          highResponseMinutes: z.number().int().positive().optional(),
          highResolutionMinutes: z.number().int().positive().optional(),
          mediumResponseMinutes: z.number().int().positive().optional(),
          mediumResolutionMinutes: z.number().int().positive().optional(),
          lowResponseMinutes: z.number().int().positive().optional(),
          lowResolutionMinutes: z.number().int().positive().optional(),
          isDefault: z.boolean().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const profile = await storage.createSlaProfile({
          tenantId,
          ...parsed.data,
          name: parsed.data.name,
        } as any);

        emitEvent("sla_profile.created", tenantId, userId, "sla_profile", profile.id, { name: profile.name });

        res.status(201).json(profile);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.patch(
    "/api/sla-profiles/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const updated = await storage.updateSlaProfile(tenantId, req.params.id, req.body);
        if (!updated) {
          return res.status(404).json({ message: "SLA profile not found" });
        }

        emitEvent("sla_profile.updated", tenantId, userId, "sla_profile", req.params.id);

        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.delete(
    "/api/sla-profiles/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        await storage.deleteSlaProfile(tenantId, req.params.id);

        emitEvent("sla_profile.deleted", tenantId, userId, "sla_profile", req.params.id);

        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.get(
    "/api/members",
    isAuthenticated,
    requireTenant(),
    async (req: any, res) => {
      try {
        const { tenantId } = req.tenantCtx;
        const members = await storage.getMembersByTenant(tenantId);
        res.json(members);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );
}
