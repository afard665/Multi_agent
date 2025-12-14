import { Router } from "express";
import { RunStore } from "../core/runStore";
import { AgentStore } from "../core/agentStore";
import { ConfigStore } from "../core/configStore";
import { PromptStore } from "../core/promptStore";
import { MemoryStore } from "../core/memoryStore";
import { runAskFlow } from "../core/orchestrator";

export function logsRouter(runStore: RunStore, agentStore: AgentStore, configStore: ConfigStore, promptStore: PromptStore, memoryStore: MemoryStore) {
  const router = Router();
  router.get("/logs", (req, res) => {
    res.json(runStore.list());
  });
  router.get("/logs/:id", (req, res) => {
    const run = runStore.get(req.params.id);
    if (!run) return res.status(404).json({ error: "not found" });
    res.json(run);
  });
  router.post("/logs/:id/replay", async (req, res) => {
    const run = runStore.get(req.params.id);
    if (!run) return res.status(404).json({ error: "not found" });
    const result = await runAskFlow(run.question, agentStore.list(), configStore.getConfig(), promptStore, memoryStore, runStore, agentStore);
    res.json(result);
  });
  return router;
}