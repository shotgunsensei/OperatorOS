import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { logger, requestIdMiddleware } from "./logger";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

app.use(requestIdMiddleware());

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';"
    );
  }
  next();
});

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  rateBuckets.forEach((entry, key) => {
    if (now > entry.resetAt) rateBuckets.delete(key);
  });
}, 60_000);

function createRateLimiter(scope: string, windowMs: number, maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? "unknown";
    const bucket = `${scope}:${ip}`;
    const now = Date.now();
    const entry = rateBuckets.get(bucket);

    if (!entry || now > entry.resetAt) {
      rateBuckets.set(bucket, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count++;
    if (entry.count > maxRequests) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Too many requests" });
    }

    return next();
  };
}

app.use("/api/v1", createRateLimiter("api-v1", 60_000, 60));

app.use("/api/public", createRateLimiter("api-public", 60_000, 60));

app.use("/api/auth", createRateLimiter("auth", 60_000, 20));
app.use("/api/api-tokens", createRateLimiter("api-tokens", 60_000, 20));

// Global write-rate limiter for all tenant API mutations.
// Read requests pass through. Public endpoints already have their own limits above.
const writeLimiter = createRateLimiter("api-write", 60_000, 120);
app.use("/api", (req, res, next) => {
  const m = req.method;
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return next();
  if (req.path.startsWith("/v1/") || req.path.startsWith("/public/") || req.path.startsWith("/auth/") || req.path.startsWith("/api-tokens")) {
    return next();
  }
  return writeLimiter(req, res, next);
});

app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "1mb" }));

export function log(message: string, source = "express") {
  logger.info({ source }, message);
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
      if (capturedJsonResponse && !path.startsWith("/api/auth/")) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  const isApiOnly = process.env.API_ONLY === "true";

  if (isApiOnly) {
    log("Running in API-ONLY mode — SPA and session auth disabled");
  } else {
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
