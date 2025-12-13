import { CandidateResponse, CriticOutput, FactCheckResult, ScoreResult } from "./types";

export function computeSeverityForCandidate(candidate: CandidateResponse, criticOutputs: CriticOutput[], candidateIndex: number) {
  return criticOutputs.reduce((acc, c) => {
    const content = c.content.toLowerCase();
    const mentions = content.includes(candidate.agent_id.toLowerCase()) || content.includes(`candidate ${candidateIndex}`);
    const weight = mentions ? 1 : 0.3;
    return acc + c.severity * weight;
  }, 0);
}

export function aggregateScores(
  candidates: CandidateResponse[],
  criticOutputs: CriticOutput[],
  factChecks: FactCheckResult[],
  scores: ScoreResult[]
) {
  return candidates.map((c, idx) => {
    const score = scores.find((s) => s.candidateId === c.agent_id)?.score ?? 0;
    const severity = computeSeverityForCandidate(c, criticOutputs, idx);
    const factConfidence = factChecks.find((f) => f.agent_id === c.agent_id)?.confidence ?? 0;
    const adjusted = score - severity * 0.25 + factConfidence * 2 - c.cost * 0.01;
    return { candidate: c, finalScore: adjusted, rawScore: score, totalSeverity: severity, factConfidence };
  });
}
