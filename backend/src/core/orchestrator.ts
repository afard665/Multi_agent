import { v4 as uuidv4 } from "uuid";
import { chatComplete } from "../llm/avalaiClient";
import { addUsage, initTokenSummary } from "../llm/tokenAccounting";
import { ConfigShape, AgentConfig, CandidateResponse, CriticOutput, FactCheckResult, ScoreResult, ReasoningTraceEntry } from "./types";
import { retrieveEvidence } from "./rag";
import { performFactCheck } from "./factCheck";
import { chooseFinalAnswer } from "./aggregator";
import { metaSupervisor } from "./metaSupervisor";
import { PromptStore } from "./promptStore";
import { MemoryStore } from "./memoryStore";
import { RunStore } from "./runStore";
import { selectProvider } from "../llm/providerSelector";

export async function runAskFlow(question: string, agents: AgentConfig[], config: ConfigShape, promptStore: PromptStore, memory: MemoryStore, runs: RunStore) {
  const summary = initTokenSummary();
  const trace: ReasoningTraceEntry[] = [];
  let lastCritiqueSeverity = 0;
  let iteration = 0;
  let responderOutputs: CandidateResponse[] = [];
  let criticOutputs: CriticOutput[] = [];
  let factChecks: FactCheckResult[] = [];
  let scores: ScoreResult[] = [];
  let lastEvidence: ReturnType<typeof retrieveEvidence> = [];
  const parseScoringResponse = (text: string): ScoreResult[] => {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed
          .map((p) => {
            if (typeof p === "object" && p.candidateId && typeof p.score === "number") {
              return { candidateId: String(p.candidateId), score: p.score } as ScoreResult;
            }
            return undefined;
          })
          .filter((v): v is ScoreResult => Boolean(v));
      }
      if (typeof parsed === "object" && parsed) {
        return Object.entries(parsed)
          .map(([candidateId, score]) => {
            if (typeof score === "number") return { candidateId, score } as ScoreResult;
            return undefined;
          })
          .filter((v): v is ScoreResult => Boolean(v));
      }
    } catch (err) {
      // fall through to text parsing
    }

    const byLine = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const lineMatches: ScoreResult[] = [];
    byLine.forEach((line, idx) => {
      const match = line.match(/candidate\s*(\w+)[^\d-]*(-?\d+(?:\.\d+)?)/i);
      if (match) {
        lineMatches.push({ candidateId: match[1], score: parseFloat(match[2]) });
      } else {
        const numMatch = line.match(/(-?\d+(?:\.\d+)?)/);
        if (numMatch) {
          lineMatches.push({ candidateId: String(idx), score: parseFloat(numMatch[1]) });
        }
      }
    });
    if (lineMatches.length > 0) return lineMatches;
    return [];
  };

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
    }

    // disable agents
    for (const id of metaDecision.disableAgents) {
      const a = agents.find((ag) => ag.id === id);
      if (a) a.enabled = false;
    }

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
          agent.temperature
        );
        const cost = addUsage(summary, agent.id, provider, config.provider_rates[provider] || config.provider_rates.default, {
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          reasoningTokens: response.reasoningTokens,
        });
        return {
          agent_id: agent.id,
          content: response.text,
          model,
          provider,
          cost,
          usage: { inputTokens: response.inputTokens, outputTokens: response.outputTokens, reasoningTokens: response.reasoningTokens },
        };
      })
    );

    // evidence retrieval
    const evidence = retrieveEvidence(question);
    lastEvidence = evidence;

    // critics/opponents
    const critics = agents.filter((a) => metaDecision.plan.runCritics.includes(a.id) && a.enabled);
    criticOutputs = await Promise.all(
      critics.map(async (agent) => {
        const provider = metaDecision.providerStrategy.providerOverrides[agent.id] || agent.provider || selectProvider(config);
        const model = metaDecision.providerStrategy.modelOverrides[agent.id] || agent.model;
        const candidateText = responderOutputs.map((r, idx) => `Candidate ${idx} (${r.agent_id}): ${r.content}`).join("\n");
        const resp = await chatComplete(
          [
            { role: "system", content: agent.system_prompt },
            { role: "user", content: `Critique these answers and highlight weaknesses. Cite candidate ids when possible.\n${candidateText}` },
          ],
          model,
          agent.temperature
        );
        addUsage(summary, agent.id, provider, config.provider_rates[provider] || config.provider_rates.default, {
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
          scoringAgent.temperature
        );
        addUsage(summary, scoringAgent.id, provider, config.provider_rates[provider] || config.provider_rates.default, {
          inputTokens: resp.inputTokens,
          outputTokens: resp.outputTokens,
          reasoningTokens: resp.reasoningTokens,
        });
        const parsedScores = parseScoringResponse(resp.text);
        scores = parsedScores.length
          ? parsedScores
              .map((s, idx) => {
                const target = responderOutputs[idx] && s.candidateId === String(idx) ? responderOutputs[idx].agent_id : s.candidateId;
                return { candidateId: target, score: s.score } as ScoreResult;
              })
              .map((s) => ({ ...s, score: Number.isFinite(s.score) ? s.score : 0 }))
          : responderOutputs.map((r, idx) => ({ candidateId: r.agent_id, score: 5 - idx }));
      }
    }

    // self verifier minimal check
    if (metaDecision.plan.runSelfVerifier) {
      responderOutputs = responderOutputs.map((r) => ({
        ...r,
        content: r.content.replace(/\s+/g, " "),
      }));
    }

    const agentsRan = new Set<string>();
    responderOutputs.forEach((r) => agentsRan.add(r.agent_id));
    criticOutputs.forEach((c) => agentsRan.add(c.agent_id));
    factChecks.forEach((f) => agentsRan.add(f.agent_id));
    if (metaDecision.plan.runScoring) {
      const scoringAgent = agents.find((a) => a.role === "scoring_agent" && a.enabled);
      if (scoringAgent) agentsRan.add(scoringAgent.id);
    }

    trace.push({
      iteration,
      agentsRan: Array.from(agentsRan),
      responderOutputs,
      criticOutputs,
      factChecks,
      scores,
      metaDecision,
      evidence,
    });

    if (metaDecision.action === "stop") break;
    iteration += 1;
  }

  const final = chooseFinalAnswer(responderOutputs, criticOutputs, factChecks, scores, lastEvidence);
  const runId = uuidv4();
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
  const severityForCandidate = (candidateId: string, candidateIndex: number) => {
    return criticOutputs.reduce((acc, c) => {
      const contentLower = c.content.toLowerCase();
      const mentionsId = contentLower.includes(candidateId.toLowerCase()) || contentLower.includes(`candidate ${candidateIndex}`);
      const weight = mentionsId ? 1 : 0.3;
      return acc + c.severity * weight;
    }, 0);
  };

  for (const [idx, resp] of responderOutputs.entries()) {
    const candidateScore = scores.find((s) => s.candidateId === resp.agent_id)?.score || 0;
    const candidateSeverity = severityForCandidate(resp.agent_id, idx);
    await memory.recordAgentPerformance(resp.agent_id, candidateScore, candidateSeverity, summary.agentUsage[resp.agent_id]?.cost || 0);
  }

  for (const critic of criticOutputs) {
    await memory.recordAgentPerformance(critic.agent_id, 0, critic.severity, summary.agentUsage[critic.agent_id]?.cost || 0);
  }

  const scoringAgent = agents.find((a) => a.role === "scoring_agent" && a.enabled);
  if (scoringAgent) {
    await memory.recordAgentPerformance(scoringAgent.id, 0, 0, summary.agentUsage[scoringAgent.id]?.cost || 0);
  }

  return { ...final, runId, trace, tokens: summary };
}
