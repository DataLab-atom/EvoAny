/**
 * F3: BibTeX management — parse, deduplicate, format, and persist references.
 */
export interface BibEntry {
    /** BibTeX cite key, e.g. "wang2024attention" */
    key: string;
    type: string;
    fields: Record<string, string>;
}
/**
 * Parse a BibTeX string into structured entries.
 * Handles standard @type{key, field = {value}, ...} format.
 */
export declare function parseBib(bibtex: string): BibEntry[];
/**
 * Deduplicate entries by key (keep first occurrence).
 * Also dedup by title similarity if titles match after normalization.
 */
export declare function dedupBib(entries: BibEntry[]): BibEntry[];
/**
 * Format a single BibEntry back to BibTeX string.
 */
export declare function formatEntry(entry: BibEntry): string;
/**
 * Format all entries to a complete BibTeX file string.
 */
export declare function formatBib(entries: BibEntry[]): string;
/**
 * Load entries from a .bib file. Returns empty array if file doesn't exist.
 */
export declare function loadBibFile(path: string): BibEntry[];
/**
 * Append new entries to a .bib file, deduplicating against existing content.
 * Returns the number of actually new entries added.
 */
export declare function appendBib(path: string, newEntries: BibEntry[]): number;
/**
 * Generate a BibTeX key from author/year/title.
 */
export declare function generateKey(authors: string[], year: number, title: string): string;
