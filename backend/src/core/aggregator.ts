import { aggregateScores } from "./scoring";
import { CandidateResponse, CriticOutput, FactCheckResult, ScoreResult } from "./types";

export function chooseFinalAnswer(
  candidates: CandidateResponse[],
  criticOutputs: CriticOutput[],
  factChecks: FactCheckResult[],
  scores: ScoreResult[]
) {
  const aggregated = aggregateScores(candidates, criticOutputs, factChecks, scores).sort((a, b) => b.finalScore - a.finalScore);
  const top = aggregated[0];
  return {
    answer: top?.candidate.content || "Unable to answer",
    confidence: Math.max(0, Math.min(1, (top?.finalScore || 0) / 10)),
    justification: `Selected candidate from ${top?.candidate.agent_id || "n/a"} with adjusted score ${top?.finalScore.toFixed(2)}`,
  };
}
