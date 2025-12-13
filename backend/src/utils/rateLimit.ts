import { Request, Response, NextFunction } from "express";

const windowMs = 60 * 1000;
const maxRequests = 30;
const buckets: Record<string, { count: number; start: number }> = {};

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || "global";
  const now = Date.now();
  if (!buckets[ip] || now - buckets[ip].start > windowMs) {
    buckets[ip] = { count: 0, start: now };
  }
  buckets[ip].count += 1;
  if (buckets[ip].count > maxRequests) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }
  next();
}
