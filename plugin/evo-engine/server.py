"""
U2E Evolution Engine — MCP Server

Handles all deterministic evolution bookkeeping:
population state, selection, batch planning, lineage tracking.

The agent calls these tools; the LLM handles code generation and reflection.

Multi-objective support
-----------------------
fitness is always a list[float] with one value per objective (same order as
config.objectives).  Single-objective runs use a list of length 1.

evo_init accepts an `objectives` parameter:
  - list of {"name": str, "direction": "min"|"max"} dicts
  - if omitted, defaults to [{"name": "score", "direction": "min"}] for
    backward compatibility with single-objective callers.

Benchmark output format is controlled by `benchmark_format`:
  - "numbers" (default): last whitespace-separated numbers on stdout,
    one per objective, in objective order.
  - "json": last line of stdout is a JSON dict keyed by objective name.
"""

from __future__ import annotations

import os
import random
import subprocess
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from models import (
    BatchItem,
    BenchmarkOutputFormat,
    BenchmarkSpec,
    EvolutionConfig,
    EvolutionState,
    Individual,
    Objective,
    ObjectiveSpec,
    Operation,
    SurvivorResult,
    Target,
    TargetStatus,
)
from selection import (
    dominates,
    pareto_front_of,
    plan_generation,
    rank_select,
    representative_branch,
    select_survivors,
    update_temperatures,
)

mcp = FastMCP("evo-engine", instructions="U2E evolutionary algorithm bookkeeping")

# ---------------------------------------------------------------------------
# State persistence
# ---------------------------------------------------------------------------

_STATE_DIR = os.environ.get("U2E_STATE_DIR", os.path.expanduser("~/.openclaw/u2e-state"))
_state: EvolutionState | None = None

# Structural operators for random assignment in batch planning.
_STRUCTURAL_OPS = [
    "insert", "merge", "decouple", "split", "extract",
    "parallelize", "pipeline", "stratify", "cache",
]


def _state_path() -> Path:
    return Path(_STATE_DIR) / "state.json"


def _save() -> None:
    if _state is None:
        return
    p = _state_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(_state.model_dump_json(indent=2))


def _load() -> EvolutionState | None:
    p = _state_path()
    if p.exists():
        return EvolutionState.model_validate_json(p.read_text())
    return None


def _get_state() -> EvolutionState:
    global _state
    if _state is None:
        _state = _load()
    if _state is None:
        raise RuntimeError("Evolution not initialized. Call evo_init first.")
    return _state


# ---------------------------------------------------------------------------
# Pareto bookkeeping helpers
# ---------------------------------------------------------------------------


def _update_global_pareto(state: EvolutionState) -> None:
    """Recompute the global Pareto front from all successful individuals."""
    all_valid = [
        ind for ind in state.individuals.values()
        if ind.success and ind.fitness is not None
    ]
    front = pareto_front_of(all_valid, state.config.objectives)
    state.pareto_front = [ind.branch for ind in front]

    # Update representative best (best on first objective).
    rep = representative_branch(state.pareto_front, state.individuals, state.config.objectives)
    if rep:
        state.best_branch_overall = rep
        state.best_obj_overall = state.individuals[rep].fitness


def _update_target_pareto(state: EvolutionState, target_id: str) -> None:
    """Recompute the local Pareto front for a single target."""
    if target_id not in state.targets:
        return
    target = state.targets[target_id]
    active = state.active_branches.get(target_id, [])
    active_inds = [
        state.individuals[b] for b in active
        if b in state.individuals and state.individuals[b].success
        and state.individuals[b].fitness is not None
    ]
    if not active_inds:
        return
    front = pareto_front_of(active_inds, state.config.objectives)
    target.pareto_branches = [ind.branch for ind in front]

    rep = representative_branch(
        target.pareto_branches, state.individuals, state.config.objectives
    )
    if rep:
        target.current_best_branch = rep
        target.current_best_obj = state.individuals[rep].fitness


def _pareto_front_expanded(
    new_individuals: list[Individual],
    existing_front_branches: list[str],
    all_individuals: dict,
    objectives: list[ObjectiveSpec],
) -> bool:
    """Return True if any individual in *new_individuals* is not dominated
    by the existing Pareto front — i.e., the front would expand."""
    existing_fitnesses = [
        all_individuals[b].fitness
        for b in existing_front_branches
        if b in all_individuals and all_individuals[b].fitness is not None
    ]
    for ind in new_individuals:
        if ind.fitness is None:
            continue
        dominated = any(
            dominates(ef, ind.fitness, objectives)
            for ef in existing_fitnesses
        )
        if not dominated:
            return True
    return False


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool()
def evo_init(
    repo_path: str,
    benchmark_cmd: str,
    objectives: list[dict] | None = None,
    benchmark_format: str = "numbers",
    max_fe: int = 500,
    pop_size: int = 8,
    mutation_rate: float = 0.5,
    structural_rate: float = 0.2,
    synergy_interval: int = 3,
    top_k_survive: int = 5,
    quick_cmd: str = "",
    directions: list[str] | None = None,
) -> dict:
    """Initialize a new evolution run.

    Args:
        repo_path: Path to the target git repository.
        benchmark_cmd: Shell command that evaluates a code variant.
        objectives: List of objective specs.  Each entry is a dict with keys:
            "name" (str) and "direction" ("min" or "max").
            Example (multi-obj):  [{"name": "latency", "direction": "min"},
                                   {"name": "accuracy", "direction": "max"}]
            Example (single-obj): [{"name": "score", "direction": "min"}]
            Defaults to [{"name": "score", "direction": "min"}].
        benchmark_format: How to parse benchmark stdout.
            "numbers" — whitespace-separated numbers, one per objective, last
                        non-empty line.  Single-objective legacy default.
            "json"    — last non-empty line is a JSON object keyed by
                        objective name, e.g. {"latency": 1.2, "accuracy": 0.9}
        max_fe: Maximum number of fitness evaluations (budget).
        pop_size: Number of variants per target per generation.
        mutation_rate: Fraction of variants generated by mutation vs crossover.
        structural_rate: Fraction of each target's budget allocated to structural
            ops each generation.  Doubled (capped at 0.5) when stagnation >= 3.
        synergy_interval: Run synergy check every N generations.
        top_k_survive: Keep top K branches per target after selection.
        quick_cmd: Optional fast pre-filter command (single-objective number).
        directions: Optional list of domain-knowledge hints pre-loaded into
            memory/global/long_term.md before evolution starts.
            Example: ["Apply flash attention tiling patterns",
                      "Prefer SoA over AoS memory layout"]
    """
    global _state

    # Normalise objectives — default to single-objective minimisation.
    if not objectives:
        objectives = [{"name": "score", "direction": "min"}]

    obj_specs = [
        ObjectiveSpec(name=o["name"], direction=Objective(o["direction"]))
        for o in objectives
    ]

    fmt = BenchmarkOutputFormat(benchmark_format)
    benchmark = BenchmarkSpec(
        cmd=benchmark_cmd,
        output_format=fmt,
        quick_cmd=quick_cmd or None,
    )

    config = EvolutionConfig(
        repo_path=repo_path,
        benchmark=benchmark,
        objectives=obj_specs,
        max_fe=max_fe,
        pop_size=pop_size,
        mutation_rate=mutation_rate,
        structural_rate=structural_rate,
        synergy_interval=synergy_interval,
        top_k_survive=top_k_survive,
        directions=directions or [],
    )

    _state = EvolutionState(config=config)
    _save()

    # Pre-load directions into global memory so all agents benefit immediately.
    if directions:
        _write_directions_to_memory(directions, repo_path)

    return {
        "status": "initialized",
        "repo_path": repo_path,
        "objectives": [{"name": o.name, "direction": o.direction.value} for o in obj_specs],
        "benchmark_format": benchmark_format,
        "max_fe": max_fe,
        "pop_size": pop_size,
        "structural_rate": structural_rate,
        "directions_loaded": len(directions) if directions else 0,
    }


@mcp.tool()
def evo_register_targets(targets: list[dict]) -> dict:
    """Register optimization targets identified by code analysis.

    Args:
        targets: List of targets, each with keys:
            id, file, function, description (optional), hint (optional),
            impact (optional), derived_from (optional list of old target ids).

        When derived_from is provided (after a structural op splits/moves a
        target), the server copies accumulated memory from the parent target(s)
        and seeds the new target's parent pool with the parent's best branches.
    """
    state = _get_state()
    inherited: list[str] = []

    for t in targets:
        target = Target(
            id=t["id"],
            file=t["file"],
            function=t["function"],
            description=t.get("description", ""),
            hint=t.get("hint", ""),
            impact=t.get("impact", "medium"),
            derived_from=t.get("derived_from", []),
        )
        state.targets[target.id] = target
        state.active_branches[target.id] = []

        # Inherit memory and best branches from parent targets.
        for parent_id in target.derived_from:
            _inherit_from_parent(state, target, parent_id)
            inherited.append(f"{target.id} <- {parent_id}")

    _save()

    return {
        "registered": len(targets),
        "target_ids": [t["id"] for t in targets],
        "inherited": inherited,
    }


@mcp.tool()
def evo_report_seed(fitness_values: list[float]) -> dict:
    """Report the seed baseline fitness.

    Args:
        fitness_values: Objective values of the unmodified seed code,
            one per objective in the same order as config.objectives.
            For a single-objective run pass a one-element list, e.g. [42.0].
    """
    state = _get_state()
    state.seed_obj = fitness_values
    state.best_obj_overall = fitness_values
    state.total_evals += 1

    for target in state.targets.values():
        target.current_best_obj = fitness_values

    _save()

    return {
        "seed_obj": fitness_values,
        "objectives": [o.name for o in state.config.objectives],
        "total_evals": state.total_evals,
    }


@mcp.tool()
def evo_next_batch() -> dict:
    """Get the next batch of operations to execute.

    Returns a list of operations, each specifying:
    - branch: the branch name to create
    - operation: 'mutate', 'crossover', 'structural', or 'synergy'
    - target_id: which target this operates on
    - parent_branches: which branch(es) to base this on
    - target_file: the file containing the target function
    - target_function: the function name to modify
    - target_description: semantic description for fallback location search
    - target_hint: rough location hint (e.g. "class Trainer, mid-file")
    - structural_op: specific structural operator (non-empty only for 'structural')
    """
    state = _get_state()
    budget_remaining = state.config.max_fe - state.total_evals

    if budget_remaining <= 0:
        return {"done": True, "reason": "budget exhausted", "batch": []}

    plan = plan_generation(
        targets=state.targets,
        pop_size=state.config.pop_size,
        mutation_rate=state.config.mutation_rate,
        structural_rate=state.config.structural_rate,
        budget_remaining=budget_remaining,
        synergy_interval=state.config.synergy_interval,
        generation=state.generation,
    )

    batch: list[dict] = []
    var_counter: dict[str, int] = {}

    for item in plan:
        tid = item["target_id"]
        op = item["operation"]
        count = item["count"]

        for _ in range(count):
            key = f"{tid}/{op.value}"
            idx = var_counter.get(key, 0)
            var_counter[key] = idx + 1

            if op == Operation.SYNERGY:
                branch = f"gen-{state.generation}/synergy/{tid}-{idx}"
                parts = tid.split("+")
                parents = [
                    state.targets[p].current_best_branch
                    for p in parts
                    if p in state.targets and state.targets[p].current_best_branch
                ]
                batch.append(BatchItem(
                    branch=branch,
                    operation=op,
                    target_id=tid,
                    parent_branches=parents,
                    target_file="",
                    target_function="",
                ).model_dump())
            else:
                target = state.targets[tid]
                branch = f"gen-{state.generation}/{tid}/{op.value}-{idx}"
                parents = _choose_parents(state, tid, op)
                structural_op = (
                    random.choice(_STRUCTURAL_OPS) if op == Operation.STRUCTURAL else ""
                )
                batch.append(BatchItem(
                    branch=branch,
                    operation=op,
                    target_id=tid,
                    parent_branches=parents,
                    target_file=target.file,
                    target_function=target.function,
                    target_description=target.description,
                    target_hint=target.hint,
                    structural_op=structural_op,
                ).model_dump())

    # Store batch so evo_step("code_ready") can look up item metadata.
    state.current_batch = [BatchItem(**item) for item in batch]
    state.batch_cursor = 0
    _save()

    return {
        "generation": state.generation,
        "budget_remaining": budget_remaining,
        "objectives": [
            {"name": o.name, "direction": o.direction.value}
            for o in state.config.objectives
        ],
        "benchmark_format": state.config.benchmark.output_format.value,
        "batch_size": len(batch),
        "batch": batch,
    }


@mcp.tool()
def evo_report_fitness(
    branch: str,
    target_id: str,
    operation: str,
    parent_branches: list[str],
    fitness_values: list[float],
    success: bool,
    code_hash: str = "",
    raw_output: str = "",
) -> dict:
    """Report the fitness evaluation result for a branch.

    Args:
        branch: The branch that was evaluated.
        target_id: Which target was modified.
        operation: 'mutate', 'crossover', 'structural', or 'synergy'.
        parent_branches: Parent branch(es).
        fitness_values: Objective values, one per objective in config order.
            For a single-objective run pass a one-element list, e.g. [1.23].
        success: Whether the evaluation succeeded (False = crash/timeout).
        code_hash: Hash of the generated code (for deduplication).
        raw_output: Last lines of stdout (for debugging).
    """
    state = _get_state()

    n_obj = len(state.config.objectives)
    if success and len(fitness_values) != n_obj:
        return {
            "error": (
                f"fitness_values has {len(fitness_values)} element(s) but "
                f"{n_obj} objective(s) are configured "
                f"({[o.name for o in state.config.objectives]}). "
                "Pass one value per objective in config order."
            )
        }

    if code_hash and code_hash in state.fitness_cache:
        cached = state.fitness_cache[code_hash]
        state.total_evals += 1
        _save()
        return {"cached": True, "fitness_values": cached, "branch": branch}

    ind = Individual(
        branch=branch,
        generation=state.generation,
        target_id=target_id,
        operation=Operation(operation),
        parent_branches=parent_branches,
        fitness=fitness_values if success else None,
        success=success,
        code_hash=code_hash,
        raw_output=raw_output[:500] if raw_output else None,
    )

    state.individuals[branch] = ind
    state.total_evals += 1

    if code_hash and success:
        state.fitness_cache[code_hash] = fitness_values

    if target_id not in state.active_branches:
        state.active_branches[target_id] = []
    if success:
        state.active_branches[target_id].append(branch)
        _update_target_pareto(state, target_id)
        _update_global_pareto(state)

    _save()

    return {
        "branch": branch,
        "fitness_values": fitness_values if success else None,
        "success": success,
        "total_evals": state.total_evals,
        "on_pareto_front": branch in state.pareto_front,
    }


@mcp.tool()
def evo_select_survivors() -> dict:
    """Run NSGA-II selection at end of generation.

    Returns branches to keep and eliminate, advances the generation counter,
    and updates per-target temperatures.
    """
    state = _get_state()
    objectives = state.config.objectives

    all_keep: list[str] = []
    all_eliminate: list[str] = []

    for target_id, branches in state.active_branches.items():
        inds = [state.individuals[b] for b in branches if b in state.individuals]
        keep, elim = select_survivors(inds, state.config.top_k_survive, objectives)

        keep_branches = [ind.branch for ind in keep]
        elim_branches = [ind.branch for ind in elim]

        # Never eliminate any branch currently on the global Pareto front.
        for pf_branch in state.pareto_front:
            if pf_branch in elim_branches:
                elim_branches.remove(pf_branch)
                if pf_branch not in keep_branches:
                    keep_branches.append(pf_branch)

        state.active_branches[target_id] = keep_branches
        all_keep.extend(keep_branches)
        all_eliminate.extend(elim_branches)

        # Update stagnation: did this target's Pareto front expand this gen?
        if target_id in state.targets:
            target = state.targets[target_id]
            gen_inds = [
                state.individuals[b] for b in branches
                if b in state.individuals
                and state.individuals[b].generation == state.generation
                and state.individuals[b].success
                and state.individuals[b].fitness is not None
            ]
            prev_front = [
                b for b in target.pareto_branches
                if b in state.individuals
                and state.individuals[b].generation < state.generation
            ]
            if _pareto_front_expanded(gen_inds, prev_front, state.individuals, objectives):
                target.stagnation_count = 0
            else:
                target.stagnation_count += 1

        # Refresh local Pareto front after pruning.
        _update_target_pareto(state, target_id)

    # Refresh global Pareto front.
    _update_global_pareto(state)

    update_temperatures(state.targets)

    state.generation += 1
    _save()

    best_branch = state.best_branch_overall or state.seed_branch
    return SurvivorResult(
        keep=all_keep,
        eliminate=all_eliminate,
        best_branch=best_branch,
        best_obj=state.best_obj_overall,
        pareto_front_size=len(state.pareto_front),
    ).model_dump()


@mcp.tool()
def evo_get_status() -> dict:
    """Get current evolution status."""
    state = _get_state()

    target_status = {}
    for tid, target in state.targets.items():
        target_status[tid] = {
            "status": target.status.value,
            "temperature": round(target.temperature, 2),
            "current_best_obj": target.current_best_obj,
            "current_best_branch": target.current_best_branch,
            "pareto_front_size": len(target.pareto_branches),
            "stagnation": target.stagnation_count,
            "active_branches": len(state.active_branches.get(tid, [])),
        }

    pareto_summary = [
        {
            "branch": b,
            "fitness": state.individuals[b].fitness,
            "generation": state.individuals[b].generation,
            "target_id": state.individuals[b].target_id,
        }
        for b in state.pareto_front
        if b in state.individuals
    ]

    return {
        "generation": state.generation,
        "total_evals": state.total_evals,
        "budget_remaining": state.config.max_fe - state.total_evals,
        "objectives": [
            {"name": o.name, "direction": o.direction.value}
            for o in state.config.objectives
        ],
        "seed_obj": state.seed_obj,
        "best_obj_overall": state.best_obj_overall,
        "best_branch_overall": state.best_branch_overall,
        "pareto_front_size": len(state.pareto_front),
        "pareto_front": pareto_summary,
        "improvement": _calc_improvement(state),
        "targets": target_status,
    }


@mcp.tool()
def evo_get_lineage(branch: str) -> dict:
    """Trace the full ancestry of a branch.

    Args:
        branch: The branch to trace.
    """
    state = _get_state()

    lineage = []
    visited: set[str] = set()
    queue = [branch]

    while queue:
        b = queue.pop(0)
        if b in visited or b not in state.individuals:
            continue
        visited.add(b)
        ind = state.individuals[b]
        lineage.append({
            "branch": ind.branch,
            "generation": ind.generation,
            "target_id": ind.target_id,
            "operation": ind.operation.value,
            "parent_branches": ind.parent_branches,
            "fitness": ind.fitness,
            "pareto_rank": ind.pareto_rank,
            "success": ind.success,
        })
        queue.extend(ind.parent_branches)

    return {"branch": branch, "lineage": lineage}


@mcp.tool()
def evo_freeze_target(target_id: str) -> dict:
    """Freeze a target — stop evolving it.

    Args:
        target_id: The target to freeze.
    """
    state = _get_state()
    if target_id not in state.targets:
        return {"error": f"Target '{target_id}' not found"}
    state.targets[target_id].status = TargetStatus.FROZEN
    state.targets[target_id].temperature = 0.0
    _save()
    return {"target_id": target_id, "status": "frozen"}


@mcp.tool()
def evo_boost_target(target_id: str) -> dict:
    """Boost a target — increase its evolution priority.

    Args:
        target_id: The target to boost.
    """
    state = _get_state()
    if target_id not in state.targets:
        return {"error": f"Target '{target_id}' not found"}
    target = state.targets[target_id]
    target.status = TargetStatus.ACTIVE
    target.temperature = min(3.0, target.temperature + 1.0)
    target.stagnation_count = 0
    _save()
    return {"target_id": target_id, "temperature": target.temperature}


@mcp.tool()
def evo_record_synergy(
    branch: str,
    target_ids: list[str],
    fitness_values: list[float],
    success: bool,
    individual_fitnesses: dict[str, list[float]] | None = None,
) -> dict:
    """Record the result of a synergy (cross-function combination) experiment.

    Args:
        branch: The synergy branch.
        target_ids: Which targets were combined.
        fitness_values: Combined fitness, one value per objective.
        success: Whether the experiment succeeded.
        individual_fitnesses: Per-target fitness vectors for comparison,
            keyed by target_id.
    """
    state = _get_state()
    objectives = state.config.objectives

    # Synergy gain is computed per-objective (positive = combination helps).
    gain: dict[str, float] | None = None
    if individual_fitnesses and success:
        gain = {}
        for i, obj in enumerate(objectives):
            vals = [v[i] for v in individual_fitnesses.values() if len(v) > i]
            if not vals:
                continue
            individual_best = min(vals) if obj.direction == Objective.MIN else max(vals)
            combined = fitness_values[i]
            if obj.direction == Objective.MIN:
                gain[obj.name] = individual_best - combined  # positive = helps
            else:
                gain[obj.name] = combined - individual_best

    record = {
        "branch": branch,
        "generation": state.generation,
        "target_ids": target_ids,
        "fitness_values": fitness_values,
        "success": success,
        "individual_fitnesses": individual_fitnesses,
        "synergy_gain": gain,
    }
    state.synergy_records.append(record)
    _save()

    return record


@mcp.tool()
def evo_check_cache(code_hash: str) -> dict:
    """Check if a code variant was already evaluated.

    Args:
        code_hash: Hash of the normalized code.
    """
    state = _get_state()
    if code_hash in state.fitness_cache:
        return {"cached": True, "fitness_values": state.fitness_cache[code_hash]}
    return {"cached": False}


# ---------------------------------------------------------------------------
# evo_step — stateless loop driver
# ---------------------------------------------------------------------------

_PHASE_BEGIN       = "begin_generation"
_PHASE_CODE        = "code_ready"
_PHASE_POLICY_PASS = "policy_pass"
_PHASE_POLICY_FAIL = "policy_fail"
_PHASE_FITNESS     = "fitness_ready"
_PHASE_SELECT      = "select"
_PHASE_REFLECT     = "reflect_done"
_PHASE_DONE        = "done"


@mcp.tool()
def evo_step(
    phase: str,
    branch: str = "",
    parent_commit: str = "",
    fitness_values: list[float] | None = None,
    success: bool = True,
    operation: str = "",
    target_id: str = "",
    parent_branches: list[str] | None = None,
    code_hash: str = "",
    raw_output: str = "",
    reason: str = "",
) -> dict:
    """Multi-agent evolution loop driver.

    Called by the OrchestratorAgent and WorkerAgents to advance the evolution.
    Each call returns the next action to perform.

    Phases and what to pass → what is returned:

      "begin_generation"  → {action="dispatch_workers", items=[...]}
          Start a new generation. Returns ALL batch items for parallel dispatch.

      "code_ready"        → {action="check_policy", diff=..., changed_files=...}
          Worker committed code. Pass: branch, parent_commit.
          Returns diff + metadata for PolicyAgent to review.

      "policy_pass"       → {action="run_benchmark", branch, target_id, ...}
          PolicyAgent approved. Pass: branch.

      "policy_fail"       → {action="worker_done", rejected=True, reason=...}
          PolicyAgent rejected. Pass: branch, reason.

      "fitness_ready"     → {action="worker_done", fitness_values, success, ...}
          Worker ran benchmark. Pass: branch, fitness_values (list[float]),
          success, operation, target_id, parent_branches.
          fitness_values must have one value per objective in config order.

      "select"            → {action="reflect", keep=[...], eliminate=[...],
                             pareto_front_size=N}
          Orchestrator triggers selection after all workers report.

      "reflect_done"      → {action="dispatch_workers"} or {action="done"}
          ReflectAgent finished. Server starts next generation or ends.
    """
    state = _get_state()
    pb = parent_branches or []

    # ------------------------------------------------------------------ begin
    if phase == _PHASE_BEGIN:
        return _begin_generation_impl(state)

    # ------------------------------------------------------------------ code_ready
    if phase == _PHASE_CODE:
        if not branch:
            return {"error": "branch is required for phase 'code_ready'"}

        item = next((it for it in state.current_batch if it.branch == branch), None)

        parent = parent_commit
        if not parent and item and item.parent_branches:
            r = subprocess.run(
                ["git", "-C", state.config.repo_path, "rev-parse",
                 item.parent_branches[0]],
                capture_output=True, text=True,
            )
            parent = r.stdout.strip() if r.returncode == 0 else item.parent_branches[0]
        if not parent:
            return {"error": "Cannot determine parent commit for policy check. "
                             "Pass parent_commit= explicitly."}

        names_result = subprocess.run(
            ["git", "-C", state.config.repo_path, "diff", "--name-only",
             f"{parent}..{branch}"],
            capture_output=True, text=True,
        )
        changed_files = [f for f in names_result.stdout.strip().splitlines() if f]

        diff_result = subprocess.run(
            ["git", "-C", state.config.repo_path, "diff", f"{parent}..{branch}"],
            capture_output=True, text=True,
        )

        return {
            "action": "check_policy",
            "branch": branch,
            "parent_commit": parent,
            "target_id": item.target_id if item else "",
            "target_file": item.target_file if item else "",
            "operation": item.operation.value if item else "",
            "parent_branches": item.parent_branches if item else [],
            "changed_files": changed_files,
            "diff": diff_result.stdout[:8000],
            "protected_patterns": state.config.protected_patterns,
        }

    # ------------------------------------------------------------------ policy_pass
    if phase == _PHASE_POLICY_PASS:
        if not branch:
            return {"error": "branch is required for phase 'policy_pass'"}
        item = next((it for it in state.current_batch if it.branch == branch), None)
        return {
            "action": "run_benchmark",
            "branch": branch,
            "benchmark_cmd": state.config.benchmark.cmd,
            "quick_cmd": state.config.benchmark.quick_cmd,
            "benchmark_format": state.config.benchmark.output_format.value,
            "objectives": [
                {"name": o.name, "direction": o.direction.value}
                for o in state.config.objectives
            ],
            "target_id": item.target_id if item else target_id,
            "operation": item.operation.value if item else operation,
            "parent_branches": item.parent_branches if item else pb,
        }

    # ------------------------------------------------------------------ policy_fail
    if phase == _PHASE_POLICY_FAIL:
        if not branch:
            return {"error": "branch is required for phase 'policy_fail'"}
        item = next((it for it in state.current_batch if it.branch == branch), None)
        fail_reason = reason or raw_output or "policy violation"
        ind = Individual(
            branch=branch,
            generation=state.generation,
            target_id=item.target_id if item else target_id,
            operation=item.operation if item else Operation.MUTATE,
            parent_branches=item.parent_branches if item else pb,
            fitness=None,
            success=False,
            raw_output=f"policy_violation: {fail_reason}",
        )
        state.individuals[branch] = ind
        _save()
        return {
            "action": "worker_done",
            "branch": branch,
            "rejected": True,
            "reason": fail_reason,
        }

    # ------------------------------------------------------------------ fitness_ready
    if phase == _PHASE_FITNESS:
        fv = fitness_values or []

        # Validate length when the evaluation succeeded.
        n_obj = len(state.config.objectives)
        if success and len(fv) != n_obj:
            return {
                "error": (
                    f"fitness_values has {len(fv)} element(s) but "
                    f"{n_obj} objective(s) are configured "
                    f"({[o.name for o in state.config.objectives]}). "
                    "Pass one value per objective in config order."
                )
            }

        if code_hash and code_hash in state.fitness_cache:
            cached = state.fitness_cache[code_hash]
            state.total_evals += 1
            _save()
            return {
                "action": "worker_done",
                "branch": branch,
                "cached": True,
                "fitness_values": cached,
                "total_evals": state.total_evals,
            }

        ind = Individual(
            branch=branch,
            generation=state.generation,
            target_id=target_id,
            operation=Operation(operation) if operation else Operation.MUTATE,
            parent_branches=pb,
            fitness=fv if success else None,
            success=success,
            code_hash=code_hash,
            raw_output=raw_output[:500] if raw_output else None,
        )
        state.individuals[branch] = ind
        state.total_evals += 1

        if code_hash and success:
            state.fitness_cache[code_hash] = fv

        if target_id not in state.active_branches:
            state.active_branches[target_id] = []
        if success:
            state.active_branches[target_id].append(branch)
            _update_target_pareto(state, target_id)
            _update_global_pareto(state)

        _save()
        return {
            "action": "worker_done",
            "branch": branch,
            "fitness_values": fv if success else None,
            "success": success,
            "on_pareto_front": branch in state.pareto_front,
            "total_evals": state.total_evals,
        }

    # ------------------------------------------------------------------ select
    if phase == _PHASE_SELECT:
        result = evo_select_survivors()
        result["action"] = "reflect"
        return result

    # ------------------------------------------------------------------ reflect_done
    if phase == _PHASE_REFLECT:
        budget_remaining = state.config.max_fe - state.total_evals
        if budget_remaining <= 0:
            return {
                "action": _PHASE_DONE,
                "reason": "budget exhausted",
                "total_evals": state.total_evals,
                "best_obj": state.best_obj_overall,
                "pareto_front_size": len(state.pareto_front),
            }
        return _begin_generation_impl(state)

    return {
        "error": f"Unknown phase: {phase!r}. Valid phases: "
                 f"{_PHASE_BEGIN}, {_PHASE_CODE}, {_PHASE_POLICY_PASS}, "
                 f"{_PHASE_POLICY_FAIL}, {_PHASE_FITNESS}, "
                 f"{_PHASE_SELECT}, {_PHASE_REFLECT}",
    }


def _begin_generation_impl(state: EvolutionState) -> dict:
    """Plan and store the next generation batch; return all items for dispatch."""
    budget_remaining = state.config.max_fe - state.total_evals
    if budget_remaining <= 0:
        return {"action": _PHASE_DONE, "reason": "budget exhausted",
                "total_evals": state.total_evals}

    plan = plan_generation(
        targets=state.targets,
        pop_size=state.config.pop_size,
        mutation_rate=state.config.mutation_rate,
        structural_rate=state.config.structural_rate,
        budget_remaining=budget_remaining,
        synergy_interval=state.config.synergy_interval,
        generation=state.generation,
    )

    batch: list[BatchItem] = []
    var_counter: dict[str, int] = {}

    for item in plan:
        tid = item["target_id"]
        op = item["operation"]
        count = item["count"]
        for _ in range(count):
            key = f"{tid}/{op.value}"
            idx = var_counter.get(key, 0)
            var_counter[key] = idx + 1

            if op == Operation.SYNERGY:
                b = f"gen-{state.generation}/synergy/{tid}-{idx}"
                parts = tid.split("+")
                parents_list = [
                    state.targets[p].current_best_branch
                    for p in parts
                    if p in state.targets and state.targets[p].current_best_branch
                ]
                batch.append(BatchItem(
                    branch=b, operation=op, target_id=tid,
                    parent_branches=parents_list,
                    target_file="", target_function="",
                ))
            else:
                target = state.targets[tid]
                b = f"gen-{state.generation}/{tid}/{op.value}-{idx}"
                parents_list = _choose_parents(state, tid, op)
                structural_op = (
                    random.choice(_STRUCTURAL_OPS) if op == Operation.STRUCTURAL else ""
                )
                batch.append(BatchItem(
                    branch=b, operation=op, target_id=tid,
                    parent_branches=parents_list,
                    target_file=target.file,
                    target_function=target.function,
                    target_description=target.description,
                    target_hint=target.hint,
                    structural_op=structural_op,
                ))

    state.current_batch = batch
    state.batch_cursor = 0
    _save()

    if not batch:
        return {"action": _PHASE_DONE, "reason": "empty batch",
                "total_evals": state.total_evals}

    return {
        "action": "dispatch_workers",
        "generation": state.generation,
        "batch_size": len(batch),
        "objectives": [
            {"name": o.name, "direction": o.direction.value}
            for o in state.config.objectives
        ],
        "benchmark_format": state.config.benchmark.output_format.value,
        "items": [item.model_dump() for item in batch],
    }


# ---------------------------------------------------------------------------
# Parent selection helper
# ---------------------------------------------------------------------------


def _choose_parents(
    state: EvolutionState,
    target_id: str,
    op: Operation,
) -> list[str]:
    """Choose parent branches for a mutation or crossover operation.

    For mutations: randomly sample from the local Pareto front (promotes
    diversity — different trade-off solutions explore different directions).
    For crossovers: pick two distinct Pareto front members; if fewer than two
    are available fall back to active branches via rank_select.
    """
    target = state.targets[target_id]
    objectives = state.config.objectives

    pareto = target.pareto_branches
    active = state.active_branches.get(target_id, [])

    if op in (Operation.MUTATE, Operation.STRUCTURAL):
        if pareto:
            return [random.choice(pareto)]
        if target.current_best_branch:
            return [target.current_best_branch]
        return [state.seed_branch]

    # CROSSOVER — need two distinct parents.
    if len(pareto) >= 2:
        return list(random.sample(pareto, 2))

    # Fall back: rank_select from active branches.
    active_inds = [
        state.individuals[b] for b in active
        if b in state.individuals and state.individuals[b].success
    ]
    pairs = rank_select(active_inds, 1, objectives)
    if pairs:
        return [pairs[0][0].branch, pairs[0][1].branch]
    if target.current_best_branch:
        return [target.current_best_branch]
    return [state.seed_branch]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _calc_improvement(state: EvolutionState) -> dict[str, str] | None:
    """Return per-objective improvement percentages vs seed baseline."""
    if state.seed_obj is None or state.best_obj_overall is None:
        return None
    result: dict[str, str] = {}
    for i, obj in enumerate(state.config.objectives):
        seed_val = state.seed_obj[i]
        best_val = state.best_obj_overall[i]
        if seed_val == 0:
            continue
        pct = (best_val - seed_val) / abs(seed_val) * 100
        result[obj.name] = f"{pct:+.1f}%"
    return result or None


def _write_directions_to_memory(directions: list[str], repo_path: str) -> None:
    """Prepend user-supplied domain directions to global long-term memory."""
    memory_dir = Path(repo_path) / "memory" / "global"
    memory_dir.mkdir(parents=True, exist_ok=True)
    mem_file = memory_dir / "long_term.md"

    lines = ["# User-specified optimization directions\n"]
    for d in directions:
        lines.append(f"- {d}\n")
    lines.append("\n")

    existing = mem_file.read_text() if mem_file.exists() else ""
    mem_file.write_text("".join(lines) + existing)


def _inherit_from_parent(
    state: EvolutionState,
    new_target: "Target",
    parent_id: str,
) -> None:
    """Copy memory and seed parent pool from a structural-op parent target."""
    # Seed the new target's best branch from the parent's Pareto front.
    if parent_id in state.targets:
        parent = state.targets[parent_id]
        if parent.pareto_branches:
            # Use parent's Pareto branches as initial active population.
            state.active_branches[new_target.id] = list(parent.pareto_branches)
        if parent.current_best_branch and not new_target.current_best_branch:
            new_target.current_best_branch = parent.current_best_branch
            new_target.current_best_obj = parent.current_best_obj

    # Copy memory files with provenance note.
    src_dir = Path(state.config.repo_path) / "memory" / "targets" / parent_id
    dst_dir = Path(state.config.repo_path) / "memory" / "targets" / new_target.id
    if src_dir.exists():
        dst_dir.mkdir(parents=True, exist_ok=True)
        for src_file in src_dir.iterdir():
            if src_file.is_file():
                dst_file = dst_dir / src_file.name
                note = f"# inherited from target '{parent_id}' after structural op\n\n"
                existing = src_file.read_text()
                dst_file.write_text(note + existing)


@mcp.tool()
def evo_revalidate_targets() -> dict:
    """Check that all registered targets still exist in the repo after a structural op.

    Returns:
        valid:   list of target_ids whose file+function still exist.
        missing: list of target_ids whose file or function was not found.

    The caller (OrchestratorAgent) should freeze missing targets and trigger a
    lightweight MapAgent re-scan to register replacement targets with
    derived_from set to the missing target's id.
    """
    state = _get_state()
    repo = state.config.repo_path

    valid: list[str] = []
    missing: list[str] = []

    for tid, target in state.targets.items():
        if target.status.value == "frozen":
            continue

        file_path = Path(repo) / target.file
        if not file_path.exists():
            missing.append(tid)
            continue

        # Check the function name still appears in the file.
        result = subprocess.run(
            ["grep", "-n", f"def {target.function}", str(file_path)],
            capture_output=True, text=True,
        )
        if result.returncode != 0 or not result.stdout.strip():
            missing.append(tid)
        else:
            valid.append(tid)

    return {"valid": valid, "missing": missing}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
