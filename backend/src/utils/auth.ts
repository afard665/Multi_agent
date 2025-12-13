import { Request, Response, NextFunction } from "express";

export function adminGuard(req: Request, res: Response, next: NextFunction) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return next();
  const provided = req.header("x-admin-key");
  if (provided !== adminKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}
