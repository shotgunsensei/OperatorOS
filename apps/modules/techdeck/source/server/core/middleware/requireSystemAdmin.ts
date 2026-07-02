import type { Request, Response, NextFunction } from "express";
import { storage } from "../../storage";

export function requireSystemAdmin() {
  return async (req: any, res: Response, next: NextFunction) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const isAdmin = await storage.isUserSystemAdmin(userId);
    if (!isAdmin) {
      return res.status(403).json({ message: "System administrator access required" });
    }

    req.isSystemAdmin = true;
    next();
  };
}
