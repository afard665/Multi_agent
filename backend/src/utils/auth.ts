import { Request, Response, NextFunction } from "express";

export function adminGuard(req: Request, res: Response, next: NextFunction) {
  const adminKey = process.env.ADMIN_API_KEY;
  // Secure-by-default: if ADMIN_API_KEY isn't set, disable admin actions unless
  // explicitly allowed for local/dev usage.
  if (!adminKey) {
    if (process.env.ALLOW_INSECURE_ADMIN === "true") return next();
    return res.status(503).json({ error: "ADMIN_API_KEY not configured" });
  }
  const provided = req.header("x-admin-key");
  if (provided !== adminKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}
