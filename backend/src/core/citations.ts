import { EvidenceItem } from "./types";

export type Citation = {
  docId: string;
  title: string;
  excerpt: string;
};

export function buildCitations(evidence: EvidenceItem[]): Citation[] {
  // Deduplicate by docId and cap to 5
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const e of evidence) {
    if (seen.has(e.docId)) continue;
    seen.add(e.docId);
    out.push({ docId: e.docId, title: e.title, excerpt: e.excerpt });
    if (out.length >= 5) break;
  }
  return out;
}

export function appendCitationsIfMissing(answer: string, citations: Citation[]): string {
  if (!citations.length) return answer;
  // If the answer already includes a citations section, keep it.
  if (/\b(citations|sources)\b\s*:/i.test(answer)) return answer;

  const lines = citations.map((c) => `- [${c.docId}] ${c.title}: ${c.excerpt}`);
  return `${answer}\n\nSources:\n${lines.join("\n")}`;
}