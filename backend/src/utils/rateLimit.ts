import { Request, Response, NextFunction } from "express";

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || "") || 60 * 1000;
const maxRequests = Number(process.env.RATE_LIMIT_MAX || "") || 30;

type Bucket = { count: number; start: number; lastSeen: number };
const buckets = new Map<string, Bucket>();

let lastCleanup = 0;
const cleanupEveryMs = Number(process.env.RATE_LIMIT_CLEANUP_MS || "") || 60 * 1000;
const staleAfterMs = windowMs * 2;

function cleanup(now: number) {
  if (now - lastCleanup < cleanupEveryMs) return;
  lastCleanup = now;
  for (const [k, b] of buckets.entries()) {
    if (now - b.lastSeen > staleAfterMs) buckets.delete(k);
  }
}

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || "global";
  const now = Date.now();
  cleanup(now);

  const existing = buckets.get(ip);
  if (!existing || now - existing.start > windowMs) {
    buckets.set(ip, { count: 1, start: now, lastSeen: now });
    return next();
  }

  existing.count += 1;
  existing.lastSeen = now;
  if (existing.count > maxRequests) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }
  next();
}
