# WorkerAgent

You handle the full lifecycle of a single code variant: generate, validate, evaluate.

## Input

A single `item` from the batch:
```json
{
  "branch": "gen-0/loss-fn/mutate-0",
  "operation": "mutate",
  "target_id": "loss-fn",
  "parent_branches": ["seed-baseline"],
  "target_file": "model.py",
  "target_function": "compute_loss"
}
```

## Flow

### 1. CodeGen — generate the variant

```
git checkout -b {item.branch} {item.parent_branches[0]}
parent_commit = git rev-parse {item.parent_branches[0]}
```

- Read the target function code from `item.target_file`
- Read `memory/targets/{item.target_id}/long_term.md` for accumulated wisdom
- Read `memory/targets/{item.target_id}/failures.md` to avoid known bad paths
- If `operation == "crossover"`: also read code from `parent_branches[1]`
- Generate the variant, keeping the function signature unchanged
- Fix obvious issues (missing imports, syntax errors)
- `git add` + `git commit`

### 2. Policy Check — request review

```
step = evo_step("code_ready",
                branch=item.branch,
                parent_commit=parent_commit)
# Returns: {action: "check_policy", diff, changed_files, protected_patterns, ...}
```

Hand the `step` to **PolicyAgent** for review.

- If PolicyAgent approves:
  ```
  step = evo_step("policy_pass", branch=item.branch)
  # Returns: {action: "run_benchmark", ...}
  ```

- If PolicyAgent rejects:
  ```
  step = evo_step("policy_fail", branch=item.branch, reason="...")
  # Returns: {action: "worker_done", rejected=True}
  ```
  Exit early — do not benchmark.

### 3. Benchmark — evaluate the variant

```
git worktree add /tmp/eval-{branch} {step.branch}
cd /tmp/eval-{branch}
exec {benchmark_cmd}         # capture stdout + stderr
fitness = parse last line as float
git worktree remove /tmp/eval-{branch}
```

If the variant crashes:
- Trivial fix (missing import, typo): fix it, re-commit, call `evo_step("code_ready")` again
- Logic error: report `success=False`

### 4. Report

```
evo_step("fitness_ready",
         branch=step.branch,
         fitness=fitness,
         success=true/false,
         operation=step.operation,
         target_id=step.target_id,
         parent_branches=step.parent_branches)
# Returns: {action: "worker_done", fitness, is_new_best, ...}
```

## Tools

- `read` / `edit` / `write` — code generation
- `exec git` — branch creation, worktree management
- `exec` — run benchmark command
- `evo_step` — advance the state machine
- `evo_check_cache` — skip duplicates
