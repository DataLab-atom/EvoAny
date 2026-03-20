"use strict";
/**
 * F2: Local vector database for literature retrieval.
 *
 * Uses a simple in-memory TF-IDF approach with JSON persistence.
 * Can be swapped for LanceDB or Qdrant when scale demands it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestLiterature = ingestLiterature;
exports.searchLiterature = searchLiterature;
exports.getLiteratureCount = getLiteratureCount;
exports.getLiteratureById = getLiteratureById;
exports.getAllLiterature = getAllLiterature;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
const DB_DIR = process.env["U2E_STATE_DIR"] ??
    (0, node_path_1.join)(process.env["HOME"] ?? "~", ".openclaw", "u2e-state");
function dbPath() {
    return (0, node_path_1.join)(DB_DIR, "literature.json");
}
let _db = null;
function loadDB() {
    if (_db)
        return _db;
    const p = dbPath();
    if ((0, node_fs_1.existsSync)(p)) {
        _db = JSON.parse((0, node_fs_1.readFileSync)(p, "utf-8"));
    }
    else {
        _db = { records: {}, idf: {}, doc_count: 0 };
    }
    return _db;
}
function saveDB() {
    if (!_db)
        return;
    const p = dbPath();
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(p), { recursive: true });
    (0, node_fs_1.writeFileSync)(p, JSON.stringify(_db, null, 2));
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
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}
function termFrequency(tokens) {
    const tf = {};
    for (const t of tokens)
        tf[t] = (tf[t] ?? 0) + 1;
    const max = Math.max(1, ...Object.values(tf));
    for (const t of Object.keys(tf))
        tf[t] /= max;
    return tf;
}
function rebuildIDF(db) {
    const df = {};
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
function tfidfVector(tf, idf) {
    const vec = {};
    for (const [term, freq] of Object.entries(tf)) {
        vec[term] = freq * (idf[term] ?? Math.log(10));
    }
    return vec;
}
function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (const [k, v] of Object.entries(a)) {
        normA += v * v;
        if (k in b)
            dot += v * b[k];
    }
    for (const v of Object.values(b))
        normB += v * v;
    if (normA === 0 || normB === 0)
        return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function ingestLiterature(record) {
    const db = loadDB();
    // Dedup by id
    if (record.id in db.records)
        return db.records[record.id];
    const text = `${record.title} ${record.abstract} ${record.authors.join(" ")}`;
    const tokens = tokenize(text);
    const tf = termFrequency(tokens);
    const full = {
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
function searchLiterature(query, topK = 5) {
    const db = loadDB();
    if (db.doc_count === 0)
        return [];
    const tokens = tokenize(query);
    const tf = termFrequency(tokens);
    const queryVec = tfidfVector(tf, db.idf);
    const scored = [];
    for (const rec of Object.values(db.records)) {
        const docVec = tfidfVector(rec._terms, db.idf);
        const score = cosineSimilarity(queryVec, docVec);
        if (score > 0.01)
            scored.push({ record: rec, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}
function getLiteratureCount() {
    return loadDB().doc_count;
}
function getLiteratureById(id) {
    const db = loadDB();
    return db.records[id] ?? null;
}
function getAllLiterature() {
    return Object.values(loadDB().records);
}
