import { chatComplete } from "../llm/llmClient";
import { ConfigShape, MemoryStoreShape, MetaDecision, AgentConfig } from "./types";
import { selectProvider } from "../llm/providerSelector";
import { normalizeMetaDecision } from "./metaDecisionSchema";

function pickMetaModel(provider: string, config: ConfigShape): string {
  const env = (process.env.META_SUPERVISOR_MODEL || "").trim();
  if (env) return env;

  const configured = config.llm_providers?.[provider]?.models?.[0];
  if (configured) return configured;

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
  lastCritiqueSeverity: number
): Promise<MetaDecision> {
  const provider = selectProvider(config);
  const model = pickMetaModel(provider, config);
  const systemPrompt = `You are the Meta-Supervisor orchestrating a debate among agents. Consider memory summaries and choose whether to continue. Output JSON strictly.`;
  const planPrompt = `Question: ${question}\nIteration: ${iteration}\nPast success rate: ${memory.question_history.length}\nAverage severity last: ${lastCritiqueSeverity}`;

  const response = await chatComplete(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          planPrompt +
          `\nAgents: ${agents.map((a) => `${a.id}:${a.role}:${a.enabled ? "on" : "off"}`).join(", ")}\nReturn JSON with action, explanation, plan, providerStrategy, promptUpdates, createAgents, disableAgents, stopCriteria`,
      },
    ],
    model,
    0.2,
    { provider, providerConfig: config.llm_providers?.[provider] }
  );

  try {
    const parsed = JSON.parse(response.text);
    return normalizeMetaDecision(parsed, provider, agents);
  } catch (e) {
    // fallback heuristic
    return {
      action: iteration >= config.maxIterations - 1 ? "stop" : "continue",
      explanation: "Fallback decision due to parse error",
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
