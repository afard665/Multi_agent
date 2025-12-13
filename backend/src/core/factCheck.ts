import { EvidenceItem, FactCheckResult } from "./types";

export function performFactCheck(content: string, evidence: EvidenceItem[], agentId = "fact_checker"): FactCheckResult {
  const unsupported: string[] = [];
  const sentences = content.split(/\.\s+/);
  sentences.forEach((s) => {
    const hasSupport = evidence.some((e) => e.excerpt.toLowerCase().includes(s.toLowerCase().split(" ")[0] || ""));
    if (!hasSupport && s.trim().length > 0) unsupported.push(s.trim());
  });
  const confidence = Math.max(0, 1 - unsupported.length * 0.1);
  return { agent_id: agentId, unsupportedClaims: unsupported, confidence };
}
