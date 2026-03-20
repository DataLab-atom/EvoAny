# /research-loop — Research Derivation Loop

> **C4: Core research verification loop** — drives the derivation forest from
> evolution results to deep motivation discovery.

## Purpose

Starting from completed evolution results (code changes + performance data),
iteratively build a derivation forest to discover **why** the changes work,
find deep motivations, and grade contributions for paper writing.

## Usage

```
/research-loop [evo_session_id]
```

If no session ID given, uses the current/most recent evolution session.

## Behavior

### Phase 1: Initialization

1. Call `evo_get_status` to get evolution results summary
2. Call `evo_get_lineage` for the best branch to understand the full change history
3. Call `research_init_forest` to create a new derivation forest
4. For each significant code change in the lineage:
   - Call `research_add_node(type="change")` to register it as a root node

### Phase 2: Iterative Exploration (main loop)

Each iteration performs 5 steps:

**Step 1 — Cut into code changes**
- Read the current active change nodes
- Use `code_qa` to understand what each change does
- May merge or split change nodes via `research_merge_nodes`
- Add refined `change` nodes as needed

**Step 2 — Reverse reasoning: why does it work?**
- For each active change node, hypothesize why it improves performance
- Call `research_add_node(type="hypothesis", parent_ids=[change_id])`
- Consider: what unsolved domain problem does this address?

**Step 3 — Literature search**
- For each new hypothesis, call `/ask-lit` with the hypothesis as query
- Call `research_add_node(type="evidence", literature_refs=[...])` for each finding
- Update hypothesis nodes with literature context

**Step 4 — Experimental verification**
- Design targeted experiments (ablation / control) to test hypotheses
- Call `bench_adapt` + `bench_run` to execute experiments
- Call `bench_validate` to check result reasonableness
- Supported: `research_update_node(status="pruned")` for rejected hypotheses
- Supported: continue deepening for confirmed hypotheses

**Step 5 — Check convergence**
- Call `research_check_convergence`
- If **not converged**: increment iteration, go back to Step 1
- If **converged**: enter Phase 3

### Phase 3: Convergence & Contribution Grading

1. For each convergence candidate:
   - Extract the shared deep question Q
   - Call `research_add_convergence_point(question=Q, contributing_node_ids=[...])`

2. **Verify Q**:
   - Call `/ask-lit` to check if Q is recognized in the field
   - Call `bench_adapt` + `bench_run` to design direct experiment proving Q
   - Call `research_verify_convergence_point(verified=true/false)`

3. **Grade contributions**:
   - Converged branches → `research_record_contribution(level="primary")`
   - Non-converged active branches → `research_record_contribution(level="auxiliary")`

4. Call `research_get_forest` for final summary
5. Commit forest to git: `research/forest/<forest_id>/`

### Safety

- Maximum iterations: 20 (configurable via `max_iterations` in forest state)
- Each iteration is committed to git for traceability
- If no convergence after max iterations, report partial results with all branches

## Output

Returns a structured report:
- Deep motivation(s) discovered (or "not yet converged")
- Primary and auxiliary contributions
- All literature references
- Forest visualization (node tree)

## Agent Assignment

This skill spawns a **ResearchAgent** via `sessions_spawn` to drive the loop
autonomously. The ResearchAgent has access to all `research_*` tools, `/ask-lit`,
and B-layer tools.

## Tool Usage

| Tool | Purpose |
|------|---------|
| `evo_get_status` | Read evolution results |
| `evo_get_lineage` | Trace branch ancestry |
| `research_init_forest` | Create derivation forest |
| `research_add_node` | Add nodes to forest |
| `research_update_node` | Update node status |
| `research_merge_nodes` | Merge nodes |
| `research_check_convergence` | Check for convergence |
| `research_add_convergence_point` | Register convergence |
| `research_verify_convergence_point` | Verify convergence |
| `research_record_contribution` | Grade contributions |
| `research_get_forest` | Get forest summary |
| `/ask-lit` | Literature search & QA |
| `code_qa` | Code understanding |
| `bench_adapt` | Adapt code for new benchmark |
| `bench_run` | Run benchmark |
| `bench_validate` | Validate results |
| `viz_generate` | Generate analysis figures |
