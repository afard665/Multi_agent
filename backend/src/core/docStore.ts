import fs from "fs";
import path from "path";
import { atomicWrite } from "../utils/atomicWrite";
import { withFileLock } from "../utils/fileLock";
import { DocumentRecord } from "./types";

const docsPath = path.join(__dirname, "../../memory/docs.json");

export class DocStore {
  private docs: DocumentRecord[];

  constructor() {
    this.docs = this.load();
  }

  private load(): DocumentRecord[] {
    try {
      const raw = fs.readFileSync(docsPath, "utf-8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as DocumentRecord[]) : [];
    } catch {
      return [];
    }
  }

  private async persist() {
    await withFileLock(docsPath, async () => {
      await atomicWrite(docsPath, JSON.stringify(this.docs, null, 2));
    });
  }

  list(): DocumentRecord[] {
    return this.docs.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  get(docId: string): DocumentRecord | undefined {
    return this.docs.find((d) => d.docId === docId);
  }

  async upsert(doc: DocumentRecord) {
    const now = Date.now();
    const existing = this.get(doc.docId);
    if (existing) {
      Object.assign(existing, doc, { updatedAt: now });
    } else {
      this.docs.push({ ...doc, updatedAt: now });
    }
    await this.persist();
    return this.get(doc.docId)!;
  }

  async delete(docId: string) {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => d.docId !== docId);
    if (this.docs.length === before) return false;
    await this.persist();
    return true;
  }
}

