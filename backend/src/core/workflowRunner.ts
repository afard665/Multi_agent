import { v4 as uuidv4 } from "uuid";
import { chatComplete } from "../llm/llmClient";
import { addUsage, initTokenSummary } from "../llm/tokenAccounting";
import { selectProvider } from "../llm/providerSelector";
import { AgentConfig, AgentRole, ConfigShape, ReasoningTraceEntry, WorkflowAiDesign, WorkflowAiDesignMessage, WorkflowSnapshot } from "./types";
import { MemoryStore } from "./memoryStore";
import { RunStore } from "./runStore";
import { computeWorkflowTopo } from "./workflowGraph";
import { ensureArray, ensureNumber, ensureString } from "../utils/validate";

const allowedRoles: AgentRole[] = [
  "responder",
  "critic",
  "opponent",
  "fact_checker",
  "scoring_agent",
  "self_verifier",
  "domain_expert",
];

function isAgentRole(value: any): value is AgentRole {
  return typeof value === "string" && (allowedRoles as string[]).includes(value);
}

function indentLines(text: string, indent = "    ") {
  if (!text) return ""
  return text
    .split(/\r?\n/)
    .map((line) => `${indent}${line}`)
    .join("\n")
}

function formatAgentReference(agent: AgentConfig) {
  const tags = Array.isArray(agent.tags) && agent.tags.length ? agent.tags.join(", ") : "none"
  const trimmedPrompt = (agent.system_prompt || "").trim()
  const promptBlock = trimmedPrompt ? indentLines(trimmedPrompt) : "    (none)"

  return [
    `- ${agent.id} (${agent.role}) — ${agent.name}`,
    `  Provider: ${agent.provider}`,
    `  Model: ${agent.model}`,
    `  Temperature: ${agent.temperature}`,
    `  Max tokens: ${agent.max_tokens}`,
    `  Tags: ${tags}`,
    `  System prompt:`,
    promptBlock,
  ].join("\n")
}

function serializeAgentForWorkflowDesign(agent: AgentConfig) {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    enabled: agent.enabled,
    provider: agent.provider,
    model: agent.model,
    temperature: agent.temperature,
    max_tokens: agent.max_tokens,
    tags: Array.isArray(agent.tags) ? agent.tags : [],
    system_prompt: agent.system_prompt,
  }
}

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

function truncateText(s: string, maxLen: number) {
  if (typeof s !== "string") return "";
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + `\n\n...[truncated ${s.length - maxLen} chars]`;
}

function normalizeSuggestedAgent(
  raw: any,
  config: ConfigShape,
  existingAgentIds: Set<string>,
  now: number
): { agent: AgentConfig; originalId: string | null } | null {
  if (!raw || typeof raw !== "object") return null;

  const originalIdRaw = ensureString(raw?.id, "").trim();
  const originalId = originalIdRaw || null;

  const role: AgentRole = isAgentRole(raw?.role) ? raw.role : "domain_expert";
  const name = ensureString(raw?.name, "").trim() || `Generated ${role}`;
  const system_prompt =
    ensureString(raw?.system_prompt, "").trim() ||
    `You are a helpful ${role}. Provide accurate, concise outputs and ask clarifying questions when needed.`;

  const configuredDefaultProvider = typeof config.default_provider === "string" ? config.default_provider.trim() : "";
  const providerDefault = configuredDefaultProvider || selectProvider(config);
  const provider = ensureString(raw?.provider, "").trim() || providerDefault;
  const modelDefault = config.llm_providers?.[provider]?.models?.[0] || "gpt-4o-mini";
  const model = ensureString(raw?.model, "").trim() || modelDefault;

  const temperature = Math.max(0, Math.min(2, ensureNumber(raw?.temperature, 0.6)));
  const max_tokens = Math.max(1, Math.min(ensureNumber(raw?.max_tokens, Math.min(1024, config.maxTokens || 2048)), config.maxTokens || 2048));
  const tags = ensureArray<any>(raw?.tags, []).filter((t) => typeof t === "string").slice(0, 10);
  if (!tags.includes("generated")) tags.push("generated");
  if (!tags.includes("workflow")) tags.push("workflow");

  let id = originalIdRaw;
  if (!id || existingAgentIds.has(id)) id = `wf-${uuidv4()}`;
  while (existingAgentIds.has(id)) id = `wf-${uuidv4()}`;
  existingAgentIds.add(id);

  const agent: AgentConfig = {
    id,
    name,
    role,
    enabled: true,
    system_prompt,
    model,
    provider,
    temperature,
    max_tokens,
    createdAt: now,
    updatedAt: now,
    tags,
  };

  return { agent, originalId };
}

function remapWorkflowAgentIds(raw: any, idMap: Map<string, string>) {
  if (!raw || typeof raw !== "object") return raw;
  const nodesIn = Array.isArray(raw?.nodes) ? raw.nodes : [];
  const nodes = nodesIn.map((n: any) => {
    const agentId = ensureString(n?.agentId, "").trim();
    const mapped = idMap.get(agentId) || agentId;
    return { ...n, agentId: mapped };
  });
  return { ...raw, nodes };
}

function sanitizeSuggestedWorkflow(raw: any, allowedAgentIds: Set<string>): WorkflowSnapshot | null {
  const name = typeof raw?.name === "string" ? raw.name.trim() : "";
  if (!name) return null;

  const nodesIn = Array.isArray(raw?.nodes) ? raw.nodes : [];
  const edgesIn = Array.isArray(raw?.edges) ? raw.edges : [];
  if (!nodesIn.length) return null;

  const nodeIds = new Set<string>();
  const nodes = nodesIn
    .map((n: any) => {
      const id = typeof n?.id === "string" ? n.id.trim() : "";
      const agentId = typeof n?.agentId === "string" ? n.agentId.trim() : "";
      if (!id || !agentId) return null;
      if (!allowedAgentIds.has(agentId)) return null;
      if (nodeIds.has(id)) return null;
      nodeIds.add(id);

      const x = Number.isFinite(Number(n?.x)) ? Number(n.x) : 0;
      const y = Number.isFinite(Number(n?.y)) ? Number(n.y) : 0;
      const label = typeof n?.label === "string" ? n.label : undefined;
      return { id, agentId, label, x, y };
    })
    .filter(Boolean) as WorkflowSnapshot["nodes"];

  if (!nodes.length) return null;

  const edges = edgesIn
    .map((e: any) => {
      const id = typeof e?.id === "string" ? e.id.trim() : uuidv4();
      const from = typeof e?.from === "string" ? e.from.trim() : "";
      const to = typeof e?.to === "string" ? e.to.trim() : "";
      if (!from || !to) return null;
      if (!nodeIds.has(from) || !nodeIds.has(to)) return null;
      if (from === to) return null;
      return { id, from, to };
    })
    .filter(Boolean) as WorkflowSnapshot["edges"];

  const description = typeof raw?.description === "string" ? raw.description : undefined;

  const snapshot: WorkflowSnapshot = {
    id: uuidv4(),
    name,
    description,
    nodes,
    edges,
  };

  // basic DAG validation
  try {
    computeWorkflowTopo(snapshot);
  } catch {
    return null;
  }

  return snapshot;
}

export async function suggestWorkflowForQuestion(
  question: string,
  agents: AgentConfig[],
  config: ConfigShape,
  opts?: { signal?: AbortSignal; allowCreateAgents?: boolean }
): Promise<{ workflow: WorkflowSnapshot; createAgents: AgentConfig[]; aiDesign?: WorkflowAiDesign }> {
  const enabled = agents.filter((a) => a.enabled);
  const allowedIds = new Set(enabled.map((a) => a.id));
  const allowCreateAgents = !!opts?.allowCreateAgents;

  const designerCfg = config.workflow_designer || {};
  const provider =
    typeof designerCfg.provider === "string" && designerCfg.provider.trim()
      ? designerCfg.provider.trim()
      : selectProvider(config);
  const providerCfg = config.llm_providers?.[provider];
  const model =
    typeof designerCfg.model === "string" && designerCfg.model.trim()
      ? designerCfg.model.trim()
      : providerCfg?.models?.[0] || "gpt-4o-mini";
  const systemPrompt =
    typeof designerCfg.systemPrompt === "string" && designerCfg.systemPrompt.trim()
      ? designerCfg.systemPrompt.trim()
      : "You are an expert workflow designer for a multi-agent LLM system. Design minimal, practical DAG workflows. Output strictly valid JSON only, matching the requested schema.";

  const agentReferenceDetails = enabled.length
    ? JSON.stringify(enabled.map(serializeAgentForWorkflowDesign), null, 2)
    : "[]"
  const availableAgentsSection = `Available enabled agents:\n${agentReferenceDetails}`
  const prompt =
    `Design a DAG workflow for a multi-agent system to answer the user question.\n` +
    `Return ONLY valid JSON.\n\n` +
    `Schema:\n` +
    `{\n` +
    `  "workflow": {\n` +
    `    "name": string,\n` +
    `    "description": string,\n` +
    `    "nodes": [{ "id": "n1", "agentId": "agent-id", "label": "optional", "x": number, "y": number }],\n` +
    `    "edges": [{ "id": "e1", "from": "n1", "to": "n2" }]\n` +
    `  },\n` +
    `  "createAgents": [{\n` +
    `    "id": "new-agent-id",\n` +
    `    "name": string,\n` +
    `    "role": one of ${JSON.stringify(allowedRoles)},\n` +
    `    "system_prompt": string,\n` +
    `    "provider": string,\n` +
    `    "model": string,\n` +
    `    "temperature": number,\n` +
    `    "max_tokens": number,\n` +
    `    "tags": string[]\n` +
    `  }]\n` +
    `}\n\n` +
    `Rules:\n` +
    `- Workflow must be a DAG (no cycles).\n` +
    `- 1 to 6 nodes.\n` +
    `- Prefer left-to-right layout by increasing x.\n` +
    `- For workflow.nodes[].agentId:\n` +
    `  - Use an existing enabled agent id EXACTLY as listed below\n` +
    `  - Do NOT use role names (e.g. "responder") as agentId\n` +
    (allowCreateAgents
      ? `  - Prefer existing agents; only create new agents if none are suitable\n` +
        `  - If needed, create up to 3 new agents in createAgents and reference them by id\n` +
        `  - Any createAgents you include must be referenced by at least one workflow node\n`
      : `  - Do NOT create new agents; set createAgents to []\n`) +
    `\n${availableAgentsSection}\n` +
    `\nUser question:\n${question}`;

  const sentMessages: WorkflowAiDesignMessage[] = [
    { role: "system", content: truncateText(systemPrompt, 20_000) },
    { role: "user", content: truncateText(prompt, 50_000) },
  ];

  let capturedAiDesign: WorkflowAiDesign | undefined = {
    source: "ask_page",
    question,
    provider,
    model,
    messages: sentMessages,
    responseText: "",
    createdAt: Date.now(),
  };
  const withAiMeta = (wf: WorkflowSnapshot): WorkflowSnapshot => {
    const tags = Array.from(new Set([...(wf.tags || []), "ai"])).filter(Boolean);
    return { ...wf, tags, aiDesign: capturedAiDesign || wf.aiDesign };
  };

  try {
    const resp = await chatComplete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      model,
      0.2,
      { provider, providerConfig: providerCfg, maxTokens: 800, signal: opts?.signal, timeoutMs: Number(process.env.LLM_TIMEOUT_MS || "") || undefined }
    );

    capturedAiDesign = { ...(capturedAiDesign as WorkflowAiDesign), responseText: truncateText(resp.text, 100_000) };

    const parsed = tryParseJson<any>(resp.text);
    const rawWorkflow = parsed?.workflow || parsed;
    const rawCreateAgents = allowCreateAgents ? ensureArray<any>(parsed?.createAgents, []).slice(0, 3) : [];

    const now = Date.now();
    const existingAgentIds = new Set(agents.map((a) => a.id));
    const idMap = new Map<string, string>();
    const createdAgents = rawCreateAgents
      .map((a) => normalizeSuggestedAgent(a, config, existingAgentIds, now))
      .filter(Boolean)
      .map((x) => {
        const v = x as any as { agent: AgentConfig; originalId: string | null };
        if (v.originalId && v.originalId !== v.agent.id) idMap.set(v.originalId, v.agent.id);
        return v.agent;
      });

    const remapped = remapWorkflowAgentIds(rawWorkflow, idMap);
    const allowedWithCreates = new Set<string>([...allowedIds, ...createdAgents.map((a) => a.id)]);

    const suggested = parsed ? sanitizeSuggestedWorkflow(remapped, allowedWithCreates) : null;
    if (suggested) {
      const usedCreateIds = new Set(suggested.nodes.map((n) => n.agentId));
      const usedCreates = createdAgents.filter((a) => usedCreateIds.has(a.id));
      return { workflow: withAiMeta(suggested), createAgents: usedCreates, aiDesign: capturedAiDesign };
    }
  } catch (e: any) {
    // Keep the prompt/response context even if the LLM call failed, then fall back.
    const msg = e?.response?.data?.error || e?.message || "LLM error";
    if (capturedAiDesign) capturedAiDesign = { ...capturedAiDesign, responseText: `ERROR: ${String(msg)}` };
  }

  // deterministic fallback
  const responder = enabled.find((a) => a.role === "responder") || enabled[0];
  const critic = enabled.find((a) => a.role === "critic") || enabled.find((a) => a.id !== responder?.id);

  if (!responder) {
    if (allowCreateAgents) {
      const now = Date.now();
      const id = `wf-${uuidv4()}`;
      const configuredDefaultProvider = typeof config.default_provider === "string" ? config.default_provider.trim() : "";
      const fallbackProvider = configuredDefaultProvider || selectProvider(config);
      const fallbackModel = config.llm_providers?.[fallbackProvider]?.models?.[0] || "gpt-4o-mini";
      const fallbackAgent: AgentConfig = {
        id,
        name: "Generated Responder",
        role: "responder",
        enabled: true,
        system_prompt: "You are a helpful responder producing concise answers.",
        model: fallbackModel,
        provider: fallbackProvider,
        temperature: 0.6,
        max_tokens: Math.min(1024, config.maxTokens || 2048),
        createdAt: now,
        updatedAt: now,
        tags: ["generated", "workflow"],
      };
      return {
        workflow: withAiMeta({ id: uuidv4(), name: "Single-agent workflow", description: "AI generated an agent for this workflow", nodes: [{ id: "n1", agentId: id, label: "Answer", x: 80, y: 80 }], edges: [] }),
        createAgents: [fallbackAgent],
        aiDesign: capturedAiDesign,
      };
    }

    return { workflow: withAiMeta({ id: uuidv4(), name: "Empty workflow", description: "No enabled agents available", nodes: [], edges: [] }), createAgents: [], aiDesign: capturedAiDesign };
  }

  const n1 = { id: "n1", agentId: responder.id, label: "Draft", x: 80, y: 80 };
  if (!critic) {
    return { workflow: withAiMeta({ id: uuidv4(), name: "Single-agent workflow", description: "Single step answer", nodes: [n1], edges: [] }), createAgents: [], aiDesign: capturedAiDesign };
  }

  const n2 = { id: "n2", agentId: critic.id, label: "Critique", x: 360, y: 80 };
  const n3 = { id: "n3", agentId: responder.id, label: "Final answer", x: 640, y: 80 };
  return {
    workflow: withAiMeta({
      id: uuidv4(),
      name: "Draft → Critique → Final",
      description: "Create a draft, critique it, then produce a final answer.",
      nodes: [n1, n2, n3],
      edges: [
        { id: "e1", from: "n1", to: "n2" },
        { id: "e2", from: "n2", to: "n3" },
      ],
    }),
    createAgents: [],
    aiDesign: capturedAiDesign,
  };
}

export async function runWorkflowFlow(
  question: string,
  workflow: WorkflowSnapshot,
  agents: AgentConfig[],
  config: ConfigShape,
  memory: MemoryStore,
  runs: RunStore,
  opts?: {
    runId?: string;
    onIteration?: (entry: ReasoningTraceEntry) => void;
    onFinal?: (payload: { answer: string; confidence: number; justification: string; tokens: any }) => void;
    shouldCancel?: () => boolean;
    signal?: AbortSignal;
  }
) {
  const normalized: WorkflowSnapshot = {
    id: workflow.id || uuidv4(),
    name: workflow.name || "Untitled workflow",
    description: workflow.description,
    nodes: Array.isArray(workflow.nodes) ? workflow.nodes : [],
    edges: Array.isArray(workflow.edges) ? workflow.edges : [],
  };

  if (!normalized.nodes.length) throw new Error("Workflow has no nodes");

  const agentById = new Map<string, AgentConfig>();
  for (const a of agents) agentById.set(a.id, a);

  for (const node of normalized.nodes) {
    const a = agentById.get(node.agentId);
    if (!a) throw new Error(`Unknown agentId in workflow: ${node.agentId}`);
    if (!a.enabled) throw new Error(`Agent disabled in workflow: ${node.agentId}`);
  }

  const { order, incoming, outgoing } = computeWorkflowTopo(normalized);

  const summary = initTokenSummary();
  const trace: ReasoningTraceEntry[] = [];
  const outputsByNodeId = new Map<string, { agentId: string; label?: string; content: string }>();

  for (let step = 0; step < order.length; step++) {
    if (opts?.shouldCancel?.()) break;

    const nodeId = order[step];
    const node = normalized.nodes.find((n) => n.id === nodeId)!;
    const agent = agentById.get(node.agentId)!;

    const upstreamIds = incoming.get(nodeId) || [];
    const upstreamText = upstreamIds
      .map((srcId) => {
        const prev = outputsByNodeId.get(srcId);
        if (!prev) return null;
        const prevAgent = agentById.get(prev.agentId);
        const title = prev.label || prevAgent?.name || prev.agentId;
        return `From ${title} (${prev.agentId}):\n${prev.content}`;
      })
      .filter(Boolean)
      .join("\n\n");

    const hasDownstream = (outgoing.get(nodeId) || []).length > 0;
    const userContent =
      `Question:\n${question}\n\n` +
      (upstreamText ? `Upstream outputs:\n${upstreamText}\n\n` : "") +
      (hasDownstream
        ? `Produce your best intermediate output for the next agent(s). Keep it structured.\n`
        : `Produce the final answer.\n`);

    const provider = agent.provider || selectProvider(config);
    const model = agent.model;
    const rate = config.provider_rates[provider] || config.provider_rates.default || { input: 0, output: 0, reasoning: 0 };
    const maxTokens = Math.max(1, Math.min(agent.max_tokens || config.maxTokens, config.maxTokens));

    const response = await chatComplete(
      [
        { role: "system", content: agent.system_prompt },
        { role: "user", content: userContent },
      ],
      model,
      agent.temperature,
      { provider, providerConfig: config.llm_providers?.[provider], maxTokens, signal: opts?.signal, timeoutMs: Number(process.env.LLM_TIMEOUT_MS || "") || undefined }
    );

    addUsage(summary, agent.id, provider, rate, {
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      reasoningTokens: response.reasoningTokens,
    });
    const callCost = response.inputTokens * rate.input + response.outputTokens * rate.output + response.reasoningTokens * rate.reasoning;

    outputsByNodeId.set(nodeId, { agentId: agent.id, label: node.label, content: response.text });

    const entry: ReasoningTraceEntry = {
      iteration: step,
      agentsRan: [agent.id],
      responderOutputs: [
        {
          agent_id: agent.id,
          content: response.text,
          model,
          provider,
          cost: callCost,
          usage: { inputTokens: response.inputTokens, outputTokens: response.outputTokens, reasoningTokens: response.reasoningTokens },
          nodeId,
          nodeLabel: node.label,
          workflowId: normalized.id,
        } as any,
      ],
      criticOutputs: [],
      factChecks: [],
      scores: [],
      metaDecision: ({ type: "workflow", workflowId: normalized.id, workflowName: normalized.name, nodeId, nodeLabel: node.label, agentId: agent.id } as any),
      evidence: [],
    };

    trace.push(entry);
    opts?.onIteration?.(entry);
  }

  const sinks = normalized.nodes
    .map((n) => n.id)
    .filter((id) => ((outgoing.get(id) || []).length === 0));
  const chosenSink = sinks.length ? sinks[sinks.length - 1] : order[order.length - 1];
  const finalOut = outputsByNodeId.get(chosenSink);

  const answer = finalOut?.content || "Unable to answer";
  const confidence = 0.5;
  const justification = `Workflow "${normalized.name}" (${normalized.id}) produced answer from node ${chosenSink}`;

  opts?.onFinal?.({ answer, confidence, justification, tokens: summary });

  const runId = opts?.runId || uuidv4();
  await runs.add({
    id: runId,
    question,
    timestamp: Date.now(),
    finalAnswer: answer,
    confidence,
    metaExplanation: justification,
    iterations: trace.length,
    reasoningTrace: trace,
    tokens: summary,
    agentsUsed: Array.from(new Set(trace.flatMap((t) => t.agentsRan))),
    workflowId: normalized.id,
    workflowName: normalized.name,
    workflow: {
      id: normalized.id,
      name: normalized.name,
      description: normalized.description,
      nodes: normalized.nodes,
      edges: normalized.edges,
    },
  });

  await memory.recordQuestion(question, undefined, true, confidence);

  // Record neutral performance stats (score/severity not available in fixed workflows yet).
  const usedAgents = new Set(trace.flatMap((t) => t.agentsRan));
  for (const agentId of usedAgents) {
    await memory.recordAgentPerformance(agentId, 5, 0, summary.agentUsage?.[agentId]?.cost || 0);
  }

  return { answer, confidence, justification, runId, trace, tokens: summary };
}
