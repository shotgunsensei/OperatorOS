import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { operatorOsSsoReceiver } from "./routes/auth";
import { stripeWebhookHandler } from "./routes/billing";
import { installErrorHandler } from "./lib/http";

const app: Express = express();

app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

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
const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  "https://torqueshed.pro",
  "https://www.torqueshed.pro",
  ...(process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:4173", "http://127.0.0.1:4173"]),
  ...configuredOrigins,
]);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
  }),
);
app.use((_, response, next) => {
  response.set({
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  });
  next();
});
app.post(
  "/api/billing/stripe/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  stripeWebhookHandler,
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

app.get("/sso", operatorOsSsoReceiver);

app.get("/.well-known/apple-app-site-association", (_, response) => {
  const teamId = process.env.IOS_APP_TEAM_ID?.trim();
  if (!teamId) {
    return response.status(503).json({ error: "IOS_APP_TEAM_ID is not configured" });
  }
  return response
    .type("application/json")
    .set("cache-control", "public, max-age=3600")
    .json({
      applinks: {
        apps: [],
        details: [
          {
            appID: `${teamId}.pro.torqueshed.app`,
            components: [{ "/": "/sso", comment: "OperatorOS SSO handoff" }],
          },
        ],
      },
    });
});

app.get("/.well-known/assetlinks.json", (_, response) => {
  const fingerprint = process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT?.trim();
  if (!fingerprint) {
    return response
      .status(503)
      .json({ error: "ANDROID_APP_SHA256_CERT_FINGERPRINT is not configured" });
  }
  return response
    .type("application/json")
    .set("cache-control", "public, max-age=3600")
    .json([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "pro.torqueshed.app",
          sha256_cert_fingerprints: [fingerprint],
        },
      },
    ]);
});

app.use("/api", router);

const frontendDirectory = path.resolve(
  process.cwd(),
  "artifacts",
  "torqueshed",
  "dist",
  "public",
);
app.use(express.static(frontendDirectory, { index: false, maxAge: "1h" }));
app.get("/{*path}", (request, response, next) => {
  if (request.path.startsWith("/api/")) return next();
  return response.sendFile(path.join(frontendDirectory, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use(installErrorHandler());

export default app;
