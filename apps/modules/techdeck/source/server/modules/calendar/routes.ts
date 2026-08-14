import type { Express } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { requireTenant, requireRole } from "../../authz";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";
import { emitEvent } from "../../core/events/helpers";
import { z } from "zod";

export function registerCalendarRoutes(app: Express) {
  app.get(
    "/api/appointments",
    isAuthenticated,
    requireTenant(),
    async (req: any, res) => {
      try {
        const { tenantId, role } = req.tenantCtx;
        if (role === "CLIENT") {
          return res.status(403).json({ message: "Forbidden" });
        }
        const filters = {
          startDate: req.query.startDate as string | undefined,
          endDate: req.query.endDate as string | undefined,
          assignedToId: req.query.assignedToId as string | undefined,
        };
        const appointments = await storage.getAppointmentsByTenant(tenantId, filters);
        res.json(appointments);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.get(
    "/api/appointments/:id",
    isAuthenticated,
    requireTenant(),
    async (req: any, res) => {
      try {
        const { tenantId, role } = req.tenantCtx;
        if (role === "CLIENT") {
          return res.status(403).json({ message: "Forbidden" });
        }
        const appointment = await storage.getAppointmentById(tenantId, req.params.id);
        if (!appointment) {
          return res.status(404).json({ message: "Appointment not found" });
        }
        res.json(appointment);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.post(
    "/api/appointments",
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
          description: z.string().nullable().optional(),
          startTime: z.string().or(z.date()),
          endTime: z.string().or(z.date()),
          ticketId: z.string().nullable().optional(),
          clientId: z.string().nullable().optional(),
          siteId: z.string().nullable().optional(),
          assignedToId: z.string().nullable().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const appointment = await storage.createAppointment({
          tenantId,
          title: parsed.data.title,
          description: parsed.data.description || null,
          startTime: new Date(parsed.data.startTime),
          endTime: new Date(parsed.data.endTime),
          ticketId: parsed.data.ticketId || null,
          clientId: parsed.data.clientId || null,
          siteId: parsed.data.siteId || null,
          assignedToId: parsed.data.assignedToId || null,
          createdById: userId,
        });

        emitEvent("appointment.created", tenantId, userId, "appointment", appointment.id, { title: appointment.title });

        res.status(201).json(appointment);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.put(
    "/api/appointments/:id",
    isAuthenticated,
    requireTenant(),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId, role } = req.tenantCtx;
        if (role === "CLIENT") {
          return res.status(403).json({ message: "Forbidden" });
        }

        const existing = await storage.getAppointmentById(tenantId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Appointment not found" });
        }

        const schema = z.object({
          title: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          startTime: z.string().or(z.date()).optional(),
          endTime: z.string().or(z.date()).optional(),
          ticketId: z.string().nullable().optional(),
          clientId: z.string().nullable().optional(),
          siteId: z.string().nullable().optional(),
          assignedToId: z.string().nullable().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const updates: any = { ...parsed.data };
        if (parsed.data.startTime) updates.startTime = new Date(parsed.data.startTime);
        if (parsed.data.endTime) updates.endTime = new Date(parsed.data.endTime);

        const updated = await storage.updateAppointment(tenantId, req.params.id, updates);

        emitEvent("appointment.updated", tenantId, userId, "appointment", req.params.id, { changes: Object.keys(parsed.data) });

        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.delete(
    "/api/appointments/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        await storage.deleteAppointment(tenantId, req.params.id);

        emitEvent("appointment.deleted", tenantId, userId, "appointment", req.params.id);

        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );
}
