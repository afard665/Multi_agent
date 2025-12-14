import { aggregateScores } from "./scoring";
import { CandidateResponse, CriticOutput, EvidenceItem, FactCheckResult, ScoreResult } from "./types";

export function chooseFinalAnswer(
  candidates: CandidateResponse[],
  criticOutputs: CriticOutput[],
  factChecks: FactCheckResult[],
  scores: ScoreResult[],
  evidence: EvidenceItem[] = []
) {
  const aggregated = aggregateScores(candidates, criticOutputs, factChecks, scores).sort((a, b) => b.finalScore - a.finalScore);
  const top = aggregated[0];
  const sources = evidence.map((e) => `${e.title}#${e.docId}`).join(", ");
  const answerWithSources = sources && top?.candidate.content ? `${top.candidate.content}\n\nSources: ${sources}` : top?.candidate.content;
  return {
    answer: answerWithSources || "Unable to answer",
    confidence: Math.max(0, Math.min(1, (top?.finalScore || 0) / 10)),
    justification: `Selected candidate from ${top?.candidate.agent_id || "n/a"} with adjusted score ${top?.finalScore.toFixed(2)} and evidence ${sources || "none"}`,
  };
}
