import type { RequestHandler } from "express";
import { AsyncLocalStorage } from "node:async_hooks";

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

/**
 * Reads per-request overrides from headers:
 * - x-llm-provider
 * - x-llm-api-key
 * - x-llm-base-url
 */
export const llmRequestContextMiddleware: RequestHandler = (req, _res, next) => {
  const provider = sanitizeHeaderValue(req.header("x-llm-provider"));
  const apiKey = sanitizeHeaderValue(req.header("x-llm-api-key"));
  const baseUrl = sanitizeHeaderValue(req.header("x-llm-base-url"));

  als.run({ provider, apiKey, baseUrl }, () => next());
};

export function getLlmRequestOverrides(): LlmRequestOverrides {
  return als.getStore() || {};
}