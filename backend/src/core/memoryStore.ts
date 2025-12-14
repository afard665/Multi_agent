import fs from "fs";
import path from "path";
import { MemoryStoreShape } from "./types";
import { atomicWrite } from "../utils/atomicWrite";
import { withFileLock } from "../utils/fileLock";

const memoryPath = path.join(__dirname, "../../memory/meta-memory.json");

export class MemoryStore {
  private data: MemoryStoreShape;
  constructor() {
    this.data = this.load();
  }

  private load(): MemoryStoreShape {
    try {
      const raw = fs.readFileSync(memoryPath, "utf-8");
      return JSON.parse(raw);
    } catch (e) {
      return { question_history: [], agent_performance: {}, patterns: { successfulPrompts: [], failures: [] } };
    }
  }

  private async persist() {
    await withFileLock(memoryPath, async () => {
      await atomicWrite(memoryPath, JSON.stringify(this.data, null, 2));
    });
  }

  getData() {
    return this.data;
  }

  async recordQuestion(question: string, category: string | undefined, success: boolean | undefined, confidence: number | undefined) {
    this.data.question_history.push({ question, timestamp: Date.now(), category, success, confidence });
    if (this.data.question_history.length > 500) this.data.question_history.shift();
    await this.persist();
  }

  async recordAgentPerformance(agentId: string, score: number, severity: number, cost: number) {
    const perf = this.data.agent_performance[agentId] || {
      runs: 0,
      totalScore: 0,
      totalSeverity: 0,
      totalCost: 0,
      avgScore: 0,
      avgSeverity: 0,
      avgCost: 0,
    };
    perf.runs += 1;
    perf.totalScore += score;
    perf.totalSeverity += severity;
    perf.totalCost += cost;
    perf.avgScore = perf.totalScore / perf.runs;
    perf.avgSeverity = perf.totalSeverity / perf.runs;
    perf.avgCost = perf.totalCost / perf.runs;
    this.data.agent_performance[agentId] = perf;
    await this.persist();
  }
}