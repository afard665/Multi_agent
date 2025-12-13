import { Router } from "express";
import { ConfigStore } from "../core/configStore";
import { adminGuard } from "../utils/auth";

export function configRouter(configStore: ConfigStore) {
  const router = Router();
  router.get("/config", (req, res) => {
    res.json(configStore.getConfig());
  });
  router.patch("/config", adminGuard, async (req, res) => {
    const updated = await configStore.update(req.body || {});
    res.json(updated);
  });
  return router;
}
