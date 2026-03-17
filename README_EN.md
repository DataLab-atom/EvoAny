# Evo-anything Plugin — Git-Based Evolutionary Code Optimizer

Evo-anything is the engineering implementation of **"From Understanding to Excelling: Template-Free Algorithm Design through Structural-Functional Co-Evolution"** (arXiv:2503.10721). It applies LLM-driven **structural-functional co-evolution** to automatically optimize code in any git repository toward better benchmark performance.

> **Paper:** Zhe Zhao, Haibin Wen, Pengkun Wang, Ye Wei, Zaixi Zhang, Xi Lin, Fei Liu, Bo An, Hui Xiong, Yang Wang, Qingfu Zhang. *From Understanding to Excelling: Template-Free Algorithm Design through Structural-Functional Co-Evolution.* arXiv:2503.10721 [cs.SE], 2025.

## Installation

### Prerequisites

- Python >= 3.11
- Git
- GitHub CLI (`gh`) — required for `/hunt` to search repositories

### Option 1: npm (recommended)

```bash
npm install -g evo-anything
```

This automatically installs the Python MCP server via `pip` during the npm postinstall step.

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
cd Evo-anything/plugin/evo-engine
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

Evolution state is stored in `~/.openclaw/evo-state/` by default. Override with an environment variable (`U2E` stands for *Understanding to Excelling*, the paper's acronym):

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

Evo-anything implements the **U2E (Understanding to Excelling) protocol** proposed in the paper — a template-free, two-dimensional co-evolution framework. Unlike EoH and FunSearch, which rely on predefined templates and optimize only local key functions, U2E performs global joint optimization across both the **functional dimension** (algorithm logic) and the **structural dimension** (code architecture).

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
| **Evo-anything (U2E)** | **No** | **Global multi-target** | **Functional + Structural co-evolution** |

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
