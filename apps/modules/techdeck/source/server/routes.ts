import type { Express } from "express";
import { type Server } from "http";
import { setupSession, registerAuthRoutes, hydrateUser, registerSsoRoutes } from "./auth";
import { registerCoreRoutes } from "./modules/core/routes";
import { registerEvidenceRoutes } from "./modules/evidence/routes";
import { registerLicenseRoutes } from "./modules/license/routes";
import { registerWebhookRoutes } from "./modules/webhooks/routes";
import { registerStatusRoutes } from "./modules/status/routes";
import { registerReportRoutes } from "./modules/reports/routes";
import { registerPortalRoutes } from "./modules/portal/routes";
import { registerApiV1Routes } from "./modules/api/routes";
import { registerApiTokenAdminRoutes } from "./modules/api/adminRoutes";
import { registerAdminRoutes } from "./modules/admin/routes";
import { registerTicketRoutes } from "./modules/tickets/routes";
import { registerCalendarRoutes } from "./modules/calendar/routes";
import { registerTimeRoutes } from "./modules/time/routes";
import { registerInvoicingRoutes } from "./modules/invoicing/routes";
import { registerKbRoutes } from "./modules/kb/routes";
import { registerRecurringRoutes } from "./modules/recurring/routes";
import { registerReviewerRoutes } from "./modules/reviewer/routes";
import { registerAccountRoutes } from "./modules/account/routes";
import { registerItOpsRoutes } from "./modules/itops/routes";
import { registerSecureIntakeRoutes } from "./modules/secure-intake/routes";
import { registerDemoRoutes } from "./modules/demo/routes";
import { registerAuditSubscriber } from "./core/events/subscribers";
import { startWebhookWorker } from "./modules/webhooks/worker";
import { startGraceCleanupJob } from "./core/billing/graceCleanup";
import { registerBillingRoutes } from "./modules/billing/routes";
import { registerOperatorOsRoutes } from "./modules/operatoros/routes";
import { registerStripeWebhook } from "./modules/billing/webhook";
import { seedSubscriptionPlans, initStripeClient, isStripeConfigured, setStripePriceMap } from "./modules/billing/stripe";
import { storage } from "./storage";
import { pool } from "./db";
import { ensureProductionSetup } from "./productionSeed";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { db } from "./db";
import { sql } from "drizzle-orm";

declare const __APP_VERSION__: string;
const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
const isApiOnly = process.env.API_ONLY === "true";
const legacyStripeAuditEnabled = process.env.ENABLE_LEGACY_STRIPE_WEBHOOK_AUDIT === "true";
const legacyBillingSeedEnabled = process.env.ENABLE_LEGACY_BILLING_SEED === "true";

async function initStripeSync(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("[stripe] DATABASE_URL not set, skipping Stripe sync init");
    return;
  }

  try {
    await initStripeClient();

    if (!isStripeConfigured()) {
      console.warn("[stripe] Stripe client not available, skipping sync setup");
      return;
    }

    console.log("[stripe] Running stripe-replit-sync migrations...");
    await runMigrations({ databaseUrl });
    console.log("[stripe] Stripe schema ready");

    const stripeSync = await getStripeSync();

    console.log("[stripe] Setting up managed webhook...");
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    try {
      const result = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      const webhookUrl = result?.webhook?.url || result?.url || webhookBaseUrl + "/api/stripe/webhook";
      console.log(`[stripe] Webhook configured: ${webhookUrl}`);
    } catch (webhookErr: any) {
      console.warn("[stripe] Managed webhook setup failed (non-fatal):", webhookErr.message);
    }

    console.log("[stripe] Syncing Stripe data in background...");
    stripeSync.syncBackfill()
      .then(() => console.log("[stripe] Stripe data synced"))
      .catch((err: any) => console.error("[stripe] Error syncing Stripe data:", err));

    await loadStripePriceMap();
  } catch (error: any) {
    console.error("[stripe] Failed to initialize Stripe sync:", error.message);
  }
}

async function loadStripePriceMap(): Promise<void> {
  try {
    const result = await db.execute(sql`
      SELECT p.metadata, pr.id as price_id
      FROM stripe.products p
      JOIN stripe.prices pr ON pr.product = p.id
      WHERE p.active = true AND pr.active = true
      AND pr.recurring IS NOT NULL
    `);

    const map: Record<string, string> = {};
    for (const row of result.rows as any[]) {
      const metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
      if (metadata?.plan_code && row.price_id) {
        map[metadata.plan_code] = row.price_id;
      }
    }

    if (Object.keys(map).length > 0) {
      setStripePriceMap(map);
      console.log("[stripe] Loaded price map:", Object.keys(map).join(", "));
    } else {
      console.log("[stripe] No Stripe products found with plan_code metadata. Run seed-stripe-products.ts to create them.");
    }
  } catch (err: any) {
    console.warn("[stripe] Could not load price map (stripe schema may not be ready yet):", err.message);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerAuditSubscriber(storage.createAuditLog.bind(storage));

  app.get("/health", async (_req, res) => {
    let dbOk = false;
    try {
      await pool.query("SELECT 1");
      dbOk = true;
    } catch {}
    const status = dbOk ? "ok" : "degraded";
    res.status(dbOk ? 200 : 503).json({
      status,
      mode: isApiOnly ? "api_only" : "full",
      version: APP_VERSION,
      database: dbOk ? "connected" : "unreachable",
    });
  });

  registerApiV1Routes(app);

  if (legacyStripeAuditEnabled) {
    registerStripeWebhook(app);
  } else {
    console.log("[stripe] Legacy Stripe webhook audit route disabled. Set ENABLE_LEGACY_STRIPE_WEBHOOK_AUDIT=true to register it.");
  }

  if (legacyBillingSeedEnabled) {
    await seedSubscriptionPlans().catch((err) =>
      console.error("[billing] Failed to seed subscription plans:", err)
    );
  } else {
    console.log("[billing] Legacy local subscription plan seed disabled. OperatorOS owns plan catalog.");
  }

  if (legacyStripeAuditEnabled) {
    await initStripeSync().catch((err) =>
      console.error("[stripe] Stripe sync initialization failed:", err)
    );
  }

  await ensureProductionSetup().catch((err) =>
    console.error("[setup] Production setup failed:", err)
  );

  if (!isApiOnly) {
    startWebhookWorker();

    setupSession(app);
    app.use(hydrateUser);
    registerAuthRoutes(app);
    registerSsoRoutes(app);
    registerReviewerRoutes(app);
    registerAccountRoutes(app);

    registerCoreRoutes(app);
    registerEvidenceRoutes(app);
    registerLicenseRoutes(app);
    registerWebhookRoutes(app);
    registerStatusRoutes(app);
    registerReportRoutes(app);
    registerPortalRoutes(app);
    registerApiTokenAdminRoutes(app);
    registerBillingRoutes(app);
    registerOperatorOsRoutes(app);
    registerAdminRoutes(app);
    registerTicketRoutes(app);
    registerCalendarRoutes(app);
    registerTimeRoutes(app);
    registerInvoicingRoutes(app);
    registerKbRoutes(app);
    registerRecurringRoutes(app);
    registerItOpsRoutes(app);
    registerSecureIntakeRoutes(app);
    registerDemoRoutes(app);

    startGraceCleanupJob();
  }

  return httpServer;
}
