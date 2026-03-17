# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

**Evo-anything** is a Git-based evolutionary code optimization engine implementing structural-functional co-evolution (U2E protocol). It uses LLM-driven mutation, crossover, and reflection to automatically evolve code in any git repository. Unlike EoH/FunSearch, it requires no templates and simultaneously optimizes both algorithm logic and code architecture.

The system is distributed as an npm package (`evo-anything`) that installs a plugin into Claude Code, Cursor, Windsuff, or OpenClaw. The plugin includes a Python MCP server (`evo-engine`) for stateful bookkeeping.

## Installation & Setup

```bash
# Users
npm install -g evo-anything
npx evo-anything setup   # configures Claude Code, Cursor, Windsurf, or OpenClaw

# Developers (MCP server only)
cd plugin/evo-engine
pip install .            # installs `evo-engine` command (requires Python >=3.11)
```

There is no build step, test suite, or linter for this repo itself.

## Architecture

```
plugin/
├── AGENTS.md              # Core U2E protocol & agent state machine — read this first
├── TOOLS.md               # Which tools each agent type may call
├── agents/                # Behavior specs for each agent type
│   ├── orchestrator.md    # Drives main loop, dispatches workers
│   ├── worker.md          # Generates variants, runs benchmarks, reports fitness
│   ├── map_agent.md       # Discovers optimization targets in target repo
│   ├── policy_agent.md    # Reviews diffs before benchmarking
│   └── reflect_agent.md   # Writes memory, checks cross-target synergy
├── skills/                # User-callable slash commands
│   ├── hunt/              # /hunt — find repo on GitHub/arXiv, clone, run baseline
│   ├── evolve/            # /evolve — initialize and drive evolution loop
│   ├── status/            # /status — display generation progress
│   ├── report/            # /report — generate evolution report
│   ├── boost/             # /boost — increase target exploration
│   └── freeze/            # /freeze — stop evolving a target
├── workflows/
│   ├── evo-setup.lobster  # Validate repo, run baseline, tag, init memory
│   └── evo-finish.lobster # Tag best, push, PR approval gate
├── evo-engine/            # Python MCP server
│   ├── server.py          # 13 MCP tools (evo_init, evo_step, evo_get_status, …)
│   ├── models.py          # Pydantic models: EvolutionState, Individual, Target, EvolutionConfig
│   ├── selection.py       # NSGA-II selection + adaptive batch planning
│   └── pyproject.toml
└── openclaw.plugin.json   # Plugin manifest
scripts/
├── cli.js                 # Setup CLI (writes MCP config to IDE settings)
└── postinstall.js         # Post-npm-install hook
```

## Core Evolution Loop

```
OrchestratorAgent
  → evo_step("begin_generation")   returns batch items
  → spawns N WorkerAgents in parallel (one per item)

  WorkerAgent:
    1. Generate code variant (edit/write, or delegate to claude/codex CLI)
    2. Static check (py_compile, pyflakes) — skip if unavailable
    3. evo_step("code_ready")       → PolicyAgent reviews diff
    4. Run benchmark (tmux for long runs, blocking exec otherwise)
    5. evo_step("fitness_ready")    → report fitness list[float]

  OrchestratorAgent:
    → evo_step("select")            → NSGA-II survivor selection
    → spawn ReflectAgent            → write memory/
    → evo_step("reflect_done")      → next generation or done
```

## MCP Tools (server.py)

Key tools in `evo_step` state machine transitions:
- `begin_generation` → returns batch of (target, op, parents) items
- `code_ready` → triggers PolicyAgent; returns `pass` or `fail`
- `policy_pass` / `policy_fail` → record policy decision
- `fitness_ready` → store fitness values
- `select` → run NSGA-II, update Pareto fronts
- `reflect_done` → advance generation counter

Other important tools: `evo_init`, `evo_register_targets`, `evo_report_seed`, `evo_get_status`, `evo_get_lineage`, `evo_freeze_target`, `evo_boost_target`, `evo_record_synergy`, `evo_check_cache`.

## Data Layout

**State file:** `~/.openclaw/u2e-state/state.json` (override with `$U2E_STATE_DIR`)

**Git artifacts in the target repo:**
- Branch naming: `gen-{N}/{target_id}/{op}-{V}` (op = `mut` or `xover`)
- Tags: `seed-baseline`, `best-gen-{N}`, `best-overall`
- Memory directory:
  ```
  memory/
  ├── global/long_term.md
  ├── targets/{id}/short_term/gen_N.md
  ├── targets/{id}/long_term.md
  ├── targets/{id}/failures.md
  └── synergy/records.md
  ```

## Selection Algorithm (selection.py)

- `fast_non_dominated_sort` — partition population into Pareto fronts F1, F2, …
- `select_survivors` — NSGA-II: rank by front, break ties with crowding distance
- `plan_generation` — adaptive batch planning: adjusts mutation/crossover ratio per target based on stagnation
- `update_temperatures` — temperature control for explore/exploit balance
- Fitness is always `list[float]`; single-objective uses a one-element list

## Optional Tool Dependencies

The system degrades gracefully when these are absent:

| Tool | Used by | Purpose |
|------|---------|---------|
| `oracle` CLI | MapAgent | Whole-repo context for target discovery |
| `claude`/`codex` CLI | WorkerAgent | Complex code generation |
| `tmux` | WorkerAgent | Non-blocking long benchmarks |
| `pyflakes` | WorkerAgent | Static import/name checks |
| `lobster` CLI | `/evolve` skill | Atomic setup/finish workflows |
| `arxiv-watcher` | `/hunt` skill | Recent paper search |

## Development Branch

Active development branch: `claude/install-plugin-GHPCW`
