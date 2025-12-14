export type Money = number

export type TokenUsageBucket = {
  input: number
  output: number
  reasoning: number
  cost: Money
}

export type TokenUsageSummary = {
  totalInputTokens: number
  totalOutputTokens: number
  totalReasoningTokens: number
  totalCost: Money
  providerUsage: Record<string, TokenUsageBucket>
  agentUsage: Record<string, TokenUsageBucket>
}

export type ReasoningTraceEntry = {
  iteration: number
  agentsRan: string[]
  responderOutputs: { agent_id: string; content: string; model?: string; provider?: string; cost?: Money }[]
  criticOutputs: { agent_id: string; candidateId: string; content: string; severity: number }[]
  factChecks: { agent_id: string; unsupportedClaims: string[]; confidence: number }[]
  scores: { candidateId: string; score: number }[]
  metaDecision: any
  evidence: { docId: string; title: string; excerpt: string }[]
}

export type AskResponse = {
  finalAnswer: string
  confidence: number
  metaExplanation: string
  iterations: number
  reasoningTrace: ReasoningTraceEntry[]
  tokens?: TokenUsageSummary
  runId: string
  liveTrace?: { wsUrl: string; runId: string } | null
}

export type LiveTraceEvent = {
  type: 'iteration' | 'final' | 'error'
  runId: string
  payload: any
  timestamp: number
}
