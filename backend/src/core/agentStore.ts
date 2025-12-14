import fs from "fs";
import path from "path";
import { AgentConfig } from "./types";
import { atomicWrite } from "../utils/atomicWrite";
import { withFileLock } from "../utils/fileLock";

const agentsPath = path.join(__dirname, "../../memory/agents.json");

export class AgentStore {
  private agents: AgentConfig[];
  constructor() {
    this.agents = this.load();
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
}