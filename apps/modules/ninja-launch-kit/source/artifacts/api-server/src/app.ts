import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import webhookRouter from "./routes/webhook";
import { logger } from "./lib/logger";
import { loadUserMiddleware } from "./lib/session";
import { runSeed } from "./lib/seed";
import { readLimiter } from "./lib/rate-limit";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = (process.env["ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const replitDomains = (process.env["REPLIT_DOMAINS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((d) => `https://${d}`);
const replitDevDomain = process.env["REPLIT_DEV_DOMAIN"]
  ? [`https://${process.env["REPLIT_DEV_DOMAIN"]}`]
  : [];
const corsAllowList = new Set([...allowedOrigins, ...replitDomains, ...replitDevDomain]);

app.use(
  cors({
    origin: (origin, cb) => {
      // Same-origin (no Origin header) or proxied through the same host => allow
      if (!origin) return cb(null, true);
      if (corsAllowList.has(origin)) return cb(null, true);
      // In dev, allow localhost for convenience
      if (process.env["NODE_ENV"] !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);
app.use(cookieParser());

// Stripe webhook MUST be mounted before express.json() so we can verify the raw body signature.
app.use(webhookRouter);

app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

app.use("/api", readLimiter, loadUserMiddleware, router);

// Centralized error handler — never leak stacks to clients.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const e = err as { status?: number; statusCode?: number; message?: string; type?: string };
  const status = e.status ?? e.statusCode ?? 500;
  req.log?.error({ err, status }, "Request error");
  if (res.headersSent) return;
  if (e.message?.startsWith("CORS:")) {
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }
  if (e.type === "entity.too.large" || e.message?.includes("entity.too.large")) {
    res.status(413).json({ error: "Request body too large" });
    return;
  }
  res.status(status).json({
    error: status >= 500 ? "Internal server error" : (e.message || "Request failed"),
  });
});

if (process.env["NODE_ENV"] !== "production" || process.env["RUN_SEED"] === "1") {
  void runSeed().catch((err) => logger.error({ err }, "Seed failed"));
}

export default app;
