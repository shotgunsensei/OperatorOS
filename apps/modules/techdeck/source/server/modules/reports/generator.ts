import archiver from "archiver";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { storage } from "../../storage";
import { fileStorage } from "../../fileStorage";
import { emitEvent } from "../../core/events/helpers";

export interface EvidencePacketParams {
  dateFrom?: string;
  dateTo?: string;
  tagsInclude?: string[];
  tagsExclude?: string[];
  clientId?: string;
  siteId?: string;
  assetId?: string;
  includeAudit?: boolean;
  includeEvidenceFiles?: boolean;
}

const REPORTS_DIR = path.join(process.cwd(), "data", "uploads", "reports");

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function ensureReportsDir(): void {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

export async function generateEvidencePacket(
  jobId: string,
  tenantId: string,
  userId: string,
  params: EvidencePacketParams
): Promise<string> {
  await storage.updateReportJobStatus(jobId, tenantId, "running");

  try {
    const filters: any = {};
    if (params.dateFrom) filters.dateFrom = params.dateFrom;
    if (params.dateTo) filters.dateTo = params.dateTo;
    if (params.clientId) filters.clientId = params.clientId;
    if (params.assetId) filters.assetId = params.assetId;

    const allEvidence = await storage.searchEvidence(tenantId, filters);

    let items = allEvidence;
    if (params.tagsInclude && params.tagsInclude.length > 0) {
      items = items.filter((item: any) => {
        const itemTagNames = (item.tags || []).map((t: any) =>
          typeof t === "string" ? t : t.name
        );
        return params.tagsInclude!.some((tag) => itemTagNames.includes(tag));
      });
    }
    if (params.tagsExclude && params.tagsExclude.length > 0) {
      items = items.filter((item: any) => {
        const itemTagNames = (item.tags || []).map((t: any) =>
          typeof t === "string" ? t : t.name
        );
        return !params.tagsExclude!.some((tag) => itemTagNames.includes(tag));
      });
    }

    const packetId = crypto.randomBytes(8).toString("hex");
    const timestamp = new Date().toISOString();

    const manifest: Record<string, any> = {
      packetId,
      generatedAt: timestamp,
      tenantId,
      generatedByUserId: userId,
      filters: params,
      itemCount: items.length,
      items: items.map((item: any) => ({
        id: item.id,
        title: item.title,
        fileName: item.fileName,
        fileType: item.fileType,
        fileSize: item.fileSize,
        sha256: item.sha256,
        tags: item.tags || [],
        createdAt: item.createdAt,
        uploadedBy: item.uploadedByName || item.uploadedById,
        client: item.clientName || null,
        asset: item.assetName || null,
        notes: item.notes,
      })),
    };

    const sha256Lines: string[] = [];
    if (params.includeEvidenceFiles !== false) {
      for (const item of items) {
        if (item.sha256) {
          sha256Lines.push(`${item.sha256}  evidence/${sanitizeFilename(item.fileName)}`);
        }
      }
    }
    manifest.sha256sums = sha256Lines;

    let auditEntries: any[] = [];
    if (params.includeAudit !== false) {
      const auditFilters: any = {};
      if (params.dateFrom) auditFilters.dateFrom = params.dateFrom;
      if (params.dateTo) auditFilters.dateTo = params.dateTo;
      auditEntries = await storage.getAuditLogsByTenant(tenantId, auditFilters);
    }

    ensureReportsDir();
    const tenantDir = path.join(REPORTS_DIR, tenantId);
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }
    const outputFile = path.join(tenantDir, `evidence-packet-${packetId}.zip`);
    const outputStream = fs.createWriteStream(outputFile);

    const archive = archiver("zip", { zlib: { level: 6 } });

    return new Promise<string>((resolve, reject) => {
      outputStream.on("close", async () => {
        try {
          await storage.updateReportJobStatus(jobId, tenantId, "complete", { outputPath: outputFile });
          await emitEvent("report.job_completed", tenantId, userId, "report_job", jobId, { packetId, itemCount: items.length });
          resolve(outputFile);
        } catch (err) {
          reject(err);
        }
      });

      archive.on("error", async (err: Error) => {
        try {
          await storage.updateReportJobStatus(jobId, tenantId, "failed", { errorMessage: err.message });
          await emitEvent("report.job_failed", tenantId, userId, "report_job", jobId, { error: err.message });
        } catch (_) {}
        reject(err);
      });

      archive.pipe(outputStream);

      archive.append(JSON.stringify(manifest, null, 2), { name: "packet/manifest.json" });

      if (sha256Lines.length > 0) {
        archive.append(sha256Lines.join("\n") + "\n", { name: "packet/sha256sums.txt" });
      }

      if (params.includeEvidenceFiles !== false) {
        const usedNames = new Set<string>();
        const appendFiles = async () => {
          for (const item of items) {
            try {
              const buffer = await fileStorage.read(item.filePath);
              let safeName = sanitizeFilename(item.fileName);
              if (usedNames.has(safeName)) {
                const ext = path.extname(safeName);
                const base = path.basename(safeName, ext);
                safeName = `${base}_${item.id.slice(0, 8)}${ext}`;
              }
              usedNames.add(safeName);
              archive.append(buffer, { name: `packet/evidence/${safeName}` });
            } catch (err) {
              console.error(`[report-gen] Failed to read file ${item.filePath}:`, err);
            }
          }
        };
        appendFiles()
          .then(() => {
            if (auditEntries.length > 0) {
              const auditJsonl = auditEntries.map((e) => JSON.stringify(e)).join("\n");
              archive.append(auditJsonl + "\n", { name: "packet/audit/audit.jsonl" });
            }
            archive.finalize();
          })
          .catch((err) => {
            archive.abort();
            reject(err);
          });
      } else {
        if (auditEntries.length > 0) {
          const auditJsonl = auditEntries.map((e) => JSON.stringify(e)).join("\n");
          archive.append(auditJsonl + "\n", { name: "packet/audit/audit.jsonl" });
        }
        archive.finalize();
      }
    });
  } catch (err: any) {
    await storage.updateReportJobStatus(jobId, tenantId, "failed", { errorMessage: err.message });
    await emitEvent("report.job_failed", tenantId, userId, "report_job", jobId, { error: err.message });
    throw err;
  }
}
