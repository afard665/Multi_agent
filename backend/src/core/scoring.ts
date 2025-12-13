import { CandidateResponse, CriticOutput, FactCheckResult, ScoreResult } from "./types";

export function aggregateScores(candidates: CandidateResponse[], criticOutputs: CriticOutput[], factChecks: FactCheckResult[], scores: ScoreResult[]) {
  return candidates.map((c) => {
    const score = scores.find((s) => s.candidateId === c.agent_id)?.score ?? 0;
    const severity = criticOutputs.filter((co) => co.agent_id !== c.agent_id).reduce((acc, cur) => acc + cur.severity, 0);
    const factConfidence = factChecks.reduce((acc, f) => acc + f.confidence, 0) / (factChecks.length || 1);
    const adjusted = score - severity * 0.2 + factConfidence * 2 - c.cost * 0.01;
    return { candidate: c, finalScore: adjusted, rawScore: score, totalSeverity: severity, factConfidence };
  });
}
