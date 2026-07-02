import type { Express, Request, Response, NextFunction } from "express";
import { requireApiAuth, requireScopes } from "../../core/apiAuth";
import { storage } from "../../storage";
import { z } from "zod";
import crypto from "crypto";
import { checkTenantFeatureAccess } from "../../core/billing/enforcePlan";

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Tech Deck API",
    version: "1.0.0",
    description: "Public API for Tech Deck. Authenticate with a Bearer token.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "API token issued from the Tech Deck admin panel. Prefix: snv_",
      },
    },
  },
  paths: {
    "/status/{slug}": {
      get: {
        summary: "Get public status page",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Status page data with components and recent incidents" },
          "404": { description: "Status page not found" },
        },
      },
    },
    "/evidence": {
      get: {
        summary: "List evidence items",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "query", in: "query", schema: { type: "string" } },
          { name: "clientId", in: "query", schema: { type: "string" } },
          { name: "tag", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Array of evidence items" },
          "401": { description: "Unauthorized" },
          "403": { description: "Missing scope evidence:read" },
        },
      },
    },
    "/license/validate": {
      post: {
        summary: "Validate a license key",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["productSlug", "licenseKey", "deviceFingerprint"],
                properties: {
                  productSlug: { type: "string" },
                  licenseKey: { type: "string" },
                  deviceFingerprint: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Validation result with valid boolean and reason" },
          "401": { description: "Unauthorized" },
          "403": { description: "Missing scope license:validate" },
        },
      },
    },
    "/openapi.json": {
      get: {
        summary: "OpenAPI specification",
        responses: { "200": { description: "This OpenAPI JSON document" } },
      },
    },
  },
};

export function registerApiV1Routes(app: Express) {
  app.get("/api/v1/openapi.json", (_req: Request, res: Response) => {
    res.json(openApiSpec);
  });

  app.get("/api/v1/status/:slug", async (req: Request, res: Response) => {
    try {
      const slug = req.params.slug as string;
      const page = await storage.getStatusPageBySlug(slug);
      if (!page || !page.isPublic) {
        return res.status(404).json({ error: "Status page not found" });
      }
      const access = await checkTenantFeatureAccess(page.tenantId, "status");
      if (!access.ok) {
        return res.status(access.status).json({ error: access.error, message: access.message });
      }

      const components = await storage.getStatusComponentsByTenant(page.tenantId);
      const activeIncidents = await storage.getActiveIncidentsByTenant(page.tenantId);
      const recentResolved = await storage.getRecentResolvedIncidents(page.tenantId, 10);

      return res.json({
        title: page.title,
        description: page.description,
        slug: page.publicSlug,
        components: components.map((c) => ({
          name: c.name,
          description: c.description,
          status: c.status,
        })),
        activeIncidents: activeIncidents.map((i) => ({
          title: i.title,
          description: i.description,
          severity: i.severity,
          status: i.status,
          createdAt: i.createdAt,
        })),
        recentResolved: recentResolved.map((i) => ({
          title: i.title,
          severity: i.severity,
          resolvedAt: i.resolvedAt,
        })),
      });
    } catch {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get(
    "/api/v1/evidence",
    requireApiAuth(),
    requireScopes("evidence:read"),
    async (req: Request, res: Response) => {
      try {
        const { query, clientId, tag, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
        const tenantId = req.apiAuth!.tenantId;

        const results = await storage.searchEvidence(tenantId, {
          query,
          clientId,
          tag,
          dateFrom,
          dateTo,
        });

        return res.json({ items: results });
      } catch {
        return res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  app.post(
    "/api/v1/license/validate",
    requireApiAuth(),
    requireScopes("license:validate"),
    async (req: Request, res: Response) => {
      try {
        const schema = z.object({
          productSlug: z.string().min(1),
          licenseKey: z.string().min(1),
          deviceFingerprint: z.string().min(1).max(500),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ valid: false, reason: "invalid_request" });
        }

        const { productSlug, licenseKey, deviceFingerprint } = parsed.data;
        const keyHash = hashKey(licenseKey);

        const keyRecord = await storage.getLicenseKeyByHash(keyHash);

        if (!keyRecord) {
          return res.json({ valid: false, reason: "invalid_key" });
        }

        if (keyRecord.productSlug !== productSlug) {
          return res.json({ valid: false, reason: "invalid_key" });
        }

        if (!keyRecord.productIsActive) {
          return res.json({ valid: false, reason: "product_inactive" });
        }

        if (keyRecord.isRevoked) {
          return res.json({ valid: false, reason: "key_revoked" });
        }

        if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
          return res.json({ valid: false, reason: "key_expired", expiresAt: keyRecord.expiresAt });
        }

        const existingActivation = await storage.getActivationByFingerprint(keyRecord.id, deviceFingerprint);
        const activationCount = await storage.getActivationCountByKey(keyRecord.id);

        if (existingActivation) {
          return res.json({
            valid: true,
            reason: "already_activated",
            remainingActivations: keyRecord.maxActivations - activationCount,
            expiresAt: keyRecord.expiresAt,
          });
        }

        if (activationCount >= keyRecord.maxActivations) {
          return res.json({
            valid: false,
            reason: "max_activations_reached",
            remainingActivations: 0,
            expiresAt: keyRecord.expiresAt,
          });
        }

        await storage.createLicenseActivation({
          tenantId: keyRecord.tenantId,
          licenseKeyId: keyRecord.id,
          deviceFingerprint,
          ip: req.ip || req.socket.remoteAddress || null,
          userAgent: req.headers["user-agent"] || null,
        });

        const newCount = await storage.getActivationCountByKey(keyRecord.id);

        return res.json({
          valid: true,
          reason: "activated",
          remainingActivations: keyRecord.maxActivations - newCount,
          expiresAt: keyRecord.expiresAt,
        });
      } catch {
        return res.status(500).json({ error: "Internal server error" });
      }
    }
  );
}
