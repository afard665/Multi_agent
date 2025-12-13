import { chatComplete } from "../llm/avalaiClient";
import { ConfigShape, MemoryStoreShape, MetaDecision, AgentConfig } from "./types";
import { selectProvider } from "../llm/providerSelector";

function chooseObjective(memory: MemoryStoreShape, lastCritiqueSeverity: number): "min_cost" | "max_accuracy" | "balanced" {
  const totalQuestions = memory.question_history.length || 1;
  const successes = memory.question_history.filter((q) => q.success).length;
  const successRate = successes / totalQuestions;
  const avgAgentCost = Object.values(memory.agent_performance || {}).reduce((acc, perf) => acc + (perf.avgCost || 0), 0);
  if (lastCritiqueSeverity > 3 || successRate < 0.5) return "max_accuracy";
  if (avgAgentCost > 5) return "min_cost";
  return "balanced";
}

export async function metaSupervisor(
  question: string,
  iteration: number,
  memory: MemoryStoreShape,
  agents: AgentConfig[],
  config: ConfigShape,
  lastCritiqueSeverity: number
): Promise<MetaDecision> {
  const objective = chooseObjective(memory, lastCritiqueSeverity);
  const provider = selectProvider(config, objective);
  const model = objective === "max_accuracy" ? "avalai-large" : objective === "balanced" ? "avalai-medium" : "avalai-small";
  const systemPrompt = `You are the Meta-Supervisor orchestrating a debate among agents. Consider memory summaries, provider rates, and choose whether to continue. Output JSON strictly.`;
  const planPrompt = `Question: ${question}\nIteration: ${iteration}\nSuccess rate: ${memory.question_history.length ? (memory.question_history.filter((q) => q.success).length / memory.question_history.length).toFixed(2) : "n/a"}\nAverage severity last: ${lastCritiqueSeverity}\nObjective: ${objective}\nCheapest provider: ${provider}`;

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
    objective === "max_accuracy" ? 0.3 : 0.2
  );

  try {
    const parsed = JSON.parse(response.text);
    return normalizeDecision(parsed, provider, objective, model);
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
      providerStrategy: { objective, providerOverrides: { default: provider }, modelOverrides: { default: model } },
      promptUpdates: [],
      createAgents: [],
      disableAgents: [],
      stopCriteria: { whyStopNow: "max iterations", unresolvedCritiques: lastCritiqueSeverity, factConfidence: 1 },
    };
  }
}

function normalizeDecision(
  obj: any,
  fallbackProvider: string,
  objective: "min_cost" | "max_accuracy" | "balanced",
  model: string
): MetaDecision {
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
      objective: obj.providerStrategy?.objective || objective,
      providerOverrides: obj.providerStrategy?.providerOverrides || { default: fallbackProvider },
      modelOverrides: obj.providerStrategy?.modelOverrides || { default: model },
    },
    promptUpdates: Array.isArray(obj.promptUpdates)
      ? obj.promptUpdates.map((p: any) => ({ agentId: p.agentId, newPrompt: p.newPrompt, reason: p.reason || "" }))
      : [],
    createAgents: Array.isArray(obj.createAgents) ? obj.createAgents : [],
    disableAgents: Array.isArray(obj.disableAgents) ? obj.disableAgents : [],
    stopCriteria: obj.stopCriteria || { whyStopNow: "", unresolvedCritiques: 0, factConfidence: 1 },
  };
}
