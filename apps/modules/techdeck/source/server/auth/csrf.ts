import crypto from "crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { sendAuthError } from "./errorPage";

declare module "express-session" {
  interface SessionData {
    csrfToken: string;
  }
}

function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export const csrfToken: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCsrfToken();
  }
  next();
};

export const csrfProtection: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }

  const tokenFromHeader = req.headers["x-csrf-token"] as string | undefined;
  const tokenFromBody = req.body?._csrf as string | undefined;
  const submittedToken = tokenFromHeader || tokenFromBody;
  const sessionToken = req.session?.csrfToken;

  if (!sessionToken || !submittedToken || submittedToken !== sessionToken) {
    return sendAuthError(req, res, 403, "csrf_invalid", "Invalid CSRF token");
  }

  next();
};

export function registerCsrfRoutes(app: import("express").Express): void {
  app.get("/api/auth/csrf-token", csrfToken, (req: Request, res: Response) => {
    res.json({ csrfToken: req.session.csrfToken });
  });
}
