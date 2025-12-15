import { Request, Response, NextFunction } from "express";

export function isBasicAuthAdmin(req: Request): boolean {
  const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
  const enabled = process.env.SIMPLE_AUTH_ENABLED === "true" || nodeEnv !== "production";
  if (!enabled) return false;

  const header = req.header("authorization") || req.header("Authorization") || "";
  const m = header.match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  try {
    const decoded = Buffer.from(m[1], "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return false;
    const username = decoded.slice(0, idx);
    const password = decoded.slice(idx + 1);

    const expectedUser = (process.env.SIMPLE_AUTH_USER || "admin").trim();
    const expectedPass = (process.env.SIMPLE_AUTH_PASSWORD || "amin@1005").trim();
    return username === expectedUser && password === expectedPass;
  } catch {
    return false;
  }
}

export function adminGuard(req: Request, res: Response, next: NextFunction) {
  if (isBasicAuthAdmin(req)) return next();

  const adminKey = process.env.ADMIN_API_KEY;
  // If ADMIN_API_KEY is set, always require it.
  if (adminKey) {
    const provided = req.header("x-admin-key");
    if (provided !== adminKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return next();
  }

  // If ADMIN_API_KEY isn't set:
  // - In non-production, allow admin endpoints by default for local/dev ergonomics.
  // - In production, keep disabled unless explicitly allowed.
  const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
  const insecureAllowed = process.env.ALLOW_INSECURE_ADMIN === "true" || nodeEnv !== "production";
  if (!insecureAllowed) return res.status(503).json({ error: "ADMIN_API_KEY not configured" });

  return next();
}
