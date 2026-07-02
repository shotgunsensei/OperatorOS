import type { Express } from "express";
import { isAuthenticated } from "../../auth";
import { requireRole } from "../../authz";
import { storage } from "../../storage";
import { emitEvent } from "../../core/events/helpers";
import { generateEvidencePacket, type EvidencePacketParams } from "./generator";
import { requireFeature, checkLimit } from "../../core/billing/enforcePlan";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";
import fs from "fs";
import path from "path";

const BASE_DIR = path.resolve(process.cwd(), "data", "uploads", "reports");

export function registerReportRoutes(app: Express) {
  app.post(
    "/api/reports/evidence-packet",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireFeature("reports"),
    checkLimit("reportsPerMonth"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const { dateFrom, dateTo, tagsInclude, tagsExclude, clientId, siteId, assetId, includeAudit, includeEvidenceFiles } = req.body;

        const params: EvidencePacketParams = {
          dateFrom,
          dateTo,
          tagsInclude: Array.isArray(tagsInclude) ? tagsInclude : undefined,
          tagsExclude: Array.isArray(tagsExclude) ? tagsExclude : undefined,
          clientId,
          siteId,
          assetId,
          includeAudit: includeAudit !== false,
          includeEvidenceFiles: includeEvidenceFiles !== false,
        };

        const job = await storage.createReportJob({
          tenantId,
          createdByUserId: userId,
          type: "evidence_packet",
          status: "queued",
          params,
        });

        await emitEvent("report.job_created", tenantId, userId, "report_job", job.id, { type: "evidence_packet", params });

        const monthKey = new Date().toISOString().slice(0, 7);
        await storage.incrementUsageCounter(tenantId, monthKey, "reportsGenerated").catch(() => {});

        generateEvidencePacket(job.id, tenantId, userId, params).catch((err) => {
          console.error("[reports] Evidence packet generation failed:", err);
        });

        return res.json(job);
      } catch (error: any) {
        console.error("[reports] Error creating evidence packet job:", error);
        return res.status(500).json({ message: error.message });
      }
    }
  );

  app.get(
    "/api/reports/jobs",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireFeature("reports"),
    async (req: any, res) => {
      try {
        const { tenantId } = req.tenantCtx;
        const jobs = await storage.listReportJobs(tenantId);
        return res.json(jobs);
      } catch (error: any) {
        console.error("[reports] Error listing jobs:", error);
        return res.status(500).json({ message: error.message });
      }
    }
  );

  app.get(
    "/api/reports/jobs/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireFeature("reports"),
    async (req: any, res) => {
      try {
        const { tenantId } = req.tenantCtx;
        const job = await storage.getReportJob(tenantId, req.params.id);
        if (!job) {
          return res.status(404).json({ message: "Job not found" });
        }
        return res.json(job);
      } catch (error: any) {
        console.error("[reports] Error getting job:", error);
        return res.status(500).json({ message: error.message });
      }
    }
  );

  app.get(
    "/api/reports/jobs/:id/download",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireFeature("reports"),
    async (req: any, res) => {
      try {
        const { tenantId } = req.tenantCtx;
        const job = await storage.getReportJob(tenantId, req.params.id);

        if (!job) {
          return res.status(404).json({ message: "Job not found" });
        }

        if (job.status !== "complete") {
          return res.status(400).json({ message: "Report is not ready for download" });
        }

        if (!job.outputPath) {
          return res.status(404).json({ message: "Report file not found" });
        }

        const resolved = path.resolve(job.outputPath);
        if (!resolved.startsWith(BASE_DIR)) {
          return res.status(403).json({ message: "Invalid file path" });
        }

        if (!fs.existsSync(resolved)) {
          return res.status(404).json({ message: "Report file no longer exists" });
        }

        const filename = path.basename(resolved);
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

        const stream = fs.createReadStream(resolved);
        stream.pipe(res);
        stream.on("error", (err) => {
          console.error("[reports] Error streaming file:", err);
          if (!res.headersSent) {
            res.status(500).json({ message: "Download failed" });
          }
        });
      } catch (error: any) {
        console.error("[reports] Error downloading report:", error);
        if (!res.headersSent) {
          res.status(500).json({ message: error.message });
        }
      }
    }
  );
}
