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

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function buildTfIdf(docs: DocumentRecord[]) {
  const docTokens = docs.map((d) => tokenize(d.text));
  const df: Record<string, number> = {};
  docTokens.forEach((tokens) => {
    new Set(tokens).forEach((t) => {
      df[t] = (df[t] || 0) + 1;
    });
  });
  const idf: Record<string, number> = {};
  Object.keys(df).forEach((t) => {
    idf[t] = Math.log((docs.length + 1) / (df[t] + 1)) + 1;
  });
  return { docTokens, idf };
}

function vectorize(tokens: string[], idf: Record<string, number>) {
  const weights: Record<string, number> = {};
  tokens.forEach((t) => {
    const tf = weights[t] ? weights[t] + 1 : 1;
    weights[t] = tf;
  });
  Object.keys(weights).forEach((t) => {
    weights[t] = weights[t] * (idf[t] || 0);
  });
  return weights;
}

function cosine(a: Record<string, number>, b: Record<string, number>) {
  const terms = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  terms.forEach((t) => {
    const va = a[t] || 0;
    const vb = b[t] || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  });
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function retrieveEvidence(query: string, limit = 3): EvidenceItem[] {
  const docs = loadDocs();
  if (docs.length === 0) return [];
  const { docTokens, idf } = buildTfIdf(docs);
  const queryTokens = tokenize(query);
  const queryVec = vectorize(queryTokens, idf);
  const scored = docs
    .map((d, idx) => {
      const docVec = vectorize(docTokens[idx], idf);
      const score = cosine(queryVec, docVec);
      return { doc: d, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter((d) => d.score > 0.05);
  return scored.map(({ doc }) => ({
    docId: doc.docId,
    title: doc.title,
    excerpt: doc.text.slice(0, 240),
  }));
}
