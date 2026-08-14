import type { Express } from "express";
import crypto from "crypto";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { requireRole } from "../../authz";
import { emitEvent } from "../../core/events/helpers";
import { z } from "zod";
import { validateWebhookUrl } from "./urlValidation";
import { requireFeature, checkLimit } from "../../core/billing/enforcePlan";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";

const createWebhookSchema = z.object({
  url: z.string().url(),
  eventTypes: z.array(z.string()).default([]),
  description: z.string().optional(),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  enabled: z.boolean().optional(),
  eventTypes: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export function registerWebhookRoutes(app: Express) {
  app.get("/api/webhooks", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("webhooks"), async (req: any, res) => {
    try {
      const endpoints = await storage.getWebhookEndpointsByTenant(req.tenantCtx.tenantId);
      const sanitized = endpoints.map(({ secret, ...rest }) => rest);
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/webhooks", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("webhooks"), checkLimit("webhooksMax"), requireNotPaused(), async (req: any, res) => {
    try {
      const { tenantId, userId } = req.tenantCtx;
      const parsed = createWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const urlCheck = await validateWebhookUrl(parsed.data.url);
      if (!urlCheck.valid) {
        return res.status(400).json({ message: urlCheck.reason });
      }

      const secret = crypto.randomBytes(32).toString("hex");

      const endpoint = await storage.createWebhookEndpoint({
        tenantId,
        url: parsed.data.url,
        secret,
        enabled: true,
        eventTypes: parsed.data.eventTypes,
        description: parsed.data.description,
      });

      await emitEvent("webhook.created", tenantId, userId, "webhook_endpoint", endpoint.id, { url: parsed.data.url, eventTypes: parsed.data.eventTypes });

      res.json({ ...endpoint, signingSecret: secret });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/webhooks/:id", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("webhooks"), requireNotPaused(), async (req: any, res) => {
    try {
      const { tenantId, userId } = req.tenantCtx;
      const parsed = updateWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      if (parsed.data.url) {
        const urlCheck = await validateWebhookUrl(parsed.data.url);
        if (!urlCheck.valid) {
          return res.status(400).json({ message: urlCheck.reason });
        }
      }

      const updated = await storage.updateWebhookEndpoint(tenantId, req.params.id, parsed.data);
      if (!updated) return res.status(404).json({ message: "Webhook not found" });

      await emitEvent("webhook.updated", tenantId, userId, "webhook_endpoint", req.params.id, parsed.data);

      const { secret, ...sanitized } = updated;
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/webhooks/:id", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("webhooks"), requireNotPaused(), async (req: any, res) => {
    try {
      const { tenantId, userId } = req.tenantCtx;
      await storage.deleteWebhookEndpoint(tenantId, req.params.id);

      await emitEvent("webhook.deleted", tenantId, userId, "webhook_endpoint", req.params.id);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/webhooks/:id/deliveries", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("webhooks"), async (req: any, res) => {
    try {
      const deliveries = await storage.getWebhookDeliveriesByEndpoint(req.tenantCtx.tenantId, req.params.id);
      res.json(deliveries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/webhook-events", isAuthenticated, requireRole("OWNER", "ADMIN"), requireFeature("webhooks"), async (_req: any, res) => {
    try {
      const { moduleRegistry } = await import("@shared/modules");
      const events: string[] = [];
      for (const mod of moduleRegistry.modules) {
        if (mod.server?.emits) {
          events.push(...mod.server.emits);
        }
      }
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
