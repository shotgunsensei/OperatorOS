import type { Express } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { requireUser, requireTenant, requireRole, requireClientAccess } from "../../authz";
import { z } from "zod";
import {
  insertClientSchema,
  insertSiteSchema,
  insertAssetSchema,
  insertTenantSchema,
} from "@shared/schema";
import { emitEvent } from "../../core/events/helpers";
import { requireNotPaused } from "../../core/middleware/requireNotPaused";
import { checkLimit } from "../../core/billing/enforcePlan";
import Papa from "papaparse";
import { db } from "../../db";
import { pendingInvitations } from "@shared/schema";

export function registerCoreRoutes(app: Express) {
  // ── CSV Template Downloads (must be before /:id routes) ────────────
  app.get("/api/clients/template.csv", (_req: any, res) => {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=clients-template.csv");
    res.send("name,email,phone,company,notes\nAcme Corp,contact@acme.com,555-0100,Acme Corporation,Primary client\n");
  });

  app.get("/api/sites/template.csv", (_req: any, res) => {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=sites-template.csv");
    res.send("name,address,client_name,notes\nMain Office,123 Business Ave,Acme Corp,Headquarters\n");
  });

  app.get("/api/assets/template.csv", (_req: any, res) => {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=assets-template.csv");
    res.send("name,type,serial_number,ip_address,client_name,site_name,notes\nDC-Server-01,Server,SN-12345,192.168.1.10,Acme Corp,Main Office,Primary domain controller\n");
  });

  app.post("/api/tenants", isAuthenticated, requireUser(), requireNotPaused(), async (req: any, res) => {
    try {
      const parsed = insertTenantSchema.pick({ name: true, slug: true }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const { name, slug } = parsed.data;

      const existing = await storage.getTenantBySlug(slug);
      if (existing) {
        return res.status(400).json({ message: "Slug already taken" });
      }

      const userId = req.userId;
      const existingMembership = await storage.getUserMembership(userId);
      if (existingMembership) {
        return res.status(400).json({ message: "You already belong to an organization" });
      }

      const tenant = await storage.createTenant({ name, slug });
      await storage.addMember(tenant.id, userId, "OWNER");

      await emitEvent("create_tenant", tenant.id, userId, "tenant", tenant.id, { name, slug });

      res.json(tenant);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tenant", isAuthenticated, requireUser(), async (req: any, res) => {
    try {
      const membership = await storage.getUserMembership(req.userId);
      if (!membership) return res.status(404).json({ message: "No tenant" });
      res.json({ tenant: membership.tenant, role: membership.role });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/dashboard", isAuthenticated, requireTenant(), requireRole("OWNER", "ADMIN", "TECH"), async (req: any, res) => {
    try {
      const stats = await storage.getDashboardStats(req.tenantCtx.tenantId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/clients", isAuthenticated, requireTenant(), async (req: any, res) => {
    try {
      const { tenantId, role, userId } = req.tenantCtx;

      if (role === "CLIENT") {
        const allowedIds = await storage.getClientIdsForUser(userId);
        const allClients = await storage.getClientsByTenant(tenantId);
        return res.json(allClients.filter((c) => allowedIds.includes(c.id)));
      }

      const clients = await storage.getClientsByTenant(tenantId);
      res.json(clients);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/clients/:id", isAuthenticated, requireClientAccess("id"), async (req: any, res) => {
    try {
      const { tenantId } = req.tenantCtx;
      const client = await storage.getClientDetail(tenantId, req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });
      res.json(client);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post(
    "/api/clients",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const parsed = insertClientSchema.omit({ tenantId: true }).safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const client = await storage.createClient({
          ...parsed.data,
          tenantId,
        });

        await emitEvent("create_client", tenantId, userId, "client", client.id, { name: parsed.data.name });

        res.json(client);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.delete(
    "/api/clients/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const client = await storage.getClientById(tenantId, req.params.id);
        if (!client) return res.status(404).json({ message: "Client not found" });
        await storage.deleteClient(tenantId, req.params.id);
        await emitEvent("delete_client", tenantId, userId, "client", req.params.id, { name: client.name });
        res.json({ message: "Client deleted" });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/clients/bulk-delete",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
          return res.status(400).json({ message: "ids array is required" });
        }
        const deleted = await storage.deleteClients(tenantId, ids);
        await emitEvent("bulk_delete_clients", tenantId, userId, "client", undefined, { count: deleted, ids });
        res.json({ deleted });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.get("/api/sites", isAuthenticated, requireRole("OWNER", "ADMIN", "TECH"), async (req: any, res) => {
    try {
      const sites = await storage.getSitesByTenant(req.tenantCtx.tenantId);
      res.json(sites);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post(
    "/api/sites",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const parsed = insertSiteSchema.omit({ tenantId: true }).safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const site = await storage.createSite({
          ...parsed.data,
          tenantId,
        });

        await emitEvent("create_site", tenantId, userId, "site", site.id, { name: parsed.data.name });

        res.json(site);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.delete(
    "/api/sites/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        await storage.deleteSite(tenantId, req.params.id);
        await emitEvent("delete_site", tenantId, userId, "site", req.params.id, {});
        res.json({ message: "Site deleted" });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/sites/bulk-delete",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
          return res.status(400).json({ message: "ids array is required" });
        }
        const deleted = await storage.deleteSites(tenantId, ids);
        await emitEvent("bulk_delete_sites", tenantId, userId, "site", undefined, { count: deleted, ids });
        res.json({ deleted });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.get("/api/assets", isAuthenticated, requireRole("OWNER", "ADMIN", "TECH"), async (req: any, res) => {
    try {
      const assets = await storage.getAssetsByTenant(req.tenantCtx.tenantId);
      res.json(assets);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/assets/:id", isAuthenticated, requireRole("OWNER", "ADMIN", "TECH"), async (req: any, res) => {
    try {
      const asset = await storage.getAssetById(req.tenantCtx.tenantId, req.params.id);
      if (!asset) return res.status(404).json({ message: "Asset not found" });
      res.json(asset);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post(
    "/api/assets",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;

        const parsed = insertAssetSchema.omit({ tenantId: true }).safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const asset = await storage.createAsset({
          ...parsed.data,
          tenantId,
        });

        await emitEvent("create_asset", tenantId, userId, "asset", asset.id, { name: parsed.data.name });

        res.json(asset);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.delete(
    "/api/assets/:id",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        await storage.deleteAsset(tenantId, req.params.id);
        await emitEvent("delete_asset", tenantId, userId, "asset", req.params.id, {});
        res.json({ message: "Asset deleted" });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/assets/bulk-delete",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
          return res.status(400).json({ message: "ids array is required" });
        }
        const deleted = await storage.deleteAssets(tenantId, ids);
        await emitEvent("bulk_delete_assets", tenantId, userId, "asset", undefined, { count: deleted, ids });
        res.json({ deleted });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  // ── CSV Bulk Import ─────────────────────────────────────────

  app.post(
    "/api/clients/import",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const { csv } = req.body;
        if (!csv || typeof csv !== "string") {
          return res.status(400).json({ message: "CSV data is required" });
        }

        const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
        if (parsed.errors.length > 0) {
          return res.status(400).json({ message: `CSV parse error: ${parsed.errors[0].message}` });
        }

        const rows = parsed.data;
        if (rows.length === 0) {
          return res.status(400).json({ message: "CSV has no data rows" });
        }
        if (rows.length > 500) {
          return res.status(400).json({ message: "Maximum 500 rows per import" });
        }

        const created: any[] = [];
        const errors: { row: number; message: string }[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const name = row.name?.trim();
          if (!name) {
            errors.push({ row: i + 2, message: "Name is required" });
            continue;
          }
          try {
            const client = await storage.createClient({
              tenantId,
              name,
              email: row.email?.trim() || null,
              phone: row.phone?.trim() || null,
              company: row.company?.trim() || null,
              notes: row.notes?.trim() || null,
            });
            await emitEvent("create_client", tenantId, userId, "client", client.id, { name, source: "csv_import" });
            created.push(client);
          } catch (err: any) {
            errors.push({ row: i + 2, message: err.message });
          }
        }

        res.json({ imported: created.length, errors });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/sites/import",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const { csv } = req.body;
        if (!csv || typeof csv !== "string") {
          return res.status(400).json({ message: "CSV data is required" });
        }

        const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
        if (parsed.errors.length > 0) {
          return res.status(400).json({ message: `CSV parse error: ${parsed.errors[0].message}` });
        }

        const rows = parsed.data;
        if (rows.length === 0) {
          return res.status(400).json({ message: "CSV has no data rows" });
        }
        if (rows.length > 500) {
          return res.status(400).json({ message: "Maximum 500 rows per import" });
        }

        const clients = await storage.getClientsByTenant(tenantId);
        const clientMap = new Map(clients.map(c => [c.name.toLowerCase(), c.id]));

        const created: any[] = [];
        const errors: { row: number; message: string }[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const name = row.name?.trim();
          if (!name) {
            errors.push({ row: i + 2, message: "Name is required" });
            continue;
          }
          try {
            const clientName = row.client_name?.trim();
            const clientId = clientName ? clientMap.get(clientName.toLowerCase()) || null : null;

            const site = await storage.createSite({
              tenantId,
              name,
              address: row.address?.trim() || null,
              clientId,
              notes: row.notes?.trim() || null,
            });
            await emitEvent("create_site", tenantId, userId, "site", site.id, { name, source: "csv_import" });
            created.push(site);
          } catch (err: any) {
            errors.push({ row: i + 2, message: err.message });
          }
        }

        res.json({ imported: created.length, errors });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/assets/import",
    isAuthenticated,
    requireRole("OWNER", "ADMIN", "TECH"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const { csv } = req.body;
        if (!csv || typeof csv !== "string") {
          return res.status(400).json({ message: "CSV data is required" });
        }

        const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
        if (parsed.errors.length > 0) {
          return res.status(400).json({ message: `CSV parse error: ${parsed.errors[0].message}` });
        }

        const rows = parsed.data;
        if (rows.length === 0) {
          return res.status(400).json({ message: "CSV has no data rows" });
        }
        if (rows.length > 500) {
          return res.status(400).json({ message: "Maximum 500 rows per import" });
        }

        const clients = await storage.getClientsByTenant(tenantId);
        const clientMap = new Map(clients.map(c => [c.name.toLowerCase(), c.id]));
        const sites = await storage.getSitesByTenant(tenantId);
        const siteMap = new Map(sites.map(s => [s.name.toLowerCase(), s.id]));

        const created: any[] = [];
        const errors: { row: number; message: string }[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const name = row.name?.trim();
          if (!name) {
            errors.push({ row: i + 2, message: "Name is required" });
            continue;
          }
          try {
            const clientName = row.client_name?.trim();
            const clientId = clientName ? clientMap.get(clientName.toLowerCase()) || null : null;
            const siteName = row.site_name?.trim();
            const siteId = siteName ? siteMap.get(siteName.toLowerCase()) || null : null;

            const asset = await storage.createAsset({
              tenantId,
              name,
              type: row.type?.trim() || null,
              serialNumber: row.serial_number?.trim() || null,
              ipAddress: row.ip_address?.trim() || null,
              clientId,
              siteId,
              notes: row.notes?.trim() || null,
            });
            await emitEvent("create_asset", tenantId, userId, "asset", asset.id, { name, source: "csv_import" });
            created.push(asset);
          } catch (err: any) {
            errors.push({ row: i + 2, message: err.message });
          }
        }

        res.json({ imported: created.length, errors });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.get("/api/members", isAuthenticated, requireTenant(), async (req: any, res) => {
    try {
      const members = await storage.getMembersByTenant(req.tenantCtx.tenantId);
      res.json(members);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post(
    "/api/members/invite",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    checkLimit("usersMax"),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const inviteSchema = z.object({
          email: z.string().email(),
          role: z.enum(["ADMIN", "TECH", "CLIENT"]),
        });

        const parsed = inviteSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        const { email, role } = parsed.data;

        try {
          await db.insert(pendingInvitations).values({
            tenantId,
            email: email.toLowerCase(),
            role: role as any,
          });
        } catch (insertErr: any) {
          if (insertErr.message?.includes("duplicate") || insertErr.message?.includes("unique")) {
            return res.json({ success: true, message: `${email} already has a pending invitation.` });
          }
          throw insertErr;
        }

        await emitEvent("invite_member", tenantId, userId, "member", undefined, { email, role });

        res.json({ success: true, message: `Invitation created for ${email} as ${role}. They will be auto-added when they log in.` });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.patch(
    "/api/members/:id/role",
    isAuthenticated,
    requireRole("OWNER", "ADMIN"),
    requireNotPaused(),
    async (req: any, res) => {
      try {
        const { tenantId, userId } = req.tenantCtx;
        const roleSchema = z.object({
          role: z.enum(["ADMIN", "TECH", "CLIENT"]),
        });

        const parsed = roleSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }

        await storage.updateMemberRole(tenantId, req.params.id, parsed.data.role);

        await emitEvent("change_role", tenantId, userId, "member", req.params.id, { newRole: parsed.data.role });

        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.get("/api/audit-logs", isAuthenticated, requireRole("OWNER", "ADMIN"), async (req: any, res) => {
    try {
      const { action, entityType, dateFrom, dateTo, userId } = req.query;
      const filters: Record<string, string> = {};
      if (action) filters.action = action as string;
      if (entityType) filters.entityType = entityType as string;
      if (dateFrom) filters.dateFrom = dateFrom as string;
      if (dateTo) filters.dateTo = dateTo as string;
      if (userId) filters.userId = userId as string;

      const logs = await storage.getAuditLogsByTenant(req.tenantCtx.tenantId, Object.keys(filters).length > 0 ? filters : undefined);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/audit-actions", isAuthenticated, requireRole("OWNER", "ADMIN"), async (req: any, res) => {
    try {
      const actions = await storage.getAuditActionTypes(req.tenantCtx.tenantId);
      res.json(actions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/client-access", isAuthenticated, requireRole("OWNER", "ADMIN"), async (req: any, res) => {
    try {
      const access = await storage.getClientAccessByTenant(req.tenantCtx.tenantId);
      res.json(access);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/client-access", isAuthenticated, requireRole("OWNER", "ADMIN"), requireNotPaused(), async (req: any, res) => {
    try {
      const { tenantId, userId } = req.tenantCtx;
      const schema = z.object({
        userId: z.string().min(1),
        clientId: z.string().min(1),
        canUpload: z.boolean().optional().default(false),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const { userId: targetUserId, clientId, canUpload } = parsed.data;

      const memberRole = await storage.getMemberRole(tenantId, targetUserId);
      if (memberRole !== "CLIENT") {
        return res.status(400).json({ message: "User must have CLIENT role to be assigned client access" });
      }

      const existing = await storage.getClientIdsForUser(targetUserId);
      if (existing.includes(clientId)) {
        return res.status(400).json({ message: "User already has access to this client" });
      }

      const access = await storage.addClientAccess(tenantId, targetUserId, clientId, canUpload);

      await emitEvent("grant_client_access", tenantId, userId, "client_access", access.id, { targetUserId, clientId, canUpload });

      res.json(access);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/client-access/:id", isAuthenticated, requireRole("OWNER", "ADMIN"), requireNotPaused(), async (req: any, res) => {
    try {
      const { tenantId, userId } = req.tenantCtx;
      const schema = z.object({ canUpload: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input" });
      }

      await storage.updateClientAccessCanUpload(tenantId, req.params.id, parsed.data.canUpload);

      await emitEvent("update_client_access", tenantId, userId, "client_access", req.params.id, { canUpload: parsed.data.canUpload });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/client-access/:id", isAuthenticated, requireRole("OWNER", "ADMIN"), requireNotPaused(), async (req: any, res) => {
    try {
      const { tenantId, userId } = req.tenantCtx;

      await storage.removeClientAccess(tenantId, req.params.id);

      await emitEvent("revoke_client_access", tenantId, userId, "client_access", req.params.id);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * Task #12: legacy endpoint kept for backward compatibility. The truth
   * now lives in the OperatorOS entitlement snapshot on the user record.
   * UI should prefer GET /api/me/entitlements; this endpoint projects the
   * snapshot into the same shape callers were already consuming.
   */
  app.get("/api/tenant/pause-status", isAuthenticated, requireRole("OWNER", "ADMIN", "TECH", "CLIENT"), async (req: any, res) => {
    try {
      const profile = req.user?.profile as Record<string, unknown> | undefined;
      const snap = profile?.entitlementSnapshotJson as { subscriptionStatus?: string } | null | undefined;
      const status = snap?.subscriptionStatus;
      const blocking = new Set(["past_due", "unpaid", "canceled"]);
      const paused = !!status && blocking.has(status);
      res.json({ paused, status: status ?? null, managedBy: "operatoros" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/modules", isAuthenticated, requireTenant(), async (_req: any, res) => {
    try {
      const { moduleRegistry } = await import("@shared/modules");
      res.json(moduleRegistry.modules);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
