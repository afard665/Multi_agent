import fs from "fs";
import path from "path";
import readline from "readline";
import { RunRecord } from "./types";
import { atomicWrite } from "../utils/atomicWrite";
import { withFileLock } from "../utils/fileLock";

const runsPath = path.join(__dirname, "../../logs/runs.jsonl");

export class RunStore {
  async list(opts?: { limit?: number }): Promise<RunRecord[]> {
    const limit = typeof opts?.limit === "number" && opts.limit > 0 ? opts.limit : 200;
    if (!fs.existsSync(runsPath)) return [];

    const stream = fs.createReadStream(runsPath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const ring: RunRecord[] = [];
    for await (const line of rl) {
      const trimmed = String(line || "").trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed) as RunRecord;
        ring.push(rec);
        if (ring.length > limit) ring.shift();
      } catch {
        // ignore bad lines
      }
    }

    return ring.reverse(); // newest-first for UI
  }

  async get(id: string): Promise<RunRecord | undefined> {
    if (!fs.existsSync(runsPath)) return undefined;
    const stream = fs.createReadStream(runsPath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = String(line || "").trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed) as RunRecord;
        if (rec.id === id) return rec;
      } catch {
        // ignore
      }
    }
    return undefined;
  }

  async add(run: RunRecord) {
    await withFileLock(runsPath, async () => {
      const data = fs.existsSync(runsPath) ? fs.readFileSync(runsPath, "utf-8") : "";
      const newData = data + JSON.stringify(run) + "\n";
      await atomicWrite(runsPath, newData);
    });
  }
}
