import { chatComplete } from "../llm/avalaiClient";
import { ConfigShape, MemoryStoreShape, MetaDecision, AgentConfig } from "./types";
import { selectProvider } from "../llm/providerSelector";

function summarizeAgentPerformance(memory: MemoryStoreShape) {
  const perfEntries = Object.entries(memory.agent_performance || {});
  if (perfEntries.length === 0) return "No agent performance history yet.";
  const rankedByScore = [...perfEntries].sort((a, b) => (b[1].avgScore || 0) - (a[1].avgScore || 0));
  const top = rankedByScore.slice(0, 3).map(([id, p]) => `${id}: score ${p.avgScore.toFixed(2)}, sev ${p.avgSeverity.toFixed(2)}, cost ${p.avgCost.toFixed(2)}`);
  const needsHelp = rankedByScore
    .filter(([, p]) => p.avgScore < 1 || p.avgSeverity > 3)
    .slice(0, 3)
    .map(([id, p]) => `${id}: low score ${p.avgScore.toFixed(2)} or high severity ${p.avgSeverity.toFixed(2)}`);
  return `Top agents -> ${top.join(" | ") || "n/a"}. Underperforming -> ${needsHelp.join(" | ") || "none"}.`;
}

function summarizeQuestions(memory: MemoryStoreShape) {
  if (!memory.question_history.length) return "No questions asked yet.";
  const last = memory.question_history.slice(-5).map((q) => `${new Date(q.timestamp).toISOString()}: ${q.question.slice(0, 60)} (conf ${(q.confidence ?? 0).toFixed(2)})`);
  const successes = memory.question_history.filter((q) => q.success).length;
  const successRate = successes / memory.question_history.length;
  return `Recent questions: ${last.join(" || ")}. Success rate ${(successRate * 100).toFixed(1)}%.`;
}

function summarizePatterns(memory: MemoryStoreShape) {
  const successNotes = memory.patterns?.successfulPrompts?.map((p) => `${p.agentId}#${p.versionId}`).join(", ") || "none";
  const failureNotes = memory.patterns?.failures?.map((f) => `${f.category || "gen"}:${f.symptom}`).join(" | ") || "none";
  return `Successful prompts: ${successNotes}. Known failures: ${failureNotes}.`;
}

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
  const systemPrompt = `You are the Meta-Supervisor orchestrating a debate among agents. You must reason from past performance, question history, and prompt patterns to decide whether to continue, adjust prompts, or spawn/disable agents. You must always return strict JSON matching the expected schema.`;
  const planPrompt = `Question: ${question}\nIteration: ${iteration}\nMemory-> ${summarizeQuestions(memory)}\nPerformance-> ${summarizeAgentPerformance(memory)}\nPatterns-> ${summarizePatterns(memory)}\nObjective: ${objective}\nCheapest provider: ${provider}\nCritique severity last: ${lastCritiqueSeverity.toFixed(2)}\nAgents: ${agents
    .map((a) => `${a.id}:${a.role}:${a.enabled ? "on" : "off"}`)
    .join(", ")}\nIf accuracy is low or severity is high, enable more critics/fact-check and consider rewriting prompts. If costs are high, prefer cheaper providers and disabling costly agents. You may propose domain_expert agents when domain-specific terms appear.`;

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
    return normalizeDecision(parsed, provider, objective, model, agents);
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
  model: string,
  agents: AgentConfig[]
): MetaDecision {
  const activeResponders = agents.filter((a) => a.enabled && a.role === "responder").map((a) => a.id);
  const activeCritics = agents.filter((a) => a.enabled && (a.role === "critic" || a.role === "opponent")).map((a) => a.id);
  const providerOverrides = obj.providerStrategy?.providerOverrides || { default: fallbackProvider };
  const modelOverrides = obj.providerStrategy?.modelOverrides || { default: model };
  if (!providerOverrides.default) {
    providerOverrides.default = fallbackProvider;
  }
  if (!modelOverrides.default) {
    modelOverrides.default = model;
  }

  const plan = {
    runResponders: Array.isArray(obj.plan?.runResponders) && obj.plan.runResponders.length ? obj.plan.runResponders : activeResponders,
    runCritics: Array.isArray(obj.plan?.runCritics) && obj.plan.runCritics.length ? obj.plan.runCritics : activeCritics,
    runFactChecker: obj.plan?.runFactChecker !== false,
    runScoring: obj.plan?.runScoring !== false,
    runSelfVerifier: obj.plan?.runSelfVerifier !== false,
  };

  const createAgents = Array.isArray(obj.createAgents) ? obj.createAgents : [];
  const disableAgents = Array.isArray(obj.disableAgents) ? obj.disableAgents : [];

  // Heuristic additions: if cost objective and many agents, trim expensive responders
  if (plan.runResponders.length > 2 && objective === "min_cost") {
    plan.runResponders = plan.runResponders.slice(0, 2);
  }
  if (plan.runCritics.length === 0 && lastKnownSeverityHigh(obj)) {
    plan.runCritics = activeCritics;
  }

  return {
    action: obj.action === "stop" ? "stop" : "continue",
    explanation: obj.explanation || "",
    plan,
    providerStrategy: {
      objective: obj.providerStrategy?.objective || objective,
      providerOverrides,
      modelOverrides,
    },
    promptUpdates: Array.isArray(obj.promptUpdates)
      ? obj.promptUpdates.map((p: any) => ({ agentId: p.agentId, newPrompt: p.newPrompt, reason: p.reason || "" }))
      : [],
    createAgents,
    disableAgents,
    stopCriteria: obj.stopCriteria || { whyStopNow: "", unresolvedCritiques: 0, factConfidence: 1 },
  };
}

function lastKnownSeverityHigh(obj: any) {
  const crit = obj.stopCriteria?.unresolvedCritiques;
  return typeof crit === "number" && crit > 2;
}
