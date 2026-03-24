<div align="center">
  <img src="./images/image.png" alt="EvoClaw Logo" width="220" />

# EvoClaw Plugin — Git-Based Evolutionary Code Optimizer

[![文档](https://img.shields.io/badge/文档-中文版-blue.svg)](https://github.com/DataLab-atom/EvoClaw/blob/main/README_ZN.md)
[![document](https://img.shields.io/badge/document-English-blue.svg)](https://github.com/DataLab-atom/EvoClaw/blob/main/README.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/DataLab-atom/EvoClaw/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D16-339933?logo=node.js&logoColor=white)](https://github.com/DataLab-atom/EvoClaw/blob/main/package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/DataLab-atom/EvoClaw/pulls)
[![Build Status](https://github.com/DataLab-atom/EvoClaw/actions/workflows/ci.yml/badge.svg)](https://github.com/DataLab-atom/EvoClaw/actions/workflows/ci.yml)

[Installation](#installation) | [Manual Setup](#option-2-build-from-source-and-connect-manually) | [How It Works](#how-it-works) | [Skills](#skills)
</div>

![Demo Framework Diagram](./images/system_overview.png)

> **EvoClaw represents a newer LLM-driven automation paradigm for algorithm and code optimization.** Instead of limiting LLM-based design to task-specific templates, manual task adaptation, and research-oriented scaffolding, it turns the entire workflow into an engineering-oriented automated evolution system for arbitrary git repositories. Building on the direction opened by systems such as LLM4AD and AlphaEvolve, EvoClaw focuses not only on generating better candidates, but on connecting repository discovery, environment setup, benchmark integration, target identification, code generation, evaluation, selection, and result tracking into a runnable closed loop.
>
> **Compared with the previous workflow pattern where researchers often had to manually adapt code and wire up evaluation pipelines before search could even begin, EvoClaw raises the level of automation and makes interaction far more natural.** Users can describe an optimization goal in natural language, and the system automatically drives the full evolution process around a benchmark or evaluation script, continuously selecting and retaining better-performing implementations over multiple iterations. For algorithm repositories, training code, and other quantitatively evaluable systems, this shift from a semi-manual research workflow to a fully automated loop is the core advantage.
>
> **As an engineering-oriented evolution engine integrated into the OpenClaw/MCP ecosystem,** EvoClaw treats git branches as candidate individuals and benchmark results as fitness. By combining multi-objective selection, policy constraints, and cross-generation memory, it enables automatic, traceable, and sustained optimization of any repository with a benchmark or evaluation script.
> 

## Why EvoClaw

| Key Question | Traditional LLM4AD / AlphaEvolve-style workflow | EvoClaw |
|-------------|--------------------------------------------------|---------|
| Task onboarding | Often requires manual task-code adaptation, interface wiring, and evaluation hookup | Directly targets git repositories and auto-connects through benchmark/eval entry points |
| Interaction model | Usually research-platform driven or script-orchestrated | Natural-language driven, with search, setup, evolution, and reporting connected end to end |
| Automation scope | Often covers search or local optimization only | Covers repository discovery, environment setup, target identification, code generation, evaluation, selection, and tracking |
| Applicability | More tied to predefined tasks, templates, or research examples | Works for arbitrary git repositories with quantitative evaluation |

---

## Demo Example
<div align="center">

https://github.com/user-attachments/assets/94b63348-de0d-4602-a2ce-3e73740656e2

</div>

---

## Installation

### Prerequisites

**Required:**
- Node.js >= 16
- Git
- GitHub CLI (`gh`) — required for `/hunt` to search repositories and open PRs

**Optional (automatically enabled when installed):**
- `oracle` CLI — MapAgent whole-repo context analysis (`npm install -g oracle`)
- `claude` CLI — WorkerAgent complex variant generation using Claude Code instead of direct edits
- `codex` CLI — alternative for WorkerAgent complex variant generation
- `lobster` CLI — atomic setup workflows + PR approval gate
- `tmux` — non-blocking background execution for long benchmarks
- `pyflakes` — static import/name checks before committing variants (`npm install -g pyflakes` or `pipx install pyflakes`)
- OpenClaw skills: `oracle`, `arxiv-watcher`, `summarize`, `session-logs` (install via `clawhub install <slug>`)

### Option 1: npm (recommended)

```bash
npm install -g evo-anything
```

This automatically verifies dependencies and configures the MCP server during the npm postinstall step.

After installation, configure your AI IDE:

```bash
# Configure all supported platforms (Claude Code, Cursor, Windsurf, OpenClaw)
npx evo-anything setup

# Or configure a specific platform
npx evo-anything setup --platform claude
npx evo-anything setup --platform cursor
npx evo-anything setup --platform windsurf
npx evo-anything setup --platform openclaw
```

---

### Option 2: Build from source and connect manually

Use this path when:

- you want to develop or debug EvoClaw locally
- `npx evo-anything setup` cannot update your platform configuration directly
- you want full manual control over plugin installation and MCP wiring

This path has two parts: build `evo-engine` first, then connect it to your platform.

#### Step 1: Build evo-engine from source (required for all platforms)

```bash
git clone https://github.com/DataLab-atom/EvoClaw.git
cd EvoClaw
npm install && npm run build
```

#### Step 2: Connect your platform

Access as a plugin in OpenClaw, while all other platforms connect to the same `evo-engine` MCP server, with the only differences being their respective configuration file locations and skill integration methods.

##### OpenClaw

<details>
<summary>Recommended: install into OpenClaw automatically</summary>

```bash
npx evo-anything setup
openclaw gateway restart
```

`setup` installs the plugin into `~/.openclaw/extensions/evo-anything`, enables it in `plugins.allow` and `plugins.entries`, registers bundled skills, and adds `"evo-anything"` to `tools.alsoAllow` so `evo_*` tools appear in agent tool tables.

</details>

<details>
<summary>For development: rebuild and reinstall</summary>

```bash
npm run build
npx evo-anything setup
openclaw gateway restart
```

Use this after changing `plugin/index.ts`, `plugin/server.ts`, or any other code that affects `dist/`.

</details>

<details>
<summary>Fallback: register the plugin manually</summary>

Copy the built plugin package to the extensions directory and register it in `~/.openclaw/openclaw.json`:

```bash
mkdir -p ~/.openclaw/extensions/evo-anything
cp -r dist ~/.openclaw/extensions/evo-anything/
cp -r plugin ~/.openclaw/extensions/evo-anything/
cp openclaw.plugin.json package.json ~/.openclaw/extensions/evo-anything/
```

```json
{
  "plugins": {
    "allow": ["evo-anything"],
    "entries": {
      "evo-anything": {
        "enabled": true,
        "config": {}
      }
    }
  },
  "tools": {
    "alsoAllow": ["evo-anything"]
  },
  "mcpServers": {
    "evo-engine": {
      "command": "evo-engine",
      "args": [],
      "env": {}
    }
  }
}
```

```bash
openclaw gateway restart
```

</details>

`plugins.allow` controls whether OpenClaw loads the plugin. `tools.alsoAllow` controls whether the plugin's native tools are exposed to coding-profile agents.

**Verify:**

```bash
openclaw plugins info evo-anything
```

Then start a fresh agent session and confirm tools such as `evo_init` or `evo_get_status` are available.

##### Claude Code

Add the MCP server to your project root or global `.claude/settings.json`:

```json
{
  "mcpServers": {
    "evo-engine": {
      "command": "evo-engine",
      "type": "stdio"
    }
  }
}
```

Link skills to Claude Code:

```bash
ln -s $(pwd)/plugin/skills/* ~/.claude/skills/
```

Restart Claude Code and you're ready.

##### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "evo-engine": {
      "command": "evo-engine",
      "type": "stdio"
    }
  }
}
```

Cursor will auto-discover MCP tools (`evo_init`, `evo_next_batch`, etc.). Import skills as Cursor Rules manually:

```bash
cp plugin/AGENTS.md .cursor/rules/evo-agents.md
```

##### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "evo-engine": {
      "command": "evo-engine",
      "type": "stdio"
    }
  }
}
```

##### Any Other MCP-Compatible Client

EvoClaw's core is a standard [MCP](https://modelcontextprotocol.io) server. Any client that supports MCP stdio transport can connect:

```bash
# Start the server directly (stdio mode)
evo-engine
```

Available MCP tools: `evo_init`, `evo_register_targets`, `evo_report_seed`, `evo_step`, `evo_next_batch`, `evo_report_fitness`, `evo_select_survivors`, `evo_revalidate_targets`, `evo_get_status`, `evo_get_lineage`, `evo_freeze_target`, `evo_boost_target`, `evo_record_synergy`, `evo_check_cache`.

#### Optional Configuration

Evolution state is stored in `~/.openclaw/u2e-state/` by default. Override with an environment variable (`U2E` stands for *Understanding to Excelling*, the paper's acronym):

```bash
export U2E_STATE_DIR=/path/to/your/state
```

Or configure via `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "evo-anything": {
        "enabled": true,
        "config": {
          "statePath": "/path/to/your/state"
        }
      }
    }
  }
}
```

## Quick Start

```
You say: optimize this repo https://github.com/example/long-tail-repo
      benchmark command is python benchmark.py --dataset cifar100_lt
      objectives are top1=max, latency=min
      budget is 120 evaluations
         ↓
  Call /evolve with repo_path, benchmark_cmd, objectives, and max_fe
         ↓
  Register optimization targets → generate the first mutate / crossover / structural batch
         ↓
  Workers edit code in parallel → policy check → benchmark in isolated worktrees
         ↓
  Report fitness → update target-local and global Pareto fronts
         ↓
  Continue generation by generation until the 120-evaluation budget is exhausted
         ↓
  Output the best branch, Pareto results, and the final evolution report
```

---

## How It Works

EvoClaw runs a **multi-agent evolutionary loop on top of an MCP server**, with persistent state, target-level search control, Pareto selection, and an optional research-analysis layer. The core execution model is not just "generate code and benchmark it"; it is a coordinated loop where different agents and tools handle planning, code generation, policy review, benchmarking, survivor selection, memory updates, and downstream research synthesis.

At the evolution layer, the flow is:

1. **Initialize run state** — `evo_init` stores repo path, benchmark command, objective directions, population size, mutation / structural rates, evaluation budget, quick-check command, and protected file patterns.
2. **Register optimization targets** — `evo_register_targets` records target functions/files, supports derived targets, and can inherit memory and active branches from a parent target after structural changes.
3. **Plan a generation** — the server allocates per-target budget from target temperature, then schedules a mix of `mutate`, `crossover`, `structural`, and periodic `synergy` operations.
4. **Dispatch workers** — each batch item becomes a git branch like `gen-{N}/{target}/{op}-{k}`; parent branches are chosen from the target Pareto set, current best branch, or the seed baseline.
5. **Generate and review code** — WorkerAgent creates a variant, checks the evaluation cache via `evo_check_cache`, then submits the diff for an explicit policy gate before benchmarking.
6. **Benchmark in isolation** — approved candidates are evaluated in isolated git worktrees; results are reported back with `evo_report_fitness` or `evo_step("fitness_ready")`.
7. **Run multi-objective selection** — EvoClaw uses NSGA-II style non-dominated sorting and crowding distance to keep survivors, update target-local Pareto fronts, and maintain a global Pareto front.
8. **Adapt search pressure** — target temperature increases when a target is improving and decreases after stagnation; stagnant targets get a higher structural-op rate, and targets can also be frozen or boosted manually.
9. **Revalidate after structural edits** — if a structural operation invalidates a target, `evo_revalidate_targets` detects it, the old target can be frozen, and replacement targets can be registered with lineage preserved.
10. **Write memory and continue** — each generation updates `memory/`, records failures and synergy results, tags the best generation branch, and advances until the evaluation budget is exhausted.

Beyond the core optimizer, the MCP server also exposes three higher-level capability layers:

- **Literature layer** — `lit_ingest`, `lit_search_local`, BibTeX helpers, and code-aware Q&A over branch lineage.
- **Benchmark / visualization layer** — tools for benchmark adaptation, isolated benchmark execution, SOTA sanity checking, and chart generation / highlighting / polishing.
- **Research layer** — a derivation-forest workflow (`research_*` tools) that tracks hypotheses, evidence, convergence points, and contribution grading so evolution results can be turned into paper-level research narratives.

All evolution state is persisted under `~/.openclaw/u2e-state/` by default, while run-specific memory is written back into the target repository under `memory/`. The main status view reports generation, evaluation budget, per-target stagnation and temperature, local/global Pareto fronts, and improvement versus the seed baseline.

---

## Skills

| Command | Description |
|---------|-------------|
| `/hunt <task description>` | Search GitHub for a suitable repo, auto clone/install/baseline, then start evolution |
| `/evolve <repo> <benchmark_cmd>` | Start an evolutionary optimization loop on a given repo |
| `/status` | Check current evolution progress |
| `/report` | Generate a full evolution report |
| `/boost <target_id>` | Increase the priority of an optimization target |
| `/freeze <target_id>` | Freeze a target, stopping evolution on it |

## Repository Structure

```
EvoClaw/
├── LICENSE
├── README.md
├── README_EN.md
├── research/                  # ecosystem research docs
│   ├── 01_openclaw_existing_capabilities.md
│   ├── 02_compatible_products_capabilities.md
│   ├── 03_evo_anything_analysis.md
│   └── 04_ecosystem_capability_map.md  # full ecosystem capability map
└── plugin/
    ├── openclaw.plugin.json   # plugin definition
    ├── AGENTS.md              # evolution protocol (core loop)
    ├── SOUL.md                # agent persona
    ├── TOOLS.md               # tool usage conventions
    ├── agents/                # per-agent behavior specs
    │   ├── orchestrator.md    # OrchestratorAgent (with canvas dashboard)
    │   ├── worker.md          # WorkerAgent (with static checks, tmux, coding-agent)
    │   ├── policy_agent.md    # PolicyAgent
    │   ├── reflect_agent.md   # ReflectAgent (with cross-run meta-learning)
    │   └── map_agent.md       # MapAgent (with oracle whole-repo analysis)
    ├── server.ts              # MCP tool interface (evolution engine)
    ├── index.ts               # plugin entry point
    ├── src/                   # core logic
    │   ├── models.ts          # data models
    │   ├── selection.ts       # selection algorithms
    │   └── state.ts           # state management
    ├── skills/                # user-invocable skills
    │   ├── hunt/              # search and deploy a codebase (with arxiv-watcher)
    │   ├── evolve/            # start evolution loop (with lobster workflows)
    │   ├── status/            # check progress
    │   ├── report/            # generate report
    │   ├── boost/             # boost target priority
    │   └── freeze/            # freeze a target
    └── workflows/             # Lobster declarative workflows
        ├── evo-setup.lobster  # atomic setup (validate→baseline→tag→mkdir)
        └── evo-finish.lobster # finish flow (tag→push→approval gate→PR)
```

## Evolution Memory

EvoClaw maintains structured memory in the target repository to avoid repeating failed attempts:

```
memory/
├── global/long_term.md           — cross-target lessons
├── targets/{id}/
│   ├── short_term/gen_{N}.md     — per-generation reflection
│   ├── long_term.md              — accumulated wisdom for this target
│   └── failures.md               — what NOT to try again
└── synergy/records.md            — cross-function combination results
```

## Branch Naming

```
gen-{N}/{target_id}/{op}-{V}             # single-target variant
gen-{N}/synergy/{targetA}+{targetB}-{V}  # cross-target combination
```

Tags: `seed-baseline`, `best-gen-{N}`, `best-overall`

---

## Acknowledgements

The following is a non-exhaustive list of papers and projects that informed our work:

- [From Understanding to Excelling: Template-Free Algorithm Design through Structural-Functional Co-Evolution](https://arxiv.org/abs/2503.10721)
- [Evolution of Heuristics: Towards Efficient Automatic Algorithm Design using Large Language Model](https://github.com/FeiLiu36/EoH)
- [LLM4AD: Large Language Model for Algorithm Design](https://github.com/Optima-CityU/LLM4AD)
