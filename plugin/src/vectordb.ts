/**
 * F2: Local vector database for literature retrieval.
 *
 * Uses a simple in-memory TF-IDF approach with JSON persistence.
 * Can be swapped for LanceDB or Qdrant when scale demands it.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiteratureRecord {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  year: number;
  bibtex: string;
  source_url: string;
  ingested_at: number;
  /** TF-IDF term vector — computed on ingest */
  _terms: Record<string, number>;
}

export interface VectorDB {
  records: Record<string, LiteratureRecord>;
  /** Inverse document frequency table */
  idf: Record<string, number>;
  doc_count: number;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const DB_DIR =
  process.env["U2E_STATE_DIR"] ??
  join(process.env["HOME"] ?? "~", ".openclaw", "u2e-state");

function dbPath(): string {
  return join(DB_DIR, "literature.json");
}

let _db: VectorDB | null = null;

function loadDB(): VectorDB {
  if (_db) return _db;
  const p = dbPath();
  if (existsSync(p)) {
    _db = JSON.parse(readFileSync(p, "utf-8")) as VectorDB;
  } else {
    _db = { records: {}, idf: {}, doc_count: 0 };
  }
  return _db;
}

function saveDB(): void {
  if (!_db) return;
  const p = dbPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(_db, null, 2));
}

// ---------------------------------------------------------------------------
// Tokenization & TF-IDF
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "can", "could", "of", "in", "to", "for",
  "with", "on", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "and", "but", "or", "not", "no", "this", "that",
  "it", "its", "we", "our", "they", "their", "which", "what", "who",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function termFrequency(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
  const max = Math.max(1, ...Object.values(tf));
  for (const t of Object.keys(tf)) tf[t] /= max;
  return tf;
}

function rebuildIDF(db: VectorDB): void {
  const df: Record<string, number> = {};
  for (const rec of Object.values(db.records)) {
    for (const term of Object.keys(rec._terms)) {
      df[term] = (df[term] ?? 0) + 1;
    }
  }
  const N = Math.max(1, db.doc_count);
  db.idf = {};
  for (const [term, count] of Object.entries(df)) {
    db.idf[term] = Math.log(N / count);
  }
}

function tfidfVector(tf: Record<string, number>, idf: Record<string, number>): Record<string, number> {
  const vec: Record<string, number> = {};
  for (const [term, freq] of Object.entries(tf)) {
    vec[term] = freq * (idf[term] ?? Math.log(10));
  }
  return vec;
}

function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0, normA = 0, normB = 0;
  for (const [k, v] of Object.entries(a)) {
    normA += v * v;
    if (k in b) dot += v * b[k];
  }
  for (const v of Object.values(b)) normB += v * v;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function ingestLiterature(record: Omit<LiteratureRecord, "_terms" | "ingested_at">): LiteratureRecord {
  const db = loadDB();

  // Dedup by id
  if (record.id in db.records) return db.records[record.id];

  const text = `${record.title} ${record.abstract} ${record.authors.join(" ")}`;
  const tokens = tokenize(text);
  const tf = termFrequency(tokens);

  const full: LiteratureRecord = {
    ...record,
    ingested_at: Date.now(),
    _terms: tf,
  };

  db.records[record.id] = full;
  db.doc_count++;
  rebuildIDF(db);
  saveDB();
  return full;
}

export function searchLiterature(query: string, topK: number = 5): { record: LiteratureRecord; score: number }[] {
  const db = loadDB();
  if (db.doc_count === 0) return [];

  const tokens = tokenize(query);
  const tf = termFrequency(tokens);
  const queryVec = tfidfVector(tf, db.idf);

  const scored: { record: LiteratureRecord; score: number }[] = [];
  for (const rec of Object.values(db.records)) {
    const docVec = tfidfVector(rec._terms, db.idf);
    const score = cosineSimilarity(queryVec, docVec);
    if (score > 0.01) scored.push({ record: rec, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export function getLiteratureCount(): number {
  return loadDB().doc_count;
}

export function getLiteratureById(id: string): LiteratureRecord | null {
  const db = loadDB();
  return db.records[id] ?? null;
}

export function getAllLiterature(): LiteratureRecord[] {
  return Object.values(loadDB().records);
}
