import { v4 as uuidv4 } from "uuid";
import { chatComplete } from "../llm/llmClient";
import { addUsage, initTokenSummary } from "../llm/tokenAccounting";
import { ConfigShape, AgentConfig, CandidateResponse, CriticOutput, FactCheckResult, ScoreResult, ReasoningTraceEntry } from "./types";
import { retrieveEvidence } from "./rag";
import { performFactCheck } from "./factCheck";
import { chooseFinalAnswer } from "./aggregator";
import { appendCitationsIfMissing, buildCitations } from "./citations";
import { metaSupervisor } from "./metaSupervisor";
import { PromptStore } from "./promptStore";
import { MemoryStore } from "./memoryStore";
import { RunStore } from "./runStore";
import { AgentStore } from "./agentStore";
import { selectProvider } from "../llm/providerSelector";

function tryParseJson<T>(text: string): T | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // keep going
  }

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1]) as T;
    } catch {
      // keep going
    }
  }

  const start = trimmed.search(/[\[{]/);
  const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      // ignore
    }
  }

  return null;
}

function normalizeScores(raw: any, candidateIds: string[]): ScoreResult[] | null {
  const clampScore = (v: any) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(10, n));
  };

  const seen = new Set<string>();
  const out: ScoreResult[] = [];

  // Accept either:
  // - [{ candidateId, score }, ...]
  // - { [candidateId]: score }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const candidateId = typeof item?.candidateId === "string" ? item.candidateId : "";
      if (!candidateId || !candidateIds.includes(candidateId) || seen.has(candidateId)) continue;
      const score = clampScore(item?.score);
      if (score == null) continue;
      seen.add(candidateId);
      out.push({ candidateId, score });
    }
  } else if (raw && typeof raw === "object") {
    for (const candidateId of candidateIds) {
      if (!Object.prototype.hasOwnProperty.call(raw, candidateId)) continue;
      const score = clampScore((raw as any)[candidateId]);
      if (score == null) continue;
      seen.add(candidateId);
      out.push({ candidateId, score });
    }
  }

  return out.length ? out : null;
}

export async function runAskFlow(
  question: string,
  agents: AgentConfig[],
  config: ConfigShape,
  promptStore: PromptStore,
  memory: MemoryStore,
  runs: RunStore,
  agentStore?: AgentStore,
  opts?: {
    runId?: string;
    onIteration?: (entry: ReasoningTraceEntry) => void;
    onFinal?: (payload: { answer: string; confidence: number; justification: string; tokens: any }) => void;
  }
) {
  const summary = initTokenSummary();
  const trace: ReasoningTraceEntry[] = [];
  let lastCritiqueSeverity = 0;
  let iteration = 0;
  let responderOutputs: CandidateResponse[] = [];
  let criticOutputs: CriticOutput[] = [];
  let factChecks: FactCheckResult[] = [];
  let scores: ScoreResult[] = [];

  while (iteration < config.maxIterations) {
    const metaDecision = await metaSupervisor(question, iteration, memory.getData(), agents, config, lastCritiqueSeverity);
    // apply prompt updates
    for (const update of metaDecision.promptUpdates) {
      const agent = agents.find((a) => a.id === update.agentId);
      if (agent) {
        agent.system_prompt = update.newPrompt;
        agent.updatedAt = Date.now();
        await promptStore.add(agent.id, update.newPrompt, "meta", update.reason);
      }
    }

    // create new agents
    for (const newAgent of metaDecision.createAgents) {
      newAgent.id = newAgent.id || uuidv4();
      newAgent.createdAt = Date.now();
      newAgent.updatedAt = Date.now();
      newAgent.enabled = true;
      agents.push(newAgent);

      // persist dynamic agents so they survive restarts
      if (agentStore) {
        await agentStore.add(newAgent);
      }
    }

    // disable agents
    for (const id of metaDecision.disableAgents) {
      const a = agents.find((ag) => ag.id === id);
      if (a) a.enabled = false;
    }

    // evidence retrieval
    const evidence = retrieveEvidence(question);
    const citations = buildCitations(evidence);

    // run responders
    const responders = agents.filter((a) => metaDecision.plan.runResponders.includes(a.id) && a.enabled);
    responderOutputs = await Promise.all(
      responders.map(async (agent) => {
        const provider = metaDecision.providerStrategy.providerOverrides[agent.id] || agent.provider || selectProvider(config);
        const model = metaDecision.providerStrategy.modelOverrides[agent.id] || agent.model;
        const response = await chatComplete(
          [
            { role: "system", content: agent.system_prompt },
            { role: "user", content: question },
          ],
          model,
          agent.temperature,
          { provider, providerConfig: config.llm_providers?.[provider] }
        );
        addUsage(summary, agent.id, provider, config.provider_rates[provider] || config.provider_rates.default || { input: 0, output: 0, reasoning: 0 }, {
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          reasoningTokens: response.reasoningTokens,
        });
        const content = appendCitationsIfMissing(response.text, citations);
        return { agent_id: agent.id, content, model, provider, cost: summary.agentUsage[agent.id].cost, usage: { inputTokens: response.inputTokens, outputTokens: response.outputTokens, reasoningTokens: response.reasoningTokens } };
      })
    );

    // critics/opponents
    const critics = agents.filter((a) => metaDecision.plan.runCritics.includes(a.id) && a.enabled);
    criticOutputs =
      responderOutputs.length === 0
        ? []
        : await Promise.all(
            critics.flatMap((agent) =>
              responderOutputs.map(async (candidate) => {
                const provider =
                  metaDecision.providerStrategy.providerOverrides[agent.id] || agent.provider || selectProvider(config);
                const model = metaDecision.providerStrategy.modelOverrides[agent.id] || agent.model;
                const resp = await chatComplete(
                  [
                    { role: "system", content: agent.system_prompt },
                    {
                      role: "user",
                      content:
                        `Critique this candidate answer and highlight weaknesses.\n` +
                        `CandidateId: ${candidate.agent_id}\n` +
                        `Question: ${question}\n` +
                        `Answer:\n${candidate.content}`,
                    },
                  ],
                  model,
                  agent.temperature,
                  { provider, providerConfig: config.llm_providers?.[provider] }
                );
                addUsage(
                  summary,
                  agent.id,
                  provider,
                  config.provider_rates[provider] || config.provider_rates.default || { input: 0, output: 0, reasoning: 0 },
                  {
                    inputTokens: resp.inputTokens,
                    outputTokens: resp.outputTokens,
                    reasoningTokens: resp.reasoningTokens,
                  }
                );
                const severity = Math.min(5, Math.max(0, resp.text.length / 200));
                return { agent_id: agent.id, candidateId: candidate.agent_id, content: resp.text, severity };
              })
            )
          );
    lastCritiqueSeverity = criticOutputs.reduce((acc, c) => acc + c.severity, 0) / (criticOutputs.length || 1);

    // fact check
    factChecks = metaDecision.plan.runFactChecker
      ? responderOutputs.map((resp) => performFactCheck(resp.content, evidence, resp.agent_id))
      : [];

    // scoring agent
    if (metaDecision.plan.runScoring) {
      const scoringAgent = agents.find((a) => a.role === "scoring_agent" && a.enabled);
      if (scoringAgent) {
        const provider = metaDecision.providerStrategy.providerOverrides[scoringAgent.id] || scoringAgent.provider || selectProvider(config);
        const model = metaDecision.providerStrategy.modelOverrides[scoringAgent.id] || scoringAgent.model;
        const resp = await chatComplete(
          [
            { role: "system", content: scoringAgent.system_prompt },
            {
              role: "user",
              content:
                `Score each candidate answer from 0 to 10 (10 is best).\n` +
                `Return ONLY valid JSON, either:\n` +
                `- an array of {\"candidateId\":\"...\",\"score\":number}\n` +
                `- or an object map {\"candidateId\": number}\n\n` +
                `Candidates:\n` +
                responderOutputs.map((r) => `- ${r.agent_id}: ${r.content}`).join("\n"),
            },
          ],
          model,
          scoringAgent.temperature,
          { provider, providerConfig: config.llm_providers?.[provider] }
        );
        addUsage(summary, scoringAgent.id, provider, config.provider_rates[provider] || config.provider_rates.default || { input: 0, output: 0, reasoning: 0 }, {
          inputTokens: resp.inputTokens,
          outputTokens: resp.outputTokens,
          reasoningTokens: resp.reasoningTokens,
        });
        const candidateIds = responderOutputs.map((r) => r.agent_id);
        const parsed = tryParseJson<any>(resp.text);
        const normalized = normalizeScores(parsed, candidateIds);
        scores = normalized || responderOutputs.map((r) => ({ candidateId: r.agent_id, score: 5 }));
      }
    }

    // self verifier minimal check
    if (metaDecision.plan.runSelfVerifier) {
      responderOutputs = responderOutputs.map((r) => ({
        ...r,
        content: r.content.replace(/\s+/g, " "),
      }));
    }

    const entry: ReasoningTraceEntry = {
      iteration,
      agentsRan: responders.map((r) => r.id),
      responderOutputs,
      criticOutputs,
      factChecks,
      scores,
      metaDecision,
      evidence,
    };

    trace.push(entry);
    opts?.onIteration?.(entry);

    if (metaDecision.action === "stop") break;
    iteration += 1;
  }

  const final = chooseFinalAnswer(responderOutputs, criticOutputs, factChecks, scores);
  opts?.onFinal?.({ answer: final.answer, confidence: final.confidence, justification: final.justification, tokens: summary });
  const runId = opts?.runId || uuidv4();
  await runs.add({
    id: runId,
    question,
    timestamp: Date.now(),
    finalAnswer: final.answer,
    confidence: final.confidence,
    metaExplanation: final.justification,
    iterations: trace.length,
    reasoningTrace: trace,
    tokens: summary,
    agentsUsed: Object.keys(summary.agentUsage || {}),
  });
  await memory.recordQuestion(question, undefined, true, final.confidence);
  for (const candidate of responderOutputs) {
    const candidateCritiques = criticOutputs.filter((c) => c.candidateId === candidate.agent_id);
    const avgSeverity = candidateCritiques.reduce((acc, c) => acc + c.severity, 0) / (candidateCritiques.length || 1);
    await memory.recordAgentPerformance(
      candidate.agent_id,
      scores.find((s) => s.candidateId === candidate.agent_id)?.score || 0,
      avgSeverity,
      summary.agentUsage[candidate.agent_id]?.cost || 0
    );
  }

  return { ...final, runId, trace, tokens: summary };
}
