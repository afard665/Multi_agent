import type { RequestHandler } from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import net from "node:net";

export type LlmRequestOverrides = {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
};

const als = new AsyncLocalStorage<LlmRequestOverrides>();

function sanitizeHeaderValue(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s;
}

function isAdminRequest(headers: { [k: string]: any } | undefined): boolean {
  const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
  const basicEnabled = process.env.SIMPLE_AUTH_ENABLED === "true" || nodeEnv !== "production";
  const authHeader = typeof headers?.["authorization"] === "string" ? String(headers?.["authorization"]) : "";
  const basic = basicEnabled ? authHeader.match(/^Basic\s+(.+)$/i) : null;
  if (basicEnabled && basic) {
    try {
      const decoded = Buffer.from(basic[1], "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      if (idx >= 0) {
        const username = decoded.slice(0, idx);
        const password = decoded.slice(idx + 1);
        const expectedUser = (process.env.SIMPLE_AUTH_USER || "admin").trim();
        const expectedPass = (process.env.SIMPLE_AUTH_PASSWORD || "amin@1005").trim();
        if (username === expectedUser && password === expectedPass) return true;
      }
    } catch {
      // ignore
    }
  }

  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return process.env.ALLOW_INSECURE_ADMIN === "true" || nodeEnv !== "production";
  }
  const provided = typeof headers?.["x-admin-key"] === "string" ? String(headers?.["x-admin-key"]) : "";
  return provided === adminKey;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0") return true;
  if (host === "::1") return true;

  const ipType = net.isIP(host);
  if (!ipType) return false;

  if (ipType === 4) {
    if (host.startsWith("10.")) return true;
    if (host.startsWith("127.")) return true;
    if (host.startsWith("169.254.")) return true;
    if (host.startsWith("192.168.")) return true;
    const m = host.match(/^172\.(\d+)\./);
    if (m) {
      const n = Number(m[1]);
      if (n >= 16 && n <= 31) return true;
    }
    return false;
  }

  // IPv6 (coarse)
  if (host.startsWith("fc") || host.startsWith("fd")) return true; // fc00::/7
  if (host.startsWith("fe80:")) return true; // link-local
  return false;
}

function sanitizeBaseUrl(v: string): string | undefined {
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    if (isPrivateHost(u.hostname) && process.env.ALLOW_PRIVATE_LLM_BASE_URLS !== "true") return undefined;
    return u.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

/**
 * Reads per-request overrides from headers:
 * - x-llm-provider
 * - x-llm-api-key
 * - x-llm-base-url
 */
export const llmRequestContextMiddleware: RequestHandler = (req, _res, next) => {
  const provider = sanitizeHeaderValue(req.header("x-llm-provider"));
  const allowSensitiveOverrides =
    process.env.ALLOW_REQUEST_LLM_OVERRIDES === "true" || isAdminRequest(req.headers as any);

  const apiKey = allowSensitiveOverrides ? sanitizeHeaderValue(req.header("x-llm-api-key")) : undefined;
  const baseUrlRaw = allowSensitiveOverrides ? sanitizeHeaderValue(req.header("x-llm-base-url")) : undefined;
  const baseUrl = baseUrlRaw ? sanitizeBaseUrl(baseUrlRaw) : undefined;

  als.run({ provider, apiKey, baseUrl }, () => next());
};

export function getLlmRequestOverrides(): LlmRequestOverrides {
  return als.getStore() || {};
}
