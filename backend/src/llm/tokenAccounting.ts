import { TokenUsageSummary } from "../core/types";

export function initTokenSummary(): TokenUsageSummary {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalReasoningTokens: 0,
    totalCost: 0,
    providerUsage: {},
    agentUsage: {},
  };
}

export function addUsage(summary: TokenUsageSummary, agentId: string, provider: string, rate: { input: number; output: number; reasoning: number }, usage: { inputTokens: number; outputTokens: number; reasoningTokens: number }) {
  const { inputTokens, outputTokens, reasoningTokens } = usage;
  const cost = inputTokens * rate.input + outputTokens * rate.output + reasoningTokens * rate.reasoning;
  summary.totalInputTokens += inputTokens;
  summary.totalOutputTokens += outputTokens;
  summary.totalReasoningTokens += reasoningTokens;
  summary.totalCost += cost;
  if (!summary.providerUsage[provider]) summary.providerUsage[provider] = { input: 0, output: 0, reasoning: 0, cost: 0 };
  summary.providerUsage[provider].input += inputTokens;
  summary.providerUsage[provider].output += outputTokens;
  summary.providerUsage[provider].reasoning += reasoningTokens;
  summary.providerUsage[provider].cost += cost;
  if (!summary.agentUsage[agentId]) summary.agentUsage[agentId] = { input: 0, output: 0, reasoning: 0, cost: 0 };
  summary.agentUsage[agentId].input += inputTokens;
  summary.agentUsage[agentId].output += outputTokens;
  summary.agentUsage[agentId].reasoning += reasoningTokens;
  summary.agentUsage[agentId].cost += cost;
}
