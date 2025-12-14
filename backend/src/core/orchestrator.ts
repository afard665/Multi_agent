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
    criticOutputs = await Promise.all(
      critics.map(async (agent) => {
        const provider = metaDecision.providerStrategy.providerOverrides[agent.id] || agent.provider || selectProvider(config);
        const model = metaDecision.providerStrategy.modelOverrides[agent.id] || agent.model;
        const candidateText = responderOutputs.map((r) => `${r.agent_id}: ${r.content}`).join("\n");
        const resp = await chatComplete(
          [
            { role: "system", content: agent.system_prompt },
            { role: "user", content: `Critique these answers and highlight weaknesses:\n${candidateText}` },
          ],
          model,
          agent.temperature,
          { provider, providerConfig: config.llm_providers?.[provider] }
        );
        addUsage(summary, agent.id, provider, config.provider_rates[provider] || config.provider_rates.default || { input: 0, output: 0, reasoning: 0 }, {
          inputTokens: resp.inputTokens,
          outputTokens: resp.outputTokens,
          reasoningTokens: resp.reasoningTokens,
        });
        const severity = Math.min(5, Math.max(0, resp.text.length / 200));
        return { agent_id: agent.id, content: resp.text, severity };
      })
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
            { role: "user", content: responderOutputs.map((r, idx) => `Candidate ${idx}: ${r.content}`).join("\n") },
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
        scores = responderOutputs.map((r, idx) => ({ candidateId: r.agent_id, score: 5 - idx }));
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
    iterations: iteration + 1,
    reasoningTrace: trace,
    tokens: summary,
    agentsUsed: agents.filter((a) => a.enabled).map((a) => a.id),
  });
  await memory.recordQuestion(question, undefined, true, final.confidence);
  for (const c of criticOutputs) {
    const candidate = responderOutputs.find((r) => r.agent_id === c.agent_id);
    await memory.recordAgentPerformance(
      c.agent_id,
      scores.find((s) => s.candidateId === c.agent_id)?.score || 0,
      c.severity,
      summary.agentUsage[c.agent_id]?.cost || 0
    );
    if (candidate) {
      await memory.recordAgentPerformance(
        candidate.agent_id,
        scores.find((s) => s.candidateId === candidate.agent_id)?.score || 0,
        c.severity,
        summary.agentUsage[candidate.agent_id]?.cost || 0
      );
    }
  }

  return { ...final, runId, trace, tokens: summary };
}