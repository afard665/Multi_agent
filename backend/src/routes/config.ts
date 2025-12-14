import { Router } from "express";
import { ConfigStore } from "../core/configStore";
import { adminGuard } from "../utils/auth";
import { ConfigShape, LlmProviderConfig } from "../core/types";

function sanitizeConfigForClient(cfg: ConfigShape) {
  // never leak api keys to non-admin clients
  const providers = cfg.llm_providers || {};
  const sanitizedProviders: Record<string, Omit<LlmProviderConfig, "apiKey"> & { apiKey?: string }> = {};
  for (const [k, p] of Object.entries(providers)) {
    sanitizedProviders[k] = {
      key: p.key,
      displayName: p.displayName,
      baseUrl: p.baseUrl,
      models: Array.isArray(p.models) ? p.models : [],
    };
  }
  return {
    ...cfg,
    llm_providers: sanitizedProviders as any,
  };
}

function normalizeProviderKey(key: string) {
  return (key || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function configRouter(configStore: ConfigStore) {
  const router = Router();

  router.get("/config", (req, res) => {
    // config is safe for client (no api keys)
    res.json(sanitizeConfigForClient(configStore.getConfig()));
  });

  router.patch("/config", adminGuard, async (req, res) => {
    const updated = await configStore.update(req.body || {});
    res.json(sanitizeConfigForClient(updated));
  });

  // Admin-only full config (includes api keys)
  router.get("/config/admin", adminGuard, (req, res) => {
    res.json(configStore.getConfig());
  });

  // Provider registry (admin-only; includes baseUrls which may be sensitive)
  router.get("/providers", adminGuard, (req, res) => {
    const cfg = configStore.getConfig();
    res.json(Object.values(cfg.llm_providers || {}).map((p) => ({ key: p.key, displayName: p.displayName, baseUrl: p.baseUrl, models: p.models })));
  });

  router.get("/providers/admin", adminGuard, (req, res) => {
    const cfg = configStore.getConfig();
    res.json(Object.values(cfg.llm_providers || {}));
  });

  router.put("/providers/:key", adminGuard, async (req, res) => {
    const key = normalizeProviderKey(req.params.key);
    if (!key) return res.status(400).json({ error: "invalid provider key" });

    const body = (req.body || {}) as Partial<LlmProviderConfig>;
    const baseUrl = (body.baseUrl || "").trim();
    const apiKey = (body.apiKey || "").trim();
    const models = Array.isArray(body.models) ? body.models.map((m) => String(m).trim()).filter(Boolean) : [];
    const displayName = (body.displayName || "").trim() || undefined;

    if (!baseUrl) return res.status(400).json({ error: "baseUrl required" });

    const cfg = configStore.getConfig();
    const nextProviders = { ...(cfg.llm_providers || {}) };
    nextProviders[key] = { key, displayName, baseUrl, apiKey, models };

    const updated = await configStore.update({ llm_providers: nextProviders });
    res.json(Object.values(updated.llm_providers || {}));
  });

  router.delete("/providers/:key", adminGuard, async (req, res) => {
    const key = normalizeProviderKey(req.params.key);
    if (!key) return res.status(400).json({ error: "invalid provider key" });

    const cfg = configStore.getConfig();
    const nextProviders = { ...(cfg.llm_providers || {}) };
    delete nextProviders[key];

    const updated = await configStore.update({ llm_providers: nextProviders });
    res.json(Object.values(updated.llm_providers || {}));
  });

  return router;
}
