# Evo-anything Plugin — Git-Based Evolutionary Code Optimizer

Evo-anything is a git-based evolutionary algorithm design engine. Driven by LLM-powered mutation, crossover, and reflection, it automatically evolves code in any git repository to achieve better benchmark performance.

## Installation

### Prerequisites

- Python >= 3.11
- Git
- GitHub CLI (`gh`) — required for `/hunt` to search repositories

### Step 1: Install evo-engine (required for all platforms)

```bash
git clone https://github.com/DataLab-atom/Evo-anythin.git
cd Evo-anythin/plugin/evo-engine
pip install .
```

---

### OpenClaw

<details>
<summary>CLI one-liner (recommended)</summary>

```bash
openclaw plugins install openclaw-evo
openclaw gateway restart
openclaw plugins doctor   # verify
```

</details>

<details>
<summary>Local development mode</summary>

```bash
openclaw plugins install -l ./plugin
openclaw gateway restart
```

</details>

<details>
<summary>Manual install</summary>

Copy the plugin to the extensions directory and register it in `~/.openclaw/openclaw.json`:

```bash
cp -r plugin/ ~/.openclaw/extensions/openclaw-evo/
```

```json
{
  "plugins": {
    "entries": {
      "openclaw-evo": {
        "enabled": true,
        "config": {}
      }
    }
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

**Verify:** Type `/status` in a conversation. Seeing "Evolution not initialized" means the install succeeded.

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

Evo-anything's core is a standard [MCP](https://modelcontextprotocol.io) server. Any client that supports MCP stdio transport can connect:

```bash
# Start the server directly (stdio mode)
evo-engine

# Or run as a Python module
python -m plugin.evo-engine.server
```

Available MCP tools: `evo_init`, `evo_register_targets`, `evo_next_batch`, `evo_report_fitness`, `evo_select_survivors`, `evo_get_status`, `evo_get_lineage`, `evo_freeze_target`, `evo_boost_target`, `evo_record_synergy`, `evo_check_cache`.

---

### Optional Configuration

Evolution state is stored in `~/.openclaw/evo-state/` by default. Override with an environment variable:

```bash
export U2E_STATE_DIR=/path/to/your/state
```

Or configure via `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "openclaw-evo": {
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
  clone → pip install → download data → run baseline to confirm it works
         ↓
  Automatically calls /evolve → evolution loop begins
         ↓
  Progress report after each generation
         ↓
  Pushes best branch + sends final report when done
```

## How It Works

Evo-anything models code optimization as an evolutionary process, with every experiment tracked as a git branch:

1. **Analysis** — identify target functions (which code is worth optimizing)
2. **Planning** — decide mutation/crossover strategy and variant counts per round
3. **Generation** — generate code variants via LLM
4. **Evaluation** — run benchmarks in isolated git worktrees
5. **Selection** — keep the best, discard the rest
6. **Reflection** — extract lessons, write to memory

The best result of each generation is tagged (`best-gen-{N}`), and the final `best-overall` branch is pushed.

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
Evo-anythin/
├── LICENSE
├── README.md
├── README_EN.md
└── plugin/
    ├── openclaw.plugin.json   # plugin definition
    ├── AGENTS.md              # evolution protocol (core loop)
    ├── SOUL.md                # agent persona
    ├── TOOLS.md               # tool usage conventions
    ├── evo-engine/            # evolution engine (MCP server)
    │   ├── server.py          # MCP tool interface
    │   ├── models.py          # data models
    │   └── selection.py       # selection algorithms
    └── skills/                # user-invocable skills
        ├── hunt/              # search and deploy a codebase
        ├── evolve/            # start evolution loop
        ├── status/            # check progress
        ├── report/            # generate report
        ├── boost/             # boost target priority
        └── freeze/            # freeze a target
```

## Evolution Memory

Evo-anything maintains structured memory in the target repository to avoid repeating failed attempts:

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

## License

MIT
