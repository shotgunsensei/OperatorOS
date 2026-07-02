import type { Express } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { requireTenant, requireRole } from "../../authz";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";
import { emitEvent } from "../../core/events/helpers";
import { z } from "zod";

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function registerKbRoutes(app: Express) {
  app.get(
    "/api/kb",
    isAuthenticated,
    requireTenant(),
    async (req: any, res) => {
      try {
        const { tenantId, role } = req.tenantCtx;
        if (role === "CLIENT") {
          return res.status(403).json({ message: "Forbidden" });
        }
        const filters = {
          category: req.query.category as string | undefined,
          isPublished: req.query.isPublished === "true" ? true : req.query.isPublished === "false" ? false : undefined,
          query: req.query.q as string | undefined,
        };
        const articles = await storage.getKbArticlesByTenant(tenantId, filters);
        res.json(articles);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.get(
    "/api/kb/:id",
    isAuthenticated,
    requireTenant(),
    async (req: any, res) => {
      try {
        const { tenantId, role } = req.tenantCtx;
        if (role === "CLIENT") {
          return res.status(403).json({ message: "Forbidden" });
        }
        const article = await storage.getKbArticleById(tenantId, req.params.id);
        if (!article) {
          return res.status(404).json({ message: "Article not found" });
        }
        res.json(article);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.post(
    "/api/kb",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const schema = z.object({
          title: z.string().min(1, "Title is required"),
          content: z.string().optional(),
          category: z.string().nullable().optional(),
          isPublished: z.boolean().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const slug = generateSlug(parsed.data.title);

        const article = await storage.createKbArticle({
          tenantId,
          title: parsed.data.title,
          slug,
          content: parsed.data.content || "",
          category: parsed.data.category || null,
          isPublished: parsed.data.isPublished ?? false,
          authorId: userId,
        });

        emitEvent("kb_article.created", tenantId, userId, "kb_article", article.id, { title: article.title });

        res.status(201).json(article);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.put(
    "/api/kb/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const existing = await storage.getKbArticleById(tenantId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Article not found" });
        }

        const schema = z.object({
          title: z.string().min(1).optional(),
          content: z.string().optional(),
          category: z.string().nullable().optional(),
          isPublished: z.boolean().optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const updates: any = { ...parsed.data };
        if (parsed.data.title) {
          updates.slug = generateSlug(parsed.data.title);
        }

        const updated = await storage.updateKbArticle(tenantId, req.params.id, updates);

        emitEvent("kb_article.updated", tenantId, userId, "kb_article", req.params.id, { changes: Object.keys(parsed.data) });

        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.delete(
    "/api/kb/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        await storage.deleteKbArticle(tenantId, req.params.id);

        emitEvent("kb_article.deleted", tenantId, userId, "kb_article", req.params.id);

        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );
}
