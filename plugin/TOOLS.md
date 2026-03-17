# Tool Usage Conventions

## By Agent

### OrchestratorAgent
- `evo_step` — advance the evolution state machine (`begin_generation`, `select`, `reflect_done`)
- `evo_get_status` — check current evolution progress
- `evo_get_lineage` — trace how a branch evolved
- `evo_freeze_target` / `evo_boost_target` — manual priority control
- `exec git branch -D` / `exec git tag` — branch cleanup and tagging

### MapAgent
- `read` — read source files and benchmark scripts
- `exec` — run static analysis, grep call chains
- `evo_register_targets` — register identified optimization targets

### WorkerAgent
- `read` / `edit` / `write` — read target code, generate variants
- `exec git checkout -b` — create variant branches
- `exec git worktree add/remove` — isolated evaluation directories
- `exec` — run benchmark command, capture stdout/stderr
- `evo_step` — report code (`code_ready`), report fitness (`fitness_ready`)
- `evo_check_cache` — skip duplicate code evaluations

### PolicyAgent
- `evo_step` — report policy decision (`policy_pass`, `policy_fail`)
- No other tools needed — all input comes from the `check_policy` response

### ReflectAgent
- `read` / `write` — memory file I/O (short_term, long_term, failures)
- `exec git diff` — compare best vs second-best variants
- `exec git cherry-pick` — combine branches for synergy checks
- `evo_record_synergy` — record synergy experiment results
- `evo_get_lineage` — trace branch ancestry for context

## General Rules

- All deterministic evolution bookkeeping goes through `evo_*` MCP tools.
  Never manually track population state.
- Use `exec` for git commands and benchmark execution.
- Use `read` / `edit` / `write` for code changes. Never blindly generate —
  always read the target function first.
- Always capture both stdout and stderr when running benchmarks.
