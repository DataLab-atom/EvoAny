/**
 * F3: BibTeX management — parse, deduplicate, format, and persist references.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BibEntry {
  /** BibTeX cite key, e.g. "wang2024attention" */
  key: string;
  type: string;
  fields: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a BibTeX string into structured entries.
 * Handles standard @type{key, field = {value}, ...} format.
 */
export function parseBib(bibtex: string): BibEntry[] {
  const entries: BibEntry[] = [];
  // Match @type{key, ... }
  const entryRegex = /@(\w+)\s*\{([^,]+),([^}@]*(?:\{[^}]*\}[^}@]*)*)}/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(bibtex)) !== null) {
    const type = match[1].toLowerCase();
    const key = match[2].trim();
    const body = match[3];

    const fields: Record<string, string> = {};
    // Match field = {value} or field = "value" or field = number
    const fieldRegex = /(\w+)\s*=\s*(?:\{([^}]*(?:\{[^}]*\}[^}]*)*)\}|"([^"]*)"|(\d+))/g;
    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      const fieldName = fieldMatch[1].toLowerCase();
      const fieldValue = fieldMatch[2] ?? fieldMatch[3] ?? fieldMatch[4] ?? "";
      fields[fieldName] = fieldValue.trim();
    }

    entries.push({ key, type, fields });
  }
  return entries;
}

/**
 * Deduplicate entries by key (keep first occurrence).
 * Also dedup by title similarity if titles match after normalization.
 */
export function dedupBib(entries: BibEntry[]): BibEntry[] {
  const seen = new Map<string, BibEntry>();
  const seenTitles = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.key)) continue;

    const normalizedTitle = (entry.fields["title"] ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (normalizedTitle && seenTitles.has(normalizedTitle)) continue;

    seen.set(entry.key, entry);
    if (normalizedTitle) seenTitles.add(normalizedTitle);
  }

  return [...seen.values()];
}

/**
 * Format a single BibEntry back to BibTeX string.
 */
export function formatEntry(entry: BibEntry): string {
  const lines = [`@${entry.type}{${entry.key},`];
  const fieldOrder = ["author", "title", "journal", "booktitle", "year", "volume", "number", "pages", "publisher", "url", "doi", "arxiv"];
  const orderedFields: string[] = [];

  // Add fields in preferred order
  for (const f of fieldOrder) {
    if (f in entry.fields) orderedFields.push(f);
  }
  // Add remaining fields
  for (const f of Object.keys(entry.fields)) {
    if (!orderedFields.includes(f)) orderedFields.push(f);
  }

  for (let i = 0; i < orderedFields.length; i++) {
    const f = orderedFields[i];
    const comma = i < orderedFields.length - 1 ? "," : "";
    lines.push(`  ${f} = {${entry.fields[f]}}${comma}`);
  }
  lines.push("}");
  return lines.join("\n");
}

/**
 * Format all entries to a complete BibTeX file string.
 */
export function formatBib(entries: BibEntry[]): string {
  return entries.map(formatEntry).join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

/**
 * Load entries from a .bib file. Returns empty array if file doesn't exist.
 */
export function loadBibFile(path: string): BibEntry[] {
  if (!existsSync(path)) return [];
  return parseBib(readFileSync(path, "utf-8"));
}

/**
 * Append new entries to a .bib file, deduplicating against existing content.
 * Returns the number of actually new entries added.
 */
export function appendBib(path: string, newEntries: BibEntry[]): number {
  const existing = loadBibFile(path);
  const combined = dedupBib([...existing, ...newEntries]);
  const added = combined.length - existing.length;
  if (added > 0) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, formatBib(combined));
  }
  return added;
}

/**
 * Generate a BibTeX key from author/year/title.
 */
export function generateKey(authors: string[], year: number, title: string): string {
  const firstAuthor = (authors[0] ?? "unknown")
    .split(/\s+/)
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z]/g, "") ?? "unknown";
  const firstWord = title
    .toLowerCase()
    .split(/\s+/)
    .find((w) => w.length > 3 && !["the", "and", "for", "with"].includes(w)) ?? "paper";
  return `${firstAuthor}${year}${firstWord}`;
}
