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
  candidateId: string;
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

export interface WorkflowNode {
  id: string;
  agentId: string;
  label?: string;
  x: number;
  y: number;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
}

export interface WorkflowAiDesignMessage {
  role: "system" | "user";
  content: string;
}

export interface WorkflowAiDesign {
  source: "ask_page";
  question: string;
  provider: string;
  model: string;
  messages: WorkflowAiDesignMessage[];
  responseText: string;
  createdAt: number;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  tags?: string[];
  aiDesign?: WorkflowAiDesign;
  createdAt: number;
  updatedAt: number;
}

export type WorkflowSnapshot = Pick<Workflow, "id" | "name" | "description" | "nodes" | "edges" | "tags" | "aiDesign">;

export interface MetaDecision {
  action: "continue" | "stop";
  explanation: string;
  // Chosen by the Meta-Supervisor per ask, clamped to config.maxIterations.
  // Used as a run-level iteration cap so different questions can use different budgets.
  iterationBudget?: number;
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
  workflowId?: string | null;
  workflowName?: string;
  workflow?: WorkflowSnapshot | null;
}

export type LlmProviderConfig = {
  key: string;
  displayName?: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
};

export interface ConfigShape {
  provider_rates: Record<string, { input: number; output: number; reasoning: number }>;
  // When set, used as the default provider key for newly created agents (e.g. AI workflow designer).
  // Empty => fall back to auto selection.
  default_provider?: string;
  llm_providers?: Record<string, LlmProviderConfig>;
  maxIterations: number;
  maxTokens: number;
  workflow_designer?: {
    provider?: string; // empty => auto
    model?: string; // empty => provider default
    systemPrompt?: string;
  };
}
