import { Router } from "express";
import { MemoryStore } from "../core/memoryStore";

export function memoryRouter(memoryStore: MemoryStore) {
  const router = Router();
  router.get("/memory/question_history", (req, res) => {
    res.json(memoryStore.getData().question_history);
  });
  router.get("/memory/agent_performance", (req, res) => {
    res.json(memoryStore.getData().agent_performance);
  });
  return router;
}
