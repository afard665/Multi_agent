import axios from "axios";
import { getLlmRequestOverrides } from "./requestContext";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  raw: any;
}

export type LlmProvider = "avalai" | "openai" | "mock" | string;

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function getEnvForProvider(provider: string, overrides?: { apiKey?: string; baseUrl?: string }) {
  const key = provider.toUpperCase().replace(/[^A-Z0-9]/g, "_");

  // NOTE: use nullish coalescing (??) so empty-string values coming from saved config
  // don't accidentally fall back to unrelated environment variables.
  return {
    apiKey: overrides?.apiKey ?? process.env[`${key}_API_KEY`] ?? process.env.AVALAI_API_KEY ?? process.env.OPENAI_API_KEY,
    baseUrl: overrides?.baseUrl ?? process.env[`${key}_BASE_URL`] ?? process.env.AVALAI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "",
  };
}

async function avalaiChatComplete(
  messages: Message[],
  model: string,
  temperature: number,
  provider: string,
  overrides?: { apiKey?: string; baseUrl?: string }
): Promise<ChatCompletionResult> {
  const env = getEnvForProvider(provider, overrides);
  const apiKey = env.apiKey;
  const baseURL = normalizeBaseUrl(env.baseUrl || "https://api.avalai.ir/v1");

  if (!apiKey) {
    const combined = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    return {
      text: `Mock response for model ${model}. Summary: ${combined.slice(0, 150)}`,
      inputTokens: Math.ceil(combined.length / 4),
      outputTokens: 80,
      reasoningTokens: 0,
      raw: { mock: true, provider },
    };
  }

  try {
    const resp = await axios.post(
      `${baseURL}/chat/completions`,
      { model, messages, temperature },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    const choice = resp.data?.choices?.[0]?.message?.content || "";
    const usage = resp.data?.usage || {};
    return {
      text: choice,
      inputTokens: usage.input_tokens || usage.prompt_tokens || 0,
      outputTokens: usage.output_tokens || usage.completion_tokens || 0,
      reasoningTokens: usage.reasoning_tokens || 0,
      raw: resp.data,
    };
  } catch (err: any) {
    // Network/provider errors should not break local/dev usage of the app.
    // Fall back to a mock response but include error details in raw.
    const combined = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    const status = err?.response?.status;
    const statusText = err?.response?.statusText;
    const msg = err?.message || "provider request failed";
    return {
      text: `Mock response (provider error${status ? ` ${status}` : ""}). Summary: ${combined.slice(0, 150)}`,
      inputTokens: Math.ceil(combined.length / 4),
      outputTokens: 80,
      reasoningTokens: 0,
      raw: {
        mock: true,
        provider,
        error: { message: msg, status, statusText, data: err?.response?.data },
      },
    };
  }
}

/**
 * OpenAI-compatible Chat Completions API:
 * - endpoint: POST {baseUrl}/chat/completions
 * - auth: Authorization: Bearer {apiKey}
 */
async function openAiCompatibleChatComplete(
  messages: Message[],
  model: string,
  temperature: number,
  provider: string,
  overrides?: { apiKey?: string; baseUrl?: string }
): Promise<ChatCompletionResult> {
  const env = getEnvForProvider(provider, overrides);
  const apiKey = env.apiKey;
  const baseURL = normalizeBaseUrl(env.baseUrl || "https://api.openai.com/v1");

  if (!apiKey) {
    const combined = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    return {
      text: `Mock response for model ${model}. Summary: ${combined.slice(0, 150)}`,
      inputTokens: Math.ceil(combined.length / 4),
      outputTokens: 80,
      reasoningTokens: 0,
      raw: { mock: true, provider },
    };
  }

  try {
    const resp = await axios.post(
      `${baseURL}/chat/completions`,
      { model, messages, temperature },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    const choice = resp.data?.choices?.[0]?.message?.content || "";
    const usage = resp.data?.usage || {};

    // OpenAI usage has prompt_tokens + completion_tokens. There's no standard reasoning_tokens.
    return {
      text: choice,
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      reasoningTokens: usage.reasoning_tokens || 0,
      raw: resp.data,
    };
  } catch (err: any) {
    const combined = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    const status = err?.response?.status;
    const statusText = err?.response?.statusText;
    const msg = err?.message || "provider request failed";
    return {
      text: `Mock response (provider error${status ? ` ${status}` : ""}). Summary: ${combined.slice(0, 150)}`,
      inputTokens: Math.ceil(combined.length / 4),
      outputTokens: 80,
      reasoningTokens: 0,
      raw: {
        mock: true,
        provider,
        error: { message: msg, status, statusText, data: err?.response?.data },
      },
    };
  }
}

export async function chatComplete(
  messages: Message[],
  model: string,
  temperature: number,
  opts?: {
    provider?: LlmProvider;
    providerConfig?: { apiKey?: string; baseUrl?: string };
  }
): Promise<ChatCompletionResult> {
  const requestOverrides = getLlmRequestOverrides();
  const provider = (requestOverrides.provider || opts?.provider || "avalai").toLowerCase();

  // Priority for credentials/baseUrl:
  // 1) per-request headers (requestOverrides)
  // 2) server-side saved provider config (opts.providerConfig)
  // 3) env vars
  const effectiveOverrides: { apiKey?: string; baseUrl?: string } = {
    // NOTE: use ?? to preserve empty-string values from saved provider config.
    apiKey: requestOverrides.apiKey ?? opts?.providerConfig?.apiKey,
    baseUrl: requestOverrides.baseUrl ?? opts?.providerConfig?.baseUrl,
  };

  if (provider === "mock") {
    const combined = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    return {
      text: `Mock response for model ${model}. Summary: ${combined.slice(0, 150)}`,
      inputTokens: Math.ceil(combined.length / 4),
      outputTokens: 80,
      reasoningTokens: 0,
      raw: { mock: true, provider },
    };
  }

  // Heuristic mapping:
  // - avalai* => AvalAI API
  // - openai* or anything else with OPENAI_BASE_URL => openai compatible
  if (provider.startsWith("avalai")) {
    return avalaiChatComplete(messages, model, temperature, provider, effectiveOverrides);
  }

  return openAiCompatibleChatComplete(messages, model, temperature, provider, effectiveOverrides);
}