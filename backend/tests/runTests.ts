import assert from "assert";
import fs from "fs";
import path from "path";
import { atomicWrite } from "../src/utils/atomicWrite";
import { PromptStore } from "../src/core/promptStore";
import { aggregateScores } from "../src/core/scoring";
import { CandidateResponse, CriticOutput, FactCheckResult, ScoreResult } from "../src/core/types";
import { withFileLock } from "../src/utils/fileLock";

async function testAtomicWrite() {
  const tmp = path.join(__dirname, "tmp.json");
  await atomicWrite(tmp, JSON.stringify({ a: 1 }));
  const data = JSON.parse(fs.readFileSync(tmp, "utf-8"));
  assert.strictEqual(data.a, 1, "atomicWrite should persist data");
  fs.unlinkSync(tmp);
}

async function testFileLockSerializes() {
  const tmp = path.join(__dirname, "tmp-lock.txt");
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

  await Promise.all(
    Array.from({ length: 50 }).map((_, i) =>
      withFileLock(tmp, async () => {
        const prev = fs.existsSync(tmp) ? fs.readFileSync(tmp, "utf-8") : "";
        await atomicWrite(tmp, prev + `${i}\n`);
      })
    )
  );

  const lines = fs
    .readFileSync(tmp, "utf-8")
    .split("\n")
    .filter(Boolean);

  assert.strictEqual(lines.length, 50, "withFileLock should prevent lost updates");
  fs.unlinkSync(tmp);
}

async function testPromptStore() {
  const store = new PromptStore();
  const version = await store.add("agent-test", "hello", "admin");
  const latest = store.latest("agent-test");
  assert(latest && latest.versionId === version.versionId, "latest prompt should match added");
}

function testScoring() {
  const candidates: CandidateResponse[] = [
    { agent_id: "a1", content: "answer", model: "m", provider: "p", cost: 1, usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } },
  ];
  const critics: CriticOutput[] = [{ agent_id: "c1", content: "bad", severity: 1 }];
  const facts: FactCheckResult[] = [{ agent_id: "fc", unsupportedClaims: [], confidence: 1 }];
  const scores: ScoreResult[] = [{ candidateId: "a1", score: 5 }];
  const result = aggregateScores(candidates, critics, facts, scores)[0];
  assert(result.finalScore > 0, "score should be positive");
}

(async () => {
  await testAtomicWrite();
  await testFileLockSerializes();
  await testPromptStore();
  testScoring();
  console.log("All tests passed");
})();