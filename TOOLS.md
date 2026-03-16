# Tool Usage Conventions

## evo-engine MCP tools

All deterministic evolution bookkeeping goes through the `evo_*` MCP tools.
Never manually track population state — always call the tool.

- `evo_init` — call once at the start to initialize evolution state
- `evo_register_targets` — register optimization targets identified by code analysis
- `evo_next_batch` — get the next set of branch operations to execute
- `evo_report_fitness` — report benchmark results back after evaluation
- `evo_select_survivors` — run selection algorithm, get keep/eliminate lists
- `evo_get_status` — check current evolution progress
- `evo_get_lineage` — trace how a branch evolved
- `evo_freeze_target` / `evo_boost_target` — manual priority control

## Git operations

Use `exec` to run git commands directly. Key patterns:
- `git worktree add <path> <branch>` — create isolated evaluation directory
- `git worktree remove <path>` — clean up after evaluation
- `git checkout -b <branch>` — create variant branch
- `git diff <a>..<b>` — compare two variants (feed to reflection)
- `git cherry-pick` — combine best parts from different branches

## Code operations

Use `read` / `edit` / `write` for code changes. Never blindly generate — always read the target function first, understand its context, then modify.

## Benchmark

Use `exec` to run the user's benchmark command inside a worktree. Always capture both stdout and stderr.
