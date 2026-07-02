import type { Express } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { requireRole } from "../../authz";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";
import { emitEvent } from "../../core/events/helpers";
import { z } from "zod";

function calculateNextRunAt(cronExpression: string): Date {
  const parts = cronExpression.trim().split(/\s+/);
  const now = new Date();

  if (parts.length !== 5) {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next;
  }

  const [minute, hour, dayOfMonth, , ] = parts;

  const targetMinute = minute === "*" ? 0 : parseInt(minute, 10);
  const targetHour = hour === "*" ? 9 : parseInt(hour, 10);

  if (dayOfMonth !== "*") {
    const targetDay = parseInt(dayOfMonth, 10);
    const next = new Date(now);
    next.setHours(targetHour, targetMinute, 0, 0);
    next.setDate(targetDay);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
    return next;
  }

  const next = new Date(now);
  next.setHours(targetHour, targetMinute, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function registerRecurringRoutes(app: Express) {
  app.get(
    "/api/recurring-templates",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    async (req: any, res) => {
      try {
        const { tenantId } = req.tenantCtx;
        const templates = await storage.getRecurringTemplatesByTenant(tenantId);
        res.json(templates);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.get(
    "/api/recurring-templates/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    async (req: any, res) => {
      try {
        const { tenantId } = req.tenantCtx;
        const template = await storage.getRecurringTemplateById(tenantId, req.params.id);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }
        res.json(template);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.post(
    "/api/recurring-templates",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const schema = z.object({
          title: z.string().min(1, "Title is required"),
          description: z.string().nullable().optional(),
          priority: z.enum(["critical", "high", "medium", "low"]).optional(),
          clientId: z.string().nullable().optional(),
          siteId: z.string().nullable().optional(),
          assetId: z.string().nullable().optional(),
          assignedToId: z.string().nullable().optional(),
          cronExpression: z.string().min(1, "Cron expression is required"),
          enabled: z.boolean().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const nextRunAt = calculateNextRunAt(parsed.data.cronExpression);

        const template = await storage.createRecurringTemplate({
          tenantId,
          title: parsed.data.title,
          description: parsed.data.description || null,
          priority: parsed.data.priority || "medium",
          clientId: parsed.data.clientId || null,
          siteId: parsed.data.siteId || null,
          assetId: parsed.data.assetId || null,
          assignedToId: parsed.data.assignedToId || null,
          cronExpression: parsed.data.cronExpression,
          enabled: parsed.data.enabled ?? true,
          nextRunAt,
        });

        emitEvent("recurring_template.created", tenantId, userId, "recurring_template", template.id, { title: template.title });

        res.status(201).json(template);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.put(
    "/api/recurring-templates/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const existing = await storage.getRecurringTemplateById(tenantId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Template not found" });
        }

        const schema = z.object({
          title: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          priority: z.enum(["critical", "high", "medium", "low"]).optional(),
          clientId: z.string().nullable().optional(),
          siteId: z.string().nullable().optional(),
          assetId: z.string().nullable().optional(),
          assignedToId: z.string().nullable().optional(),
          cronExpression: z.string().min(1).optional(),
          enabled: z.boolean().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const updates: any = { ...parsed.data };
        if (parsed.data.cronExpression) {
          updates.nextRunAt = calculateNextRunAt(parsed.data.cronExpression);
        }

        const updated = await storage.updateRecurringTemplate(tenantId, req.params.id, updates);

        emitEvent("recurring_template.updated", tenantId, userId, "recurring_template", req.params.id, { changes: Object.keys(parsed.data) });

        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.delete(
    "/api/recurring-templates/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        await storage.deleteRecurringTemplate(tenantId, req.params.id);

        emitEvent("recurring_template.deleted", tenantId, userId, "recurring_template", req.params.id);

        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );
}
