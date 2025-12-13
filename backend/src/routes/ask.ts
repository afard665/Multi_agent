import { Router } from "express";
import { AgentStore } from "../core/agentStore";
import { ConfigStore } from "../core/configStore";
import { PromptStore } from "../core/promptStore";
import { MemoryStore } from "../core/memoryStore";
import { RunStore } from "../core/runStore";
import { runAskFlow } from "../core/orchestrator";
import { rateLimit } from "../utils/rateLimit";

export function askRouter(agentStore: AgentStore, configStore: ConfigStore, promptStore: PromptStore, memoryStore: MemoryStore, runStore: RunStore) {
  const router = Router();
  router.post("/ask", rateLimit, async (req, res) => {
    const question = req.body?.question;
    if (!question) return res.status(400).json({ error: "question required" });
    try {
      const result = await runAskFlow(question, agentStore.list(), configStore.getConfig(), promptStore, memoryStore, runStore);
      res.json({ finalAnswer: result.answer, confidence: result.confidence, metaExplanation: result.justification, iterations: result.trace.length, reasoningTrace: result.trace, tokens: result.tokens });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "unknown" });
    }
  });
  return router;
}
