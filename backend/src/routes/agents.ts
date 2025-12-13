import { Router } from "express";
import { AgentStore } from "../core/agentStore";
import { adminGuard } from "../utils/auth";
import { v4 as uuidv4 } from "uuid";

export function agentsRouter(agentStore: AgentStore) {
  const router = Router();
  router.get("/agents", (req, res) => {
    res.json(agentStore.list());
  });

  router.post("/agents", adminGuard, async (req, res) => {
    const body = req.body || {};
    const now = Date.now();
    const agent = { ...body, id: body.id || uuidv4(), createdAt: now, updatedAt: now };
    await agentStore.add(agent);
    res.json(agent);
  });

  router.patch("/agents/:id", adminGuard, async (req, res) => {
    try {
      const updated = await agentStore.update(req.params.id, req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });

  router.post("/agents/:id/disable", adminGuard, async (req, res) => {
    try {
      const updated = await agentStore.disable(req.params.id);
      res.json(updated);
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });
  return router;
}
