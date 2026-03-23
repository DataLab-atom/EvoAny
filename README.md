<p align="center">
  <img src="./images/image.png" alt="EvoClaw Logo" width="220" />
</p>

# EvoClaw Plugin — Git-Based Evolutionary Code Optimizer
<div align="center">

[![文档](https://img.shields.io/badge/文档-中文版-blue.svg)](https://github.com/DataLab-atom/Evo-anything/blob/main/README_ZN.md)
[![document](https://img.shields.io/badge/document-English-blue.svg)](https://github.com/DataLab-atom/Evo-anything/blob/main/README.md)
[![License](https://img.shields.io/badge/License-Apache-blue.svg)](https://github.com/DataLab-atom/Evo-anything/blob/main/LICENSE)

</div>

![Demo Framework Diagram](./images/system_overview.png)

EvoClaw is an automated evolutionary optimization system for any git repository with a benchmark or evaluation script. It uses an LLM-driven **structural-functional co-evolution** workflow to automatically identify optimization targets, generate code variants, execute benchmark evaluations, and continuously select and retain better-performing implementations across multiple iterations.

As an engineering-oriented evolution engine integrated into the OpenClaw/MCP ecosystem, EvoClaw treats git branches as candidate individuals and benchmark results as fitness. By combining multi-objective selection, policy constraints, and cross-generation memory, it enables automatic, traceable, and sustained optimization of algorithms, model training code, and other software repositories with quantitative evaluation pipelines.

## Demo Example
<div align="center">

https://github.com/user-attachments/assets/94b63348-de0d-4602-a2ce-3e73740656e2

</div>

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

### Option 2: Manual

#### Step 1: Install evo-engine (required for all platforms)

```bash
git clone https://github.com/DataLab-atom/Evo-anything.git
cd Evo-anything
npm install && npm run build
```

---

### OpenClaw

<details>
<summary>Recommended install</summary>

```bash
npx evo-anything setup
openclaw gateway restart
```

`setup` installs the plugin into `~/.openclaw/extensions/evo-anything`, enables it in `plugins.allow` and `plugins.entries`, registers bundled skills, and adds `"evo-anything"` to `tools.alsoAllow` so `evo_*` tools appear in agent tool tables.

</details>

<details>
<summary>Local development mode</summary>

```bash
npm run build
npx evo-anything setup
openclaw gateway restart
```

Use this after changing `plugin/index.ts`, `plugin/server.ts`, or any other code that affects `dist/`.

</details>

<details>
<summary>Manual install</summary>

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

---

### Claude Code

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

---

### Cursor

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

---

### Windsurf

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

---

### Any Other MCP-Compatible Client

EvoClaw's core is a standard [MCP](https://modelcontextprotocol.io) server. Any client that supports MCP stdio transport can connect:

```bash
# Start the server directly (stdio mode)
evo-engine
```

Available MCP tools: `evo_init`, `evo_register_targets`, `evo_report_seed`, `evo_step`, `evo_next_batch`, `evo_report_fitness`, `evo_select_survivors`, `evo_revalidate_targets`, `evo_get_status`, `evo_get_lineage`, `evo_freeze_target`, `evo_boost_target`, `evo_record_synergy`, `evo_check_cache`.

---

### Optional Configuration

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
You send: I want SOTA on CIFAR-100-LT
         ↓
  /hunt triggers automatically
         ↓
  Searches GitHub → finds 3 candidates → asks which one
         ↓
  You say: use #1
         ↓
  clone → install deps → download data → run baseline to confirm it works
         ↓
  Automatically calls /evolve → evolution loop begins
         ↓
  Progress report after each generation
         ↓
  Pushes best branch + sends final report when done
```

## How It Works

EvoClaw implements the **U2E (Understanding to Excelling) protocol** proposed in the paper — a template-free, two-dimensional co-evolution framework. Unlike EoH and FunSearch, which rely on predefined templates and optimize only local key functions, U2E performs global joint optimization across both the **functional dimension** (algorithm logic) and the **structural dimension** (code architecture).

Every experiment is tracked as a git branch. The evolution loop has six stages:

1. **Analysis** — automatically identify key algorithm modules worth optimizing
2. **Planning** — decide mutation/crossover strategy and variant counts; adaptively allocate budget by temperature per target
3. **Generation** — LLM generates code variants (mutation: single-parent refinement; crossover: two-parent combination)
4. **Evaluation** — run benchmarks in isolated git worktrees
5. **Selection** — keep the best, discard the rest; run cross-target Synergy checks every N generations
6. **Reflection** — extract lessons into structured memory to guide future evolution

The best result of each generation is tagged (`best-gen-{N}`), and the final `best-overall` branch is pushed.

### Comparison with Prior Work

| Method | Template Required | Optimization Scope | Structural Evolution |
|--------|------------------|--------------------|----------------------|
| EoH / FunSearch | Yes (predefined) | Local functions | No |
| **EvoClaw (U2E)** | **No** | **Global multi-target** | **Functional + Structural co-evolution** |

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

## Acknowledgements

The following is a non-exhaustive list of papers and projects that informed our work:

- [From Understanding to Excelling: Template-Free Algorithm Design through Structural-Functional Co-Evolution](https://arxiv.org/abs/2503.10721)
- [Evolution of Heuristics: Towards Efficient Automatic Algorithm Design using Large Language Model](https://github.com/FeiLiu36/EoH)
- [LLM4AD: Large Language Model for Algorithm Design](https://github.com/Optima-CityU/LLM4AD)
