import type { Express } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { requireRole } from "../../authz";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";
import { emitEvent } from "../../core/events/helpers";
import { z } from "zod";
import { randomUUID } from "crypto";

export function registerInvoicingRoutes(app: Express) {
  app.get(
    "/api/billing-config",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    async (req: any, res) => {
      try {
        const { tenantId } = req.tenantCtx;
        const config = await storage.getBillingConfig(tenantId);
        res.json(config || null);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.put(
    "/api/billing-config",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const schema = z.object({
          defaultHourlyRateCents: z.number().int().optional(),
          currency: z.string().optional(),
          companyName: z.string().nullable().optional(),
          companyAddress: z.string().nullable().optional(),
          companyPhone: z.string().nullable().optional(),
          companyEmail: z.string().nullable().optional(),
          invoicePrefix: z.string().optional(),
          invoiceNextNumber: z.number().int().optional(),
          paymentTermsDays: z.number().int().optional(),
          invoiceNotes: z.string().nullable().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const config = await storage.upsertBillingConfig(tenantId, { tenantId, ...parsed.data });

        emitEvent("billing_config.updated", tenantId, userId, "billing_config", config.id);

        res.json(config);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.get(
    "/api/invoices",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    async (req: any, res) => {
      try {
        const { tenantId } = req.tenantCtx;
        const filters = {
          status: req.query.status as string | undefined,
          clientId: req.query.clientId as string | undefined,
        };
        const invoices = await storage.getInvoicesByTenant(tenantId, filters);
        res.json(invoices);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.post(
    "/api/invoices",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const schema = z.object({
          clientId: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          currency: z.string().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const invoiceNumber = await storage.getNextInvoiceNumber(tenantId);

        const invoice = await storage.createInvoice({
          tenantId,
          clientId: parsed.data.clientId || null,
          invoiceNumber,
          status: "draft",
          notes: parsed.data.notes || null,
          currency: parsed.data.currency || "USD",
          publicToken: randomUUID(),
          subtotalCents: 0,
          taxCents: 0,
          totalCents: 0,
          amountPaidCents: 0,
        });

        emitEvent("invoice.created", tenantId, userId, "invoice", invoice.id, { invoiceNumber });

        res.status(201).json(invoice);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.get(
    "/api/invoices/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    async (req: any, res) => {
      try {
        const { tenantId } = req.tenantCtx;
        const invoice = await storage.getInvoiceById(tenantId, req.params.id);
        if (!invoice) {
          return res.status(404).json({ message: "Invoice not found" });
        }
        const lineItems = await storage.getLineItemsByInvoice(tenantId, req.params.id);
        res.json({ ...invoice, lineItems });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.put(
    "/api/invoices/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const existing = await storage.getInvoiceById(tenantId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        const schema = z.object({
          clientId: z.string().nullable().optional(),
          status: z.enum(["draft", "sent", "viewed", "paid", "partial", "overdue", "cancelled"]).optional(),
          notes: z.string().nullable().optional(),
          currency: z.string().optional(),
          taxCents: z.number().int().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const updated = await storage.updateInvoice(tenantId, req.params.id, parsed.data);

        emitEvent("invoice.updated", tenantId, userId, "invoice", req.params.id, { changes: Object.keys(parsed.data) });

        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.delete(
    "/api/invoices/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const existing = await storage.getInvoiceById(tenantId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Invoice not found" });
        }
        if (existing.status !== "draft") {
          return res.status(400).json({ message: "Only draft invoices can be deleted" });
        }

        await storage.deleteInvoice(tenantId, req.params.id);

        emitEvent("invoice.deleted", tenantId, userId, "invoice", req.params.id);

        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.post(
    "/api/invoices/:id/send",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const existing = await storage.getInvoiceById(tenantId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        const billingConfig = await storage.getBillingConfig(tenantId);
        const paymentTermsDays = billingConfig?.paymentTermsDays || 30;

        const now = new Date();
        const dueAt = new Date(now.getTime() + paymentTermsDays * 24 * 60 * 60 * 1000);

        const updated = await storage.updateInvoice(tenantId, req.params.id, {
          status: "sent",
          issuedAt: now,
          dueAt,
        });

        emitEvent("invoice.sent", tenantId, userId, "invoice", req.params.id);

        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.post(
    "/api/invoices/:id/mark-paid",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const existing = await storage.getInvoiceById(tenantId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        const updated = await storage.updateInvoice(tenantId, req.params.id, {
          status: "paid",
          paidAt: new Date(),
          amountPaidCents: existing.totalCents,
        });

        emitEvent("invoice.paid", tenantId, userId, "invoice", req.params.id);

        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.post(
    "/api/invoices/:id/line-items",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const existing = await storage.getInvoiceById(tenantId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        const schema = z.object({
          description: z.string().min(1, "Description is required"),
          quantity: z.number().int().positive().optional(),
          unitPriceCents: z.number().int(),
          timeEntryId: z.string().nullable().optional(),
          sortOrder: z.number().int().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const quantity = parsed.data.quantity || 1;
        const totalCents = quantity * parsed.data.unitPriceCents;

        const lineItem = await storage.createInvoiceLineItem({
          tenantId,
          invoiceId: req.params.id,
          description: parsed.data.description,
          quantity,
          unitPriceCents: parsed.data.unitPriceCents,
          totalCents,
          timeEntryId: parsed.data.timeEntryId || null,
          sortOrder: parsed.data.sortOrder || 0,
        });

        await storage.recalculateInvoiceTotals(tenantId, req.params.id);

        emitEvent("invoice.line_item_added", tenantId, userId, "invoice_line_item", lineItem.id, { invoiceId: req.params.id });

        res.status(201).json(lineItem);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.put(
    "/api/invoices/:invoiceId/line-items/:itemId",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const schema = z.object({
          description: z.string().min(1).optional(),
          quantity: z.number().int().positive().optional(),
          unitPriceCents: z.number().int().optional(),
          sortOrder: z.number().int().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const updates: any = { ...parsed.data };
        if (parsed.data.quantity !== undefined || parsed.data.unitPriceCents !== undefined) {
          const existing = await storage.getLineItemsByInvoice(tenantId, req.params.invoiceId);
          const item = existing.find((li) => li.id === req.params.itemId);
          if (item) {
            const qty = parsed.data.quantity ?? item.quantity;
            const price = parsed.data.unitPriceCents ?? item.unitPriceCents;
            updates.totalCents = qty * price;
          }
        }

        const updated = await storage.updateInvoiceLineItem(tenantId, req.params.itemId, updates);
        if (!updated) {
          return res.status(404).json({ message: "Line item not found" });
        }

        await storage.recalculateInvoiceTotals(tenantId, req.params.invoiceId);

        emitEvent("invoice.line_item_updated", tenantId, userId, "invoice_line_item", req.params.itemId, { invoiceId: req.params.invoiceId });

        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.delete(
    "/api/invoices/:invoiceId/line-items/:itemId",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        await storage.deleteInvoiceLineItem(tenantId, req.params.itemId);
        await storage.recalculateInvoiceTotals(tenantId, req.params.invoiceId);

        emitEvent("invoice.line_item_deleted", tenantId, userId, "invoice_line_item", req.params.itemId, { invoiceId: req.params.invoiceId });

        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.get(
    "/api/public/invoices/:token",
    async (req: any, res) => {
      try {
        const invoice = await storage.getInvoiceByPublicToken(req.params.token);
        if (!invoice) {
          return res.status(404).json({ message: "Invoice not found" });
        }
        res.json(invoice);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );
}
