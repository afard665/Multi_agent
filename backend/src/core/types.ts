export type AgentRole =
  | "responder"
  | "critic"
  | "opponent"
  | "fact_checker"
  | "scoring_agent"
  | "self_verifier"
  | "domain_expert";

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  enabled: boolean;
  system_prompt: string;
  model: string;
  provider: string;
  temperature: number;
  max_tokens: number;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
}

export interface PromptVersion {
  agentId: string;
  versionId: string;
  system_prompt: string;
  createdAt: number;
  createdBy: "meta" | "admin";
  note?: string;
  successMark?: boolean;
}

export interface MemoryStoreShape {
  question_history: { question: string; timestamp: number; category?: string; success?: boolean; confidence?: number }[];
  agent_performance: {
    [agentId: string]: {
      runs: number;
      totalScore: number;
      totalSeverity: number;
      totalCost: number;
      avgScore: number;
      avgSeverity: number;
      avgCost: number;
    };
  };
  patterns: {
    successfulPrompts: { agentId: string; versionId: string; notes?: string }[];
    failures: { category?: string; symptom: string; fixApplied?: string }[];
  };
}

export interface DocumentRecord {
  docId: string;
  title: string;
  text: string;
  tags?: string[];
  updatedAt?: number;
}

export interface UsageBreakdown {
  input: number;
  output: number;
  reasoning: number;
  cost: number;
}

export interface TokenUsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalReasoningTokens: number;
  totalCost: number;
  providerUsage: Record<string, UsageBreakdown>;
  agentUsage: Record<string, UsageBreakdown>;
}

export interface CandidateResponse {
  agent_id: string;
  content: string;
  model: string;
  provider: string;
  cost: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
  };
}

export interface CriticOutput {
  agent_id: string;
  content: string;
  severity: number;
}

export interface FactCheckResult {
  agent_id: string;
  unsupportedClaims: string[];
  confidence: number;
}

export interface ScoreResult {
  candidateId: string;
  score: number;
}

export interface EvidenceItem {
  docId: string;
  title: string;
  excerpt: string;
}

export interface MetaDecision {
  action: "continue" | "stop";
  explanation: string;
  plan: {
    runResponders: string[];
    runCritics: string[];
    runFactChecker: boolean;
    runScoring: boolean;
    runSelfVerifier: boolean;
  };
  providerStrategy: {
    objective: "min_cost" | "max_accuracy" | "balanced";
    providerOverrides: Record<string, string>;
    modelOverrides: Record<string, string>;
  };
  promptUpdates: { agentId: string; newPrompt: string; reason: string }[];
  createAgents: AgentConfig[];
  disableAgents: string[];
  stopCriteria: {
    whyStopNow: string;
    unresolvedCritiques: number;
    factConfidence: number;
  };
}

export interface ReasoningTraceEntry {
  iteration: number;
  agentsRan: string[];
  responderOutputs: CandidateResponse[];
  criticOutputs: CriticOutput[];
  factChecks: FactCheckResult[];
  scores: ScoreResult[];
  metaDecision: MetaDecision;
  evidence: EvidenceItem[];
}

export interface RunRecord {
  id: string;
  question: string;
  timestamp: number;
  finalAnswer: string;
  confidence: number;
  metaExplanation: string;
  iterations: number;
  reasoningTrace: ReasoningTraceEntry[];
  tokens: TokenUsageSummary;
  agentsUsed: string[];
}

export interface ConfigShape {
  provider_rates: Record<string, { input: number; output: number; reasoning: number }>;
  maxIterations: number;
  maxTokens: number;
}
