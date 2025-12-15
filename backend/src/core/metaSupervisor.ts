import { chatComplete } from "../llm/llmClient";
import { ConfigShape, MemoryStoreShape, MetaDecision, AgentConfig } from "./types";
import { selectProvider } from "../llm/providerSelector";
import { normalizeMetaDecision } from "./metaDecisionSchema";

function pickMetaModel(provider: string, config: ConfigShape, agents: AgentConfig[]): string {
  const env = (process.env.META_SUPERVISOR_MODEL || "").trim();
  if (env) return env;

  const configured = config.llm_providers?.[provider]?.models?.[0];
  if (configured) return configured;

  const agentModel = agents.find((a) => a.enabled && (a.provider || "").toLowerCase() === provider.toLowerCase() && (a.model || "").trim())?.model;
  if (agentModel) return agentModel;

  const p = (provider || "").toLowerCase();
  if (p.startsWith("avalai")) return "avalai-small";
  return "gpt-4o-mini";
}

export async function metaSupervisor(
  question: string,
  iteration: number,
  memory: MemoryStoreShape,
  agents: AgentConfig[],
  config: ConfigShape,
  lastCritiqueSeverity: number,
  opts?: { signal?: AbortSignal }
): Promise<MetaDecision> {
  const provider = selectProvider(config);
  const model = pickMetaModel(provider, config, agents);
  const systemPrompt =
    `You are the Meta-Supervisor orchestrating a debate among agents. ` +
    `Choose whether to continue, and set a run-level iterationBudget (the total number of iterations to run for this question). ` +
    `Pick the smallest budget likely to achieve a good answer, within MaxIterationsCap. Output JSON strictly.`;
  const planPrompt =
    `Question: ${question}\n` +
    `Iteration: ${iteration}\n` +
    `MaxIterationsCap: ${config.maxIterations}\n` +
    `Past success rate: ${memory.question_history.length}\n` +
    `Average severity last: ${lastCritiqueSeverity}`;

  const response = await chatComplete(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          planPrompt +
          `\nAgents: ${agents.map((a) => `${a.id}:${a.role}:${a.enabled ? "on" : "off"}`).join(", ")}\n` +
          `Return JSON with: action, explanation, iterationBudget (int 1..MaxIterationsCap), plan, providerStrategy, promptUpdates, createAgents, disableAgents, stopCriteria`,
      },
    ],
    model,
    0.2,
    {
      provider,
      providerConfig: config.llm_providers?.[provider],
      maxTokens: Math.max(1, config.maxTokens || 2048),
      signal: opts?.signal,
      timeoutMs: Number(process.env.LLM_TIMEOUT_MS || "") || undefined,
    }
  );

  try {
    const parsed = JSON.parse(response.text);
    return normalizeMetaDecision(parsed, provider, agents, { maxIterationsCap: config.maxIterations });
  } catch (e) {
    // fallback heuristic
    return {
      action: iteration >= config.maxIterations - 1 ? "stop" : "continue",
      explanation: "Fallback decision due to parse error",
      iterationBudget: config.maxIterations,
      plan: {
        runResponders: agents.filter((a) => a.role === "responder" && a.enabled).map((a) => a.id),
        runCritics: agents.filter((a) => (a.role === "critic" || a.role === "opponent") && a.enabled).map((a) => a.id),
        runFactChecker: true,
        runScoring: true,
        runSelfVerifier: true,
      },
      providerStrategy: { objective: "balanced", providerOverrides: {}, modelOverrides: {} },
      promptUpdates: [],
      createAgents: [],
      disableAgents: [],
      stopCriteria: { whyStopNow: "max iterations", unresolvedCritiques: lastCritiqueSeverity, factConfidence: 1 },
    };
  }
}

// kept intentionally small: normalization moved to metaDecisionSchema.ts
