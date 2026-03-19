---
name: evolve
description: "Start evolutionary optimization on a git repository"
---

# /evolve — Start Evolution

User provides: repo path, benchmark command, objectives (list of {name, direction} specs), and optionally max evaluations.

## Step 1 — Deterministic setup via lobster

Run all pre-evolution setup as a single deterministic lobster workflow.
This is atomic: if any step fails, the exact failure step is reported and nothing proceeds.

```json
lobster action:run pipeline:"./plugin/workflows/evo-setup.lobster" args:{
  "repo": "<repo_path>",
  "benchmark": "<benchmark_cmd>",
  "objectives": "[{\"name\": \"score\", \"direction\": \"max\"}]"
}
```

The workflow handles:
- Validate repo is clean (`git status --porcelain`)
- Run baseline benchmark, capture seed fitness
- `git tag seed-baseline`
- Create `memory/` directory structure
- Initialize `~/clawd/canvas/` for dashboard

Parse the baseline fitness from `run_baseline.stdout` (last line — whitespace-separated
numbers for "numbers" format, or JSON dict for "json" format).

Then call the MCP tools to record it:
- `evo_init` with user's config (repo, benchmark, objectives, max_evals)
- `evo_report_seed` with the baseline fitness values as `list[float]`

**If lobster is not available**, fall back to running each step with individual `exec` calls.

## Step 2 — Code analysis (MapAgent)

Spawn MapAgent to identify optimization targets:
```
sessions_spawn agentId:map_agent
```

MapAgent reads the benchmark entry file, traces the call chain (using `/oracle` if available),
and calls `evo_register_targets`.

## Step 3 — Approval gate: confirm targets before committing budget

After MapAgent completes, present identified targets to the user and ask for confirmation
before spending evaluation budget:

```
"MapAgent found {N} targets:
  • {target_id}: {target_function} in {target_file} — {impact description}
  • ...
Proceed with {max_evals} evaluations? (y/n)"
```

Wait for user confirmation. If they want to adjust targets, allow editing before proceeding.

## Step 4 — Initialize canvas dashboard

Write initial `~/clawd/canvas/evo-dashboard.html` with seed baseline data and present it:
```
canvas action:present target:evo-dashboard.html
```

## Step 5 — Evolution loop

Follow the Core Loop in AGENTS.md:
- OrchestratorAgent calls `evo_step("begin_generation")`
- Spawn one WorkerAgent per item in parallel
- Each WorkerAgent: generates code → static validation → policy check → benchmark
- OrchestratorAgent calls `evo_step("select")`, updates canvas dashboard
- Spawn ReflectAgent to write memory
- Repeat until `action == "done"` or user stops

## Step 6 — Wrap up via lobster

When evolution completes, build the PR body from `/report` output and the `evo-finish` workflow:

```json
lobster action:run pipeline:"./plugin/workflows/evo-finish.lobster" args:{
  "repo": "<repo_path>",
  "best_branch": "<best_branch_from_evo_step>",
  "original_branch": "<original_branch>",
  "pr_title": "evo: improve <target_ids> by <improvement>% (<benchmark_name>)",
  "pr_body": "<full report markdown with per-target table + lessons + repro>"
}
```

The `evo-finish` workflow:
1. Tags `best-overall`
2. Pushes the best branch
3. Shows a diff stat summary
4. **Pauses for user approval** before opening the PR
5. Opens PR only if approved (skips entirely if denied)

**If lobster is not available**, fall back to:
- Manual `git tag` + `git push` via `exec`
- Ask user directly: "Open PR? (y/n)"
- Run `gh pr create` if yes
