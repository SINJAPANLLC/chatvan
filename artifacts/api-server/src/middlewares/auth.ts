import { Request, Response, NextFunction } from "express";
import { getToken } from "../lib/tokenStore";

async function resolveUser(req: Request): Promise<boolean> {
  // 1. Try Bearer token from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const data = await getToken(token);
    if (data) {
      req.session.userId = data.userId;
      req.session.userRole = data.userRole;
      req.session.userEmail = data.userEmail;
      return true;
    }
  }
  // 2. Fallback: session cookie
  if (req.session?.userId) return true;
  return false;
}

// 認証必須ではないが、トークンがあれば session に反映する
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  resolveUser(req).then(() => next()).catch(() => next());
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  resolveUser(req).then(ok => {
    if (!ok) { res.status(401).json({ error: "認証が必要です" }); return; }
    next();
  }).catch(() => {
    res.status(401).json({ error: "認証が必要です" });
  });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  resolveUser(req).then(ok => {
    if (!ok) { res.status(401).json({ error: "認証が必要です" }); return; }
    if (req.session.userRole !== "admin") {
      res.status(403).json({ error: "管理者権限が必要です" }); return;
    }
    next();
  }).catch(() => {
    res.status(401).json({ error: "認証が必要です" });
  });
}

export function requireRentalCompany(req: Request, res: Response, next: NextFunction): void {
  resolveUser(req).then(ok => {
    if (!ok) { res.status(401).json({ error: "認証が必要です" }); return; }
    if (req.session.userRole !== "rental_company" && req.session.userRole !== "admin") {
      res.status(403).json({ error: "協力会社権限が必要です" }); return;
    }
    next();
  }).catch(() => {
    res.status(401).json({ error: "認証が必要です" });
  });
}

// Augment session type
declare module "express-session" {
  interface SessionData {
    userId: number;
    userRole: string;
    userEmail: string;
  }
}
