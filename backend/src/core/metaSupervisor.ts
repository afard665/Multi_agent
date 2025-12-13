import { chatComplete } from "../llm/avalaiClient";
import { ConfigShape, MemoryStoreShape, MetaDecision, AgentConfig } from "./types";
import { selectProvider } from "../llm/providerSelector";

export async function metaSupervisor(
  question: string,
  iteration: number,
  memory: MemoryStoreShape,
  agents: AgentConfig[],
  config: ConfigShape,
  lastCritiqueSeverity: number
): Promise<MetaDecision> {
  const provider = selectProvider(config);
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
    "avalai-small",
    0.2
  );

  try {
    const parsed = JSON.parse(response.text);
    return normalizeDecision(parsed, provider);
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

function normalizeDecision(obj: any, fallbackProvider: string): MetaDecision {
  return {
    action: obj.action === "stop" ? "stop" : "continue",
    explanation: obj.explanation || "",
    plan: {
      runResponders: Array.isArray(obj.plan?.runResponders) ? obj.plan.runResponders : [],
      runCritics: Array.isArray(obj.plan?.runCritics) ? obj.plan.runCritics : [],
      runFactChecker: !!obj.plan?.runFactChecker,
      runScoring: obj.plan?.runScoring !== false,
      runSelfVerifier: obj.plan?.runSelfVerifier !== false,
    },
    providerStrategy: {
      objective: obj.providerStrategy?.objective || "balanced",
      providerOverrides: obj.providerStrategy?.providerOverrides || { default: fallbackProvider },
      modelOverrides: obj.providerStrategy?.modelOverrides || {},
    },
    promptUpdates: Array.isArray(obj.promptUpdates)
      ? obj.promptUpdates.map((p: any) => ({ agentId: p.agentId, newPrompt: p.newPrompt, reason: p.reason || "" }))
      : [],
    createAgents: Array.isArray(obj.createAgents) ? obj.createAgents : [],
    disableAgents: Array.isArray(obj.disableAgents) ? obj.disableAgents : [],
    stopCriteria: obj.stopCriteria || { whyStopNow: "", unresolvedCritiques: 0, factConfidence: 1 },
  };
}
