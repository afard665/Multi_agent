import fs from "fs";
import path from "path";
import { DocumentRecord, EvidenceItem } from "./types";

const docsPath = path.join(__dirname, "../../memory/docs.json");

function loadDocs(): DocumentRecord[] {
  try {
    const raw = fs.readFileSync(docsPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function retrieveEvidence(query: string, limit = 3): EvidenceItem[] {
  const docs = loadDocs();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = docs
    .map((d) => {
      const score = terms.reduce((acc, t) => (d.text.toLowerCase().includes(t) ? acc + 1 : acc), 0);
      return { doc: d, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter((d) => d.score > 0);
  return scored.map(({ doc }) => ({
    docId: doc.docId,
    title: doc.title,
    excerpt: doc.text.slice(0, 200),
  }));
}
