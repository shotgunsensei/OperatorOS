import type { Express } from "express";
import { requireTenant } from "../../authz";
import { storage } from "../../storage";
import { and, eq, inArray, desc, ne } from "drizzle-orm";
import { db } from "../../db";
import { evidenceItems, clients, sites, assets, tags, tickets, ticketComments, invoices, invoiceLineItems } from "@shared/schema";
import { requireFeature } from "../../core/billing/enforcePlan";
import { emitEvent } from "../../core/events/helpers";
import { z } from "zod";
import { users } from "@shared/models/auth";

export function registerPortalRoutes(app: Express) {
  const isAuthenticated = requireTenant();

  app.get("/api/portal/me", isAuthenticated, requireFeature("portal"), async (req: any, res) => {
    try {
      const { userId, tenantId, role } = req.tenantCtx;
      if (role !== "CLIENT") {
        return res.status(403).json({ message: "Portal is for CLIENT role users only" });
      }

      const membership = await storage.getUserMembership(userId);
      const tenant = await storage.getTenantById(tenantId);

      res.json({
        userId,
        role,
        tenant: tenant ? { id: tenant.id, name: tenant.name } : null,
      });
    } catch (err: any) {
      console.error("[portal] GET /me error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/portal/clients", isAuthenticated, requireFeature("portal"), async (req: any, res) => {
    try {
      const { userId, tenantId, role } = req.tenantCtx;
      if (role !== "CLIENT") {
        return res.status(403).json({ message: "Portal is for CLIENT role users only" });
      }

      const allowedClientIds = await storage.getClientIdsForUser(userId);
      if (allowedClientIds.length === 0) {
        return res.json([]);
      }

      const clientList = await db
        .select()
        .from(clients)
        .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, allowedClientIds)));

      res.json(clientList);
    } catch (err: any) {
      console.error("[portal] GET /clients error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/portal/clients/:id", isAuthenticated, requireFeature("portal"), async (req: any, res) => {
    try {
      const { userId, tenantId, role } = req.tenantCtx;
      if (role !== "CLIENT") {
        return res.status(403).json({ message: "Portal is for CLIENT role users only" });
      }

      const clientId = req.params.id;
      const allowedClientIds = await storage.getClientIdsForUser(userId);
      if (!allowedClientIds.includes(clientId)) {
        return res.status(403).json({ message: "Access denied to this client" });
      }

      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.tenantId, tenantId), eq(clients.id, clientId)));

      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }

      const clientSites = await db
        .select()
        .from(sites)
        .where(and(eq(sites.tenantId, tenantId), eq(sites.clientId, clientId)));

      const clientAssets = await db
        .select()
        .from(assets)
        .where(and(eq(assets.tenantId, tenantId), eq(assets.clientId, clientId)));

      res.json({ ...client, sites: clientSites, assets: clientAssets });
    } catch (err: any) {
      console.error("[portal] GET /clients/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/portal/evidence", isAuthenticated, requireFeature("portal"), async (req: any, res) => {
    try {
      const { userId, tenantId, role } = req.tenantCtx;
      if (role !== "CLIENT") {
        return res.status(403).json({ message: "Portal is for CLIENT role users only" });
      }

      const allowedClientIds = await storage.getClientIdsForUser(userId);
      if (allowedClientIds.length === 0) {
        return res.json([]);
      }

      const search = req.query.q as string | undefined;
      const clientFilter = req.query.clientId as string | undefined;

      let filterClientIds = allowedClientIds;
      if (clientFilter) {
        if (!allowedClientIds.includes(clientFilter)) {
          return res.status(403).json({ message: "Access denied to this client" });
        }
        filterClientIds = [clientFilter];
      }

      const results = await db
        .select({
          id: evidenceItems.id,
          tenantId: evidenceItems.tenantId,
          clientId: evidenceItems.clientId,
          siteId: evidenceItems.siteId,
          assetId: evidenceItems.assetId,
          title: evidenceItems.title,
          notes: evidenceItems.notes,
          fileName: evidenceItems.fileName,
          fileType: evidenceItems.fileType,
          fileSize: evidenceItems.fileSize,
          sha256: evidenceItems.sha256,
          tagIds: evidenceItems.tagIds,
          uploadedById: evidenceItems.uploadedById,
          createdAt: evidenceItems.createdAt,
          clientName: clients.name,
          assetName: assets.name,
          siteName: sites.name,
        })
        .from(evidenceItems)
        .leftJoin(clients, eq(evidenceItems.clientId, clients.id))
        .leftJoin(assets, eq(evidenceItems.assetId, assets.id))
        .leftJoin(sites, eq(evidenceItems.siteId, sites.id))
        .where(
          and(
            eq(evidenceItems.tenantId, tenantId),
            inArray(evidenceItems.clientId, filterClientIds)
          )
        )
        .orderBy(desc(evidenceItems.createdAt));

      let items = results;
      if (search) {
        const lower = search.toLowerCase();
        items = results.filter(
          (item) =>
            item.title.toLowerCase().includes(lower) ||
            item.fileName.toLowerCase().includes(lower) ||
            (item.notes && item.notes.toLowerCase().includes(lower))
        );
      }

      const allTagIds = new Set<string>();
      items.forEach((item) => {
        if (item.tagIds) {
          item.tagIds.forEach((id) => allTagIds.add(id));
        }
      });

      let tagMap: Record<string, string> = {};
      if (allTagIds.size > 0) {
        const tagRecords = await db
          .select({ id: tags.id, name: tags.name })
          .from(tags)
          .where(inArray(tags.id, Array.from(allTagIds)));
        tagRecords.forEach((t) => {
          tagMap[t.id] = t.name;
        });
      }

      const itemsWithTags = items.map((item) => ({
        ...item,
        tags: (item.tagIds || []).map((id) => ({ id, name: tagMap[id] || id })),
      }));

      res.json(itemsWithTags);
    } catch (err: any) {
      console.error("[portal] GET /evidence error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/portal/tickets", isAuthenticated, requireFeature("portal"), async (req: any, res) => {
    try {
      const { userId, tenantId, role } = req.tenantCtx;
      if (role !== "CLIENT") {
        return res.status(403).json({ message: "Portal is for CLIENT role users only" });
      }

      const allowedClientIds = await storage.getClientIdsForUser(userId);
      if (allowedClientIds.length === 0) {
        return res.json([]);
      }

      const results = await db
        .select({
          id: tickets.id,
          title: tickets.title,
          status: tickets.status,
          priority: tickets.priority,
          clientId: tickets.clientId,
          createdAt: tickets.createdAt,
          updatedAt: tickets.updatedAt,
        })
        .from(tickets)
        .where(
          and(
            eq(tickets.tenantId, tenantId),
            inArray(tickets.clientId, allowedClientIds)
          )
        )
        .orderBy(desc(tickets.createdAt));

      res.json(results);
    } catch (err: any) {
      console.error("[portal] GET /tickets error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/portal/tickets", isAuthenticated, requireFeature("portal"), async (req: any, res) => {
    try {
      const { userId, tenantId, role } = req.tenantCtx;
      if (role !== "CLIENT") {
        return res.status(403).json({ message: "Portal is for CLIENT role users only" });
      }

      const schema = z.object({
        title: z.string().min(1, "Title is required"),
        description: z.string().optional(),
        clientId: z.string().min(1, "Client is required"),
        priority: z.enum(["critical", "high", "medium", "low"]).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const allowedClientIds = await storage.getClientIdsForUser(userId);
      if (!allowedClientIds.includes(parsed.data.clientId)) {
        return res.status(403).json({ message: "Access denied to this client" });
      }

      const number = await storage.getNextTicketNumber(tenantId);

      const ticket = await storage.createTicket({
        tenantId,
        number,
        title: parsed.data.title,
        description: parsed.data.description || null,
        priority: parsed.data.priority || "medium",
        status: "open",
        clientId: parsed.data.clientId,
        siteId: null,
        assetId: null,
        assignedToId: null,
        createdById: userId,
        slaProfileId: null,
        responseDeadline: null,
        resolutionDeadline: null,
        respondedAt: null,
        resolvedAt: null,
        closedAt: null,
      });

      emitEvent("ticket.created", tenantId, userId, "ticket", ticket.id, { number: ticket.number, title: ticket.title, priority: ticket.priority });

      res.status(201).json(ticket);
    } catch (err: any) {
      console.error("[portal] POST /tickets error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/portal/tickets/:id/comments", isAuthenticated, requireFeature("portal"), async (req: any, res) => {
    try {
      const { userId, tenantId, role } = req.tenantCtx;
      if (role !== "CLIENT") {
        return res.status(403).json({ message: "Portal is for CLIENT role users only" });
      }

      const ticketId = req.params.id;
      const ticket = await storage.getTicketById(tenantId, ticketId);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const allowedClientIds = await storage.getClientIdsForUser(userId);
      if (!ticket.clientId || !allowedClientIds.includes(ticket.clientId)) {
        return res.status(403).json({ message: "Access denied to this ticket" });
      }

      const allComments = await storage.getCommentsByTicket(tenantId, ticketId);
      const publicComments = allComments.filter((c: any) => !c.isInternal);

      res.json(publicComments);
    } catch (err: any) {
      console.error("[portal] GET /tickets/:id/comments error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/portal/tickets/:id/comments", isAuthenticated, requireFeature("portal"), async (req: any, res) => {
    try {
      const { userId, tenantId, role } = req.tenantCtx;
      if (role !== "CLIENT") {
        return res.status(403).json({ message: "Portal is for CLIENT role users only" });
      }

      const ticketId = req.params.id;
      const ticket = await storage.getTicketById(tenantId, ticketId);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const allowedClientIds = await storage.getClientIdsForUser(userId);
      if (!ticket.clientId || !allowedClientIds.includes(ticket.clientId)) {
        return res.status(403).json({ message: "Access denied to this ticket" });
      }

      const schema = z.object({
        content: z.string().min(1, "Comment cannot be empty"),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const comment = await storage.createTicketComment({
        tenantId,
        ticketId,
        userId,
        content: parsed.data.content,
        isInternal: false,
      });

      emitEvent("ticket.comment_added", tenantId, userId, "ticket_comment", comment.id, { ticketId, isInternal: false });

      res.status(201).json(comment);
    } catch (err: any) {
      console.error("[portal] POST /tickets/:id/comments error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/portal/invoices", isAuthenticated, requireFeature("portal"), async (req: any, res) => {
    try {
      const { userId, tenantId, role } = req.tenantCtx;
      if (role !== "CLIENT") {
        return res.status(403).json({ message: "Portal is for CLIENT role users only" });
      }

      const allowedClientIds = await storage.getClientIdsForUser(userId);
      if (allowedClientIds.length === 0) {
        return res.json([]);
      }

      const results = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          status: invoices.status,
          totalCents: invoices.totalCents,
          currency: invoices.currency,
          issuedAt: invoices.issuedAt,
          dueAt: invoices.dueAt,
          paidAt: invoices.paidAt,
          clientId: invoices.clientId,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.tenantId, tenantId),
            inArray(invoices.clientId, allowedClientIds),
            ne(invoices.status, "draft")
          )
        )
        .orderBy(desc(invoices.createdAt));

      res.json(results);
    } catch (err: any) {
      console.error("[portal] GET /invoices error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/portal/invoices/:id", isAuthenticated, requireFeature("portal"), async (req: any, res) => {
    try {
      const { userId, tenantId, role } = req.tenantCtx;
      if (role !== "CLIENT") {
        return res.status(403).json({ message: "Portal is for CLIENT role users only" });
      }

      const invoiceId = req.params.id;
      const allowedClientIds = await storage.getClientIdsForUser(userId);

      const [invoice] = await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.tenantId, tenantId),
            eq(invoices.id, invoiceId)
          )
        );

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      if (!invoice.clientId || !allowedClientIds.includes(invoice.clientId)) {
        return res.status(403).json({ message: "Access denied to this invoice" });
      }

      if (invoice.status === "draft") {
        return res.status(403).json({ message: "This invoice is not available" });
      }

      const lineItemsList = await db
        .select()
        .from(invoiceLineItems)
        .where(
          and(
            eq(invoiceLineItems.tenantId, tenantId),
            eq(invoiceLineItems.invoiceId, invoiceId)
          )
        )
        .orderBy(invoiceLineItems.sortOrder);

      res.json({ ...invoice, lineItems: lineItemsList });
    } catch (err: any) {
      console.error("[portal] GET /invoices/:id error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
