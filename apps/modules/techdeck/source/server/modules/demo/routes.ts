import type { Express } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { requireTenant, requireRole } from "../../authz";
import { emitEvent } from "../../core/events/helpers";

const DEMO_FLAG_KEY = "demo_data_loaded";

const SAMPLE_CLIENTS = [
  { name: "Acme Corp", email: "ops@acme.example", phone: "+1-555-0100", company: "Acme Corporation", notes: "Primary client — manufacturing." },
  { name: "Globex Inc", email: "it@globex.example", phone: "+1-555-0200", company: "Globex, Inc.", notes: "Mid-market retailer." },
  { name: "Initech LLC", email: "support@initech.example", phone: "+1-555-0300", company: "Initech LLC", notes: "Software shop, 25 endpoints." },
];

const SAMPLE_TICKETS = [
  { title: "Email not syncing on iPhone", priority: "high", status: "open", description: "User reports Outlook iOS app stuck on 'Cannot connect'. MFA may have desynced." },
  { title: "VPN dropping every ~10 minutes", priority: "high", status: "in_progress", description: "Affects 3 users on the new hybrid setup. Logs show IKE rekey failures." },
  { title: "Printer offline — accounting", priority: "medium", status: "open", description: "Brother MFC, static IP. Likely DHCP collision after the network change." },
  { title: "Onboard new hire — Sarah K.", priority: "low", status: "open", description: "Standard kit: laptop image, M365 license, VPN profile, Slack invite." },
  { title: "Quarterly backup verification", priority: "low", status: "resolved", description: "Restore test on file server snapshot — verified, signed off in audit log." },
];

export function registerDemoRoutes(app: Express) {
  app.post(
    "/api/demo/seed",
    isAuthenticated,
    requireTenant(),
    requireRole("OWNER", "ADMIN"),
    async (req: any, res) => {
      try {
        const tenantId = req.tenantCtx.tenantId as string;
        const userId = req.userId as string;

        // Idempotency check via tenant settings/audit
        const existing = await storage.getClientsByTenant(tenantId);
        if (existing.length > 0) {
          return res.status(409).json({
            message: "Workspace already has data. Demo seed only runs on empty workspaces.",
            clientCount: existing.length,
          });
        }

        const created = { clients: 0, sites: 0, assets: 0, tickets: 0 };

        for (const sample of SAMPLE_CLIENTS) {
          const client = await storage.createClient({ tenantId, ...sample });
          created.clients++;

          const site = await storage.createSite({
            tenantId,
            clientId: client.id,
            name: `${sample.name} HQ`,
            address: "123 Example Way",
            notes: "Demo site",
          });
          created.sites++;

          const asset = await storage.createAsset({
            tenantId,
            siteId: site.id,
            clientId: client.id,
            name: `${sample.name.split(" ")[0]}-DC01`,
            type: "Server",
            serialNumber: `DEMO-${Math.floor(Math.random() * 90000 + 10000)}`,
            ipAddress: "192.168.1.10",
            notes: "Demo asset",
          } as any);
          created.assets++;
        }

        const allClients = await storage.getClientsByTenant(tenantId);
        for (let i = 0; i < SAMPLE_TICKETS.length; i++) {
          const t = SAMPLE_TICKETS[i];
          const client = allClients[i % allClients.length];
          const number = await storage.getNextTicketNumber(tenantId);
          await storage.createTicket({
            tenantId,
            number,
            clientId: client.id,
            title: t.title,
            description: t.description,
            priority: t.priority as any,
            status: t.status as any,
            assignedToId: userId,
            createdById: userId,
          } as any);
          created.tickets++;
        }

        await emitEvent("demo_seed", tenantId, userId, "tenant", tenantId, created);

        res.json({
          message: "Demo data loaded successfully",
          created,
        });
      } catch (err: any) {
        console.error("[demo:seed] failed:", err);
        res.status(500).json({ message: err.message || "Demo seed failed" });
      }
    },
  );
}

export const __demoFlagKey = DEMO_FLAG_KEY;
