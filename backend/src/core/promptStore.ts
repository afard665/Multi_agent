import fs from "fs";
import path from "path";
import { PromptVersion } from "./types";
import { atomicWrite } from "../utils/atomicWrite";
import { withFileLock } from "../utils/fileLock";
import { v4 as uuidv4 } from "uuid";

const promptPath = process.env.PROMPT_STORE_PATH || path.join(__dirname, "../../memory/prompt-store.json");

export class PromptStore {
  private versions: PromptVersion[];
  constructor() {
    this.versions = this.load();
  }

  private load(): PromptVersion[] {
    try {
      const raw = fs.readFileSync(promptPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private async persist() {
    await withFileLock(promptPath, async () => {
      await atomicWrite(promptPath, JSON.stringify(this.versions, null, 2));
    });
  }

  list(agentId: string) {
    return this.versions.filter((v) => v.agentId === agentId);
  }

  latest(agentId: string): PromptVersion | undefined {
    const list = this.list(agentId);
    return list.sort((a, b) => b.createdAt - a.createdAt)[0];
  }

  async add(agentId: string, system_prompt: string, createdBy: "meta" | "admin", note?: string) {
    const version: PromptVersion = {
      agentId,
      versionId: uuidv4(),
      system_prompt,
      createdAt: Date.now(),
      createdBy,
      note,
    };
    this.versions.push(version);
    await this.persist();
    return version;
  }

  async rollback(agentId: string, versionId: string) {
    const version = this.versions.find((v) => v.agentId === agentId && v.versionId === versionId);
    if (!version) throw new Error("Version not found");
    await this.add(agentId, version.system_prompt, "admin", "rollback");
    return version;
  }

  async removeAgent(agentId: string) {
    const before = this.versions.length;
    this.versions = this.versions.filter((v) => v.agentId !== agentId);
    if (this.versions.length !== before) {
      await this.persist();
    }
  }
}
