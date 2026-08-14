import type { Express } from "express";
import { storage } from "../../storage";
import { fileStorage } from "../../fileStorage";
import { isAuthenticated } from "../../auth";
import { requireTenant, requireRole } from "../../authz";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import archiver from "archiver";
import { emitEvent } from "../../core/events/helpers";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";
import { checkLimit } from "../../core/billing/enforcePlan";

const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "pdf", "txt", "log", "csv", "json"];

const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/octet-stream",
];

const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || "25", 10);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(".", "");
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error(`File extension .${ext} is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`));
    }
    cb(null, true);
  },
});

export function registerEvidenceRoutes(app: Express) {
  app.get("/api/evidence", isAuthenticated, requireTenant(), async (req: any, res) => {
    try {
      const { tenantId, role, userId } = req.tenantCtx;
      const { q, clientId, assetId, tag, dateFrom, dateTo, uploadedBy } = req.query;

      let evidence = await storage.searchEvidence(tenantId, {
        query: q as string,
        clientId: clientId as string,
        assetId: assetId as string,
        tag: tag as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        uploadedBy: uploadedBy as string,
      });

      if (role === "CLIENT") {
        const allowedIds = await storage.getClientIdsForUser(userId);
        evidence = evidence.filter((e: any) => e.clientId && allowedIds.includes(e.clientId));
      }

      res.json(evidence);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/evidence/:id", isAuthenticated, requireTenant(), async (req: any, res) => {
    try {
      const { tenantId, role, userId } = req.tenantCtx;
      const item = await storage.getEvidenceById(tenantId, req.params.id);
      if (!item) return res.status(404).json({ message: "Evidence not found" });

      if (role === "CLIENT") {
        const allowedIds = await storage.getClientIdsForUser(userId);
        if (!item.clientId || !allowedIds.includes(item.clientId)) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      res.json(item);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get(
    "/api/evidence/:id/download",
    isAuthenticated,
    requireTenant(),
    async (req: any, res) => {
      try {
        const { tenantId, role, userId } = req.tenantCtx;
        const item = await storage.getEvidenceById(tenantId, req.params.id);
        if (!item) return res.status(404).json({ message: "Evidence not found" });

        if (role === "CLIENT") {
          const allowedIds = await storage.getClientIdsForUser(userId);
          if (!item.clientId || !allowedIds.includes(item.clientId)) {
            return res.status(403).json({ message: "Access denied" });
          }
        }

        const buffer = await fileStorage.read(item.filePath);
        res.setHeader("Content-Type", item.fileType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(item.fileName)}"`
        );
        res.send(buffer);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/evidence/upload",
    isAuthenticated,
    requireTenant(),
    requireNotPaused(),
    checkLimit("storageGb"),
    upload.single("file"),
    async (req: any, res) => {
      try {
        const { tenantId, userId, role } = req.tenantCtx;

        if (role === "CLIENT") {
          const clientId = req.body.clientId;
          if (!clientId) {
            return res.status(400).json({ message: "Client is required for CLIENT users" });
          }
          const canUpload = await storage.canUserUploadForClient(userId, clientId);
          if (!canUpload) {
            return res.status(403).json({ message: "You do not have upload permission for this client" });
          }
        }

        const file = req.file;
        if (!file) return res.status(400).json({ message: "No file uploaded" });

        const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");

        const duplicate = await storage.getEvidenceBySha256(tenantId, sha256);
        if (duplicate) {
          return res.status(409).json({
            message: `Duplicate file detected. This file already exists as "${duplicate.title}".`,
            existingId: duplicate.id,
          });
        }

        const originalName = file.originalname.replace(/[^\w.\-]/g, "_");
        if (originalName.includes("..") || originalName.includes("/")) {
          return res.status(400).json({ message: "Invalid filename" });
        }

        const filePath = await fileStorage.save(originalName, file.buffer, tenantId);

        let tagIds: string[] = [];
        if (req.body.tagIds) {
          try {
            tagIds = JSON.parse(req.body.tagIds);
          } catch {}
        }

        if (req.body.newTags) {
          const tagNames = req.body.newTags
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean);
          for (const tagName of tagNames) {
            let tag = await storage.getTagByName(tenantId, tagName);
            if (!tag) {
              tag = await storage.createTag({ tenantId, name: tagName });
            }
            if (!tagIds.includes(tag.id)) {
              tagIds.push(tag.id);
            }
          }
        }

        const evidence = await storage.createEvidence({
          tenantId,
          title: req.body.title || originalName,
          notes: req.body.notes || null,
          clientId: req.body.clientId || null,
          siteId: req.body.siteId || null,
          assetId: req.body.assetId || null,
          fileName: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
          filePath,
          sha256,
          tagIds: tagIds.length > 0 ? tagIds : null,
          uploadedById: userId,
        });

        await emitEvent("upload_evidence", tenantId, userId, "evidence", evidence.id, { fileName: file.originalname, fileSize: file.size, sha256 });

        res.json(evidence);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.delete(
    "/api/evidence/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId, role } = req.tenantCtx;
        const item = await storage.getEvidenceById(tenantId, req.params.id);
        if (!item) return res.status(404).json({ message: "Evidence not found" });

        if (role === "TECH" && item.uploadedById !== userId) {
          return res.status(403).json({ message: "You can only delete evidence you uploaded" });
        }

        await storage.deleteEvidence(tenantId, req.params.id);
        await fileStorage.delete(item.filePath);

        await emitEvent("delete_evidence", tenantId, userId, "evidence", req.params.id, { fileName: item.fileName });

        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.get("/api/tags", isAuthenticated, requireTenant(), async (req: any, res) => {
    try {
      const tags = await storage.getTagsByTenant(req.tenantCtx.tenantId);
      res.json(tags);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post(
    "/api/evidence/export-packet",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const { evidenceIds } = req.body;

        if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
          return res.status(400).json({ message: "Select at least one evidence item to export" });
        }

        const items: any[] = [];
        for (const id of evidenceIds) {
          const item = await storage.getEvidenceById(tenantId, id);
          if (item) items.push(item);
        }

        if (items.length === 0) {
          return res.status(404).json({ message: "No evidence found" });
        }

        const auditLogs = await storage.getAuditLogsByTenant(tenantId, {
          entityType: "evidence",
        });
        const relevantLogs = auditLogs.filter((log: any) =>
          evidenceIds.includes(log.entityId)
        );

        const now = new Date();
        const packetId = crypto.randomBytes(8).toString("hex");
        const timestamp = now.toISOString();

        const manifest = {
          packetId,
          exportedAt: timestamp,
          exportedBy: userId,
          tenantId,
          itemCount: items.length,
          items: items.map((item) => ({
            id: item.id,
            title: item.title,
            fileName: item.fileName,
            fileType: item.fileType,
            fileSize: item.fileSize,
            sha256: item.sha256,
            createdAt: item.createdAt,
            uploadedBy: item.uploadedByName || item.uploadedById,
            client: item.clientName || null,
            asset: item.assetName || null,
            notes: item.notes,
          })),
          auditEventCount: relevantLogs.length,
        };

        const sha256Lines: string[] = [];
        for (const item of items) {
          if (item.sha256) {
            sha256Lines.push(`${item.sha256}  evidence/${item.fileName}`);
          }
        }

        res.setHeader("Content-Type", "application/zip");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="evidence-packet-${packetId}.zip"`
        );

        const archive = archiver("zip", { zlib: { level: 6 } });
        archive.on("error", (err: Error) => {
          console.error("[evidence-export] Archive error:", err);
          if (!res.headersSent) {
            res.status(500).json({ message: "Export failed" });
          }
        });
        archive.pipe(res);

        archive.append(JSON.stringify(manifest, null, 2), { name: "packet/manifest.json" });

        if (sha256Lines.length > 0) {
          archive.append(sha256Lines.join("\n") + "\n", { name: "packet/sha256sums.txt" });
        }

        for (const item of items) {
          try {
            const buffer = await fileStorage.read(item.filePath);
            archive.append(buffer, { name: `packet/evidence/${item.fileName}` });
          } catch (err) {
            console.error(`[evidence-export] Failed to read file ${item.filePath}:`, err);
          }
        }

        if (relevantLogs.length > 0) {
          archive.append(JSON.stringify(relevantLogs, null, 2), { name: "packet/audit/events.json" });
        }

        await archive.finalize();

        await emitEvent("evidence.packet_exported", tenantId, userId, "evidence_packet", packetId, { itemCount: items.length, evidenceIds });
      } catch (error: any) {
        console.error("[evidence-export] Error:", error);
        if (!res.headersSent) {
          res.status(500).json({ message: error.message });
        }
      }
    }
  );
}
