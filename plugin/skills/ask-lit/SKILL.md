# /ask-lit — Literature Question Answering

> **A4: Unified literature interface** — local-first, online-supplement, auto-ingest.

## Purpose

Answer a research question using academic literature. Prioritizes the local
vector database, supplements with online search when needed, and automatically
ingests new papers for future queries.

## Usage

```
/ask-lit <question or topic>
```

Examples:
- `/ask-lit attention mechanism for long-tailed recognition`
- `/ask-lit why does mixup regularization improve calibration`
- `/ask-lit SOTA methods for CIFAR-100-LT`

## Behavior

1. **Local search first** — call `lit_search_local` with the query
   - If >= 3 relevant results (score > 0.1): proceed to answer

2. **Online supplement** (if local results < 3)
   - Invoke `/search-lit` to find papers online
   - New papers are automatically ingested into the local DB via `lit_ingest`
   - Merge online results with local results

3. **Synthesize answer**
   - Read the abstracts / content of the top results
   - Generate a concise answer to the question
   - Cite papers using BibTeX keys: `[authorYYYYword]`

4. **Return**
   - The synthesized answer
   - A list of cited papers with full BibTeX entries
   - Call `bib_append` to add new citations to `research/refs/references.bib`

## Output Format

```
## Answer

<synthesized answer with [citations]>

## References

<BibTeX entries>
```

## Tool Usage

| Tool | Purpose |
|------|---------|
| `lit_search_local` | Search local vector DB |
| `/search-lit` | Online literature search (when local is insufficient) |
| `lit_ingest` | Auto-ingest new papers |
| `bib_append` | Persist citations to references.bib |
| `code_qa` | If question involves code from the evolution |
