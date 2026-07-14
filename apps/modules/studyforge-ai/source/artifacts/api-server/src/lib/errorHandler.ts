import type { ErrorRequestHandler } from "express";
import { logger } from "./logger";

/**
 * Global error middleware. Catches anything thrown / next(err)'d in route
 * handlers (including async rejections under Express 5) so the client always
 * gets a JSON shape and the server logs the stack rather than spewing HTML.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;
  const log = req.log ?? logger;
  log.error({ err, url: req.url, method: req.method }, "Unhandled route error");
  const isProd = process.env["NODE_ENV"] === "production";
  res.status(500).json({
    error: "Internal server error",
    ...(isProd ? {} : { detail: err instanceof Error ? err.message : String(err) }),
  });
};
