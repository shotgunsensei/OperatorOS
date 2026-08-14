import type { Express, Request, Response } from "express";
import { enforceHttps } from "../../auth/httpsEnforce";
import { csrfProtection } from "../../auth/csrf";

function operatorOsAuthUrl(): string {
  if (process.env.OPERATOROS_AUTH_URL) return process.env.OPERATOROS_AUTH_URL.replace(/\/$/, "");
  const base = (process.env.OPERATOROS_BASE_URL || "https://operatoros.net").replace(/\/$/, "");
  return `${base}/login`;
}

export function registerReviewerRoutes(app: Express): void {
  app.post("/api/reviewer-login", enforceHttps, csrfProtection, (_req: Request, res: Response) => {
    res.setHeader("Location", operatorOsAuthUrl());
    res.status(410).json({
      code: "managed_by_operatoros",
      message: "Reviewer access is managed by OperatorOS. Launch TechDeck through OperatorOS SSO.",
      operatorosAuthUrl: operatorOsAuthUrl(),
    });
  });
}
