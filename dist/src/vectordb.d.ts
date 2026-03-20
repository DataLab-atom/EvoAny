/**
 * F2: Local vector database for literature retrieval.
 *
 * Uses a simple in-memory TF-IDF approach with JSON persistence.
 * Can be swapped for LanceDB or Qdrant when scale demands it.
 */
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
export declare function ingestLiterature(record: Omit<LiteratureRecord, "_terms" | "ingested_at">): LiteratureRecord;
export declare function searchLiterature(query: string, topK?: number): {
    record: LiteratureRecord;
    score: number;
}[];
export declare function getLiteratureCount(): number;
export declare function getLiteratureById(id: string): LiteratureRecord | null;
export declare function getAllLiterature(): LiteratureRecord[];
