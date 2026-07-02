import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes/index";
import { serveStatic } from "./static";
import { createServer } from "http";
import { isAppError } from "./errors";

const app = express();
const httpServer = createServer(app);

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.post(
  '/webhooks/operatoros/entitlements',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const { handleOperatorOsEntitlementWebhook } = await import('./services/operatorosEntitlements');
    return handleOperatorOsEntitlementWebhook(req, res);
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse).substring(0, 200)}`;
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  if (!process.env.MODULE_SSO_SECRET) {
    log(
      "FATAL: MODULE_SSO_SECRET is not set. PulseDesk requires the OperatorOS shared secret to be configured before startup. Refusing to boot.",
      "startup"
    );
    process.exit(1);
  }

  log("Connecting to database...", "startup");
  try {
    const { pool: dbPool } = await import("./db");
    const testResult = await dbPool.query("SELECT current_database(), current_user");
    log(`Database connected: db=${testResult.rows[0].current_database}, user=${testResult.rows[0].current_user}`, "startup");
  } catch (dbErr: any) {
    log(`DATABASE CONNECTION FAILED: ${dbErr.message}`, "startup");
    process.exit(1);
  }

  log("Running schema migrations...", "startup");
  const { ensureSchema } = await import("./migrate");
  await ensureSchema();
  log("Schema migrations complete", "startup");

  const { seedDatabase, ensureSuperAdmin, ensureDemoAccount, ensureReviewerAccount } = await import("./seed");
  await seedDatabase();
  await ensureSuperAdmin();
  await ensureDemoAccount();
  await ensureReviewerAccount();

  try {
    const { pool: dbPool } = await import("./db");
    const sessionCheck = await dbPool.query(`SELECT COUNT(*) as cnt FROM "session"`);
    log(`Session table verified: ${sessionCheck.rows[0].cnt} existing sessions`, "startup");
  } catch (sessErr: any) {
    log(`SESSION TABLE CHECK FAILED: ${sessErr.message}`, "startup");
  }

  log("Registering routes and session middleware...", "startup");
  await registerRoutes(httpServer, app);
  log("Routes registered, accepting traffic", "startup");

  try {
    const { registerOperatorOsEntitlementWebhook } = await import("./services/operatorosEntitlements");
    await registerOperatorOsEntitlementWebhook(log);
  } catch (err: any) {
    log(`OperatorOS entitlement webhook registration skipped: ${err?.message ?? "unavailable"}`, "operatoros");
  }

  try {
    const { startImapPolling, setMigratedOrgFilter } = await import("./services/imapPoller");
    try {
      const { pool: dbPool } = await import("./db");
      const migrated = await dbPool.query(
        `SELECT DISTINCT org_id FROM email_settings WHERE imap_migrated_to_connector = true`
      );
      const migratedOrgIds = new Set(migrated.rows.map((r: any) => r.org_id));
      if (migratedOrgIds.size > 0) {
        setMigratedOrgFilter(migratedOrgIds);
        log(`Legacy IMAP poller will skip ${migratedOrgIds.size} migrated org(s)`, "startup");
      }
    } catch {}
    await startImapPolling();
    log("IMAP polling service started", "startup");
  } catch (err: any) {
    log(`IMAP polling init skipped: ${err.message}`, "startup");
  }

  try {
    const { initConnectorServices } = await import("./services/connectors/index");
    initConnectorServices();
    const { startConnectorPolling } = await import("./services/connectorPoller");
    await startConnectorPolling();
    log("Connector polling service started", "startup");
  } catch (err: any) {
    log(`Connector polling init skipped: ${err.message}`, "startup");
  }

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }

    const isProduction = process.env.NODE_ENV === "production";

    if (isAppError(err)) {
      return res.status(err.statusCode).json({
        message: err.message,
      });
    }

    const status = (err as { status?: number; statusCode?: number })?.status
      ?? (err as { status?: number; statusCode?: number })?.statusCode
      ?? 500;

    const message = isProduction
      ? "An unexpected error occurred"
      : (err instanceof Error ? err.message : "Internal Server Error");

    console.error("[unhandled error]", err);
    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    }
  );
})();
