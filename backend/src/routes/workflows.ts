import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { WorkflowStore } from "../core/workflowStore";
import { adminGuard, isBasicAuthAdmin } from "../utils/auth";
import { ensureArray, ensureNumber, ensureString } from "../utils/validate";
import { computeWorkflowTopo } from "../core/workflowGraph";
import { AgentStore } from "../core/agentStore";
import { WorkflowSnapshot } from "../core/types";
import { rateLimit } from "../utils/rateLimit";
import { suggestWorkflowForQuestion } from "../core/workflowRunner";
import { ConfigStore } from "../core/configStore";
import { PromptStore } from "../core/promptStore";

function guardAskKeyIfConfigured(req: any, res: any): boolean {
  const askKey = (process.env.ASK_API_KEY || "").trim();
  if (!askKey) return true;
  const provided = String(req.header("x-ask-key") || "");
  if (provided === askKey || isBasicAuthAdmin(req)) return true;
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

function validateSnapshot(snapshot: WorkflowSnapshot, agentStore: AgentStore) {
  if (!snapshot.name.trim()) throw new Error("name required");

  const nodeIds = new Set<string>();
  for (const n of snapshot.nodes) {
    if (!n.id) throw new Error("node.id required");
    if (nodeIds.has(n.id)) throw new Error(`duplicate node id: ${n.id}`);
    nodeIds.add(n.id);
    if (!n.agentId) throw new Error("node.agentId required");
    if (!agentStore.find(n.agentId)) throw new Error(`unknown agentId: ${n.agentId}`);
  }

  for (const e of snapshot.edges) {
    if (!e.from || !e.to) throw new Error("edge.from and edge.to required");
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) throw new Error(`edge references missing node: ${e.from} -> ${e.to}`);
    if (e.from === e.to) throw new Error("self-loop edges are not allowed");
  }

  computeWorkflowTopo(snapshot);
}

function sanitizeWorkflowBody(body: any, agentStore: AgentStore): WorkflowSnapshot {
  const name = ensureString(body?.name, "").trim();
  const description = ensureString(body?.description, "").trim() || undefined;

  const nodesIn = ensureArray<any>(body?.nodes, []);
  const edgesIn = ensureArray<any>(body?.edges, []);
  const tagsIn = ensureArray<any>(body?.tags, []);

  const seenNodeIds = new Set<string>();
  const nodes: WorkflowSnapshot["nodes"] = nodesIn
    .map((n) => {
      const id = ensureString(n?.id, "").trim() || uuidv4();
      if (seenNodeIds.has(id)) return null;
      seenNodeIds.add(id);
      const agentId = ensureString(n?.agentId, "").trim();
      const label = ensureString(n?.label, "").trim() || undefined;
      const x = ensureNumber(n?.x, 0);
      const y = ensureNumber(n?.y, 0);
      return { id, agentId, label, x, y };
    })
    .filter(Boolean) as any;

  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const edges: WorkflowSnapshot["edges"] = edgesIn
    .map((e) => {
      const id = ensureString(e?.id, "").trim() || uuidv4();
      const from = ensureString(e?.from, "").trim();
      const to = ensureString(e?.to, "").trim();
      if (!from || !to) return null;
      if (!nodeIdSet.has(from) || !nodeIdSet.has(to)) return null;
      if (from === to) return null;
      return { id, from, to };
    })
    .filter(Boolean) as any;

  const tags = Array.from(
    new Set(
      tagsIn
        .filter((t) => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20)
    )
  );

  const aiDesignRaw = body?.aiDesign;
  const aiDesign =
    aiDesignRaw && typeof aiDesignRaw === "object"
      ? {
          source: ensureString(aiDesignRaw?.source, "").trim() === "ask_page" ? "ask_page" : undefined,
          question: ensureString(aiDesignRaw?.question, "").trim(),
          provider: ensureString(aiDesignRaw?.provider, "").trim(),
          model: ensureString(aiDesignRaw?.model, "").trim(),
          messages: ensureArray<any>(aiDesignRaw?.messages, [])
            .slice(0, 10)
            .map((m) => ({
              role: ensureString(m?.role, "").trim() === "system" ? "system" : "user",
              content: ensureString(m?.content, "").trim(),
            }))
            .filter((m) => m.content),
          responseText: ensureString(aiDesignRaw?.responseText, "").trim(),
          createdAt: ensureNumber(aiDesignRaw?.createdAt, 0) || Date.now(),
        }
      : undefined;

  const normalizedAiDesign =
    aiDesign?.source && aiDesign.question && aiDesign.provider && aiDesign.model && aiDesign.messages?.length && aiDesign.responseText
      ? (aiDesign as any)
      : undefined;

  return { id: ensureString(body?.id, "").trim() || uuidv4(), name, description, nodes, edges, tags, aiDesign: normalizedAiDesign };
}

export function workflowsRouter(workflowStore: WorkflowStore, agentStore: AgentStore, configStore: ConfigStore, promptStore: PromptStore) {
  const router = Router();

  const conditionalAdminGuard = (req: any, res: any, next: any) => {
    if (req.body?.allowCreateAgents === true) return adminGuard(req, res, next);
    return next();
  };

  router.get("/workflows", (req, res) => {
    if (!guardAskKeyIfConfigured(req, res)) return;
    res.json(workflowStore.list());
  });

  router.get("/workflows/:id", (req, res) => {
    if (!guardAskKeyIfConfigured(req, res)) return;
    const wf = workflowStore.find(req.params.id);
    if (!wf) return res.status(404).json({ error: "not found" });
    res.json(wf);
  });

  router.post("/workflows/suggest", rateLimit, conditionalAdminGuard, async (req, res) => {
    if (!guardAskKeyIfConfigured(req, res)) return;
    const question = ensureString(req.body?.question, "").trim();
    if (!question) return res.status(400).json({ error: "question required" });

    const allowCreateAgents = req.body?.allowCreateAgents === true;
    const { workflow, createAgents, aiDesign } = await suggestWorkflowForQuestion(question, agentStore.list(), configStore.getConfig(), {
      allowCreateAgents,
    });

    const createdAgents: { id: string; name: string; role: string }[] = [];
    if (allowCreateAgents && createAgents.length) {
      // NOTE: conditionalAdminGuard ensures this is admin-only.
      for (const a of createAgents) {
        if (agentStore.find(a.id)) continue;
        await agentStore.add(a);
        // store initial prompt version for audit/rollback UX
        await promptStore.add(a.id, a.system_prompt, "meta", "ai workflow suggest");
        createdAgents.push({ id: a.id, name: a.name, role: a.role });
      }
    }

    res.json({ ...workflow, createdAgents, aiDesign: aiDesign || (workflow as any).aiDesign });
  });

  // create/update/delete are admin-only
  router.post("/workflows", adminGuard, async (req, res) => {
    try {
      const snapshot = sanitizeWorkflowBody(req.body || {}, agentStore);
      validateSnapshot(snapshot, agentStore);
      const now = Date.now();
      const created = await workflowStore.add({
        ...snapshot,
        createdAt: now,
        updatedAt: now,
      });
      res.json(created);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "invalid workflow" });
    }
  });

  router.patch("/workflows/:id", adminGuard, async (req, res) => {
    try {
      const existing = workflowStore.find(req.params.id);
      if (!existing) return res.status(404).json({ error: "not found" });

      const snapshot = sanitizeWorkflowBody({ ...existing, ...(req.body || {}), id: existing.id }, agentStore);
      validateSnapshot(snapshot, agentStore);

      const updated = await workflowStore.update(existing.id, {
        name: snapshot.name,
        description: snapshot.description,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
      } as any);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "invalid workflow" });
    }
  });

  router.delete("/workflows/:id", adminGuard, async (req, res) => {
    try {
      await workflowStore.remove(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(404).json({ error: e?.message || "not found" });
    }
  });

  return router;
}
