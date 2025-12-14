import { Router } from "express";
import { AgentStore } from "../core/agentStore";
import { ConfigStore } from "../core/configStore";
import { PromptStore } from "../core/promptStore";
import { MemoryStore } from "../core/memoryStore";
import { RunStore } from "../core/runStore";
import { runAskFlow } from "../core/orchestrator";
import { rateLimit } from "../utils/rateLimit";
import { LiveTraceHub } from "../ws/liveTraceHub";

export function askRouter(agentStore: AgentStore, configStore: ConfigStore, promptStore: PromptStore, memoryStore: MemoryStore, runStore: RunStore, liveTraceHub?: LiveTraceHub) {
  const router = Router();
  router.post("/ask", rateLimit, async (req, res) => {
    const question = req.body?.question;
    const maxIterations = req.body?.maxIterations;
    const stream = !!req.body?.stream;

    if (!question) return res.status(400).json({error: "question required"});

    try {
      const cfg = configStore.getConfig();
      const runId = require("uuid").v4();
      const wsUrl = process.env.LIVE_TRACE_WS_URL || `ws://${req.headers.host}/ws`;

      const result = await runAskFlow(
        question,
        agentStore.list(),
        {
          ...cfg,
          maxIterations: typeof maxIterations === "number" ? Math.max(1, Math.min(maxIterations, cfg.maxIterations)) : cfg.maxIterations,
        },
        promptStore,
        memoryStore,
        runStore,
        agentStore,
        liveTraceHub
          ? {
              runId,
              onIteration: (entry) => liveTraceHub.publish(runId, "iteration", entry),
              onFinal: (payload) => liveTraceHub.publish(runId, "final", payload),
            }
          : undefined
      );

      res.json({
        finalAnswer: result.answer,
        confidence: result.confidence,
        metaExplanation: result.justification,
        iterations: result.trace.length,
        reasoningTrace: result.trace,
        tokens: result.tokens,
        runId,
        liveTrace: stream ? { wsUrl, runId } : null,
      });
    } catch (e: any) {
      res.status(500).json({error: e.message || "unknown"});
    }
  });
  return router;
}