import { Router } from "express";
import { adminGuard } from "../utils/auth";
import { DocStore } from "../core/docStore";
import { ensureArray, ensureString } from "../utils/validate";
import { DocumentRecord } from "../core/types";

export function docsRouter(docStore: DocStore) {
  const router = Router();
  router.use(adminGuard);

  router.get("/docs", (_req, res) => {
    res.json(docStore.list());
  });

  router.put("/docs/:docId", async (req, res) => {
    const docId = ensureString(req.params.docId, "").trim();
    if (!docId) return res.status(400).json({ error: "docId required" });

    const body = req.body || {};
    const title = ensureString(body.title, "").trim();
    const text = ensureString(body.text, "").trim();
    const tags = ensureArray<any>(body.tags, []).map((t) => String(t).trim()).filter(Boolean);
    if (!title) return res.status(400).json({ error: "title required" });
    if (!text) return res.status(400).json({ error: "text required" });

    const doc: DocumentRecord = { docId, title, text, tags };
    const saved = await docStore.upsert(doc);
    res.json(saved);
  });

  router.delete("/docs/:docId", async (req, res) => {
    const docId = ensureString(req.params.docId, "").trim();
    if (!docId) return res.status(400).json({ error: "docId required" });
    const ok = await docStore.delete(docId);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  });

  return router;
}

