import { CandidateResponse, CriticOutput, FactCheckResult, ScoreResult } from "./types";

export function aggregateScores(candidates: CandidateResponse[], criticOutputs: CriticOutput[], factChecks: FactCheckResult[], scores: ScoreResult[]) {
  return candidates.map((c) => {
    const score = scores.find((s) => s.candidateId === c.agent_id)?.score ?? 0;
    const candidateCritiques = criticOutputs.filter((co) => co.candidateId === c.agent_id);
    const avgSeverity =
      candidateCritiques.reduce((acc, cur) => acc + cur.severity, 0) / (candidateCritiques.length || 1);

    const candidateFact = factChecks.find((f) => f.agent_id === c.agent_id);
    const fallbackFactConfidence = factChecks.reduce((acc, f) => acc + f.confidence, 0) / (factChecks.length || 1);
    const factConfidence = candidateFact?.confidence ?? fallbackFactConfidence;

    const adjusted = score - avgSeverity * 0.5 + factConfidence * 2 - c.cost * 0.01;
    return { candidate: c, finalScore: adjusted, rawScore: score, avgSeverity, factConfidence };
  });
}
