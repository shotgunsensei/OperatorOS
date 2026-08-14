import type { Request, Response, NextFunction, RequestHandler } from "express";

export const enforceHttps: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }

  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  if (proto !== "https") {
    return res.status(403).json({ message: "HTTPS is required" });
  }

  next();
};
