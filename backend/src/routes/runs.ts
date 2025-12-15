import { Router } from "express";
import { cancelRun } from "../core/runControl";

export function runsRouter() {
  const router = Router();

  router.post("/runs/:id/cancel", (req, res) => {
    const runId = req.params.id;
    const cancelToken = String(req.body?.cancelToken || "");
    if (!cancelToken) return res.status(400).json({ error: "cancelToken required" });
    const ok = cancelRun(runId, cancelToken);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  });

  return router;
}

