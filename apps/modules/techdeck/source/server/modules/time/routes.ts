import type { Express } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { requireTenant } from "../../authz";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";
import { emitEvent } from "../../core/events/helpers";
import { z } from "zod";

export function registerTimeRoutes(app: Express) {
  app.get(
    "/api/time-entries",
    isAuthenticated,
    requireTenant(),
    async (req: any, res) => {
      try {
        const { tenantId, role } = req.tenantCtx;
        if (role === "CLIENT") {
          return res.status(403).json({ message: "Forbidden" });
        }
        const filters = {
          ticketId: req.query.ticketId as string | undefined,
          clientId: req.query.clientId as string | undefined,
          userId: req.query.userId as string | undefined,
          startDate: req.query.startDate as string | undefined,
          endDate: req.query.endDate as string | undefined,
          billable: req.query.billable === "true" ? true : req.query.billable === "false" ? false : undefined,
          uninvoiced: req.query.uninvoiced === "true" ? true : undefined,
        };
        const entries = await storage.getTimeEntriesByTenant(tenantId, filters);
        res.json(entries);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.get(
    "/api/time-entries/:id",
    isAuthenticated,
    requireTenant(),
    async (req: any, res) => {
      try {
        const { tenantId, role } = req.tenantCtx;
        if (role === "CLIENT") {
          return res.status(403).json({ message: "Forbidden" });
        }
        const entry = await storage.getTimeEntryById(tenantId, req.params.id);
        if (!entry) {
          return res.status(404).json({ message: "Time entry not found" });
        }
        res.json(entry);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.post(
    "/api/time-entries",
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
          ticketId: z.string().nullable().optional(),
          clientId: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
          minutes: z.number().int().positive("Minutes must be positive"),
          billable: z.boolean().optional(),
          rateOverrideCents: z.number().int().nullable().optional(),
          date: z.string().or(z.date()),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const entry = await storage.createTimeEntry({
          tenantId,
          userId,
          ticketId: parsed.data.ticketId || null,
          clientId: parsed.data.clientId || null,
          description: parsed.data.description || null,
          minutes: parsed.data.minutes,
          billable: parsed.data.billable ?? true,
          rateOverrideCents: parsed.data.rateOverrideCents ?? null,
          date: new Date(parsed.data.date),
        });

        emitEvent("time_entry.created", tenantId, userId, "time_entry", entry.id, { minutes: entry.minutes });

        res.status(201).json(entry);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.put(
    "/api/time-entries/:id",
    isAuthenticated,
    requireTenant(),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId, role } = req.tenantCtx;
        if (role === "CLIENT") {
          return res.status(403).json({ message: "Forbidden" });
        }

        const existing = await storage.getTimeEntryById(tenantId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Time entry not found" });
        }

        const schema = z.object({
          ticketId: z.string().nullable().optional(),
          clientId: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
          minutes: z.number().int().positive().optional(),
          billable: z.boolean().optional(),
          rateOverrideCents: z.number().int().nullable().optional(),
          date: z.string().or(z.date()).optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const updates: any = { ...parsed.data };
        if (parsed.data.date) updates.date = new Date(parsed.data.date);

        const updated = await storage.updateTimeEntry(tenantId, req.params.id, updates);

        emitEvent("time_entry.updated", tenantId, userId, "time_entry", req.params.id, { changes: Object.keys(parsed.data) });

        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.delete(
    "/api/time-entries/:id",
    isAuthenticated,
    requireTenant(),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId, role } = req.tenantCtx;
        if (role === "CLIENT") {
          return res.status(403).json({ message: "Forbidden" });
        }
        await storage.deleteTimeEntry(tenantId, req.params.id);

        emitEvent("time_entry.deleted", tenantId, userId, "time_entry", req.params.id);

        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );
}
