import { AgentConfig, MetaDecision } from "./types";
import { ensureArray, ensureNumber, ensureString } from "../utils/validate";

function ensureStringRecord(value: any): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function normalizeAgentConfig(obj: any, now: number): AgentConfig | null {
  if (!obj || typeof obj !== "object") return null;
  const id = ensureString(obj.id, "");
  const name = ensureString(obj.name, "New Agent");
  const role = ensureString(obj.role, "responder") as any;

  const system_prompt = ensureString(obj.system_prompt, "You are a helpful assistant.");
  const model = ensureString(obj.model, "gpt-4o-mini");
  const provider = ensureString(obj.provider, "");
  const temperature = Math.max(0, Math.min(2, ensureNumber(obj.temperature, 0.7)));
  const max_tokens = Math.max(1, ensureNumber(obj.max_tokens, 1024));

  return {
    id,
    name,
    role,
    enabled: obj.enabled !== false,
    system_prompt,
    model,
    provider,
    temperature,
    max_tokens,
    createdAt: ensureNumber(obj.createdAt, now),
    updatedAt: ensureNumber(obj.updatedAt, now),
    tags: Array.isArray(obj.tags) ? obj.tags.filter((t: any) => typeof t === "string") : undefined,
  };
}

export function normalizeMetaDecision(raw: any, fallbackProvider: string, agents: AgentConfig[], now = Date.now()): MetaDecision {
  const plan = raw?.plan || {};

  const runResponders = ensureArray<string>(plan.runResponders, []).filter((id) => agents.some((a) => a.id === id));
  const runCritics = ensureArray<string>(plan.runCritics, []).filter((id) => agents.some((a) => a.id === id));

  const providerStrategyRaw = raw?.providerStrategy || {};
  const providerOverrides = ensureStringRecord(providerStrategyRaw.providerOverrides);
  const modelOverrides = ensureStringRecord(providerStrategyRaw.modelOverrides);

  // Safety: limit size of updates/creates/disables per iteration
  const promptUpdatesRaw = ensureArray<any>(raw?.promptUpdates, []).slice(0, 5);
  const createAgentsRaw = ensureArray<any>(raw?.createAgents, []).slice(0, 2);
  const disableAgentsRaw = ensureArray<any>(raw?.disableAgents, []).slice(0, 5);

  const promptUpdates = promptUpdatesRaw
    .map((p) => ({
      agentId: ensureString(p?.agentId, ""),
      newPrompt: ensureString(p?.newPrompt, ""),
      reason: ensureString(p?.reason, ""),
    }))
    .filter((p) => p.agentId && p.newPrompt && agents.some((a) => a.id === p.agentId));

  const createAgents = createAgentsRaw
    .map((a) => normalizeAgentConfig(a, now))
    .filter(Boolean) as AgentConfig[];

  const disableAgents = disableAgentsRaw.map((id) => ensureString(id, "")).filter((id) => id && agents.some((a) => a.id === id));

  // Stop criteria normalization
  const stopCriteriaRaw = raw?.stopCriteria || {};

  return {
    action: raw?.action === "stop" ? "stop" : "continue",
    explanation: ensureString(raw?.explanation, ""),
    plan: {
      runResponders,
      runCritics,
      runFactChecker: !!plan.runFactChecker,
      runScoring: plan.runScoring !== false,
      runSelfVerifier: plan.runSelfVerifier !== false,
    },
    providerStrategy: {
      objective: (providerStrategyRaw.objective === "min_cost" || providerStrategyRaw.objective === "max_accuracy" || providerStrategyRaw.objective === "balanced")
        ? providerStrategyRaw.objective
        : "balanced",
      providerOverrides: Object.keys(providerOverrides).length ? providerOverrides : { default: fallbackProvider },
      modelOverrides,
    },
    promptUpdates,
    createAgents,
    disableAgents,
    stopCriteria: {
      whyStopNow: ensureString(stopCriteriaRaw.whyStopNow, ""),
      unresolvedCritiques: ensureNumber(stopCriteriaRaw.unresolvedCritiques, 0),
      factConfidence: Math.max(0, Math.min(1, ensureNumber(stopCriteriaRaw.factConfidence, 1))),
    },
  };
}