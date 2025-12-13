export interface Candidate {
  id: string;
  content?: string;
}

export interface CandidateScore {
  id: string;
  score: number;
}

type ParsedCandidateScores = number[] | null;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toNumericScore(value: unknown): number | null {
  if (isFiniteNumber(value)) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.endsWith("%")) {
      const percentageValue = Number(trimmed.slice(0, -1));
      return Number.isFinite(percentageValue) ? percentageValue / 100 : null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalise(scores: number[]): number[] {
  const clipped = scores.map((score) => (isFiniteNumber(score) ? Math.max(score, 0) : 0));
  const sum = clipped.reduce((acc, value) => acc + value, 0);

  if (sum === 0) {
    return clipped.map(() => 1 / clipped.length);
  }

  return clipped.map((score) => score / sum);
}

function normaliseByCandidates(candidateIds: string[], rawScores: Map<string, number>): number[] {
  const scores: number[] = [];

  for (let idx = 0; idx < candidateIds.length; idx += 1) {
    const id = candidateIds[idx];
    const score = rawScores.get(id) ?? rawScores.get(String(idx + 1));
    scores.push(score ?? 0);
  }

  return normalise(scores);
}

function parseJsonObject(candidateIds: string[], parsed: unknown): ParsedCandidateScores {
  if (Array.isArray(parsed)) {
    if (parsed.every((value) => toNumericScore(value) !== null) && parsed.length === candidateIds.length) {
      return normalise(parsed.map((value) => toNumericScore(value) ?? 0));
    }

    if (parsed.every((entry) => typeof entry === "object" && entry !== null)) {
      const rawScores = new Map<string, number>();
      for (const entry of parsed as Array<Record<string, unknown>>) {
        const candidate = entry.candidate ?? entry.id ?? entry.name ?? entry.index;
        const score = entry.score ?? entry.value ?? entry.rating;
        const numericScore = toNumericScore(score);

        if (typeof candidate === "string" && numericScore !== null) {
          rawScores.set(candidate, numericScore);
        } else if (isFiniteNumber(candidate) && numericScore !== null) {
          rawScores.set(String(candidate), numericScore);
        }
      }

      if (rawScores.size > 0) {
        return normaliseByCandidates(candidateIds, rawScores);
      }
    }
  }

  if (parsed && typeof parsed === "object") {
    const rawScores = new Map<string, number>();
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const numericScore = toNumericScore(value);
      if (numericScore !== null) {
        rawScores.set(key, numericScore);
      }
    }

    if (rawScores.size > 0) {
      return normaliseByCandidates(candidateIds, rawScores);
    }
  }

  return null;
}

function parseLineByLine(candidateIds: string[], response: string): ParsedCandidateScores {
  const rawScores = new Map<string, number>();
  const linePattern = /candidate\s*(?<id>[\w-]+)[^\d%\r\n]*?(?<score>[-+]?(?:\d+\.?\d*|\.\d+)(?:%|(?:[eE][-+]?\d+)?))/i;

  for (const line of response.split(/\r?\n/)) {
    const match = line.match(linePattern);
    if (!match || !match.groups) continue;

    const id = match.groups.id;
    const score = toNumericScore(match.groups.score);
    if (score !== null) {
      rawScores.set(id, score);
    }
  }

  if (rawScores.size > 0) {
    return normaliseByCandidates(candidateIds, rawScores);
  }

  return null;
}

function parseEmbeddedJson(candidateIds: string[], response: string): ParsedCandidateScores {
  const fencedMatch = response.match(/```json\s*([\s\S]*?)\s*```/i);
  const braceMatch = response.match(/\{[\s\S]*\}/);
  const jsonSource = fencedMatch?.[1] ?? braceMatch?.[0];
  if (!jsonSource) return null;

  try {
    const parsed = JSON.parse(jsonSource);
    return parseJsonObject(candidateIds, parsed);
  } catch (error) {
    return null;
  }
}

export function parseCandidateScores(response: string, candidates: Candidate[]): CandidateScore[] {
  const candidateIds = candidates.map((candidate, index) => candidate.id ?? String(index + 1));

  const parsers: Array<() => ParsedCandidateScores> = [
    () => parseEmbeddedJson(candidateIds, response),
    () => {
      try {
        return parseJsonObject(candidateIds, JSON.parse(response));
      } catch (error) {
        return null;
      }
    },
    () => parseLineByLine(candidateIds, response),
  ];

  for (const parser of parsers) {
    const result = parser();
    if (result && result.length === candidateIds.length) {
      return candidateIds.map((id, index) => ({ id, score: result[index] }));
    }
  }

  // Fallback to uniform scoring when parsing fails
  const fallbackScore = candidates.length > 0 ? 1 / candidates.length : 0;
  return candidateIds.map((id) => ({ id, score: fallbackScore }));
}

export function scoreCandidates(agentResponse: string, candidates: Candidate[]): CandidateScore[] {
  return parseCandidateScores(agentResponse, candidates);
}
