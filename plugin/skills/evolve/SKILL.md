---
name: evolve
description: "Start evolutionary optimization on a git repository"
---

# /evolve — Start Evolution

User provides: repo path, benchmark command, objective (min/max), and optionally max evaluations.

## Steps

1. Validate the repo:
   - `exec git -C $ARGUMENTS status --porcelain` — must be clean
   - `exec git -C $ARGUMENTS rev-parse HEAD` — record seed commit

2. Run baseline:
   - `exec` the benchmark command in the repo
   - Parse fitness from output (last line as float by default)
   - Call `evo_init` with user's config
   - Call `evo_report_seed` with baseline fitness
   - `exec git -C <repo> tag seed-baseline`

3. Analyze code (MapAgent role):
   - Read the benchmark entry file
   - Trace call chain to find optimization targets
   - Call `evo_register_targets` with identified targets

4. Create memory structure:
   - `exec mkdir -p <repo>/memory/global`
   - For each target: `exec mkdir -p <repo>/memory/targets/<id>/short_term`

5. Enter evolution loop using `evo_step` — follow the Core Loop in AGENTS.md:
   - Start with `evo_step("begin_generation")`
   - Each call returns `{action, ...data}`; execute the action, then call `evo_step` again
   - **Policy check is automatic**: calling `evo_step("code_ready", branch=..., parent_commit=...)`
     triggers a server-side git diff; the server returns `action="run_benchmark"` (pass)
     or the next `generate_code`/`select` action with `policy_violation` set (violation,
     already recorded — no benchmark needed)
   - Stop when `action == "done"` or when you judge the results are sufficient

6. Report progress to user after each generation.

7. When budget exhausted:
   - Tag best: `exec git tag best-overall <best_branch>`
   - Push best branch
   - Generate final report via /report
