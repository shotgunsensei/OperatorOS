import type { Express, Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { storage } from "../../storage";
import { fileStorage } from "../../fileStorage";
import { isAuthenticated } from "../../auth";
import { requireTenant, requireRole } from "../../authz";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";
import { requireFeature, checkLimit, getTenantPlanLimits, checkTenantFeatureAccess } from "../../core/billing/enforcePlan";
import { emitEvent } from "../../core/events/helpers";
import type { PlanLimits } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Too many upload attempts. Please try again later." },
});

const DANGEROUS_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "scr", "pif", "msi", "msp", "mst",
  "cpl", "hta", "inf", "ins", "isp", "jse", "lnk", "reg", "rgs",
  "sct", "shb", "shs", "vbe", "vbs", "wsc", "wsf", "wsh", "ws",
  "ps1", "ps1xml", "ps2", "ps2xml", "psc1", "psc2", "dll", "sys",
]);

const MIME_EXTENSION_MAP: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "text/csv": ["csv"],
  "text/plain": ["txt"],
  "application/zip": ["zip"],
  "application/x-7z-compressed": ["7z"],
  "application/gzip": ["gz"],
};

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 255);
}

function validateMimeVsExtension(mimeType: string, filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return true;
  const allowedExts = MIME_EXTENSION_MAP[mimeType];
  if (!allowedExts) return true;
  return allowedExts.includes(ext);
}

function isExtensionDangerous(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  return !!ext && DANGEROUS_EXTENSIONS.has(ext);
}

async function logIntakeAudit(tenantId: string, action: string, req: Request, extra?: { actorType?: string; actorId?: string; objectType?: string; objectId?: string; metadata?: any }) {
  await storage.createIntakeAuditEvent({
    tenantId,
    actorType: extra?.actorType || "user",
    actorId: extra?.actorId || (req as any).tenantCtx?.userId || (req as any).session?.userId,
    action,
    objectType: extra?.objectType,
    objectId: extra?.objectId,
    ipAddress: req.ip || req.socket.remoteAddress || null,
    userAgent: req.headers["user-agent"] || null,
    metadata: extra?.metadata,
  });
}

const intakeAuth = [isAuthenticated, requireTenant(), requireFeature("intake")];
const intakeReadTech = [...intakeAuth, requireRole("OWNER", "ADMIN", "TECH")];
const intakeWriteAdmin = [...intakeAuth, requireRole("OWNER", "ADMIN"), requireNotPaused()];
const intakeWriteTech = [...intakeAuth, requireRole("OWNER", "ADMIN", "TECH"), requireNotPaused()];

export function registerSecureIntakeRoutes(app: Express) {

  app.get("/api/secure-intake/dashboard", ...intakeReadTech, async (req: Request, res: Response) => {
    try {
      const { tenantId } = (req as any).tenantCtx;
      const stats = await storage.getIntakeDashboardStats(tenantId);
      const limits = await getTenantPlanLimits(tenantId);
      res.json({
        ...stats,
        limits: {
          intakeStorageGb: limits?.intakeStorageGb || 1,
          intakeSpacesMax: limits?.intakeSpacesMax || 1,
          intakeRequestsPerMonth: limits?.intakeRequestsPerMonth || 5,
        },
      });
    } catch (error) {
      console.error("[secure-intake] Dashboard error:", error);
      res.status(500).json({ message: "Failed to load dashboard" });
    }
  });

  app.get("/api/secure-intake/spaces", ...intakeReadTech, async (req: Request, res: Response) => {
    try {
      const { tenantId } = (req as any).tenantCtx;
      const spaces = await storage.getIntakeSpacesByTenant(tenantId);
      res.json(spaces);
    } catch (error) {
      res.status(500).json({ message: "Failed to load spaces" });
    }
  });

  app.post("/api/secure-intake/spaces", ...intakeWriteAdmin, checkLimit("intakeSpacesMax"), async (req: Request, res: Response) => {
    try {
      const { tenantId, userId } = (req as any).tenantCtx;
      const body = z.object({
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
        description: z.string().max(500).optional(),
        allowedFileTypes: z.array(z.string().max(20)).max(50).optional(),
        maxFileSizeMb: z.number().min(1).max(5120).optional(),
        requireMetadata: z.boolean().optional(),
        metadataFields: z.any().optional(),
        retentionDays: z.number().min(1).optional().nullable(),
        externalUploadsEnabled: z.boolean().optional(),
      }).parse(req.body);

      const existing = await storage.getIntakeSpaceBySlug(tenantId, body.slug);
      if (existing) return res.status(409).json({ message: "A space with this slug already exists" });

      const space = await storage.createIntakeSpace({ tenantId, ...body });
      await logIntakeAudit(tenantId, "space.created", req, { objectType: "space", objectId: space.id, metadata: { spaceName: body.name } });
      await emitEvent("intake.space.created", tenantId, userId, "intake_space", space.id, { name: body.name });
      res.status(201).json(space);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Validation failed", errors: error.errors });
      console.error("[secure-intake] Create space error:", error);
      res.status(500).json({ message: "Failed to create space" });
    }
  });

  app.patch("/api/secure-intake/spaces/:id", ...intakeWriteAdmin, async (req: Request, res: Response) => {
    try {
      const { tenantId, userId } = (req as any).tenantCtx;
      const body = z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        allowedFileTypes: z.array(z.string().max(20)).max(50).optional(),
        maxFileSizeMb: z.number().min(1).max(5120).optional(),
        requireMetadata: z.boolean().optional(),
        metadataFields: z.any().optional(),
        retentionDays: z.number().min(1).optional().nullable(),
        externalUploadsEnabled: z.boolean().optional(),
        status: z.enum(["active", "archived"]).optional(),
      }).parse(req.body);

      const space = await storage.updateIntakeSpace(tenantId, (req.params.id as string), body);
      if (!space) return res.status(404).json({ message: "Space not found" });
      await logIntakeAudit(tenantId, "space.updated", req, { objectType: "space", objectId: space.id, metadata: body });
      await emitEvent("intake.space.updated", tenantId, userId, "intake_space", space.id, { changes: Object.keys(body) });
      res.json(space);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Validation failed", errors: error.errors });
      res.status(500).json({ message: "Failed to update space" });
    }
  });

  app.delete("/api/secure-intake/spaces/:id", ...intakeWriteAdmin, async (req: Request, res: Response) => {
    try {
      const { tenantId, userId } = (req as any).tenantCtx;
      const space = await storage.getIntakeSpaceById(tenantId, (req.params.id as string));
      if (!space) return res.status(404).json({ message: "Space not found" });
      await storage.deleteIntakeSpace(tenantId, (req.params.id as string));
      await logIntakeAudit(tenantId, "space.deleted", req, { objectType: "space", objectId: (req.params.id as string), metadata: { spaceName: space.name } });
      await emitEvent("intake.space.deleted", tenantId, userId, "intake_space", (req.params.id as string), { name: space.name });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete space" });
    }
  });

  app.get("/api/secure-intake/requests", ...intakeReadTech, async (req: Request, res: Response) => {
    try {
      const { tenantId } = (req as any).tenantCtx;
      const requests = await storage.getUploadRequestsByTenant(tenantId, {
        spaceId: req.query.spaceId as string,
        status: req.query.status as string,
      });
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "Failed to load requests" });
    }
  });

  app.post("/api/secure-intake/requests", ...intakeWriteTech, checkLimit("intakeRequestsPerMonth"), async (req: Request, res: Response) => {
    try {
      const { tenantId, userId } = (req as any).tenantCtx;

      const limits = await getTenantPlanLimits(tenantId);
      if (limits?.intakeRequestsPerMonth) {
        const activeCount = await storage.getActiveUploadRequestCount(tenantId);
        if (activeCount >= limits.intakeRequestsPerMonth) {
          return res.status(402).json({
            error: "plan_limit_reached",
            message: "You have reached the upload request limit for your current plan.",
          });
        }
      }

      const body = z.object({
        spaceId: z.string().min(1),
        title: z.string().min(1).max(200),
        uploaderName: z.string().max(100).optional(),
        uploaderEmail: z.string().email().optional().or(z.literal("")),
        instructions: z.string().max(2000).optional(),
        maxUploads: z.number().min(1).max(100).optional().nullable(),
        maxTotalSizeMb: z.number().min(1).max(10000).optional().nullable(),
        allowedFileTypes: z.array(z.string().max(20)).max(50).optional(),
        oneTimeUse: z.boolean().optional(),
        expiresAt: z.string().optional().nullable(),
        requiresPassword: z.boolean().optional(),
        password: z.string().min(6).max(128).optional(),
      }).parse(req.body);

      const space = await storage.getIntakeSpaceById(tenantId, body.spaceId);
      if (!space) return res.status(404).json({ message: "Intake space not found" });
      if (space.status !== "active") return res.status(400).json({ message: "This intake space is not active" });

      const token = generateSecureToken();
      let passwordHash: string | null = null;
      if (body.requiresPassword && body.password) {
        passwordHash = await bcrypt.hash(body.password, 12);
      }

      const request = await storage.createUploadRequest({
        tenantId,
        spaceId: body.spaceId,
        title: body.title,
        uploaderName: body.uploaderName || null,
        uploaderEmail: body.uploaderEmail || null,
        instructions: body.instructions || null,
        token,
        maxUploads: body.maxUploads ?? null,
        maxTotalSizeMb: body.maxTotalSizeMb ?? null,
        allowedFileTypes: body.allowedFileTypes || null,
        oneTimeUse: body.oneTimeUse || false,
        requiresPassword: !!body.requiresPassword,
        passwordHash,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdById: userId,
        status: "active",
      });

      await logIntakeAudit(tenantId, "request.created", req, { objectType: "upload_request", objectId: request.id, metadata: { title: body.title, uploaderEmail: body.uploaderEmail, spaceId: body.spaceId } });
      await emitEvent("intake.request.created", tenantId, userId, "upload_request", request.id, { title: body.title, spaceName: space.name });

      const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || req.hostname;
      const uploadUrl = `https://${domain}/t/upload/${token}`;

      res.status(201).json({ ...request, uploadUrl });
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Validation failed", errors: error.errors });
      console.error("[secure-intake] Create request error:", error);
      res.status(500).json({ message: "Failed to create upload request" });
    }
  });

  app.post("/api/secure-intake/requests/:id/revoke", ...intakeWriteTech, async (req: Request, res: Response) => {
    try {
      const { tenantId, userId } = (req as any).tenantCtx;
      const existing = await storage.getUploadRequestById(tenantId, (req.params.id as string));
      if (!existing) return res.status(404).json({ message: "Upload request not found" });
      if (existing.status !== "active") return res.status(400).json({ message: "Only active requests can be revoked" });

      await storage.revokeUploadRequest(tenantId, (req.params.id as string));
      await logIntakeAudit(tenantId, "request.revoked", req, { objectType: "upload_request", objectId: (req.params.id as string), metadata: { title: existing.title } });
      await emitEvent("intake.request.revoked", tenantId, userId, "upload_request", (req.params.id as string), { title: existing.title });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to revoke request" });
    }
  });

  app.get("/api/secure-intake/files", ...intakeReadTech, async (req: Request, res: Response) => {
    try {
      const { tenantId } = (req as any).tenantCtx;
      const files = await storage.getIntakeFilesByTenant(tenantId, {
        spaceId: req.query.spaceId as string,
        status: req.query.status as string,
        uploadRequestId: req.query.uploadRequestId as string,
        query: req.query.query as string,
      });
      res.json(files);
    } catch (error) {
      res.status(500).json({ message: "Failed to load files" });
    }
  });

  app.get("/api/secure-intake/files/:id/download", ...intakeReadTech, async (req: Request, res: Response) => {
    try {
      const { tenantId, userId } = (req as any).tenantCtx;
      const file = await storage.getIntakeFileById(tenantId, (req.params.id as string));
      if (!file) return res.status(404).json({ message: "File not found" });

      const buffer = await fileStorage.read(file.storagePath);
      await logIntakeAudit(tenantId, "file.downloaded", req, { objectType: "file", objectId: file.id, metadata: { fileName: file.originalName } });
      await emitEvent("intake.file.downloaded", tenantId, userId, "intake_file", file.id, { fileName: file.originalName });

      res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.originalName)}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(buffer);
    } catch (error) {
      console.error("[secure-intake] Download error:", error);
      res.status(500).json({ message: "Failed to download file" });
    }
  });

  app.patch("/api/secure-intake/files/:id", ...intakeWriteTech, async (req: Request, res: Response) => {
    try {
      const { tenantId, userId } = (req as any).tenantCtx;
      const body = z.object({
        status: z.enum(["uploaded", "reviewed", "approved", "rejected", "archived"]).optional(),
        reviewNotes: z.string().max(2000).optional(),
      }).parse(req.body);

      const updates: any = { ...body };
      if (body.status && ["reviewed", "approved", "rejected"].includes(body.status)) {
        updates.reviewedById = userId;
        updates.reviewedAt = new Date();
      }

      const file = await storage.updateIntakeFile(tenantId, (req.params.id as string), updates);
      if (!file) return res.status(404).json({ message: "File not found" });

      await logIntakeAudit(tenantId, `file.${body.status || "updated"}`, req, { objectType: "file", objectId: file.id, metadata: { status: body.status, fileName: file.originalName } });
      await emitEvent(`intake.file.${body.status || "updated"}`, tenantId, userId, "intake_file", file.id, { fileName: file.originalName, status: body.status });
      res.json(file);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Validation failed" });
      res.status(500).json({ message: "Failed to update file" });
    }
  });

  app.delete("/api/secure-intake/files/:id", ...intakeWriteAdmin, async (req: Request, res: Response) => {
    try {
      const { tenantId, userId } = (req as any).tenantCtx;
      const file = await storage.getIntakeFileById(tenantId, (req.params.id as string));
      if (!file) return res.status(404).json({ message: "File not found" });

      await fileStorage.delete(file.storagePath);
      await storage.deleteIntakeFile(tenantId, (req.params.id as string));
      await logIntakeAudit(tenantId, "file.deleted", req, { objectType: "file", objectId: (req.params.id as string), metadata: { fileName: file.originalName, sizeBytes: file.sizeBytes } });
      await emitEvent("intake.file.deleted", tenantId, userId, "intake_file", (req.params.id as string), { fileName: file.originalName });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete file" });
    }
  });

  app.get("/api/secure-intake/storage", ...intakeAuth, requireRole("OWNER", "ADMIN"), async (req: Request, res: Response) => {
    try {
      const { tenantId } = (req as any).tenantCtx;
      const usedBytes = await storage.getIntakeStorageUsed(tenantId);
      const limits = await getTenantPlanLimits(tenantId);
      res.json({ usedBytes, limitGb: limits?.intakeStorageGb || 1 });
    } catch (error) {
      res.status(500).json({ message: "Failed to load storage info" });
    }
  });

  app.get("/api/secure-intake/audit", ...intakeAuth, requireRole("OWNER", "ADMIN"), async (req: Request, res: Response) => {
    try {
      const { tenantId } = (req as any).tenantCtx;
      const filters = z.object({
        action: z.string().optional(),
        objectType: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }).parse(req.query);
      const events = await storage.getIntakeAuditEvents(tenantId, filters);
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to load audit events" });
    }
  });

  app.get("/api/secure-intake/policies", ...intakeAuth, requireRole("OWNER", "ADMIN"), async (req: Request, res: Response) => {
    try {
      const { tenantId } = (req as any).tenantCtx;
      const policy = await storage.getIntakePolicy(tenantId);
      res.json(policy || {});
    } catch (error) {
      res.status(500).json({ message: "Failed to load policies" });
    }
  });

  app.put("/api/secure-intake/policies", ...intakeWriteAdmin, async (req: Request, res: Response) => {
    try {
      const { tenantId, userId } = (req as any).tenantCtx;
      const body = z.object({
        defaultMaxFileSizeMb: z.number().min(1).max(5120).optional(),
        defaultAllowedFileTypes: z.array(z.string().max(20)).max(50).optional().nullable(),
        defaultRetentionDays: z.number().min(1).max(3650).optional().nullable(),
        defaultExpirationHours: z.number().min(1).max(8760).optional(),
        requirePasswordForLinks: z.boolean().optional(),
        autoDeleteExpiredFiles: z.boolean().optional(),
        complianceNotice: z.string().max(5000).optional().nullable(),
      }).parse(req.body);

      const policy = await storage.upsertIntakePolicy(tenantId, body);
      await logIntakeAudit(tenantId, "policy.updated", req, { objectType: "policy", objectId: policy.id, metadata: { changes: Object.keys(body) } });
      await emitEvent("intake.policy.updated", tenantId, userId, "intake_policy", policy.id);
      res.json(policy);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Validation failed", errors: error.errors });
      res.status(500).json({ message: "Failed to update policies" });
    }
  });


  app.get("/api/public/intake/:token", uploadLimiter, async (req: Request, res: Response) => {
    try {
      const request = await storage.getUploadRequestByToken((req.params.token as string));
      if (!request) return res.status(404).json({ message: "Upload request not found" });

      if (request.status === "revoked") return res.status(410).json({ message: "This upload link has been revoked" });
      if (request.status === "completed") return res.status(410).json({ message: "This upload request has already been completed" });
      if (request.status === "expired" || (request.expiresAt && new Date(request.expiresAt) < new Date())) {
        return res.status(410).json({ message: "This upload link has expired" });
      }

      const tenant = await storage.getTenantById(request.tenantId);
      if (!tenant) return res.status(410).json({ message: "This organization is no longer available" });
      const access = await checkTenantFeatureAccess(request.tenantId, "intake");
      if (!access.ok) return res.status(access.status).json({ message: "This service is temporarily unavailable. Please contact the organization.", error: access.error });

      const space = await storage.getIntakeSpaceById(request.tenantId, request.spaceId);
      if (!space || space.status !== "active") return res.status(410).json({ message: "This intake space is no longer available" });

      const policy = await storage.getIntakePolicy(request.tenantId);

      res.json({
        title: request.title,
        instructions: request.instructions,
        spaceName: space.name,
        maxUploads: request.maxUploads,
        maxTotalSizeMb: request.maxTotalSizeMb,
        allowedFileTypes: request.allowedFileTypes || space.allowedFileTypes,
        maxFileSizeMb: space.maxFileSizeMb,
        uploadCount: request.uploadCount,
        requiresPassword: request.requiresPassword,
        uploaderName: request.uploaderName,
        complianceNotice: policy?.complianceNotice || null,
      });
    } catch (error) {
      console.error("[secure-intake] Public intake info error:", error);
      res.status(500).json({ message: "Failed to load upload request" });
    }
  });

  app.post("/api/public/intake/:token/verify-password", uploadLimiter, async (req: Request, res: Response) => {
    try {
      const request = await storage.getUploadRequestByToken((req.params.token as string));
      if (!request || !request.requiresPassword || !request.passwordHash) {
        return res.status(400).json({ message: "Invalid request" });
      }

      if (request.status !== "active") return res.status(410).json({ message: "This upload link is no longer active" });
      if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
        return res.status(410).json({ message: "This upload link has expired" });
      }

      const tenant = await storage.getTenantById(request.tenantId);
      if (!tenant) return res.status(410).json({ message: "This organization is no longer available" });
      const access = await checkTenantFeatureAccess(request.tenantId, "intake");
      if (!access.ok) return res.status(access.status).json({ message: "This service is temporarily unavailable", error: access.error });

      const body = z.object({ password: z.string().min(1) }).parse(req.body);
      const valid = await bcrypt.compare(body.password, request.passwordHash);
      if (!valid) {
        await logIntakeAudit(request.tenantId, "auth.password_failed", req, { actorType: "external", objectType: "upload_request", objectId: request.id });
        return res.status(401).json({ message: "Invalid password" });
      }
      await logIntakeAudit(request.tenantId, "auth.password_verified", req, { actorType: "external", objectType: "upload_request", objectId: request.id });
      res.json({ success: true });
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Password required" });
      res.status(500).json({ message: "Verification failed" });
    }
  });

  app.post("/api/public/intake/:token/upload", uploadLimiter, upload.array("files", 10), async (req: Request, res: Response) => {
    try {
      const request = await storage.getUploadRequestByToken((req.params.token as string));
      if (!request) return res.status(404).json({ message: "Upload request not found" });
      if (request.status !== "active") return res.status(410).json({ message: "This upload link is no longer active" });
      if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
        await storage.updateUploadRequest(request.tenantId, request.id, { status: "expired" });
        await emitEvent("intake.request.expired", request.tenantId, undefined, "upload_request", request.id, { title: request.title });
        return res.status(410).json({ message: "This upload link has expired" });
      }

      const tenant = await storage.getTenantById(request.tenantId);
      if (!tenant) return res.status(410).json({ message: "This organization is no longer available" });

      const access = await checkTenantFeatureAccess(request.tenantId, "intake");
      if (!access.ok) return res.status(access.status).json({ message: "This service is temporarily unavailable", error: access.error });

      if (request.requiresPassword && request.passwordHash) {
        const password = req.body?.password || req.headers["x-upload-password"];
        if (!password) return res.status(401).json({ message: "Password required" });
        const valid = await bcrypt.compare(String(password), request.passwordHash);
        if (!valid) {
          await logIntakeAudit(request.tenantId, "auth.password_failed", req, { actorType: "external", objectType: "upload_request", objectId: request.id });
          return res.status(401).json({ message: "Invalid password" });
        }
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) return res.status(400).json({ message: "No files provided" });

      if (request.maxUploads && (request.uploadCount + files.length) > request.maxUploads) {
        return res.status(400).json({ message: `Upload limit exceeded. ${request.maxUploads - request.uploadCount} upload(s) remaining.` });
      }

      const totalNewBytes = files.reduce((sum, f) => sum + f.size, 0);
      if (request.maxTotalSizeMb && (request.totalUploadedBytes + totalNewBytes) > request.maxTotalSizeMb * 1024 * 1024) {
        return res.status(400).json({ message: "Total size limit exceeded" });
      }

      const limits = await getTenantPlanLimits(request.tenantId);
      const currentStorage = await storage.getIntakeStorageUsed(request.tenantId);
      const storageLimit = (limits?.intakeStorageGb || 1) * 1024 * 1024 * 1024;
      if (currentStorage + totalNewBytes > storageLimit) {
        return res.status(402).json({ message: "Storage quota exceeded for this organization" });
      }

      const space = await storage.getIntakeSpaceById(request.tenantId, request.spaceId);
      if (!space || space.status !== "active") return res.status(410).json({ message: "This intake space is no longer available" });

      const allowedTypes = request.allowedFileTypes || space.allowedFileTypes;
      const maxSizeMb = space.maxFileSizeMb || 25;

      const uploadedFiles = [];
      const rejectedFiles = [];

      for (const file of files) {
        const sanitizedName = sanitizeFilename(file.originalname);
        const ext = sanitizedName.split(".").pop()?.toLowerCase();

        if (isExtensionDangerous(sanitizedName)) {
          rejectedFiles.push({ name: file.originalname, reason: "File type not permitted for security reasons" });
          continue;
        }

        if (!validateMimeVsExtension(file.mimetype, sanitizedName)) {
          rejectedFiles.push({ name: file.originalname, reason: "File extension does not match content type" });
          continue;
        }

        if (file.size > maxSizeMb * 1024 * 1024) {
          rejectedFiles.push({ name: file.originalname, reason: `Exceeds ${maxSizeMb}MB limit` });
          continue;
        }

        if (allowedTypes && allowedTypes.length > 0) {
          if (!ext || !allowedTypes.includes(ext)) {
            rejectedFiles.push({ name: file.originalname, reason: `File type .${ext || "unknown"} not allowed` });
            continue;
          }
        }

        const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
        const storagePath = await fileStorage.save(sanitizedName, file.buffer, `intake/${request.tenantId}/${request.spaceId}`);

        const metadata = req.body?.metadata ? (typeof req.body.metadata === "string" ? JSON.parse(req.body.metadata) : req.body.metadata) : null;

        const intakeFile = await storage.createIntakeFile({
          tenantId: request.tenantId,
          spaceId: request.spaceId,
          uploadRequestId: request.id,
          originalName: sanitizedName,
          storagePath,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          sha256,
          status: "uploaded",
          uploaderName: request.uploaderName || req.body?.uploaderName || null,
          uploaderEmail: request.uploaderEmail || req.body?.uploaderEmail || null,
          uploaderIp: req.ip || req.socket.remoteAddress || null,
          metadata,
        });

        await storage.incrementUploadRequestCount(request.id, file.size);
        uploadedFiles.push(intakeFile);

        await storage.createIntakeAuditEvent({
          tenantId: request.tenantId,
          actorType: "external",
          actorId: request.uploaderEmail || "anonymous",
          action: "file.uploaded",
          objectType: "file",
          objectId: intakeFile.id,
          ipAddress: req.ip || req.socket.remoteAddress || null,
          userAgent: req.headers["user-agent"] || null,
          metadata: { fileName: sanitizedName, fileSize: file.size, requestId: request.id, sha256 },
        });

        await emitEvent("intake.file.uploaded", request.tenantId, undefined, "intake_file", intakeFile.id, { fileName: sanitizedName, requestId: request.id, uploaderEmail: request.uploaderEmail });
      }

      if (request.oneTimeUse || (request.maxUploads && (request.uploadCount + uploadedFiles.length) >= request.maxUploads)) {
        await storage.updateUploadRequest(request.tenantId, request.id, { status: "completed", completedAt: new Date() });
        await emitEvent("intake.request.completed", request.tenantId, undefined, "upload_request", request.id, { title: request.title, fileCount: request.uploadCount + uploadedFiles.length });
      }

      res.json({
        success: true,
        uploadedCount: uploadedFiles.length,
        rejectedCount: rejectedFiles.length,
        files: uploadedFiles.map((f) => ({ id: f.id, name: f.originalName, size: f.sizeBytes })),
        rejected: rejectedFiles,
      });
    } catch (error) {
      console.error("[secure-intake] Upload error:", error);
      res.status(500).json({ message: "Upload failed" });
    }
  });
}
