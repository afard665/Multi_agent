import { Router } from "express";
import { PromptStore } from "../core/promptStore";
import { adminGuard } from "../utils/auth";

export function promptsRouter(promptStore: PromptStore) {
  const router = Router();
  router.get("/prompts/:agentId/versions", (req, res) => {
    res.json(promptStore.list(req.params.agentId));
  });

  router.post("/prompts/:agentId/rollback", adminGuard, async (req, res) => {
    try {
      const version = await promptStore.rollback(req.params.agentId, req.body.versionId);
      res.json(version);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
  return router;
}
