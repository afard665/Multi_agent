export interface Candidate {
  id: string;
  content?: string;
}

export interface CandidateScore {
  id: string;
  score: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

function parseJsonObject(candidateIds: string[], parsed: unknown): number[] | null {
  if (Array.isArray(parsed)) {
    if (parsed.every((value) => isFiniteNumber(value)) && parsed.length === candidateIds.length) {
      return normalise(parsed as number[]);
    }

    if (parsed.every((entry) => typeof entry === "object" && entry !== null)) {
      const rawScores = new Map<string, number>();
      for (const entry of parsed as Array<Record<string, unknown>>) {
        const candidate = entry.candidate ?? entry.id ?? entry.name ?? entry.index;
        const score = entry.score ?? entry.value ?? entry.rating;
        if (typeof candidate === "string" && isFiniteNumber(score)) {
          rawScores.set(candidate, score);
        } else if (isFiniteNumber(candidate) && isFiniteNumber(score)) {
          rawScores.set(String(candidate), score);
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
      if (isFiniteNumber(value)) {
        rawScores.set(key, value);
      }
    }

    if (rawScores.size > 0) {
      return normaliseByCandidates(candidateIds, rawScores);
    }
  }

  return null;
}

function parseLineByLine(candidateIds: string[], response: string): number[] | null {
  const rawScores = new Map<string, number>();
  const linePattern = /candidate\s*(?<id>[\w-]+)\s*[:|-]\s*(?<score>[-+]?(?:\d+\.?\d*|\.\d+))/i;

  for (const line of response.split(/\r?\n/)) {
    const match = line.match(linePattern);
    if (!match || !match.groups) continue;

    const id = match.groups.id;
    const score = Number(match.groups.score);
    if (Number.isFinite(score)) {
      rawScores.set(id, score);
    }
  }

  if (rawScores.size > 0) {
    return normaliseByCandidates(candidateIds, rawScores);
  }

  return null;
}

function parseEmbeddedJson(candidateIds: string[], response: string): number[] | null {
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/i) || response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
    return parseJsonObject(candidateIds, parsed);
  } catch (error) {
    return null;
  }
}

export function parseCandidateScores(response: string, candidates: Candidate[]): CandidateScore[] {
  const candidateIds = candidates.map((candidate, index) => candidate.id ?? String(index + 1));

  const parsers: Array<() => number[] | null> = [
    () => parseEmbeddedJson(candidateIds, response),
    () => parseJsonObject(candidateIds, (() => { try { return JSON.parse(response); } catch (error) { return null; } })()),
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
