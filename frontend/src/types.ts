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
  responderOutputs: { agent_id: string; content: string; model?: string; provider?: string; cost?: Money; nodeId?: string; nodeLabel?: string; workflowId?: string }[]
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
  liveTrace?: { wsUrl: string; runId: string; cancelToken?: string } | null
}

export type LiveTraceEvent = {
  type: 'iteration' | 'final' | 'error'
  runId: string
  payload: any
  timestamp: number
}

export type WorkflowNode = {
  id: string
  agentId: string
  label?: string
  x: number
  y: number
}

export type WorkflowEdge = {
  id: string
  from: string
  to: string
}

export type Workflow = {
  id: string
  name: string
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  tags?: string[]
  aiDesign?: {
    source: 'ask_page'
    question: string
    provider: string
    model: string
    messages: { role: 'system' | 'user'; content: string }[]
    responseText: string
    createdAt: number
  }
  createdAt?: number
  updatedAt?: number
}
