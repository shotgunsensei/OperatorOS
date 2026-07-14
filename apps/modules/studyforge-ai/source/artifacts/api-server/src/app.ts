import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler } from "./lib/errorHandler";

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
// Trust the Replit edge proxy so req.ip reflects the real client IP for
// rate-limiting purposes instead of the proxy's loopback address.
app.set("trust proxy", true);
app.use(cookieParser());
// Stripe webhook needs the raw request body to verify HMAC signatures, so it
// must be excluded from the global JSON parser and handled inside its route.
app.use((req, res, next) => {
  if (req.path === "/api/billing/webhook") return next();
  return express.json({ limit: "2mb" })(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Global error middleware — must be last.
app.use(errorHandler);

export default app;
