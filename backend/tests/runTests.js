"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const atomicWrite_1 = require("../src/utils/atomicWrite");
const promptStore_1 = require("../src/core/promptStore");
const scoring_1 = require("../src/core/scoring");
async function testAtomicWrite() {
    const tmp = path_1.default.join(__dirname, "tmp.json");
    await (0, atomicWrite_1.atomicWrite)(tmp, JSON.stringify({ a: 1 }));
    const data = JSON.parse(fs_1.default.readFileSync(tmp, "utf-8"));
    assert_1.default.strictEqual(data.a, 1, "atomicWrite should persist data");
    fs_1.default.unlinkSync(tmp);
}
async function testPromptStore() {
    const store = new promptStore_1.PromptStore();
    const version = await store.add("agent-test", "hello", "admin");
    const latest = store.latest("agent-test");
    (0, assert_1.default)(latest && latest.versionId === version.versionId, "latest prompt should match added");
}
function testScoring() {
    const candidates = [
        { agent_id: "a1", content: "answer", model: "m", provider: "p", cost: 1, usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } },
    ];
    const critics = [{ agent_id: "c1", content: "bad", severity: 1 }];
    const facts = [{ agent_id: "fc", unsupportedClaims: [], confidence: 1 }];
    const scores = [{ candidateId: "a1", score: 5 }];
    const result = (0, scoring_1.aggregateScores)(candidates, critics, facts, scores)[0];
    (0, assert_1.default)(result.finalScore > 0, "score should be positive");
}
(async () => {
    await testAtomicWrite();
    await testPromptStore();
    testScoring();
    console.log("All tests passed");
})();
