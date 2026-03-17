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

The `begin_generation` response also tells you:
```json
{
  "objectives": [
    {"name": "latency", "direction": "min"},
    {"name": "accuracy", "direction": "max"}
  ],
  "benchmark_format": "numbers"
}
```

Keep these in scope — you need them in step 3.

## Flow

### 1. CodeGen — generate the variant

```
git checkout -b {item.branch} {item.parent_branches[0]}
parent_commit = git rev-parse {item.parent_branches[0]}
```

Read context:
- Read the target function code from `item.target_file`
- Read `memory/targets/{item.target_id}/long_term.md` for accumulated wisdom
- Read `memory/targets/{item.target_id}/failures.md` to avoid known bad paths
- If `operation == "crossover"`: also read code from `parent_branches[1]`

**Choose generation method based on operation complexity:**

#### Simple mutate (default)

For localized changes (loss function tweak, hyperparameter, single algorithm swap):
- Generate variant directly using `edit`/`write`
- Keep function signature unchanged

#### Complex mutate or crossover (use `coding-agent` when available)

For structural changes, crossover between significantly different branches,
or when the target function has complex dependencies:

**If `claude` CLI is available** (preferred):
```
cd <repo>
claude --permission-mode bypassPermissions --print \
  "Rewrite `{item.target_function}` in `{item.target_file}`.
   Operation: {item.operation}.
   {if crossover: 'Merge best ideas from both parents:' + diff of both}
   Constraints:
   - Keep function signature EXACTLY unchanged: {signature}
   - Only modify the function body, no other files
   - Apply lessons: {long_term.md summary}
   - Avoid: {failures.md summary}"
```

**If `codex` CLI is available** (alternative):
```
bash pty:true workdir:<repo> command:"codex exec --full-auto '{instruction}'"
```

After coding-agent completes, verify only `item.target_file` was changed and signature is intact.

### 1b. Static validation — before committing

**Always run this after generating the variant, regardless of method:**

```bash
# Syntax check — zero overhead, catches crashes immediately
python -m py_compile {item.target_file}
```

If syntax check fails:
- If error is trivial (missing colon, unmatched paren, wrong indent): fix it inline and re-check
- If error is structural (logic changed the function shape): regenerate from scratch

```bash
# Import / name check — catches undefined vars, bad imports
pyflakes {item.target_file}   # if pyflakes installed
# or: python -c "import ast; ast.parse(open('{item.target_file}').read())"
```

Flag any new `NameError` or `ImportError` risks introduced by the variant.

**Only commit after static validation passes.** This prevents wasting a benchmark slot on code that would crash in the first line.

```
git add {item.target_file}
git commit -m "gen-{N}/{target_id}/{operation}: {one-line description of change}"
```

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
  # Returns: {action: "run_benchmark", benchmark_cmd, benchmark_format, objectives, ...}
  ```

- If PolicyAgent rejects:
  ```
  evo_step("policy_fail", branch=item.branch, reason="...")
  ```
  Exit early.

### 3. Benchmark — evaluate the variant

```
git worktree add /tmp/eval-{branch} {step.branch}
```

**Choose execution mode based on expected benchmark duration:**

#### Short benchmark (<30s, e.g. unit eval, small dataset)

```
exec cd /tmp/eval-{branch} && {step.benchmark_cmd}
```

Capture stdout + stderr.

#### Long benchmark (>30s, e.g. GPU training, large eval set)

**If `tmux` is available:**

```bash
# Start benchmark in a named tmux session
tmux new-session -d -s eval-{short_branch_id} \
  "cd /tmp/eval-{branch} && {step.benchmark_cmd} 2>&1 | tee /tmp/eval-{branch}/output.log; echo EXIT_CODE:$? >> /tmp/eval-{branch}/output.log"
```

Poll until done:
```bash
# Check if session is still running (every 30s)
tmux has-session -t eval-{short_branch_id}   # exits 1 when done

# Read output so far
tail -50 /tmp/eval-{branch}/output.log
```

When session ends, read full output and extract fitness.

```bash
tmux kill-session -t eval-{short_branch_id}  # cleanup
```

**If `tmux` not available:** use blocking `exec` as before.

```
git worktree remove /tmp/eval-{branch}
```

#### Parsing fitness from output

Use `step.benchmark_format` to decide how to parse:

**`benchmark_format == "numbers"` (default)**

Parse the last non-empty line of stdout as whitespace-separated numbers,
one per objective in the order given by `step.objectives`.

```
# Single-objective example — last line: "42.7"
fitness_values = [42.7]

# Multi-objective example — last line: "1.23 0.91"
# objectives: [latency (min), accuracy (max)]
fitness_values = [1.23, 0.91]
```

**`benchmark_format == "json"`**

Parse the last non-empty line of stdout as a JSON object.
Extract values in objective order.

```
# Last line: {"latency": 1.23, "accuracy": 0.91}
# objectives: [latency, accuracy]
fitness_values = [1.23, 0.91]
```

If the variant crashes (after static check passed):
- Trivial runtime fix (wrong tensor dtype, device mismatch): fix, re-commit, retry `evo_step("code_ready")`
- Logic error: report `success=False` with `fitness_values=[]`

### 4. Report

```
evo_step("fitness_ready",
         branch=step.branch,
         fitness_values=fitness_values,   # list[float], one per objective
         success=true/false,
         operation=step.operation,
         target_id=step.target_id,
         parent_branches=step.parent_branches)
```

**Single-objective example:**
```
evo_step("fitness_ready", branch=..., fitness_values=[42.7], success=True, ...)
```

**Multi-objective example:**
```
evo_step("fitness_ready", branch=..., fitness_values=[1.23, 0.91], success=True, ...)
```

The response includes `on_pareto_front: true/false` — log this for the user.

## Tools

- `read` / `edit` / `write` — code generation (simple mutations)
- `/coding-agent` — **preferred for crossover and complex mutations** (requires `claude` or `codex`)
- `exec python -m py_compile` — **static check before committing** (always run)
- `exec pyflakes` — import/name check (run if available)
- `exec git` — branch creation, worktree management
- `exec` — short benchmark execution
- `tmux` — **long benchmark execution** (non-blocking, requires tmux)
- `evo_step` — advance the state machine
- `evo_check_cache` — skip duplicates
