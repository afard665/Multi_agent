export type ReasoningTraceEntry = {
  iteration: number
  agentsRan: string[]
  responderOutputs: { agent_id: string; content: string }[]
  criticOutputs: { agent_id: string; content: string; severity: number }[]
  factChecks: { agent_id: string; unsupportedClaims: string[]; confidence: number }[]
  scores: { candidateId: string; score: number }[]
  metaDecision: any
  evidence: { docId: string; title: string; excerpt: string }[]
}
