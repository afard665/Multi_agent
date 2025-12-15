import fs from "fs";
import path from "path";
import { Workflow } from "./types";
import { atomicWrite } from "../utils/atomicWrite";
import { withFileLock } from "../utils/fileLock";

const workflowsPath = path.join(__dirname, "../../memory/workflows.json");

export class WorkflowStore {
  private workflows: Workflow[];

  constructor() {
    this.workflows = this.load();
  }

  private load(): Workflow[] {
    try {
      const raw = fs.readFileSync(workflowsPath, "utf-8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Workflow[]) : [];
    } catch {
      return [];
    }
  }

  private async persist() {
    await withFileLock(workflowsPath, async () => {
      await atomicWrite(workflowsPath, JSON.stringify(this.workflows, null, 2));
    });
  }

  list() {
    return this.workflows;
  }

  find(id: string) {
    return this.workflows.find((w) => w.id === id);
  }

  async add(workflow: Workflow) {
    this.workflows.push(workflow);
    await this.persist();
    return workflow;
  }

  async update(id: string, patch: Partial<Workflow>) {
    const wf = this.find(id);
    if (!wf) throw new Error("Workflow not found");
    Object.assign(wf, patch, { updatedAt: Date.now() });
    await this.persist();
    return wf;
  }

  async remove(id: string) {
    const idx = this.workflows.findIndex((w) => w.id === id);
    if (idx < 0) throw new Error("Workflow not found");
    this.workflows.splice(idx, 1);
    await this.persist();
  }
}

