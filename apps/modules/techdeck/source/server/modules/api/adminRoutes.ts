import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../../auth";
import { requireRole } from "../../authz";
import { storage } from "../../storage";
import { generateToken, hashToken } from "../../core/apiAuth";
import { requireFeature } from "../../core/billing/enforcePlan";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";
import { z } from "zod";

export function registerApiTokenAdminRoutes(app: Express) {
  app.get(
    "/api/api-tokens",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireFeature("api"),
    requireNotPaused(),
    async (req: Request, res: Response) => {
      try {
        const tenantId = (req as any).tenantCtx.tenantId;
        const tokens = await storage.listApiTokens(tenantId);
        const safeTokens = tokens.map((t) => ({
          id: t.id,
          name: t.name,
          scopes: t.scopes,
          enabled: t.enabled,
          lastUsedAt: t.lastUsedAt,
          createdAt: t.createdAt,
        }));
        return res.json(safeTokens);
      } catch {
        return res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  app.post(
    "/api/api-tokens",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireFeature("api"),
    requireNotPaused(),
    async (req: Request, res: Response) => {
      try {
        const tenantId = (req as any).tenantCtx.tenantId;

        const schema = z.object({
          name: z.string().min(1).max(100),
          scopes: z.array(z.string()).min(1),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
        }

        const validScopes = ["evidence:read", "license:validate", "status:read"];
        const invalidScopes = parsed.data.scopes.filter((s) => !validScopes.includes(s));
        if (invalidScopes.length > 0) {
          return res.status(400).json({ error: `Invalid scopes: ${invalidScopes.join(", ")}. Valid scopes: ${validScopes.join(", ")}` });
        }

        const plaintext = generateToken();
        const tokenHash = hashToken(plaintext);

        const token = await storage.createApiToken({
          tenantId,
          name: parsed.data.name,
          scopes: parsed.data.scopes,
          tokenHash,
        });

        return res.status(201).json({
          id: token.id,
          name: token.name,
          scopes: token.scopes,
          enabled: token.enabled,
          createdAt: token.createdAt,
          plaintext,
        });
      } catch {
        return res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  app.delete(
    "/api/api-tokens/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireFeature("api"),
    async (req: Request, res: Response) => {
      try {
        const tenantId = (req as any).tenantCtx.tenantId;
        await storage.revokeApiToken(tenantId, req.params.id as string);
        return res.json({ ok: true });
      } catch {
        return res.status(500).json({ error: "Internal server error" });
      }
    }
  );
}
