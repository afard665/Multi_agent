import { Router } from "express";
import axios from "axios";
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

function looksLikeLocalHost(host: string) {
  const h = (host || "").toLowerCase();
  if (h === "localhost" || h === "[::1]") return true;
  if (h.startsWith("127.")) return true;
  if (h.startsWith("10.")) return true;
  if (h.startsWith("192.168.")) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m) {
    const second = Number(m[1]);
    if (Number.isFinite(second) && second >= 16 && second <= 31) return true;
  }
  return false;
}

function ensureUrlProtocol(raw: string) {
  const s = String(raw || "").trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return s;

  const host = s.split("/")[0].split("@").pop() || "";
  return `${looksLikeLocalHost(host) ? "http" : "https"}://${s}`;
}

function normalizeOpenAiCompatibleBaseUrl(raw: string) {
  let s = ensureUrlProtocol(raw).trim();
  s = s.replace(/\/+$/, "");

  // If user pasted a full endpoint, strip it back to its base.
  s = s.replace(/\/chat\/completions$/i, "");
  s = s.replace(/\/models$/i, "");
  s = s.replace(/\/+$/, "");

  return s;
}

async function fetchProviderModels(baseUrl: string, apiKey: string) {
  const normalized = normalizeOpenAiCompatibleBaseUrl(baseUrl);

  const candidates: string[] = [normalized];
  if (normalized && !/\/v1$/i.test(normalized)) candidates.push(`${normalized}/v1`);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
    headers["api-key"] = apiKey;
  }

  let lastErr: any;
  for (const candidate of candidates.filter(Boolean)) {
    const url = candidate.replace(/\/+$/, "") + "/models";
    try {
      const res = await axios.get(url, { headers, timeout: 15_000 });
      const data: any = res.data;

      const fromArray = (arr: any[]) =>
        arr
          .map((x) => {
            if (typeof x === "string") return x;
            if (x && typeof x === "object") return String(x.id || x.name || x.model || "").trim();
            return "";
          })
          .map((s) => s.trim())
          .filter(Boolean);

      let models: string[] = [];
      if (Array.isArray(data)) {
        models = fromArray(data);
      } else if (data && Array.isArray(data.data)) {
        models = fromArray(data.data);
      } else if (data && Array.isArray(data.models)) {
        models = fromArray(data.models);
      }

      return { baseUrlUsed: candidate, models: Array.from(new Set(models)) };
    } catch (err: any) {
      lastErr = err;
      const status = err?.response?.status;
      // Common "wrong base URL" cases: missing /v1, pasted full endpoint, etc.
      if ((status === 404 || status === 405) && candidate !== candidates[candidates.length - 1]) continue;
      throw err;
    }
  }

  throw lastErr || new Error("provider request failed");
}

async function testProviderChat(baseUrl: string, apiKey: string, model: string) {
  const normalized = normalizeOpenAiCompatibleBaseUrl(baseUrl);
  const candidates: string[] = [normalized];
  if (normalized && !/\/v1$/i.test(normalized)) candidates.push(`${normalized}/v1`);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
    headers["api-key"] = apiKey;
  }

  let lastErr: any;
  for (const candidate of candidates.filter(Boolean)) {
    const url = candidate.replace(/\/+$/, "") + "/chat/completions";
    try {
      await axios.post(
        url,
        { model, messages: [{ role: "user", content: "ping" }], temperature: 0, max_tokens: 8 },
        { headers, timeout: 15_000 }
      );
      return { baseUrlUsed: candidate };
    } catch (err: any) {
      lastErr = err;
      const status = err?.response?.status;
      if ((status === 404 || status === 405) && candidate !== candidates[candidates.length - 1]) continue;
      throw err;
    }
  }

  throw lastErr || new Error("provider request failed");
}

function formatProviderTestError(err: any, baseUrl: string) {
  const code = err?.code;
  const status = err?.response?.status;
  const statusText = err?.response?.statusText;
  const data = err?.response?.data;

  // Axios "Invalid URL" / URL parsing errors.
  const msg = String(err?.message || "provider request failed");
  if (code === "ERR_INVALID_URL" || /invalid url/i.test(msg)) {
    return {
      httpStatus: 400,
      error: "Invalid baseUrl. Include a full URL like http://localhost:11434/v1 or https://api.openai.com/v1.",
      status,
      statusText,
      data,
    };
  }

  if (status === 401 || status === 403) {
    return {
      httpStatus: 502,
      error: "Unauthorized. Check the API key and provider permissions.",
      status,
      statusText,
      data,
    };
  }

  if (status === 404) {
    return {
      httpStatus: 502,
      error: "Not found. Ensure the Base URL points to an OpenAI-compatible root (often ends with /v1).",
      status,
      statusText,
      data,
    };
  }

  if (code === "ECONNREFUSED") {
    const hint =
      /localhost|127\.0\.0\.1/.test(baseUrl) ? " If the backend runs in Docker, try http://host.docker.internal:<port>/v1." : "";
    return { httpStatus: 502, error: `Connection refused.${hint}`, status, statusText, data };
  }

  if (code === "ENOTFOUND") {
    return { httpStatus: 502, error: "Host not found. Check the Base URL hostname.", status, statusText, data };
  }

  if (code === "ETIMEDOUT" || code === "ECONNABORTED") {
    return { httpStatus: 504, error: "Request timed out. Check network access and provider availability.", status, statusText, data };
  }

  return { httpStatus: 502, error: msg, status, statusText, data };
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
    const baseUrlRaw = (body.baseUrl || "").trim();
    const apiKey = (body.apiKey || "").trim();
    const modelsFromBody = Array.isArray(body.models) ? body.models.map((m) => String(m).trim()).filter(Boolean) : [];
    const displayName = (body.displayName || "").trim() || undefined;

    if (!baseUrlRaw) return res.status(400).json({ error: "baseUrl required" });

    let models = modelsFromBody;
    let baseUrl = normalizeOpenAiCompatibleBaseUrl(baseUrlRaw);
    try {
      const fetched = await fetchProviderModels(baseUrl, apiKey);
      baseUrl = fetched.baseUrlUsed;
      if (fetched.models.length) models = fetched.models;
    } catch {
      // keep provided models (or empty) if fetching fails
    }

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

    const defaultProvider = typeof cfg.default_provider === "string" ? cfg.default_provider.trim() : "";
    const nextDefaultProvider = defaultProvider === key ? "" : defaultProvider;

    const updated = await configStore.update({
      llm_providers: nextProviders,
      ...(nextDefaultProvider !== defaultProvider ? { default_provider: nextDefaultProvider } : {}),
    });
    res.json(Object.values(updated.llm_providers || {}));
  });

  router.post("/providers/test", adminGuard, async (req, res) => {
    const baseUrlRaw = String(req.body?.baseUrl || "").trim();
    const apiKey = String(req.body?.apiKey || "").trim();
    const testChat = req.body?.testChat === true;
    const requestedModel = String(req.body?.model || "").trim();
    if (!baseUrlRaw) return res.status(400).json({ ok: false, error: "baseUrl required" });

    const baseUrl = normalizeOpenAiCompatibleBaseUrl(baseUrlRaw);

    let models: string[] = [];
    let baseUrlUsed: string | undefined;
    let modelsError: any = null;
    try {
      const fetched = await fetchProviderModels(baseUrl, apiKey);
      models = fetched.models;
      baseUrlUsed = fetched.baseUrlUsed;
    } catch (err: any) {
      const formatted = formatProviderTestError(err, baseUrlRaw);
      modelsError = formatted;
    }

    const model = requestedModel || models[0] || "";
    let chatOk: boolean | null = null;
    let chatError: any = null;

    if (testChat) {
      if (!model) {
        chatOk = false;
        chatError = { httpStatus: 400, error: "model required for chat test (set a model or ensure /models works)" };
      } else {
        try {
          const chatRes = await testProviderChat(baseUrlUsed || baseUrl, apiKey, model);
          baseUrlUsed = baseUrlUsed || chatRes.baseUrlUsed;
          chatOk = true;
        } catch (err: any) {
          const formatted = formatProviderTestError(err, baseUrlRaw);
          chatOk = false;
          chatError = formatted;
        }
      }
    }

    const ok = testChat ? !!chatOk : !modelsError;
    const failureHttpStatus = (() => {
      const statuses = [modelsError?.httpStatus, chatError?.httpStatus].filter(Boolean) as number[];
      if (statuses.includes(400)) return 400;
      if (statuses.includes(504)) return 504;
      return 502;
    })();

    res.status(ok ? 200 : failureHttpStatus).json({
      ok,
      baseUrlTried: baseUrl,
      baseUrlUsed,
      models,
      modelCount: models.length,
      model: model || undefined,
      chatOk,
      modelsError,
      chatError,
    });
  });

  return router;
}
