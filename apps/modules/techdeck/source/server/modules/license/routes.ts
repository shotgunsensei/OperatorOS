import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { requireRole } from "../../authz";
import { z } from "zod";
import crypto from "crypto";
import { emitEvent } from "../../core/events/helpers";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";

function generateLicenseKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let group = "";
    for (let i = 0; i < 4; i++) {
      const idx = crypto.randomInt(0, chars.length);
      group += chars[idx];
    }
    groups.push(group);
  }
  return `SNV-${groups.join("-")}`;
}

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(windowMs: number, maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= maxRequests) {
      return res.status(429).json({ valid: false, reason: "rate_limited" });
    }

    entry.count++;
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  rateLimitMap.forEach((entry, key) => {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  });
}, 60_000);

export function registerLicenseRoutes(app: Express) {
  app.get(
    "/api/license/products",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    async (req: any, res) => {
      try {
        const products = await storage.getLicenseProductsByTenant(req.tenantCtx.tenantId);
        res.json(products);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.get(
    "/api/license/products/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    async (req: any, res) => {
      try {
        const product = await storage.getLicenseProductById(req.tenantCtx.tenantId, req.params.id);
        if (!product) return res.status(404).json({ message: "Product not found" });
        res.json(product);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/license/products",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const schema = z.object({
          name: z.string().min(1).max(100),
          slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
          description: z.string().max(500).optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const existing = await storage.getLicenseProductBySlug(tenantId, parsed.data.slug);
        if (existing) {
          return res.status(400).json({ message: "A product with this slug already exists" });
        }

        const product = await storage.createLicenseProduct({
          ...parsed.data,
          tenantId,
        });

        await emitEvent("create_license_product", tenantId, userId, "license_product", product.id, { name: parsed.data.name, slug: parsed.data.slug });

        res.json(product);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.patch(
    "/api/license/products/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const schema = z.object({
          name: z.string().min(1).max(100).optional(),
          slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
          description: z.string().max(500).optional(),
          isActive: z.boolean().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        if (parsed.data.slug) {
          const existing = await storage.getLicenseProductBySlug(tenantId, parsed.data.slug);
          if (existing && existing.id !== req.params.id) {
            return res.status(400).json({ message: "Slug already in use" });
          }
        }

        const product = await storage.updateLicenseProduct(tenantId, req.params.id, parsed.data);
        if (!product) return res.status(404).json({ message: "Product not found" });

        await emitEvent("update_license_product", tenantId, userId, "license_product", req.params.id, parsed.data);

        res.json(product);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.get(
    "/api/license/products/:productId/keys",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    async (req: any, res) => {
      try {
        const keys = await storage.getLicenseKeysByProduct(req.tenantCtx.tenantId, req.params.productId);
        const keysWithCounts = await Promise.all(
          keys.map(async (k) => {
            const count = await storage.getActivationCountByKey(k.id);
            return { ...k, activationCount: count };
          })
        );
        res.json(keysWithCounts);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/license/products/:productId/keys",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const schema = z.object({
          label: z.string().max(200).optional(),
          maxActivations: z.number().int().min(1).max(10000).default(1),
          expiresAt: z.string().datetime().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const product = await storage.getLicenseProductById(tenantId, req.params.productId);
        if (!product) return res.status(404).json({ message: "Product not found" });

        const plainKey = generateLicenseKey();
        const keyHash = hashKey(plainKey);

        const licenseKey = await storage.createLicenseKey({
          tenantId,
          productId: req.params.productId,
          keyHash,
          label: parsed.data.label || null,
          maxActivations: parsed.data.maxActivations,
          expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        });

        await emitEvent("issue_license_key", tenantId, userId, "license_key", licenseKey.id, { productId: req.params.productId, label: parsed.data.label, maxActivations: parsed.data.maxActivations });

        res.json({
          ...licenseKey,
          plainKey,
        });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/license/keys/:id/revoke",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const key = await storage.getLicenseKeyById(tenantId, req.params.id);
        if (!key) return res.status(404).json({ message: "Key not found" });

        await storage.revokeLicenseKey(tenantId, req.params.id);

        await emitEvent("revoke_license_key", tenantId, userId, "license_key", req.params.id, { productId: key.productId });

        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.get(
    "/api/license/keys/:id/activations",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    async (req: any, res) => {
      try {
        const activations = await storage.getActivationsByKey(req.tenantCtx.tenantId, req.params.id);
        res.json(activations);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/license/validate",
    rateLimit(60_000, 30),
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

        const newCount = activationCount + 1;

        try {
          await emitEvent("license_validate_activation", keyRecord.tenantId, undefined, "license_key", keyRecord.id, { deviceFingerprint: deviceFingerprint.substring(0, 32), productSlug });
        } catch {}

        return res.json({
          valid: true,
          reason: "activated",
          remainingActivations: keyRecord.maxActivations - newCount,
          expiresAt: keyRecord.expiresAt,
        });
      } catch (error: any) {
        res.status(500).json({ valid: false, reason: "server_error" });
      }
    }
  );
}
