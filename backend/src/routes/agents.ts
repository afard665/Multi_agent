import { Router } from "express";
import { AgentStore } from "../core/agentStore";
import { adminGuard } from "../utils/auth";
import { v4 as uuidv4 } from "uuid";
import { AgentRole } from "../core/types";
import { ensureArray, ensureNumber, ensureString } from "../utils/validate";
import { PromptStore } from "../core/promptStore";

const allowedRoles: AgentRole[] = [
  "responder",
  "critic",
  "opponent",
  "fact_checker",
  "scoring_agent",
  "self_verifier",
  "domain_expert",
];

function isAgentRole(value: any): value is AgentRole {
  return typeof value === "string" && (allowedRoles as string[]).includes(value);
}

export function agentsRouter(agentStore: AgentStore, promptStore: PromptStore) {
  const router = Router();

  // Agents include prompts/providers and are admin-only.
  router.use(adminGuard);

  router.get("/agents", (req, res) => {
    res.json(agentStore.list());
  });

  router.post("/agents", async (req, res) => {
    const body = req.body || {};
    const now = Date.now();
    const agent = {
      id: ensureString(body.id, "") || uuidv4(),
      name: ensureString(body.name, "New Agent"),
      role: (isAgentRole(body.role) ? body.role : "responder") as AgentRole,
      enabled: body.enabled !== false,
      system_prompt: ensureString(body.system_prompt, "You are a helpful assistant."),
      model: ensureString(body.model, "gpt-4o-mini"),
      provider: ensureString(body.provider, ""),
      temperature: Math.max(0, Math.min(2, ensureNumber(body.temperature, 0.7))),
      max_tokens: Math.max(1, ensureNumber(body.max_tokens, 1024)),
      createdAt: now,
      updatedAt: now,
      tags: ensureArray<any>(body.tags, []).filter((t) => typeof t === "string"),
    };
    await agentStore.add(agent);
    // also store an initial prompt version for rollback/diff UX
    await promptStore.add(agent.id, agent.system_prompt, "admin", "initial");
    res.json(agent);
  });

  router.patch("/agents/:id", async (req, res) => {
    try {
      const body = req.body || {};
      const patch: any = {};
      let didChangePrompt = false;
      if (typeof body.name === "string") patch.name = body.name;
      if (isAgentRole(body.role)) patch.role = body.role;
      if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
      if (typeof body.system_prompt === "string") {
        patch.system_prompt = body.system_prompt;
        didChangePrompt = true;
      }
      if (typeof body.model === "string") patch.model = body.model;
      if (typeof body.provider === "string") patch.provider = body.provider;
      if (typeof body.temperature === "number") patch.temperature = Math.max(0, Math.min(2, body.temperature));
      if (typeof body.max_tokens === "number") patch.max_tokens = Math.max(1, body.max_tokens);
      if (Array.isArray(body.tags)) patch.tags = body.tags.filter((t: any) => typeof t === "string");

      const updated = await agentStore.update(req.params.id, patch);
      if (didChangePrompt) {
        await promptStore.add(updated.id, updated.system_prompt, "admin", "edit");
      }
      res.json(updated);
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });

  router.post("/agents/:id/disable", async (req, res) => {
    try {
      const updated = await agentStore.disable(req.params.id);
      res.json(updated);
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });

  router.delete("/agents/:id", async (req, res) => {
    try {
      const removed = await agentStore.remove(req.params.id);
      await promptStore.removeAgent(req.params.id);
      res.json({ ok: true, agent: removed });
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });
  return router;
}
