import { Router } from "express";
import { MemoryStore } from "../core/memoryStore";
import { adminGuard } from "../utils/auth";

export function memoryRouter(memoryStore: MemoryStore) {
  const router = Router();

  // Memory endpoints include user questions and internal metrics.
  router.use(adminGuard);

  router.get("/memory/question_history", (req, res) => {
    res.json(memoryStore.getData().question_history);
  });
  router.get("/memory/agent_performance", (req, res) => {
    res.json(memoryStore.getData().agent_performance);
  });
  return router;
}
