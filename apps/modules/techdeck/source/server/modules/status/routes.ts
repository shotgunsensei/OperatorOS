import type { Express } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { requireRole } from "../../authz";
import { emitEvent } from "../../core/events/helpers";
import { z } from "zod";
import { checkTenantFeatureAccess, requireFeature } from "../../core/billing/enforcePlan";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";

const upsertPageSchema = z.object({
  publicSlug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  isPublic: z.boolean(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
});

const createComponentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(["operational", "degraded", "partial_outage", "major_outage", "maintenance"]).default("operational"),
  displayOrder: z.number().int().min(0).default(0),
});

const updateComponentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(["operational", "degraded", "partial_outage", "major_outage", "maintenance"]).optional(),
  displayOrder: z.number().int().min(0).optional(),
});

const createIncidentSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(5000),
  severity: z.enum(["info", "minor", "major", "critical"]).default("info"),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]).default("investigating"),
  startedAt: z.string().optional(),
});

const updateIncidentSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().min(1).max(5000).optional(),
  severity: z.enum(["info", "minor", "major", "critical"]).optional(),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]).optional(),
  resolvedAt: z.string().nullable().optional(),
});

export function registerStatusRoutes(app: Express) {
  app.get("/api/status/page", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("status"), async (req: any, res) => {
    try {
      const page = await storage.getStatusPageByTenant(req.tenantCtx.tenantId);
      res.json(page || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/status/page", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("status"), requireNotPaused(), async (req: any, res) => {
    try {
      const { tenantId, userId } = req.tenantCtx;
      const parsed = upsertPageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const page = await storage.upsertStatusPage(tenantId, parsed.data);
      await emitEvent("status.page_updated", tenantId, userId, "status_page", page.id, { title: parsed.data.title, publicSlug: parsed.data.publicSlug, isPublic: parsed.data.isPublic });
      res.json(page);
    } catch (error: any) {
      if (error.message?.includes("unique") || error.code === "23505") {
        return res.status(409).json({ message: "That slug is already taken" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/status/components", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("status"), async (req: any, res) => {
    try {
      const components = await storage.getStatusComponentsByTenant(req.tenantCtx.tenantId);
      res.json(components);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/status/components", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("status"), requireNotPaused(), async (req: any, res) => {
    try {
      const { tenantId, userId } = req.tenantCtx;
      const parsed = createComponentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const component = await storage.createStatusComponent({ tenantId, ...parsed.data });
      await emitEvent("status.component_created", tenantId, userId, "status_component", component.id, { name: parsed.data.name });
      res.json(component);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/status/components/:id", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("status"), requireNotPaused(), async (req: any, res) => {
    try {
      const { tenantId, userId } = req.tenantCtx;
      const parsed = updateComponentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const updated = await storage.updateStatusComponent(tenantId, req.params.id, parsed.data);
      if (!updated) return res.status(404).json({ message: "Component not found" });

      await emitEvent("status.component_updated", tenantId, userId, "status_component", req.params.id, parsed.data);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/status/components/:id", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("status"), requireNotPaused(), async (req: any, res) => {
    try {
      const { tenantId, userId } = req.tenantCtx;
      await storage.deleteStatusComponent(tenantId, req.params.id);
      await emitEvent("status.component_deleted", tenantId, userId, "status_component", req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/status/incidents", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("status"), async (req: any, res) => {
    try {
      const incidents = await storage.getStatusIncidentsByTenant(req.tenantCtx.tenantId);
      res.json(incidents);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/status/incidents", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("status"), requireNotPaused(), async (req: any, res) => {
    try {
      const { tenantId, userId } = req.tenantCtx;
      const parsed = createIncidentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const incident = await storage.createStatusIncident({
        tenantId,
        title: parsed.data.title,
        description: parsed.data.description,
        severity: parsed.data.severity,
        status: parsed.data.status,
        startedAt: parsed.data.startedAt ? new Date(parsed.data.startedAt) : new Date(),
      });
      await emitEvent("status.incident_created", tenantId, userId, "status_incident", incident.id, { title: parsed.data.title, severity: parsed.data.severity });
      res.json(incident);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/status/incidents/:id", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("status"), requireNotPaused(), async (req: any, res) => {
    try {
      const { tenantId, userId } = req.tenantCtx;
      const parsed = updateIncidentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const updateData: any = { ...parsed.data };
      if (parsed.data.resolvedAt !== undefined) {
        updateData.resolvedAt = parsed.data.resolvedAt ? new Date(parsed.data.resolvedAt) : null;
      }
      if (parsed.data.status === "resolved" && !parsed.data.resolvedAt) {
        updateData.resolvedAt = new Date();
      }

      const updated = await storage.updateStatusIncident(tenantId, req.params.id, updateData);
      if (!updated) return res.status(404).json({ message: "Incident not found" });

      await emitEvent("status.incident_updated", tenantId, userId, "status_incident", req.params.id, parsed.data);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/status/incidents/:id", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("status"), requireNotPaused(), async (req: any, res) => {
    try {
      const { tenantId, userId } = req.tenantCtx;
      await storage.deleteStatusIncident(tenantId, req.params.id);
      await emitEvent("status.incident_deleted", tenantId, userId, "status_incident", req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/public/status/:slug", async (req, res) => {
    try {
      const page = await storage.getStatusPageBySlug(req.params.slug);
      if (!page || !page.isPublic) {
        return res.status(404).json({ message: "Status page not found" });
      }
      const access = await checkTenantFeatureAccess(page.tenantId, "status");
      if (!access.ok) {
        return res.status(access.status).json({ error: access.error, message: access.message });
      }

      const components = await storage.getStatusComponentsByTenant(page.tenantId);
      const activeIncidents = await storage.getActiveIncidentsByTenant(page.tenantId);
      const recentIncidents = await storage.getRecentResolvedIncidents(page.tenantId, 10);

      res.json({ page, components, activeIncidents, recentIncidents });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
