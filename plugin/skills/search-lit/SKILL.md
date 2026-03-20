# /search-lit — Online Literature Search

> **Internal skill** — called by `/ask-lit` and ResearchAgent, not typically invoked directly.

## Purpose

Search online sources for academic literature relevant to a query. Returns
structured results with BibTeX citations.

## Input

- `query` — A research question, topic, or keyword string

## Behavior

1. **arXiv search** (primary)
   - Use the `browser` tool to query `https://arxiv.org/search/?query=<encoded_query>&searchtype=all`
   - Extract: title, authors, year, abstract, arXiv ID, URL
   - Limit to top 5 results

2. **Papers With Code** (supplementary)
   - Use `browser` to search `https://paperswithcode.com/search?q=<encoded_query>`
   - Cross-reference with arXiv results; add any new papers found

3. **Google Scholar** (fallback, if above yield < 3 results)
   - Use `browser` to search Scholar
   - Extract what's available from snippets

4. **Standardize output** — for each paper found:
   ```json
   {
     "title": "...",
     "authors": ["..."],
     "year": 2025,
     "abstract": "...",
     "url": "https://arxiv.org/abs/...",
     "bibtex": "@article{key, ...}"
   }
   ```

5. **Auto-ingest** — call `lit_ingest` for each result to add to local vector DB

## Output

Return the array of found papers with their BibTeX entries.

## Tool Usage

| Tool | Purpose |
|------|---------|
| `browser` | Web search and page scraping |
| `lit_ingest` | Ingest found papers into local vector DB |
| `summarize` | Compress long abstracts if needed |
