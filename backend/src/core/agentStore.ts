import fs from "fs";
import path from "path";
import { AgentConfig } from "./types";
import { atomicWrite } from "../utils/atomicWrite";
import { withFileLock } from "../utils/fileLock";

const agentsPath = path.join(__dirname, "../../memory/agents.json");

function defaultAgents(now: number): AgentConfig[] {
  return [
    {
      id: "responder-1",
      name: "General Responder",
      role: "responder",
      enabled: true,
      system_prompt: "You are a helpful responder producing concise answers with citations when possible.",
      model: "gpt-4o-mini",
      provider: "default",
      temperature: 0.6,
      max_tokens: 512,
      createdAt: now,
      updatedAt: now,
      tags: ["default"],
    },
    {
      id: "critic-1",
      name: "Critic",
      role: "critic",
      enabled: true,
      system_prompt: "You critique answers, finding weaknesses and unsupported claims.",
      model: "gpt-4o-mini",
      provider: "default",
      temperature: 0.4,
      max_tokens: 256,
      createdAt: now,
      updatedAt: now,
      tags: ["default"],
    },
    {
      id: "opponent-1",
      name: "Opponent",
      role: "opponent",
      enabled: true,
      system_prompt: "Act as devil's advocate and challenge assumptions.",
      model: "gpt-4o-mini",
      provider: "default",
      temperature: 0.5,
      max_tokens: 256,
      createdAt: now,
      updatedAt: now,
      tags: ["default"],
    },
    {
      id: "score-1",
      name: "Scoring Agent",
      role: "scoring_agent",
      enabled: true,
      system_prompt: "Score candidate answers from 0-10 considering accuracy and critique severity. Return JSON only.",
      model: "gpt-4o-mini",
      provider: "default",
      temperature: 0.2,
      max_tokens: 128,
      createdAt: now,
      updatedAt: now,
      tags: ["default"],
    },
  ];
}

export class AgentStore {
  private agents: AgentConfig[];
  constructor() {
    this.agents = this.load();
    if (!this.agents.length) {
      this.agents = defaultAgents(Date.now());
      // seed runtime file (best-effort)
      void this.persist();
    }
  }

  private load(): AgentConfig[] {
    try {
      const raw = fs.readFileSync(agentsPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private async persist() {
    await withFileLock(agentsPath, async () => {
      await atomicWrite(agentsPath, JSON.stringify(this.agents, null, 2));
    });
  }

  list() {
    return this.agents;
  }

  find(id: string) {
    return this.agents.find((a) => a.id === id);
  }

  async add(agent: AgentConfig) {
    this.agents.push(agent);
    await this.persist();
  }

  async update(id: string, patch: Partial<AgentConfig>) {
    const agent = this.find(id);
    if (!agent) throw new Error("Agent not found");
    Object.assign(agent, patch, { updatedAt: Date.now() });
    await this.persist();
    return agent;
  }

  async disable(id: string) {
    return this.update(id, { enabled: false });
  }

  async remove(id: string) {
    const idx = this.agents.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error("Agent not found");
    const [removed] = this.agents.splice(idx, 1);
    await this.persist();
    return removed;
  }
}
