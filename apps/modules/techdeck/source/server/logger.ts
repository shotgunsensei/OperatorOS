import pino from "pino";
import type { Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  base: {
    env: process.env.NODE_ENV || "development",
    app: "tech-deck",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.currentPassword",
      "req.body.newPassword",
      "req.body.totpToken",
      "req.body.recoveryCode",
      "*.password",
      "*.token",
      "*.MODULE_SSO_SECRET",
      "MODULE_SSO_SECRET",
      "req.query.token",
    ],
    censor: "[REDACTED]",
  },
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname,env,app" },
        },
      }
    : {}),
});

declare global {
  namespace Express {
    interface Request {
      log?: pino.Logger;
      requestId?: string;
    }
  }
}

export function requestIdMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header("x-request-id");
    const id = incoming && /^[\w-]{1,64}$/.test(incoming) ? incoming : nanoid(12);
    req.requestId = id;
    res.setHeader("x-request-id", id);
    req.log = logger.child({ reqId: id });
    next();
  };
}

export function logChild(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
