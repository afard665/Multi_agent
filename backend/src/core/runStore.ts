import fs from "fs";
import path from "path";
import { RunRecord } from "./types";
import { atomicWrite } from "../utils/atomicWrite";
import { withFileLock } from "../utils/fileLock";

const runsPath = path.join(__dirname, "../../logs/runs.jsonl");

export class RunStore {
  list(): RunRecord[] {
    if (!fs.existsSync(runsPath)) return [];
    const raw = fs.readFileSync(runsPath, "utf-8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  get(id: string): RunRecord | undefined {
    return this.list().find((r) => r.id === id);
  }

  async add(run: RunRecord) {
    await withFileLock(runsPath, async () => {
      const data = fs.existsSync(runsPath) ? fs.readFileSync(runsPath, "utf-8") : "";
      const newData = data + JSON.stringify(run) + "\n";
      await atomicWrite(runsPath, newData);
    });
  }
}