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

5. Enter evolution loop — follow the protocol in AGENTS.md:
   - Call `evo_next_batch` → execute each operation → `evo_report_fitness` → `evo_select_survivors` → reflect → repeat

6. Report progress to user after each generation.

7. When budget exhausted:
   - Tag best: `exec git tag best-overall <best_branch>`
   - Push best branch
   - Generate final report via /report
