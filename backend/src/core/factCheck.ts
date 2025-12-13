import { EvidenceItem, FactCheckResult } from "./types";

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function overlapScore(claimTokens: string[], evidenceTokens: string[]) {
  const claimSet = new Set(claimTokens);
  const shared = evidenceTokens.filter((t) => claimSet.has(t)).length;
  return shared / Math.max(1, claimTokens.length);
}

export function performFactCheck(content: string, evidence: EvidenceItem[], agentId = "fact_checker"): FactCheckResult {
  const unsupported: string[] = [];
  const sentences = content.split(/(?<=[.!?])\s+/);
  const evidenceTokens = evidence.map((e) => tokenize(e.excerpt));

  const supportScores = sentences.map((s) => {
    const claimTokens = tokenize(s);
    const best = evidenceTokens.reduce((acc, tokens) => Math.max(acc, overlapScore(claimTokens, tokens)), 0);
    if (best < 0.25 && s.trim()) unsupported.push(s.trim());
    return best;
  });

  const avgSupport = supportScores.length ? supportScores.reduce((a, b) => a + b, 0) / supportScores.length : 0;
  const confidence = Math.min(1, Math.max(0.1, avgSupport + 0.2));
  return { agent_id: agentId, unsupportedClaims: unsupported, confidence };
}
