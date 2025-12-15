import { Router } from "express";
import { RunStore } from "../core/runStore";
import { AgentStore } from "../core/agentStore";
import { ConfigStore } from "../core/configStore";
import { PromptStore } from "../core/promptStore";
import { MemoryStore } from "../core/memoryStore";
import { runAskFlow } from "../core/orchestrator";
import { runWorkflowFlow } from "../core/workflowRunner";
import { adminGuard } from "../utils/auth";
import { rateLimit } from "../utils/rateLimit";

export function logsRouter(runStore: RunStore, agentStore: AgentStore, configStore: ConfigStore, promptStore: PromptStore, memoryStore: MemoryStore) {
  const router = Router();

  // logs and replay may contain sensitive data and can trigger provider spend
  router.use(adminGuard);

  router.get("/logs", async (req, res) => {
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, limitRaw)) : 200;
    res.json(await runStore.list({ limit }));
  });
  router.get("/logs/:id", async (req, res) => {
    const run = await runStore.get(req.params.id);
    if (!run) return res.status(404).json({ error: "not found" });
    res.json(run);
  });
  router.post("/logs/:id/replay", rateLimit, async (req, res) => {
    const run = await runStore.get(req.params.id);
    if (!run) return res.status(404).json({ error: "not found" });
    const result =
      run.workflow && Array.isArray((run.workflow as any).nodes) && (run.workflow as any).nodes.length
        ? await runWorkflowFlow(run.question, run.workflow as any, agentStore.list(), configStore.getConfig(), memoryStore, runStore)
        : await runAskFlow(run.question, agentStore.list(), configStore.getConfig(), promptStore, memoryStore, runStore, agentStore);
    res.json(result);
  });
  return router;
}
