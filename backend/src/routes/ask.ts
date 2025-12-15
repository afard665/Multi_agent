import { Router } from "express";
import { AgentStore } from "../core/agentStore";
import { ConfigStore } from "../core/configStore";
import { PromptStore } from "../core/promptStore";
import { MemoryStore } from "../core/memoryStore";
import { RunStore } from "../core/runStore";
import { runAskFlow } from "../core/orchestrator";
import { rateLimit } from "../utils/rateLimit";
import { LiveTraceHub } from "../ws/liveTraceHub";
import { attachRunAbort, completeRun, isRunCancelled, registerRun } from "../core/runControl";
import { isBasicAuthAdmin } from "../utils/auth";
import { WorkflowStore } from "../core/workflowStore";
import { runWorkflowFlow } from "../core/workflowRunner";
import { ensureArray, ensureString } from "../utils/validate";
import { WorkflowSnapshot } from "../core/types";

function coerceWorkflowSnapshot(raw: any): WorkflowSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const name = ensureString(raw.name, "").trim();
  const nodes = ensureArray<any>(raw.nodes, []);
  const edges = ensureArray<any>(raw.edges, []);
  if (!name || !nodes.length) return null;
  return {
    id: ensureString(raw.id, "").trim() || require("uuid").v4(),
    name,
    description: ensureString(raw.description, "").trim() || undefined,
    nodes: nodes.map((n) => ({
      id: ensureString(n?.id, "").trim(),
      agentId: ensureString(n?.agentId, "").trim(),
      label: ensureString(n?.label, "").trim() || undefined,
      x: typeof n?.x === "number" ? n.x : Number(n?.x) || 0,
      y: typeof n?.y === "number" ? n.y : Number(n?.y) || 0,
    })),
    edges: edges.map((e) => ({
      id: ensureString(e?.id, "").trim() || require("uuid").v4(),
      from: ensureString(e?.from, "").trim(),
      to: ensureString(e?.to, "").trim(),
    })),
  };
}

export function askRouter(
  agentStore: AgentStore,
  configStore: ConfigStore,
  promptStore: PromptStore,
  memoryStore: MemoryStore,
  runStore: RunStore,
  liveTraceHub?: LiveTraceHub,
  workflowStore?: WorkflowStore
) {
  const router = Router();
  router.post("/ask", rateLimit, async (req, res) => {
    const askKey = (process.env.ASK_API_KEY || "").trim();
    if (askKey) {
      const provided = String(req.header("x-ask-key") || "");
      if (provided !== askKey && !isBasicAuthAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    }

    const question = req.body?.question;
    const maxIterations = req.body?.maxIterations;
    const stream = !!req.body?.stream;
    const workflowId = typeof req.body?.workflowId === "string" ? req.body.workflowId.trim() : "";
    const workflowFromBody = coerceWorkflowSnapshot(req.body?.workflow);

    if (!question) return res.status(400).json({error: "question required"});

    try {
      const cfg = configStore.getConfig();
      const runId = require("uuid").v4();
      const workflowFromStore = workflowId && workflowStore ? workflowStore.find(workflowId) : null;
      if (!workflowFromBody && workflowId && workflowStore && !workflowFromStore) {
        return res.status(404).json({ error: "workflow not found" });
      }
      const selectedWorkflow = workflowFromBody || workflowFromStore;
      const workflowSnapshot: WorkflowSnapshot | null = selectedWorkflow
        ? {
            id: selectedWorkflow.id || workflowId || require("uuid").v4(),
            name: selectedWorkflow.name || "Workflow",
            description: selectedWorkflow.description,
            nodes: ensureArray<any>(selectedWorkflow.nodes, []),
            edges: ensureArray<any>(selectedWorkflow.edges, []),
          }
        : null;
      if (workflowSnapshot && !workflowSnapshot.nodes.length) {
        return res.status(400).json({ error: "workflow has no nodes" });
      }

      const advertisedWsUrl = (() => {
        if (process.env.LIVE_TRACE_WS_URL) return process.env.LIVE_TRACE_WS_URL;
        const proto = (req.header("x-forwarded-proto") || (req.secure ? "https" : "http")).split(",")[0].trim();
        const wsProto = proto === "https" ? "wss" : "ws";
        return `${wsProto}://${req.headers.host}/ws`;
      })();

      const effectiveConfig = {
        ...cfg,
        maxIterations: typeof maxIterations === "number" ? Math.max(1, Math.min(maxIterations, cfg.maxIterations)) : cfg.maxIterations,
      };

      if (stream && liveTraceHub) {
        const cancelToken = registerRun(runId);
        const controller = new AbortController();
        attachRunAbort(runId, () => controller.abort());
        res.json({
          finalAnswer: "",
          confidence: 0,
          metaExplanation: "",
          iterations: 0,
          reasoningTrace: [],
          runId,
          liveTrace: { wsUrl: advertisedWsUrl, runId, cancelToken },
        });

        setImmediate(async () => {
          try {
            if (workflowSnapshot) {
              await runWorkflowFlow(question, workflowSnapshot, agentStore.list(), effectiveConfig, memoryStore, runStore, {
                runId,
                shouldCancel: () => isRunCancelled(runId),
                signal: controller.signal,
                onIteration: (entry) => liveTraceHub.publish(runId, "iteration", entry),
                onFinal: (payload) => liveTraceHub.publish(runId, "final", payload),
              });
            } else {
              await runAskFlow(
                question,
                agentStore.list(),
                effectiveConfig,
                promptStore,
                memoryStore,
                runStore,
                agentStore,
                {
                  runId,
                  shouldCancel: () => isRunCancelled(runId),
                  signal: controller.signal,
                  onIteration: (entry) => liveTraceHub.publish(runId, "iteration", entry),
                  onFinal: (payload) => liveTraceHub.publish(runId, "final", payload),
                }
              );
            }
          } catch (e: any) {
            if (isRunCancelled(runId)) {
              liveTraceHub.publish(runId, "final", {
                answer: "Cancelled",
                confidence: 0,
                justification: "Run cancelled by client",
                tokens: null,
              });
            } else {
              liveTraceHub.publish(runId, "error", { error: e?.message || "unknown" });
            }
          } finally {
            completeRun(runId);
            // Keep a short replay buffer so clients that connect slightly late still receive final/error.
            setTimeout(() => {
              try {
                liveTraceHub.clear(runId);
              } catch {
                // ignore
              }
            }, 60_000);
          }
        });

        return;
      }

      const result = workflowSnapshot
        ? await runWorkflowFlow(question, workflowSnapshot, agentStore.list(), effectiveConfig, memoryStore, runStore, { runId })
        : await runAskFlow(
            question,
            agentStore.list(),
            effectiveConfig,
            promptStore,
            memoryStore,
            runStore,
            agentStore,
            { runId }
          );

      res.json({
        finalAnswer: result.answer,
        confidence: result.confidence,
        metaExplanation: result.justification,
        iterations: result.trace.length,
        reasoningTrace: result.trace,
        tokens: result.tokens,
        runId,
        liveTrace: null,
      });
    } catch (e: any) {
      res.status(500).json({error: e.message || "unknown"});
    }
  });
  return router;
}
