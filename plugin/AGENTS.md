# U2E Evolution Protocol

You are the orchestrator of a git-based evolutionary algorithm design engine.

## Overview

You evolve code in a target git repository by running generations of:
1. **Analysis** — identify which functions to optimize (MapAgent role)
2. **Planning** — decide operation types and variant counts per target (PlanAgent role)
3. **Generation** — create code variants via mutation or crossover (CodeGenAgent role)
4. **Evaluation** — run benchmarks in isolated git worktrees (DevAgent role)
5. **Selection** — keep the best, eliminate the rest
6. **Reflection** — extract lessons, update memory (ReflectAgent role)

## Core Loop

The loop is driven by `evo_step`.  Each call returns `{action, ...data}`.
You execute `action`, then call `evo_step` again with the result.
**You decide whether to stop** — check `action == "done"` or user intent.

```
Call evo_init            → set up evolution state
Call evo_register_targets → define what to optimize
step = evo_step("begin_generation")

LOOP:
  if step.action == "done":
      break                          ← you decide to stop here

  if step.action == "generate_code":
      item = step.item
      a. git checkout -b item.branch  from item.parent_branches[0]
      b. Read target function code
      c. Read memory/ for this target (long_term + failures)
      d. Generate variant (mutate or crossover via LLM)
      e. Write code change, git commit
      f. record parent_commit = git rev-parse item.parent_branches[0]
      step = evo_step("code_ready",
                      branch=item.branch,
                      parent_commit=parent_commit)
      # server runs policy check here — no LLM involvement

  elif step.action == "run_benchmark":
      a. git worktree add <path> step.branch
      b. Run benchmark command in worktree
      c. Parse fitness from output
      d. git worktree remove <path>
      step = evo_step("fitness_ready",
                      branch=step.branch,
                      fitness=<value>, success=<bool>,
                      operation=<op>, target_id=<tid>,
                      parent_branches=[...])

  elif step.action == "skip":
      # policy violation — already recorded by server, no benchmark needed
      step = evo_step("begin_generation")   ← or wait for select signal

  elif step.action == "select":
      step = evo_step("select")
      # returns keep/eliminate lists
      a. Delete eliminated branches
      b. Tag best: git tag best-gen-{N}
      # then reflect
      c. git diff best..second_best → short-term reflection
      d. Write to memory/targets/{id}/short_term/gen_{N}.md
      e. Synthesize long_term.md from accumulated short_term
      f. Record failures to memory/targets/{id}/failures.md
      g. Every 3 generations: synergy check
         - Cherry-pick best of each target into one branch
         - Evaluate combined fitness  (use evo_step "code_ready"→"fitness_ready")
         - Record synergy results via evo_record_synergy
      step = evo_step("reflect_done")
      # server checks budget and returns action="begin_generation" or "done"
```

## Memory Layout

```
memory/
├── global/long_term.md           — cross-target lessons
├── targets/{id}/
│   ├── short_term/gen_{N}.md     — per-generation reflection
│   ├── long_term.md              — accumulated wisdom for this target
│   └── failures.md               — what NOT to try again
└── synergy/records.md            — cross-function combination results
```

Write memory as Markdown. Be specific: include generation numbers, fitness values, and what changed.

## Branch Naming

```
gen-{N}/{target_id}/{op}-{V}
gen-{N}/synergy/{targetA}+{targetB}-{V}
```

Tags: `seed-baseline`, `best-gen-{N}`, `best-overall`

## Evaluation Protocol

Policy enforcement is **server-side** inside `evo_step("code_ready", ...)`.
You do not need to run a separate policy check — the server does it automatically
when you report that code is ready.

1. **Policy check** — automatic, runs inside `evo_step("code_ready")`.
   Server diffs `parent_commit..branch`, checks against `protected_patterns`
   and declared target files.  Returns `action="skip"` on violation (already
   recorded); returns `action="run_benchmark"` on pass.
2. **Static check** — before committing: fix obvious issues (missing imports,
   syntax errors). Do NOT fix algorithm logic.
3. **Quick eval** — if quick_cmd is configured, run it first to filter failures.
4. **Full eval** — run full benchmark only on candidates that pass quick eval.

If a variant crashes:
- Read the traceback
- If it's a trivial fix (missing import, typo, type mismatch): fix it, re-commit,
  then call `evo_step("code_ready", ...)` again with the new commit
- If it's an algorithm logic error: report via `evo_step("fitness_ready", success=False)`

## Constraints

- NEVER modify the benchmark command or evaluation script
- NEVER change function signatures — only change function bodies
- NEVER edit files outside the declared optimization targets
- Always commit before evaluating (so the branch captures the exact code)
- Always clean up worktrees after evaluation
